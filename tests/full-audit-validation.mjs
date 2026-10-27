/**
 * SUÍTE COMPLETA DE AUDITORIA TÉCNICA, FUNCIONAL E DE SEGURANÇA
 * Sistema de Controle de Estoque
 * Executa testes reais contra a API REST e RPC do Supabase com usuários reais
 */

import { createClient } from '@supabase/supabase-js';
import { getEnvCredentials } from './helpers/env.mjs';

const { url: SUPABASE_URL, anonKey: ANON_KEY } = getEnvCredentials();

const ADMIN_EMAIL = 'admin@empresa.com.br';
const TECNICO_EMAIL = 'tecnico@empresa.com.br';
const PASSWORD = 'SenhaForte@2026!';

// Clientes dedicados
const anonClient = createClient(SUPABASE_URL, ANON_KEY);
let adminClient = null;
let tecnicoClient = null;

let adminUser = null;
let tecnicoUser = null;
let empresaId = null;
let estoqueCentralId = null;
let estoqueTriagemId = null;

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${testName} - Detalhes: ${details}`);
    failed++;
  }
}

async function runAudit() {
  console.log('================================================================');
  console.log(' INICIANDO AUDITORIA TÉCNICA E FUNCIONAL DO SISTEMA DE ESTOQUE');
  console.log('================================================================\n');

  // ==========================================================================
  // FASE 1: AUTENTICAÇÃO E PERFIS
  // ==========================================================================
  console.log('--- 1. AUTENTICAÇÃO, CARREGAMENTO DE PERFIL E PERMISSÕES ---');

  // 1.1 Login Admin
  const { data: authAdmin, error: errAdmin } = await anonClient.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: PASSWORD,
  });
  assert(!errAdmin && authAdmin?.session, 'Login do Administrador via Supabase Auth');
  adminUser = authAdmin.user;

  adminClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${authAdmin.session.access_token}` } },
  });

  // 1.2 Login Técnico
  const { data: authTec, error: errTec } = await anonClient.auth.signInWithPassword({
    email: TECNICO_EMAIL,
    password: PASSWORD,
  });
  assert(!errTec && authTec?.session, 'Login do Técnico via Supabase Auth');
  tecnicoUser = authTec.user;

  tecnicoClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${authTec.session.access_token}` } },
  });

  // 1.3 Perfil e escopo dos usuários
  const { data: profAdmin } = await adminClient.from('usuarios').select('*').eq('id', adminUser.id).single();
  assert(profAdmin?.perfil === 'ADMINISTRADOR', 'Perfil do Administrador validado como ADMINISTRADOR');
  empresaId = profAdmin?.empresa_id;

  const { data: profTec } = await tecnicoClient.from('usuarios').select('*').eq('id', tecnicoUser.id).single();
  assert(profTec?.perfil === 'TECNICO', 'Perfil do Técnico validado como TECNICO');

  // Localizar ou criar Estoque Central e Estoque Triagem
  const { data: ests } = await adminClient.from('estoques').select('id, nome, tipo').eq('empresa_id', empresaId);
  if (ests && ests.length > 0) {
    estoqueCentralId = ests.find(e => e.nome.includes('Principal') || e.nome.includes('Central'))?.id || ests[0].id;
    estoqueTriagemId = ests.find(e => e.id !== estoqueCentralId)?.id;
  }

  if (!estoqueTriagemId) {
    const { data: newEst } = await adminClient.from('estoques').insert({
      empresa_id: empresaId,
      nome: 'Depósito Triagem / Devoluções',
      tipo: 'DEPOSITO',
      localizacao: 'Setor D - Auditoria',
      ativo: true,
    }).select().single();
    estoqueTriagemId = newEst?.id;
  }
  assert(estoqueCentralId && estoqueTriagemId, 'Estoques Central e Triagem identificados no banco');

  // ==========================================================================
  // FASE 2: AUDITORIA DE SEGURANÇA E POLÍTICAS RLS NO BACKEND
  // ==========================================================================
  console.log('\n--- 2. AUDITORIA DE SEGURANÇA E ROW LEVEL SECURITY (RLS) ---');

  // 2.1 Técnico tentar alterar seu próprio perfil para ADMINISTRADOR
  const { data: hackPerfil, error: errHackPerfil } = await tecnicoClient
    .from('usuarios')
    .update({ perfil: 'ADMINISTRADOR' })
    .eq('id', tecnicoUser.id);
  assert(
    !!errHackPerfil,
    'Técnico impedido de auto-promover perfil para ADMINISTRADOR (bloqueado por trigger)',
    errHackPerfil?.message
  );

  // 2.2 Técnico tentar alterar saldo diretamente na tabela estoque_itens (REST API)
  const { data: hackSaldo, error: errHackSaldo } = await tecnicoClient
    .from('estoque_itens')
    .update({ quantidade_disponivel: 99999 })
    .eq('estoque_id', estoqueCentralId);
  const { data: checkSaldoNoChange } = await adminClient
    .from('estoque_itens')
    .select('quantidade_disponivel')
    .eq('estoque_id', estoqueCentralId);
  const naoModificou = !checkSaldoNoChange || checkSaldoNoChange.every(i => i.quantidade_disponivel !== 99999);
  assert(
    naoModificou,
    'Técnico impedido de alterar saldos diretamente via REST API (RLS bloqueia UPDATE direto)'
  );

  // 2.3 Técnico tentar alterar saldo de custódia diretamente na tabela custodia_itens
  const { data: hackCustodia } = await tecnicoClient
    .from('custodia_itens')
    .update({ quantidade_posse: 99999 })
    .eq('tecnico_id', tecnicoUser.id);
  const { data: checkCustodia } = await adminClient
    .from('custodia_itens')
    .select('quantidade_posse')
    .eq('tecnico_id', tecnicoUser.id);
  const custodiaNaoAdulterada = !checkCustodia || checkCustodia.every(i => i.quantidade_posse !== 99999);
  assert(
    custodiaNaoAdulterada,
    'Técnico impedido de forjar quantidade em custódia diretamente (RLS bloqueia UPDATE direto)'
  );

  // 2.4 Técnico tentar registrar ENTRADA de material pela API (operação administrativa)
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const { data: tecEntrada, error: errTecEntrada } = await tecnicoClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empresaId,
    p_produto_id: fakeId,
    p_quantidade: 100,
    p_estoque_destino_id: estoqueCentralId,
  });
  assert(
    !!errTecEntrada && errTecEntrada.message.includes('Acesso negado'),
    'Técnico impedido de registrar ENTRADA de materiais (validação antecipada de alçada na procedure)',
    errTecEntrada?.message
  );

  // 2.5 Técnico tentar registrar AJUSTE_INVENTARIO pela API
  const { data: tecAjuste, error: errTecAjuste } = await tecnicoClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'AJUSTE_INVENTARIO',
    p_empresa_id: empresaId,
    p_produto_id: fakeId,
    p_quantidade: 50,
    p_estoque_destino_id: estoqueCentralId,
    p_justificativa: 'Tentativa indevida',
  });
  assert(
    !!errTecAjuste && errTecAjuste.message.includes('Acesso negado'),
    'Técnico impedido de autorizar AJUSTE DE INVENTÁRIO (alçada exclusiva de gestão)',
    errTecAjuste?.message
  );

  // 2.6 Técnico tentar ESTORNAR movimentação
  const { data: tecEstorno, error: errTecEstorno } = await tecnicoClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ESTORNO',
    p_empresa_id: empresaId,
    p_produto_id: fakeId,
    p_quantidade: 1,
    p_movimentacao_estornada_id: fakeId,
    p_justificativa: 'Tentativa indevida de estorno',
  });
  assert(
    !!errTecEstorno && errTecEstorno.message.includes('Acesso negado'),
    'Técnico impedido de autorizar ESTORNO de movimentações (alçada exclusiva de gestão)',
    errTecEstorno?.message
  );

  // 2.7 Técnico tentar retirar materiais em nome de outro técnico (IDOR / forja de identidade)
  const outroTecnicoId = adminUser.id;
  const { data: tecOutro, error: errTecOutro } = await tecnicoClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empresaId,
    p_produto_id: fakeId,
    p_quantidade: 5,
    p_estoque_origem_id: estoqueCentralId,
    p_tecnico_id: outroTecnicoId,
  });
  assert(
    !!errTecOutro && errTecOutro.message.includes('Acesso negado'),
    'Técnico impedido de atribuir movimentação a outro técnico (proteção contra IDOR)',
    errTecOutro?.message
  );

  // ==========================================================================
  // FASE 3: INTEGRIDADE MATEMÁTICA E RASTREABILIDADE DOS SALDOS
  // CENÁRIO EXATO: 100 Parafusos -> Retira 20 -> Consome 12, Devolve 5, Perde 3
  // ==========================================================================
  console.log('\n--- 3. CENÁRIO DE AUDITORIA DE SALDOS (100 PARAFUSOS) ---');

  // 3.1 Cadastrar produto de teste de auditoria
  const skuAudit = `AUDIT-PARAF-${Date.now().toString().slice(-6)}`;
  const { data: prodAudit, error: errProd } = await adminClient.from('produtos').insert({
    empresa_id: empresaId,
    codigo_sku: skuAudit,
    nome: `Parafuso Sextavado Aço 8.8 M8 (${skuAudit})`,
    tipo: 'CONSUMIVEL',
    unidade_medida: 'UN',
    estoque_minimo: 20,
    permite_fracionamento: false,
    ativo: true,
  }).select().single();
  assert(!errProd && prodAudit?.id, `Produto de auditoria criado: ${prodAudit?.nome}`);

  const pId = prodAudit.id;

  // 3.2 ENTRADA inicial de 100 parafusos no Estoque Central
  const { data: movEntrada, error: errEntrada } = await adminClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empresaId,
    p_produto_id: pId,
    p_quantidade: 100,
    p_estoque_destino_id: estoqueCentralId,
    p_justificativa: 'Carga inicial do lote de teste de auditoria (NF 998811)',
  });
  assert(!errEntrada && movEntrada?.sucesso, 'ENTRADA de 100 parafusos no Estoque Central efetivada com sucesso');

  // Checagem imediata: Estoque Central = 100, Técnico = 0
  let { data: sCentral1 } = await adminClient.from('estoque_itens').select('quantidade_disponivel').eq('estoque_id', estoqueCentralId).eq('produto_id', pId).single();
  let { data: sCustodia1 } = await adminClient.from('custodia_itens').select('quantidade_posse').eq('tecnico_id', tecnicoUser.id).eq('produto_id', pId).maybeSingle();
  assert(Number(sCentral1?.quantidade_disponivel) === 100, 'Saldo verificado no banco: 100 parafusos no Estoque Central');
  assert(Number(sCustodia1?.quantidade_posse || 0) === 0, 'Saldo verificado no banco: 0 parafusos com o técnico');

  // 3.3 TÉCNICO RETIRA 20 PARAFUSOS
  const { data: movRetirada, error: errRetirada } = await tecnicoClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empresaId,
    p_produto_id: pId,
    p_quantidade: 20,
    p_estoque_origem_id: estoqueCentralId,
    p_tecnico_id: tecnicoUser.id,
    p_justificativa: 'Retirada de parafusos para ordens de serviço do dia',
  });
  assert(!errRetirada && movRetirada?.sucesso, 'RETIRADA de 20 parafusos pelo técnico processada');

  let { data: sCentral2 } = await adminClient.from('estoque_itens').select('quantidade_disponivel').eq('estoque_id', estoqueCentralId).eq('produto_id', pId).single();
  let { data: sCustodia2 } = await adminClient.from('custodia_itens').select('quantidade_posse').eq('tecnico_id', tecnicoUser.id).eq('produto_id', pId).single();
  assert(Number(sCentral2?.quantidade_disponivel) === 80, 'Pós-retirada: Estoque Central possui exatamente 80 parafusos');
  assert(Number(sCustodia2?.quantidade_posse) === 20, 'Pós-retirada: Técnico possui exatamente 20 parafusos');

  // 3.4 TÉCNICO CONSOME 12 PARAFUSOS
  const { data: movConsumo, error: errConsumo } = await tecnicoClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'CONSUMO',
    p_empresa_id: empresaId,
    p_produto_id: pId,
    p_quantidade: 12,
    p_tecnico_id: tecnicoUser.id,
    p_justificativa: 'Aplicação na Manutenção Preventiva - OS 2026-441',
  });
  assert(!errConsumo && movConsumo?.sucesso, 'CONSUMO de 12 parafusos registrado com sucesso');

  let { data: sCustodia3 } = await adminClient.from('custodia_itens').select('quantidade_posse').eq('tecnico_id', tecnicoUser.id).eq('produto_id', pId).single();
  assert(Number(sCustodia3?.quantidade_posse) === 8, 'Pós-consumo: Técnico possui 8 parafusos restantes (20 - 12 = 8)');

  // 3.5 TÉCNICO DEVOLVE 5 PARAFUSOS
  // Devolve para o depósito de triagem/devoluções
  const { data: movDevolucao, error: errDevolucao } = await tecnicoClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'DEVOLUCAO',
    p_empresa_id: empresaId,
    p_produto_id: pId,
    p_quantidade: 5,
    p_estoque_destino_id: estoqueTriagemId,
    p_tecnico_id: tecnicoUser.id,
    p_justificativa: 'Devolução de sobras não utilizadas na OS',
  });
  assert(!errDevolucao && movDevolucao?.sucesso, 'DEVOLUÇÃO de 5 parafusos para o depósito de triagem/devoluções');

  let { data: sCustodia4 } = await adminClient.from('custodia_itens').select('quantidade_posse').eq('tecnico_id', tecnicoUser.id).eq('produto_id', pId).single();
  let { data: sCentral3 } = await adminClient.from('estoque_itens').select('quantidade_disponivel').eq('estoque_id', estoqueCentralId).eq('produto_id', pId).single();
  let { data: sTriagem1 } = await adminClient.from('estoque_itens').select('quantidade_disponivel').eq('estoque_id', estoqueTriagemId).eq('produto_id', pId).single();
  assert(Number(sCustodia4?.quantidade_posse) === 3, 'Pós-devolução: Técnico possui 3 parafusos restantes (8 - 5 = 3)');
  assert(Number(sCentral3?.quantidade_disponivel) === 80, 'Estoque Central mantém exatamente 80 parafusos');
  assert(Number(sTriagem1?.quantidade_disponivel) === 5, 'Depósito de Devoluções/Triagem recebeu 5 parafusos');

  // 3.6 TÉCNICO REGISTRA PERDA DE 3 PARAFUSOS
  const { data: movPerda, error: errPerda } = await tecnicoClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'PERDA',
    p_empresa_id: empresaId,
    p_produto_id: pId,
    p_quantidade: 3,
    p_tecnico_id: tecnicoUser.id,
    p_justificativa: 'Parafusos caíram na canaleta de brita da ferrovia e foram irrecuperáveis',
  });
  assert(!errPerda && movPerda?.sucesso, 'PERDA de 3 parafusos registrada com justificativa');

  // ==========================================================================
  // 3.7 CONFERÊNCIA FINAL E ESTRITA DOS RESULTADOS DO CENÁRIO DO USUÁRIO
  // ==========================================================================
  console.log('\n--- CONFERÊNCIA FINAL DE INTEGRIDADE CONTÁBIL ---');

  const { data: sCentralFinal } = await adminClient.from('estoque_itens').select('quantidade_disponivel').eq('estoque_id', estoqueCentralId).eq('produto_id', pId).single();
  const { data: sTecnicoFinal } = await adminClient.from('custodia_itens').select('quantidade_posse').eq('tecnico_id', tecnicoUser.id).eq('produto_id', pId).single();

  // Buscar total consumido do histórico
  const { data: histConsumo } = await adminClient
    .from('movimentacao_itens')
    .select('quantidade, movimentacoes!inner(tipo, empresa_id)')
    .eq('produto_id', pId)
    .eq('movimentacoes.tipo', 'CONSUMO');
  const totalConsumido = (histConsumo || []).reduce((acc, row) => acc + Number(row.quantidade), 0);

  // Buscar total de perdas registradas em ocorrências
  const { data: ocorrenciasPerda } = await adminClient
    .from('ocorrencias')
    .select('quantidade')
    .eq('produto_id', pId)
    .eq('tipo', 'PERDA');
  const totalPerdido = (ocorrenciasPerda || []).reduce((acc, row) => acc + Number(row.quantidade), 0);

  console.log(`  Resultado do Estoque Central: ${sCentralFinal?.quantidade_disponivel} (Esperado: 80)`);
  console.log(`  Resultado com o Técnico: ${sTecnicoFinal?.quantidade_posse} (Esperado: 0)`);
  console.log(`  Resultado Total Consumido: ${totalConsumido} (Esperado: 12)`);
  console.log(`  Resultado Total Perdido: ${totalPerdido} (Esperado: 3)`);

  assert(Number(sCentralFinal?.quantidade_disponivel) === 80, 'Cenário Auditado: Exatamente 80 parafusos no estoque central');
  assert(Number(sTecnicoFinal?.quantidade_posse) === 0, 'Cenário Auditado: Exatamente 0 parafusos sob responsabilidade do técnico');
  assert(totalConsumido === 12, 'Cenário Auditado: Exatamente 12 parafusos consumidos registrados');
  assert(totalPerdido === 3, 'Cenário Auditado: Exatamente 3 parafusos perdidos registrados');

  // ==========================================================================
  // FASE 4: CONCORRÊNCIA, IDEMPOTÊNCIA E ESTORNO
  // ==========================================================================
  console.log('\n--- 4. CONCORRÊNCIA, IDEMPOTÊNCIA E ESTORNOS ---');

  // 4.1 Idempotência: submeter a mesma chave de movimentação duas vezes
  const chaveIdemp = `IDEMP-${Date.now()}`;
  const { data: idemp1 } = await adminClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empresaId,
    p_produto_id: pId,
    p_quantidade: 10,
    p_estoque_destino_id: estoqueCentralId,
    p_chave_idempotencia: chaveIdemp,
  });
  const { data: idemp2 } = await adminClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empresaId,
    p_produto_id: pId,
    p_quantidade: 10,
    p_estoque_destino_id: estoqueCentralId,
    p_chave_idempotencia: chaveIdemp,
  });
  assert(idemp1?.sucesso && idemp2?.sucesso && idemp2?.idempotente === true, 'Idempotência comprovada: requisição duplicada não aumentou saldo em duplicidade');

  // 4.2 Concorrência: tentar retirar mais do que existe no saldo disponível simultaneamente
  // Atualmente o estoque central tem 80 + 10 = 90 parafusos
  // Disparamos 2 retiradas simultâneas de 60 unidades cada (total 120 > 90)
  const req1 = adminClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empresaId,
    p_produto_id: pId,
    p_quantidade: 60,
    p_estoque_origem_id: estoqueCentralId,
    p_tecnico_id: tecnicoUser.id,
    p_justificativa: 'Concorrência Teste A',
  });
  const req2 = adminClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empresaId,
    p_produto_id: pId,
    p_quantidade: 60,
    p_estoque_origem_id: estoqueCentralId,
    p_tecnico_id: tecnicoUser.id,
    p_justificativa: 'Concorrência Teste B',
  });

  const [res1, res2] = await Promise.all([req1, req2]);
  const umaPassouEUmaFalhou = (res1.data?.sucesso && res2.error) || (res2.data?.sucesso && res1.error);
  assert(
    umaPassouEUmaFalhou,
    'Concorrência atômica com FOR UPDATE comprovada: uma transação foi atendida e a concorrente foi rejeitada por saldo insuficiente'
  );

  // 4.3 Estorno de movimentação: Estornar a retirada de 60 unidades que passou
  const movParaEstornarId = res1.data?.movimentacao_id || res2.data?.movimentacao_id;
  const { data: estornoRes, error: errEstorno } = await adminClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ESTORNO',
    p_empresa_id: empresaId,
    p_produto_id: pId,
    p_quantidade: 60,
    p_movimentacao_estornada_id: movParaEstornarId,
    p_justificativa: 'Estorno da retirada de teste de concorrência com restituição de saldos',
  });
  assert(!errEstorno && estornoRes?.sucesso, 'Estorno autorizado de movimentação processado');

  const { data: sCentralAposEstorno } = await adminClient.from('estoque_itens').select('quantidade_disponivel').eq('estoque_id', estoqueCentralId).eq('produto_id', pId).single();
  assert(Number(sCentralAposEstorno?.quantidade_disponivel) === 90, 'Saldo perfeitamente restaurado no Estoque Central após estorno (90 parafusos)');

  // ==========================================================================
  // FASE 5: DASHBOARD E ALERTAS DE ESTOQUE BAIXO
  // ==========================================================================
  console.log('\n--- 5. DASHBOARD E ALERTAS DE ESTOQUE BAIXO ---');

  const { data: metricas, error: errMetricas } = await adminClient.rpc('obter_metricas_dashboard', {
    p_empresa_id: empresaId,
  });
  assert(!errMetricas && metricas?.resumo_produtos?.total_cadastrados >= 1, 'Métricas do dashboard retornadas sem erros (resumo_produtos validado)');
  assert(Array.isArray(metricas?.consumo?.itens), 'Consumo segmentado por produto e unidade de medida no dashboard');
  assert(Array.isArray(metricas?.saldos_por_estoque), 'Saldos organizados por estoque no dashboard');
  assert(Array.isArray(metricas?.custodia_tecnicos), 'Saldos de custódia organizados por técnico');

  const { data: alertas, error: errAlertas } = await adminClient.rpc('obter_alertas_estoque', {
    p_empresa_id: empresaId,
  });
  assert(!errAlertas && Array.isArray(alertas), 'Função de alertas de estoque baixo executada com sucesso');

  console.log('\n================================================================');
  console.log(` RESULTADO FINAL DA AUDITORIA: ${passed} PASS / ${failed} FAIL`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('Erro fatal durante a auditoria:', err);
  process.exit(1);
});
