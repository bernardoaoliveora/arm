import React, { useState, useEffect, useCallback } from 'react';
import {
  Boxes,
  Plus,
  MapPin,
  Building2,
  CheckCircle2,
  XCircle,
  Users,
  Edit2,
  AlertCircle,
  RefreshCw,
  Search,
  Eye,
  AlertTriangle
} from 'lucide-react';
import { Card, Button, Badge, Modal, Input, Select, Alert, Table } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';

interface EstoqueItem {
  id: string;
  empresa_id: string;
  empresa_nome: string;
  nome: string;
  tipo: string;
  localizacao: string | null;
  descricao: string | null;
  ativo: boolean;
  itens_count: number;
  responsaveis: { id: string; nome: string; perfil: string }[];
}

interface SaldoItem {
  produto_id: string;
  codigo_sku: string;
  nome: string;
  unidade_medida: string;
  tipo: string;
  estoque_minimo: number;
  quantidade_disponivel: number;
}

const TIPOS_ESTOQUE = [
  { value: 'ALMOXARIFADO_CENTRAL', label: 'Almoxarifado Central (Galpão Principal)' },
  { value: 'DEPOSITO_AVANCADO', label: 'Depósito Avançado / Ponto de Apoio' },
  { value: 'VEICULO_TECNICO', label: 'Viatura Operacional / Veículo do Técnico' },
  { value: 'OBRA_CAMPO', label: 'Estoque Local de Obra / Campo' },
];

