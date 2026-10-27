import type { TipoPerfilUsuario } from './database.types';

export interface UserProfile {
  id: string;
  nome: string;
  email: string;
  perfil: TipoPerfilUsuario;
  empresaAtivaId?: string;
  empresaAtivaNome?: string;
}

export interface NavItemConfig {
  label: string;
  path: string;
  icon: string;
  perfisPermitidos: TipoPerfilUsuario[];
  badge?: number | string;
  section?: 'OPERACIONAL' | 'GESTAO' | 'SISTEMA';
}

export interface TableColumn<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (row: T) => React.ReactNode;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  totalItems: number;
}
