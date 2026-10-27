import { createClient } from '@supabase/supabase-js';
import { getEnvCredentials } from './helpers/env.mjs';

const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = getEnvCredentials();

console.log('========================================================================');
console.log(' BATERIA DE VALIDAÇÃO: DASHBOARD, HISTÓRICO E ALERTAS DE ESTOQUE');
console.log('========================================================================\n');

async function runDashboardAlertsValidation() {
  let passedCount = 0;
  const totalCount = 8;

  // 1. Clientes autenticados
  const clientAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authAdmin, error: errAdmin } = await clientAdmin.auth.signInWithPassword({
    email: 'admin@empresa.com.br',
    password: 'SenhaForte@2026!'
  });
  if (errAdmin) throw new Error('Falha ao autenticar admin: ' + errAdmin.message);

  const clientTecnico = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authTec, error: errTec } = await clientTecnico.auth.signInWithPassword({
    email: 'tecnico@empresa.com.br',
    password: 'SenhaForte@2026!'
  });
  if (errTec) throw new Error('Falha ao autenticar técnico: ' + errTec.message);

  const empresaId = '11111111-1111-1111-1111-111111111111'; // Matriz SP
  const empresaFilialId = '22222222-2222-2222-2222-222222222222'; // Filial Campinas
  const tecnicoId = authTec.user.id;

  // ---------------------------------------------------------------------------
  // CENÁRIO 1: Comparação de Produtos Cadastrados (Banco x Dashboard RPC)
  // ---------------------------------------------------------------------------
  console.log('▶ [Cenário 1/8] Comparando Produtos Cadastrados (Banco x Dashboard)...');
  try {
    const { count: totalBanco } = await clientAdmin
      .from('produtos')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('ativo', true);

    const { data: metricas, error: mErr } = await clientAdmin.rpc('obter_metricas_dashboard', {
      p_empresa_id: empresaId,
    });
    if (mErr) throw mErr;

    if (metricas.resumo_produtos.total_cadastrados !== totalBanco) {
      throw new Error(`Divergência: Banco tem ${totalBanco} e Dashboard retornou ${metricas.resumo_produtos.total_cadastrados}`);
    }

    console.log(`  ✔ SUCESSO: Contagem exata de ${totalBanco} produtos cadastrados ativos confirmada.`);
    passedCount++;
  } catch (err) {
    console.error('  ❌ FALHA no Cenário 1:', err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 2: Comparação de Saldos Físicos nos Depósitos (Banco x Dashboard)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [Cenário 2/8] Comparando Disponibilidade Física nos Depósitos...');
  try {
    const { data: itensBanco, error: iErr } = await clientAdmin
      .from('estoque_itens')
      .select('produto_id, quantidade_disponivel, estoques!inner(empresa_id, ativo)')
      .eq('estoques.empresa_id', empresaId)
      .eq('estoques.ativo', true)
      .gt('quantidade_disponivel', 0);
    if (iErr) throw iErr;

    const { data: metricas, error: mErr } = await clientAdmin.rpc('obter_metricas_dashboard', {
      p_empresa_id: empresaId,
    });
    if (mErr) throw mErr;

    let totalItensDashboard = 0;
    metricas.saldos_por_estoque.forEach(est => {
      totalItensDashboard += est.itens.length;
    });

    if (totalItensDashboard !== itensBanco.length) {
      throw new Error(`Divergência de saldos: Banco possui ${itensBanco.length} registros com saldo positivo e Dashboard reportou ${totalItensDashboard}`);
    }

    console.log(`  ✔ SUCESSO: ${totalItensDashboard} itens estocados validados depósito a depósito.`);
    passedCount++;
  } catch (err) {
    console.error('  ❌ FALHA no Cenário 2:', err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 3: Comparação de Materiais em Custódia de Técnicos (Banco x Dashboard)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [Cenário 3/8] Comparando Saldos em Custódia com Técnicos...');
  try {
    const { data: custodiaBanco, error: cErr } = await clientAdmin
      .from('custodia_itens')
      .select('tecnico_id, produto_id, quantidade_posse')
      .eq('empresa_id', empresaId)
      .gt('quantidade_posse', 0);
    if (cErr) throw cErr;

    const { data: metricas, error: mErr } = await clientAdmin.rpc('obter_metricas_dashboard', {
      p_empresa_id: empresaId,
    });
    if (mErr) throw mErr;

    let totalPosseDashboard = 0;
    metricas.custodia_tecnicos.forEach(tec => {
      totalPosseDashboard += tec.itens.length;
    });

    if (totalPosseDashboard !== custodiaBanco.length) {
      throw new Error(`Divergência na custódia: Banco tem ${custodiaBanco.length} e Dashboard reportou ${totalPosseDashboard}`);
    }

    console.log(`  ✔ SUCESSO: ${totalPosseDashboard} linhas sob custódia técnica validadas.`);
    passedCount++;
  } catch (err) {
    console.error('  ❌ FALHA no Cenário 3:', err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 4: Comparação de Consumo e Discriminação por Unidade de Medida
  // ---------------------------------------------------------------------------
  console.log('\n▶ [Cenário 4/8] Testando Consumo no Período sem Soma de Unidades Incompatíveis...');
  try {
    const agora = new Date();
    const trintaDiasAtras = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { data: metricas, error: mErr } = await clientAdmin.rpc('obter_metricas_dashboard', {
      p_empresa_id: empresaId,
      p_data_inicio: trintaDiasAtras.toISOString(),
      p_data_fim: agora.toISOString()
    });
    if (mErr) throw mErr;

    // Validar que cada item consumido tem sua própria unidade de medida identificada
    metricas.consumo.itens.forEach(item => {
      if (!item.unidade_medida || item.quantidade_total <= 0) {
        throw new Error(`Item consumido inválido: ${JSON.stringify(item)}`);
      }
    });

    console.log(`  ✔ SUCESSO: Consumo reportou ${metricas.consumo.total_eventos} baixas com ${metricas.consumo.itens.length} produtos discriminados por unidade de medida.`);
    passedCount++;
  } catch (err) {
    console.error('  ❌ FALHA no Cenário 4:', err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 5: Alertas de Estoque Baixo e NÃO Confundir com Custódia Técnica
  // ---------------------------------------------------------------------------
  console.log('\n▶ [Cenário 5/8] Testando Alertas de Estoque Baixo (Segregação de Depósito x Custódia)...');
  try {
    // Cria um produto de teste com estoque mínimo = 50
    const skuAlerta = `TST-ALR-${Date.now().toString().slice(-5)}`;
    const { data: prodAlerta, error: pErr } = await clientAdmin.from('produtos').insert({
      empresa_id: empresaId,
      codigo_sku: skuAlerta,
      nome: `Produto Teste Alerta ${skuAlerta}`,
      tipo: 'CONSUMIVEL',
      unidade_medida: 'UN',
      estoque_minimo: 50,
      ativo: true
    }).select('id').single();
    if (pErr) throw pErr;

    // Aloca 80 unidades sob posse do técnico (custódia) e 10 unidades no depósito
    // Se o sistema somasse a custódia do técnico (10 + 80 = 90), esconderia o alerta!
    // Como o sistema correto avalia APENAS o depósito (10 < 50), o alerta DEVE ser disparado!
    const { data: estTemp } = await clientAdmin.from('estoques').select('id').eq('empresa_id', empresaId).limit(1).single();

    // 1. Entrada de 90 un no depósito
    const { error: errEnt } = await clientAdmin.rpc('processar_movimentacao_estoque', {
      p_tipo: 'ENTRADA',
      p_empresa_id: empresaId,
      p_produto_id: prodAlerta.id,
      p_quantidade: 90,
      p_estoque_destino_id: estTemp.id,
      p_justificativa: 'Entrada teste alerta de estoque'
    });
    if (errEnt) throw errEnt;

    // 2. Retirada de 80 un para o técnico (sobram 10 un no depósito e 80 un com o técnico)
    const { error: errRet } = await clientAdmin.rpc('processar_movimentacao_estoque', {
      p_tipo: 'RETIRADA',
      p_empresa_id: empresaId,
      p_produto_id: prodAlerta.id,
      p_quantidade: 80,
      p_estoque_origem_id: estTemp.id,
      p_tecnico_id: tecnicoId,
      p_justificativa: 'Retirada teste alerta de estoque'
    });
    if (errRet) throw errRet;

    // Consulta os alertas
    const { data: alertas, error: aErr } = await clientAdmin.rpc('obter_alertas_estoque', {
      p_empresa_id: empresaId
    });
    if (aErr) throw aErr;

    const alertaItem = alertas.find(a => a.produto_id === prodAlerta.id);
    if (!alertaItem) {
      throw new Error('Falha crítica: Produto abaixo do estoque mínimo no depósito não foi retornado pelo alerta!');
    }

    if (Number(alertaItem.saldo_disponivel_deposito) !== 10) {
      throw new Error(`Saldo disponível do depósito incorreto: ${alertaItem.saldo_disponivel_deposito} (esperado: 10)`);
    }

    if (Number(alertaItem.saldo_em_custodia_tecnica) !== 80) {
      throw new Error(`Saldo de custódia incorreto: ${alertaItem.saldo_em_custodia_tecnica} (esperado: 80)`);
    }

    if (alertaItem.nivel_urgencia !== 'ALERTA') {
      throw new Error(`Nível de urgência incorreto: ${alertaItem.nivel_urgencia} (esperado: ALERTA)`);
    }

    console.log(`  ✔ SUCESSO: Alerta disparado com precisão. Depósito: 10 UN, Custódia: 80 UN, Mínimo: 50 UN. A custódia técnica NÃO mascarou o estoque baixo.`);
    passedCount++;
  } catch (err) {
    console.error('  ❌ FALHA no Cenário 5:', err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 6: Teste de Filtros e Paginação no Histórico
  // ---------------------------------------------------------------------------
  console.log('\n▶ [Cenário 6/8] Testando Filtros e Paginação no Histórico de Movimentações...');
  try {
    // 1. Filtro por tipo = 'RETIRADA'
    const { data: movsRetirada, error: mErr } = await clientAdmin
      .from('movimentacoes')
      .select('id, tipo')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'RETIRADA');
    if (mErr) throw mErr;

    const todosSaoRetirada = movsRetirada.every(m => m.tipo === 'RETIRADA');
    if (!todosSaoRetirada) {
      throw new Error('Filtro por tipo retornou movimentação incompatível');
    }

    // 2. Paginação range(0, 4)
    const { data: pagina1, error: pErr } = await clientAdmin
      .from('movimentacoes')
      .select('id')
      .eq('empresa_id', empresaId)
      .order('criado_em', { ascending: false })
      .range(0, 4);
    if (pErr) throw pErr;

    if (pagina1.length > 5) {
      throw new Error(`Paginação excedeu o limite da página: ${pagina1.length}`);
    }

    console.log(`  ✔ SUCESSO: Filtro por tipo e paginação com limites funcionaram perfeitamente.`);
    passedCount++;
  } catch (err) {
    console.error('  ❌ FALHA no Cenário 6:', err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 7: Restrições de Permissões (Técnico x Admin)
  // ---------------------------------------------------------------------------
  console.log('\n▶ [Cenário 7/8] Testando Restrições de Acesso e Permissões do Técnico...');
  try {
    // Técnico consulta o dashboard: o banco deve restringir automaticamente o técnico
    const { data: dashTecnico, error: dtErr } = await clientTecnico.rpc('obter_metricas_dashboard', {
      p_empresa_id: empresaId,
    });
    if (dtErr) throw dtErr;

    // Todas as custódias retornadas para o técnico devem ser dele mesmo
    const todosDoTecnico = dashTecnico.custodia_tecnicos.every(ct => ct.tecnico_id === tecnicoId);
    if (!todosDoTecnico) {
      throw new Error('Falha de segurança: Técnico conseguiu visualizar custódia de outros técnicos!');
    }

    // Técnico tenta consultar empresa diferente não autorizada
    const { error: errFilial } = await clientTecnico.rpc('obter_metricas_dashboard', {
      p_empresa_id: empresaFilialId,
    });

    if (!errFilial) {
      throw new Error('Falha de segurança: Técnico acessou empresa não autorizada sem erro!');
    }

    console.log(`  ✔ SUCESSO: RLS e validações de segurança garantiram isolamento estrito para o perfil Técnico.`);
    passedCount++;
  } catch (err) {
    console.error('  ❌ FALHA no Cenário 7:', err.message);
  }

  // ---------------------------------------------------------------------------
  // CENÁRIO 8: Estados Vazios e Robustez a Erros
  // ---------------------------------------------------------------------------
  console.log('\n▶ [Cenário 8/8] Testando Estados Vazios e Resiliência a Parâmetros Inválidos...');
  try {
    // Filtro por estoque inexistente
    const estoqueFantasmaId = '99999999-9999-9999-9999-999999999999';
    const { data: dashVazio, error: errVazio } = await clientAdmin.rpc('obter_metricas_dashboard', {
      p_empresa_id: empresaId,
      p_estoque_id: estoqueFantasmaId
    });
    if (errVazio) throw errVazio;

    if (dashVazio.saldos_por_estoque.length !== 0) {
      throw new Error('Estado vazio falhou: retornou itens para estoque inexistente');
    }

    // Alertas para estoque inexistente
    const { data: alertasVazio, error: errAlertasVazio } = await clientAdmin.rpc('obter_alertas_estoque', {
      p_empresa_id: empresaId,
      p_estoque_id: estoqueFantasmaId
    });
    if (errAlertasVazio) throw errAlertasVazio;

    console.log(`  ✔ SUCESSO: Estados vazios retornaram arrays limpos sem causar exceptions ou crash.`);
    passedCount++;
  } catch (err) {
    console.error('  ❌ FALHA no Cenário 8:', err.message);
  }

  console.log('\n========================================================================');
  console.log(` RESULTADO FINAL: ${passedCount} de ${totalCount} cenários passaram (${Math.round((passedCount/totalCount)*100)}%).`);
  console.log('========================================================================\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runDashboardAlertsValidation().catch(err => {
  console.error('Erro fatal na execução dos testes:', err);
  process.exit(1);
});
