import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  Layers,
  Briefcase,
  TrendingDown,
  AlertTriangle,
  ArrowRight,
  PlusCircle,
  Flame,
  CornerDownLeft,
  Clock,
  RefreshCw,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { KPICard, Card, Button, Badge, Table, Select, Alert } from '../../components/ui';
import { supabase } from '../../lib/supabase';

interface ItemEstoqueDetalhe {
  produto_id: string;
  nome: string;
  codigo_sku: string;
  unidade_medida: string;
  tipo: string;
  quantidade_disponivel: number;
}

interface EstoqueSaldoAgrupado {
  estoque_id: string;
  estoque_nome: string;
  estoque_tipo: string;
  total_skus_disponiveis: number;
  itens: ItemEstoqueDetalhe[];
}

interface ItemCustodiaDetalhe {
  produto_id: string;
  nome: string;
  codigo_sku: string;
  unidade_medida: string;
  tipo: string;
  quantidade_posse: number;
}

interface CustodiaTecnicoAgrupado {
  tecnico_id: string;
  tecnico_nome: string;
  tecnico_email: string;
  total_itens_distintos: number;
  itens: ItemCustodiaDetalhe[];
}

interface ItemConsumoPeriodo {
  produto_id: string;
  nome: string;
  codigo_sku: string;
  unidade_medida: string;
  quantidade_total: number;
}

interface MetricasDashboard {
  periodo: {
    inicio: string;
    fim: string;
  };
  resumo_produtos: {
    total_cadastrados: number;
    consumiveis: number;
    ferramentas: number;
    abaixo_minimo: number;
  };
  saldos_por_estoque: EstoqueSaldoAgrupado[];
  custodia_tecnicos: CustodiaTecnicoAgrupado[];
  consumo: {
    total_eventos: number;
    itens: ItemConsumoPeriodo[];
  };
  perdas_e_danos: {
    total_perdas: number;
    total_danos: number;
    recentes: Array<{
      id: string;
      tipo: string;
      produto_nome: string;
      codigo_sku: string;
      unidade_medida: string;
      quantidade: number;
      motivo: string;
      situacao_item: string;
      tecnico_nome: string | null;
      criado_em: string;
    }>;
  };
}

interface MovimentacaoRecente {
  id: string;
  tipo: string;
  criado_em: string;
  justificativa: string | null;
  usuario_operador: { nome: string } | null;
  tecnico_envolvido: { nome: string } | null;
  estoque_origem: { nome: string } | null;
  estoque_destino: { nome: string } | null;
  movimentacao_itens: Array<{
    id: string;
    quantidade: number;
    produtos: {
      nome: string;
      codigo_sku: string;
      unidade_medida: string;
    } | null;
  }>;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isGestor = user?.perfil === 'ADMINISTRADOR' || user?.perfil === 'GERENTE';

  // Filtros
  const [periodoFiltro, setPeriodoFiltro] = useState<'30d' | '7d' | 'hoje' | 'mes_atual'>('mes_atual');
  const [estoqueFiltro, setEstoqueFiltro] = useState<string>('');
  const [tecnicoFiltro, setTecnicoFiltro] = useState<string>('');

  // Listas de apoio para selects
  const [listaEstoques, setListaEstoques] = useState<Array<{ id: string; nome: string }>>([]);
  const [listaTecnicos, setListaTecnicos] = useState<Array<{ id: string; nome: string }>>([]);

