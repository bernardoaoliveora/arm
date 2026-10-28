import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Edit2, CheckCircle2, XCircle, Search, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, Button, Table, Badge, Modal, Input, Alert } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';

interface EmpresaItem {
  id: string;
  razao_social: string;
  nome_fantasia: string;
  documento: string;
  ativo: boolean;
  estoques_count: number;
  criado_em: string;
}

export const EmpresasPage: React.FC = () => {
  const { user } = useAuth();
  const [empresas, setEmpresas] = useState<EmpresaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Modais de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal de Confirmação de Ativação / Desativação
  const [confirmToggleEmpresa, setConfirmToggleEmpresa] = useState<EmpresaItem | null>(null);

  const [formData, setFormData] = useState({
    razao_social: '',
    nome_fantasia: '',
    documento: '',
  });

  const carregarEmpresas = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      // 1. Busca empresas
      const { data: empresasData, error: empError } = await supabase
        .from('empresas')
        .select('*')
        .order('nome_fantasia', { ascending: true });

      if (empError) throw empError;

      // 2. Busca contagem de estoques por empresa
      const { data: estoquesData, error: estError } = await supabase
        .from('estoques')
        .select('empresa_id');

      if (estError) throw estError;

      const countsMap: Record<string, number> = {};
      estoquesData?.forEach((e: { empresa_id: string }) => {
        countsMap[e.empresa_id] = (countsMap[e.empresa_id] || 0) + 1;
      });

      const listFormatada: EmpresaItem[] = (empresasData || []).map((emp: any) => ({
        id: emp.id,
        razao_social: emp.razao_social,
        nome_fantasia: emp.nome_fantasia,
        documento: emp.documento,
        ativo: emp.ativo,
        estoques_count: countsMap[emp.id] || 0,
        criado_em: emp.criado_em,
      }));

      setEmpresas(listFormatada);
    } catch (err: any) {
      console.error('Erro ao carregar empresas:', err);
      setErrorMsg(err.message || 'Não foi possível carregar a lista de empresas.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarEmpresas();
  }, [carregarEmpresas]);

  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({ razao_social: '', nome_fantasia: '', documento: '' });
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (empresa: EmpresaItem) => {
    setIsEditing(true);
    setEditingId(empresa.id);
    setFormData({
      razao_social: empresa.razao_social,
      nome_fantasia: empresa.nome_fantasia,
      documento: empresa.documento,
    });
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validações de campos obrigatórios
    if (!formData.nome_fantasia.trim()) {
      setErrorMsg('O Nome Fantasia é obrigatório.');
      return;
    }
    if (!formData.documento.trim()) {
      setErrorMsg('O CNPJ / Documento é obrigatório.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && editingId) {
        // Atualização
        const { error: updateError } = await supabase
          .from('empresas')
          .update({
            nome_fantasia: formData.nome_fantasia.trim(),
            razao_social: formData.razao_social.trim() || formData.nome_fantasia.trim(),
            documento: formData.documento.trim(),
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', editingId);

        if (updateError) {
          if (updateError.message.includes('unique') || updateError.message.includes('documento')) {
            throw new Error('Já existe outra empresa cadastrada com este mesmo CNPJ/Documento.');
          }
          throw updateError;
        }

        setSuccessMsg(`Empresa "${formData.nome_fantasia}" atualizada com sucesso!`);
      } else {
        // Novo Cadastro
        const { error: insertError } = await supabase
          .from('empresas')
          .insert({
            nome_fantasia: formData.nome_fantasia.trim(),
            razao_social: formData.razao_social.trim() || formData.nome_fantasia.trim(),
            documento: formData.documento.trim(),
            ativo: true,
          });

        if (insertError) {
          if (insertError.message.includes('unique') || insertError.message.includes('documento')) {
            throw new Error('Já existe uma empresa cadastrada com este mesmo CNPJ/Documento.');
          }
          throw insertError;
        }

        setSuccessMsg(`Nova empresa "${formData.nome_fantasia}" cadastrada com sucesso!`);
      }

      setIsModalOpen(false);
      await carregarEmpresas();
    } catch (err: any) {
      console.error('Falha ao salvar empresa:', err);
      setErrorMsg(err.message || 'Erro ao persistir dados da empresa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAtivo = async () => {
    if (!confirmToggleEmpresa) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const novoStatus = !confirmToggleEmpresa.ativo;
      const { error: toggleError } = await supabase
        .from('empresas')
        .update({
          ativo: novoStatus,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', confirmToggleEmpresa.id);

      if (toggleError) throw toggleError;

      setSuccessMsg(
        `Empresa "${confirmToggleEmpresa.nome_fantasia}" foi ${novoStatus ? 'ativada' : 'desativada'} com sucesso!`
      );
      setConfirmToggleEmpresa(null);
      await carregarEmpresas();
    } catch (err: any) {
      console.error('Erro ao alterar status da empresa:', err);
      setErrorMsg(err.message || 'Falha ao alterar status da empresa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const empresasFiltradas = empresas.filter((emp) => {
    const termo = searchTerm.toLowerCase();
    return (
      emp.nome_fantasia.toLowerCase().includes(termo) ||
      emp.razao_social.toLowerCase().includes(termo) ||
      emp.documento.toLowerCase().includes(termo)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1>Empresas e Unidades de Negócio</h1>
          <p style={{ marginTop: '2px', color: 'var(--color-text-secondary)' }}>
            Gerencie as pessoas jurídicas e filiais que mantêm estoques e materiais no sistema.
          </p>
        </div>
        {user?.perfil === 'ADMINISTRADOR' && (
          <Button
            variant="primary"
            leftIcon={<Plus size={16} />}
            onClick={handleOpenCreateModal}
          >
            Nova Empresa
          </Button>
        )}
      </div>

      {/* Alertas de Feedback */}
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

      {/* Barra de Filtros e Busca */}
      <Card padding="sm">
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 'min(100%, 200px)' }}>
            <Input
              label=""
              placeholder="Buscar por Nome Fantasia, Razão Social ou CNPJ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftIcon={<Search size={16} />}
            />
          </div>
          <Button
            variant="secondary"
            size="md"
            leftIcon={<RefreshCw size={15} className={isLoading ? 'spinner' : ''} />}
            onClick={carregarEmpresas}
            disabled={isLoading}
            style={{ flexShrink: 0 }}
          >
            Atualizar
          </Button>
        </div>
      </Card>

      {/* Tabela de Empresas */}
      <Card>
        {isLoading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <div className="spinner" style={{ width: '2rem', height: '2rem', margin: '0 auto var(--space-3)' }} />
            <span>Carregando empresas cadastradas no banco de dados...</span>
          </div>
        ) : empresasFiltradas.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Building2 size={40} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <p>Nenhuma empresa encontrada com os filtros aplicados.</p>
          </div>
        ) : (
          <Table
            keyExtractor={(item) => item.id}
            data={empresasFiltradas}
            columns={[
              {
                key: 'nome_fantasia',
                header: 'Empresa / Unidade',
                render: (r) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-accent-subtle)',
                      color: 'var(--color-accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Building2 size={16} />
                    </div>
                    <div>
                      <strong>{r.nome_fantasia}</strong>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        {r.razao_social}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'documento',
                header: 'CNPJ / Documento',
                render: (r) => <span className="text-mono">{r.documento}</span>,
              },
              {
                key: 'estoques_count',
                header: 'Estoques Vinculados',
                render: (r) => (
                  <span style={{ fontWeight: 500 }}>
                    {r.estoques_count} {r.estoques_count === 1 ? 'depósito' : 'depósitos'}
                  </span>
                ),
              },
              {
                key: 'ativo',
                header: 'Status',
                render: (r) => (
                  <Badge
                    variant={r.ativo ? 'success' : 'danger'}
                    icon={r.ativo ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  >
                    {r.ativo ? 'Ativa' : 'Inativa'}
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
                      leftIcon={<Edit2 size={14} />}
                      onClick={() => handleOpenEditModal(r)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      style={{ color: r.ativo ? 'var(--color-danger)' : 'var(--color-success)' }}
                      onClick={() => setConfirmToggleEmpresa(r)}
                    >
                      {r.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Modal de Cadastro / Edição */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? 'Editar Empresa' : 'Cadastrar Nova Empresa'}
        description={
          isEditing
            ? 'Atualize as informações cadastrais da pessoa jurídica.'
            : 'Adicione uma matriz ou filial para gerenciar novos almoxarifados e materiais.'
        }
        footerActions={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleFormSubmit} isLoading={isSubmitting}>
              {isEditing ? 'Salvar Alterações' : 'Cadastrar Empresa'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleFormSubmit}>
          <Input
            label="Nome Fantasia / Identificação da Unidade"
            required
            value={formData.nome_fantasia}
            onChange={(e) => setFormData({ ...formData, nome_fantasia: e.target.value })}
            placeholder="Ex: Matriz São Paulo ou Filial Campinas"
          />

          <Input
            label="Razão Social"
            value={formData.razao_social}
            onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
            placeholder="Ex: Serviços Técnicos e Engenharia Ltda"
          />

          <Input
            label="CNPJ / Documento Oficial"
            required
            value={formData.documento}
            onChange={(e) => setFormData({ ...formData, documento: e.target.value })}
            placeholder="00.000.000/0001-00"
          />
        </form>
      </Modal>

      {/* Modal de Confirmação de Ativação / Desativação */}
      <Modal
        isOpen={Boolean(confirmToggleEmpresa)}
        onClose={() => setConfirmToggleEmpresa(null)}
        title={confirmToggleEmpresa?.ativo ? 'Desativar Empresa' : 'Reativar Empresa'}
        description={`Confirmação de alteração de status para a empresa "${confirmToggleEmpresa?.nome_fantasia}".`}
        footerActions={
          <>
            <Button variant="secondary" onClick={() => setConfirmToggleEmpresa(null)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              variant={confirmToggleEmpresa?.ativo ? 'danger' : 'primary'}
              onClick={handleToggleAtivo}
              isLoading={isSubmitting}
            >
              {confirmToggleEmpresa?.ativo ? 'Confirmar Desativação' : 'Confirmar Reativação'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <AlertCircle size={24} style={{ color: confirmToggleEmpresa?.ativo ? 'var(--color-danger)' : 'var(--color-primary)', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', marginBottom: 'var(--space-2)' }}>
              {confirmToggleEmpresa?.ativo
                ? 'Ao desativar a empresa, seus estoques e técnicos vinculados não poderão realizar novas movimentações, mas todo o histórico e auditoria serão rigorosamente preservados.'
                : 'A empresa será reativada e voltará a permitir consultas e operações nos estoques vinculados.'}
            </p>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Preservação de integridade: Nenhuma exclusão física de dados será realizada.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
};
