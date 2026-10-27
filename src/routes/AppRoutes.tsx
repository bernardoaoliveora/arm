import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { NotFound } from './NotFound';

// Páginas Importadas
import { LoginPage } from '../features/auth/LoginPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { EmpresasPage } from '../features/empresas/EmpresasPage';
import { EstoquesPage } from '../features/estoques/EstoquesPage';
import { ProdutosPage } from '../features/produtos/ProdutosPage';
import { DetalhesProdutoPage } from '../features/produtos/DetalhesProdutoPage';
import { UsuariosPage } from '../features/usuarios/UsuariosPage';
import { MovimentacoesPage } from '../features/movimentacoes/MovimentacoesPage';
import { RegistrarEntradaPage } from '../features/movimentacoes/RegistrarEntradaPage';
import { RegistrarRetiradaPage } from '../features/movimentacoes/RegistrarRetiradaPage';
import { RegistrarUtilizacaoPage } from '../features/movimentacoes/RegistrarUtilizacaoPage';
import { RegistrarDevolucaoPage } from '../features/movimentacoes/RegistrarDevolucaoPage';
import { TransferenciasPage } from '../features/movimentacoes/TransferenciasPage';
import { HistoricoPage } from '../features/movimentacoes/HistoricoPage';
import { AlertasPage } from '../features/alertas/AlertasPage';
import { ConfiguracoesPage } from '../features/configuracoes/ConfiguracoesPage';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Rota Pública */}
      <Route path="/login" element={<LoginPage />} />

      {/* Rotas Autenticadas no Layout Padrão */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />

        {/* Gestão Administrativa */}
        <Route
          path="empresas"
          element={
            <ProtectedRoute allowedRoles={['ADMINISTRADOR']}>
              <EmpresasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="estoques"
          element={
            <ProtectedRoute allowedRoles={['ADMINISTRADOR', 'GERENTE']}>
              <EstoquesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="produtos"
          element={
            <ProtectedRoute allowedRoles={['ADMINISTRADOR', 'GERENTE']}>
              <ProdutosPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="produtos/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMINISTRADOR', 'GERENTE']}>
              <DetalhesProdutoPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="usuarios"
          element={
            <ProtectedRoute allowedRoles={['ADMINISTRADOR']}>
              <UsuariosPage />
            </ProtectedRoute>
          }
        />

        {/* Operações e Movimentações */}
        <Route path="movimentacoes" element={<MovimentacoesPage />} />
        <Route
          path="movimentacoes/entrada"
          element={
            <ProtectedRoute allowedRoles={['ADMINISTRADOR', 'GERENTE']}>
              <RegistrarEntradaPage />
            </ProtectedRoute>
          }
        />
        <Route path="movimentacoes/retirada" element={<RegistrarRetiradaPage />} />
        <Route path="movimentacoes/utilizacao" element={<RegistrarUtilizacaoPage />} />
        <Route path="movimentacoes/devolucao" element={<RegistrarDevolucaoPage />} />
        <Route
          path="transferencias"
          element={
            <ProtectedRoute allowedRoles={['ADMINISTRADOR', 'GERENTE']}>
              <TransferenciasPage />
            </ProtectedRoute>
          }
        />

        {/* Auditoria e Governança */}
        <Route path="historico" element={<HistoricoPage />} />
        <Route
          path="alertas"
          element={
            <ProtectedRoute allowedRoles={['ADMINISTRADOR', 'GERENTE']}>
              <AlertasPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="configuracoes"
          element={
            <ProtectedRoute allowedRoles={['ADMINISTRADOR']}>
              <ConfiguracoesPage />
            </ProtectedRoute>
          }
        />

        {/* 404 Tratado dentro do Layout */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
};
