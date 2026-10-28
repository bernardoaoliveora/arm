import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Boxes, Lock, Mail, KeyRound } from 'lucide-react';
import { Button, Input, Card, Alert, Modal } from '../../components/ui';
import { useAuth } from './AuthContext';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('admin@empresa.com.br');
  const [password, setPassword] = useState('SenhaForte@2026!');
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetFeedback, setResetFeedback] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);

  const { login, authError, clearAuthError, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const fromLocation = (location.state as any)?.from?.pathname || '/dashboard';

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearAuthError();
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        navigate(fromLocation, { replace: true });
      } else {
        setLocalError(result.error || 'Credenciais inválidas.');
      }
    } catch (err: any) {
      setLocalError('Falha ao autenticar no servidor. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetFeedback(null);

    const res = await requestPasswordReset(resetEmail);
    if (res.success) {
      setResetFeedback({ type: 'success', text: res.message || 'Instruções enviadas para seu e-mail!' });
    } else {
      setResetFeedback({ type: 'danger', text: res.error || 'Não foi possível solicitar a recuperação.' });
    }
  };

  const fillCredentials = (userEmail: string, userPass: string) => {
    setEmail(userEmail);
    setPassword(userPass);
    setLocalError('');
    clearAuthError();
  };

  const displayError = localError || authError;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--color-bg-app)',
      padding: 'var(--space-4)',
    }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <div style={{
            width: '48px',
            height: '48px',
            backgroundColor: 'var(--color-primary)',
            color: 'var(--color-accent)',
            borderRadius: 'var(--radius-lg)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-3)',
            boxShadow: 'var(--shadow-md)',
          }}>
            <Boxes size={28} />
          </div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)', color: 'var(--color-text-main)' }}>
            Controle de Estoque & Custódia
          </h1>
          <p style={{ marginTop: 'var(--space-1)', fontSize: 'var(--font-size-sm)' }}>
            Autenticação segura e controle de acesso de técnicos e gestores
          </p>
        </div>

        <Card title="Acessar Sistema">
          {displayError && (
            <Alert variant="danger" title="Atenção">
              {displayError}
            </Alert>
          )}

          <form onSubmit={handleLoginSubmit}>
            <Input
              label="E-mail Corporativo"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@empresa.com.br"
              required
              leftIcon={<Mail size={16} />}
            />

            <Input
              label="Senha de Acesso"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              leftIcon={<Lock size={16} />}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
              <button
                type="button"
                onClick={() => {
                  setResetEmail(email);
                  setResetFeedback(null);
                  setIsResetModalOpen(true);
                }}
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-accent)',
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                Esqueci minha senha
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              style={{ width: '100%' }}
              isLoading={isLoading}
            >
              Entrar na Plataforma
            </Button>
          </form>

          {/* Atalhos Rápidos para Testes dos Cenários Exigidos */}
          <div style={{
            marginTop: 'var(--space-5)',
            paddingTop: 'var(--space-4)',
            borderTop: '1px solid var(--color-border)',
            fontSize: 'var(--font-size-xs)',
          }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-muted)', display: 'block', marginBottom: 'var(--space-2)' }}>
              CENÁRIOS DE TESTE PREPARADOS:
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <button
                type="button"
                onClick={() => fillCredentials('admin@empresa.com.br', 'SenhaForte@2026!')}
                className="btn btn-secondary btn-sm"
                style={{ justifyContent: 'space-between', flexWrap: 'wrap', whiteSpace: 'normal', textAlign: 'left', padding: '0.45rem 0.6rem', gap: '4px' }}
              >
                <span>🔑 Administrador (Acesso Total)</span>
                <span className="text-mono" style={{ fontSize: '0.72rem', opacity: 0.85 }}>admin@empresa.com.br</span>
              </button>

              <button
                type="button"
                onClick={() => fillCredentials('tecnico@empresa.com.br', 'SenhaForte@2026!')}
                className="btn btn-secondary btn-sm"
                style={{ justifyContent: 'space-between', flexWrap: 'wrap', whiteSpace: 'normal', textAlign: 'left', padding: '0.45rem 0.6rem', gap: '4px' }}
              >
                <span>🔧 Técnico Ativo (Campo)</span>
                <span className="text-mono" style={{ fontSize: '0.72rem', opacity: 0.85 }}>tecnico@empresa.com.br</span>
              </button>

              <button
                type="button"
                onClick={() => fillCredentials('gerente@empresa.com.br', 'SenhaForte@2026!')}
                className="btn btn-secondary btn-sm"
                style={{ justifyContent: 'space-between', flexWrap: 'wrap', whiteSpace: 'normal', textAlign: 'left', padding: '0.45rem 0.6rem', gap: '4px' }}
              >
                <span>📋 Gerente (Gestão Parcial)</span>
                <span className="text-mono" style={{ fontSize: '0.72rem', opacity: 0.85 }}>gerente@empresa.com.br</span>
              </button>

              <button
                type="button"
                onClick={() => fillCredentials('inativo@empresa.com.br', 'SenhaForte@2026!')}
                className="btn btn-secondary btn-sm"
                style={{ justifyContent: 'space-between', flexWrap: 'wrap', whiteSpace: 'normal', textAlign: 'left', padding: '0.45rem 0.6rem', gap: '4px', borderColor: 'var(--color-danger)' }}
              >
                <span style={{ color: 'var(--color-danger)' }}>⛔ Usuário Desativado</span>
                <span className="text-mono" style={{ fontSize: '0.72rem', opacity: 0.85 }}>inativo@empresa.com.br</span>
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Modal de Recuperação de Acesso */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Recuperação de Acesso"
        description="Informe seu e-mail cadastrado para receber o link de redefinição de senha."
        footerActions={
          <>
            <Button variant="secondary" onClick={() => setIsResetModalOpen(false)}>Fechar</Button>
            <Button variant="primary" onClick={handlePasswordResetSubmit}>Enviar Link</Button>
          </>
        }
      >
        {resetFeedback && (
          <Alert variant={resetFeedback.type} title={resetFeedback.type === 'success' ? 'Sucesso' : 'Erro'}>
            {resetFeedback.text}
          </Alert>
        )}

        <form onSubmit={handlePasswordResetSubmit}>
          <Input
            label="E-mail Cadastrado"
            type="email"
            required
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            placeholder="seu.email@empresa.com.br"
            leftIcon={<KeyRound size={16} />}
          />
        </form>
      </Modal>
    </div>
  );
};
