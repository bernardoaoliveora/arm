import React, { createContext, useContext, useState, useEffect } from 'react';
import type { UserProfile } from '../../types/app.types';
import type { TipoPerfilUsuario } from '../../types/database.types';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

interface UsuarioDbRow {
  id: string;
  nome: string;
  email: string;
  perfil: TipoPerfilUsuario;
  ativo: boolean;
  empresa_id: string;
  empresas?: { nome_fantasia: string } | null;
}

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  clearAuthError: () => void;
  demoSwitchRole: (perfil: TipoPerfilUsuario) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Carrega os dados de perfil da tabela public.usuarios
  const fetchUserProfile = async (userId: string, userEmail: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select(`
          id,
          nome,
          email,
          perfil,
          ativo,
          empresa_id,
          empresas:empresa_id (
            nome_fantasia
          )
        `)
        .eq('id', userId)
        .single();

      if (error || !data) {
        console.error('Erro ao carregar perfil do usuário:', error);
        return null;
      }

      const row = data as unknown as UsuarioDbRow;

      // TRATAMENTO DE USUÁRIO DESATIVADO
      if (!row.ativo) {
        setAuthError('Sua conta de usuário foi desativada pela administração. Acesso bloqueado.');
        await supabase.auth.signOut();
        return null;
      }

      const empresaNome = row.empresas?.nome_fantasia || 'Matriz São Paulo';

      return {
        id: row.id,
        nome: row.nome,
        email: row.email || userEmail,
        perfil: row.perfil,
        empresaAtivaId: row.empresa_id,
        empresaAtivaNome: empresaNome,
      };
    } catch (err) {
      console.error('Falha na consulta do perfil:', err);
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function initializeAuth() {
      setIsLoading(true);
      try {
        if (isSupabaseConfigured) {
          // 1. Persistência e recuperação da sessão existente
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            console.warn('Sessão expirada ou inválida:', sessionError.message);
            setUser(null);
          } else if (session?.user) {
            const profile = await fetchUserProfile(session.user.id, session.user.email || '');
            if (isMounted) setUser(profile);
          }

          // 2. Ouvinte reativo para mudanças de autenticação (Login, Logout, Renovação de Token)
          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
              if (newSession?.user) {
                const profile = await fetchUserProfile(newSession.user.id, newSession.user.email || '');
                if (isMounted) setUser(profile);
              }
            } else if (event === 'SIGNED_OUT') {
              if (isMounted) {
                setUser(null);
                setIsLoading(false);
              }
            }
          });

          return () => {
            subscription.unsubscribe();
          };
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Erro ao inicializar autenticação:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    setAuthError(null);

    try {
      if (!email || !password) {
        const msg = 'Informe o e-mail e a senha de acesso.';
        setAuthError(msg);
        return { success: false, error: msg };
      }

      if (isSupabaseConfigured) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          let errorFriendly = 'E-mail ou senha incorretos.';
          if (error.message.includes('Invalid login credentials')) {
            errorFriendly = 'Credenciais inválidas. Verifique seu e-mail e senha.';
          } else if (error.message.includes('Email not confirmed')) {
            errorFriendly = 'E-mail não confirmado. Verifique sua caixa de entrada.';
          } else {
            errorFriendly = error.message;
          }
          setAuthError(errorFriendly);
          return { success: false, error: errorFriendly };
        }

        if (data.user) {
          const profile = await fetchUserProfile(data.user.id, data.user.email || email);
          if (!profile) {
            const msg = 'Usuário inativo ou perfil não encontrado no sistema. Acesso negado.';
            setAuthError(msg);
            return { success: false, error: msg };
          }
          setUser(profile);
          return { success: true };
        }
      }

      return { success: false, error: 'Serviço de autenticação indisponível.' };
    } catch (err: any) {
      const msg = err.message || 'Erro inesperado ao realizar login.';
      setAuthError(msg);
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('Erro ao efetuar logout:', err);
    } finally {
      setUser(null);
      setAuthError(null);
      setIsLoading(false);
    }
  };

  const requestPasswordReset = async (email: string): Promise<{ success: boolean; error?: string; message?: string }> => {
    try {
      if (!email) {
        return { success: false, error: 'Informe um endereço de e-mail válido.' };
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login?reset=true`,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        message: 'Se o e-mail estiver cadastrado, as instruções de redefinição foram enviadas com sucesso.',
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Erro ao solicitar recuperação de senha.' };
    }
  };

  const clearAuthError = () => {
    setAuthError(null);
  };

  const demoSwitchRole = (perfil: TipoPerfilUsuario) => {
    if (!user) return;
    setUser({
      ...user,
      perfil,
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user),
        authError,
        login,
        logout,
        requestPasswordReset,
        clearAuthError,
        demoSwitchRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
