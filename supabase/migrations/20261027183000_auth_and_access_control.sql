-- ============================================================================
-- MIGRATION: 20261027183000_auth_and_access_control.sql
-- DESCRIÇÃO: Estrutura de Empresas, Perfis, Usuários e Políticas RLS (Multi-Tenant)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TIPOS ENUM
DO $$ BEGIN
    CREATE TYPE tipo_perfil_usuario AS ENUM ('ADMINISTRADOR', 'GERENTE', 'TECNICO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA DE EMPRESAS (TENANT)
CREATE TABLE IF NOT EXISTS public.empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    razao_social VARCHAR(200) NOT NULL,
    nome_fantasia VARCHAR(200) NOT NULL,
    documento VARCHAR(20) UNIQUE NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABELA DE PERFIS DE USUÁRIO (VINCULADA A auth.users)
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    perfil tipo_perfil_usuario NOT NULL DEFAULT 'TECNICO',
    empresa_id UUID REFERENCES public.empresas(id) ON DELETE RESTRICT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. TABELA ASSOCIATIVA USUÁRIOS <-> EMPRESAS
CREATE TABLE IF NOT EXISTS public.usuarios_empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_usuario_empresa UNIQUE (usuario_id, empresa_id)
);

-- 5. FUNÇÕES DE SEGURANÇA E ALÇADA (SECURITY DEFINER)
-- Obtém o perfil do usuário autenticado atual de forma segura
CREATE OR REPLACE FUNCTION public.obter_perfil_atual()
RETURNS tipo_perfil_usuario AS $$
    SELECT perfil FROM public.usuarios 
    WHERE id = auth.uid() AND ativo = true;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Verifica se o usuário autenticado está ativo no sistema
CREATE OR REPLACE FUNCTION public.usuario_esta_ativo()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.usuarios 
        WHERE id = auth.uid() AND ativo = true
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Verifica se o usuário tem autorização para consultar dados de determinada empresa
CREATE OR REPLACE FUNCTION public.usuario_tem_acesso_empresa(p_empresa_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.id = auth.uid() AND u.ativo = true AND (
            u.perfil = 'ADMINISTRADOR'
            OR u.empresa_id = p_empresa_id
            OR EXISTS (
                SELECT 1 FROM public.usuarios_empresas ue
                WHERE ue.usuario_id = auth.uid() 
                  AND ue.empresa_id = p_empresa_id 
                  AND ue.ativo = true
            )
        )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 6. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS)
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_empresas ENABLE ROW LEVEL SECURITY;

-- 7. POLÍTICAS DE RLS PARA public.empresas
DROP POLICY IF EXISTS "Leitura de empresas autorizadas" ON public.empresas;
CREATE POLICY "Leitura de empresas autorizadas"
ON public.empresas FOR SELECT
USING (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR public.usuario_tem_acesso_empresa(id)
    )
);

DROP POLICY IF EXISTS "Modificacao de empresas restrita a administradores" ON public.empresas;
CREATE POLICY "Modificacao de empresas restrita a administradores"
ON public.empresas FOR ALL
USING (
    public.usuario_esta_ativo() AND public.obter_perfil_atual() = 'ADMINISTRADOR'
)
WITH CHECK (
    public.usuario_esta_ativo() AND public.obter_perfil_atual() = 'ADMINISTRADOR'
);

-- 8. POLÍTICAS DE RLS PARA public.usuarios
DROP POLICY IF EXISTS "Leitura de perfis de usuario" ON public.usuarios;
CREATE POLICY "Leitura de perfis de usuario"
ON public.usuarios FOR SELECT
USING (
    -- Usuário pode consultar seu próprio perfil ou Administrador pode consultar todos
    auth.uid() = id
    OR (
        public.usuario_esta_ativo() AND (
            public.obter_perfil_atual() = 'ADMINISTRADOR'
            OR (public.obter_perfil_atual() = 'GERENTE' AND public.usuario_tem_acesso_empresa(empresa_id))
        )
    )
);

DROP POLICY IF EXISTS "Atualizacao de usuarios controlada" ON public.usuarios;
CREATE POLICY "Atualizacao de usuarios controlada"
ON public.usuarios FOR UPDATE
USING (
    public.usuario_esta_ativo() AND (
        -- Administrador pode alterar usuários
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        -- Usuário só pode atualizar a si mesmo (gatilho abaixo impede alterar perfil/ativo)
        OR auth.uid() = id
    )
)
WITH CHECK (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR auth.uid() = id
    )
);

-- Gatilho de proteção: Impede auto-promoção e alteração de perfil pelo próprio usuário
CREATE OR REPLACE FUNCTION public.proteger_campos_sensiveis_usuario()
RETURNS TRIGGER AS $$
DECLARE
    v_perfil_operador tipo_perfil_usuario;
BEGIN
    v_perfil_operador := public.obter_perfil_atual();

    -- Se não for administrador, impede alterar perfil, status ativo ou empresa
    IF v_perfil_operador != 'ADMINISTRADOR' THEN
        IF NEW.perfil != OLD.perfil THEN
            RAISE EXCEPTION 'Acesso negado: Você não tem permissão para alterar seu próprio perfil de acesso.';
        END IF;
        IF NEW.ativo != OLD.ativo THEN
            RAISE EXCEPTION 'Acesso negado: Você não pode alterar o status da sua própria conta.';
        END IF;
        IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
            RAISE EXCEPTION 'Acesso negado: Você não pode alterar sua própria empresa vinculada.';
        END IF;
    END IF;

    NEW.atualizado_em := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proteger_campos_sensiveis_usuario ON public.usuarios;
CREATE TRIGGER trg_proteger_campos_sensiveis_usuario
BEFORE UPDATE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.proteger_campos_sensiveis_usuario();

-- 9. POLÍTICAS DE RLS PARA public.usuarios_empresas
DROP POLICY IF EXISTS "Leitura de vinculos usuario empresa" ON public.usuarios_empresas;
CREATE POLICY "Leitura de vinculos usuario empresa"
ON public.usuarios_empresas FOR SELECT
USING (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR usuario_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Modificacao de vinculos restrita a administrador" ON public.usuarios_empresas;
CREATE POLICY "Modificacao de vinculos restrita a administrador"
ON public.usuarios_empresas FOR ALL
USING (
    public.usuario_esta_ativo() AND public.obter_perfil_atual() = 'ADMINISTRADOR'
)
WITH CHECK (
    public.usuario_esta_ativo() AND public.obter_perfil_atual() = 'ADMINISTRADOR'
);
