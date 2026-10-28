import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, Flame, CornerDownLeft, ArrowLeftRight, History, PackagePlus } from 'lucide-react';
import { Card, Button } from '../../components/ui';
import { useAuth } from '../auth/AuthContext';

export const MovimentacoesPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isGestor = user?.perfil === 'ADMINISTRADOR' || user?.perfil === 'GERENTE';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div>
        <h1>Central de Movimentações de Estoque</h1>
        <p style={{ marginTop: '2px' }}>
          Escolha a operação de movimentação física ou transferência de custódia.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
        gap: 'var(--space-4)',
      }}>
        {/* Card 0: Entrada de Materiais (Gestão) */}
        {isGestor && (
          <Card>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <PackagePlus size={22} />
              </div>
              <div>
                <h3>Entrada de Materiais</h3>
                <p style={{ fontSize: 'var(--font-size-xs)', marginTop: '2px' }}>
                  Recebimento de novos lotes de fornecedores ou compra direta para abastecer o depósito.
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              style={{ width: '100%', marginTop: 'var(--space-3)' }}
              onClick={() => navigate('/movimentacoes/entrada')}
            >
              Registrar Entrada
            </Button>
          </Card>
        )}
        {/* Card 1: Retirada */}
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-accent-subtle)',
              color: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <PlusCircle size={22} />
            </div>
            <div>
              <h3>Registrar Retirada</h3>
              <p style={{ fontSize: 'var(--font-size-xs)', marginTop: '2px' }}>
                Saída de materiais do depósito para custódia do técnico para atendimento em campo.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            style={{ width: '100%', marginTop: 'var(--space-3)' }}
            onClick={() => navigate('/movimentacoes/retirada')}
          >
            Iniciar Retirada
          </Button>
        </Card>

        {/* Card 2: Consumo / Ocorrência */}
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-danger-bg)',
              color: 'var(--color-danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Flame size={22} />
            </div>
            <div>
              <h3>Apontar Consumo / Ocorrência</h3>
              <p style={{ fontSize: 'var(--font-size-xs)', marginTop: '2px' }}>
                Baixa definitiva de consumíveis aplicados em serviço ou reporte de perda/avaria de ferramentas.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            style={{ width: '100%', marginTop: 'var(--space-3)' }}
            onClick={() => navigate('/movimentacoes/utilizacao')}
          >
            Apontar Consumo / Perda
          </Button>
        </Card>

        {/* Card 3: Devolução */}
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-success-bg)',
              color: 'var(--color-success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <CornerDownLeft size={22} />
            </div>
            <div>
              <h3>Devolução ao Depósito</h3>
              <p style={{ fontSize: 'var(--font-size-xs)', marginTop: '2px' }}>
                Retorno de ferramentas reutilizáveis e devolução de sobras de materiais consumíveis.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            style={{ width: '100%', marginTop: 'var(--space-3)' }}
            onClick={() => navigate('/movimentacoes/devolucao')}
          >
            Registrar Devolução
          </Button>
        </Card>

        {/* Card 4: Transferências (Admin/Gerente) */}
        {isGestor && (
          <Card>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-surface-hover)',
                color: 'var(--color-text-main)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <ArrowLeftRight size={22} />
              </div>
              <div>
                <h3>Transferência entre Depósitos</h3>
                <p style={{ fontSize: 'var(--font-size-xs)', marginTop: '2px' }}>
                  Movimentação interna entre dois estoques da mesma ou de diferentes filiais autorizadas.
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              style={{ width: '100%', marginTop: 'var(--space-3)' }}
              onClick={() => navigate('/transferencias')}
            >
              Fazer Transferência
            </Button>
          </Card>
        )}
      </div>

      <Card title="Acesso ao Histórico Geral">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p>Consulte todos os lançamentos, aprovações e estornos com trilha de auditoria completa.</p>
          </div>
          <Button
            variant="ghost"
            leftIcon={<History size={16} />}
            onClick={() => navigate('/historico')}
          >
            Abrir Histórico Geral
          </Button>
        </div>
      </Card>
    </div>
  );
};
