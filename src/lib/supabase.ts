import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Validação se as variáveis estão presentes e não são apenas os placeholders padrão
export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('seu-projeto') &&
  !supabaseAnonKey.includes('exemplo_chave_publica')
);

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase Client] As credenciais reais do Supabase ainda não foram configuradas no arquivo .env. ' +
    'O frontend está operando em modo de estrutura com validações locais até que a URL e a Anon Key sejam preenchidas.'
  );
}

// Inicialização segura do cliente com a Anon Key pública (nunca a chave service_role)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
