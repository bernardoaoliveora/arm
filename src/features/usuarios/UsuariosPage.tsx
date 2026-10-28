import React, { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  Shield,
  Wrench,
  CheckCircle2,
  XCircle,
  Edit2,
  RefreshCw,
  Search,
  Building2,
  Boxes,
  AlertCircle,
  Briefcase
} from 'lucide-react';
import { Card, Button, Table, Badge, Modal, Input, Select, Alert } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import type { TipoPerfilUsuario } from '../../types/database.types';

interface UsuarioItem {
  id: string;
  nome: string;
  email: string;
  perfil: TipoPerfilUsuario;
  empresa_id: string | null;
  empresa_nome: string;
  ativo: boolean;
  criado_em: string;
  estoques_responsaveis: { estoque_id: string; estoque_nome: string }[];
}

export const UsuariosPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioItem[]>([]);
  const [empresas, setEmpresas] = useState<{ id: string; nome_fantasia: string }[]>([]);
  const [estoquesDisponiveis, setEstoquesDisponiveis] = useState<{ id: string; nome: string; empresa_id: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [perfilFiltro, setPerfilFiltro] = useState<string>('TODOS');
  const [statusFiltro, setStatusFiltro] = useState<string>('TODOS');

  // Alertas
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modais de Criação / Edição
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal de Confirmação de Ativação / Desativação
  const [confirmToggleUsuario, setConfirmToggleUsuario] = useState<UsuarioItem | null>(null);

  // Formulário
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    senha: '',
    perfil: 'TECNICO' as TipoPerfilUsuario,
    empresa_id: '',
    estoques_permitidos_ids: [] as string[],
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

      // 2. Carrega todos os estoques para permitir associação de permissões
      const { data: estData } = await supabase
        .from('estoques')
        .select('id, nome, empresa_id')
        .eq('ativo', true)
        .order('nome', { ascending: true });
      setEstoquesDisponiveis(estData || []);

      // 3. Carrega usuários com empresas e seus estoques responsáveis
      const { data: usrData, error: usrErr } = await supabase
        .from('usuarios')
        .select(`
          id,
          nome,
          email,
          perfil,
          empresa_id,
          ativo,
          criado_em,
          empresas:empresa_id (nome_fantasia)
        `)
        .order('nome', { ascending: true });

      if (usrErr) throw usrErr;

      // 4. Carrega associações de estoques responsáveis
      const { data: respData } = await supabase
        .from('estoques_responsaveis')
        .select(`
          usuario_id,
          estoque_id,
          estoques:estoque_id (id, nome)
        `)
        .eq('ativo', true);

      const respMap: Record<string, { estoque_id: string; estoque_nome: string }[]> = {};
      respData?.forEach((r: any) => {
        if (!respMap[r.usuario_id]) respMap[r.usuario_id] = [];
        if (r.estoques) {
          respMap[r.usuario_id].push({
            estoque_id: r.estoques.id,
            estoque_nome: r.estoques.nome,
          });
        }
      });

      const listFormatada: UsuarioItem[] = (usrData || []).map((u: any) => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        perfil: u.perfil,
        empresa_id: u.empresa_id,
        empresa_nome: (u.empresas as any)?.nome_fantasia || 'Acesso Global / Matriz',
        ativo: u.ativo,
        criado_em: u.criado_em,
        estoques_responsaveis: respMap[u.id] || [],
      }));

      setUsuarios(listFormatada);
    } catch (err: any) {
      console.error('Erro ao carregar usuários:', err);
      setErrorMsg(err.message || 'Falha ao buscar usuários no banco de dados.');
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
      nome: '',
      email: '',
      senha: '',
      perfil: 'TECNICO',
      empresa_id: empresas[0]?.id || currentUser?.empresaAtivaId || '',
      estoques_permitidos_ids: [],
    });
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (u: UsuarioItem) => {
    setIsEditing(true);
    setEditingId(u.id);
    setFormData({
      nome: u.nome,
      email: u.email,
      senha: '', // Não edita senha aqui
      perfil: u.perfil,
      empresa_id: u.empresa_id || empresas[0]?.id || '',
      estoques_permitidos_ids: u.estoques_responsaveis.map((r) => r.estoque_id),
    });
    setErrorMsg(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validações
    if (!formData.nome.trim()) {
      setErrorMsg('O nome do usuário é obrigatório.');
      return;
    }
    if (!formData.email.trim()) {
      setErrorMsg('O e-mail do usuário é obrigatório.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && editingId) {
        // Atualiza perfil e dados do usuário existente
        const { error: updErr } = await supabase
          .from('usuarios')
          .update({
            nome: formData.nome.trim(),
            perfil: formData.perfil,
            empresa_id: formData.empresa_id || null,
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', editingId);

        if (updErr) throw updErr;

        // Atualiza vínculos de estoques responsáveis
        await supabase
          .from('estoques_responsaveis')
          .delete()
          .eq('usuario_id', editingId);

        if (formData.estoques_permitidos_ids.length > 0) {
          const insertPayload = formData.estoques_permitidos_ids.map((estId) => ({
            usuario_id: editingId,
            estoque_id: estId,
            ativo: true,
          }));
          await supabase.from('estoques_responsaveis').insert(insertPayload);
        }

        setSuccessMsg(`Usuário "${formData.nome}" atualizado com sucesso!`);
      } else {
        // Novo Usuário via Procedimento Controlado RPC
        if (!formData.senha || formData.senha.length < 6) {
          throw new Error('A senha de acesso provisória deve conter no mínimo 6 caracteres.');
        }

        const { data: newUserId, error: rpcErr } = await supabase.rpc('criar_usuario_sistema', {
          p_email: formData.email.trim().toLowerCase(),
          p_senha: formData.senha,
          p_nome: formData.nome.trim(),
          p_perfil: formData.perfil,
          p_empresa_id: formData.empresa_id || null,
          p_ativo: true,
        });

        if (rpcErr) {
          if (rpcErr.message.includes('Já existe um usuário cadastrado')) {
            throw new Error(`O e-mail "${formData.email}" já está cadastrado no sistema.`);
          }
          throw rpcErr;
        }

        // Associa estoques autorizados
        if (newUserId && formData.estoques_permitidos_ids.length > 0) {
          const insertPayload = formData.estoques_permitidos_ids.map((estId) => ({
            usuario_id: newUserId,
            estoque_id: estId,
            ativo: true,
          }));
          await supabase.from('estoques_responsaveis').insert(insertPayload);
        }

        setSuccessMsg(`Usuário "${formData.nome}" cadastrado com sucesso!`);
      }

      setIsModalOpen(false);
      await carregarDados();
    } catch (err: any) {
      console.error('Falha ao salvar usuário:', err);
      setErrorMsg(err.message || 'Erro ao persistir dados do usuário.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAtivo = async () => {
    if (!confirmToggleUsuario) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const novoStatus = !confirmToggleUsuario.ativo;
      const { error: toggleError } = await supabase
        .from('usuarios')
        .update({
          ativo: novoStatus,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', confirmToggleUsuario.id);

      if (toggleError) throw toggleError;

      setSuccessMsg(
        `Usuário "${confirmToggleUsuario.nome}" foi ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`
      );
      setConfirmToggleUsuario(null);
      await carregarDados();
    } catch (err: any) {
      console.error('Erro ao alterar status do usuário:', err);
      setErrorMsg(err.message || 'Falha ao alterar status do usuário.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const usuariosFiltrados = usuarios.filter((u) => {
    const termo = searchTerm.toLowerCase();
    const matchTermo =
      u.nome.toLowerCase().includes(termo) ||
      u.email.toLowerCase().includes(termo) ||
      u.empresa_nome.toLowerCase().includes(termo);
    const matchPerfil = perfilFiltro === 'TODOS' || u.perfil === perfilFiltro;
    const matchStatus =
      statusFiltro === 'TODOS' ||
      (statusFiltro === 'ATIVOS' && u.ativo) ||
      (statusFiltro === 'INATIVOS' && !u.ativo);

    return matchTermo && matchPerfil && matchStatus;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1>Técnicos e Usuários do Sistema</h1>
          <p style={{ marginTop: '2px', color: 'var(--color-text-secondary)' }}>
            Gerencie credenciais, alçadas de perfil, empresas vinculadas e estoques autorizados.
          </p>
        </div>
        {currentUser?.perfil === 'ADMINISTRADOR' && (
          <Button
            variant="primary"
            leftIcon={<UserPlus size={16} />}
            onClick={handleOpenCreateModal}
          >
            Novo Usuário / Técnico
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

      {/* Barra de Filtros e Busca */}
      <Card padding="sm">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 'var(--space-3)', alignItems: 'center' }}>
          <Input
            label=""
            placeholder="Buscar por Nome, E-mail ou Empresa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search size={16} />}
          />

          <Select
            label=""
            value={perfilFiltro}
            onChange={(e) => setPerfilFiltro(e.target.value)}
            options={[
              { value: 'TODOS', label: 'Todos os Perfis' },
              { value: 'ADMINISTRADOR', label: 'Apenas Administradores' },
              { value: 'GERENTE', label: 'Apenas Gerentes' },
              { value: 'TECNICO', label: 'Apenas Técnicos de Campo' },
            ]}
          />

          <Select
            label=""
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
            options={[
              { value: 'TODOS', label: 'Todos os Status' },
              { value: 'ATIVOS', label: 'Apenas Ativos' },
              { value: 'INATIVOS', label: 'Apenas Desativados' },
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

      {/* Tabela de Usuários */}
      <Card>
        {isLoading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            <div className="spinner" style={{ width: '2rem', height: '2rem', margin: '0 auto var(--space-3)' }} />
            <span>Consultando usuários e permissões de acesso...</span>
          </div>
        ) : usuariosFiltrados.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <Briefcase size={40} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <p>Nenhum usuário encontrado com os filtros selecionados.</p>
          </div>
        ) : (
          <Table
            keyExtractor={(u) => u.id}
            data={usuariosFiltrados}
            columns={[
              {
                key: 'nome',
                header: 'Usuário',
                render: (u) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: u.perfil === 'ADMINISTRADOR' ? 'var(--color-primary)' : 'var(--color-surface-hover)',
                      color: u.perfil === 'ADMINISTRADOR' ? 'var(--color-text-inverse)' : 'var(--color-text-main)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 600,
                    }}>
                      {u.nome.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <strong>{u.nome}</strong>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        {u.email}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'perfil',
                header: 'Perfil de Acesso',
                render: (u) => {
                  if (u.perfil === 'ADMINISTRADOR') {
                    return <Badge variant="info" icon={<Shield size={12} />}>Administrador</Badge>;
                  }
                  if (u.perfil === 'GERENTE') {
                    return <Badge variant="neutral" icon={<Briefcase size={12} />}>Gerente</Badge>;
                  }
                  return <Badge variant="success" icon={<Wrench size={12} />}>Técnico</Badge>;
                },
              },
              {
                key: 'empresa_nome',
                header: 'Empresa Vinculada',
                render: (u) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--font-size-xs)' }}>
                    <Building2 size={12} style={{ color: 'var(--color-text-muted)' }} />
                    <span>{u.empresa_nome}</span>
                  </div>
                ),
              },
              {
                key: 'estoques_responsaveis',
                header: 'Estoques sob Responsabilidade',
                render: (u) => {
                  if (u.perfil === 'ADMINISTRADOR') {
                    return <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Todos os Depósitos</span>;
                  }
                  if (u.estoques_responsaveis.length === 0) {
                    return <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Nenhum estoque atribuído</span>;
                  }
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {u.estoques_responsaveis.map((est) => (
                        <span
                          key={est.estoque_id}
                          style={{
                            backgroundColor: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '1px 6px',
                            fontSize: '0.7rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <Boxes size={10} /> {est.estoque_nome}
                        </span>
                      ))}
                    </div>
                  );
                },
              },
              {
                key: 'ativo',
                header: 'Status',
                render: (u) => (
                  <Badge
                    variant={u.ativo ? 'success' : 'danger'}
                    icon={u.ativo ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  >
                    {u.ativo ? 'Ativo' : 'Desativado'}
                  </Badge>
                ),
              },
              {
                key: 'acoes',
                header: 'Ações',
                align: 'right',
                render: (u) => (
                  <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Edit2 size={14} />}
                      onClick={() => handleOpenEditModal(u)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      style={{ color: u.ativo ? 'var(--color-danger)' : 'var(--color-success)' }}
                      onClick={() => setConfirmToggleUsuario(u)}
                    >
                      {u.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Modal de Criação / Edição de Usuário */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? 'Editar Usuário e Permissões' : 'Cadastrar Novo Usuário ou Técnico'}
        description={
          isEditing
            ? 'Atualize o perfil, empresa e depósitos atribuídos ao colaborador.'
            : 'Provisione uma conta controlada com senha e alçadas de acesso.'
        }
        footerActions={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleFormSubmit} isLoading={isSubmitting}>
              {isEditing ? 'Salvar Alterações' : 'Concluir Cadastro'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleFormSubmit}>
          <Input
            label="Nome Completo"
            required
            value={formData.nome}
            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            placeholder="Ex: João Pereira da Silva"
          />

          <Input
            label="E-mail Corporativo"
            type="email"
            required
            disabled={isEditing}
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="joao.pereira@empresa.com.br"
          />

          {!isEditing && (
            <Input
              label="Senha Inicial de Acesso (Mínimo 6 dígitos)"
              type="password"
              required
              value={formData.senha}
              onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
              placeholder="••••••••"
            />
          )}

          <div className="form-grid-2">
            <Select
              label="Perfil de Alçada"
              required
              value={formData.perfil}
              onChange={(e) => setFormData({ ...formData, perfil: e.target.value as TipoPerfilUsuario })}
              options={[
                { value: 'TECNICO', label: 'Técnico de Campo (Acesso Mobile)' },
                { value: 'GERENTE', label: 'Gerente (Operação e Gestão Parcial)' },
                { value: 'ADMINISTRADOR', label: 'Administrador (Acesso Total)' },
              ]}
            />

            <Select
              label="Empresa Principal"
              value={formData.empresa_id}
              onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })}
              options={empresas.map((emp) => ({ value: emp.id, label: emp.nome_fantasia }))}
            />
          </div>

          {/* Configuração de Estoques Permitidos */}
          {formData.perfil !== 'ADMINISTRADOR' && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 500, marginBottom: 'var(--space-1)' }}>
                Estoques Permitidos para o Usuário
              </label>
              <div style={{
                maxHeight: '130px',
                overflowY: 'auto',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-2)',
                backgroundColor: 'var(--color-surface)',
              }}>
                {estoquesDisponiveis.length === 0 ? (
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    Nenhum estoque cadastrado no sistema.
                  </span>
                ) : (
                  estoquesDisponiveis.map((est) => (
                    <label
                      key={est.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        padding: 'var(--space-1)',
                        fontSize: 'var(--font-size-xs)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.estoques_permitidos_ids.includes(est.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              estoques_permitidos_ids: [...formData.estoques_permitidos_ids, est.id],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              estoques_permitidos_ids: formData.estoques_permitidos_ids.filter((id) => id !== est.id),
                            });
                          }
                        }}
                        style={{ accentColor: 'var(--color-primary)' }}
                      />
                      <span>
                        <Boxes size={11} style={{ display: 'inline', marginRight: '3px' }} />
                        {est.nome}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* Modal de Confirmação de Ativação / Desativação */}
      <Modal
        isOpen={Boolean(confirmToggleUsuario)}
        onClose={() => setConfirmToggleUsuario(null)}
        title={confirmToggleUsuario?.ativo ? 'Desativar Usuário' : 'Reativar Usuário'}
        description={`Confirmação de alteração de status para "${confirmToggleUsuario?.nome}".`}
        footerActions={
          <>
            <Button variant="secondary" onClick={() => setConfirmToggleUsuario(null)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              variant={confirmToggleUsuario?.ativo ? 'danger' : 'primary'}
              onClick={handleToggleAtivo}
              isLoading={isSubmitting}
            >
              {confirmToggleUsuario?.ativo ? 'Confirmar Desativação' : 'Confirmar Reativação'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <AlertCircle size={24} style={{ color: confirmToggleUsuario?.ativo ? 'var(--color-danger)' : 'var(--color-primary)', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-main)', marginBottom: 'var(--space-2)' }}>
              {confirmToggleUsuario?.ativo
                ? 'Ao desativar a conta deste usuário, seu acesso à plataforma será imediatamente suspenso. Todas as movimentações, históricos e auditorias passadas continuam integralmente preservadas.'
                : 'O usuário será reativado e poderá realizar login e operações conforme suas permissões de perfil.'}
            </p>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Preservação de histórico obrigatória: Nenhuma exclusão física de usuário é realizada.
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
};
