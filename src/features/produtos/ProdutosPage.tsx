import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  AlertTriangle,
  Eye,
  Edit2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Package,
  Layers,
  AlertCircle
} from 'lucide-react';
import { Card, Button, Input, Select, Table, Badge, Modal, Alert } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';

interface ProdutoItem {
  id: string;
  empresa_id: string;
  categoria_id: string | null;
  categoria_nome: string;
  codigo_sku: string;
  nome: string;
  descricao: string | null;
  tipo: 'CONSUMIVEL' | 'REUTILIZAVEL';
  modo_rastreio: 'QUANTIDADE_AGREGADA' | 'INDIVIDUAL_SERIALIZADO';
  unidade_medida: string;
  permite_fracionamento: boolean;
  estoque_minimo: number;
  ativo: boolean;
  saldo_disponivel: number;
}

interface CategoriaOption {
  id: string;
  nome: string;
}

const UNIDADES_MEDIDA = [
  { value: 'UN', label: 'Unidade (UN)' },
  { value: 'M', label: 'Metros (M)' },
  { value: 'CX', label: 'Caixa (CX)' },
  { value: 'KG', label: 'Quilograma (KG)' },
  { value: 'L', label: 'Litro (L)' },
  { value: 'PAR', label: 'Par (PAR)' },
  { value: 'PCT', label: 'Pacote (PCT)' },
  { value: 'ROLO', label: 'Rolo (ROLO)' },
];

