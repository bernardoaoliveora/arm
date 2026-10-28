import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, AlertCircle, ShoppingCart } from 'lucide-react';
import { Card, Button, Input, Select, Alert, Modal } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';

export const RegistrarRetiradaPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.perfil === 'ADMINISTRADOR' || user?.perfil === 'GERENTE';

  const [estoques, setEstoques] = useState<{ id: string; nome: string; empresa_id: string }[]>([]);
  const [tecnicos, setTecnicos] = useState<{ id: string; nome: string }[]>([]);
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<{
    id: string;
    nome: string;
    codigo_sku: string;
    unidade_medida: string;
    quantidade_disponivel: number;
    empresa_id: string;
  }[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Formulário
  const [estoqueOrigemId, setEstoqueOrigemId] = useState('');
  const [tecnicoId, setTecnicoId] = useState(isAdmin ? '' : user?.id || '');
  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [justificativa, setJustificativa] = useState('');

  // Modais de Feedback e Resumo
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Carrega estoques e técnicos
  const carregarBase = useCallback(async () => {
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

      let queryTec = supabase
        .from('usuarios')
        .select('id, nome, empresa_id')
        .eq('ativo', true)
        .eq('perfil', 'TECNICO');

      if (user?.empresaAtivaId) {
        queryTec = queryTec.eq('empresa_id', user.empresaAtivaId);
      }

      const { data: tecData } = await queryTec.order('nome', { ascending: true });

      setEstoques(estData || []);
      setTecnicos(tecData || []);

      if (estData && estData.length > 0) setEstoqueOrigemId(estData[0].id);
      if (tecData && tecData.length > 0 && !tecnicoId) {
        setTecnicoId(isAdmin ? tecData[0].id : user?.id || tecData[0].id);
      }
    } catch (err: any) {
      console.error('Erro ao carregar base de retirada:', err);
      setErrorMsg('Falha ao carregar lista de depósitos ou técnicos.');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, tecnicoId, user?.id, user?.empresaAtivaId]);

  // Carrega produtos com saldos no estoque selecionado
  const carregarProdutosComSaldo = useCallback(async (estId: string) => {
    if (!estId) return;
    try {
      const { data, error } = await supabase
        .from('estoque_itens')
        .select(`
          quantidade_disponivel,
          produtos:produto_id (
            id,
            nome,
            codigo_sku,
            unidade_medida,
            empresa_id
          )
        `)
        .eq('estoque_id', estId);

      if (error) throw error;

      const prods = (data || [])
        .filter((row: any) => Number(row.quantidade_disponivel) > 0)
        .map((row: any) => ({
          id: row.produtos?.id,
          nome: row.produtos?.nome || 'Item',
          codigo_sku: row.produtos?.codigo_sku || 'SKU',
          unidade_medida: row.produtos?.unidade_medida || 'UN',
          quantidade_disponivel: Number(row.quantidade_disponivel) || 0,
          empresa_id: row.produtos?.empresa_id,
        }));

      setProdutosDisponiveis(prods);
      if (prods.length > 0) {
        setProdutoId(prods[0].id);
      } else {
        setProdutoId('');
      }
    } catch (err) {
      console.error('Erro ao consultar saldos do estoque:', err);
    }
  }, []);

  useEffect(() => {
    carregarBase();
  }, [carregarBase]);

  useEffect(() => {
    if (estoqueOrigemId) {
      carregarProdutosComSaldo(estoqueOrigemId);
    }
  }, [estoqueOrigemId, carregarProdutosComSaldo]);

  const produtoSelecionadoObj = produtosDisponiveis.find((p) => p.id === produtoId);
  const estoqueSelecionadoObj = estoques.find((e) => e.id === estoqueOrigemId);
  const tecnicoSelecionadoObj = tecnicos.find((t) => t.id === tecnicoId);

  const handleValidarRetirada = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!estoqueOrigemId) {
      setErrorMsg('Selecione o estoque de origem.');
      return;
    }
    if (!tecnicoId) {
      setErrorMsg('Selecione o técnico responsável pela retirada.');
      return;
    }
    if (!produtoId || !produtoSelecionadoObj) {
      setErrorMsg('Selecione um produto com saldo disponível no depósito.');
      return;
    }

    const qtdNum = Number(quantidade);
    if (!qtdNum || qtdNum <= 0) {
      setErrorMsg('A quantidade a retirar deve ser maior que zero.');
      return;
    }
    if (qtdNum > produtoSelecionadoObj.quantidade_disponivel) {
      setErrorMsg(
        `Saldo insuficiente no estoque de origem. Disponível: ${produtoSelecionadoObj.quantidade_disponivel} ${produtoSelecionadoObj.unidade_medida}, Solicitado: ${qtdNum} ${produtoSelecionadoObj.unidade_medida}.`
      );
      return;
    }

    setIsConfirmModalOpen(true);
  };

  const handleEfetivarRetirada = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const chaveIdempotencia = `RETIRADA-${user?.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      const { data, error } = await supabase.rpc('processar_movimentacao_estoque', {
        p_tipo: 'RETIRADA',
        p_empresa_id: produtoSelecionadoObj?.empresa_id || estoqueSelecionadoObj?.empresa_id,
        p_produto_id: produtoId,
        p_quantidade: Number(quantidade),
        p_estoque_origem_id: estoqueOrigemId,
        p_tecnico_id: tecnicoId,
        p_justificativa: justificativa.trim() || 'Retirada padrão de materiais para atendimento de campo',
        p_chave_idempotencia: chaveIdempotencia,
      });

      if (error) throw error;

      setIsConfirmModalOpen(false);
      setSuccessMsg(
        `Retirada de ${quantidade} ${produtoSelecionadoObj?.unidade_medida} do produto "${produtoSelecionadoObj?.nome}" concluída com sucesso! Saldo restante no depósito: ${data.saldo_origem_posterior} ${produtoSelecionadoObj?.unidade_medida}. Saldo transferido para o técnico ${tecnicoSelecionadoObj?.nome}.`
      );

      // Recarrega saldos
      await carregarProdutosComSaldo(estoqueOrigemId);
      setQuantidade('1');
      setJustificativa('');
    } catch (err: any) {
      console.error('Erro ao efetivar retirada:', err);
      setIsConfirmModalOpen(false);
      setErrorMsg(err.message || 'Erro ao processar retirada de estoque.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '760px', margin: '0 auto' }}>
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
        <h1>Registrar Retirada de Materiais</h1>
        <p style={{ marginTop: '2px', color: 'var(--color-text-secondary)' }}>
          Transferência física de saldo do depósito para a custódia direta do técnico de campo.
        </p>
      </div>

      {successMsg && (
        <Alert variant="success" title="Retirada Concluída" onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      {errorMsg && (
        <Alert variant="danger" title="Atenção" onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      <Card title="Origem, Técnico e Seleção de Item">
        {isLoading ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <div className="spinner" style={{ width: '2rem', height: '2rem', margin: '0 auto var(--space-2)' }} />
            <span>Consultando depósitos e saldos disponíveis...</span>
          </div>
        ) : (
          <form onSubmit={handleValidarRetirada}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 'var(--space-4)' }}>
              <Select
                label="Depósito / Estoque de Origem"
                required
                value={estoqueOrigemId}
                onChange={(e) => setEstoqueOrigemId(e.target.value)}
                options={estoques.map((est) => ({ value: est.id, label: est.nome }))}
              />

              <Select
                label="Técnico Favorecido (Custódia)"
                required
                disabled={!isAdmin}
                value={tecnicoId}
                onChange={(e) => setTecnicoId(e.target.value)}
                options={tecnicos.map((t) => ({ value: t.id, label: t.nome }))}
                hint={!isAdmin ? 'Você está retirando materiais em seu próprio nome.' : undefined}
              />
            </div>

            <div style={{ margin: 'var(--space-4) 0' }}>
              <Select
                label="Produto / Material com Saldo no Depósito"
                required
                value={produtoId}
                onChange={(e) => setProdutoId(e.target.value)}
                options={
                  produtosDisponiveis.length === 0
                    ? [{ value: '', label: 'Nenhum produto com saldo neste depósito' }]
                    : produtosDisponiveis.map((p) => ({
                        value: p.id,
                        label: `${p.codigo_sku} - ${p.nome} (Disponível na Origem: ${p.quantidade_disponivel} ${p.unidade_medida})`,
                      }))
                }
              />
            </div>

            <div className="form-grid-1-2">
              <Input
                label="Quantidade Desejada"
                type="number"
                min="0.01"
                step="any"
                required
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />

              <Input
                label="Justificativa / Ordem de Serviço (Opcional)"
                placeholder="Ex: Instalação cliente final - OS 1042"
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
              />
            </div>

            <div className="form-actions">
              <Button variant="secondary" type="button" onClick={() => navigate('/movimentacoes')}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                type="submit"
                leftIcon={<ShoppingCart size={16} />}
                disabled={produtosDisponiveis.length === 0}
              >
                Revisar e Confirmar Retirada
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* Modal de Resumo Obrigatório Antes da Confirmação */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="Resumo da Operação de Retirada"
        description="Confira os dados antes de debitar do depósito e transferir para a posse do técnico."
        footerActions={
          <>
            <Button variant="secondary" onClick={() => setIsConfirmModalOpen(false)} disabled={isSubmitting}>
              Corrigir Dados
            </Button>
            <Button
              variant="primary"
              onClick={handleEfetivarRetirada}
              isLoading={isSubmitting}
              leftIcon={<CheckCircle2 size={16} />}
            >
              Confirmar Retirada
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
              <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Depósito de Origem:</span>
              <strong>{estoqueSelecionadoObj?.nome}</strong>
            </div>
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Técnico Responsável:</span>
              <strong>{tecnicoSelecionadoObj?.nome}</strong>
            </div>
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Produto a Retirar:</span>
              <strong>{produtoSelecionadoObj?.codigo_sku} - {produtoSelecionadoObj?.nome}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-muted)', display: 'block', fontSize: 'var(--font-size-xs)' }}>Quantidade Solicitada:</span>
              <strong style={{ fontSize: 'var(--font-size-lg)', color: 'var(--color-accent)' }}>
                {quantidade} {produtoSelecionadoObj?.unidade_medida}
              </strong>{' '}
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                (Disponível antes da operação: {produtoSelecionadoObj?.quantidade_disponivel} {produtoSelecionadoObj?.unidade_medida})
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
            <AlertCircle size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
            <span>A transação será processada com bloqueio pessimista atômico no PostgreSQL para garantir que o saldo nunca fique negativo.</span>
          </div>
        </div>
      </Modal>
    </div>
  );
};
