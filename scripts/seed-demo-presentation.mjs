/**
 * SCRIPT DE POVOAMENTO DE DADOS DEMONSTRATIVOS (SEED DEMO)
 * Popula duas empresas fictícias, estoques, produtos consumíveis e ferramentas,
 * técnicos fictícios com senhas conhecidas e histórico consistente de movimentações.
 */

import { createClient } from '@supabase/supabase-js';
import { getEnvCredentials } from '../tests/helpers/env.mjs';

const { url: SUPABASE_URL, anonKey: ANON_KEY } = getEnvCredentials();
const anonClient = createClient(SUPABASE_URL, ANON_KEY);

async function seedDemo() {
  console.log('================================================================');
  console.log(' CRIANDO CONJUNTO DE DADOS DEMONSTRATIVOS PARA APRESENTAÇÃO');
  console.log('================================================================\n');

  // 1. Login com admin mestre do sistema para ter privilégios administrativos
  const { data: authMaster, error: errAuth } = await anonClient.auth.signInWithPassword({
    email: 'admin@empresa.com.br',
    password: 'SenhaForte@2026!',
  });
  if (errAuth) {
    throw new Error('Falha no login mestre: ' + errAuth.message);
  }

  const masterClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${authMaster.session.access_token}` } },
  });

  console.log('✔ Autenticado como Administrador Mestre.');

  // ==========================================================================
  // 1. EMPRESAS DEMONSTRATIVAS
  // ==========================================================================
  console.log('\n--- 1. Criando Empresas Demonstrativas ---');

  // Empresa 1: TeleMax (Empresa foco da apresentação - atualiza empresa 11111111-1111-1111-1111-111111111111)
  let { data: empTelemax } = await masterClient
    .from('empresas')
    .select('*')
    .eq('id', '11111111-1111-1111-1111-111111111111')
    .maybeSingle();

  if (empTelemax) {
    const { data: updated } = await masterClient.from('empresas').update({
      nome_fantasia: 'TeleMax Engenharia & Redes [DEMO]',
      razao_social: 'TeleMax Soluções em Fibra Óptica e Telecomunicações Ltda [DEMO]',
      ativo: true,
    }).eq('id', empTelemax.id).select().single();
    empTelemax = updated;
  } else {
    const { data: newEmp1, error: errEmp1 } = await masterClient.from('empresas').insert({
      nome_fantasia: 'TeleMax Engenharia & Redes [DEMO]',
      razao_social: 'TeleMax Soluções em Fibra Óptica e Telecomunicações Ltda [DEMO]',
      documento: '44.555.666/0001-99',
      ativo: true,
    }).select().single();
    if (errEmp1) throw errEmp1;
    empTelemax = newEmp1;
  }
  console.log(`✔ Empresa 1 (Foco da Demo): ${empTelemax.nome_fantasia} (ID: ${empTelemax.id})`);

  // Empresa 2: Nordeste Solar (Para demonstrar isolamento multi-tenant - atualiza empresa 22222222-2222-2222-2222-222222222222)
  let { data: empSolar } = await masterClient
    .from('empresas')
    .select('*')
    .eq('id', '22222222-2222-2222-2222-222222222222')
    .maybeSingle();

  if (empSolar) {
    const { data: updated2 } = await masterClient.from('empresas').update({
      nome_fantasia: 'Nordeste Solar & Instalações [DEMO]',
      razao_social: 'Nordeste Energia Solar e Elétrica Ltda [DEMO]',
      ativo: true,
    }).eq('id', empSolar.id).select().single();
    empSolar = updated2;
  } else {
    const { data: newEmp2, error: errEmp2 } = await masterClient.from('empresas').insert({
      nome_fantasia: 'Nordeste Solar & Instalações [DEMO]',
      razao_social: 'Nordeste Energia Solar e Elétrica Ltda [DEMO]',
      documento: '77.888.999/0001-88',
      ativo: true,
    }).select().single();
    if (errEmp2) throw errEmp2;
    empSolar = newEmp2;
  }
  console.log(`✔ Empresa 2 (Multi-tenant): ${empSolar.nome_fantasia} (ID: ${empSolar.id})`);

  // ==========================================================================
  // 2. USUÁRIOS DEMONSTRATIVOS
  // ==========================================================================
  console.log('\n--- 2. Criando Usuários Demonstrativos ---');

  // Função auxiliar para garantir usuário demo
  async function criarOuObterUsuario(email, senha, nome, perfil, empresaId) {
    const { data: userExist } = await masterClient
      .from('usuarios')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (userExist) {
      // Garante que está ativo e na empresa correta
      await masterClient.from('usuarios').update({ ativo: true, empresa_id: empresaId, nome }).eq('id', userExist.id);
      return userExist.id;
    }

    const { data: uid, error: errCreate } = await masterClient.rpc('criar_usuario_sistema', {
      p_email: email,
      p_senha: senha,
      p_nome: nome,
      p_perfil: perfil,
      p_empresa_id: empresaId,
      p_ativo: true,
    });
    if (errCreate) {
      console.warn(`Aviso ao criar usuário ${email}:`, errCreate.message);
      // Busca pelo email
      const { data: userFallback } = await masterClient.from('usuarios').select('id').eq('email', email).maybeSingle();
      return userFallback?.id;
    }
    return uid;
  }

  // 2.1 Admin da Demo: Mariana Costa
  const adminDemoId = await criarOuObterUsuario(
    'admin.demo@empresa.com.br',
    'Demo@2026!',
    'Mariana Costa (Administradora Geral)',
    'ADMINISTRADOR',
    empTelemax.id
  );
  console.log(`✔ Admin Demo: Mariana Costa (admin.demo@empresa.com.br / Demo@2026!)`);

  // 2.2 Técnico 1: Carlos Silva
  const tecnico1Id = await criarOuObterUsuario(
    'carlos.tecnico.demo@empresa.com.br',
    'Demo@2026!',
    'Carlos Silva (Técnico Fibra Óptica)',
    'TECNICO',
    empTelemax.id
  );
  console.log(`✔ Técnico 1: Carlos Silva (carlos.tecnico.demo@empresa.com.br / Demo@2026!)`);

  // 2.3 Técnico 2: Roberto Mendes
  const tecnico2Id = await criarOuObterUsuario(
    'roberto.tecnico.demo@empresa.com.br',
    'Demo@2026!',
    'Roberto Mendes (Técnico Infraestrutura)',
    'TECNICO',
    empTelemax.id
  );
  console.log(`✔ Técnico 2: Roberto Mendes (roberto.tecnico.demo@empresa.com.br / Demo@2026!)`);

  // ==========================================================================
  // 3. ESTOQUES DEMONSTRATIVOS
  // ==========================================================================
  console.log('\n--- 3. Criando Estoques Fictícios ---');

  async function criarOuObterEstoque(empresaId, nome, tipo, localizacao) {
    const { data: estExist } = await masterClient
      .from('estoques')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('nome', nome)
      .maybeSingle();

    if (estExist) return estExist;

    const { data: newEst, error: errEst } = await masterClient.from('estoques').insert({
      empresa_id: empresaId,
      nome,
      tipo,
      localizacao,
      ativo: true,
    }).select().single();
    if (errEst) throw errEst;
    return newEst;
  }

  // Estoques TeleMax
  const estAlmoxCentral = await criarOuObterEstoque(
    empTelemax.id,
    'Almoxarifado Central (Sede Curitiba) [DEMO]',
    'ALMOXARIFADO_CENTRAL',
    'Galpão 01 - Av. das Indústrias, 1000'
  );
  const estDepLitoral = await criarOuObterEstoque(
    empTelemax.id,
    'Depósito Operacional Litoral (Paranaguá) [DEMO]',
    'DEPOSITO_AVANCADO',
    'Base Litoral - Rua do Porto, 450'
  );
  const estVanCarlos = await criarOuObterEstoque(
    empTelemax.id,
    'Unidade Móvel Van 04 - Carlos Silva [DEMO]',
    'VEICULO',
    'Veículo Renault Master Placa ABC-4D21'
  );

  // Estoque Nordeste Solar (Empresa 2)
  const estSolarCentral = await criarOuObterEstoque(
    empSolar.id,
    'Centro de Distribuição Salvador [DEMO]',
    'ALMOXARIFADO_CENTRAL',
    'Polo Industrial Camaçari'
  );

  console.log(`✔ Estoque Central: ${estAlmoxCentral.nome}`);
  console.log(`✔ Depósito Avançado: ${estDepLitoral.nome}`);
  console.log(`✔ Unidade Móvel Técnico: ${estVanCarlos.nome}`);
  console.log(`✔ Depósito Empresa 2: ${estSolarCentral.nome}`);

  // ==========================================================================
  // 4. PRODUTOS DEMONSTRATIVOS
  // ==========================================================================
  console.log('\n--- 4. Cadastrando Catálogo de Produtos e Ferramentas ---');

  async function criarOuObterProduto(dados) {
    const { data: prodExist } = await masterClient
      .from('produtos')
      .select('*')
      .eq('empresa_id', dados.empresa_id)
      .eq('codigo_sku', dados.codigo_sku)
      .maybeSingle();

    if (prodExist) {
      await masterClient.from('produtos').update(dados).eq('id', prodExist.id);
      return prodExist;
    }

    const { data: newProd, error: errProd } = await masterClient.from('produtos').insert(dados).select().single();
    if (errProd) throw errProd;
    return newProd;
  }

  // 4.1 Consumíveis TeleMax
  const prodConector = await criarOuObterProduto({
    empresa_id: empTelemax.id,
    codigo_sku: 'DEMO-OPT-001',
    nome: 'Conector Óptico SC/APC Fast Click [DEMO]',
    tipo: 'CONSUMIVEL',
    modo_rastreio: 'QUANTIDADE_AGREGADA',
    unidade_medida: 'UN',
    estoque_minimo: 100,
    permite_fracionamento: false,
    ativo: true,
  });

  const prodCaboDrop = await criarOuObterProduto({
    empresa_id: empTelemax.id,
    codigo_sku: 'DEMO-CAB-002',
    nome: 'Cabo de Fibra Óptica Drop Flat 1FO [DEMO]',
    tipo: 'CONSUMIVEL',
    modo_rastreio: 'QUANTIDADE_AGREGADA',
    unidade_medida: 'METRO',
    estoque_minimo: 500,
    permite_fracionamento: false,
    ativo: true,
  });

  const prodFitaAuto = await criarOuObterProduto({
    empresa_id: empTelemax.id,
    codigo_sku: 'DEMO-MAT-003',
    nome: 'Fita Isolante Autofusão 19mm x 10m 3M [DEMO]',
    tipo: 'CONSUMIVEL',
    modo_rastreio: 'QUANTIDADE_AGREGADA',
    unidade_medida: 'UN',
    estoque_minimo: 30, // Deixaremos com 8 UN no estoque para acionar alerta crítico!
    permite_fracionamento: false,
    ativo: true,
  });

  const prodAbracadeira = await criarOuObterProduto({
    empresa_id: empTelemax.id,
    codigo_sku: 'DEMO-MAT-004',
    nome: 'Abraçadeira de Nylon T18R Pacote c/ 100 [DEMO]',
    tipo: 'CONSUMIVEL',
    modo_rastreio: 'QUANTIDADE_AGREGADA',
    unidade_medida: 'UN',
    estoque_minimo: 25, // Deixaremos com 17 UN para alerta amarelo!
    permite_fracionamento: false,
    ativo: true,
  });

  // 4.2 Ferramentas Reutilizáveis TeleMax
  const prodMaquinaFusao = await criarOuObterProduto({
    empresa_id: empTelemax.id,
    codigo_sku: 'DEMO-FER-005',
    nome: 'Máquina de Fusão de Fibra Fujikura 70S [DEMO]',
    tipo: 'REUTILIZAVEL',
    modo_rastreio: 'FERRAMENTA_INDIVIDUAL',
    unidade_medida: 'UN',
    estoque_minimo: 1,
    permite_fracionamento: false,
    ativo: true,
  });

  const prodPowerMeter = await criarOuObterProduto({
    empresa_id: empTelemax.id,
    codigo_sku: 'DEMO-FER-006',
    nome: 'Power Meter Óptico Digital PON [DEMO]',
    tipo: 'REUTILIZAVEL',
    modo_rastreio: 'FERRAMENTA_INDIVIDUAL',
    unidade_medida: 'UN',
    estoque_minimo: 2,
    permite_fracionamento: false,
    ativo: true,
  });

  // 4.3 Produto Empresa 2 (Nordeste Solar)
  const prodInversor = await criarOuObterProduto({
    empresa_id: empSolar.id,
    codigo_sku: 'SOLAR-INV-001',
    nome: 'Inversor Solar Grid-Tie 5kW Trifásico [DEMO]',
    tipo: 'REUTILIZAVEL',
    modo_rastreio: 'FERRAMENTA_INDIVIDUAL',
    unidade_medida: 'UN',
    estoque_minimo: 3,
    permite_fracionamento: false,
    ativo: true,
  });

  console.log(`✔ 4 Consumíveis e 2 Ferramentas criados para a TeleMax`);
  console.log(`✔ 1 Produto solar criado para Nordeste Solar`);

  // ==========================================================================
  // 5. MOVIMENTAÇÕES E HISTÓRICO MATEMATICAMENTE CONSISTENTE
  // ==========================================================================
  console.log('\n--- 5. Executando Movimentações Matemáticas Controladas ---');

  // Limpa saldos anteriores do produto da demo caso já existam para garantir consistência
  await masterClient.from('estoque_itens').delete().in('produto_id', [
    prodConector.id, prodCaboDrop.id, prodFitaAuto.id, prodAbracadeira.id, prodMaquinaFusao.id, prodPowerMeter.id
  ]);
  await masterClient.from('custodia_itens').delete().in('produto_id', [
    prodConector.id, prodCaboDrop.id, prodFitaAuto.id, prodAbracadeira.id, prodMaquinaFusao.id, prodPowerMeter.id
  ]);

  // A) Carga Inicial (Entradas por Nota Fiscal)
  console.log('  -> Registrando Entradas Iniciais no Almoxarifado Central...');

  // Conector Óptico: 500 UN
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodConector.id,
    p_quantidade: 500,
    p_estoque_destino_id: estAlmoxCentral.id,
    p_justificativa: 'Entrada de Mercadoria: NF 10450 - Fornecedor Fibras do Brasil',
  });

  // Cabo Drop: 2000 METROS
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodCaboDrop.id,
    p_quantidade: 2000,
    p_estoque_destino_id: estAlmoxCentral.id,
    p_justificativa: 'Entrada de Mercadoria: NF 10451 - Prysmian Telecom',
  });

  // Fita Autofusão: 40 UN
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodFitaAuto.id,
    p_quantidade: 40,
    p_estoque_destino_id: estAlmoxCentral.id,
    p_justificativa: 'Entrada de Mercadoria: NF 10452 - Distribuidora 3M Brasil',
  });

  // Abraçadeira: 35 UN
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodAbracadeira.id,
    p_quantidade: 35,
    p_estoque_destino_id: estAlmoxCentral.id,
    p_justificativa: 'Entrada de Mercadoria: NF 10452 - Distribuidora Fixações',
  });

  // Máquinas de Fusão: 3 UN
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodMaquinaFusao.id,
    p_quantidade: 3,
    p_estoque_destino_id: estAlmoxCentral.id,
    p_justificativa: 'Aquisição de Ativo: NF 8920 - Fujikura do Brasil',
  });

  // Power Meter: 4 UN
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodPowerMeter.id,
    p_quantidade: 4,
    p_estoque_destino_id: estAlmoxCentral.id,
    p_justificativa: 'Aquisição de Instrumentos de Teste: NF 8925',
  });

  // Produto Empresa 2 (Solar): 10 UN
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'ENTRADA',
    p_empresa_id: empSolar.id,
    p_produto_id: prodInversor.id,
    p_quantidade: 10,
    p_estoque_destino_id: estSolarCentral.id,
    p_justificativa: 'Entrada de Equipamentos Solares: NF 4421',
  });

  console.log('  ✔ Entradas iniciais registradas com integridade.');

  // B) Retiradas para os Técnicos
  console.log('  -> Registrando Retiradas para Carlos Silva e Roberto Mendes...');

  // Carlos Silva retira: 60 conectores, 300m cabo, 1 máquina de fusão
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodConector.id,
    p_quantidade: 60,
    p_estoque_origem_id: estAlmoxCentral.id,
    p_tecnico_id: tecnico1Id,
    p_justificativa: 'Retirada para atendimento de rotas de instalação de fibra - Semana 44',
  });

  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodCaboDrop.id,
    p_quantidade: 300,
    p_estoque_origem_id: estAlmoxCentral.id,
    p_tecnico_id: tecnico1Id,
    p_justificativa: 'Retirada bobina drop para atendimento da rota Norte',
  });

  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodMaquinaFusao.id,
    p_quantidade: 1,
    p_estoque_origem_id: estAlmoxCentral.id,
    p_tecnico_id: tecnico1Id,
    p_justificativa: 'Custódia técnica da máquina de fusão para a equipe do Carlos',
  });

  // Roberto Mendes retira: 32 fitas autofusão (provoca estoque baixo!), 18 abraçadeiras, 2 power meters
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodFitaAuto.id,
    p_quantidade: 32,
    p_estoque_origem_id: estAlmoxCentral.id,
    p_tecnico_id: tecnico2Id,
    p_justificativa: 'Retirada para manutenção na rede de cabeamento estruturado',
  });

  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodAbracadeira.id,
    p_quantidade: 18,
    p_estoque_origem_id: estAlmoxCentral.id,
    p_tecnico_id: tecnico2Id,
    p_justificativa: 'Fixações de cabos em dutos principais',
  });

  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'RETIRADA',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodPowerMeter.id,
    p_quantidade: 2,
    p_estoque_origem_id: estAlmoxCentral.id,
    p_tecnico_id: tecnico2Id,
    p_justificativa: 'Aferição de atenuação nas portas PON dos armários ópticos',
  });

  console.log('  ✔ Retiradas concluídas.');

  // C) Consumos em Ordens de Serviço
  console.log('  -> Registrando Consumos em Ordens de Serviço...');

  // Carlos consome 40 conectores e 220m cabo
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'CONSUMO',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodConector.id,
    p_quantidade: 40,
    p_tecnico_id: tecnico1Id,
    p_justificativa: 'Aplicação na Instalação FTTH - OS 2026-7840 (Condomínio Solar das Palmeiras)',
  });

  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'CONSUMO',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodCaboDrop.id,
    p_quantidade: 220,
    p_tecnico_id: tecnico1Id,
    p_justificativa: 'Lançamento de ramal óptico - OS 2026-7840',
  });

  // Roberto consome 24 fitas e 10 abraçadeiras
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'CONSUMO',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodFitaAuto.id,
    p_quantidade: 24,
    p_tecnico_id: tecnico2Id,
    p_justificativa: 'Manutenção preventiva da galeria subterrânea - OS 2026-7842',
  });

  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'CONSUMO',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodAbracadeira.id,
    p_quantidade: 10,
    p_tecnico_id: tecnico2Id,
    p_justificativa: 'Amarração em esteiras de cabos - OS 2026-7842',
  });

  console.log('  ✔ Consumos em OS registrados.');

  // D) Devolução de Sobras
  console.log('  -> Registrando Devoluções de Sobras...');

  // Carlos devolve 10 conectores para o Depósito Avançado Litoral
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'DEVOLUCAO',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodConector.id,
    p_quantidade: 10,
    p_estoque_destino_id: estDepLitoral.id,
    p_tecnico_id: tecnico1Id,
    p_justificativa: 'Devolução de sobras não utilizadas na OS 2026-7840 para base local',
  });

  // Carlos devolve 50 metros de cabo drop para o Almoxarifado Central
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'DEVOLUCAO',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodCaboDrop.id,
    p_quantidade: 50,
    p_estoque_destino_id: estAlmoxCentral.id,
    p_tecnico_id: tecnico1Id,
    p_justificativa: 'Sobra de bobina devolvida ao almoxarifado central',
  });

  // Roberto devolve 1 Power Meter em bom estado
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'DEVOLUCAO',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodPowerMeter.id,
    p_quantidade: 1,
    p_estoque_destino_id: estAlmoxCentral.id,
    p_tecnico_id: tecnico2Id,
    p_justificativa: 'Devolução de instrumento após conclusão dos testes de atenuação',
  });

  console.log('  ✔ Devoluções de sobras e instrumentos concluídas.');

  // E) Ocorrências: Perda de Conectores e Dano em Power Meter
  console.log('  -> Registrando Ocorrências Formais (Perda e Dano)...');

  // Carlos perde 2 conectores que caíram e quebraram a trava
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'PERDA',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodConector.id,
    p_quantidade: 2,
    p_tecnico_id: tecnico1Id,
    p_justificativa: 'Conectores caíram de altura durante conectorização na escada e tiveram travas danificadas',
  });

  // Roberto registra Dano no 2º Power Meter (Visor LCD trincado em campo -> Quarentena)
  await masterClient.rpc('processar_movimentacao_estoque', {
    p_tipo: 'DANO',
    p_empresa_id: empTelemax.id,
    p_produto_id: prodPowerMeter.id,
    p_quantidade: 1,
    p_tecnico_id: tecnico2Id,
    p_justificativa: 'Display LCD quebrado após impacto acidental contra poste de concreto. Necessita envio para assistência técnica autorizada.',
  });

  console.log('  ✔ Perda e Dano registrados em ocorrências formais com auditoria.');

  // ==========================================================================
  // 6. CONFERÊNCIA DOS SALDOS GERADOS
  // ==========================================================================
  console.log('\n================================================================');
  console.log(' RESUMO MATEMÁTICO DOS DADOS DA DEMONSTRAÇÃO');
  console.log('================================================================');

  const { data: saldosTelemax } = await masterClient
    .from('estoque_itens')
    .select('quantidade_disponivel, estoques(nome), produtos(nome, codigo_sku, estoque_minimo, unidade_medida)')
    .order('estoque_id');

  console.log('\n--- Saldos nos Depósitos Físicos ---');
  for (const s of saldosTelemax) {
    const min = s.produtos?.estoque_minimo || 0;
    const qtd = Number(s.quantidade_disponivel);
    const status = qtd <= min ? '⚠️ [ESTOQUE BAIXO]' : '✔ [OK]';
    console.log(`• ${s.estoques?.nome} | ${s.produtos?.nome}: ${qtd} ${s.produtos?.unidade_medida} (Mínimo: ${min}) ${status}`);
  }

  const { data: custodiaTecnicos } = await masterClient
    .from('custodia_itens')
    .select('quantidade_posse, usuarios(nome), produtos(nome, unidade_medida)');

  console.log('\n--- Saldos sob Custódia dos Técnicos ---');
  for (const c of custodiaTecnicos) {
    console.log(`• Técnico: ${c.usuarios?.nome} | ${c.produtos?.nome}: ${c.quantidade_posse} ${c.produtos?.unidade_medida}`);
  }

  console.log('\n✔ Povoamento da Apresentação Concluído com Sucesso Total!');
}

seedDemo().catch(err => {
  console.error('Erro ao popular dados demonstrativos:', err);
  process.exit(1);
});
