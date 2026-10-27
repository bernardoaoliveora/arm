import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { Card, Button, Input, Select, Alert, Modal } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';

interface Estoque {
  id: string;
  nome: string;
  tipo: string;
  empresa_id: string;
}

interface ItemEstoque {
  produto_id: string;
  produto_nome: string;
  codigo_sku: string;
  unidade_medida: string;
  saldo_disponivel: number;
}

export const TransferenciasPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [origemId, setOrigemId] = useState('');
  const [destinoId, setDestinoId] = useState('');

  const [itensDisponiveis, setItensDisponiveis] = useState<ItemEstoque[]>([]);
  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState('1');

  const [isLoadingEstoques, setIsLoadingEstoques] = useState(true);
  const [isLoadingItens, setIsLoadingItens] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [modalResumoAberto, setModalResumoAberto] = useState(false);
  const [sucessoMsg, setSucessoMsg] = useState('');
  const [erro, setErro] = useState('');

  // 1. Carregar estoques
  useEffect(() => {
    async function carregarEstoques() {
      setIsLoadingEstoques(true);
      try {
        let query = supabase.from('estoques').select('id, nome, tipo, empresa_id').eq('ativo', true);
        if (user?.empresaAtivaId) {
          query = query.eq('empresa_id', user.empresaAtivaId);
        }
        const { data, error } = await query;
        if (error) throw error;

        const lista = (data || []) as Estoque[];
        setEstoques(lista);

        if (lista.length > 0) {
          setOrigemId(lista[0].id);
          if (lista.length > 1) {
            setDestinoId(lista[1].id);
          } else {
            setDestinoId(lista[0].id);
          }
        }
      } catch (err: unknown) {
        const error = err as Error;
        setErro('Erro ao carregar lista de estoques: ' + error.message);
      } finally {
        setIsLoadingEstoques(false);
      }
    }

    carregarEstoques();
  }, [user?.empresaAtivaId]);

  // 2. Carregar produtos disponíveis no estoque de origem
  useEffect(() => {
    async function carregarSaldoOrigem() {
      if (!origemId) {
        setItensDisponiveis([]);
        setProdutoId('');
        return;
      }

      setIsLoadingItens(true);
      try {
        const { data, error } = await supabase
          .from('estoque_itens')
          .select(`
            produto_id,
            quantidade_disponivel,
            produtos (
              id,
              nome,
              codigo_sku,
              unidade_medida
            )
          `)
          .eq('estoque_id', origemId)
          .gt('quantidade_disponivel', 0);

        if (error) throw error;

        interface SaldoRow {
          produto_id: string;
          quantidade_disponivel: number;
          produtos: {
            id: string;
            nome: string;
            codigo_sku: string;
            unidade_medida: string;
          } | null;
        }

        const formatados: ItemEstoque[] = ((data as unknown as SaldoRow[]) || [])
          .filter(item => item.produtos !== null)
          .map(item => ({
            produto_id: item.produto_id,
            produto_nome: item.produtos!.nome,
            codigo_sku: item.produtos!.codigo_sku,
            unidade_medida: item.produtos!.unidade_medida,
            saldo_disponivel: item.quantidade_disponivel,
          }));

        setItensDisponiveis(formatados);
        if (formatados.length > 0) {
          setProdutoId(formatados[0].produto_id);
        } else {
          setProdutoId('');
        }
      } catch (err: unknown) {
        const error = err as Error;
        setErro('Erro ao buscar saldos do estoque de origem: ' + error.message);
      } finally {
        setIsLoadingItens(false);
      }
    }

    carregarSaldoOrigem();
  }, [origemId]);

  const itemSelecionado = itensDisponiveis.find(i => i.produto_id === produtoId);
  const estoqueOrigemObj = estoques.find(e => e.id === origemId);
  const estoqueDestinoObj = estoques.find(e => e.id === destinoId);

  const handleAbrirResumo = (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');

    if (!origemId || !destinoId) {
      setErro('Selecione os estoques de origem e destino.');
      return;
    }

    if (origemId === destinoId) {
      setErro('O estoque de origem e destino não podem ser o mesmo.');
      return;
    }

    if (!produtoId || !itemSelecionado) {
      setErro('Selecione um produto com saldo disponível no estoque de origem.');
      return;
    }

    const qtd = parseFloat(quantidade);
    if (isNaN(qtd) || qtd <= 0) {
      setErro('Informe uma quantidade válida superior a 0.');
      return;
    }

    if (qtd > itemSelecionado.saldo_disponivel) {
      setErro(`Quantidade informada (${qtd}) excede o saldo disponível na origem (${itemSelecionado.saldo_disponivel} ${itemSelecionado.unidade_medida}).`);
      return;
    }

    setModalResumoAberto(true);
  };

  const handleConfirmarTransferencia = async () => {
    if (!itemSelecionado || !user?.empresaAtivaId || !user?.id) return;

    setIsSubmitting(true);
    setErro('');

    try {
      const chaveIdempotencia = 'transf_' + crypto.randomUUID();
      const qtd = parseFloat(quantidade);

      const { data, error } = await supabase.rpc('processar_movimentacao_estoque', {
        p_tipo: 'TRANSFERENCIA',
        p_empresa_id: user.empresaAtivaId,
        p_produto_id: itemSelecionado.produto_id,
        p_quantidade: qtd,
        p_estoque_origem_id: origemId,
        p_estoque_destino_id: destinoId,
        p_justificativa: `Transferência de depósito: ${estoqueOrigemObj?.nome} -> ${estoqueDestinoObj?.nome}`,
        p_chave_idempotencia: chaveIdempotencia,
      });

      if (error) throw error;

      setModalResumoAberto(false);
      setSucessoMsg(`Transferência realizada com sucesso! Protocolo: ${data}`);

      // Atualizar lista local de saldos
      setItensDisponiveis(prev =>
        prev
          .map(item => {
            if (item.produto_id === itemSelecionado.produto_id) {
              return { ...item, saldo_disponivel: item.saldo_disponivel - qtd };
            }
            return item;
          })
          .filter(item => item.saldo_disponivel > 0)
      );

      setTimeout(() => {
        navigate('/movimentacoes');
      }, 2000);
    } catch (err: unknown) {
      const error = err as Error;
      setErro('Falha na transferência atômica: ' + error.message);
      setModalResumoAberto(false);
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
        <h1>Transferência entre Estoques</h1>
        <p style={{ marginTop: '2px' }}>
          Remanejamento atômico de materiais entre depósitos da mesma empresa com conferência de saldo em tempo real.
        </p>
      </div>

      {erro && <Alert variant="danger" title="Atenção">{erro}</Alert>}
      {sucessoMsg && (
        <Alert variant="success" title="Transferência Concluída!">
          {sucessoMsg}
        </Alert>
      )}

      <Card title="Dados da Transferência">
        <form onSubmit={handleAbrirResumo}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 'var(--space-4)',
          }}>
            <Select
              label="Estoque de Origem (Reduz saldo)"
              required
              disabled={isLoadingEstoques}
              value={origemId}
              onChange={(e) => setOrigemId(e.target.value)}
              options={estoques.map(e => ({
                value: e.id,
                label: `${e.nome} (${e.tipo})`,
              }))}
            />

            <Select
              label="Estoque de Destino (Aumenta saldo)"
              required
              disabled={isLoadingEstoques}
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
              options={estoques.map(e => ({
                value: e.id,
                label: `${e.nome} (${e.tipo})`,
              }))}
            />
          </div>

          <div style={{ margin: 'var(--space-4) 0' }}>
            <Select
              label="Produto / Material a Transferir"
              required
              disabled={isLoadingItens || itensDisponiveis.length === 0}
              value={produtoId}
              onChange={(e) => setProdutoId(e.target.value)}
              options={
                itensDisponiveis.length === 0
                  ? [{ value: '', label: isLoadingItens ? 'Carregando produtos...' : 'Nenhum produto com saldo nesta origem' }]
                  : itensDisponiveis.map(i => ({
                      value: i.produto_id,
                      label: `${i.produto_nome} [SKU: ${i.codigo_sku}] — Disponível: ${i.saldo_disponivel} ${i.unidade_medida}`,
                    }))
              }
            />

            {itemSelecionado && (
              <div style={{
                marginTop: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--color-surface-hover)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--font-size-sm)',
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                <span>Saldo atual na origem:</span>
                <strong>{itemSelecionado.saldo_disponivel} {itemSelecionado.unidade_medida}</strong>
              </div>
            )}

            <div style={{ marginTop: 'var(--space-4)' }}>
              <Input
                label="Quantidade a Transferir"
                type="number"
                min="0.001"
                step="any"
                required
                disabled={!itemSelecionado}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                placeholder="Ex: 10"
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
            <Button variant="secondary" type="button" onClick={() => navigate('/movimentacoes')}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={!itemSelecionado || itensDisponiveis.length === 0 || isLoadingItens}
              leftIcon={<ArrowLeftRight size={16} />}
            >
              Revisar e Transferir
            </Button>
          </div>
        </form>
      </Card>

      {/* Modal de Resumo da Operação antes de Confirmar */}
      <Modal
        isOpen={modalResumoAberto}
        onClose={() => setModalResumoAberto(false)}
        title="Resumo da Transferência"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
            Confira as informações antes de confirmar. Esta operação movimentará atomicamente o saldo entre os depósitos:
          </p>

          <div style={{
            backgroundColor: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            fontSize: 'var(--font-size-sm)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Depósito de Origem:</span>
              <strong>{estoqueOrigemObj?.nome}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Depósito de Destino:</span>
              <strong>{estoqueDestinoObj?.nome}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Produto:</span>
              <strong>{itemSelecionado?.produto_nome}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Código SKU:</span>
              <code>{itemSelecionado?.codigo_sku}</code>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Quantidade transferida:</span>
              <strong style={{ color: 'var(--color-accent)', fontSize: 'var(--font-size-md)' }}>
                {quantidade} {itemSelecionado?.unidade_medida}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Saldo restante na origem:</span>
              <span>
                {itemSelecionado ? (itemSelecionado.saldo_disponivel - parseFloat(quantidade || '0')).toFixed(2) : 0}{' '}
                {itemSelecionado?.unidade_medida}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <Button
              variant="secondary"
              onClick={() => setModalResumoAberto(false)}
              disabled={isSubmitting}
            >
              Voltar e Ajustar
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmarTransferencia}
              isLoading={isSubmitting}
              leftIcon={<CheckCircle2 size={16} />}
            >
              Confirmar Transferência
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