  // Estados dos dados
  const [metricas, setMetricas] = useState<MetricasDashboard | null>(null);
  const [movimentacoesRecentes, setMovimentacoesRecentes] = useState<MovimentacaoRecente[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string>('');

  // 1. Carregar listas para os selects de filtros
  useEffect(() => {
    async function carregarFiltros() {
      if (!user?.empresaAtivaId) return;

      try {
        const [estRes, tecRes] = await Promise.all([
          supabase
            .from('estoques')
            .select('id, nome')
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
        if (tecRes.data) setListaTecnicos(tecRes.data);
      } catch (err: unknown) {
        console.error('Erro ao carregar filtros de apoio:', err);
      }
    }

    carregarFiltros();
  }, [user?.empresaAtivaId, isGestor]);

  // 2. Carregar Métricas do Dashboard via RPC
  const carregarDashboard = useCallback(async () => {
    if (!user?.empresaAtivaId) return;

    setIsLoading(true);
    setErro('');

    try {
      // Calcular datas com base no período selecionado
      const agora = new Date();
      let inicio = new Date();

      if (periodoFiltro === 'hoje') {
        inicio.setHours(0, 0, 0, 0);
      } else if (periodoFiltro === '7d') {
        inicio.setDate(agora.getDate() - 7);
      } else if (periodoFiltro === '30d') {
        inicio.setDate(agora.getDate() - 30);
      } else if (periodoFiltro === 'mes_atual') {
        inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
      }

      // Parâmetros para a RPC
      const rpcParams = {
        p_empresa_id: user.empresaAtivaId,
        p_estoque_id: estoqueFiltro || null,
        p_tecnico_id: isGestor ? (tecnicoFiltro || null) : user.id,
        p_data_inicio: inicio.toISOString(),
        p_data_fim: agora.toISOString()
      };

      // Executa RPC das métricas e query das movimentações recentes em paralelo
      const [metricasRes, movsRes] = await Promise.all([
        supabase.rpc('obter_metricas_dashboard', rpcParams),
        (() => {
          let q = supabase
            .from('movimentacoes')
            .select(`
              id,
              tipo,
              criado_em,
              justificativa,
              usuario_operador:usuario_operador_id (nome),
              tecnico_envolvido:tecnico_envolvido_id (nome),
              estoque_origem:estoque_origem_id (nome),
              estoque_destino:estoque_destino_id (nome),
              movimentacao_itens (
                id,
                quantidade,
                produtos (nome, codigo_sku, unidade_medida)
              )
            `)
            .eq('empresa_id', user.empresaAtivaId)
            .order('criado_em', { ascending: false })
            .limit(8);

          if (!isGestor) {
            q = q.eq('tecnico_envolvido_id', user.id);
          } else if (tecnicoFiltro) {
            q = q.eq('tecnico_envolvido_id', tecnicoFiltro);
          }

          if (estoqueFiltro) {
            q = q.or(`estoque_origem_id.eq.${estoqueFiltro},estoque_destino_id.eq.${estoqueFiltro}`);
          }

          return q;
        })()
      ]);

      if (metricasRes.error) throw metricasRes.error;
      if (movsRes.error) throw movsRes.error;

      setMetricas(metricasRes.data as MetricasDashboard);
      setMovimentacoesRecentes((movsRes.data as unknown as MovimentacaoRecente[]) || []);
    } catch (err: unknown) {
      const error = err as Error;
      setErro('Erro ao carregar dados do dashboard: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.empresaAtivaId, user?.id, isGestor, periodoFiltro, estoqueFiltro, tecnicoFiltro]);

  useEffect(() => {
    carregarDashboard();
  }, [carregarDashboard]);

  // Formatação de data/hora
  const formatarData = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const renderBadge = (tipo: string) => {
    switch (tipo) {
      case 'RETIRADA': return <Badge variant="info">Retirada</Badge>;
      case 'CONSUMO': return <Badge variant="danger">Consumo</Badge>;
      case 'DEVOLUCAO': return <Badge variant="success">Devolução</Badge>;
      case 'ENTRADA': return <Badge variant="neutral">Entrada</Badge>;
      case 'TRANSFERENCIA': return <Badge variant="info">Transferência</Badge>;
      case 'PERDA': return <Badge variant="danger">Perda</Badge>;
      case 'DANO': return <Badge variant="warning">Dano</Badge>;
      case 'ESTORNO': return <Badge variant="neutral">Estorno</Badge>;
      default: return <Badge variant="neutral">{tipo}</Badge>;
    }
  };

  // Resumo de contagem de custódia
  const totalItensCustodia = metricas?.custodia_tecnicos.reduce((acc, t) => acc + t.total_itens_distintos, 0) || 0;
  const totalSkusDisponiveis = metricas?.saldos_por_estoque.reduce((acc, e) => acc + e.total_skus_disponiveis, 0) || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Cabeçalho da Página */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-2xl)' }}>
            {isGestor ? 'Painel de Gestão de Estoque e Custódia' : `Minha Mochila de Trabalho`}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            {isGestor
              ? 'Indicadores consolidados em tempo real com rastreabilidade física de depósitos e equipes.'
              : `Materiais e ferramentas sob a responsabilidade de ${user?.nome}.`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />}
            onClick={carregarDashboard}
            disabled={isLoading}
          >
            Atualizar
          </Button>

          {isGestor ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<PlusCircle size={16} />}
              onClick={() => navigate('/movimentacoes/retirada')}
            >
              Registrar Retirada
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<PlusCircle size={16} />}
              onClick={() => navigate('/movimentacoes/retirada')}
            >
              Pegar Material
            </Button>
          )}
        </div>
      </div>

      {erro && <Alert variant="danger" title="Atenção">{erro}</Alert>}

      {/* Barra de Filtros do Dashboard */}
      <Card>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
          gap: 'var(--space-4)',
          alignItems: 'flex-end'
        }}>
          <Select
            label="Período de Análise"
            value={periodoFiltro}
            onChange={(e) => setPeriodoFiltro(e.target.value as any)}
            options={[
              { value: 'hoje', label: 'Hoje (Últimas 24h)' },
              { value: '7d', label: 'Últimos 7 dias' },
              { value: 'mes_atual', label: 'Mês Atual' },
              { value: '30d', label: 'Últimos 30 dias' },
            ]}
          />

          <Select
            label="Filtrar por Depósito"
            value={estoqueFiltro}
            onChange={(e) => setEstoqueFiltro(e.target.value)}
            options={[
              { value: '', label: 'Todos os Estoques' },
              ...listaEstoques.map(e => ({ value: e.id, label: e.nome }))
            ]}
          />

          {isGestor && (
            <Select
              label="Filtrar por Técnico"
              value={tecnicoFiltro}
              onChange={(e) => setTecnicoFiltro(e.target.value)}
              options={[
                { value: '', label: 'Todos os Técnicos' },
                ...listaTecnicos.map(t => ({ value: t.id, label: t.nome }))
              ]}
            />
          )}

          <div style={{ display: 'flex', alignItems: 'center', height: '38px' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              {isLoading ? 'Calculando indicadores...' : 'Métricas sincronizadas com a base real.'}
            </span>
          </div>
        </div>
      </Card>

      {/* Grid de KPIs Consolidados */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
        gap: 'var(--space-4)',
      }}>
        {/* KPI 1: Produtos Cadastrados */}
        <KPICard
          title="Produtos Cadastrados"
          value={isLoading ? '...' : `${metricas?.resumo_produtos.total_cadastrados || 0} SKUs`}
          subtext={`${metricas?.resumo_produtos.consumiveis || 0} consumíveis | ${metricas?.resumo_produtos.ferramentas || 0} reutilizáveis`}
          icon={<Package size={18} />}
        />

        {/* KPI 2: Disponibilidade em Estoques */}
        <KPICard
          title="Disponibilidade em Depósitos"
          value={isLoading ? '...' : `${totalSkusDisponiveis} itens estocados`}
          subtext={`Distribuídos em ${metricas?.saldos_por_estoque.length || 0} depósitos ativos`}
          icon={<Layers size={18} />}
        />

        {/* KPI 3: Custódia com Técnicos */}
        <KPICard
          title={isGestor ? "Em Posse com Técnicos" : "Na Minha Mochila"}
          value={isLoading ? '...' : `${totalItensCustodia} linhas em campo`}
          subtext={isGestor ? `Sob custódia de ${metricas?.custodia_tecnicos.length || 0} técnicos` : 'Itens sob sua guarda legal'}
          icon={<Briefcase size={18} />}
        />

        {/* KPI 4: Consumo no Período */}
        <KPICard
          title="Consumo no Período"
          value={isLoading ? '...' : `${metricas?.consumo.total_eventos || 0} baixas`}
          subtext={`${metricas?.consumo.itens.length || 0} tipos de materiais aplicados`}
          icon={<TrendingDown size={18} />}
        />

        {/* KPI 5: Perdas e Danos */}
        <KPICard
          title="Perdas e Avarias"
          value={isLoading ? '...' : `${(metricas?.perdas_e_danos.total_perdas || 0) + (metricas?.perdas_e_danos.total_danos || 0)} ocorrências`}
          subtext={`${metricas?.perdas_e_danos.total_perdas || 0} baixas por perda | ${metricas?.perdas_e_danos.total_danos || 0} avarias`}
          icon={<ShieldAlert size={18} />}
          variant={(metricas?.perdas_e_danos.total_perdas || 0) > 0 ? 'warning' : 'default'}
        />

        {/* KPI 6: Alerta de Estoque Baixo */}
        <KPICard
          title="Estoque Abaixo do Mínimo"
          value={isLoading ? '...' : `${metricas?.resumo_produtos.abaixo_minimo || 0} produtos`}
          subtext="Exclui custódia de técnicos da contagem"
          icon={<AlertTriangle size={18} />}
          variant={(metricas?.resumo_produtos.abaixo_minimo || 0) > 0 ? 'warning' : 'default'}
          badge={
            (metricas?.resumo_produtos.abaixo_minimo || 0) > 0 ? (
              <span onClick={() => navigate('/alertas')} style={{ cursor: 'pointer' }}>
                <Badge variant="warning">Ver Alertas</Badge>
              </span>
            ) : undefined
          }
        />
      </div>

      {/* Seção 1: Quantidade Disponível por Estoque (Sem somar unidades incompatíveis) */}
      <Card
        title="Disponibilidade Física por Depósito"
        subtitle="Saldos armazenados nos estoques físicos discriminados por produto e unidade de medida oficial"
      >
        {isLoading ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Carregando depósitos...
          </div>
        ) : (metricas?.saldos_por_estoque.length || 0) === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Nenhum depósito cadastrado ou ativo.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {metricas?.saldos_por_estoque.map((est) => (
              <div
                key={est.estoque_id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-4)',
                  backgroundColor: 'var(--color-surface)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <div>
                    <h3 style={{ fontSize: 'var(--font-size-md)' }}>{est.estoque_nome}</h3>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      Tipo: {est.estoque_tipo} • {est.total_skus_disponiveis} produtos com saldo positivo
                    </span>
                  </div>
                  <Badge variant="neutral">{est.estoque_tipo}</Badge>
                </div>

                {est.itens.length === 0 ? (
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                    Nenhum item com saldo positivo neste depósito.
                  </p>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))',
                    gap: 'var(--space-2)'
                  }}>
                    {est.itens.map(item => (
                      <div
                        key={item.produto_id}
                        style={{
                          padding: 'var(--space-2) var(--space-3)',
                          backgroundColor: 'var(--color-surface-hover)',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: 'var(--font-size-xs)'
                        }}
                      >
                        <div>
                          <strong>{item.nome}</strong>
                          <div style={{ color: 'var(--color-text-muted)' }}><code>{item.codigo_sku}</code></div>
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>
                          {item.quantidade_disponivel} {item.unidade_medida}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Seção 2: Quantidade sob Responsabilidade dos Técnicos & Consumo do Período */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
        gap: 'var(--space-4)',
      }}>
        {/* Materiais em Custódia com Técnicos */}
        <Card
          title={isGestor ? "Materiais sob Custódia dos Técnicos" : "Itens sob Minha Guarda"}
          subtitle="Equipamentos e consumíveis em trânsito com equipes técnicas de campo"
        >
          {isLoading ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Carregando custódia...
            </div>
          ) : (metricas?.custodia_tecnicos.length || 0) === 0 ? (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', padding: 'var(--space-4)' }}>
              Nenhum item sob custódia técnica no momento.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxHeight: '340px', overflowY: 'auto' }}>
              {metricas?.custodia_tecnicos.map(tec => (
                <div
                  key={tec.tecnico_id}
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--color-surface-hover)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                    <strong>{tec.tecnico_nome}</strong>
                    <Badge variant="info">{tec.total_itens_distintos} itens</Badge>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {tec.itens.map(item => (
                      <div key={item.produto_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>{item.nome} ({item.codigo_sku}):</span>
                        <strong>{item.quantidade_posse} {item.unidade_medida}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Consumo no Período Agrupado por Unidade de Medida */}
        <Card
          title="Consumo Consolidado no Período"
          subtitle="Total de insumos baixados em serviços (sem soma de unidades incompatíveis)"
        >
          {isLoading ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              Calculando baixas de consumo...
            </div>
          ) : (metricas?.consumo.itens.length || 0) === 0 ? (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', padding: 'var(--space-4)' }}>
              Nenhum consumo de material registrado no período selecionado.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: '340px', overflowY: 'auto' }}>
              {metricas?.consumo.itens.map((c) => (
                <div
                  key={c.produto_id}
                  style={{
                    padding: 'var(--space-3)',
                    borderBottom: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 'var(--font-size-sm)'
                  }}
                >
                  <div>
                    <strong>{c.nome}</strong>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      SKU: {c.codigo_sku}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-md)' }}>
                      {c.quantidade_total}
                    </strong>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginLeft: '4px' }}>
                      {c.unidade_medida}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Ações Rápidas de Campo para Técnicos */}
      {!isGestor && (
        <Card title="Ações Rápidas de Campo">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
            gap: 'var(--space-3)',
          }}>
            <Button
              variant="secondary"
              leftIcon={<PlusCircle size={18} style={{ color: 'var(--color-accent)' }} />}
              onClick={() => navigate('/movimentacoes/retirada')}
              style={{ justifyContent: 'flex-start', padding: 'var(--space-4)' }}
            >
              <div style={{ textAlign: 'left' }}>
                <strong>Retirar Material</strong>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Do depósito para a mochila</div>
              </div>
            </Button>

            <Button
              variant="secondary"
              leftIcon={<Flame size={18} style={{ color: 'var(--color-danger)' }} />}
              onClick={() => navigate('/movimentacoes/utilizacao')}
              style={{ justifyContent: 'flex-start', padding: 'var(--space-4)' }}
            >
              <div style={{ textAlign: 'left' }}>
                <strong>Apontar Consumo</strong>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Dar baixa no que foi usado</div>
              </div>
            </Button>

            <Button
              variant="secondary"
              leftIcon={<CornerDownLeft size={18} style={{ color: 'var(--color-success)' }} />}
              onClick={() => navigate('/movimentacoes/devolucao')}
              style={{ justifyContent: 'flex-start', padding: 'var(--space-4)' }}
            >
              <div style={{ textAlign: 'left' }}>
                <strong>Devolver ao Depósito</strong>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Ferramentas ou sobras</div>
              </div>
            </Button>
          </div>
        </Card>
      )}

      {/* Seção 3: Movimentações Recentes */}
      <Card
        title="Últimas Movimentações Registradas"
        subtitle="Histórico recente de transações atômicas de entradas, retiradas, consumos e devoluções"
        action={
          <Button
            variant="ghost"
            size="sm"
            rightIcon={<ArrowRight size={14} />}
            onClick={() => navigate('/historico')}
          >
            Ver Histórico Completo
          </Button>
        }
      >
        {isLoading ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Carregando movimentações recentes...
          </div>
        ) : movimentacoesRecentes.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Nenhuma movimentação registrada para os filtros selecionados.
          </div>
        ) : (
          <Table
            keyExtractor={(item) => item.id}
            data={movimentacoesRecentes}
            columns={[
              {
                key: 'data',
                header: 'Data / Registro',
                render: (r) => (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    <Clock size={12} /> {formatarData(r.criado_em)}
                  </span>
                )
              },
              {
                key: 'tipo',
                header: 'Operação',
                render: (r) => renderBadge(r.tipo)
              },
              {
                key: 'item',
                header: 'Item Movimentado',
                render: (r) => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {r.movimentacao_itens.map(mi => (
                      <div key={mi.id} style={{ fontSize: 'var(--font-size-xs)' }}>
                        <strong>{mi.produtos?.nome || 'Item'}</strong>{' '}
                        <span style={{ color: 'var(--color-text-muted)' }}>[{mi.produtos?.codigo_sku || '—'}]</span>
                      </div>
                    ))}
                  </div>
                )
              },
              {
                key: 'qtd',
                header: 'Qtd',
                render: (r) => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {r.movimentacao_itens.map(mi => (
                      <strong key={mi.id} style={{ fontSize: 'var(--font-size-xs)' }}>
                        {mi.quantidade} {mi.produtos?.unidade_medida || 'un'}
                      </strong>
                    ))}
                  </div>
                )
              },
              {
                key: 'origem_destino',
                header: 'Fluxo (Origem ➔ Destino)',
                render: (r) => {
                  let origem = r.estoque_origem?.nome || '—';
                  let destino = r.estoque_destino?.nome || '—';

                  if (r.tipo === 'ENTRADA') origem = 'Fornecedor';
                  if (r.tipo === 'RETIRADA') destino = r.tecnico_envolvido?.nome ? `Téc. ${r.tecnico_envolvido.nome}` : 'Técnico';
                  if (r.tipo === 'CONSUMO') {
                    origem = r.tecnico_envolvido?.nome ? `Téc. ${r.tecnico_envolvido.nome}` : 'Custódia';
                    destino = 'Aplicação em Serviço';
                  }
                  if (r.tipo === 'DEVOLUCAO') {
                    origem = r.tecnico_envolvido?.nome ? `Téc. ${r.tecnico_envolvido.nome}` : 'Custódia';
                  }

                  return (
                    <span style={{ fontSize: 'var(--font-size-xs)' }}>
                      {origem} ➔ <strong>{destino}</strong>
                    </span>
                  );
                }
              },
              {
                key: 'responsavel',
                header: 'Operador',
                render: (r) => (
                  <span style={{ fontSize: 'var(--font-size-xs)' }}>
                    {r.usuario_operador?.nome || 'Sistema'}
                  </span>
                )
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
};
