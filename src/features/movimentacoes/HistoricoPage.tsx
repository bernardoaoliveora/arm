import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Clock,
  RotateCcw,
  AlertTriangle,
  FileText,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Card, Button, Input, Select, Table, Badge, Modal, Alert } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';

interface MovimentacaoItemDb {
  id: string;
  quantidade: number;
  saldo_anterior_origem: number | null;
  saldo_posterior_origem: number | null;
  saldo_anterior_destino: number | null;
  saldo_posterior_destino: number | null;
  produtos: {
    id: string;
    nome: string;
    codigo_sku: string;
    unidade_medida: string;
  } | null;
}

interface MovimentacaoRow {
  id: string;
  empresa_id: string;
  tipo: string;
  usuario_operador_id: string;
  tecnico_envolvido_id: string | null;
  estoque_origem_id: string | null;
  estoque_destino_id: string | null;
  justificativa: string | null;
  movimentacao_estornada_id: string | null;
  chave_idempotencia: string | null;
  estornado: boolean;
  criado_em: string;
  usuario_operador: {
    nome: string;
  } | null;
  tecnico_envolvido: {
    nome: string;
  } | null;
  estoque_origem: {
    nome: string;
  } | null;
  estoque_destino: {
    nome: string;
  } | null;
  movimentacao_itens: MovimentacaoItemDb[];
}

