import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Boxes,
  Package,
  Users,
  ArrowLeftRight,
  History,
  AlertTriangle,
  Settings,
  PlusCircle,
  CornerDownLeft,
  Flame,
  ShieldCheck,
  UserCheck,
  Briefcase,
  X,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import type { NavItemConfig } from '../../types/app.types';

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const { user } = useAuth();
  const perfil = user?.perfil || 'TECNICO';

  const allNavItems: NavItemConfig[] = [
    // Gestão do Negócio
    { label: 'Visão Geral', path: '/dashboard', icon: 'LayoutDashboard', perfisPermitidos: ['ADMINISTRADOR', 'GERENTE'], section: 'GESTAO' },
    { label: 'Empresas', path: '/empresas', icon: 'Building2', perfisPermitidos: ['ADMINISTRADOR'], section: 'GESTAO' },
    { label: 'Estoques', path: '/estoques', icon: 'Boxes', perfisPermitidos: ['ADMINISTRADOR', 'GERENTE'], section: 'GESTAO' },
    { label: 'Catálogo de Produtos', path: '/produtos', icon: 'Package', perfisPermitidos: ['ADMINISTRADOR', 'GERENTE'], section: 'GESTAO' },
    { label: 'Técnicos & Equipe', path: '/usuarios', icon: 'Users', perfisPermitidos: ['ADMINISTRADOR'], section: 'GESTAO' },
    
    // Operações
    { label: 'Central Operacional', path: '/movimentacoes', icon: 'ArrowLeftRight', perfisPermitidos: ['ADMINISTRADOR', 'GERENTE'], section: 'OPERACIONAL' },
    { label: 'Transferências', path: '/transferencias', icon: 'ArrowLeftRight', perfisPermitidos: ['ADMINISTRADOR', 'GERENTE'], section: 'OPERACIONAL' },
    { label: 'Histórico & Auditoria', path: '/historico', icon: 'History', perfisPermitidos: ['ADMINISTRADOR', 'GERENTE'], section: 'OPERACIONAL' },
    { label: 'Alertas de Reposição', path: '/alertas', icon: 'AlertTriangle', perfisPermitidos: ['ADMINISTRADOR', 'GERENTE'], section: 'OPERACIONAL' },
    
    // Governança / Sistema
    { label: 'Aprovações & Ajustes', path: '/configuracoes', icon: 'Settings', perfisPermitidos: ['ADMINISTRADOR'], section: 'SISTEMA' },

    // Funções Específicas de Técnico de Campo
    { label: 'Minha Mochila (Início)', path: '/dashboard', icon: 'LayoutDashboard', perfisPermitidos: ['TECNICO'], section: 'OPERACIONAL' },
    { label: 'Registrar Retirada', path: '/movimentacoes/retirada', icon: 'PlusCircle', perfisPermitidos: ['TECNICO'], section: 'OPERACIONAL' },
    { label: 'Apontar Consumo / Perda', path: '/movimentacoes/utilizacao', icon: 'Flame', perfisPermitidos: ['TECNICO'], section: 'OPERACIONAL' },
    { label: 'Devolver Ferramentas / Sobras', path: '/movimentacoes/devolucao', icon: 'CornerDownLeft', perfisPermitidos: ['TECNICO'], section: 'OPERACIONAL' },
    { label: 'Meu Extrato Histórico', path: '/historico', icon: 'History', perfisPermitidos: ['TECNICO'], section: 'OPERACIONAL' },
  ];

  const filteredItems = allNavItems.filter(item => item.perfisPermitidos.includes(perfil));

  const renderIcon = (iconName: string) => {
    const size = 18;
    switch (iconName) {
      case 'LayoutDashboard': return <LayoutDashboard size={size} />;
      case 'Building2': return <Building2 size={size} />;
      case 'Boxes': return <Boxes size={size} />;
      case 'Package': return <Package size={size} />;
      case 'Users': return <Users size={size} />;
      case 'ArrowLeftRight': return <ArrowLeftRight size={size} />;
      case 'History': return <History size={size} />;
      case 'AlertTriangle': return <AlertTriangle size={size} />;
      case 'Settings': return <Settings size={size} />;
      case 'PlusCircle': return <PlusCircle size={size} />;
      case 'CornerDownLeft': return <CornerDownLeft size={size} />;
      case 'Flame': return <Flame size={size} />;
      default: return <Boxes size={size} />;
    }
  };

  const gestaoItems = filteredItems.filter(i => i.section === 'GESTAO');
  const operacionalItems = filteredItems.filter(i => i.section === 'OPERACIONAL');
  const sistemaItems = filteredItems.filter(i => i.section === 'SISTEMA');

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div
          className="sidebar-logo"
          onClick={isCollapsed ? onToggleCollapse : undefined}
          style={{ cursor: isCollapsed ? 'pointer' : 'default' }}
          title={isCollapsed ? 'Expandir menu lateral' : undefined}
        >
          <Boxes size={22} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span className="sidebar-logo-text">ESTOQUE PRO</span>
        </div>

        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
          title={isCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
        >
          {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>

        <button
          type="button"
          className="sidebar-close-btn"
          onClick={onClose}
          aria-label="Fechar menu lateral"
        >
          <X size={20} />
        </button>
      </div>

      <div className="sidebar-nav">
        {gestaoItems.length > 0 && (
          <>
            <span className="nav-section-title">Gestão do Negócio</span>
            {gestaoItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="nav-item-icon">{renderIcon(item.icon)}</span>
                <span className="nav-item-label">{item.label}</span>
              </NavLink>
            ))}
          </>
        )}

        {operacionalItems.length > 0 && (
          <>
            <span className="nav-section-title">
              {perfil === 'TECNICO' ? 'Minhas Funções em Campo' : 'Operações & Estoque'}
            </span>
            {operacionalItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="nav-item-icon">{renderIcon(item.icon)}</span>
                <span className="nav-item-label">{item.label}</span>
              </NavLink>
            ))}
          </>
        )}

        {sistemaItems.length > 0 && (
          <>
            <span className="nav-section-title">Governança & Controle</span>
            {sistemaItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="nav-item-icon">{renderIcon(item.icon)}</span>
                <span className="nav-item-label">{item.label}</span>
              </NavLink>
            ))}
          </>
        )}
      </div>

      <div
        className="sidebar-footer"
        title={isCollapsed ? `Perfil Ativo: ${perfil}` : undefined}
      >
        <div className="sidebar-footer-content">
          {perfil === 'ADMINISTRADOR' && <ShieldCheck size={16} color="var(--color-accent)" style={{ flexShrink: 0 }} />}
          {perfil === 'GERENTE' && <Briefcase size={16} color="var(--color-warning)" style={{ flexShrink: 0 }} />}
          {perfil === 'TECNICO' && <UserCheck size={16} color="var(--color-success)" style={{ flexShrink: 0 }} />}
          <span className="sidebar-footer-text">Perfil Ativo: <strong>{perfil}</strong></span>
        </div>
      </div>
    </aside>
  );
};
