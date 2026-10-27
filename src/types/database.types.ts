/**
 * Definições TypeScript do Esquema Relacional do Supabase / PostgreSQL
 */

export type TipoPerfilUsuario = 'ADMINISTRADOR' | 'GERENTE' | 'TECNICO';
export type TipoNaturezaProduto = 'CONSUMIVEL' | 'REUTILIZAVEL';
export type TipoModoRastreio = 'QUANTIDADE_AGREGADA' | 'INDIVIDUAL_SERIALIZADO';
export type TipoEstadoConservacao = 'NOVO' | 'BOM' | 'REGULAR' | 'AVARIADO' | 'EM_MANUTENCAO';
export type TipoStatusSerializado = 'DISPONIVEL' | 'EM_CUSTODIA' | 'QUARENTENA' | 'EXTRAVIADO' | 'BAIXADO';
export type TipoMovimentacao = 
  | 'ENTRADA'
  | 'RETIRADA'
  | 'CONSUMO'
  | 'DEVOLUCAO_FERRAMENTA'
  | 'DEVOLUCAO_SOBRA'
  | 'TRANSFERENCIA'
  | 'AJUSTE_INVENTARIO'
  | 'BAIXA_PERDA_DANO'
  | 'ESTORNO';
export type TipoStatusOcorrencia = 'PENDENTE_APROVACAO' | 'APROVADO' | 'REJEITADO';

