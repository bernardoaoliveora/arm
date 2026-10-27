import React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import type { TipoPerfilUsuario } from '../types/database.types';
import { Alert, Button, Card } from '../components/ui';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: TipoPerfilUsuario[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        backgroundColor: 'var(--color-bg-app)',
      }}>
        <div className="spinner" style={{ width: '2.5rem', height: '2.5rem', color: 'var(--color-accent)' }} />
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
          Verificando permissões e credenciais de acesso...
        </span>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Verificação de Autorização por Perfil (RBAC)
  if (allowedRoles && !allowedRoles.includes(user.perfil)) {
    return (
      <div style={{
        padding: 'var(--space-8) var(--space-4)',
        maxWidth: '680px',
        margin: '0 auto',
      }}>
        <Card>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 'var(--space-4)',
            padding: 'var(--space-4)',
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-danger-bg)',
              color: 'var(--color-danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <ShieldAlert size={32} />
            </div>

            <div>
              <h2 style={{ fontSize: 'var(--font-size-xl)', color: 'var(--color-text-main)' }}>
                Acesso Restrito por Perfil (403)
              </h2>
              <p style={{ marginTop: 'var(--space-2)', color: 'var(--color-text-secondary)' }}>
                Seu perfil de acesso atual é <strong>{user.perfil}</strong>. Esta funcionalidade é exclusiva para:{' '}
                <strong>{allowedRoles.join(' ou ')}</strong>.
              </p>
            </div>

            <Alert variant="danger" style={{ textAlign: 'left', width: '100%' }}>
              Esta restrição é imposta na interface de rotas e protegida nativamente pelas políticas de{' '}
              <strong>Row Level Security (RLS)</strong> no banco de dados. Tentativas de acesso direto à API são rejeitadas pelo PostgreSQL.
            </Alert>

            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <Button
                variant="secondary"
                leftIcon={<ArrowLeft size={16} />}
                onClick={() => navigate(-1)}
              >
                Voltar
              </Button>
              <Button
                variant="primary"
                leftIcon={<Home size={16} />}
                onClick={() => navigate('/dashboard')}
              >
                Ir para Minha Área
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};
