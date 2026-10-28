import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, CornerDownLeft, AlertCircle } from 'lucide-react';
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

export const RegistrarDevolucaoPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [estoques, setEstoques] = useState<{ id: string; nome: string }[]>([]);
  const [itensCustodia, setItensCustodia] = useState<ItemCustodia[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Formulário
  const [estoqueDestinoId, setEstoqueDestinoId] = useState('');
  const [produtoId, setProdutoId] = useState('');
  const [quantidadeDevolvida, setQuantidadeDevolvida] = useState('1');
  const [estadoConservacao, setEstadoConservacao] = useState('BOM');
  const [justificativa, setJustificativa] = useState('');

  // Modais
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      // 1. Busca depósitos de destino da empresa
      let queryEst = supabase
        .from('estoques')
        .select('id, nome, empresa_id')
        .eq('ativo', true);

      if (user?.empresaAtivaId) {
        queryEst = queryEst.eq('empresa_id', user.empresaAtivaId);
      }

      const { data: estData } = await queryEst.order('nome', { ascending: true });

      setEstoques(estData || []);
      if (estData && estData.length > 0) setEstoqueDestinoId(estData[0].id);

      // 2. Busca itens sob custódia do técnico
      const { data: custData, error: custErr } = await supabase
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

      if (custErr) throw custErr;

      const formatados: ItemCustodia[] = (custData || [])
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
      if (formatados.length > 0) setProdutoId(formatados[0].produto_id);
    } catch (err: any) {
      console.error('Erro ao carregar dados de devolução:', err);
      setErrorMsg('Falha ao consultar itens para devolução.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const itemSelecionadoObj = itensCustodia.find((i) => i.produto_id === produtoId);
  const estoqueSelecionadoObj = estoques.find((e) => e.id === estoqueDestinoId);

  const handleValidarDevolucao = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!estoqueDestinoId) {
      setErrorMsg('Selecione o estoque de destino para devolução.');
      return;
    }
    if (!produtoId || !itemSelecionadoObj) {
      setErrorMsg('Selecione um item sob sua custódia para devolver.');
      return;
    }

    const qtd = Number(quantidadeDevolvida);
    if (!qtd || qtd <= 0) {
      setErrorMsg('A quantidade a devolver deve ser maior que zero.');
      return;
    }
    if (qtd > itemSelecionadoObj.quantidade_posse) {
      setErrorMsg(
        `Quantidade a devolver excede o saldo sob sua posse (${itemSelecionadoObj.quantidade_posse} ${itemSelecionadoObj.unidade_medida}).`
      );
      return;
    }

    setIsConfirmModalOpen(true);
  };

  const handleEfetivarDevolucao = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const chaveIdempotencia = `DEVOLUCAO-${user?.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const motivoFormatado = `Devolução ao Depósito • Estado: ${estadoConservacao}${justificativa ? ` • Obs: ${justificativa}` : ''}`;

      const { data, error } = await supabase.rpc('processar_movimentacao_estoque', {
        p_tipo: 'DEVOLUCAO',
        p_empresa_id: itemSelecionadoObj?.empresa_id || user?.empresaAtivaId,
        p_produto_id: produtoId,
        p_quantidade: Number(quantidadeDevolvida),
        p_estoque_destino_id: estoqueDestinoId,
        p_tecnico_id: user?.id,
        p_justificativa: motivoFormatado,
        p_chave_idempotencia: chaveIdempotencia,
      });

      if (error) throw error;

      setIsConfirmModalOpen(false);
      setSuccessMsg(
        `Devolução de ${quantidadeDevolvida} ${itemSelecionadoObj?.unidade_medida} do produto "${itemSelecionadoObj?.nome}" concluída! Saldo atualizado no depósito "${estoqueSelecionadoObj?.nome}" (Total: ${data.saldo_destino_posterior} ${itemSelecionadoObj?.unidade_medida}).`
      );

      setQuantidadeDevolvida('1');
      setJustificativa('');
      await carregarDados();
    } catch (err: any) {
      console.error('Erro ao efetivar devolução:', err);
      setIsConfirmModalOpen(false);
      setErrorMsg(err.message || 'Erro ao processar devolução de material.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
        <h1>Registrar Devolução ao Depósito</h1>
        <p style={{ marginTop: '2px', color: 'var(--color-text-secondary)' }}>
          Retorno de ferramentas reutilizáveis e devolução de sobras de materiais consumíveis ao estoque.
        </p>
      </div>

      {successMsg && (
        <Alert variant="success" title="Devolução Concluída" onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      {errorMsg && (
        <Alert variant="danger" title="Atenção" onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      <Card title="Dados da Devolução">
        {isLoading ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <div className="spinner" style={{ width: '2rem', height: '2rem', margin: '0 auto var(--space-2)' }} />
            <span>Consultando materiais em sua posse...</span>
          </div>
        ) : itensCustodia.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <p>Você não possui itens ou ferramentas sob sua custódia no momento.</p>
            <span style={{ fontSize: 'var(--font-size-xs)' }}>
              Apenas materiais que estão sob sua posse técnica podem ser devolvidos aos estoques.
            </span>
          </div>
        ) : (
          <form onSubmit={handleValidarDevolucao}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 'var(--space-4)' }}>
              <Select
                label="Depósito de Destino (Recebimento)"
                required
                value={estoqueDestinoId}
                onChange={(e) => setEstoqueDestinoId(e.target.value)}
                options={estoques.map((est) => ({ value: est.id, label: est.nome }))}
              />

              <Select
                label="Item sob sua Custódia a Devolver"
                required
                value={produtoId}
                onChange={(e) => setProdutoId(e.target.value)}
                options={itensCustodia.map((item) => ({
                  value: item.produto_id,
                  label: `${item.codigo_sku} - ${item.nome} (Em posse: ${item.quantidade_posse} ${item.unidade_medida})`,
                }))}
              />
            </div>

            <div className="form-grid-2" style={{ marginTop: 'var(--space-3)' }}>
              <Input
                label="Quantidade a Devolver"
                type="number"
                min="0.01"
                step="any"
                required
                value={quantidadeDevolvida}
                onChange={(e) => setQuantidadeDevolvida(e.target.value)}
              />

              <Select
                label="Estado Físico de Conservação no Retorno"
                required
                value={estadoConservacao}
                onChange={(e) => setEstadoConservacao(e.target.value)}
                options={[
                  { value: 'NOVO', label: 'Novo / Lacrado' },
                  { value: 'BOM', label: 'Bom / Pronto para Reuso' },
                  { value: 'REGULAR', label: 'Regular / Desgaste Normal' },
                  { value: 'AVARIADO', label: 'Avariado / Direcionar para Manutenção' },
                ]}
              />
            </div>

            <div style={{ marginTop: 'var(--space-3)' }}>
              <Input
                label="Justificativa / Observações (Opcional)"
                placeholder="Ex: Devolução de sobras de obra ou fim de escala de serviço"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
              />
            </div>

            <div className="form-actions">
              <Button variant="secondary" type="button" onClick={() => navigate('/movimentacoes')}>
                Cancelar
              </Button>
              <Button variant="primary" type="submit" leftIcon={<CornerDownLeft size={16} />}>
                Revisar e Confirmar Devolução
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* Modal de Resumo Obrigatório Antes da Confirmação */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="Resumo da Operação de Devolução"
        description="Confira os dados antes de abater da sua custódia e devolver o saldo ao depósito físico."
        footerActions={
          <>
            <Button variant="secondary" onClick={() => setIsConfirmModalOpen(false)} disabled={isSubmitting}>
              Corrigir
            </Button>
            <Button
              variant="primary"
              onClick={handleEfetivarDevolucao}
              isLoading={isSubmitting}
              leftIcon={<CheckCircle2 size={16} />}
            >
              Confirmar Devolução
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
              <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Depósito de Destino:</span>
              <strong>{estoqueSelecionadoObj?.nome}</strong>
            </div>
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Item a Retornar:</span>
              <strong>{itemSelecionadoObj?.codigo_sku} - {itemSelecionadoObj?.nome}</strong>
            </div>
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Quantidade Devolvida:</span>
              <strong style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-success)' }}>
                {quantidadeDevolvida} {itemSelecionadoObj?.unidade_medida}
              </strong>
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              Estado de Conservação: <strong>{estadoConservacao}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            <AlertCircle size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
            <span>A transação reduzirá o saldo sob sua responsabilidade e incrementará o saldo do depósito fisicamente.</span>
          </div>
        </div>
      </Modal>
    </div>
  );
};
