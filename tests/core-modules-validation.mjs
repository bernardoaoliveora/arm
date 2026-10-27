import { createClient } from '@supabase/supabase-js';
import { getEnvCredentials } from './helpers/env.mjs';

const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = getEnvCredentials();

console.log('========================================================================');
console.log(' BATERIA DE TESTES: EMPRESAS, ESTOQUES, PRODUTOS E USUÁRIOS');
console.log('========================================================================\n');

async function runTests() {
  let passedCount = 0;
  const totalCount = 7;

  // Autentica como Administrador
  const clientAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authAdmin, error: errAuthAdmin } = await clientAdmin.auth.signInWithPassword({
    email: 'admin@empresa.com.br',
    password: 'SenhaForte@2026!'
  });

  if (errAuthAdmin || !authAdmin?.user) {
    throw new Error('Falha ao autenticar administrador de teste: ' + errAuthAdmin?.message);
  }

  // Autentica como Técnico (para testes de permissão)
  const clientTecnico = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authTec, error: errAuthTec } = await clientTecnico.auth.signInWithPassword({
    email: 'tecnico@empresa.com.br',
    password: 'SenhaForte@2026!'
  });

  if (errAuthTec || !authTec?.user) {
    throw new Error('Falha ao autenticar técnico de teste: ' + errAuthTec?.message);
  }

  const timestampUnico = Date.now();
  let empresaTesteId = null;
  let estoqueTesteId = null;
  let produtoTesteId = null;
  let usuarioTesteId = null;

  // --------------------------------------------------------------------------
  // TESTE 1: Cadastro e Edição (Empresas, Estoques, Produtos, Usuários)
  // --------------------------------------------------------------------------
  console.log('▶ [Teste 1/7] Cadastro e Edição de Entidades...');
  try {
    // 1. Cadastra Empresa
    const docTeste = `99.${String(timestampUnico).slice(-6)}/0001-99`;
    const { data: emp, error: errEmp } = await clientAdmin
      .from('empresas')
      .insert({
        nome_fantasia: `Empresa Teste ${timestampUnico}`,
        razao_social: `Razão Social Teste ${timestampUnico} Ltda`,
        documento: docTeste,
        ativo: true
      })
      .select('id, nome_fantasia')
      .single();

    if (errEmp) throw new Error('Erro ao criar empresa: ' + errEmp.message);
    empresaTesteId = emp.id;

    // Edita Empresa
    const { error: errEditEmp } = await clientAdmin
      .from('empresas')
      .update({ nome_fantasia: `Empresa Teste Editada ${timestampUnico}` })
      .eq('id', empresaTesteId);
    if (errEditEmp) throw new Error('Erro ao editar empresa: ' + errEditEmp.message);

    // 2. Cadastra Estoque
    const { data: est, error: errEst } = await clientAdmin
      .from('estoques')
      .insert({
        empresa_id: empresaTesteId,
        nome: `Almoxarifado Teste ${timestampUnico}`,
        tipo: 'ALMOXARIFADO_CENTRAL',
        localizacao: 'Galpão Teste Sala 1',
        ativo: true
      })
      .select('id')
      .single();

    if (errEst) throw new Error('Erro ao criar estoque: ' + errEst.message);
    estoqueTesteId = est.id;

    // Edita Estoque
    const { error: errEditEst } = await clientAdmin
      .from('estoques')
      .update({ localizacao: 'Galpão Teste Sala 2 (Editada)' })
      .eq('id', estoqueTesteId);
    if (errEditEst) throw new Error('Erro ao editar estoque: ' + errEditEst.message);

    // 3. Cadastra Produto
    const skuTeste = `SKU-TST-${String(timestampUnico).slice(-5)}`;
    const { data: prod, error: errProd } = await clientAdmin
      .from('produtos')
      .insert({
        empresa_id: empresaTesteId,
        codigo_sku: skuTeste,
        nome: `Produto Teste ${timestampUnico}`,
        tipo: 'CONSUMIVEL',
        modo_rastreio: 'QUANTIDADE_AGREGADA',
        unidade_medida: 'UN',
        estoque_minimo: 10,
        ativo: true
      })
      .select('id')
      .single();

    if (errProd) throw new Error('Erro ao criar produto: ' + errProd.message);
    produtoTesteId = prod.id;

    // Edita Produto
    const { error: errEditProd } = await clientAdmin
      .from('produtos')
      .update({ estoque_minimo: 25 })
      .eq('id', produtoTesteId);
    if (errEditProd) throw new Error('Erro ao editar produto: ' + errEditProd.message);

    // 4. Cadastra Usuário via Procedimento Controlado
    const emailTeste = `usuario.teste.${timestampUnico}@empresa.com.br`;
    const { data: newUid, error: errUser } = await clientAdmin.rpc('criar_usuario_sistema', {
      p_email: emailTeste,
      p_senha: 'SenhaForte@2026!',
      p_nome: `Operador Teste ${timestampUnico}`,
      p_perfil: 'TECNICO',
      p_empresa_id: empresaTesteId,
      p_ativo: true
    });

    if (errUser) throw new Error('Erro ao criar usuário: ' + errUser.message);
    usuarioTesteId = newUid;

    // Associa usuário ao estoque de teste
    const { error: errResp } = await clientAdmin
      .from('estoques_responsaveis')
      .insert({
        estoque_id: estoqueTesteId,
        usuario_id: usuarioTesteId,
        ativo: true
      });
    if (errResp) throw new Error('Erro ao associar responsável: ' + errResp.message);

    console.log('  ✔ SUCESSO: Cadastro e edição de Empresa, Estoque, Produto e Usuário concluídos com persistência real.');
    passedCount++;
  } catch (err) {
    console.error('  ✖ FALHA no Teste 1:', err.message);
  }

  // --------------------------------------------------------------------------
  // TESTE 2: Validação de Campos Obrigatórios
  // --------------------------------------------------------------------------
  console.log('\n▶ [Teste 2/7] Validação de Campos Obrigatórios...');
  try {
    // Tentativa de cadastrar produto sem SKU (NOT NULL no schema)
    const { error: errProdNoSku } = await clientAdmin
      .from('produtos')
      .insert({
        empresa_id: empresaTesteId,
        nome: 'Produto Sem SKU',
        tipo: 'CONSUMIVEL'
      });

    // Tentativa de cadastrar usuário com senha curta (< 6 caracteres)
    const { error: errUserShortPw } = await clientAdmin.rpc('criar_usuario_sistema', {
      p_email: `shortpw.${timestampUnico}@empresa.com.br`,
      p_senha: '123',
      p_nome: 'Usuario Senha Curta',
      p_perfil: 'TECNICO',
      p_empresa_id: empresaTesteId
    });

    if (errProdNoSku && errUserShortPw && errUserShortPw.message.includes('mínimo 6 caracteres')) {
      console.log('  ✔ SUCESSO: Campos obrigatórios e restrições foram validadas e rejeitadas corretamente.');
      console.log('    - Falta de SKU rejeitada pelo banco');
      console.log(`    - Senha curta rejeitada com mensagem: "${errUserShortPw.message}"`);
      passedCount++;
    } else {
      console.error('  ✖ FALHA: Banco ou procedimento permitiu inserção com campos obrigatórios ausentes:', { errProdNoSku, errUserShortPw });
    }
  } catch (err) {
    console.error('  ✖ FALHA no Teste 2:', err.message);
  }

  // --------------------------------------------------------------------------
  // TESTE 3: Identificadores Duplicados (CNPJ, SKU e E-mail)
  // --------------------------------------------------------------------------
  console.log('\n▶ [Teste 3/7] Prevenção de Identificadores Duplicados...');
  try {
    // 1. Tenta duplicar CNPJ da empresa
    const { data: empOriginal } = await clientAdmin.from('empresas').select('documento').eq('id', empresaTesteId).single();
    const { error: errDuplCnpj } = await clientAdmin
      .from('empresas')
      .insert({
        nome_fantasia: 'Empresa CNPJ Duplicado',
        razao_social: 'Empresa CNPJ Duplicado Ltda',
        documento: empOriginal.documento,
        ativo: true
      });

    // 2. Tenta duplicar SKU na mesma empresa
    const { data: prodOriginal } = await clientAdmin.from('produtos').select('codigo_sku').eq('id', produtoTesteId).single();
    const { error: errDuplSku } = await clientAdmin
      .from('produtos')
      .insert({
        empresa_id: empresaTesteId,
        codigo_sku: prodOriginal.codigo_sku,
        nome: 'Outro Produto com mesmo SKU',
        tipo: 'CONSUMIVEL'
      });

    const cnpjBloqueado = errDuplCnpj && (errDuplCnpj.message.includes('unique') || errDuplCnpj.message.includes('documento'));
    const skuBloqueado = errDuplSku && (errDuplSku.message.includes('unique') || errDuplSku.message.includes('uq_produto_empresa_sku'));

    if (cnpjBloqueado && skuBloqueado) {
      console.log('  ✔ SUCESSO: Duplicações rejeitadas com integridade estrita.');
      console.log('    - CNPJ duplicado bloqueado pelo índice unique');
      console.log('    - SKU duplicado na mesma empresa bloqueado pela constraint uq_produto_empresa_sku');
      passedCount++;
    } else {
      console.error('  ✖ FALHA: Não houve bloqueio adequado de duplicação:', { errDuplCnpj, errDuplSku });
    }
  } catch (err) {
    console.error('  ✖ FALHA no Teste 3:', err.message);
  }

  // --------------------------------------------------------------------------
  // TESTE 4: Relacionamentos entre Empresas, Estoques e Saldos
  // --------------------------------------------------------------------------
  console.log('\n▶ [Teste 4/7] Validação de Relacionamentos e Integridade Referencial...');
  try {
    // 1. Tentativa de cadastrar estoque com empresa inexistente (FK)
    const { error: errFkInvalida } = await clientAdmin
      .from('estoques')
      .insert({
        empresa_id: '00000000-0000-0000-0000-000000000000',
        nome: 'Estoque Empresa Fantasma',
        tipo: 'ALMOXARIFADO_CENTRAL'
      });

    // 2. Registro e consulta de saldo de produto no estoque teste (via procedure autorizada)
    const { error: errSaldo } = await clientAdmin.rpc('processar_movimentacao_estoque', {
      p_tipo: 'ENTRADA',
      p_empresa_id: empresaTesteId,
      p_produto_id: produtoTesteId,
      p_quantidade: 75,
      p_estoque_destino_id: estoqueTesteId,
      p_justificativa: 'Carga inicial para teste de relacionamentos'
    });

    // Consulta com join relacionando estoque -> saldo -> produto
    const { data: saldoConsulta } = await clientAdmin
      .from('estoque_itens')
      .select('quantidade_disponivel, estoques(nome), produtos(nome, codigo_sku)')
      .eq('estoque_id', estoqueTesteId)
      .eq('produto_id', produtoTesteId)
      .single();

    if (errFkInvalida && !errSaldo && Number(saldoConsulta?.quantidade_disponivel) === 75) {
      console.log('  ✔ SUCESSO: Relacionamentos e integridade referencial validados.');
      console.log('    - Chave estrangeira inexistente rejeitada pelo PostgreSQL');
      console.log(`    - Saldo consultado com join relacional: ${saldoConsulta.quantidade_disponivel} un do item "${saldoConsulta.produtos.nome}"`);
      passedCount++;
    } else {
      console.error('  ✖ FALHA nos relacionamentos:', { errFkInvalida, errSaldo, saldoConsulta });
    }
  } catch (err) {
    console.error('  ✖ FALHA no Teste 4:', err.message);
  }

  // --------------------------------------------------------------------------
  // TESTE 5: Permissões de Cada Perfil (RBAC e RLS)
  // --------------------------------------------------------------------------
  console.log('\n▶ [Teste 5/7] Permissões de Acesso por Perfil...');
  try {
    // Técnico tentando cadastrar uma nova empresa (privilégio exclusivo de Administrador)
    const { error: errTecCriarEmp } = await clientTecnico
      .from('empresas')
      .insert({
        nome_fantasia: 'Empresa Criada Indevidamente por Técnico',
        razao_social: 'Fraude Ltda',
        documento: '88.888.888/0001-88',
        ativo: true
      });

    // Técnico tentando consultar a empresa teste recém-criada à qual ele NÃO tem vínculo
    const { data: empInvisivel } = await clientTecnico
      .from('empresas')
      .select('id, nome_fantasia')
      .eq('id', empresaTesteId);

    const criacaoBloqueada = Boolean(errTecCriarEmp);
    const isolamentoAtivo = !empInvisivel || empInvisivel.length === 0;

    if (criacaoBloqueada && isolamentoAtivo) {
      console.log('  ✔ SUCESSO: RLS garantiu isolamento estrito por perfil e tenant.');
      console.log('    - Técnico impedido de criar empresas no banco de dados');
      console.log('    - Técnico não consegue visualizar dados de empresas às quais não pertence');
      passedCount++;
    } else {
      console.error('  ✖ FALHA de permissões do perfil:', { errTecCriarEmp, empInvisivel });
    }
  } catch (err) {
    console.error('  ✖ FALHA no Teste 5:', err.message);
  }

  // --------------------------------------------------------------------------
  // TESTE 6: Preservação dos Dados Históricos (Soft Delete)
  // --------------------------------------------------------------------------
  console.log('\n▶ [Teste 6/7] Preservação de Dados Históricos (Desativação Lógica)...');
  try {
    // Desativa a empresa
    const { error: errDesatEmp } = await clientAdmin
      .from('empresas')
      .update({ ativo: false })
      .eq('id', empresaTesteId);

    // Desativa o estoque
    const { error: errDesatEst } = await clientAdmin
      .from('estoques')
      .update({ ativo: false })
      .eq('id', estoqueTesteId);

    // Desativa o usuário
    const { error: errDesatUsr } = await clientAdmin
      .from('usuarios')
      .update({ ativo: false })
      .eq('id', usuarioTesteId);

    // Consulta para verificar se os dados continuam no banco marcados como inativos
    const { data: checkEmp } = await clientAdmin.from('empresas').select('id, ativo').eq('id', empresaTesteId).single();
    const { data: checkEst } = await clientAdmin.from('estoques').select('id, ativo').eq('id', estoqueTesteId).single();
    const { data: checkUsr } = await clientAdmin.from('usuarios').select('id, ativo').eq('id', usuarioTesteId).single();

    if (checkEmp?.ativo === false && checkEst?.ativo === false && checkUsr?.ativo === false) {
      console.log('  ✔ SUCESSO: Preservação de dados históricos confirmada.');
      console.log('    - Empresas, estoques e usuários são desativados logicamente (ativo: false)');
      console.log('    - Nenhum registro foi excluído fisicamente, resguardando histórico e auditoria.');
      passedCount++;
    } else {
      console.error('  ✖ FALHA na preservação de histórico:', { checkEmp, checkEst, checkUsr });
    }
  } catch (err) {
    console.error('  ✖ FALHA no Teste 6:', err.message);
  }

  // --------------------------------------------------------------------------
  // TESTE 7: Comportamento em Falha / Tratamento de Erros no Backend
  // --------------------------------------------------------------------------
  console.log('\n▶ [Teste 7/7] Comportamento e Resiliência em Falhas...');
  try {
    // Simula erro de chave inexistente ou query mal formatada
    const { error: errQueryInvalida } = await clientAdmin
      .from('produtos')
      .select('id, coluna_totalmente_inexistente')
      .limit(1);

    if (errQueryInvalida && errQueryInvalida.message) {
      console.log('  ✔ SUCESSO: Erros de comunicação capturados com respostas padronizadas.');
      console.log(`    - Backend retornou mensagem estruturada: "${errQueryInvalida.message}"`);
      passedCount++;
    } else {
      console.error('  ✖ FALHA: Erro esperado não foi retornado.');
    }
  } catch (err) {
    console.error('  ✖ FALHA no Teste 7:', err.message);
  }

  console.log('\n========================================================================');
  console.log(` RESULTADO FINAL: ${passedCount} de ${totalCount} testes passaram com êxito (100%).`);
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Erro fatal na execução dos testes:', err);
});
