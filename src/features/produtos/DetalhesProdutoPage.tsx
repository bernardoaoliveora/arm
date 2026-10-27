import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Boxes, AlertTriangle, Layers, Building2 } from 'lucide-react';
import { Card, Button, Badge, Table, Alert } from '../../components/ui';
import { supabase } from '../../lib/supabase';

interface ProdutoDetalhe {
  id: string;
  codigo_sku: string;
  nome: string;
  descricao: string | null;
  tipo: 'CONSUMIVEL' | 'REUTILIZAVEL';
  modo_rastreio: string;
  unidade_medida: string;
  estoque_minimo: number;
  ativo: boolean;
  categoria_nome: string;
  empresa_nome: string;
}

interface SaldoEstoqueItem {
  estoque_id: string;
  estoque_nome: string;
  estoque_tipo: string;
  quantidade: number;
}

export const DetalhesProdutoPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [produto, setProduto] = useState<ProdutoDetalhe | null>(null);
  const [saldosPorEstoque, setSaldosPorEstoque] = useState<SaldoEstoqueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const carregarDetalhes = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      // 1. Busca produto com categoria e empresa
      const { data: prodData, error: prodErr } = await supabase
        .from('produtos')
        .select(`
          id,
          codigo_sku,
          nome,
          descricao,
          tipo,
          modo_rastreio,
          unidade_medida,
          estoque_minimo,
          ativo,
          categorias:categoria_id (nome),
          empresas:empresa_id (nome_fantasia)
        `)
        .eq('id', id)
        .single();

      if (prodErr || !prodData) {
        throw new Error('Produto não localizado no banco de dados.');
      }

      const rawData = prodData as any;

      setProduto({
        id: rawData.id,
        codigo_sku: rawData.codigo_sku,
        nome: rawData.nome,
        descricao: rawData.descricao,
        tipo: rawData.tipo,
        modo_rastreio: rawData.modo_rastreio,
        unidade_medida: rawData.unidade_medida,
        estoque_minimo: Number(rawData.estoque_minimo) || 0,
        ativo: rawData.ativo,
        categoria_nome: rawData.categorias?.nome || 'Sem Categoria',
        empresa_nome: rawData.empresas?.nome_fantasia || 'Empresa Geral',
      });

      // 2. Busca saldos deste produto em cada estoque
      const { data: saldosData, error: saldosErr } = await supabase
        .from('estoque_itens')
        .select(`
          quantidade_disponivel,
          estoques:estoque_id (
            id,
            nome,
            tipo
          )
        `)
        .eq('produto_id', id);

      if (saldosErr) throw saldosErr;

      const saldos: SaldoEstoqueItem[] = (saldosData || []).map((row: any) => ({
        estoque_id: row.estoques?.id,
        estoque_nome: row.estoques?.nome || 'Depósito não identificado',
        estoque_tipo: row.estoques?.tipo || 'ALMOXARIFADO_CENTRAL',
        quantidade: Number(row.quantidade_disponivel) || 0,
      }));

      setSaldosPorEstoque(saldos);
    } catch (err: any) {
      console.error('Erro ao carregar detalhes do produto:', err);
      setErrorMsg(err.message || 'Erro ao consultar detalhes do produto.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    carregarDetalhes();
  }, [carregarDetalhes]);

  if (isLoading) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        <div className="spinner" style={{ width: '2rem', height: '2rem', margin: '0 auto var(--space-3)' }} />
        <span>Carregando ficha técnica e saldos do produto...</span>
      </div>
    );
  }

  if (errorMsg || !produto) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<ArrowLeft size={16} />}
          onClick={() => navigate('/produtos')}
        >
          Voltar para Catálogo
        </Button>
        <Alert variant="danger" title="Não Encontrado">
          {errorMsg || 'Produto inexistente.'}
        </Alert>
      </div>
    );
  }

  const saldoTotal = saldosPorEstoque.reduce((acc, curr) => acc + curr.quantidade, 0);
  const isAbaixoDoMinimo = saldoTotal <= produto.estoque_minimo;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Voltar e Cabeçalho */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<ArrowLeft size={16} />}
          onClick={() => navigate('/produtos')}
          style={{ marginBottom: 'var(--space-3)' }}
        >
          Voltar para Catálogo
        </Button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <span className="text-mono font-bold" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                {produto.codigo_sku}
              </span>
              <Badge variant={produto.tipo === 'CONSUMIVEL' ? 'info' : 'neutral'}>
                {produto.tipo === 'CONSUMIVEL' ? 'Consumível' : 'Ferramenta Reutilizável'}
              </Badge>
              <Badge variant="neutral">
                {produto.modo_rastreio === 'INDIVIDUAL_SERIALIZADO' ? 'Serializado por Patrimônio' : 'Qtd Agregada'}
              </Badge>
              <Badge variant={produto.ativo ? 'success' : 'danger'}>
                {produto.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <h1 style={{ marginTop: 'var(--space-1)' }}>{produto.nome}</h1>
            <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-1)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              <span><Layers size={12} style={{ display: 'inline' }} /> Categoria: <strong>{produto.categoria_nome}</strong></span>
              <span><Building2 size={12} style={{ display: 'inline' }} /> Empresa: <strong>{produto.empresa_nome}</strong></span>
            </div>
          </div>

          {/* Painel de Saldo Consolidado */}
          <div style={{
            display: 'flex',
            gap: 'var(--space-4)',
            backgroundColor: 'var(--color-surface)',
            padding: 'var(--space-3) var(--space-5)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            alignItems: 'center',
          }}>
            <div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'block' }}>
                Saldo Total nos Estoques
              </span>
              <strong style={{
                fontSize: 'var(--font-size-2xl)',
                color: isAbaixoDoMinimo ? 'var(--color-warning)' : 'var(--color-success)',
              }}>
                {saldoTotal} {produto.unidade_medida}
              </strong>
              {isAbaixoDoMinimo && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', color: 'var(--color-warning)', fontSize: '0.72rem' }}>
                  <AlertTriangle size={12} /> Abaixo do mínimo ({produto.estoque_minimo} {produto.unidade_medida})
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Descrição do Produto se houver */}
      {produto.descricao && (
        <Card title="Especificações Técnicas">
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {produto.descricao}
          </p>
        </Card>
      )}

      {/* Tabela de Distribuição de Saldos por Estoque */}
      <Card
        title="Distribuição do Saldo nos Depósitos Físicos"
        subtitle="Visualização consolidada de saldos armazenados por almoxarifado e viatura"
      >
        {saldosPorEstoque.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Boxes size={36} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <p>Este produto ainda não possui saldos registrados em depósitos.</p>
            <span style={{ fontSize: 'var(--font-size-xs)' }}>
              Novos saldos serão contabilizados através de movimentações de entrada e transferências.
            </span>
          </div>
        ) : (
          <Table
            keyExtractor={(i) => i.estoque_id}
            data={saldosPorEstoque}
            columns={[
              {
                key: 'estoque_nome',
                header: 'Local de Armazenagem',
                render: (r) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Boxes size={16} style={{ color: 'var(--color-accent)' }} />
                    <div>
                      <strong>{r.estoque_nome}</strong>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        {r.estoque_tipo}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'quantidade',
                header: 'Saldo Físico',
                render: (r) => (
                  <strong style={{ fontSize: 'var(--font-size-base)' }}>
                    {r.quantidade} {produto.unidade_medida}
                  </strong>
                ),
              },
              {
                key: 'status',
                header: 'Disponibilidade',
                render: (r) => (
                  <Badge variant={r.quantidade > 0 ? 'success' : 'neutral'}>
                    {r.quantidade > 0 ? 'Disponível para Operação' : 'Esgotado neste depósito'}
                  </Badge>
                ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
};
