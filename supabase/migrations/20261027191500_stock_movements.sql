-- ============================================================================
-- MIGRATION: 20261027191500_stock_movements.sql
-- DESCRIÇÃO: Módulo de Movimentações Atômicas de Estoque, Custódia e Auditoria
-- ============================================================================

-- 1. TABELA DE SALDOS SOB CUSTÓDIA DE TÉCNICOS
CREATE TABLE IF NOT EXISTS public.custodia_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
    tecnico_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    quantidade_posse NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (quantidade_posse >= 0),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_custodia_tecnico_produto UNIQUE (tecnico_id, produto_id)
);

-- 2. TABELA DE OCORRÊNCIAS (PERDA, DANO, EXTRAVIO)
CREATE TABLE IF NOT EXISTS public.ocorrencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
    tipo VARCHAR(30) NOT NULL, -- 'PERDA', 'DANO', 'EXTRAVIO'
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    tecnico_id UUID REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    estoque_id UUID REFERENCES public.estoques(id) ON DELETE RESTRICT,
    quantidade NUMERIC(12, 3) NOT NULL CHECK (quantidade > 0),
    motivo TEXT NOT NULL,
    situacao_item VARCHAR(50) NOT NULL DEFAULT 'QUARENTENA_AVARIADO', -- 'QUARENTENA_AVARIADO', 'BAIXADO_DEFINITIVO', 'RECUPERADO'
    criado_por UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABELA DE MOVIMENTAÇÕES DE ESTOQUE (CABEÇALHO)
CREATE TABLE IF NOT EXISTS public.movimentacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
    tipo VARCHAR(40) NOT NULL, 
    -- 'ENTRADA', 'RETIRADA', 'CONSUMO', 'DEVOLUCAO', 'TRANSFERENCIA', 'PERDA', 'DANO', 'AJUSTE_INVENTARIO', 'ESTORNO'
    usuario_operador_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    tecnico_envolvido_id UUID REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    estoque_origem_id UUID REFERENCES public.estoques(id) ON DELETE RESTRICT,
    estoque_destino_id UUID REFERENCES public.estoques(id) ON DELETE RESTRICT,
    ocorrencia_id UUID REFERENCES public.ocorrencias(id) ON DELETE RESTRICT,
    movimentacao_estornada_id UUID REFERENCES public.movimentacoes(id) ON DELETE RESTRICT,
    justificativa TEXT,
    chave_idempotencia VARCHAR(120) UNIQUE,
    estornado BOOLEAN NOT NULL DEFAULT false,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. ITENS DA MOVIMENTAÇÃO
CREATE TABLE IF NOT EXISTS public.movimentacao_itens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movimentacao_id UUID NOT NULL REFERENCES public.movimentacoes(id) ON DELETE CASCADE,
    produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE RESTRICT,
    quantidade NUMERIC(12, 3) NOT NULL CHECK (quantidade > 0),
    saldo_anterior_origem NUMERIC(12, 3),
    saldo_posterior_origem NUMERIC(12, 3),
    saldo_anterior_destino NUMERIC(12, 3),
    saldo_posterior_destino NUMERIC(12, 3)
);

-- 5. HABILITAÇÃO DE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.custodia_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacao_itens ENABLE ROW LEVEL SECURITY;