export const ProdutosPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [produtos, setProdutos] = useState<ProdutoItem[]>([]);
  const [categorias, setCategorias] = useState<CategoriaOption[]>([]);
  const [empresas, setEmpresas] = useState<{ id: string; nome_fantasia: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<string>('TODOS');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('TODAS');
  const [statusFiltro, setStatusFiltro] = useState<string>('TODOS');
  const [apenasEstoqueBaixo, setApenasEstoqueBaixo] = useState(false);

  // Mensagens
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modais de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal de Desativação
  const [confirmToggleProduto, setConfirmToggleProduto] = useState<ProdutoItem | null>(null);

  // Formulário de Cadastro/Edição
  const [formData, setFormData] = useState({
    empresa_id: '',
    categoria_id: '',
    codigo_sku: '',
    nome: '',
    descricao: '',
    tipo: 'CONSUMIVEL' as 'CONSUMIVEL' | 'REUTILIZAVEL',
    modo_rastreio: 'QUANTIDADE_AGREGADA' as 'QUANTIDADE_AGREGADA' | 'INDIVIDUAL_SERIALIZADO',
    unidade_medida: 'UN',
    permite_fracionamento: false,
    estoque_minimo: 0,
  });

  const carregarProdutos = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      // 1. Carrega empresas
      const { data: empData } = await supabase
        .from('empresas')
        .select('id, nome_fantasia')
        .eq('ativo', true)
        .order('nome_fantasia', { ascending: true });
      setEmpresas(empData || []);

      // 2. Carrega categorias
      const { data: catData } = await supabase
        .from('categorias')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome', { ascending: true });
      setCategorias(catData || []);

      // 3. Carrega produtos com suas categorias
      const { data: prodData, error: prodErr } = await supabase
        .from('produtos')
        .select(`
          id,
          empresa_id,
          categoria_id,
          codigo_sku,
          nome,
          descricao,
          tipo,
          modo_rastreio,
          unidade_medida,
          permite_fracionamento,
          estoque_minimo,
          ativo,
          categorias:categoria_id (nome)
        `)
        .order('nome', { ascending: true });

      if (prodErr) throw prodErr;

      // 4. Carrega somatório de saldos disponíveis de cada produto (via estoque_itens)
      const { data: saldosData } = await supabase
        .from('estoque_itens')
        .select('produto_id, quantidade_disponivel');

      const saldosMap: Record<string, number> = {};
      saldosData?.forEach((s: any) => {
        saldosMap[s.produto_id] = (saldosMap[s.produto_id] || 0) + Number(s.quantidade_disponivel || 0);
      });

      const listFormatada: ProdutoItem[] = (prodData || []).map((p: any) => ({
        id: p.id,
        empresa_id: p.empresa_id,
        categoria_id: p.categoria_id,
        categoria_nome: p.categorias?.nome || 'Geral / Sem Categoria',
        codigo_sku: p.codigo_sku,
        nome: p.nome,
        descricao: p.descricao,
        tipo: p.tipo,
        modo_rastreio: p.modo_rastreio,
        unidade_medida: p.unidade_medida,
        permite_fracionamento: p.permite_fracionamento,
        estoque_minimo: Number(p.estoque_minimo) || 0,
        ativo: p.ativo,
        saldo_disponivel: saldosMap[p.id] || 0,
      }));

      setProdutos(listFormatada);
    } catch (err: any) {
      console.error('Erro ao carregar catálogo de produtos:', err);
      setErrorMsg(err.message || 'Falha ao buscar produtos no banco de dados.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarProdutos();
  }, [carregarProdutos]);

  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({
      empresa_id: empresas[0]?.id || user?.empresaAtivaId || '',
      categoria_id: categorias[0]?.id || '',
      codigo_sku: '',
      nome: '',
      descricao: '',
      tipo: 'CONSUMIVEL',
      modo_rastreio: 'QUANTIDADE_AGREGADA',
      unidade_medida: 'UN',
      permite_fracionamento: false,
      estoque_minimo: 0,
    });
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (prod: ProdutoItem) => {
    setIsEditing(true);
    setEditingId(prod.id);
    setFormData({
      empresa_id: prod.empresa_id,
      categoria_id: prod.categoria_id || '',
      codigo_sku: prod.codigo_sku,
      nome: prod.nome,
      descricao: prod.descricao || '',
      tipo: prod.tipo,
      modo_rastreio: prod.modo_rastreio,
      unidade_medida: prod.unidade_medida,
      permite_fracionamento: prod.permite_fracionamento,
      estoque_minimo: prod.estoque_minimo,
    });
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validações
    if (!formData.codigo_sku.trim()) {
      setErrorMsg('O código ou SKU é obrigatório.');
      return;
    }
    if (!formData.nome.trim()) {
      setErrorMsg('O nome/descrição do produto é obrigatório.');
      return;
    }
    if (!formData.empresa_id) {
      setErrorMsg('Selecione a empresa proprietária do produto.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && editingId) {
        // Atualiza dados cadastrais
        const { error: updErr } = await supabase
          .from('produtos')
          .update({
            categoria_id: formData.categoria_id || null,
            codigo_sku: formData.codigo_sku.trim().toUpperCase(),
            nome: formData.nome.trim(),
            descricao: formData.descricao.trim() || null,
            tipo: formData.tipo,
            modo_rastreio: formData.modo_rastreio,
            unidade_medida: formData.unidade_medida,
            permite_fracionamento: formData.permite_fracionamento,
            estoque_minimo: Number(formData.estoque_minimo) || 0,
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', editingId);

        if (updErr) {
          if (updErr.message.includes('unique') || updErr.message.includes('uq_produto_empresa_sku')) {
            throw new Error(`O código/SKU "${formData.codigo_sku}" já está em uso nesta empresa.`);
          }
          throw updErr;
        }

        setSuccessMsg(`Produto "${formData.nome}" atualizado com sucesso!`);
      } else {
        // Cadastra novo produto
        const { error: insErr } = await supabase
          .from('produtos')
          .insert({
            empresa_id: formData.empresa_id,
            categoria_id: formData.categoria_id || null,
            codigo_sku: formData.codigo_sku.trim().toUpperCase(),
            nome: formData.nome.trim(),
            descricao: formData.descricao.trim() || null,
            tipo: formData.tipo,
            modo_rastreio: formData.modo_rastreio,
            unidade_medida: formData.unidade_medida,
            permite_fracionamento: formData.permite_fracionamento,
            estoque_minimo: Number(formData.estoque_minimo) || 0,
            ativo: true,
          });

        if (insErr) {
          if (insErr.message.includes('unique') || insErr.message.includes('uq_produto_empresa_sku')) {
            throw new Error(`O código/SKU "${formData.codigo_sku}" já existe nesta empresa.`);
          }
          throw insErr;
        }

        setSuccessMsg(`Novo produto "${formData.nome}" cadastrado com sucesso!`);
      }

      setIsModalOpen(false);
      await carregarProdutos();
    } catch (err: any) {
      console.error('Falha ao salvar produto:', err);
      setErrorMsg(err.message || 'Erro ao persistir informações do produto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAtivo = async () => {
    if (!confirmToggleProduto) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const novoStatus = !confirmToggleProduto.ativo;
      const { error: toggleError } = await supabase
        .from('produtos')
        .update({
          ativo: novoStatus,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', confirmToggleProduto.id);

      if (toggleError) throw toggleError;

      setSuccessMsg(
        `Produto "${confirmToggleProduto.nome}" foi ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`
      );
      setConfirmToggleProduto(null);
      await carregarProdutos();
    } catch (err: any) {
      console.error('Erro ao alterar status do produto:', err);
      setErrorMsg(err.message || 'Falha ao alterar status do produto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProdutos = produtos.filter((p) => {
    const matchesSearch =
      p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.codigo_sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTipo = tipoFiltro === 'TODOS' || p.tipo === tipoFiltro;
    const matchesCat = categoriaFiltro === 'TODAS' || p.categoria_id === categoriaFiltro;
    const matchesStatus =
      statusFiltro === 'TODOS' ||
      (statusFiltro === 'ATIVOS' && p.ativo) ||
      (statusFiltro === 'INATIVOS' && !p.ativo);
    const matchesBaixo = !apenasEstoqueBaixo || p.saldo_disponivel <= p.estoque_minimo;

    return matchesSearch && matchesTipo && matchesCat && matchesStatus && matchesBaixo;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1>Catálogo de Produtos e Materiais</h1>
          <p style={{ marginTop: '2px', color: 'var(--color-text-secondary)' }}>
            Diferenciação rigorosa entre consumíveis e ferramentas reutilizáveis com múltiplos modos de rastreamento.
          </p>
        </div>
        {user?.perfil === 'ADMINISTRADOR' && (
          <Button
            variant="primary"
            leftIcon={<Plus size={16} />}
            onClick={handleOpenCreateModal}
          >
            Novo Produto
          </Button>
        )}
      </div>

      {/* Alertas */}
      {successMsg && (
        <Alert variant="success" title="Operação Concluída" onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      {errorMsg && (
        <Alert variant="danger" title="Atenção" onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      {/* Barra de Filtros e Pesquisa */}
      <Card padding="md">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
          gap: 'var(--space-3)',
          alignItems: 'end',
        }}>
          <div className="grid-span-2">
            <Input
              label="Buscar por Nome ou SKU"
              placeholder="Ex: Cabo UTP, Furadeira Bosch, CAB-..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftIcon={<Search size={16} />}
            />
          </div>

          <Select
            label="Tipo de Material"
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            options={[
              { value: 'TODOS', label: 'Todos os Tipos' },
              { value: 'CONSUMIVEL', label: 'Consumíveis (Baixa por Uso)' },
              { value: 'REUTILIZAVEL', label: 'Ferramentas Reutilizáveis' },
            ]}
          />

          <Select
            label="Categoria"
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
            options={[
              { value: 'TODAS', label: 'Todas as Categorias' },
              ...categorias.map((c) => ({ value: c.id, label: c.nome })),
            ]}
          />

          <Select
            label="Status"
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
            options={[
              { value: 'TODOS', label: 'Todos os Status' },
              { value: 'ATIVOS', label: 'Apenas Ativos' },
              { value: 'INATIVOS', label: 'Apenas Inativos' },
            ]}
          />

          <div style={{ display: 'flex', alignItems: 'center', height: '42px', gap: 'var(--space-2)' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--font-size-sm)',
              cursor: 'pointer',
              userSelect: 'none',
              color: apenasEstoqueBaixo ? 'var(--color-warning)' : 'var(--color-text-secondary)',
              fontWeight: apenasEstoqueBaixo ? 600 : 400,
            }}>
              <input
                type="checkbox"
                checked={apenasEstoqueBaixo}
                onChange={(e) => setApenasEstoqueBaixo(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--color-warning)' }}
              />
              <span>Abaixo do Mínimo</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', height: '42px' }}>
            <Button
              variant="secondary"
              size="md"
              leftIcon={<RefreshCw size={15} className={isLoading ? 'spinner' : ''} />}
              onClick={carregarProdutos}
              disabled={isLoading}
            >
              Atualizar
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabela de Produtos */}
      <Card>
        {isLoading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <div className="spinner" style={{ width: '2rem', height: '2rem', margin: '0 auto var(--space-3)' }} />
            <span>Consultando catálogo de produtos e saldos consolidados...</span>
          </div>
        ) : filteredProdutos.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Package size={40} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <p>Nenhum produto encontrado com os filtros selecionados.</p>
          </div>
        ) : (
          <Table
            keyExtractor={(item) => item.id}
            data={filteredProdutos}
            columns={[
              {
                key: 'codigo_sku',
                header: 'SKU / Código',
                render: (r) => <span className="text-mono" style={{ fontWeight: 600 }}>{r.codigo_sku}</span>,
              },
              {
                key: 'nome',
                header: 'Descrição do Item',
                render: (r) => (
                  <div>
                    <strong>{r.nome}</strong>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', display: 'flex', gap: '8px' }}>
                      <span><Layers size={10} style={{ display: 'inline' }} /> {r.categoria_nome}</span>
                      <span>• Mínimo: {r.estoque_minimo} {r.unidade_medida}</span>
                    </div>
                  </div>
                ),
              },
              {
                key: 'tipo',
                header: 'Natureza',
                render: (r) => (
                  <Badge variant={r.tipo === 'CONSUMIVEL' ? 'info' : 'neutral'}>
                    {r.tipo === 'CONSUMIVEL' ? 'Consumível' : 'Ferramenta'}
                  </Badge>
                ),
              },
              {
                key: 'modo_rastreio',
                header: 'Rastreamento',
                render: (r) => (
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    {r.modo_rastreio === 'INDIVIDUAL_SERIALIZADO' ? 'Individual / Serial' : 'Qtd Agregada'}
                  </span>
                ),
              },
              {
                key: 'saldo_disponivel',
                header: 'Saldo Consolidado',
                render: (r) => {
                  const isBaixo = r.saldo_disponivel <= r.estoque_minimo;
                  return (
                    <div>
                      <span style={{
                        fontWeight: 700,
                        color: isBaixo ? 'var(--color-warning)' : 'var(--color-text-main)',
                        fontSize: 'var(--font-size-base)',
                      }}>
                        {r.saldo_disponivel} {r.unidade_medida}
                      </span>
                      {isBaixo && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--color-warning)', fontSize: '0.7rem' }}>
                          <AlertTriangle size={11} /> Estoque Baixo
                        </div>
                      )}
                    </div>
                  );
                },
              },
              {
                key: 'ativo',
                header: 'Status',
                render: (r) => (
                  <Badge
                    variant={r.ativo ? 'success' : 'danger'}
                    icon={r.ativo ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  >
                    {r.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                ),
              },
              {
                key: 'acoes',
                header: 'Ações',
                align: 'right',
                render: (r) => (
                  <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Eye size={14} />}
                      onClick={() => navigate(`/produtos/${r.id}`)}
                    >
                      Detalhes
                    </Button>
                    {user?.perfil === 'ADMINISTRADOR' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<Edit2 size={14} />}
                          onClick={() => handleOpenEditModal(r)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          style={{ color: r.ativo ? 'var(--color-danger)' : 'var(--color-success)' }}
                          onClick={() => setConfirmToggleProduto(r)}
                        >
                          {r.ativo ? 'Desativar' : 'Ativar'}
                        </Button>
                      </>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Modal de Cadastro / Edição de Produto */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? 'Editar Produto' : 'Cadastrar Novo Produto / Material'}
        description="Defina a identidade técnica, SKU, regras de rastreio e estoque mínimo."
        footerActions={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleFormSubmit} isLoading={isSubmitting}>
              {isEditing ? 'Salvar Alterações' : 'Cadastrar Produto'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleFormSubmit}>
          <div className="form-grid-2">
            <Select
              label="Empresa Proprietária"
              required
              value={formData.empresa_id}
              onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })}
              options={empresas.map((emp) => ({ value: emp.id, label: emp.nome_fantasia }))}
            />

            <Select
              label="Categoria do Material"
              value={formData.categoria_id}
              onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
              options={[
                { value: '', label: 'Sem Categoria Específica' },
                ...categorias.map((c) => ({ value: c.id, label: c.nome })),
              ]}
            />
          </div>

          <div className="form-grid-1-2">
            <Input
              label="Código / SKU Único"
              required
              value={formData.codigo_sku}
              onChange={(e) => setFormData({ ...formData, codigo_sku: e.target.value })}
              placeholder="Ex: CAB-UTP-01"
            />

            <Input
              label="Descrição do Produto"
              required
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              placeholder="Ex: Cabo de Rede Cat6 Furukawa"
            />
          </div>

          <div className="form-grid-2">
            <Select
              label="Tipo de Material"
              value={formData.tipo}
              onChange={(e) => setFormData({ ...formData, tipo: e.target.value as any })}
              options={[
                { value: 'CONSUMIVEL', label: 'Consumível (Baixa definitiva por uso)' },
                { value: 'REUTILIZAVEL', label: 'Ferramenta Reutilizável (Custódia e devolução)' },
              ]}
            />

            <Select
              label="Modo de Rastreamento"
              value={formData.modo_rastreio}
              onChange={(e) => setFormData({ ...formData, modo_rastreio: e.target.value as any })}
              options={[
                { value: 'QUANTIDADE_AGREGADA', label: 'Quantidade Agregada (Metro, Peça, Cento)' },
                { value: 'INDIVIDUAL_SERIALIZADO', label: 'Individualizado por Patrimônio / Número de Série' },
              ]}
            />
          </div>

          <div className="form-grid-2">
            <Select
              label="Unidade de Medida"
              value={formData.unidade_medida}
              onChange={(e) => setFormData({ ...formData, unidade_medida: e.target.value })}
              options={UNIDADES_MEDIDA}
            />

            <Input
              label="Estoque Mínimo de Alerta"
              type="number"
              min="0"
              step="any"
              value={formData.estoque_minimo}
              onChange={(e) => setFormData({ ...formData, estoque_minimo: Number(e.target.value) })}
            />
          </div>

          <div style={{
            padding: 'var(--space-3)',
            backgroundColor: 'var(--color-surface-hover)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            marginTop: 'var(--space-2)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
          }}>
            <strong style={{ color: 'var(--color-accent)' }}>Regra de Auditoria de Saldo:</strong> A quantidade em estoque NÃO é um campo de edição livre. Os saldos são gerados e ajustados exclusivamente através de movimentações de entrada, saída e transferências auditadas.
          </div>
        </form>
      </Modal>

      {/* Modal de Confirmação de Ativação / Desativação */}
      <Modal
        isOpen={Boolean(confirmToggleProduto)}
        onClose={() => setConfirmToggleProduto(null)}
        title={confirmToggleProduto?.ativo ? 'Desativar Produto' : 'Reativar Produto'}
        description={`Confirmação de alteração de status para "${confirmToggleProduto?.nome}".`}
        footerActions={
          <>
            <Button variant="secondary" onClick={() => setConfirmToggleProduto(null)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              variant={confirmToggleProduto?.ativo ? 'danger' : 'primary'}
              onClick={handleToggleAtivo}
              isLoading={isSubmitting}
            >
              {confirmToggleProduto?.ativo ? 'Confirmar Desativação' : 'Confirmar Reativação'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <AlertCircle size={24} style={{ color: confirmToggleProduto?.ativo ? 'var(--color-danger)' : 'var(--color-primary)', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', marginBottom: 'var(--space-2)' }}>
              {confirmToggleProduto?.ativo
                ? 'Ao desativar este produto, novas movimentações e requisições para ele serão bloqueadas, preservando o histórico de movimentações anteriores e auditoria.'
                : 'O produto será reativado e poderá ser movimentado normalmente pelas equipes autorizadas.'}
            </p>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Preservação histórica obrigatória: Nenhum dado físico é destruído no banco de dados.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
};
