import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Flame, CornerDownLeft, History } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';

export const MobileNav: React.FC = () => {
  const { user } = useAuth();
  const isTecnico = user?.perfil === 'TECNICO';

  return (
    <nav className="bottom-nav">
      <NavLink
        to="/dashboard"
        className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
      >
        <LayoutDashboard size={20} />
        <span>{isTecnico ? 'Mochila' : 'Início'}</span>
      </NavLink>

      <NavLink
        to="/movimentacoes/retirada"
        className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
      >
        <PlusCircle size={20} />
        <span>Retirar</span>
      </NavLink>

      <NavLink
        to="/movimentacoes/utilizacao"
        className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
      >
        <Flame size={20} />
        <span>Consumo</span>
      </NavLink>

      <NavLink
        to="/movimentacoes/devolucao"
        className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
      >
        <CornerDownLeft size={20} />
        <span>Devolver</span>
      </NavLink>

      <NavLink
        to="/historico"
        className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
      >
        <History size={20} />
        <span>Extrato</span>
      </NavLink>
    </nav>
  );
};