export interface Database {
  public: {
    Tables: {
      empresas: {
        Row: {
          id: string;
          razao_social: string;
          nome_fantasia: string;
          documento: string;
          ativo: boolean;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          razao_social: string;
          nome_fantasia: string;
          documento: string;
          ativo?: boolean;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: Partial<Database['public']['Tables']['empresas']['Row']>;
      };
      usuarios: {
        Row: {
          id: string;
          nome: string;
          email: string;
          perfil: TipoPerfilUsuario;
          empresa_id: string | null;
          ativo: boolean;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id: string;
          nome: string;
          email: string;
          perfil?: TipoPerfilUsuario;
          empresa_id?: string | null;
          ativo?: boolean;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: Partial<Database['public']['Tables']['usuarios']['Row']>;
      };
      usuarios_empresas: {
        Row: {
          id: string;
          usuario_id: string;
          empresa_id: string;
          ativo: boolean;
          criado_em: string;
        };
        Insert: {
          id?: string;
          usuario_id: string;
          empresa_id: string;
          ativo?: boolean;
          criado_em?: string;
        };
        Update: Partial<Database['public']['Tables']['usuarios_empresas']['Row']>;
      };
      estoques: {
        Row: {
          id: string;
          empresa_id: string;
          nome: string;
          tipo: string;
          localizacao: string | null;
          descricao: string | null;
          ativo: boolean;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          nome: string;
          tipo?: string;
          localizacao?: string | null;
          descricao?: string | null;
          ativo?: boolean;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: Partial<Database['public']['Tables']['estoques']['Row']>;
      };
      estoques_responsaveis: {
        Row: {
          id: string;
          estoque_id: string;
          usuario_id: string;
          ativo: boolean;
          criado_em: string;
        };
        Insert: {
          id?: string;
          estoque_id: string;
          usuario_id: string;
          ativo?: boolean;
          criado_em?: string;
        };
        Update: Partial<Database['public']['Tables']['estoques_responsaveis']['Row']>;
      };
      categorias: {
        Row: {
          id: string;
          empresa_id: string;
          nome: string;
          descricao: string | null;
          ativo: boolean;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          nome: string;
          descricao?: string | null;
          ativo?: boolean;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: Partial<Database['public']['Tables']['categorias']['Row']>;
      };
      produtos: {
        Row: {
          id: string;
          empresa_id: string;
          categoria_id: string | null;
          codigo_sku: string;
          nome: string;
          descricao: string | null;
          tipo: TipoNaturezaProduto;
          modo_rastreio: TipoModoRastreio;
          unidade_medida: string;
          permite_fracionamento: boolean;
          estoque_minimo: number;
          ativo: boolean;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          categoria_id?: string | null;
          codigo_sku: string;
          nome: string;
          descricao?: string | null;
          tipo?: TipoNaturezaProduto;
          modo_rastreio?: TipoModoRastreio;
          unidade_medida?: string;
          permite_fracionamento?: boolean;
          estoque_minimo?: number;
          ativo?: boolean;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: Partial<Database['public']['Tables']['produtos']['Row']>;
      };
      estoque_itens: {
        Row: {
          id: string;
          estoque_id: string;
          produto_id: string;
          quantidade_disponivel: number;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          estoque_id: string;
          produto_id: string;
          quantidade_disponivel?: number;
          atualizado_em?: string;
        };
        Update: Partial<Database['public']['Tables']['estoque_itens']['Row']>;
      };
      itens_serializados: {
        Row: {
          id: string;
          empresa_id: string;
          produto_id: string;
          numero_patrimonio: string;
          numero_serie: string | null;
          estado_conservacao: TipoEstadoConservacao;
          status: TipoStatusSerializado;
          estoque_atual_id: string | null;
          tecnico_custodia_id: string | null;
          observacoes: string | null;
          ativo: boolean;
          criado_em: string;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          produto_id: string;
          numero_patrimonio: string;
          numero_serie?: string | null;
          estado_conservacao?: TipoEstadoConservacao;
          status?: TipoStatusSerializado;
          estoque_atual_id?: string | null;
          tecnico_custodia_id?: string | null;
          observacoes?: string | null;
          ativo?: boolean;
          criado_em?: string;
          atualizado_em?: string;
        };
        Update: Partial<Database['public']['Tables']['itens_serializados']['Row']>;
      };
      custodia_itens: {
        Row: {
          id: string;
          tecnico_id: string;
          produto_id: string;
          quantidade_posse: number;
          atualizado_em: string;
        };
        Insert: {
          id?: string;
          tecnico_id: string;
          produto_id: string;
          quantidade_posse?: number;
          atualizado_em?: string;
        };
        Update: Partial<Database['public']['Tables']['custodia_itens']['Row']>;
      };
      ocorrencias: {
        Row: {
          id: string;
          empresa_id: string;
          solicitante_id: string;
          produto_id: string;
          item_serializado_id: string | null;
          estoque_id: string | null;
          tipo: 'PERDA' | 'DANO' | 'EXTRAVIO';
          quantidade: number;
          justificativa: string;
          status: TipoStatusOcorrencia;
          analisado_por_id: string | null;
          parecer_aprovador: string | null;
          analisado_em: string | null;
          criado_em: string;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          solicitante_id: string;
          produto_id: string;
          item_serializado_id?: string | null;
          estoque_id?: string | null;
          tipo: 'PERDA' | 'DANO' | 'EXTRAVIO';
          quantidade: number;
          justificativa: string;
          status?: TipoStatusOcorrencia;
          analisado_por_id?: string | null;
          parecer_aprovador?: string | null;
          analisado_em?: string | null;
          criado_em?: string;
        };
        Update: Partial<Database['public']['Tables']['ocorrencias']['Row']>;
      };
      movimentacoes: {
        Row: {
          id: string;
          empresa_id: string;
          tipo: TipoMovimentacao;
          usuario_operador_id: string;
          tecnico_envolvido_id: string | null;
          estoque_origem_id: string | null;
          estoque_destino_id: string | null;
          ocorrencia_id: string | null;
          movimentacao_estornada_id: string | null;
          justificativa: string | null;
          criado_em: string;
        };
        Insert: {
          id?: string;
          empresa_id: string;
          tipo: TipoMovimentacao;
          usuario_operador_id: string;
          tecnico_envolvido_id?: string | null;
          estoque_origem_id?: string | null;
          estoque_destino_id?: string | null;
          ocorrencia_id?: string | null;
          movimentacao_estornada_id?: string | null;
          justificativa?: string | null;
          criado_em?: string;
        };
        Update: never;
      };
      movimentacao_itens: {
        Row: {
          id: string;
          movimentacao_id: string;
          produto_id: string;
          item_serializado_id: string | null;
          quantidade: number;
          estado_conservacao: string | null;
        };
        Insert: {
          id?: string;
          movimentacao_id: string;
          produto_id: string;
          item_serializado_id?: string | null;
          quantidade: number;
          estado_conservacao?: string | null;
        };
        Update: never;
      };
    };
    Functions: {
      criar_usuario_sistema: {
        Args: {
          p_email: string;
          p_senha: string;
          p_nome: string;
          p_perfil: TipoPerfilUsuario;
          p_empresa_id: string | null;
          p_ativo?: boolean;
        };
        Returns: string;
      };
      obter_perfil_atual: {
        Args: Record<PropertyKey, never>;
        Returns: TipoPerfilUsuario;
      };
      usuario_esta_ativo: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      usuario_tem_acesso_empresa: {
        Args: {
          p_empresa_id: string;
        };
        Returns: boolean;
      };
    };
  };
}
