import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Alert } from '../ui/Alert';

export const AppLayout: React.FC = () => {
  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-wrapper">
        <Header />
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