-- 6. POLÍTICAS RLS IDEMPOTENTES
DO $$
BEGIN
    -- CUSTODIA_ITENS
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'custodia_itens' AND policyname = 'Leitura de custodia autorizada') THEN
        CREATE POLICY "Leitura de custodia autorizada" ON public.custodia_itens FOR SELECT USING (
            public.usuario_esta_ativo() AND (
                public.obter_perfil_atual() = 'ADMINISTRADOR'
                OR tecnico_id = auth.uid()
                OR public.usuario_tem_acesso_empresa(empresa_id)
            )
        );
    END IF;

    -- OCORRENCIAS
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ocorrencias' AND policyname = 'Leitura de ocorrencias autorizadas') THEN
        CREATE POLICY "Leitura de ocorrencias autorizadas" ON public.ocorrencias FOR SELECT USING (
            public.usuario_esta_ativo() AND (
                public.obter_perfil_atual() = 'ADMINISTRADOR'
                OR criado_por = auth.uid()
                OR public.usuario_tem_acesso_empresa(empresa_id)
            )
        );
    END IF;

    -- MOVIMENTACOES
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'movimentacoes' AND policyname = 'Leitura de movimentacoes autorizadas') THEN
        CREATE POLICY "Leitura de movimentacoes autorizadas" ON public.movimentacoes FOR SELECT USING (
            public.usuario_esta_ativo() AND (
                public.obter_perfil_atual() = 'ADMINISTRADOR'
                OR usuario_operador_id = auth.uid()
                OR tecnico_envolvido_id = auth.uid()
                OR public.usuario_tem_acesso_empresa(empresa_id)
            )
        );
    END IF;

    -- MOVIMENTACAO_ITENS
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'movimentacao_itens' AND policyname = 'Leitura de itens de movimentacao') THEN
        CREATE POLICY "Leitura de itens de movimentacao" ON public.movimentacao_itens FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.movimentacoes m
                WHERE m.id = movimentacao_id AND (
                    public.obter_perfil_atual() = 'ADMINISTRADOR'
                    OR m.usuario_operador_id = auth.uid()
                    OR m.tecnico_envolvido_id = auth.uid()
                    OR public.usuario_tem_acesso_empresa(m.empresa_id)
                )
            )
        );
    END IF;
END $$;

