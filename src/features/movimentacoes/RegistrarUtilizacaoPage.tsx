import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Flame, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, Button, Input, Select, Alert, Modal } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';

interface ItemCustodia {
  produto_id: string;
  nome: string;
  codigo_sku: string;
  tipo: string;
  unidade_medida: string;
  quantidade_posse: number;
  empresa_id: string;
}

export const RegistrarUtilizacaoPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tab, setTab] = useState<'CONSUMO' | 'OCORRENCIA'>('CONSUMO');
  const [itensCustodia, setItensCustodia] = useState<ItemCustodia[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados de Consumo
  const [consumoProdutoId, setConsumoProdutoId] = useState('');
  const [consumoQtd, setConsumoQtd] = useState('1');
  const [consumoOrdemServico, setConsumoOrdemServico] = useState('');

  // Estados de Ocorrência (Perda / Dano)
  const [tipoOcorrencia, setTipoOcorrencia] = useState<'DANO' | 'PERDA'>('DANO');
  const [ocorrenciaProdutoId, setOcorrenciaProdutoId] = useState('');
  const [ocorrenciaQtd, setOcorrenciaQtd] = useState('1');
  const [justificativa, setJustificativa] = useState('');

  // Resumo e Modais
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [operacaoPendente, setOperacaoPendente] = useState<'CONSUMO' | 'PERDA' | 'DANO'>('CONSUMO');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const carregarCustodiaTecnico = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('custodia_itens')
        .select(`
          quantidade_posse,
          empresa_id,
          produtos:produto_id (
            id,
            nome,
            codigo_sku,
            tipo,
            unidade_medida
          )
        `)
        .eq('tecnico_id', user.id);

      if (error) throw error;

      const formatados: ItemCustodia[] = (data || [])
        .filter((row: any) => Number(row.quantidade_posse) > 0)
        .map((row: any) => ({
          produto_id: row.produtos?.id,
          nome: row.produtos?.nome || 'Item',
          codigo_sku: row.produtos?.codigo_sku || 'SKU',
          tipo: row.produtos?.tipo || 'CONSUMIVEL',
          unidade_medida: row.produtos?.unidade_medida || 'UN',
          quantidade_posse: Number(row.quantidade_posse) || 0,
          empresa_id: row.empresa_id,
        }));

      setItensCustodia(formatados);

      // Seta selects iniciais
      const consumiveis = formatados.filter((i) => i.tipo === 'CONSUMIVEL');
      if (consumiveis.length > 0) setConsumoProdutoId(consumiveis[0].produto_id);
      if (formatados.length > 0) setOcorrenciaProdutoId(formatados[0].produto_id);
    } catch (err: any) {
      console.error('Erro ao buscar custódia do técnico:', err);
      setErrorMsg('Não foi possível carregar os materiais sob sua posse.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    carregarCustodiaTecnico();
  }, [carregarCustodiaTecnico]);

  const consumiveisDisponiveis = itensCustodia.filter((i) => i.tipo === 'CONSUMIVEL');
  const itemConsumoObj = itensCustodia.find((i) => i.produto_id === consumoProdutoId);
  const itemOcorrenciaObj = itensCustodia.find((i) => i.produto_id === ocorrenciaProdutoId);

  const handleValidarConsumo = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!consumoProdutoId || !itemConsumoObj) {
      setErrorMsg('Selecione um material consumível sob sua custódia.');
      return;
    }

    const qtd = Number(consumoQtd);
    if (!qtd || qtd <= 0) {
      setErrorMsg('A quantidade consumida deve ser maior que zero.');
      return;
    }
    if (qtd > itemConsumoObj.quantidade_posse) {
      setErrorMsg(`Quantidade superior ao saldo sob sua posse (${itemConsumoObj.quantidade_posse} ${itemConsumoObj.unidade_medida}).`);
      return;
    }
    if (!consumoOrdemServico.trim()) {
      setErrorMsg('Informe a Ordem de Serviço ou Identificação do Atendimento.');
      return;
    }

    setOperacaoPendente('CONSUMO');
    setIsConfirmModalOpen(true);
  };

  const handleValidarOcorrencia = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!ocorrenciaProdutoId || !itemOcorrenciaObj) {
      setErrorMsg('Selecione o item afetado.');
      return;
    }
    const qtd = Number(ocorrenciaQtd);
    if (!qtd || qtd <= 0) {
      setErrorMsg('A quantidade deve ser maior que zero.');
      return;
    }
    if (qtd > itemOcorrenciaObj.quantidade_posse) {
      setErrorMsg(`Quantidade superior ao saldo em sua posse (${itemOcorrenciaObj.quantidade_posse} ${itemOcorrenciaObj.unidade_medida}).`);
      return;
    }
    if (justificativa.trim().length < 10) {
      setErrorMsg('A justificativa da ocorrência deve conter no mínimo 10 caracteres explicativos.');
      return;
    }

    setOperacaoPendente(tipoOcorrencia);
    setIsConfirmModalOpen(true);
  };

  const handleEfetivarOperacao = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const chaveIdempotencia = `UTILIZACAO-${user?.id}-${operacaoPendente}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      if (operacaoPendente === 'CONSUMO') {
        const { error } = await supabase.rpc('processar_movimentacao_estoque', {
          p_tipo: 'CONSUMO',
          p_empresa_id: itemConsumoObj?.empresa_id || user?.empresaAtivaId,
          p_produto_id: consumoProdutoId,
          p_quantidade: Number(consumoQtd),
          p_tecnico_id: user?.id,
          p_justificativa: `Consumo em Serviço: ${consumoOrdemServico.trim()}`,
          p_chave_idempotencia: chaveIdempotencia,
        });

        if (error) throw error;

        setSuccessMsg(
          `Consumo de ${consumoQtd} ${itemConsumoObj?.unidade_medida} do produto "${itemConsumoObj?.nome}" apontado com sucesso! Baixa definitiva efetuada.`
        );
        setConsumoQtd('1');
        setConsumoOrdemServico('');
      } else {
        // PERDA OU DANO
        const { error } = await supabase.rpc('processar_movimentacao_estoque', {
          p_tipo: operacaoPendente,
          p_empresa_id: itemOcorrenciaObj?.empresa_id || user?.empresaAtivaId,
          p_produto_id: ocorrenciaProdutoId,
          p_quantidade: Number(ocorrenciaQtd),
          p_tecnico_id: user?.id,
          p_justificativa: justificativa.trim(),
          p_chave_idempotencia: chaveIdempotencia,
        });

        if (error) throw error;

        setSuccessMsg(
          `Ocorrência de ${operacaoPendente === 'DANO' ? 'Dano (Quarentena/Reparo)' : 'Perda Definitiva'} registrada com auditoria para "${itemOcorrenciaObj?.nome}".`
        );
        setOcorrenciaQtd('1');
        setJustificativa('');
      }

      setIsConfirmModalOpen(false);
      await carregarCustodiaTecnico();
    } catch (err: any) {
      console.error('Erro ao efetivar operação de campo:', err);
      setIsConfirmModalOpen(false);
      setErrorMsg(err.message || 'Erro ao processar movimentação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const itemAtivoModal = operacaoPendente === 'CONSUMO' ? itemConsumoObj : itemOcorrenciaObj;
  const qtdAtivaModal = operacaoPendente === 'CONSUMO' ? consumoQtd : ocorrenciaQtd;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '740px', margin: '0 auto' }}>
      <div>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<ArrowLeft size={16} />}
          onClick={() => navigate('/movimentacoes')}
          style={{ marginBottom: 'var(--space-3)' }}
        >
          Voltar para Movimentações
        </Button>
        <h1>Apontamento em Campo (Consumo & Ocorrências)</h1>
        <p style={{ marginTop: '2px', color: 'var(--color-text-secondary)' }}>
          Baixa definitiva de consumíveis aplicados em serviços ou reporte auditável de perdas e avarias de ferramentas.
        </p>
      </div>

      {successMsg && (
        <Alert variant="success" title="Operação Registrada" onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      {errorMsg && (
        <Alert variant="danger" title="Atenção" onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      {/* Alternador de Abas */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button
          variant={tab === 'CONSUMO' ? 'primary' : 'secondary'}
          leftIcon={<Flame size={16} />}
          onClick={() => { setTab('CONSUMO'); setErrorMsg(null); }}
          style={{ flex: 1 }}
        >
          Baixa de Consumíveis em Serviço
        </Button>
        <Button
          variant={tab === 'OCORRENCIA' ? 'danger' : 'secondary'}
          leftIcon={<AlertTriangle size={16} />}
          onClick={() => { setTab('OCORRENCIA'); setErrorMsg(null); }}
          style={{ flex: 1 }}
        >
          Relatar Perda ou Dano Patrimonial
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <div className="spinner" style={{ width: '2rem', height: '2rem', margin: '0 auto var(--space-2)' }} />
            <span>Consultando saldo de materiais sob sua custódia...</span>
          </div>
        </Card>
      ) : tab === 'CONSUMO' ? (
        <Card title="Baixa Definitiva de Material Consumível">
          {consumiveisDisponiveis.length === 0 ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <p>Você não possui materiais consumíveis sob sua custódia no momento.</p>
              <span style={{ fontSize: 'var(--font-size-xs)' }}>Realize uma retirada prévia de materiais no depósito para poder apontar consumo.</span>
            </div>
          ) : (
            <form onSubmit={handleValidarConsumo}>
              <Select
                label="Material Consumível em sua Posse"
                required
                value={consumoProdutoId}
                onChange={(e) => setConsumoProdutoId(e.target.value)}
                options={consumiveisDisponiveis.map((item) => ({
                  value: item.produto_id,
                  label: `${item.codigo_sku} - ${item.nome} (Em posse: ${item.quantidade_posse} ${item.unidade_medida})`,
                }))}
                hint="Somente consumíveis sob sua responsabilidade direta podem sofrer baixa de uso."
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                <Input
                  label="Quantidade Utilizada"
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={consumoQtd}
                  onChange={(e) => setConsumoQtd(e.target.value)}
                />

                <Input
                  label="Ordem de Serviço / Atendimento"
                  required
                  placeholder="Ex: OS 10452 - Cliente XPTO"
                  value={consumoOrdemServico}
                  onChange={(e) => setConsumoOrdemServico(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
                <Button variant="secondary" type="button" onClick={() => navigate('/movimentacoes')}>
                  Cancelar
                </Button>
                <Button variant="primary" type="submit">
                  Revisar e Confirmar Consumo
                </Button>
              </div>
            </form>
          )}
        </Card>
      ) : (
        <Card title="Relato de Ocorrência Patrimonial">
          <Alert variant="warning" title="Regra de Salvaguarda Patrimonial">
            Danos e perdas retiram o item do saldo disponível para uso e geram um registro imutável com justificativa formal para auditoria.
          </Alert>

          {itensCustodia.length === 0 ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <p>Você não possui itens sob sua custódia no momento.</p>
            </div>
          ) : (
            <form onSubmit={handleValidarOcorrencia} style={{ marginTop: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <Select
                  label="Tipo da Ocorrência"
                  required
                  value={tipoOcorrencia}
                  onChange={(e) => setTipoOcorrencia(e.target.value as any)}
                  options={[
                    { value: 'DANO', label: 'Item Danificado / Avariado (Quarentena/Reparo)' },
                    { value: 'PERDA', label: 'Extravio ou Perda em Campo' },
                  ]}
                />

                <Select
                  label="Item Afetado sob sua Posse"
                  required
                  value={ocorrenciaProdutoId}
                  onChange={(e) => setOcorrenciaProdutoId(e.target.value)}
                  options={itensCustodia.map((item) => ({
                    value: item.produto_id,
                    label: `${item.codigo_sku} - ${item.nome} (${item.quantidade_posse} ${item.unidade_medida})`,
                  }))}
                />
              </div>

              <div style={{ marginTop: 'var(--space-3)' }}>
                <Input
                  label="Quantidade Afetada"
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={ocorrenciaQtd}
                  onChange={(e) => setOcorrenciaQtd(e.target.value)}
                />
              </div>

              <div style={{ marginTop: 'var(--space-3)' }}>
                <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 500, marginBottom: 'var(--space-1)' }}>
                  Justificativa Circunstanciada do Ocorrido <span style={{ color: 'var(--color-danger)' }}>*</span>
                </label>
                <textarea
                  className="textarea"
                  rows={4}
                  required
                  placeholder="Descreva detalhadamente o ocorrido (mínimo de 10 caracteres obrigatórios para auditoria)..."
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
                <Button variant="secondary" type="button" onClick={() => navigate('/movimentacoes')}>
                  Cancelar
                </Button>
                <Button variant="danger" type="submit">
                  Revisar e Registrar Ocorrência
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {/* Modal de Resumo Obrigatório Antes da Confirmação */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title={`Resumo da Operação: ${operacaoPendente}`}
        description="Confira atentamente os dados antes da efetivação atômica no banco de dados."
        footerActions={
          <>
            <Button variant="secondary" onClick={() => setIsConfirmModalOpen(false)} disabled={isSubmitting}>
              Corrigir
            </Button>
            <Button
              variant={operacaoPendente === 'CONSUMO' ? 'primary' : 'danger'}
              onClick={handleEfetivarOperacao}
              isLoading={isSubmitting}
              leftIcon={<CheckCircle2 size={16} />}
            >
              Confirmar e Gravar
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            fontSize: 'var(--font-size-sm)',
          }}>
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Operação:</span>
              <strong>{operacaoPendente === 'CONSUMO' ? 'Baixa por Consumo em Serviço' : operacaoPendente === 'DANO' ? 'Avaria / Encaminhamento para Quarentena' : 'Perda Patrimonial Definitiva'}</strong>
            </div>
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Item Afetado:</span>
              <strong>{itemAtivoModal?.codigo_sku} - {itemAtivoModal?.nome}</strong>
            </div>
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Quantidade a Deduzir:</span>
              <strong style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-danger)' }}>
                -{qtdAtivaModal} {itemAtivoModal?.unidade_medida}
              </strong>
            </div>
            {operacaoPendente === 'CONSUMO' ? (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                Ordem de Serviço: <strong>{consumoOrdemServico}</strong>
              </div>
            ) : (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                Motivo/Justificativa: <em>"{justificativa}"</em>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            <AlertCircle size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
            <span>O saldo sob sua posse será reduzido atomicamente e a trilha de auditoria será gerada no servidor.</span>
          </div>
        </div>
      </Modal>
    </div>
  );
};
