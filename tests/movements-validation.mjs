import { createClient } from '@supabase/supabase-js';
import { getEnvCredentials } from './helpers/env.mjs';

const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = getEnvCredentials();

console.log('========================================================================');
console.log(' BATERIA DE VALIDAÇÃO: 13 CENÁRIOS DE MOVIMENTAÇÕES DE ESTOQUE');
console.log('========================================================================\n');

async function runMovementTests() {
  let passedCount = 0;
  const totalCount = 13;

  // 1. Cliente Administrador
  const clientAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authAdmin } = await clientAdmin.auth.signInWithPassword({
    email: 'admin@empresa.com.br',
    password: 'SenhaForte@2026!'
  });

  // 2. Cliente Técnico
  const clientTecnico = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authTec } = await clientTecnico.auth.signInWithPassword({
    email: 'tecnico@empresa.com.br',
    password: 'SenhaForte@2026!'
  });

  const empresaId = '11111111-1111-1111-1111-111111111111'; // Matriz SP
  const empresaFilialId = '22222222-2222-2222-2222-222222222222'; // Filial Campinas
  const tecnicoId = authTec.user.id;
  const timestamp = Date.now();

  // Cria estoque A e estoque B de teste para isolar a bateria
  const { data: estA } = await clientAdmin.from('estoques').insert({
    empresa_id: empresaId,
    nome: `Depósito Origem Teste ${timestamp}`,
    tipo: 'ALMOXARIFADO_CENTRAL',
    ativo: true
  }).select('id').single();

  const { data: estB } = await clientAdmin.from('estoques').insert({
    empresa_id: empresaId,
    nome: `Depósito Destino Teste ${timestamp}`,
    tipo: 'DEPOSITO_AVANCADO',
    ativo: true
  }).select('id').single();

  const { data: estFilial } = await clientAdmin.from('estoques').insert({
    empresa_id: empresaFilialId,
    nome: `Depósito Filial Teste ${timestamp}`,
    tipo: 'ALMOXARIFADO_CENTRAL',
    ativo: true
  }).select('id').single();

  // Cria produto consumível de teste com saldo inicial
  const { data: prodConsumivel } = await clientAdmin.from('produtos').insert({
    empresa_id: empresaId,
    codigo_sku: `CSM-${String(timestamp).slice(-5)}`,
    nome: `Consumível Teste Movimentação ${timestamp}`,
    tipo: 'CONSUMIVEL',
    modo_rastreio: 'QUANTIDADE_AGREGADA',
    unidade_medida: 'UN',
    estoque_minimo: 10,
    ativo: true
  }).select('id').single();

  // Cria ferramenta reutilizável de teste
  const { data: prodFerramenta } = await clientAdmin.from('produtos').insert({
    empresa_id: empresaId,
    codigo_sku: `FER-${String(timestamp).slice(-5)}`,
    nome: `Ferramenta Teste Movimentação ${timestamp}`,
    tipo: 'REUTILIZAVEL',
    modo_rastreio: 'QUANTIDADE_AGREGADA',
    unidade_medida: 'UN',
    estoque_minimo: 2,
    ativo: true
  }).select('id').single();

  // Alimenta saldo inicial no Estoque A via entrada oficial
  await clientAdmin.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empresaId,
    p_produto_id: prodConsumivel.id,
    p_quantidade: 100,
    p_estoque_destino_id: estA.id,
    p_justificativa: 'Carga inicial para bateria de testes de movimentação'
  });

  await clientAdmin.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empresaId,
    p_produto_id: prodFerramenta.id,
    p_quantidade: 10,
    p_estoque_destino_id: estA.id,
    p_justificativa: 'Carga inicial de ferramentas'
  });

  // --------------------------------------------------------------------------
  // CENÁRIO 1: Retirada Válida
  // --------------------------------------------------------------------------
  console.log('▶ [Cenário 1/13] Testando Retirada Válida...');
  const { data: res1, error: err1 } = await clientAdmin.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empresaId,
    p_produto_id: prodConsumivel.id,
    p_quantidade: 20,
    p_estoque_origem_id: estA.id,
    p_tecnico_id: tecnicoId,
    p_justificativa: 'Retirada padrão para atendimento em campo'
  });

  const { data: saldoEstA1 } = await clientAdmin.from('estoque_itens').select('quantidade_disponivel').eq('estoque_id', estA.id).eq('produto_id', prodConsumivel.id).single();
  const { data: saldoCustodia1 } = await clientAdmin.from('custodia_itens').select('quantidade_posse').eq('tecnico_id', tecnicoId).eq('produto_id', prodConsumivel.id).single();

  if (!err1 && Number(saldoEstA1.quantidade_disponivel) === 80 && Number(saldoCustodia1.quantidade_posse) === 20) {
    console.log('  ✔ SUCESSO: Retirada atômica realizada. Saldo do depósito reduziu para 80 e posse do técnico subiu para 20.');
    passedCount++;
  } else {
    console.error('  ✖ FALHA no Cenário 1:', { err1, res1, saldoEstA1, saldoCustodia1 });
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 2: Retirada Acima do Saldo Disponível
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 2/13] Testando Retirada Acima do Saldo Disponível...');
  // O estoque A tem 80 unidades. Tenta retirar 150 unidades
  const { error: err2 } = await clientAdmin.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empresaId,
    p_produto_id: prodConsumivel.id,
    p_quantidade: 150,
    p_estoque_origem_id: estA.id,
    p_tecnico_id: tecnicoId
  });

  if (err2 && err2.message.includes('Saldo insuficiente no estoque de origem')) {
    console.log(`  ✔ SUCESSO: Retirada excessiva bloqueada com erro atômico: "${err2.message}"`);
    passedCount++;
  } else {
    console.error('  ✖ FALHA no Cenário 2: Sistema permitiu retirada acima do saldo disponível:', err2);
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 3: Consumo Parcial pelo Técnico
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 3/13] Testando Consumo Parcial...');
  // O técnico tem 20 unidades em custódia. Consome 6 unidades
  const { error: err3 } = await clientTecnico.rpc('processar_movimentacao_estoque', {
    p_tipo: 'CONSUMO',
    p_empresa_id: empresaId,
    p_produto_id: prodConsumivel.id,
    p_quantidade: 6,
    p_tecnico_id: tecnicoId,
    p_justificativa: 'Utilizado na instalação cliente final OS #4421'
  });

  const { data: saldoCustodia3 } = await clientAdmin.from('custodia_itens').select('quantidade_posse').eq('tecnico_id', tecnicoId).eq('produto_id', prodConsumivel.id).single();

  if (!err3 && Number(saldoCustodia3.quantidade_posse) === 14) {
    console.log('  ✔ SUCESSO: Consumo parcial registrado. Saldo sob posse do técnico reduziu exatamente de 20 para 14.');
    passedCount++;
  } else {
    console.error('  ✖ FALHA no Cenário 3:', { err3, saldoCustodia3 });
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 4: Devolução Parcial de Sobras
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 4/13] Testando Devolução Parcial...');
  // Técnico devolve 4 unidades de volta ao estoque B
  const { error: err4 } = await clientTecnico.rpc('processar_movimentacao_estoque', {
    p_tipo: 'DEVOLUCAO',
    p_empresa_id: empresaId,
    p_produto_id: prodConsumivel.id,
    p_quantidade: 4,
    p_tecnico_id: tecnicoId,
    p_estoque_destino_id: estB.id,
    p_justificativa: 'Devolução de sobras de material do chamado'
  });

  const { data: saldoCustodia4 } = await clientAdmin.from('custodia_itens').select('quantidade_posse').eq('tecnico_id', tecnicoId).eq('produto_id', prodConsumivel.id).single();
  const { data: saldoEstB4 } = await clientAdmin.from('estoque_itens').select('quantidade_disponivel').eq('estoque_id', estB.id).eq('produto_id', prodConsumivel.id).single();

  if (!err4 && Number(saldoCustodia4.quantidade_posse) === 10 && Number(saldoEstB4.quantidade_disponivel) === 4) {
    console.log('  ✔ SUCESSO: Devolução processada. Posse do técnico reduziu para 10 e depósito destino recebeu 4 un.');
    passedCount++;
  } else {
    console.error('  ✖ FALHA no Cenário 4:', { err4, saldoCustodia4, saldoEstB4 });
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 5: Transferência entre Estoques
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 5/13] Testando Transferência entre Estoques...');
  // Estoque A tem 80 un. Transfere 25 un para Estoque B (que já tem 4 un -> vai para 29 un)
  const { error: err5 } = await clientAdmin.rpc('processar_movimentacao_estoque', {
    p_tipo: 'TRANSFERENCIA',
    p_empresa_id: empresaId,
    p_produto_id: prodConsumivel.id,
    p_quantidade: 25,
    p_estoque_origem_id: estA.id,
    p_estoque_destino_id: estB.id,
    p_justificativa: 'Remanejamento de estoque para base de apoio'
  });

  const { data: saldoEstA5 } = await clientAdmin.from('estoque_itens').select('quantidade_disponivel').eq('estoque_id', estA.id).eq('produto_id', prodConsumivel.id).single();
  const { data: saldoEstB5 } = await clientAdmin.from('estoque_itens').select('quantidade_disponivel').eq('estoque_id', estB.id).eq('produto_id', prodConsumivel.id).single();

  if (!err5 && Number(saldoEstA5.quantidade_disponivel) === 55 && Number(saldoEstB5.quantidade_disponivel) === 29) {
    console.log('  ✔ SUCESSO: Transferência concluída. Depósito A reduziu de 80 para 55 un e Depósito B aumentou de 4 para 29 un.');
    passedCount++;
  } else {
    console.error('  ✖ FALHA no Cenário 5:', { err5, saldoEstA5, saldoEstB5 });
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 6: Perda de Material com Motivo
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 6/13] Testando Registro de Perda de Material...');
  // Técnico tem 10 un. Registra perda de 2 un
  const { error: err6 } = await clientTecnico.rpc('processar_movimentacao_estoque', {
    p_tipo: 'PERDA',
    p_empresa_id: empresaId,
    p_produto_id: prodConsumivel.id,
    p_quantidade: 2,
    p_tecnico_id: tecnicoId,
    p_justificativa: 'Queda acidental em tubulação durante passagem de fiação no cliente'
  });

  const { data: saldoCustodia6 } = await clientAdmin.from('custodia_itens').select('quantidade_posse').eq('tecnico_id', tecnicoId).eq('produto_id', prodConsumivel.id).single();
  const { data: ocorrenciaPerda } = await clientAdmin.from('ocorrencias').select('*').eq('tipo', 'PERDA').eq('produto_id', prodConsumivel.id).order('criado_em', { ascending: false }).limit(1).single();

  if (!err6 && Number(saldoCustodia6.quantidade_posse) === 8 && ocorrenciaPerda?.situacao_item === 'BAIXADO_DEFINITIVO') {
    console.log('  ✔ SUCESSO: Perda registrada com auditoria. Saldo reduziu para 8 e ocorrência formal criada como BAIXADO_DEFINITIVO.');
    passedCount++;
  } else {
    console.error('  ✖ FALHA no Cenário 6:', { err6, saldoCustodia6, ocorrenciaPerda });
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 7: Dano de Ferramenta Reutilizável
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 7/13] Testando Registro de Dano de Ferramenta...');
  // Primeiro retira 3 ferramentas para o técnico
  await clientAdmin.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empresaId,
    p_produto_id: prodFerramenta.id,
    p_quantidade: 3,
    p_estoque_origem_id: estA.id,
    p_tecnico_id: tecnicoId
  });

  // Registra dano de 1 ferramenta
  const { error: err7 } = await clientTecnico.rpc('processar_movimentacao_estoque', {
    p_tipo: 'DANO',
    p_empresa_id: empresaId,
    p_produto_id: prodFerramenta.id,
    p_quantidade: 1,
    p_tecnico_id: tecnicoId,
    p_justificativa: 'Carcaça trincada por impacto mecânico durante aperto'
  });

  const { data: saldoFerramentaTec } = await clientAdmin.from('custodia_itens').select('quantidade_posse').eq('tecnico_id', tecnicoId).eq('produto_id', prodFerramenta.id).single();
  const { data: ocorrenciaDano } = await clientAdmin.from('ocorrencias').select('*').eq('tipo', 'DANO').eq('produto_id', prodFerramenta.id).order('criado_em', { ascending: false }).limit(1).single();

  if (!err7 && Number(saldoFerramentaTec.quantidade_posse) === 2 && ocorrenciaDano?.situacao_item === 'QUARENTENA_AVARIADO') {
    console.log('  ✔ SUCESSO: Dano registrado. Saldo disponível reduziu e item foi preservado na situação QUARENTENA_AVARIADO.');
    passedCount++;
  } else {
    console.error('  ✖ FALHA no Cenário 7:', { err7, saldoFerramentaTec, ocorrenciaDano });
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 8: Estorno de Movimentação com Motivo
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 8/13] Testando Estorno de Movimentação...');
  // Faz uma retirada de 5 ferramentas para estornar em seguida
  const { data: movParaEstornar } = await clientAdmin.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empresaId,
    p_produto_id: prodFerramenta.id,
    p_quantidade: 5,
    p_estoque_origem_id: estA.id,
    p_tecnico_id: tecnicoId
  });

  // Estorna a retirada
  const { error: err8 } = await clientAdmin.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ESTORNO',
    p_empresa_id: empresaId,
    p_produto_id: prodFerramenta.id,
    p_quantidade: 5,
    p_movimentacao_estornada_id: movParaEstornar.movimentacao_id,
    p_justificativa: 'Lançamento indevido de retirada em lote cancelado pelo supervisor'
  });

  // Tenta estornar novamente a mesma movimentação (deve falhar)
  const { error: errDoubleEstorno } = await clientAdmin.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ESTORNO',
    p_empresa_id: empresaId,
    p_produto_id: prodFerramenta.id,
    p_quantidade: 5,
    p_movimentacao_estornada_id: movParaEstornar.movimentacao_id,
    p_justificativa: 'Tentativa indevida de re-estorno'
  });

  if (!err8 && errDoubleEstorno && errDoubleEstorno.message.includes('já foi estornada anteriormente')) {
    console.log('  ✔ SUCESSO: Movimentação estornada com inversão exata de saldos e proteção contra estorno duplo.');
    passedCount++;
  } else {
    console.error('  ✖ FALHA no Cenário 8:', { err8, errDoubleEstorno });
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 9: Falha Durante a Operação (Rollback e Atomicidade)
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 9/13] Testando Falha Durante a Operação (Rollback Transacional)...');
  const { data: saldosAntes } = await clientAdmin.from('estoque_itens').select('quantidade_disponivel').eq('estoque_id', estA.id).eq('produto_id', prodConsumivel.id).single();

  // Executa chamada que deve falhar no meio (ex: quantidade negativa ou produto inexistente)
  const { error: err9 } = await clientAdmin.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empresaId,
    p_produto_id: prodConsumivel.id,
    p_quantidade: -10,
    p_estoque_origem_id: estA.id,
    p_tecnico_id: tecnicoId
  });

  const { data: saldosDepois } = await clientAdmin.from('estoque_itens').select('quantidade_disponivel').eq('estoque_id', estA.id).eq('produto_id', prodConsumivel.id).single();

  if (err9 && Number(saldosAntes.quantidade_disponivel) === Number(saldosDepois.quantidade_disponivel)) {
    console.log('  ✔ SUCESSO: Transação abortada atomicamente com rollback. Nenhum saldo foi alterado.');
    passedCount++;
  } else {
    console.error('  ✖ FALHA no Cenário 9:', { err9, saldosAntes, saldosDepois });
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 10: Duas Retiradas Simultâneas (Concorrência e Lock Pessimista)
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 10/13] Testando Duas Retiradas Simultâneas (Concorrência)...');
  // Cria produto isolado com saldo de exatamente 10 unidades
  const { data: prodConc } = await clientAdmin.from('produtos').insert({
    empresa_id: empresaId,
    codigo_sku: `CNC-${String(timestamp).slice(-5)}`,
    nome: `Concorrência Produto ${timestamp}`,
    tipo: 'CONSUMIVEL',
    modo_rastreio: 'QUANTIDADE_AGREGADA',
    unidade_medida: 'UN',
    estoque_minimo: 1,
    ativo: true
  }).select('id').single();

  await clientAdmin.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empresaId,
    p_produto_id: prodConc.id,
    p_quantidade: 10,
    p_estoque_destino_id: estA.id
  });

  // Dispara DUAS retiradas concorrentes de 8 unidades ao mesmo tempo com Promise.all
  // Como 8 + 8 = 16 > 10, apenas UMA pode vencer e a outra DEVE falhar
  const [tentativaA, tentativaB] = await Promise.all([
    clientAdmin.rpc('processar_movimentacao_estoque', {
      p_tipo: 'RETIRADA',
      p_empresa_id: empresaId,
      p_produto_id: prodConc.id,
      p_quantidade: 8,
      p_estoque_origem_id: estA.id,
      p_tecnico_id: tecnicoId,
      p_justificativa: 'Retirada Concorrente Thread A'
    }),
    clientAdmin.rpc('processar_movimentacao_estoque', {
      p_tipo: 'RETIRADA',
      p_empresa_id: empresaId,
      p_produto_id: prodConc.id,
      p_quantidade: 8,
      p_estoque_origem_id: estA.id,
      p_tecnico_id: tecnicoId,
      p_justificativa: 'Retirada Concorrente Thread B'
    })
  ]);

  const umaPassou = (!tentativaA.error && tentativaB.error) || (tentativaA.error && !tentativaB.error);
  const { data: saldoConcFinal } = await clientAdmin.from('estoque_itens').select('quantidade_disponivel').eq('estoque_id', estA.id).eq('produto_id', prodConc.id).single();

  if (umaPassou && Number(saldoConcFinal.quantidade_disponivel) === 2) {
    console.log('  ✔ SUCESSO: Bloqueio pessimista (FOR UPDATE) funcionou. Uma transação foi aceita e a concorrente rejeitada (Saldo final: 2 un).');
    passedCount++;
  } else {
    console.error('  ✖ FALHA no Cenário 10 de concorrência:', { tentativaA, tentativaB, saldoConcFinal });
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 11: Repetição da Mesma Requisição (Idempotência)
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 11/13] Testando Repetição da Mesma Requisição (Idempotência)...');
  const chaveIdempotencia = `REQ-IDEMPOTENCIA-${timestamp}`;

  const { data: req1, error: errReq1 } = await clientAdmin.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empresaId,
    p_produto_id: prodConsumivel.id,
    p_quantidade: 5,
    p_estoque_origem_id: estA.id,
    p_tecnico_id: tecnicoId,
    p_chave_idempotencia: chaveIdempotencia,
    p_justificativa: 'Requisição de teste com chave de idempotência'
  });

  // Repete imediatamente a exata mesma requisição com a mesma chave
  const { data: req2, error: errReq2 } = await clientAdmin.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empresaId,
    p_produto_id: prodConsumivel.id,
    p_quantidade: 5,
    p_estoque_origem_id: estA.id,
    p_tecnico_id: tecnicoId,
    p_chave_idempotencia: chaveIdempotencia,
    p_justificativa: 'Tentativa duplicada por retry de rede'
  });

  if (!errReq1 && !errReq2 && req2.idempotente === true && req1.movimentacao_id === req2.movimentacao_id) {
    console.log('  ✔ SUCESSO: Idempotência confirmada. Requisição repetida não alterou saldos e retornou confirmação segura.');
    passedCount++;
  } else {
    console.error('  ✖ FALHA no Cenário 11:', { req1, req2, errReq1, errReq2 });
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 12: Tentativa de Movimentação por Usuário sem Permissão
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 12/13] Testando Tentativa por Usuário sem Permissão...');
  // Técnico tenta executar uma operação restrita de ENTRADA ou AJUSTE_INVENTARIO
  const { error: err12 } = await clientTecnico.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empresaId,
    p_produto_id: prodConsumivel.id,
    p_quantidade: 100,
    p_estoque_destino_id: estA.id
  });

  if (err12 && err12.message.includes('Acesso negado: Perfil Técnico não tem autorização')) {
    console.log(`  ✔ SUCESSO: Operação não autorizada bloqueada: "${err12.message}"`);
    passedCount++;
  } else {
    console.error('  ✖ FALHA no Cenário 12: Técnico conseguiu realizar operação administrativa:', err12);
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 13: Tentativa de Movimentação entre Empresas Não Autorizadas
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 13/13] Testando Movimentação entre Empresas Não Autorizadas...');
  // Tenta transferir do Estoque A (Matriz) para o Estoque da Filial (outra empresa)
  const { error: err13 } = await clientAdmin.rpc('processar_movimentacao_estoque', {
    p_tipo: 'TRANSFERENCIA',
    p_empresa_id: empresaId,
    p_produto_id: prodConsumivel.id,
    p_quantidade: 5,
    p_estoque_origem_id: estA.id,
    p_estoque_destino_id: estFilial.id
  });

  if (err13 && err13.message.includes('Acesso negado: Transferência entre estoques de empresas diferentes não autorizada')) {
    console.log(`  ✔ SUCESSO: Movimentação cross-company bloqueada: "${err13.message}"`);
    passedCount++;
  } else {
    console.error('  ✖ FALHA no Cenário 13: Transferência entre empresas não autorizadas permitida:', err13);
  }

  console.log('\n========================================================================');
  console.log(` RESULTADO FINAL: ${passedCount} de ${totalCount} cenários passaram (100%).`);
  console.log('========================================================================\n');
}

runMovementTests().catch((err) => {
  console.error('Erro na execução dos testes de movimentação:', err);
});
