-- ============================================================================
-- MIGRATION: 20261027190000_core_modules.sql
-- DESCRIÇÃO: Módulos de Empresas, Categorias, Estoques, Produtos, Saldos e Permissões
-- ============================================================================

-- 1. TABELA DE CATEGORIAS DE PRODUTOS
CREATE TABLE IF NOT EXISTS public.categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_categoria_empresa_nome UNIQUE (empresa_id, nome)
);

-- 2. TABELA DE ESTOQUES / LOCAIS DE GUARDA
CREATE TABLE IF NOT EXISTS public.estoques (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
    nome VARCHAR(150) NOT NULL,
    tipo VARCHAR(50) NOT NULL DEFAULT 'ALMOXARIFADO_CENTRAL',
    localizacao VARCHAR(255),
    descricao TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_estoque_empresa_nome UNIQUE (empresa_id, nome)
);

-- 3. ASSOCIAÇÃO DE RESPONSÁVEIS AUTORIZADOS POR ESTOQUE
CREATE TABLE IF NOT EXISTS public.estoques_responsaveis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estoque_id UUID NOT NULL REFERENCES public.estoques(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_estoque_usuario UNIQUE (estoque_id, usuario_id)
);

-- 4. TABELA DE PRODUTOS E MATERIAIS
CREATE TABLE IF NOT EXISTS public.produtos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
    categoria_id UUID REFERENCES public.categorias(id) ON DELETE SET NULL,
    codigo_sku VARCHAR(50) NOT NULL,
    nome VARCHAR(200) NOT NULL,
    descricao TEXT,
    tipo VARCHAR(30) NOT NULL DEFAULT 'CONSUMIVEL', -- 'CONSUMIVEL' ou 'REUTILIZAVEL'
    modo_rastreio VARCHAR(30) NOT NULL DEFAULT 'QUANTIDADE_AGREGADA', -- 'QUANTIDADE_AGREGADA' ou 'INDIVIDUAL_SERIALIZADO'
    unidade_medida VARCHAR(20) NOT NULL DEFAULT 'UN',
    permite_fracionamento BOOLEAN NOT NULL DEFAULT false,
    estoque_minimo NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_produto_empresa_sku UNIQUE (empresa_id, codigo_sku)
);

-- 5. TABELA DE SALDOS POR ESTOQUE (ESTOQUE_ITENS)
CREATE TABLE IF NOT EXISTS public.estoque_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estoque_id UUID NOT NULL REFERENCES public.estoques(id) ON DELETE RESTRICT,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    quantidade_disponivel NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (quantidade_disponivel >= 0),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_estoque_produto UNIQUE (estoque_id, produto_id)
);

-- 6. HABILITAÇÃO DE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoques_responsaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_itens ENABLE ROW LEVEL SECURITY;

-- 7. POLÍTICAS DE RLS PARA public.categorias
DROP POLICY IF EXISTS "Leitura de categorias autorizadas" ON public.categorias;
CREATE POLICY "Leitura de categorias autorizadas"
ON public.categorias FOR SELECT
USING (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR public.usuario_tem_acesso_empresa(empresa_id)
    )
);

DROP POLICY IF EXISTS "Modificacao de categorias restrita" ON public.categorias;
CREATE POLICY "Modificacao de categorias restrita"
ON public.categorias FOR ALL
USING (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR (public.obter_perfil_atual() = 'GERENTE' AND public.usuario_tem_acesso_empresa(empresa_id))
    )
)
WITH CHECK (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR (public.obter_perfil_atual() = 'GERENTE' AND public.usuario_tem_acesso_empresa(empresa_id))
    )
);

-- 8. POLÍTICAS DE RLS PARA public.estoques
DROP POLICY IF EXISTS "Leitura de estoques autorizados" ON public.estoques;
CREATE POLICY "Leitura de estoques autorizados"
ON public.estoques FOR SELECT
USING (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR public.usuario_tem_acesso_empresa(empresa_id)
    )
);

DROP POLICY IF EXISTS "Modificacao de estoques restrita a administradores e gerentes" ON public.estoques;
CREATE POLICY "Modificacao de estoques restrita a administradores e gerentes"
ON public.estoques FOR ALL
USING (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR (public.obter_perfil_atual() = 'GERENTE' AND public.usuario_tem_acesso_empresa(empresa_id))
    )
)
WITH CHECK (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR (public.obter_perfil_atual() = 'GERENTE' AND public.usuario_tem_acesso_empresa(empresa_id))
    )
);

-- 9. POLÍTICAS DE RLS PARA public.estoques_responsaveis
DROP POLICY IF EXISTS "Leitura de responsaveis por estoque" ON public.estoques_responsaveis;
CREATE POLICY "Leitura de responsaveis por estoque"
ON public.estoques_responsaveis FOR SELECT
USING (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR usuario_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.estoques e
            WHERE e.id = estoque_id AND public.usuario_tem_acesso_empresa(e.empresa_id)
        )
    )
);

DROP POLICY IF EXISTS "Modificacao de responsaveis restrita a administradores" ON public.estoques_responsaveis;
CREATE POLICY "Modificacao de responsaveis restrita a administradores"
ON public.estoques_responsaveis FOR ALL
USING (
    public.usuario_esta_ativo() AND public.obter_perfil_atual() = 'ADMINISTRADOR'
)
WITH CHECK (
    public.usuario_esta_ativo() AND public.obter_perfil_atual() = 'ADMINISTRADOR'
);

-- 10. POLÍTICAS DE RLS PARA public.produtos
DROP POLICY IF EXISTS "Leitura de produtos autorizados" ON public.produtos;
CREATE POLICY "Leitura de produtos autorizados"
ON public.produtos FOR SELECT
USING (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR public.usuario_tem_acesso_empresa(empresa_id)
    )
);

DROP POLICY IF EXISTS "Modificacao de produtos restrita a administradores e gerentes" ON public.produtos;
CREATE POLICY "Modificacao de produtos restrita a administradores e gerentes"
ON public.produtos FOR ALL
USING (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR (public.obter_perfil_atual() = 'GERENTE' AND public.usuario_tem_acesso_empresa(empresa_id))
    )
)
WITH CHECK (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR (public.obter_perfil_atual() = 'GERENTE' AND public.usuario_tem_acesso_empresa(empresa_id))
    )
);

-- 11. POLÍTICAS DE RLS PARA public.estoque_itens
DROP POLICY IF EXISTS "Leitura de saldos autorizados" ON public.estoque_itens;
CREATE POLICY "Leitura de saldos autorizados"
ON public.estoque_itens FOR SELECT
USING (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR EXISTS (
            SELECT 1 FROM public.estoques e
            WHERE e.id = estoque_id AND public.usuario_tem_acesso_empresa(e.empresa_id)
        )
    )
);

DROP POLICY IF EXISTS "Modificacao de saldos restrita" ON public.estoque_itens;
CREATE POLICY "Modificacao de saldos restrita"
ON public.estoque_itens FOR ALL
USING (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR public.obter_perfil_atual() = 'GERENTE'
    )
)
WITH CHECK (
    public.usuario_esta_ativo() AND (
        public.obter_perfil_atual() = 'ADMINISTRADOR'
        OR public.obter_perfil_atual() = 'GERENTE'
    )
);
