import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, LogOut, User, Menu } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

export interface HeaderProps {
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
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
        return <Badge variant="success" style={{ alignSelf: 'flex-start', marginTop: '2px', fontSize: '0.65rem' }}>TÉCNICO</Badge>;
    }
  };

  return (
    <header className="header">
      {/* Lado Esquerdo: Hambúrguer Drawer + Identificação da Empresa */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0, flex: '1 1 auto' }}>
        <button
          type="button"
          className="header-menu-btn"
          onClick={onToggleSidebar}
          aria-label="Abrir menu de navegação"
          title="Navegação do Sistema"
        >
          <Menu size={20} />
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '0.3rem 0.6rem',
          backgroundColor: 'var(--color-surface-hover)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-border)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)',
          minWidth: 0,
          maxWidth: '240px',
        }}>
          <Building2 size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            <strong>{user?.empresaAtivaNome || 'Matriz São Paulo'}</strong>
          </span>
        </div>
      </div>

      {/* Lado Direito: Alternador Rápido de Perfil + Informações do Usuário + Sair */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
        {/* Alternador de Perfil para testes de validação visual e permissões */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '0.15rem 0.35rem',
          backgroundColor: 'var(--color-accent-subtle)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-accent-border)',
        }}>
          <span className="header-simular-label" style={{ fontSize: '0.65rem', color: 'var(--color-accent)', fontWeight: 600 }}>
            PERFIL:
          </span>
          <Button
            variant={user?.perfil === 'ADMINISTRADOR' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => demoSwitchRole('ADMINISTRADOR')}
            style={{ padding: '0.2rem 0.35rem', fontSize: '0.68rem', minHeight: '26px' }}
            title="Simular perfil de Administrador"
          >
            Adm
          </Button>
          <Button
            variant={user?.perfil === 'GERENTE' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => demoSwitchRole('GERENTE')}
            style={{ padding: '0.2rem 0.35rem', fontSize: '0.68rem', minHeight: '26px' }}
            title="Simular perfil de Gerente"
          >
            Ger
          </Button>
          <Button
            variant={user?.perfil === 'TECNICO' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => demoSwitchRole('TECNICO')}
            style={{ padding: '0.2rem 0.35rem', fontSize: '0.68rem', minHeight: '26px' }}
            title="Simular perfil de Técnico"
          >
            Téc
          </Button>
        </div>

        {/* Informações do Usuário */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div
            title={`${user?.nome} (${user?.perfil})`}
            style={{
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
              flexShrink: 0,
            }}
          >
            <User size={16} />
          </div>
          <div className="header-user-text" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.nome}
            </span>
            {renderBadge()}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          title="Encerrar Sessão"
          style={{ color: 'var(--color-text-muted)', padding: '0.4rem', minWidth: '34px', minHeight: '34px' }}
          aria-label="Sair"
        >
          <LogOut size={16} />
        </Button>
      </div>
    </header>
  );
};

