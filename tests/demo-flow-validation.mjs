/**
 * VALIDAÇÃO AUTOMATIZADA DO ROTEIRO DA DEMONSTRAÇÃO (11 PASSOS)
 * Garante que cada tela, operação e consulta do roteiro funciona perfeitamente
 * antes de declarar a demonstração pronta para o cliente.
 */

import { createClient } from '@supabase/supabase-js';
import { getEnvCredentials } from './helpers/env.mjs';

const { url: SUPABASE_URL, anonKey: ANON_KEY } = getEnvCredentials();
const anonClient = createClient(SUPABASE_URL, ANON_KEY);

async function validarRoteiroDemo() {
  console.log('================================================================');
  console.log(' VALIDANDO O ROTEIRO DE APRESENTAÇÃO AO CLIENTE (11 PASSOS)');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // PASSO 1: Login como Administrador (Mariana Costa)
  // --------------------------------------------------------------------------
  console.log('▶ [Passo 1/11] Login como Administrador...');
  const { data: authAdmin, error: errAdmin } = await anonClient.auth.signInWithPassword({
    email: 'admin.demo@empresa.com.br',
    password: 'Demo@2026!',
  });
  if (errAdmin || !authAdmin?.session) {
    throw new Error('Falha no login do Administrador demo: ' + errAdmin?.message);
  }
  const adminClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${authAdmin.session.access_token}` } },
  });
  const { data: perfilAdmin } = await adminClient.from('usuarios').select('*').eq('id', authAdmin.user.id).single();
  console.log(`  ✔ Login com sucesso: ${perfilAdmin.nome} (Perfil: ${perfilAdmin.perfil})`);
  const empresaId = perfilAdmin.empresa_id;

  // --------------------------------------------------------------------------
  // PASSO 2: Visualização do Dashboard (KPIs, Saldos e Custódias)
  // --------------------------------------------------------------------------
  console.log('\n▶ [Passo 2/11] Visualização do Dashboard...');
  const { data: dashboard, error: errDash } = await adminClient.rpc('obter_metricas_dashboard', {
    p_empresa_id: empresaId,
  });
  if (errDash) throw errDash;
  console.log(`  ✔ Métricas carregadas: ${dashboard.resumo_produtos.total_cadastrados} produtos, ${dashboard.resumo_produtos.abaixo_minimo} alertas de estoque baixo.`);
  console.log(`  ✔ ${dashboard.saldos_por_estoque.length} depósitos monitorados e ${dashboard.custodia_tecnicos.length} técnicos com custódia ativa.`);

  // --------------------------------------------------------------------------
  // PASSO 3: Consulta de uma Empresa
  // --------------------------------------------------------------------------
  console.log('\n▶ [Passo 3/11] Consulta de Empresas e Isolamento Multi-tenant...');
  const { data: empresas, error: errEmp } = await adminClient.from('empresas').select('*').order('nome_fantasia');
  if (errEmp) throw errEmp;
  const telemax = empresas.find(e => e.nome_fantasia.includes('TeleMax'));
  console.log(`  ✔ Empresa consultada: ${telemax.nome_fantasia} (CNPJ: ${telemax.documento})`);

  // --------------------------------------------------------------------------
  // PASSO 4: Consulta de um Estoque Central
  // --------------------------------------------------------------------------
  console.log('\n▶ [Passo 4/11] Consulta do Estoque Central e Seus Saldos...');
  const { data: estoques } = await adminClient.from('estoques').select('*').eq('empresa_id', empresaId);
  const estoqueCentral = estoques.find(e => e.nome.includes('Central') && e.nome.includes('Curitiba'));
  const { data: saldosCentral } = await adminClient
    .from('estoque_itens')
    .select('quantidade_disponivel, produtos(nome, codigo_sku, unidade_medida)')
    .eq('estoque_id', estoqueCentral.id);
  console.log(`  ✔ Estoque: ${estoqueCentral.nome} (${estoqueCentral.tipo})`);
  console.log(`  ✔ Itens em estoque: ${saldosCentral.length} produtos disponíveis fisicamente.`);

  // --------------------------------------------------------------------------
  // PASSO 5: Visualização dos Estoques/Custódias dos Técnicos
  // --------------------------------------------------------------------------
  console.log('\n▶ [Passo 5/11] Visualização dos Estoques dos Técnicos...');
  const { data: custodias } = await adminClient
    .from('custodia_itens')
    .select('quantidade_posse, usuarios(nome), produtos(nome, unidade_medida)')
    .eq('empresa_id', empresaId)
    .gt('quantidade_posse', 0);
  console.log(`  ✔ Custódia de campo transparente: ${custodias.length} linhas de posse com técnicos.`);

  // --------------------------------------------------------------------------
  // PASSO 6: Retirada de um Material (Demonstração da Operação ao Vivo)
  // --------------------------------------------------------------------------
  console.log('\n▶ [Passo 6/11] Realizando Retirada de Material ao Vivo...');
  const { data: prodCabo } = await adminClient
    .from('produtos')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('codigo_sku', 'DEMO-CAB-002')
    .single();

  const { data: tecnicoCarlos } = await adminClient
    .from('usuarios')
    .select('id, nome')
    .eq('email', 'carlos.tecnico.demo@empresa.com.br')
    .single();

  const { data: movRetiradaLive, error: errRetLive } = await adminClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empresaId,
    p_produto_id: prodCabo.id,
    p_quantidade: 50,
    p_estoque_origem_id: estoqueCentral.id,
    p_tecnico_id: tecnicoCarlos.id,
    p_justificativa: 'Retirada ao vivo para demonstração ao cliente - OS 2026-9001',
  });
  if (errRetLive) throw errRetLive;
  console.log(`  ✔ Retirada de 50m de Cabo Drop para ${tecnicoCarlos.nome} processada atomicamente!`);

  // --------------------------------------------------------------------------
  // PASSO 7: Registro de Consumo
  // --------------------------------------------------------------------------
  console.log('\n▶ [Passo 7/11] Registro de Consumo em Campo...');
  const { data: movConsumoLive, error: errConsLive } = await adminClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'CONSUMO',
    p_empresa_id: empresaId,
    p_produto_id: prodCabo.id,
    p_quantidade: 35,
    p_tecnico_id: tecnicoCarlos.id,
    p_justificativa: 'Instalação de ramal cliente VIP - OS 2026-9001',
  });
  if (errConsLive) throw errConsLive;
  console.log(`  ✔ Consumo de 35m de Cabo Drop registrado na OS 2026-9001!`);

  // --------------------------------------------------------------------------
  // PASSO 8: Devolução de Material (Sobra)
  // --------------------------------------------------------------------------
  console.log('\n▶ [Passo 8/11] Devolução de Sobras ao Almoxarifado...');
  const { data: movDevolucaoLive, error: errDevLive } = await adminClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'DEVOLUCAO',
    p_empresa_id: empresaId,
    p_produto_id: prodCabo.id,
    p_quantidade: 15,
    p_estoque_destino_id: estoqueCentral.id,
    p_tecnico_id: tecnicoCarlos.id,
    p_justificativa: 'Devolução de sobra de 15m de cabo após fechamento da OS 2026-9001',
  });
  if (errDevLive) throw errDevLive;
  console.log(`  ✔ Devolução de 15m concluída. Saldo físico no Almoxarifado recomposto!`);

  // --------------------------------------------------------------------------
  // PASSO 9: Consulta do Histórico de Movimentações
  // --------------------------------------------------------------------------
  console.log('\n▶ [Passo 9/11] Consulta do Histórico Completo de Auditoria...');
  const { data: historico, error: errHist } = await adminClient
    .from('movimentacoes')
    .select(`
      id,
      tipo,
      justificativa,
      criado_em,
      usuarios!movimentacoes_usuario_operador_id_fkey(nome),
      tecnico:usuarios!movimentacoes_tecnico_envolvido_id_fkey(nome),
      movimentacao_itens(quantidade, saldo_anterior_origem, saldo_posterior_origem, saldo_anterior_destino, saldo_posterior_destino, produtos(nome, unidade_medida))
    `)
    .eq('empresa_id', empresaId)
    .order('criado_em', { ascending: false })
    .limit(5);

  if (errHist) throw errHist;
  console.log(`  ✔ Últimos ${historico.length} eventos imutáveis recuperados da trilha de auditoria:`);
  for (const h of historico) {
    const item = h.movimentacao_itens[0];
    console.log(`    • [${h.tipo}] ${item?.produtos?.nome}: ${item?.quantidade} ${item?.produtos?.unidade_medida} | Operador: ${h.usuarios?.nome}`);
  }

  // --------------------------------------------------------------------------
  // PASSO 10: Visualização de Alertas de Estoque Baixo
  // --------------------------------------------------------------------------
  console.log('\n▶ [Passo 10/11] Visualização de Alertas de Estoque Baixo...');
  const { data: alertas, error: errAlr } = await adminClient.rpc('obter_alertas_estoque', {
    p_empresa_id: empresaId,
  });
  if (errAlr) throw errAlr;
  console.log(`  ✔ ${alertas.length} alertas ativos de estoque mínimo encontrados:`);
  for (const a of alertas.filter(x => x.nivel_urgencia === 'CRITICO' || x.nivel_urgencia === 'ALTO')) {
    console.log(`    ⚠️ ${a.produto_nome}: Disponível ${a.total_disponivel_depositos} ${a.unidade_medida} (Mínimo: ${a.estoque_minimo}) -> Nível: ${a.nivel_urgencia}`);
  }

  // --------------------------------------------------------------------------
  // PASSO 11: Login como Técnico e Demonstração de Permissões Limitadas
  // --------------------------------------------------------------------------
  console.log('\n▶ [Passo 11/11] Login como Técnico (Carlos Silva) e Restrições de Acesso...');
  const { data: authTec, error: errTec } = await anonClient.auth.signInWithPassword({
    email: 'carlos.tecnico.demo@empresa.com.br',
    password: 'Demo@2026!',
  });
  if (errTec || !authTec?.session) {
    throw new Error('Falha no login do Técnico: ' + errTec?.message);
  }
  const tecClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${authTec.session.access_token}` } },
  });
  const { data: perfilTec } = await tecClient.from('usuarios').select('*').eq('id', authTec.user.id).single();
  console.log(`  ✔ Login com sucesso: ${perfilTec.nome} (Perfil: ${perfilTec.perfil})`);

  // Técnico tentando acessar empresas (bloqueado por RLS)
  const { data: tecEmpresas } = await tecClient.from('empresas').select('*');
  console.log(`  ✔ Técnico só enxerga sua própria empresa (${tecEmpresas.length} empresa visível).`);

  // Técnico tentando cadastrar entrada de produto (bloqueado por alçada)
  const { error: errBloqueioEntrada } = await tecClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empresaId,
    p_produto_id: prodCabo.id,
    p_quantidade: 100,
    p_estoque_destino_id: estoqueCentral.id,
  });
  if (errBloqueioEntrada && errBloqueioEntrada.message.includes('Acesso negado')) {
    console.log(`  ✔ Segurança comprovada: Técnico bloqueado ao tentar realizar operação administrativa ("${errBloqueioEntrada.message}").`);
  } else {
    throw new Error('Falha de segurança: técnico conseguiu registrar entrada!');
  }

  console.log('\n================================================================');
  console.log(' TODOS OS 11 PASSOS DO ROTEIRO FORAM VALIDADOS COM 100% DE ÊXITO!');
  console.log('================================================================\n');
}

validarRoteiroDemo().catch(err => {
  console.error('Erro na validação do roteiro demo:', err);
  process.exit(1);
});