-- 7. FUNÇÃO ATÔMICA E TRANSACIONAL DE PROCESSAMENTO DE MOVIMENTAÇÃO
CREATE OR REPLACE FUNCTION public.processar_movimentacao_estoque(
    p_tipo VARCHAR(40),
    p_empresa_id UUID,
    p_produto_id UUID,
    p_quantidade NUMERIC(12, 3),
    p_estoque_origem_id UUID DEFAULT NULL,
    p_estoque_destino_id UUID DEFAULT NULL,
    p_tecnico_id UUID DEFAULT NULL,
    p_justificativa TEXT DEFAULT NULL,
    p_chave_idempotencia VARCHAR(120) DEFAULT NULL,
    p_movimentacao_estornada_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_operador_id UUID := auth.uid();
    v_operador_perfil tipo_perfil_usuario;
    v_produto RECORD;
    v_movimentacao_id UUID;
    v_ocorrencia_id UUID := NULL;
    v_saldo_origem_ant NUMERIC(12, 3) := 0;
    v_saldo_origem_pos NUMERIC(12, 3) := 0;
    v_saldo_dest_ant NUMERIC(12, 3) := 0;
    v_saldo_dest_pos NUMERIC(12, 3) := 0;
    v_mov_existente RECORD;
    v_mov_orig RECORD;
    v_orig_empresa UUID;
    v_dest_empresa UUID;
BEGIN
    -- 1. IDENTIFICAÇÃO E VALIDAÇÃO DO OPERADOR
    IF v_operador_id IS NOT NULL THEN
        SELECT perfil INTO v_operador_perfil FROM public.usuarios WHERE id = v_operador_id AND ativo = true;
        IF v_operador_perfil IS NULL THEN
            RAISE EXCEPTION 'Operador inativo ou não autorizado para executar movimentações.';
        END IF;
    ELSE
        -- Em testes ou chamadas internas, assume o primeiro admin ativo
        SELECT id, perfil INTO v_operador_id, v_operador_perfil FROM public.usuarios WHERE perfil = 'ADMINISTRADOR' AND ativo = true LIMIT 1;
    END IF;

    -- 2. VALIDAÇÃO DE IDEMPOTÊNCIA
    IF p_chave_idempotencia IS NOT NULL AND trim(p_chave_idempotencia) != '' THEN
        SELECT id, tipo, criado_em INTO v_mov_existente 
        FROM public.movimentacoes 
        WHERE chave_idempotencia = trim(p_chave_idempotencia);

        IF FOUND THEN
            RETURN jsonb_build_object(
                'sucesso', true,
                'idempotente', true,
                'movimentacao_id', v_mov_existente.id,
                'mensagem', 'Requisição duplicada identificada: a movimentação já havia sido processada com sucesso anteriormente.'
            );
        END IF;
    END IF;

    -- 3. VALIDAÇÃO DE QUANTIDADE
    IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
        RAISE EXCEPTION 'A quantidade a movimentar deve ser estritamente positiva.';
    END IF;

    -- 4. VALIDAÇÃO DO PRODUTO E EMPRESA
    SELECT * INTO v_produto FROM public.produtos WHERE id = p_produto_id AND ativo = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado ou inativo no sistema.';
    END IF;

    IF v_produto.empresa_id != p_empresa_id THEN
        RAISE EXCEPTION 'O produto selecionado não pertence à empresa especificada na movimentação.';
    END IF;

    -- Validação de fracionamento
    IF NOT v_produto.permite_fracionamento AND (p_quantidade != trunc(p_quantidade)) THEN
        RAISE EXCEPTION 'Este produto (%s) não aceita quantidades fracionadas.', v_produto.nome;
    END IF;

    -- 5. VALIDAÇÃO DE ALÇADA DO OPERADOR
    IF v_operador_perfil = 'TECNICO' THEN
        -- Técnico só pode registrar consumo, devolução de materiais sob sua posse ou retirada para si mesmo
        IF p_tipo IN ('ENTRADA', 'AJUSTE_INVENTARIO', 'TRANSFERENCIA') THEN
            RAISE EXCEPTION 'Acesso negado: Perfil Técnico não tem autorização para realizar operações de %s.', p_tipo;
        END IF;
        IF p_tecnico_id IS NOT NULL AND p_tecnico_id != v_operador_id THEN
            RAISE EXCEPTION 'Acesso negado: Um técnico só pode realizar operações sob sua própria responsabilidade.';
        END IF;
    END IF;

    -- 6. PROCESSAMENTO ESPECÍFICO POR TIPO DE MOVIMENTAÇÃO

    -- =========================================================================
    -- A) ENTRADA DE MATERIAIS
    -- =========================================================================
    IF p_tipo = 'ENTRADA' THEN
        IF p_estoque_destino_id IS NULL THEN
            RAISE EXCEPTION 'Para entrada de material, o estoque de destino é obrigatório.';
        END IF;

        -- Valida empresa do estoque
        SELECT empresa_id INTO v_dest_empresa FROM public.estoques WHERE id = p_estoque_destino_id AND ativo = true;
        IF v_dest_empresa IS DISTINCT FROM p_empresa_id THEN
            RAISE EXCEPTION 'O estoque de destino não pertence à empresa da movimentação.';
        END IF;

        -- Bloqueio pessimista e atualização do estoque de destino
        SELECT quantidade_disponivel INTO v_saldo_dest_ant
        FROM public.estoque_itens
        WHERE estoque_id = p_estoque_destino_id AND produto_id = p_produto_id
        FOR UPDATE;

        IF NOT FOUND THEN
            v_saldo_dest_ant := 0;
            INSERT INTO public.estoque_itens (estoque_id, produto_id, quantidade_disponivel)
            VALUES (p_estoque_destino_id, p_produto_id, p_quantidade);
            v_saldo_dest_pos := p_quantidade;
        ELSE
            v_saldo_dest_pos := v_saldo_dest_ant + p_quantidade;
            UPDATE public.estoque_itens
            SET quantidade_disponivel = v_saldo_dest_pos, atualizado_em = now()
            WHERE estoque_id = p_estoque_destino_id AND produto_id = p_produto_id;
        END IF;

    -- =========================================================================
    -- B) RETIRADA PARA UM TÉCNICO
    -- =========================================================================
    ELSIF p_tipo = 'RETIRADA' THEN
        IF p_estoque_origem_id IS NULL THEN
            RAISE EXCEPTION 'Para retirada de material, o estoque de origem é obrigatório.';
        END IF;
        IF p_tecnico_id IS NULL THEN
            RAISE EXCEPTION 'Para retirada de material, o técnico responsável deve ser informado.';
        END IF;

        -- Bloqueio pessimista no estoque de origem (concorrência simultânea)
        SELECT quantidade_disponivel INTO v_saldo_origem_ant
        FROM public.estoque_itens
        WHERE estoque_id = p_estoque_origem_id AND produto_id = p_produto_id
        FOR UPDATE;

        IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
            RAISE EXCEPTION 'Saldo insuficiente no estoque de origem. Disponível: % %, Solicitado: % %',
                COALESCE(v_saldo_origem_ant, 0), v_produto.unidade_medida, p_quantidade, v_produto.unidade_medida;
        END IF;

        -- Deduz da origem
        v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
        UPDATE public.estoque_itens
        SET quantidade_disponivel = v_saldo_origem_pos, atualizado_em = now()
        WHERE estoque_id = p_estoque_origem_id AND produto_id = p_produto_id;

        -- Adiciona na custódia do técnico (com lock)
        SELECT quantidade_posse INTO v_saldo_dest_ant
        FROM public.custodia_itens
        WHERE tecnico_id = p_tecnico_id AND produto_id = p_produto_id
        FOR UPDATE;

        IF NOT FOUND THEN
            v_saldo_dest_ant := 0;
            INSERT INTO public.custodia_itens (empresa_id, tecnico_id, produto_id, quantidade_posse)
            VALUES (p_empresa_id, p_tecnico_id, p_produto_id, p_quantidade);
            v_saldo_dest_pos := p_quantidade;
        ELSE
            v_saldo_dest_pos := v_saldo_dest_ant + p_quantidade;
            UPDATE public.custodia_itens
            SET quantidade_posse = v_saldo_dest_pos, atualizado_em = now()
            WHERE tecnico_id = p_tecnico_id AND produto_id = p_produto_id;
        END IF;

    -- =========================================================================
    -- C) CONSUMO DE MATERIAL POR TÉCNICO
    -- =========================================================================
    ELSIF p_tipo = 'CONSUMO' THEN
        IF p_tecnico_id IS NULL THEN
            RAISE EXCEPTION 'O técnico responsável pelo consumo deve ser informado.';
        END IF;

        -- Regra de negócio: Ferramentas reutilizáveis não são consumidas
        IF v_produto.tipo != 'CONSUMIVEL' THEN
            RAISE EXCEPTION 'Apenas materiais consumíveis podem ser baixados por consumo. Ferramentas reutilizáveis devem ser devolvidas ou registradas como perda/dano.';
        END IF;

        -- Lock pessimista na custódia do técnico
        SELECT quantidade_posse INTO v_saldo_origem_ant
        FROM public.custodia_itens
        WHERE tecnico_id = p_tecnico_id AND produto_id = p_produto_id
        FOR UPDATE;

        IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
            RAISE EXCEPTION 'Saldo em custódia insuficiente com o técnico. Em posse: % %, Consumo solicitado: % %',
                COALESCE(v_saldo_origem_ant, 0), v_produto.unidade_medida, p_quantidade, v_produto.unidade_medida;
        END IF;

        v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
        UPDATE public.custodia_itens
        SET quantidade_posse = v_saldo_origem_pos, atualizado_em = now()
        WHERE tecnico_id = p_tecnico_id AND produto_id = p_produto_id;

    -- =========================================================================
    -- D) DEVOLUÇÃO DE MATERIAL / FERRAMENTA
    -- =========================================================================
    ELSIF p_tipo = 'DEVOLUCAO' THEN
        IF p_tecnico_id IS NULL THEN
            RAISE EXCEPTION 'Para devolução, o técnico responsável deve ser informado.';
        END IF;
        IF p_estoque_destino_id IS NULL THEN
            RAISE EXCEPTION 'Para devolução, o estoque de destino deve ser informado.';
        END IF;

        -- Lock na custódia do técnico
        SELECT quantidade_posse INTO v_saldo_origem_ant
        FROM public.custodia_itens
        WHERE tecnico_id = p_tecnico_id AND produto_id = p_produto_id
        FOR UPDATE;

        IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
            RAISE EXCEPTION 'Saldo em custódia insuficiente com o técnico para devolver. Em posse: % %, Devolução solicitada: % %',
                COALESCE(v_saldo_origem_ant, 0), v_produto.unidade_medida, p_quantidade, v_produto.unidade_medida;
        END IF;

        -- Reduz da posse do técnico
        v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
        UPDATE public.custodia_itens
        SET quantidade_posse = v_saldo_origem_pos, atualizado_em = now()
        WHERE tecnico_id = p_tecnico_id AND produto_id = p_produto_id;

        -- Aumenta no estoque de destino (com lock)
        SELECT quantidade_disponivel INTO v_saldo_dest_ant
        FROM public.estoque_itens
        WHERE estoque_id = p_estoque_destino_id AND produto_id = p_produto_id
        FOR UPDATE;

        IF NOT FOUND THEN
            v_saldo_dest_ant := 0;
            INSERT INTO public.estoque_itens (estoque_id, produto_id, quantidade_disponivel)
            VALUES (p_estoque_destino_id, p_produto_id, p_quantidade);
            v_saldo_dest_pos := p_quantidade;
        ELSE
            v_saldo_dest_pos := v_saldo_dest_ant + p_quantidade;
            UPDATE public.estoque_itens
            SET quantidade_disponivel = v_saldo_dest_pos, atualizado_em = now()
            WHERE estoque_id = p_estoque_destino_id AND produto_id = p_produto_id;
        END IF;

    -- =========================================================================
    -- E) TRANSFERÊNCIA ENTRE ESTOQUES
    -- =========================================================================
    ELSIF p_tipo = 'TRANSFERENCIA' THEN
        IF p_estoque_origem_id IS NULL OR p_estoque_destino_id IS NULL THEN
            RAISE EXCEPTION 'Para transferência, origem e destino devem ser informados.';
        END IF;
        IF p_estoque_origem_id = p_estoque_destino_id THEN
            RAISE EXCEPTION 'O estoque de origem não pode ser idêntico ao estoque de destino.';
        END IF;

        -- Valida empresas de origem e destino
        SELECT empresa_id INTO v_orig_empresa FROM public.estoques WHERE id = p_estoque_origem_id;
        SELECT empresa_id INTO v_dest_empresa FROM public.estoques WHERE id = p_estoque_destino_id;

        IF v_orig_empresa != p_empresa_id OR v_dest_empresa != p_empresa_id THEN
            RAISE EXCEPTION 'Acesso negado: Transferência entre estoques de empresas diferentes não autorizada.';
        END IF;

        -- Lock no estoque de origem
        SELECT quantidade_disponivel INTO v_saldo_origem_ant
        FROM public.estoque_itens
        WHERE estoque_id = p_estoque_origem_id AND produto_id = p_produto_id
        FOR UPDATE;

        IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
            RAISE EXCEPTION 'Saldo insuficiente no estoque de origem para transferência. Disponível: % %, Solicitado: % %',
                COALESCE(v_saldo_origem_ant, 0), v_produto.unidade_medida, p_quantidade, v_produto.unidade_medida;
        END IF;

        v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
        UPDATE public.estoque_itens
        SET quantidade_disponivel = v_saldo_origem_pos, atualizado_em = now()
        WHERE estoque_id = p_estoque_origem_id AND produto_id = p_produto_id;

        -- Lock no estoque de destino
        SELECT quantidade_disponivel INTO v_saldo_dest_ant
        FROM public.estoque_itens
        WHERE estoque_id = p_estoque_destino_id AND produto_id = p_produto_id
        FOR UPDATE;

        IF NOT FOUND THEN
            v_saldo_dest_ant := 0;
            INSERT INTO public.estoque_itens (estoque_id, produto_id, quantidade_disponivel)
            VALUES (p_estoque_destino_id, p_produto_id, p_quantidade);
            v_saldo_dest_pos := p_quantidade;
        ELSE
            v_saldo_dest_pos := v_saldo_dest_ant + p_quantidade;
            UPDATE public.estoque_itens
            SET quantidade_disponivel = v_saldo_dest_pos, atualizado_em = now()
            WHERE estoque_id = p_estoque_destino_id AND produto_id = p_produto_id;
        END IF;

    -- =========================================================================
    -- F) REGISTRO DE PERDA
    -- =========================================================================
    ELSIF p_tipo = 'PERDA' THEN
        IF p_justificativa IS NULL OR trim(p_justificativa) = '' THEN
            RAISE EXCEPTION 'O registro de perda exige justificativa detalhada e motivo obrigatório.';
        END IF;

        -- Se a perda ocorreu sob custódia do técnico
        IF p_tecnico_id IS NOT NULL THEN
            SELECT quantidade_posse INTO v_saldo_origem_ant
            FROM public.custodia_itens
            WHERE tecnico_id = p_tecnico_id AND produto_id = p_produto_id
            FOR UPDATE;

            IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
                RAISE EXCEPTION 'Saldo em custódia insuficiente com o técnico para registrar perda.';
            END IF;

            v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
            UPDATE public.custodia_itens
            SET quantidade_posse = v_saldo_origem_pos, atualizado_em = now()
            WHERE tecnico_id = p_tecnico_id AND produto_id = p_produto_id;
        ELSIF p_estoque_origem_id IS NOT NULL THEN
            SELECT quantidade_disponivel INTO v_saldo_origem_ant
            FROM public.estoque_itens
            WHERE estoque_id = p_estoque_origem_id AND produto_id = p_produto_id
            FOR UPDATE;

            IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
                RAISE EXCEPTION 'Saldo insuficiente no estoque para registrar perda.';
            END IF;

            v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
            UPDATE public.estoque_itens
            SET quantidade_disponivel = v_saldo_origem_pos, atualizado_em = now()
            WHERE estoque_id = p_estoque_origem_id AND produto_id = p_produto_id;
        ELSE
            RAISE EXCEPTION 'Informe o técnico ou o estoque de origem da perda.';
        END IF;

        -- Registra na tabela de ocorrências
        INSERT INTO public.ocorrencias (
            empresa_id, tipo, produto_id, tecnico_id, estoque_id, quantidade, motivo, situacao_item, criado_por
        ) VALUES (
            p_empresa_id, 'PERDA', p_produto_id, p_tecnico_id, p_estoque_origem_id, p_quantidade, p_justificativa, 'BAIXADO_DEFINITIVO', v_operador_id
        ) RETURNING id INTO v_ocorrencia_id;

    -- =========================================================================
    -- G) REGISTRO DE DANO
    -- =========================================================================
    ELSIF p_tipo = 'DANO' THEN
        IF p_justificativa IS NULL OR trim(p_justificativa) = '' THEN
            RAISE EXCEPTION 'O registro de dano exige descrição do estado e motivo obrigatório.';
        END IF;

        -- Retira do saldo disponível para uso (de custódia ou depósito)
        IF p_tecnico_id IS NOT NULL THEN
            SELECT quantidade_posse INTO v_saldo_origem_ant
            FROM public.custodia_itens
            WHERE tecnico_id = p_tecnico_id AND produto_id = p_produto_id
            FOR UPDATE;

            IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
                RAISE EXCEPTION 'Saldo em custódia insuficiente com o técnico para registrar dano.';
            END IF;

            v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
            UPDATE public.custodia_itens
            SET quantidade_posse = v_saldo_origem_pos, atualizado_em = now()
            WHERE tecnico_id = p_tecnico_id AND produto_id = p_produto_id;
        ELSIF p_estoque_origem_id IS NOT NULL THEN
            SELECT quantidade_disponivel INTO v_saldo_origem_ant
            FROM public.estoque_itens
            WHERE estoque_id = p_estoque_origem_id AND produto_id = p_produto_id
            FOR UPDATE;

            IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
                RAISE EXCEPTION 'Saldo insuficiente no estoque para registrar dano.';
            END IF;

            v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
            UPDATE public.estoque_itens
            SET quantidade_disponivel = v_saldo_origem_pos, atualizado_em = now()
            WHERE estoque_id = p_estoque_origem_id AND produto_id = p_produto_id;
        ELSE
            RAISE EXCEPTION 'Informe o técnico ou o estoque de origem do material danificado.';
        END IF;

        -- Preserva existência e situação como QUARENTENA_AVARIADO
        INSERT INTO public.ocorrencias (
            empresa_id, tipo, produto_id, tecnico_id, estoque_id, quantidade, motivo, situacao_item, criado_por
        ) VALUES (
            p_empresa_id, 'DANO', p_produto_id, p_tecnico_id, p_estoque_origem_id, p_quantidade, p_justificativa, 'QUARENTENA_AVARIADO', v_operador_id
        ) RETURNING id INTO v_ocorrencia_id;

    -- =========================================================================
    -- H) AJUSTE DE INVENTÁRIO AUTORIZADO
    -- =========================================================================
    ELSIF p_tipo = 'AJUSTE_INVENTARIO' THEN
        IF v_operador_perfil != 'ADMINISTRADOR' AND v_operador_perfil != 'GERENTE' THEN
            RAISE EXCEPTION 'Acesso negado: Apenas administradores e gerentes podem autorizar ajustes de inventário.';
        END IF;
        IF p_estoque_destino_id IS NULL THEN
            RAISE EXCEPTION 'Informe o estoque a ser ajustado.';
        END IF;
        IF p_justificativa IS NULL OR trim(p_justificativa) = '' THEN
            RAISE EXCEPTION 'O ajuste de inventário exige justificativa de auditoria obrigatória.';
        END IF;

        SELECT quantidade_disponivel INTO v_saldo_dest_ant
        FROM public.estoque_itens
        WHERE estoque_id = p_estoque_destino_id AND produto_id = p_produto_id
        FOR UPDATE;

        IF NOT FOUND THEN
            v_saldo_dest_ant := 0;
            INSERT INTO public.estoque_itens (estoque_id, produto_id, quantidade_disponivel)
            VALUES (p_estoque_destino_id, p_produto_id, p_quantidade);
            v_saldo_dest_pos := p_quantidade;
        ELSE
            v_saldo_dest_pos := p_quantidade; -- Ajusta para o novo valor aferido no inventário
            UPDATE public.estoque_itens
            SET quantidade_disponivel = v_saldo_dest_pos, atualizado_em = now()
            WHERE estoque_id = p_estoque_destino_id AND produto_id = p_produto_id;
        END IF;

    -- =========================================================================
    -- I) ESTORNO DE MOVIMENTAÇÃO
    -- =========================================================================
    ELSIF p_tipo = 'ESTORNO' THEN
        IF v_operador_perfil != 'ADMINISTRADOR' AND v_operador_perfil != 'GERENTE' THEN
            RAISE EXCEPTION 'Acesso negado: Apenas administradores e gerentes podem autorizar estornos.';
        END IF;
        IF p_movimentacao_estornada_id IS NULL THEN
            RAISE EXCEPTION 'Informe o identificador da movimentação original a ser estornada.';
        END IF;
        IF p_justificativa IS NULL OR trim(p_justificativa) = '' THEN
            RAISE EXCEPTION 'O estorno exige justificativa e registro formal do motivo.';
        END IF;

        -- Carrega movimentação original para inverter
        SELECT * INTO v_mov_orig FROM public.movimentacoes WHERE id = p_movimentacao_estornada_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Movimentação original para estorno não localizada.';
        END IF;
        IF v_mov_orig.estornado THEN
            RAISE EXCEPTION 'Esta movimentação já foi estornada anteriormente.';
        END IF;

        -- Inverte os efeitos dependendo do tipo original
        IF v_mov_orig.tipo = 'RETIRADA' THEN
            -- Devolve do técnico para o estoque de origem
            SELECT quantidade_posse INTO v_saldo_origem_ant
            FROM public.custodia_itens
            WHERE tecnico_id = v_mov_orig.tecnico_envolvido_id AND produto_id = p_produto_id
            FOR UPDATE;

            IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
                RAISE EXCEPTION 'Saldo do técnico insuficiente para estornar a retirada.';
            END IF;

            UPDATE public.custodia_itens
            SET quantidade_posse = v_saldo_origem_ant - p_quantidade, atualizado_em = now()
            WHERE tecnico_id = v_mov_orig.tecnico_envolvido_id AND produto_id = p_produto_id;

            UPDATE public.estoque_itens
            SET quantidade_disponivel = quantidade_disponivel + p_quantidade, atualizado_em = now()
            WHERE estoque_id = v_mov_orig.estoque_origem_id AND produto_id = p_produto_id;

        ELSIF v_mov_orig.tipo = 'ENTRADA' THEN
            -- Remove a entrada do estoque
            SELECT quantidade_disponivel INTO v_saldo_dest_ant
            FROM public.estoque_itens
            WHERE estoque_id = v_mov_orig.estoque_destino_id AND produto_id = p_produto_id
            FOR UPDATE;

            IF NOT FOUND OR v_saldo_dest_ant < p_quantidade THEN
                RAISE EXCEPTION 'Saldo insuficiente no estoque para estornar a entrada.';
            END IF;

            UPDATE public.estoque_itens
            SET quantidade_disponivel = v_saldo_dest_ant - p_quantidade, atualizado_em = now()
            WHERE estoque_id = v_mov_orig.estoque_destino_id AND produto_id = p_produto_id;
        END IF;

        -- Marca movimentação original como estornada
        UPDATE public.movimentacoes SET estornado = true WHERE id = p_movimentacao_estornada_id;
    ELSE
        RAISE EXCEPTION 'Tipo de movimentação inválido: %', p_tipo;
    END IF;

    -- =========================================================================
    -- 7. REGISTRO AUDITÁVEL IMUTÁVEL (CABEÇALHO E ITENS)
    -- =========================================================================
    INSERT INTO public.movimentacoes (
        empresa_id,
        tipo,
        usuario_operador_id,
        tecnico_envolvido_id,
        estoque_origem_id,
        estoque_destino_id,
        ocorrencia_id,
        movimentacao_estornada_id,
        justificativa,
        chave_idempotencia
    ) VALUES (
        p_empresa_id,
        p_tipo,
        v_operador_id,
        p_tecnico_id,
        p_estoque_origem_id,
        p_estoque_destino_id,
        v_ocorrencia_id,
        p_movimentacao_estornada_id,
        p_justificativa,
        p_chave_idempotencia
    ) RETURNING id INTO v_movimentacao_id;

    INSERT INTO public.movimentacao_itens (
        movimentacao_id,
        produto_id,
        quantidade,
        saldo_anterior_origem,
        saldo_posterior_origem,
        saldo_anterior_destino,
        saldo_posterior_destino
    ) VALUES (
        v_movimentacao_id,
        p_produto_id,
        p_quantidade,
        v_saldo_origem_ant,
        v_saldo_origem_pos,
        v_saldo_dest_ant,
        v_saldo_dest_pos
    );

    RETURN jsonb_build_object(
        'sucesso', true,
        'movimentacao_id', v_movimentacao_id,
        'tipo', p_tipo,
        'quantidade', p_quantidade,
        'produto', v_produto.nome,
        'saldo_origem_anterior', v_saldo_origem_ant,
        'saldo_origem_posterior', v_saldo_origem_pos,
        'saldo_destino_anterior', v_saldo_dest_ant,
        'saldo_destino_posterior', v_saldo_dest_pos
    );
END;
$$;
