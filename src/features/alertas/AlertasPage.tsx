import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, RefreshCw, Search, ShieldCheck, PlusCircle } from 'lucide-react';
import { Card, Button, Table, Badge, Alert, Input, Select } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';

interface AlertaEstoqueRow {
  produto_id: string;
  codigo_sku: string;
  produto_nome: string;
  tipo_produto: string;
  unidade_medida: string;
  estoque_minimo: number;
  saldo_disponivel_deposito: number;
  saldo_em_custodia_tecnica: number;
  deficit_reposicao: number;
  nivel_urgencia: 'CRITICO' | 'ALERTA' | 'ATENCAO';
  estoques_detalhe: Array<{
    estoque_id: string;
    estoque_nome: string;
    saldo: number;
  }>;
}

export const AlertasPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [alertas, setAlertas] = useState<AlertaEstoqueRow[]>([]);
  const [listaEstoques, setListaEstoques] = useState<Array<{ id: string; nome: string }>>([]);
  const [estoqueFiltro, setEstoqueFiltro] = useState<string>('');
  const [nivelFiltro, setNivelFiltro] = useState<string>('TODOS');
  const [busca, setBusca] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string>('');

  // Carregar lista de estoques para o filtro
  useEffect(() => {
    async function carregarEstoques() {
      if (!user?.empresaAtivaId) return;
      try {
        const { data } = await supabase
          .from('estoques')
          .select('id, nome')
          .eq('empresa_id', user.empresaAtivaId)
          .eq('ativo', true)
          .order('nome');

        if (data) setListaEstoques(data);
      } catch (err: unknown) {
        console.error('Erro ao carregar estoques:', err);
      }
    }
    carregarEstoques();
  }, [user?.empresaAtivaId]);

  // Carregar alertas de estoque via RPC do banco
  const carregarAlertas = useCallback(async () => {
    if (!user?.empresaAtivaId) return;

    setIsLoading(true);
    setErro('');

    try {
      const { data, error } = await supabase.rpc('obter_alertas_estoque', {
        p_empresa_id: user.empresaAtivaId,
        p_estoque_id: estoqueFiltro || null,
      });

      if (error) throw error;

      setAlertas((data as AlertaEstoqueRow[]) || []);
    } catch (err: unknown) {
      const error = err as Error;
      setErro('Erro ao carregar alertas de estoque: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.empresaAtivaId, estoqueFiltro]);

  useEffect(() => {
    carregarAlertas();
  }, [carregarAlertas]);

  // Filtragem local por nível e termo de busca
  const filtrados = alertas.filter((a) => {
    const matchesNivel = nivelFiltro === 'TODOS' || a.nivel_urgencia === nivelFiltro;
    const term = busca.toLowerCase();
    const matchesBusca =
      a.produto_nome.toLowerCase().includes(term) ||
      a.codigo_sku.toLowerCase().includes(term);

    return matchesNivel && matchesBusca;
  });

  const renderBadgeNivel = (nivel: string) => {
    switch (nivel) {
      case 'CRITICO':
        return <Badge variant="danger">Esgotado (Crítico)</Badge>;
      case 'ALERTA':
        return <Badge variant="warning">Abaixo do Mínimo</Badge>;
      case 'ATENCAO':
        return <Badge variant="neutral">Próximo do Mínimo</Badge>;
      default:
        return <Badge variant="neutral">{nivel}</Badge>;
    }
  };

  const totalCriticos = alertas.filter(a => a.nivel_urgencia === 'CRITICO').length;
  const totalAbaixoMinimo = alertas.filter(a => a.nivel_urgencia === 'ALERTA').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1>Alertas de Estoque Baixo e Ponto de Pedido</h1>
          <p style={{ marginTop: '2px' }}>
            Identificação em tempo real de materiais com saldo disponível insuficiente nos depósitos físicos.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />}
            onClick={carregarAlertas}
            disabled={isLoading}
          >
            Atualizar Alertas
          </Button>

          <Button
            variant="primary"
            size="sm"
            leftIcon={<PlusCircle size={16} />}
            onClick={() => navigate('/movimentacoes/entrada')}
          >
            Registrar Entrada
          </Button>
        </div>
      </div>

      {erro && <Alert variant="danger" title="Atenção">{erro}</Alert>}

      {/* Alerta de Destaque das Urgências */}
      {totalCriticos > 0 || totalAbaixoMinimo > 0 ? (
        <Alert variant="warning" title="Atenção Operacional">
          Existem <strong>{totalCriticos} produtos esgotados (saldo zero)</strong> e{' '}
          <strong>{totalAbaixoMinimo} produtos abaixo do ponto de pedido</strong> nos depósitos.
          <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', marginTop: '4px', opacity: 0.9 }}>
            * Nota: Materiais sob responsabilidade dos técnicos em campo são informados separadamente e não compõem a disponibilidade para novos atendimentos.
          </span>
        </Alert>
      ) : (
        <Alert variant="success" title="Níveis de Estoque Normais">
          Todos os produtos ativos com ponto de pedido configurado estão com saldo disponível satisfatório nos depósitos.
        </Alert>
      )}

      {/* Barra de Filtros */}
      <Card>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 'var(--space-4)',
        }}>
          <Input
            label="Buscar por Nome ou SKU"
            placeholder="Digite para pesquisar..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            leftIcon={<Search size={16} />}
          />

          <Select
            label="Nível de Criticidade"
            value={nivelFiltro}
            onChange={(e) => setNivelFiltro(e.target.value)}
            options={[
              { value: 'TODOS', label: 'Todos os Níveis' },
              { value: 'CRITICO', label: 'Crítico (Saldo Zerado)' },
              { value: 'ALERTA', label: 'Alerta (Abaixo do Mínimo)' },
              { value: 'ATENCAO', label: 'Atenção (Próximo do Mínimo)' },
            ]}
          />

          <Select
            label="Filtrar por Depósito"
            value={estoqueFiltro}
            onChange={(e) => setEstoqueFiltro(e.target.value)}
            options={[
              { value: '', label: 'Todos os Depósitos' },
              ...listaEstoques.map(e => ({ value: e.id, label: e.nome }))
            ]}
          />
        </div>
      </Card>

      {/* Tabela de Alertas */}
      <Card>
        {isLoading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            Calculando saldos e conferindo pontos de reposição...
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <ShieldCheck size={36} style={{ color: 'var(--color-success)', margin: '0 auto var(--space-2)' }} />
            <p>Nenhum produto em condição de alerta para os filtros informados.</p>
          </div>
        ) : (
          <Table
            keyExtractor={(a) => a.produto_id}
            data={filtrados}
            columns={[
              {
                key: 'urgencia',
                header: 'Criticidade',
                render: (a) => renderBadgeNivel(a.nivel_urgencia)
              },
              {
                key: 'sku',
                header: 'Código SKU',
                render: (a) => <span className="text-mono" style={{ fontWeight: 600 }}>{a.codigo_sku}</span>
              },
              {
                key: 'produto',
                header: 'Material / Tipo',
                render: (a) => (
                  <div>
                    <strong>{a.produto_nome}</strong>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      Tipo: {a.tipo_produto}
                    </div>
                  </div>
                )
              },
              {
                key: 'saldoDisponivel',
                header: 'Disponível Depósitos',
                render: (a) => (
                  <div>
                    <strong style={{
                      color: a.saldo_disponivel_deposito === 0 ? 'var(--color-danger)' : 'var(--color-warning)',
                      fontSize: 'var(--font-size-base)'
                    }}>
                      {a.saldo_disponivel_deposito} {a.unidade_medida}
                    </strong>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      Saldo físico central
                    </div>
                  </div>
                )
              },
              {
                key: 'custodiaTecnica',
                header: 'Em Custódia Técnica',
                render: (a) => (
                  <div>
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
                      {a.saldo_em_custodia_tecnica} {a.unidade_medida}
                    </span>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      Em campo (não disponível)
                    </div>
                  </div>
                )
              },
              {
                key: 'estoqueMinimo',
                header: 'Ponto Mínimo',
                render: (a) => (
                  <span>{a.estoque_minimo} {a.unidade_medida}</span>
                )
              },
              {
                key: 'deficit',
                header: 'Déficit de Compra',
                render: (a) => (
                  <strong style={{ color: 'var(--color-danger)' }}>
                    +{a.deficit_reposicao} {a.unidade_medida}
                  </strong>
                )
              },
              {
                key: 'acoes',
                header: 'Ação',
                align: 'right',
                render: () => (
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<ShoppingCart size={14} />}
                    onClick={() => navigate('/movimentacoes/entrada')}
                  >
                    Repor
                  </Button>
                )
              }
            ]}
          />
        )}
      </Card>
    </div>
  );
};
