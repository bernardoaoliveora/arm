import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Home } from 'lucide-react';
import { Button } from '../components/ui';

export const NotFound: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: 'var(--space-6)',
    }}>
      <div style={{
        width: '64px',
        height: '64px',
        borderRadius: 'var(--radius-full)',
        backgroundColor: 'var(--color-warning-bg)',
        color: 'var(--color-warning)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 'var(--space-4)',
      }}>
        <AlertCircle size={36} />
      </div>

      <h1 style={{ fontSize: 'var(--font-size-2xl)', color: 'var(--color-text-main)' }}>
        Página Não Encontrada (404)
      </h1>
      <p style={{ maxWidth: '460px', margin: 'var(--space-2) 0 var(--space-6)', color: 'var(--color-text-secondary)' }}>
        A rota acessada não existe no sistema ou você não possui permissão para visualizar este recurso.
      </p>

      <Button
        variant="primary"
        leftIcon={<Home size={16} />}
        onClick={() => navigate('/dashboard')}
      >
        Voltar para a Página Inicial
      </Button>
    </div>
  );
};
