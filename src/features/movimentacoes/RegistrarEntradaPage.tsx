import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowDownCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, Button, Input, Select, Alert, Modal } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';

export const RegistrarEntradaPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [estoques, setEstoques] = useState<{ id: string; nome: string; empresa_id: string }[]>([]);
  const [produtos, setProdutos] = useState<{ id: string; nome: string; codigo_sku: string; unidade_medida: string; empresa_id: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Formulário
  const [estoqueDestinoId, setEstoqueDestinoId] = useState('');
  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState('10');
  const [notaFiscal, setNotaFiscal] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [justificativa, setJustificativa] = useState('');

  // Confirmação / Resumo
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const carregarDados = useCallback(async () => {
    setIsLoading(true);
    try {
      let queryEst = supabase
        .from('estoques')
        .select('id, nome, empresa_id')
        .eq('ativo', true);

      if (user?.empresaAtivaId) {
        queryEst = queryEst.eq('empresa_id', user.empresaAtivaId);
      }

      const { data: estData } = await queryEst.order('nome', { ascending: true });

      let queryProd = supabase
        .from('produtos')
        .select('id, nome, codigo_sku, unidade_medida, empresa_id')
        .eq('ativo', true);

      if (user?.empresaAtivaId) {
        queryProd = queryProd.eq('empresa_id', user.empresaAtivaId);
      }

      const { data: prodData } = await queryProd.order('nome', { ascending: true });

      setEstoques(estData || []);
      setProdutos(prodData || []);

      if (estData && estData.length > 0) setEstoqueDestinoId(estData[0].id);
      if (prodData && prodData.length > 0) setProdutoId(prodData[0].id);
    } catch (err: any) {
      console.error('Erro ao carregar dados:', err);
      setErrorMsg('Falha ao carregar depósitos ou produtos.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.empresaAtivaId]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const produtoSelecionadoObj = produtos.find((p) => p.id === produtoId);
  const estoqueSelecionadoObj = estoques.find((e) => e.id === estoqueDestinoId);

  const handleValidarFormulario = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!estoqueDestinoId) {
      setErrorMsg('Selecione o estoque de destino.');
      return;
    }
    if (!produtoId) {
      setErrorMsg('Selecione o produto.');
      return;
    }
    if (!quantidade || Number(quantidade) <= 0) {
      setErrorMsg('A quantidade deve ser maior que zero.');
      return;
    }

    setIsConfirmModalOpen(true);
  };

  const handleEfetivarEntrada = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const chaveIdempotencia = `ENTRADA-${user?.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const motivoFormatado = `Entrada de Mercadoria: NF ${notaFiscal || 'S/N'} • Fornecedor: ${fornecedor || 'Diversos'}${justificativa ? ` • Obs: ${justificativa}` : ''}`;

      const { data, error } = await supabase.rpc('processar_movimentacao_estoque', {
        p_tipo: 'ENTRADA',
        p_empresa_id: produtoSelecionadoObj?.empresa_id || estoqueSelecionadoObj?.empresa_id,
        p_produto_id: produtoId,
        p_quantidade: Number(quantidade),
        p_estoque_destino_id: estoqueDestinoId,
        p_justificativa: motivoFormatado,
        p_chave_idempotencia: chaveIdempotencia,
      });

      if (error) throw error;

      setIsConfirmModalOpen(false);
      setSuccessMsg(
        `Entrada de ${quantidade} ${produtoSelecionadoObj?.unidade_medida} do produto "${produtoSelecionadoObj?.nome}" processada com sucesso no depósito "${estoqueSelecionadoObj?.nome}"! Saldo final: ${data.saldo_destino_posterior} ${produtoSelecionadoObj?.unidade_medida}.`
      );

      // Reseta formulário
      setQuantidade('10');
      setNotaFiscal('');
      setFornecedor('');
      setJustificativa('');
    } catch (err: any) {
      console.error('Erro ao processar entrada:', err);
      setIsConfirmModalOpen(false);
      setErrorMsg(err.message || 'Erro ao registrar entrada de estoque.');
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
        <h1>Registrar Entrada de Materiais</h1>
        <p style={{ marginTop: '2px', color: 'var(--color-text-secondary)' }}>
          Recebimento físico de mercadorias, compras e reposições de almoxarifado.
        </p>
      </div>

      {successMsg && (
        <Alert variant="success" title="Entrada Efetivada" onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      {errorMsg && (
        <Alert variant="danger" title="Atenção" onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      <Card title="Dados da Nota Fiscal e Destino">
        {isLoading ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <div className="spinner" style={{ width: '2rem', height: '2rem', margin: '0 auto var(--space-2)' }} />
            <span>Carregando estoques e catálogo...</span>
          </div>
        ) : (
          <form onSubmit={handleValidarFormulario}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
              <Select
                label="Depósito / Almoxarifado de Destino"
                required
                value={estoqueDestinoId}
                onChange={(e) => setEstoqueDestinoId(e.target.value)}
                options={estoques.map((est) => ({ value: est.id, label: est.nome }))}
              />

              <Select
                label="Item / Material a Receber"
                required
                value={produtoId}
                onChange={(e) => setProdutoId(e.target.value)}
                options={produtos.map((p) => ({
                  value: p.id,
                  label: `${p.codigo_sku} - ${p.nome} (${p.unidade_medida})`,
                }))}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
              <Input
                label="Quantidade Recebida"
                type="number"
                min="0.01"
                step="any"
                required
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />

              <Input
                label="Nota Fiscal / Comprovante"
                placeholder="Ex: NF-e 4589"
                value={notaFiscal}
                onChange={(e) => setNotaFiscal(e.target.value)}
              />

              <Input
                label="Fornecedor / Origem"
                placeholder="Ex: Distribuidora Brasil"
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
              />
            </div>

            <div style={{ marginTop: 'var(--space-3)' }}>
              <Input
                label="Observações / Justificativa da Entrada"
                placeholder="Ex: Compra emergencial para atendimento de projeto"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
              <Button variant="secondary" type="button" onClick={() => navigate('/movimentacoes')}>
                Cancelar
              </Button>
              <Button variant="primary" type="submit" leftIcon={<ArrowDownCircle size={16} />}>
                Revisar e Confirmar Entrada
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* Modal de Resumo Obrigatório Antes da Confirmação */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="Resumo da Operação de Entrada"
        description="Confira os dados antes de gravar a movimentação de forma atômica no banco de dados."
        footerActions={
          <>
            <Button variant="secondary" onClick={() => setIsConfirmModalOpen(false)} disabled={isSubmitting}>
              Corrigir Dados
            </Button>
            <Button
              variant="primary"
              onClick={handleEfetivarEntrada}
              isLoading={isSubmitting}
              leftIcon={<CheckCircle2 size={16} />}
            >
              Confirmar e Efetivar Entrada
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
              <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Produto / Material:</span>
              <strong>{produtoSelecionadoObj?.codigo_sku} - {produtoSelecionadoObj?.nome}</strong>
            </div>
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Quantidade a Ingressar:</span>
              <strong style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-success)' }}>
                +{quantidade} {produtoSelecionadoObj?.unidade_medida}
              </strong>
            </div>
            {notaFiscal && (
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                Documento Fiscal: <strong>{notaFiscal}</strong> {fornecedor ? `• Fornecedor: ${fornecedor}` : ''}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            <AlertCircle size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
            <span>Esta operação gera um registro imutável com chave de idempotência e atualiza os saldos físicos instantaneamente.</span>
          </div>
        </div>
      </Modal>
    </div>
  );
};