export const EstoquesPage: React.FC = () => {
  const { user } = useAuth();
  const [estoques, setEstoques] = useState<EstoqueItem[]>([]);
  const [empresas, setEmpresas] = useState<{ id: string; nome_fantasia: string }[]>([]);
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string; perfil: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('TODOS');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modais de Cadastro / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal de Consulta de Saldos do Estoque
  const [selectedEstoqueSaldos, setSelectedEstoqueSaldos] = useState<EstoqueItem | null>(null);
  const [saldosList, setSaldosList] = useState<SaldoItem[]>([]);
  const [isLoadingSaldos, setIsLoadingSaldos] = useState(false);

  // Modal de Confirmação de Ativação / Desativação
  const [confirmToggleEstoque, setConfirmToggleEstoque] = useState<EstoqueItem | null>(null);

  // Formulário
  const [formData, setFormData] = useState({
    empresa_id: '',
    nome: '',
    tipo: 'ALMOXARIFADO_CENTRAL',
    localizacao: '',
    descricao: '',
    responsaveis_ids: [] as string[],
  });

  const carregarDados = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      // 1. Carrega empresas para os selects
      const { data: empData } = await supabase
        .from('empresas')
        .select('id, nome_fantasia')
        .eq('ativo', true)
        .order('nome_fantasia', { ascending: true });
      setEmpresas(empData || []);

      // 2. Carrega usuários disponíveis para serem associados como responsáveis
      const { data: usrData } = await supabase
        .from('usuarios')
        .select('id, nome, perfil')
        .eq('ativo', true)
        .order('nome', { ascending: true });
      setUsuarios(usrData || []);

      // 3. Carrega estoques com empresa
      const { data: estData, error: estError } = await supabase
        .from('estoques')
        .select(`
          id,
          empresa_id,
          nome,
          tipo,
          localizacao,
          descricao,
          ativo,
          empresas:empresa_id (nome_fantasia)
        `)
        .order('nome', { ascending: true });

      if (estError) throw estError;

      // 4. Carrega responsáveis de cada estoque
      const { data: respData } = await supabase
        .from('estoques_responsaveis')
        .select(`
          estoque_id,
          usuario_id,
          usuarios:usuario_id (id, nome, perfil)
        `)
        .eq('ativo', true);

      const respMap: Record<string, { id: string; nome: string; perfil: string }[]> = {};
      respData?.forEach((r: any) => {
        if (!respMap[r.estoque_id]) respMap[r.estoque_id] = [];
        if (r.usuarios) {
          respMap[r.estoque_id].push({
            id: r.usuarios.id,
            nome: r.usuarios.nome,
            perfil: r.usuarios.perfil,
          });
        }
      });

      // 5. Carrega contagem de itens de cada estoque
      const { data: itensData } = await supabase
        .from('estoque_itens')
        .select('estoque_id, quantidade_disponivel');

      const countMap: Record<string, number> = {};
      itensData?.forEach((it: any) => {
        if (Number(it.quantidade_disponivel) > 0) {
          countMap[it.estoque_id] = (countMap[it.estoque_id] || 0) + 1;
        }
      });

      const listFormatada: EstoqueItem[] = (estData || []).map((e: any) => ({
        id: e.id,
        empresa_id: e.empresa_id,
        empresa_nome: e.empresas?.nome_fantasia || 'Empresa Geral',
        nome: e.nome,
        tipo: e.tipo,
        localizacao: e.localizacao,
        descricao: e.descricao,
        ativo: e.ativo,
        itens_count: countMap[e.id] || 0,
        responsaveis: respMap[e.id] || [],
      }));

      setEstoques(listFormatada);
    } catch (err: any) {
      console.error('Erro ao carregar estoques:', err);
      setErrorMsg(err.message || 'Falha ao buscar estoques no banco de dados.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({
      empresa_id: empresas[0]?.id || user?.empresaAtivaId || '',
      nome: '',
      tipo: 'ALMOXARIFADO_CENTRAL',
      localizacao: '',
      descricao: '',
      responsaveis_ids: [],
    });
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (est: EstoqueItem) => {
    setIsEditing(true);
    setEditingId(est.id);
    setFormData({
      empresa_id: est.empresa_id,
      nome: est.nome,
      tipo: est.tipo,
      localizacao: est.localizacao || '',
      descricao: est.descricao || '',
      responsaveis_ids: est.responsaveis.map((r) => r.id),
    });
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!formData.nome.trim()) {
      setErrorMsg('O nome do estoque é obrigatório.');
      return;
    }
    if (!formData.empresa_id) {
      setErrorMsg('Selecione a empresa proprietária do estoque.');
      return;
    }

    setIsSubmitting(true);
    try {
      let estoqueId = editingId;

      if (isEditing && editingId) {
        // Atualiza estoque existente
        const { error: updErr } = await supabase
          .from('estoques')
          .update({
            empresa_id: formData.empresa_id,
            nome: formData.nome.trim(),
            tipo: formData.tipo,
            localizacao: formData.localizacao.trim() || null,
            descricao: formData.descricao.trim() || null,
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', editingId);

        if (updErr) {
          if (updErr.message.includes('unique') || updErr.message.includes('uq_estoque_empresa_nome')) {
            throw new Error('Já existe outro estoque com este mesmo nome na mesma empresa.');
          }
          throw updErr;
        }

        setSuccessMsg(`Estoque "${formData.nome}" atualizado com sucesso!`);
      } else {
        // Cria novo estoque
        const { data: newEst, error: insErr } = await supabase
          .from('estoques')
          .insert({
            empresa_id: formData.empresa_id,
            nome: formData.nome.trim(),
            tipo: formData.tipo,
            localizacao: formData.localizacao.trim() || null,
            descricao: formData.descricao.trim() || null,
            ativo: true,
          })
          .select('id')
          .single();

        if (insErr) {
          if (insErr.message.includes('unique') || insErr.message.includes('uq_estoque_empresa_nome')) {
            throw new Error('Já existe um estoque com este mesmo nome nesta empresa.');
          }
          throw insErr;
        }

        estoqueId = newEst.id;
        setSuccessMsg(`Novo estoque "${formData.nome}" cadastrado com sucesso!`);
      }

      // Atualiza os responsáveis autorizados pelo estoque
      if (estoqueId) {
        // Remove associações antigas
        await supabase
          .from('estoques_responsaveis')
          .delete()
          .eq('estoque_id', estoqueId);

        // Insere as novas associações selecionadas
        if (formData.responsaveis_ids.length > 0) {
          const insertPayload = formData.responsaveis_ids.map((uid) => ({
            estoque_id: estoqueId as string,
            usuario_id: uid,
            ativo: true,
          }));

          const { error: respErr } = await supabase
            .from('estoques_responsaveis')
            .insert(insertPayload);

          if (respErr) console.warn('Erro ao associar responsáveis:', respErr);
        }
      }

      setIsModalOpen(false);
      await carregarDados();
    } catch (err: any) {
      console.error('Falha ao salvar estoque:', err);
      setErrorMsg(err.message || 'Erro ao persistir informações do estoque.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAtivo = async () => {
    if (!confirmToggleEstoque) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const novoStatus = !confirmToggleEstoque.ativo;
      const { error: toggleError } = await supabase
        .from('estoques')
        .update({
          ativo: novoStatus,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', confirmToggleEstoque.id);

      if (toggleError) throw toggleError;

      setSuccessMsg(
        `Estoque "${confirmToggleEstoque.nome}" foi ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`
      );
      setConfirmToggleEstoque(null);
      await carregarDados();
    } catch (err: any) {
      console.error('Erro ao alterar status do estoque:', err);
      setErrorMsg(err.message || 'Falha ao alterar status do estoque.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerSaldos = async (est: EstoqueItem) => {
    setSelectedEstoqueSaldos(est);
    setIsLoadingSaldos(true);
    try {
      const { data, error } = await supabase
        .from('estoque_itens')
        .select(`
          quantidade_disponivel,
          produtos:produto_id (
            id,
            codigo_sku,
            nome,
            unidade_medida,
            tipo,
            estoque_minimo
          )
        `)
        .eq('estoque_id', est.id);

      if (error) throw error;

      const saldos: SaldoItem[] = (data || []).map((row: any) => ({
        produto_id: row.produtos?.id,
        codigo_sku: row.produtos?.codigo_sku || 'N/A',
        nome: row.produtos?.nome || 'Item não identificado',
        unidade_medida: row.produtos?.unidade_medida || 'UN',
        tipo: row.produtos?.tipo || 'CONSUMIVEL',
        estoque_minimo: Number(row.produtos?.estoque_minimo) || 0,
        quantidade_disponivel: Number(row.quantidade_disponivel) || 0,
      }));

      setSaldosList(saldos);
    } catch (err: any) {
      console.error('Erro ao buscar saldos do estoque:', err);
      setErrorMsg('Não foi possível carregar os saldos deste depósito.');
    } finally {
      setIsLoadingSaldos(false);
    }
  };

  const estoquesFiltrados = estoques.filter((est) => {
    const termo = searchTerm.toLowerCase();
    const matchTermo =
      est.nome.toLowerCase().includes(termo) ||
      est.empresa_nome.toLowerCase().includes(termo) ||
      (est.localizacao && est.localizacao.toLowerCase().includes(termo));
    const matchTipo = filtroTipo === 'TODOS' || est.tipo === filtroTipo;
    return matchTermo && matchTipo;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1>Locais de Armazenamento e Estoques</h1>
          <p style={{ marginTop: '2px', color: 'var(--color-text-secondary)' }}>
            Gerencie almoxarifados centrais, viaturas de técnicos e bases operacionais autorizadas.
          </p>
        </div>
        {user?.perfil === 'ADMINISTRADOR' && (
          <Button
            variant="primary"
            leftIcon={<Plus size={16} />}
            onClick={handleOpenCreateModal}
          >
            Novo Estoque
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

      {/* Filtros e Busca */}
      <Card padding="sm">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 'var(--space-3)', alignItems: 'center' }}>
          <Input
            label=""
            placeholder="Buscar por Nome do Estoque ou Empresa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search size={16} />}
          />

          <Select
            label=""
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            options={[
              { value: 'TODOS', label: 'Todos os Tipos de Depósito' },
              ...TIPOS_ESTOQUE,
            ]}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              leftIcon={<RefreshCw size={15} className={isLoading ? 'spinner' : ''} />}
              onClick={carregarDados}
              disabled={isLoading}
            >
              Atualizar
            </Button>
          </div>
        </div>
      </Card>

      {/* Grid de Cards de Estoques */}
      {isLoading ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          <div className="spinner" style={{ width: '2rem', height: '2rem', margin: '0 auto var(--space-3)' }} />
          <span>Consultando estoques e responsáveis vinculados...</span>
        </div>
      ) : estoquesFiltrados.length === 0 ? (
        <Card>
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Boxes size={40} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <p>Nenhum estoque encontrado com os filtros aplicados.</p>
          </div>
        </Card>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          gap: 'var(--space-4)',
        }}>
          {estoquesFiltrados.map((est) => (
            <Card key={est.id}>
              {/* Topo do Card */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-accent-subtle)',
                    color: 'var(--color-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Boxes size={22} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-main)' }}>
                      {est.nome}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      <Building2 size={12} /> {est.empresa_nome}
                    </div>
                  </div>
                </div>
                <Badge
                  variant={est.ativo ? 'success' : 'danger'}
                  icon={est.ativo ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                >
                  {est.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>

              {/* Localização e Tipo */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
                fontSize: 'var(--font-size-xs)',
                margin: 'var(--space-3) 0',
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--color-surface-hover)',
                borderRadius: 'var(--radius-sm)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-text-secondary)' }}>
                  <MapPin size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                  <span>{est.localizacao || 'Sem endereço físico cadastrado'}</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                  Tipo: <strong>{TIPOS_ESTOQUE.find((t) => t.value === est.tipo)?.label || est.tipo}</strong>
                </div>
              </div>

              {/* Responsáveis Autorizados */}
              <div style={{ margin: 'var(--space-2) 0', fontSize: 'var(--font-size-xs)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                  <Users size={12} />
                  <strong>Responsáveis Autorizados:</strong>
                </div>
                {est.responsaveis.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {est.responsaveis.map((r) => (
                      <span
                        key={r.id}
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '1px 6px',
                          fontSize: '0.7rem',
                        }}
                      >
                        {r.nome} ({r.perfil === 'TECNICO' ? 'Técnico' : 'Gerente'})
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                    Nenhum responsável específico associado
                  </span>
                )}
              </div>

              {/* Rodapé com Ações e Consulta de Saldo */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 'var(--space-4)',
                paddingTop: 'var(--space-3)',
                borderTop: '1px solid var(--color-border-subtle)',
              }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  <strong>{est.itens_count}</strong> {est.itens_count === 1 ? 'item com saldo' : 'itens com saldo'}
                </span>

                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Eye size={14} />}
                    onClick={() => handleVerSaldos(est)}
                  >
                    Ver Saldos
                  </Button>

                  {user?.perfil === 'ADMINISTRADOR' && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Edit2 size={14} />}
                        onClick={() => handleOpenEditModal(est)}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: est.ativo ? 'var(--color-danger)' : 'var(--color-success)' }}
                        onClick={() => setConfirmToggleEstoque(est)}
                      >
                        {est.ativo ? 'Desativar' : 'Ativar'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Cadastro / Edição de Estoque */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? 'Editar Estoque' : 'Cadastrar Novo Estoque / Depósito'}
        description="Configure o local de guarda, a empresa vinculada e os técnicos autorizados."
        footerActions={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleFormSubmit} isLoading={isSubmitting}>
              {isEditing ? 'Salvar Alterações' : 'Cadastrar Estoque'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleFormSubmit}>
          <Select
            label="Empresa Proprietária"
            required
            value={formData.empresa_id}
            onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })}
            options={empresas.map((emp) => ({ value: emp.id, label: emp.nome_fantasia }))}
          />

          <Input
            label="Nome do Estoque / Identificação"
            required
            value={formData.nome}
            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            placeholder="Ex: Almoxarifado Central ou Viatura Operacional 04"
          />

          <Select
            label="Tipo de Local de Guarda"
            required
            value={formData.tipo}
            onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
            options={TIPOS_ESTOQUE}
          />

          <Input
            label="Localização Física / Endereço"
            value={formData.localizacao}
            onChange={(e) => setFormData({ ...formData, localizacao: e.target.value })}
            placeholder="Ex: Galpão A, Baia 12 ou Base Operacional Sul"
          />

          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 500, marginBottom: 'var(--space-1)' }}>
              Responsáveis Autorizados (Técnicos ou Gerentes)
            </label>
            <div style={{
              maxHeight: '140px',
              overflowY: 'auto',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2)',
              backgroundColor: 'var(--color-surface)',
            }}>
              {usuarios.map((usr) => (
                <label
                  key={usr.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-1) var(--space-2)',
                    fontSize: 'var(--font-size-xs)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.responsaveis_ids.includes(usr.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({
                          ...formData,
                          responsaveis_ids: [...formData.responsaveis_ids, usr.id],
                        });
                      } else {
                        setFormData({
                          ...formData,
                          responsaveis_ids: formData.responsaveis_ids.filter((id) => id !== usr.id),
                        });
                      }
                    }}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  <span>
                    <strong>{usr.nome}</strong> ({usr.perfil})
                  </span>
                </label>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal de Consulta de Produtos e Saldos do Estoque */}
      <Modal
        isOpen={Boolean(selectedEstoqueSaldos)}
        onClose={() => setSelectedEstoqueSaldos(null)}
        title={`Saldos: ${selectedEstoqueSaldos?.nome}`}
        description={`Consulta em tempo real dos produtos armazenados em "${selectedEstoqueSaldos?.nome}".`}
        footerActions={
          <Button variant="secondary" onClick={() => setSelectedEstoqueSaldos(null)}>
            Fechar
          </Button>
        }
      >
        {isLoadingSaldos ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <div className="spinner" style={{ width: '1.8rem', height: '1.8rem', margin: '0 auto var(--space-2)' }} />
            <span>Consultando saldos do estoque no banco de dados...</span>
          </div>
        ) : saldosList.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Boxes size={36} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <p>Este estoque ainda não possui saldos registrados.</p>
            <span style={{ fontSize: 'var(--font-size-xs)' }}>
              Saldos são inseridos auditavelmente pelo módulo de movimentações e entradas.
            </span>
          </div>
        ) : (
          <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
            <Table
              keyExtractor={(item) => item.produto_id}
              data={saldosList}
              columns={[
                {
                  key: 'codigo_sku',
                  header: 'SKU / Código',
                  render: (r) => <span className="text-mono" style={{ fontWeight: 600 }}>{r.codigo_sku}</span>,
                },
                {
                  key: 'nome',
                  header: 'Produto',
                  render: (r) => (
                    <div>
                      <strong>{r.nome}</strong>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        Mínimo exigido: {r.estoque_minimo} {r.unidade_medida}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'quantidade_disponivel',
                  header: 'Saldo Atual',
                  align: 'right',
                  render: (r) => {
                    const isBaixo = r.quantidade_disponivel <= r.estoque_minimo;
                    return (
                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ color: isBaixo ? 'var(--color-warning)' : 'var(--color-text-main)', fontSize: 'var(--font-size-base)' }}>
                          {r.quantidade_disponivel} {r.unidade_medida}
                        </strong>
                        {isBaixo && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px', color: 'var(--color-warning)', fontSize: '0.7rem' }}>
                            <AlertTriangle size={10} /> Abaixo do mínimo
                          </div>
                        )}
                      </div>
                    );
                  },
                },
              ]}
            />
          </div>
        )}
      </Modal>

      {/* Modal de Confirmação de Ativação / Desativação */}
      <Modal
        isOpen={Boolean(confirmToggleEstoque)}
        onClose={() => setConfirmToggleEstoque(null)}
        title={confirmToggleEstoque?.ativo ? 'Desativar Estoque' : 'Reativar Estoque'}
        description={`Confirmação de alteração de status para o estoque "${confirmToggleEstoque?.nome}".`}
        footerActions={
          <>
            <Button variant="secondary" onClick={() => setConfirmToggleEstoque(null)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              variant={confirmToggleEstoque?.ativo ? 'danger' : 'primary'}
              onClick={handleToggleAtivo}
              isLoading={isSubmitting}
            >
              {confirmToggleEstoque?.ativo ? 'Confirmar Desativação' : 'Confirmar Reativação'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <AlertCircle size={24} style={{ color: confirmToggleEstoque?.ativo ? 'var(--color-danger)' : 'var(--color-primary)', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', marginBottom: 'var(--space-2)' }}>
              {confirmToggleEstoque?.ativo
                ? 'Ao desativar este estoque, novas retiradas e transferências para ele serão bloqueadas, mas todo o histórico de movimentações e saldos será integralmente preservado.'
                : 'O estoque será reativado e estará novamente disponível para movimentações de materiais.'}
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
