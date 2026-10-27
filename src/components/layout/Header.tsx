import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, LogOut, User } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export const Header: React.FC = () => {
  const { user, logout, demoSwitchRole } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const renderBadge = () => {
    switch (user?.perfil) {
      case 'ADMINISTRADOR':
        return <Badge variant="info" style={{ alignSelf: 'flex-start', marginTop: '2px', fontSize: '0.65rem' }}>ADMINISTRADOR</Badge>;
      case 'GERENTE':
        return <Badge variant="warning" style={{ alignSelf: 'flex-start', marginTop: '2px', fontSize: '0.65rem' }}>GERENTE</Badge>;
      default:
        return <Badge variant="success" style={{ alignSelf: 'flex-start', marginTop: '2px', fontSize: '0.65rem' }}>TÉCNICO DE CAMPO</Badge>;
    }
  };

  return (
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '0.35rem 0.75rem',
          backgroundColor: 'var(--color-surface-hover)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)',
        }}>
          <Building2 size={16} style={{ color: 'var(--color-accent)' }} />
          <span>Empresa: <strong>{user?.empresaAtivaNome || 'Matriz São Paulo'}</strong></span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        {/* Alternador de Perfil para testes de validação visual e permissões */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '0.2rem 0.5rem',
          backgroundColor: 'var(--color-accent-subtle)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-accent-border)',
        }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-accent)', fontWeight: 600 }}>
            SIMULAR VISÃO:
          </span>
          <Button
            variant={user?.perfil === 'ADMINISTRADOR' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => demoSwitchRole('ADMINISTRADOR')}
            style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
          >
            Admin
          </Button>
          <Button
            variant={user?.perfil === 'GERENTE' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => demoSwitchRole('GERENTE')}
            style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
          >
            Gerente
          </Button>
          <Button
            variant={user?.perfil === 'TECNICO' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => demoSwitchRole('TECNICO')}
            style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem' }}
          >
            Técnico
          </Button>
        </div>

        {/* Informações do Usuário */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-text-inverse)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
          }}>
            <User size={16} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>{user?.nome}</span>
            {renderBadge()}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          title="Encerrar Sessão"
          style={{ color: 'var(--color-text-muted)' }}
          aria-label="Sair"
        >
          <LogOut size={16} />
        </Button>
      </div>
    </header>
  );
};
