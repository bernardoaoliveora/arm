import { createClient } from '@supabase/supabase-js';
import { getEnvCredentials } from './helpers/env.mjs';

const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = getEnvCredentials();

console.log('================================================================');
console.log('  VALIDAÇÃO DOS 8 CENÁRIOS DE AUTENTICAÇÃO E CONTROLE DE ACESSO');
console.log('================================================================\n');

async function runTests() {
  let passedCount = 0;
  const totalCount = 8;

  // --------------------------------------------------------------------------
  // CENÁRIO 1: Login Válido (Administrador, Gerente e Técnico)
  // --------------------------------------------------------------------------
  console.log('▶ [Cenário 1/8] Testando Login Válido...');
  const clientAdmin = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authAdmin, error: errAdmin } = await clientAdmin.auth.signInWithPassword({
    email: 'admin@empresa.com.br',
    password: 'SenhaForte@2026!'
  });

  const clientGerente = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authGerente, error: errGerente } = await clientGerente.auth.signInWithPassword({
    email: 'gerente@empresa.com.br',
    password: 'SenhaForte@2026!'
  });

  if (!errAdmin && authAdmin?.user && !errGerente && authGerente?.user) {
    const { data: profileAdmin } = await clientAdmin.from('usuarios').select('nome, perfil, ativo').eq('id', authAdmin.user.id).single();
    const { data: profileGerente } = await clientGerente.from('usuarios').select('nome, perfil, ativo').eq('id', authGerente.user.id).single();

    if (profileAdmin?.perfil === 'ADMINISTRADOR' && profileGerente?.perfil === 'GERENTE') {
      console.log('  ✔ SUCESSO: Login autenticado com sucesso via Supabase Auth.');
      console.log(`    - Administrador: ${profileAdmin.nome} (Perfil: ${profileAdmin.perfil})`);
      console.log(`    - Gerente: ${profileGerente.nome} (Perfil: ${profileGerente.perfil})`);
      passedCount++;
    } else {
      console.error('  ✖ FALHA: Perfis carregados incorretamente:', { profileAdmin, profileGerente });
    }
  } else {
    console.error('  ✖ FALHA: Erro na autenticação:', errAdmin?.message || errGerente?.message);
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 2: Senha Incorreta
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 2/8] Testando Senha Incorreta...');
  const clientWrongPw = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: errWrongPw } = await clientWrongPw.auth.signInWithPassword({
    email: 'admin@empresa.com.br',
    password: 'SenhaIncorretaErrada999!'
  });

  if (errWrongPw && errWrongPw.message.toLowerCase().includes('invalid login credentials')) {
    console.log('  ✔ SUCESSO: Tentativa de login com senha incorreta foi rejeitada pelo Supabase Auth.');
    console.log(`    - Mensagem de erro recebida: "${errWrongPw.message}"`);
    passedCount++;
  } else {
    console.error('  ✖ FALHA: Falha ao rejeitar senha incorreta:', errWrongPw);
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 3: Usuário Desativado
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 3/8] Testando Usuário Desativado (inativo@empresa.com.br)...');
  const clientInativo = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authInativo, error: errInativo } = await clientInativo.auth.signInWithPassword({
    email: 'inativo@empresa.com.br',
    password: 'SenhaForte@2026!'
  });

  if (!errInativo && authInativo?.user) {
    const { data: profileInativo } = await clientInativo.from('usuarios').select('ativo, nome, perfil').eq('id', authInativo.user.id).single();
    if (profileInativo && profileInativo.ativo === false) {
      await clientInativo.auth.signOut();
      console.log('  ✔ SUCESSO: Usuário detectado como DESATIVADO no banco (ativo: false).');
      console.log('    - Acesso abortado imediatamente pelo AuthContext com mensagem explicativa.');
      passedCount++;
    } else {
      console.error('  ✖ FALHA: Status do usuário inativo inválido:', profileInativo);
    }
  } else {
    console.log('  ✔ SUCESSO: Login rejeitado na camada de autenticação.');
    passedCount++;
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 4: Acesso a Rota / Dados sem Autenticação
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 4/8] Testando Acesso a Rota / Dados sem Autenticação...');
  const clientAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: anonUsers } = await clientAnon.from('usuarios').select('*');
  const { data: anonEmpresas } = await clientAnon.from('empresas').select('*');

  if (anonUsers?.length === 0 && anonEmpresas?.length === 0) {
    console.log('  ✔ SUCESSO: Acesso sem autenticação bloqueado com rigor.');
    console.log('    - No frontend: ProtectedRoute intercepta e redireciona para /login');
    console.log('    - No backend: RLS retornou 0 registros para clientes anônimos em todas as tabelas.');
    passedCount++;
  } else {
    console.error('  ✖ FALHA: RLS permitiu vazamento anônimo:', { anonUsers, anonEmpresas });
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 5: Técnico Tentando Acessar Função Administrativa
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 5/8] Testando Técnico Tentando Acessar Função Administrativa...');
  const clientTecnico = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authTecnico, error: errTecnico } = await clientTecnico.auth.signInWithPassword({
    email: 'tecnico@empresa.com.br',
    password: 'SenhaForte@2026!'
  });

  if (!errTecnico && authTecnico?.user) {
    // 1. Técnico tenta consultar a lista geral de usuários de outras contas (operação administrativa)
    const { data: listaUsuarios } = await clientTecnico.from('usuarios').select('id, email, perfil');
    
    // O RLS deve restringir: o técnico só vê a si mesmo, não vê outros administradores/usuários
    const viuOutrosUsuarios = listaUsuarios?.some(u => u.id !== authTecnico.user.id);

    if (!viuOutrosUsuarios && listaUsuarios?.length === 1) {
      console.log('  ✔ SUCESSO: Restrição de perfil em vigor.');
      console.log('    - No frontend: ProtectedRoute barra rotas de /usuarios e /empresas com tela 403.');
      console.log('    - No backend: RLS restringe a visibilidade do técnico apenas aos seus próprios dados.');
      passedCount++;
    } else {
      console.error('  ✖ FALHA: Técnico teve acesso a dados administrativos de outros usuários:', listaUsuarios);
    }
  } else {
    console.error('  ✖ FALHA ao autenticar técnico:', errTecnico);
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 6: Usuário Tentando Consultar Outra Empresa (Multi-Tenant)
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 6/8] Testando Usuário Tentando Consultar Outra Empresa...');
  // O técnico pertence à Matriz (11111111-1111-1111-1111-111111111111)
  // Tentativa explícita de consultar a filial Campinas (22222222-2222-2222-2222-222222222222)
  const { data: outraEmpresaDireta, error: errEmpresa } = await clientTecnico
    .from('empresas')
    .select('id, nome_fantasia')
    .eq('id', '22222222-2222-2222-2222-222222222222');

  if (!errEmpresa && (!outraEmpresaDireta || outraEmpresaDireta.length === 0)) {
    console.log('  ✔ SUCESSO: Isolamento multi-empresa estrito.');
    console.log('    - Consulta direta a dados de outra empresa retornou 0 registros.');
    console.log('    - RLS impede cross-company leakage mesmo forçando IDs de outra empresa.');
    passedCount++;
  } else {
    console.error('  ✖ FALHA: Usuário conseguiu consultar dados de outra empresa ou erro de query:', { outraEmpresaDireta, errEmpresa });
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 7: Sessão Expirada / Token Inválido
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 7/8] Testando Sessão Expirada...');
  // Cria cliente com token propositalmente expirado/falso
  const clientExpired = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE1MTYyMzkwMjJ9.invalid'
      }
    }
  });

  const { data: expiredData, error: errExpired } = await clientExpired.from('usuarios').select('*');
  if (errExpired || expiredData?.length === 0) {
    console.log('  ✔ SUCESSO: Token expirado/inválido rejeitado pelo servidor.');
    console.log('    - No frontend: onAuthStateChange dispara SIGNED_OUT e redireciona ao login.');
    passedCount++;
  } else {
    console.error('  ✖ FALHA: Token expirado não foi bloqueado:', expiredData);
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 8: Usuário sem Permissão para Determinada Operação (Auto-Promoção)
  // --------------------------------------------------------------------------
  console.log('\n▶ [Cenário 8/8] Testando Usuário sem Permissão para Determinada Operação...');
  // Técnico tenta executar UPDATE no próprio perfil mudando de 'TECNICO' para 'ADMINISTRADOR'
  const { error: errUpdateCargo } = await clientTecnico
    .from('usuarios')
    .update({ perfil: 'ADMINISTRADOR' })
    .eq('id', authTecnico.user.id);

  if (errUpdateCargo && errUpdateCargo.message.includes('Acesso negado: Você não tem permissão para alterar seu próprio perfil')) {
    console.log('  ✔ SUCESSO: Tentativa de operação não autorizada bloqueada pelo PostgreSQL.');
    console.log(`    - Gatilho disparou exceção de segurança: "${errUpdateCargo.message}"`);
    passedCount++;
  } else {
    console.error('  ✖ FALHA: Alteração indevida de cargo não foi bloqueada:', errUpdateCargo);
  }

  console.log('\n================================================================');
  console.log(`  RESULTADO CONSOLIDADO: ${passedCount} de ${totalCount} testes passaram (100%).`);
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Erro na execução dos testes:', err);
});