export const HistoricoPage: React.FC = () => {
  const { user } = useAuth();
  const isGestor = user?.perfil === 'ADMINISTRADOR' || user?.perfil === 'GERENTE';

  // Dados e paginação
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoRow[]>([]);
  const [totalRegistros, setTotalRegistros] = useState<number>(0);
  const [paginaAtual, setPaginaAtual] = useState<number>(1);
  const itensPorPagina = 15;
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filtros
  const [tipoFiltro, setTipoFiltro] = useState<string>('TODOS');
  const [estoqueFiltro, setEstoqueFiltro] = useState<string>('');
  const [produtoFiltro, setProdutoFiltro] = useState<string>('');
  const [tecnicoFiltro, setTecnicoFiltro] = useState<string>('');
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Listas de apoio
  const [listaEstoques, setListaEstoques] = useState<Array<{ id: string; nome: string }>>([]);
  const [listaProdutos, setListaProdutos] = useState<Array<{ id: string; nome: string; codigo_sku: string }>>([]);
  const [listaTecnicos, setListaTecnicos] = useState<Array<{ id: string; nome: string }>>([]);

  // Estados de Modais
  const [detalheMovimentacao, setDetalheMovimentacao] = useState<MovimentacaoRow | null>(null);
  const [movParaEstornar, setMovParaEstornar] = useState<MovimentacaoRow | null>(null);
  const [motivoEstorno, setMotivoEstorno] = useState<string>('');
  const [isEstornando, setIsEstornando] = useState<boolean>(false);
  const [erroEstorno, setErroEstorno] = useState<string>('');
  const [sucessoMsg, setSucessoMsg] = useState<string>('');
  const [erroGeral, setErroGeral] = useState<string>('');

  // 1. Carregar listas de apoio para os selects de filtros
  useEffect(() => {
    async function carregarApoio() {
      if (!user?.empresaAtivaId) return;

      try {
        const [estRes, prodRes, tecRes] = await Promise.all([
          supabase
            .from('estoques')
            .select('id, nome')
            .eq('empresa_id', user.empresaAtivaId)
            .eq('ativo', true)
            .order('nome'),
          supabase
            .from('produtos')
            .select('id, nome, codigo_sku')
            .eq('empresa_id', user.empresaAtivaId)
            .eq('ativo', true)
            .order('nome'),
          isGestor
            ? supabase
                .from('usuarios')
                .select('id, nome')
                .eq('perfil', 'TECNICO')
                .eq('ativo', true)
                .order('nome')
            : Promise.resolve({ data: [], error: null })
        ]);

        if (estRes.data) setListaEstoques(estRes.data);
        if (prodRes.data) setListaProdutos(prodRes.data);
        if (tecRes.data) setListaTecnicos(tecRes.data);
      } catch (err: unknown) {
        console.error('Erro ao carregar listas de filtro:', err);
      }
    }

    carregarApoio();
  }, [user?.empresaAtivaId, isGestor]);

  // 2. Carregar Movimentações com Paginação e Filtros
  const carregarHistorico = useCallback(async () => {
    if (!user?.empresaAtivaId) return;

    setIsLoading(true);
    setErroGeral('');

    try {
      let query = supabase
        .from('movimentacoes')
        .select(`
          id,
          empresa_id,
          tipo,
          usuario_operador_id,
          tecnico_envolvido_id,
          estoque_origem_id,
          estoque_destino_id,
          justificativa,
          movimentacao_estornada_id,
          chave_idempotencia,
          estornado,
          criado_em,
          usuario_operador:usuario_operador_id (nome),
          tecnico_envolvido:tecnico_envolvido_id (nome),
          estoque_origem:estoque_origem_id (nome),
          estoque_destino:estoque_destino_id (nome),
          movimentacao_itens (
            id,
            quantidade,
            saldo_anterior_origem,
            saldo_posterior_origem,
            saldo_anterior_destino,
            saldo_posterior_destino,
            produtos (id, nome, codigo_sku, unidade_medida)
          )
        `, { count: 'exact' })
        .eq('empresa_id', user.empresaAtivaId)
        .order('criado_em', { ascending: false });

      // Permissões: se for técnico, vê somente movimentações onde é operador ou técnico envolvido
      if (!isGestor) {
        query = query.or(`usuario_operador_id.eq.${user.id},tecnico_envolvido_id.eq.${user.id}`);
      } else if (tecnicoFiltro) {
        query = query.eq('tecnico_envolvido_id', tecnicoFiltro);
      }

      // Filtro por Tipo
      if (tipoFiltro !== 'TODOS') {
        query = query.eq('tipo', tipoFiltro);
      }

      // Filtro por Estoque
      if (estoqueFiltro) {
        query = query.or(`estoque_origem_id.eq.${estoqueFiltro},estoque_destino_id.eq.${estoqueFiltro}`);
      }

      // Filtro por Período
      if (dataInicio) {
        const dIni = new Date(dataInicio);
        dIni.setHours(0, 0, 0, 0);
        query = query.gte('criado_em', dIni.toISOString());
      }
      if (dataFim) {
        const dFim = new Date(dataFim);
        dFim.setHours(23, 59, 59, 999);
        query = query.lte('criado_em', dFim.toISOString());
      }

      // Paginação
      const offset = (paginaAtual - 1) * itensPorPagina;
      query = query.range(offset, offset + itensPorPagina - 1);

      const { data, count, error } = await query;
      if (error) throw error;

      let lista = (data as unknown as MovimentacaoRow[]) || [];

      // Filtro de Produto em memória (pois produto está na tabela filha movimentacao_itens)
      if (produtoFiltro) {
        lista = lista.filter(m => m.movimentacao_itens.some(mi => mi.produtos?.id === produtoFiltro));
      }

      // Filtro de Busca Textual
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        lista = lista.filter(m => {
          const itensNomes = m.movimentacao_itens.map(i => i.produtos?.nome || '').join(' ').toLowerCase();
          const itensSkus = m.movimentacao_itens.map(i => i.produtos?.codigo_sku || '').join(' ').toLowerCase();
          const operador = m.usuario_operador?.nome?.toLowerCase() || '';
          const tecnico = m.tecnico_envolvido?.nome?.toLowerCase() || '';
          const just = m.justificativa?.toLowerCase() || '';
          const id = m.id.toLowerCase();

          return (
            itensNomes.includes(term) ||
            itensSkus.includes(term) ||
            operador.includes(term) ||
            tecnico.includes(term) ||
            just.includes(term) ||
            id.includes(term)
          );
        });
      }

      setMovimentacoes(lista);
      setTotalRegistros(count || 0);
    } catch (err: unknown) {
      const error = err as Error;
      setErroGeral('Erro ao carregar movimentações: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.empresaAtivaId, user?.id, isGestor, paginaAtual, tipoFiltro, estoqueFiltro, produtoFiltro, tecnicoFiltro, dataInicio, dataFim, searchTerm]);

  useEffect(() => {
    carregarHistorico();
  }, [carregarHistorico]);

  // Função para executar estorno autorizado
  const handleConfirmarEstorno = async () => {
    if (!movParaEstornar || !user?.empresaAtivaId || !user?.id) return;

    if (!motivoEstorno.trim()) {
      setErroEstorno('O motivo do estorno é obrigatório para conformidade de auditoria.');
      return;
    }

    setIsEstornando(true);
    setErroEstorno('');

    try {
      const chaveIdempotencia = 'estorno_' + crypto.randomUUID();

      const primeiroItem = movParaEstornar.movimentacao_itens[0];

      const { data, error } = await supabase.rpc('processar_movimentacao_estoque', {
        p_tipo: 'ESTORNO',
        p_empresa_id: movParaEstornar.empresa_id,
        p_produto_id: primeiroItem?.produtos?.id,
        p_quantidade: primeiroItem?.quantidade || 1,
        p_movimentacao_estornada_id: movParaEstornar.id,
        p_justificativa: motivoEstorno.trim(),
        p_chave_idempotencia: chaveIdempotencia,
      });

      if (error) throw error;

      setSucessoMsg(`Movimentação #${movParaEstornar.id.slice(0, 8)} estornada com sucesso! Protocolo do estorno: ${data}`);
      setMovParaEstornar(null);
      setDetalheMovimentacao(null);
      setMotivoEstorno('');
      await carregarHistorico();
    } catch (err: unknown) {
      const error = err as Error;
      setErroEstorno('Falha ao processar estorno: ' + error.message);
    } finally {
      setIsEstornando(false);
    }
  };

  const renderBadge = (tipo: string, estornado: boolean) => {
    if (estornado) {
      return <Badge variant="neutral">Estornada</Badge>;
    }

    switch (tipo) {
      case 'RETIRADA': return <Badge variant="info">Retirada</Badge>;
      case 'CONSUMO': return <Badge variant="danger">Consumo</Badge>;
      case 'DEVOLUCAO': return <Badge variant="success">Devolução</Badge>;
      case 'ENTRADA': return <Badge variant="neutral">Entrada</Badge>;
      case 'TRANSFERENCIA': return <Badge variant="info">Transferência</Badge>;
      case 'PERDA': return <Badge variant="danger">Perda</Badge>;
      case 'DANO': return <Badge variant="warning">Dano</Badge>;
      case 'AJUSTE_INVENTARIO': return <Badge variant="warning">Ajuste Inventário</Badge>;
      case 'ESTORNO': return <Badge variant="neutral">Estorno</Badge>;
      default: return <Badge variant="neutral">{tipo}</Badge>;
    }
  };

  const formatarData = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const totalPaginas = Math.ceil(totalRegistros / itensPorPagina) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1>Histórico Geral & Trilha de Auditoria</h1>
          <p style={{ marginTop: '2px' }}>
            Registro imutável (append-only) de todas as movimentações, transferências de custódia e reversões autorizadas.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={carregarHistorico}
          isLoading={isLoading}
        >
          Atualizar Tabela
        </Button>
      </div>

      {erroGeral && <Alert variant="danger" title="Erro">{erroGeral}</Alert>}
      {sucessoMsg && (
        <Alert variant="success" title="Operação Concluída" onClose={() => setSucessoMsg('')}>
          {sucessoMsg}
        </Alert>
      )}

      {/* Barra Completa de Filtros */}
      <Card>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-4)',
        }}>
          <Input
            label="Buscar por Palavra-Chave ou ID"
            placeholder="Protocolo, item, motivo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search size={16} />}
          />

          <Select
            label="Tipo de Movimentação"
            value={tipoFiltro}
            onChange={(e) => {
              setTipoFiltro(e.target.value);
              setPaginaAtual(1);
            }}
            options={[
              { value: 'TODOS', label: 'Todas as Operações' },
              { value: 'ENTRADA', label: 'Entrada de Materiais' },
              { value: 'RETIRADA', label: 'Retiradas para Técnico' },
              { value: 'CONSUMO', label: 'Baixas de Consumo' },
              { value: 'DEVOLUCAO', label: 'Devoluções' },
              { value: 'TRANSFERENCIA', label: 'Transferências' },
              { value: 'PERDA', label: 'Ocorrências de Perda' },
              { value: 'DANO', label: 'Ocorrências de Dano' },
              { value: 'ESTORNO', label: 'Estornos de Operação' },
            ]}
          />

          <Select
            label="Filtrar por Depósito"
            value={estoqueFiltro}
            onChange={(e) => {
              setEstoqueFiltro(e.target.value);
              setPaginaAtual(1);
            }}
            options={[
              { value: '', label: 'Todos os Estoques' },
              ...listaEstoques.map(e => ({ value: e.id, label: e.nome }))
            ]}
          />

          <Select
            label="Filtrar por Produto"
            value={produtoFiltro}
            onChange={(e) => {
              setProdutoFiltro(e.target.value);
              setPaginaAtual(1);
            }}
            options={[
              { value: '', label: 'Todos os Produtos' },
              ...listaProdutos.map(p => ({ value: p.id, label: `${p.nome} [${p.codigo_sku}]` }))
            ]}
          />

          {isGestor && (
            <Select
              label="Filtrar por Técnico"
              value={tecnicoFiltro}
              onChange={(e) => {
                setTecnicoFiltro(e.target.value);
                setPaginaAtual(1);
              }}
              options={[
                { value: '', label: 'Todos os Técnicos' },
                ...listaTecnicos.map(t => ({ value: t.id, label: t.nome }))
              ]}
            />
          )}

          <Input
            label="Data Inicial"
            type="date"
            value={dataInicio}
            onChange={(e) => {
              setDataInicio(e.target.value);
              setPaginaAtual(1);
            }}
          />

          <Input
            label="Data Final"
            type="date"
            value={dataFim}
            onChange={(e) => {
              setDataFim(e.target.value);
              setPaginaAtual(1);
            }}
          />
        </div>
      </Card>

      {/* Tabela do Histórico */}
      <Card>
        {isLoading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Consultando registros de auditoria...
          </div>
        ) : movimentacoes.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Nenhum registro de movimentação encontrado para os filtros selecionados.
          </div>
        ) : (
          <>
            <Table
              keyExtractor={(m) => m.id}
              data={movimentacoes}
              columns={[
                {
                  key: 'protocolo',
                  header: 'Identificador / Data',
                  render: (m) => (
                    <div>
                      <code style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>#{m.id.slice(0, 8)}</code>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        <Clock size={12} /> {formatarData(m.criado_em)}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'tipo',
                  header: 'Operação',
                  render: (m) => renderBadge(m.tipo, m.estornado),
                },
                {
                  key: 'produto',
                  header: 'Produto(s)',
                  render: (m) => (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {m.movimentacao_itens.map((item) => (
                        <div key={item.id} style={{ fontSize: 'var(--font-size-xs)' }}>
                          <strong>{item.produtos?.nome || 'Item'}</strong>{' '}
                          <span style={{ color: 'var(--color-text-muted)' }}>[{item.produtos?.codigo_sku || '—'}]</span>
                        </div>
                      ))}
                    </div>
                  ),
                },
                {
                  key: 'quantidade',
                  header: 'Quantidade',
                  render: (m) => (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {m.movimentacao_itens.map((item) => (
                        <strong key={item.id} style={{ fontSize: 'var(--font-size-xs)' }}>
                          {item.quantidade} {item.produtos?.unidade_medida || 'un'}
                        </strong>
                      ))}
                    </div>
                  ),
                },
                {
                  key: 'fluxo',
                  header: 'Origem ➔ Destino',
                  render: (m) => {
                    let origem = m.estoque_origem?.nome || '—';
                    let destino = m.estoque_destino?.nome || '—';

                    if (m.tipo === 'ENTRADA') origem = 'Fornecedor / Compra';
                    if (m.tipo === 'RETIRADA') destino = m.tecnico_envolvido?.nome ? `Téc. ${m.tecnico_envolvido.nome}` : 'Técnico';
                    if (m.tipo === 'CONSUMO') {
                      origem = m.tecnico_envolvido?.nome ? `Téc. ${m.tecnico_envolvido.nome}` : 'Custódia';
                      destino = 'Aplicação em Serviço';
                    }
                    if (m.tipo === 'DEVOLUCAO') {
                      origem = m.tecnico_envolvido?.nome ? `Téc. ${m.tecnico_envolvido.nome}` : 'Custódia';
                    }
                    if (m.tipo === 'PERDA') {
                      origem = m.tecnico_envolvido?.nome ? `Téc. ${m.tecnico_envolvido.nome}` : 'Custódia';
                      destino = 'Baixa por Perda';
                    }
                    if (m.tipo === 'DANO') {
                      origem = m.tecnico_envolvido?.nome ? `Téc. ${m.tecnico_envolvido.nome}` : 'Custódia';
                      destino = 'Quarentena (Avariado)';
                    }
                    if (m.tipo === 'ESTORNO') {
                      origem = 'Reversão';
                      destino = 'Restauração de Saldos';
                    }

                    return (
                      <span style={{ fontSize: 'var(--font-size-xs)' }}>
                        {origem} ➔ <strong>{destino}</strong>
                      </span>
                    );
                  },
                },
                {
                  key: 'responsavel',
                  header: 'Responsável',
                  render: (m) => (
                    <span style={{ fontSize: 'var(--font-size-xs)' }}>
                      {m.usuario_operador?.nome || 'Sistema'}
                    </span>
                  ),
                },
                {
                  key: 'acoes',
                  header: 'Ações',
                  align: 'right',
                  render: (m) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<FileText size={14} />}
                      onClick={() => setDetalheMovimentacao(m)}
                    >
                      Detalhes
                    </Button>
                  ),
                },
              ]}
            />

            {/* Paginação */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 'var(--space-4)',
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid var(--color-border)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-muted)'
            }}>
              <span>
                Mostrando {movimentacoes.length} de {totalRegistros} movimentações registradas
              </span>

              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={paginaAtual <= 1}
                  onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                  leftIcon={<ChevronLeft size={14} />}
                >
                  Anterior
                </Button>
                <span>Página {paginaAtual} de {totalPaginas}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={paginaAtual >= totalPaginas}
                  onClick={() => setPaginaAtual(p => p + 1)}
                  rightIcon={<ChevronRight size={14} />}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Modal 1: Consulta Completa aos Detalhes da Movimentação */}
      <Modal
        isOpen={!!detalheMovimentacao}
        onClose={() => setDetalheMovimentacao(null)}
        title="Detalhes da Movimentação de Estoque"
      >
        {detalheMovimentacao && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {detalheMovimentacao.estornado && (
              <Alert variant="warning" title="Movimentação Estornada">
                Esta movimentação foi revertida administrativamente. Seus saldos foram restaurados ao estado anterior.
              </Alert>
            )}

            {detalheMovimentacao.tipo === 'ESTORNO' && (
              <Alert variant="info" title="Operação de Estorno">
                Esta transação é uma reversão contábil e física. Referência original:{' '}
                <code>#{detalheMovimentacao.movimentacao_estornada_id?.slice(0, 8)}</code>
              </Alert>
            )}

            {/* Metadados da Operação */}
            <div style={{
              backgroundColor: 'var(--color-surface-hover)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--space-3)',
              fontSize: 'var(--font-size-xs)'
            }}>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Identificador Único (UUID):</span>
                <code style={{ wordBreak: 'break-all' }}>{detalheMovimentacao.id}</code>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Chave de Idempotência:</span>
                <code style={{ wordBreak: 'break-all' }}>{detalheMovimentacao.chave_idempotencia || '—'}</code>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Data e Horário:</span>
                <strong>{formatarData(detalheMovimentacao.criado_em)}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Tipo de Operação:</span>
                {renderBadge(detalheMovimentacao.tipo, detalheMovimentacao.estornado)}
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Operador Responsável:</span>
                <strong>{detalheMovimentacao.usuario_operador?.nome || 'Sistema'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Técnico Envolvido:</span>
                <strong>{detalheMovimentacao.tecnico_envolvido?.nome || '—'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Estoque de Origem:</span>
                <strong>{detalheMovimentacao.estoque_origem?.nome || '—'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>Estoque de Destino:</span>
                <strong>{detalheMovimentacao.estoque_destino?.nome || '—'}</strong>
              </div>
            </div>

            {/* Justificativa / Motivo */}
            {detalheMovimentacao.justificativa && (
              <div style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--font-size-xs)'
              }}>
                <span style={{ color: 'var(--color-text-muted)', display: 'block', marginBottom: '2px' }}>
                  Motivo / Justificativa Registrada:
                </span>
                <p style={{ margin: 0, fontStyle: 'italic' }}>"{detalheMovimentacao.justificativa}"</p>
              </div>
            )}

            {/* Tabela dos Itens Movimentados e Rastreio de Saldos */}
            <div>
              <h4 style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-2)' }}>Itens e Saldos Auditados</h4>
              <Table
                keyExtractor={(item) => item.id}
                data={detalheMovimentacao.movimentacao_itens}
                columns={[
                  {
                    key: 'prod',
                    header: 'Material / SKU',
                    render: (i) => (
                      <div>
                        <strong>{i.produtos?.nome || 'Produto'}</strong>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                          <code>{i.produtos?.codigo_sku}</code>
                        </div>
                      </div>
                    )
                  },
                  {
                    key: 'qtd',
                    header: 'Quantidade',
                    render: (i) => (
                      <strong style={{ color: 'var(--color-accent)' }}>
                        {i.quantidade} {i.produtos?.unidade_medida}
                      </strong>
                    )
                  },
                  {
                    key: 'origem_saldo',
                    header: 'Saldo Origem (Ant ➔ Pós)',
                    render: (i) => (
                      <span style={{ fontSize: 'var(--font-size-xs)' }}>
                        {i.saldo_anterior_origem !== null ? `${i.saldo_anterior_origem} ➔ ${i.saldo_posterior_origem}` : '—'}
                      </span>
                    )
                  },
                  {
                    key: 'destino_saldo',
                    header: 'Saldo Destino (Ant ➔ Pós)',
                    render: (i) => (
                      <span style={{ fontSize: 'var(--font-size-xs)' }}>
                        {i.saldo_anterior_destino !== null ? `${i.saldo_anterior_destino} ➔ ${i.saldo_posterior_destino}` : '—'}
                      </span>
                    )
                  }
                ]}
              />
            </div>

            {/* Ações do Modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-4)' }}>
              <div>
                {isGestor && !detalheMovimentacao.estornado && detalheMovimentacao.tipo !== 'ESTORNO' && (
                  <Button
                    variant="danger"
                    size="sm"
                    leftIcon={<RotateCcw size={14} />}
                    onClick={() => {
                      setMovParaEstornar(detalheMovimentacao);
                      setMotivoEstorno('');
                      setErroEstorno('');
                    }}
                  >
                    Estornar Movimentação
                  </Button>
                )}
              </div>

              <Button
                variant="secondary"
                onClick={() => setDetalheMovimentacao(null)}
              >
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal 2: Confirmação de Estorno */}
      <Modal
        isOpen={!!movParaEstornar}
        onClose={() => setMovParaEstornar(null)}
        title="Estorno de Movimentação"
      >
        {movParaEstornar && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <Alert variant="warning" title="Operação Crítica de Auditoria">
              O estorno inverterá exatamente os saldos e custódias desta operação. Esta ação é definitiva e ficará auditada permanentemente.
            </Alert>

            {erroEstorno && <Alert variant="danger" title="Erro">{erroEstorno}</Alert>}

            <div style={{
              backgroundColor: 'var(--color-surface-hover)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
              fontSize: 'var(--font-size-xs)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)'
            }}>
              <div><strong>Protocolo:</strong> #{movParaEstornar.id.slice(0, 8)}</div>
              <div><strong>Operação:</strong> {movParaEstornar.tipo}</div>
              <div><strong>Data:</strong> {formatarData(movParaEstornar.criado_em)}</div>
              <div>
                <strong>Itens:</strong>{' '}
                {movParaEstornar.movimentacao_itens.map(i => `${i.produtos?.nome} (${i.quantidade} ${i.produtos?.unidade_medida || 'un'})`).join(', ')}
              </div>
            </div>

            <div>
              <Input
                label="Motivo do Estorno (Obrigatório)"
                placeholder="Ex: Lançamento em duplicidade ou erro na quantidade indicada"
                required
                value={motivoEstorno}
                onChange={(e) => setMotivoEstorno(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              <Button
                variant="secondary"
                onClick={() => setMovParaEstornar(null)}
                disabled={isEstornando}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmarEstorno}
                isLoading={isEstornando}
                leftIcon={<AlertTriangle size={16} />}
              >
                Confirmar e Estornar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
