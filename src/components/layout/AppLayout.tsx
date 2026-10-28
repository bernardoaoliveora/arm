import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Alert } from '../ui/Alert';

export const AppLayout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  // Fecha o drawer automaticamente ao mudar de rota em telas pequenas
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-container">
      {/* Backdrop semi-transparente para o drawer mobile */}
      <div
        className={`sidebar-backdrop ${isSidebarOpen ? 'active' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="main-wrapper">
        <Header
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          isSidebarOpen={isSidebarOpen}
        />
        <main className="main-content">
          {!isSupabaseConfigured && (
            <Alert
              variant="info"
              title="Ambiente de Estruturação e Demonstração"
              className="mb-4"
            >
              As rotas, componentes e layout estão ativos e operando com dados estruturados da arquitetura. 
              Para habilitar persistência real no PostgreSQL, insira as chaves reais em seu arquivo <code>.env</code>.
            </Alert>
          )}
          <Outlet />
        </main>
        <MobileNav />
      </div>
    </div>
  );
};

