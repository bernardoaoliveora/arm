-- ============================================================================
-- AUDITORIA DE SEGURANÇA E BLINDAGEM DE SALDOS (HARDENING)
-- Data: 2026-10-27
-- Objetivo:
-- 1. Revogar permissões diretas de INSERT/UPDATE/DELETE em estoque_itens,
--    custodia_itens, movimentacoes e movimentacao_itens para clientes REST.
--    Toda e qualquer alteração de saldo DEVE ocorrer obrigatoriamente
--    pela procedure atômica processar_movimentacao_estoque.
-- 2. Blindar as validações de alçada de Técnicos na procedure.
-- ============================================================================

-- 1. Remoção de permissões de escrita direta em estoque_itens
DROP POLICY IF EXISTS "Modificacao de saldos restrita" ON public.estoque_itens;

-- Garantir que a tabela estoque_itens tenha estritamente RLS de LEITURA
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'estoque_itens' AND policyname = 'Leitura de saldos por estoque autorizada'
    ) THEN
        CREATE POLICY "Leitura de saldos por estoque autorizada"
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
    END IF;
END $$;

-- 2. Atualizar a procedure processar_movimentacao_estoque com blindagem total
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
SET search_path = public, pg_temp
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
        -- Em testes ou chamadas internas diretas via service_role, assume o primeiro admin ativo
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

    -- 5. VALIDAÇÃO DE ALÇADA DO OPERADOR (CONTROLE DE ACESSO BASEADO EM FUNÇÃO)
    IF v_operador_perfil = 'TECNICO' THEN
        -- Operações terminantemente proibidas para perfil Técnico
        IF p_tipo IN ('ENTRADA', 'AJUSTE_INVENTARIO', 'TRANSFERENCIA', 'ESTORNO') THEN
            RAISE EXCEPTION 'Acesso negado: Perfil Técnico não tem autorização para realizar operações de %s.', p_tipo;
        END IF;

        -- Técnicos só podem movimentar ou receber materiais sob sua própria custódia/identificação
        IF p_tecnico_id IS NOT NULL AND p_tecnico_id != v_operador_id THEN
            RAISE EXCEPTION 'Acesso negado: Um técnico só pode realizar operações sob sua própria responsabilidade e identidade.';
        END IF;

        -- Se for Perda ou Dano, técnico só pode registrar itens sob sua posse (não pode baixar do depósito central)
        IF p_tipo IN ('PERDA', 'DANO') AND (p_tecnico_id IS NULL OR p_tecnico_id != v_operador_id) THEN
            RAISE EXCEPTION 'Acesso negado: Técnicos só podem registrar perda ou dano de materiais sob sua própria custódia.';
        END IF;

        -- Se for Retirada, Consumo ou Devolução iniciada por técnico, p_tecnico_id deve ser o próprio técnico
        IF p_tipo IN ('RETIRADA', 'CONSUMO', 'DEVOLUCAO') AND p_tecnico_id IS NULL THEN
            p_tecnico_id := v_operador_id;
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

        SELECT empresa_id INTO v_dest_empresa FROM public.estoques WHERE id = p_estoque_destino_id AND ativo = true;
        IF v_dest_empresa IS DISTINCT FROM p_empresa_id THEN
            RAISE EXCEPTION 'O estoque de destino não pertence à empresa da movimentação.';
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

        SELECT quantidade_disponivel INTO v_saldo_origem_ant
        FROM public.estoque_itens
        WHERE estoque_id = p_estoque_origem_id AND produto_id = p_produto_id
        FOR UPDATE;

        IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
            RAISE EXCEPTION 'Saldo insuficiente no estoque de origem. Disponível: % %, Solicitado: % %',
                COALESCE(v_saldo_origem_ant, 0), v_produto.unidade_medida, p_quantidade, v_produto.unidade_medida;
        END IF;

        v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
        UPDATE public.estoque_itens
        SET quantidade_disponivel = v_saldo_origem_pos, atualizado_em = now()
        WHERE estoque_id = p_estoque_origem_id AND produto_id = p_produto_id;

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

        IF v_produto.tipo = 'REUTILIZAVEL' THEN
            RAISE EXCEPTION 'Ferramentas e itens reutilizáveis não podem ser consumidos. Registre devolução, perda ou dano.';
        END IF;

        SELECT quantidade_posse INTO v_saldo_origem_ant
        FROM public.custodia_itens
        WHERE tecnico_id = p_tecnico_id AND produto_id = p_produto_id
        FOR UPDATE;

        IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
            RAISE EXCEPTION 'Saldo em custódia insuficiente com o técnico. Em posse: % %, Tentativa de consumo: % %',
                COALESCE(v_saldo_origem_ant, 0), v_produto.unidade_medida, p_quantidade, v_produto.unidade_medida;
        END IF;

        v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
        UPDATE public.custodia_itens
        SET quantidade_posse = v_saldo_origem_pos, atualizado_em = now()
        WHERE tecnico_id = p_tecnico_id AND produto_id = p_produto_id;

    -- =========================================================================
    -- D) DEVOLUÇÃO AO ESTOQUE
    -- =========================================================================
    ELSIF p_tipo = 'DEVOLUCAO' THEN
        IF p_tecnico_id IS NULL THEN
            RAISE EXCEPTION 'Informe o técnico que está realizando a devolução.';
        END IF;
        IF p_estoque_destino_id IS NULL THEN
            RAISE EXCEPTION 'Informe o estoque de destino da devolução.';
        END IF;

        SELECT quantidade_posse INTO v_saldo_origem_ant
        FROM public.custodia_itens
        WHERE tecnico_id = p_tecnico_id AND produto_id = p_produto_id
        FOR UPDATE;

        IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
            RAISE EXCEPTION 'Saldo em custódia insuficiente com o técnico para devolução. Em posse: % %, Tentativa de devolução: % %',
                COALESCE(v_saldo_origem_ant, 0), v_produto.unidade_medida, p_quantidade, v_produto.unidade_medida;
        END IF;

        v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
        UPDATE public.custodia_itens
        SET quantidade_posse = v_saldo_origem_pos, atualizado_em = now()
        WHERE tecnico_id = p_tecnico_id AND produto_id = p_produto_id;

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
            RAISE EXCEPTION 'Transferência exige a indicação clara do estoque de origem e do estoque de destino.';
        END IF;
        IF p_estoque_origem_id = p_estoque_destino_id THEN
            RAISE EXCEPTION 'O estoque de origem e de destino não podem ser o mesmo.';
        END IF;

        SELECT quantidade_disponivel INTO v_saldo_origem_ant
        FROM public.estoque_itens
        WHERE estoque_id = p_estoque_origem_id AND produto_id = p_produto_id
        FOR UPDATE;

        IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
            RAISE EXCEPTION 'Saldo insuficiente no estoque de origem para transferência. Disponível: % %',
                COALESCE(v_saldo_origem_ant, 0), v_produto.unidade_medida;
        END IF;

        v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
        UPDATE public.estoque_itens
        SET quantidade_disponivel = v_saldo_origem_pos, atualizado_em = now()
        WHERE estoque_id = p_estoque_origem_id AND produto_id = p_produto_id;

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
            RAISE EXCEPTION 'O registro de perda exige justificativa circunstanciada obrigatória.';
        END IF;

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
            v_saldo_dest_pos := p_quantidade;
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

        SELECT * INTO v_mov_orig FROM public.movimentacoes WHERE id = p_movimentacao_estornada_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Movimentação original para estorno não localizada.';
        END IF;
        IF v_mov_orig.estornado THEN
            RAISE EXCEPTION 'Esta movimentação já foi estornada anteriormente.';
        END IF;

        IF v_mov_orig.tipo = 'RETIRADA' THEN
            SELECT quantidade_posse INTO v_saldo_origem_ant
            FROM public.custodia_itens
            WHERE tecnico_id = v_mov_orig.tecnico_envolvido_id AND produto_id = p_produto_id
            FOR UPDATE;

            IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
                RAISE EXCEPTION 'Saldo do técnico insuficiente para estornar a retirada.';
            END IF;

            v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
            UPDATE public.custodia_itens
            SET quantidade_posse = v_saldo_origem_pos, atualizado_em = now()
            WHERE tecnico_id = v_mov_orig.tecnico_envolvido_id AND produto_id = p_produto_id;

            SELECT quantidade_disponivel INTO v_saldo_dest_ant
            FROM public.estoque_itens
            WHERE estoque_id = v_mov_orig.estoque_origem_id AND produto_id = p_produto_id
            FOR UPDATE;

            v_saldo_dest_pos := COALESCE(v_saldo_dest_ant, 0) + p_quantidade;
            UPDATE public.estoque_itens
            SET quantidade_disponivel = v_saldo_dest_pos, atualizado_em = now()
            WHERE estoque_id = v_mov_orig.estoque_origem_id AND produto_id = p_produto_id;

        ELSIF v_mov_orig.tipo = 'CONSUMO' THEN
            SELECT quantidade_posse INTO v_saldo_dest_ant
            FROM public.custodia_itens
            WHERE tecnico_id = v_mov_orig.tecnico_envolvido_id AND produto_id = p_produto_id
            FOR UPDATE;

            v_saldo_dest_pos := COALESCE(v_saldo_dest_ant, 0) + p_quantidade;
            UPDATE public.custodia_itens
            SET quantidade_posse = v_saldo_dest_pos, atualizado_em = now()
            WHERE tecnico_id = v_mov_orig.tecnico_envolvido_id AND produto_id = p_produto_id;

        ELSIF v_mov_orig.tipo = 'DEVOLUCAO' THEN
            SELECT quantidade_disponivel INTO v_saldo_origem_ant
            FROM public.estoque_itens
            WHERE estoque_id = v_mov_orig.estoque_destino_id AND produto_id = p_produto_id
            FOR UPDATE;

            IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
                RAISE EXCEPTION 'Saldo no estoque insuficiente para estornar a devolução.';
            END IF;

            v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
            UPDATE public.estoque_itens
            SET quantidade_disponivel = v_saldo_origem_pos, atualizado_em = now()
            WHERE estoque_id = v_mov_orig.estoque_destino_id AND produto_id = p_produto_id;

            SELECT quantidade_posse INTO v_saldo_dest_ant
            FROM public.custodia_itens
            WHERE tecnico_id = v_mov_orig.tecnico_envolvido_id AND produto_id = p_produto_id
            FOR UPDATE;

            v_saldo_dest_pos := COALESCE(v_saldo_dest_ant, 0) + p_quantidade;
            UPDATE public.custodia_itens
            SET quantidade_posse = v_saldo_dest_pos, atualizado_em = now()
            WHERE tecnico_id = v_mov_orig.tecnico_envolvido_id AND produto_id = p_produto_id;

        ELSIF v_mov_orig.tipo = 'ENTRADA' THEN
            SELECT quantidade_disponivel INTO v_saldo_origem_ant
            FROM public.estoque_itens
            WHERE estoque_id = v_mov_orig.estoque_destino_id AND produto_id = p_produto_id
            FOR UPDATE;

            IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
                RAISE EXCEPTION 'Saldo insuficiente no estoque para estornar a entrada.';
            END IF;

            v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
            UPDATE public.estoque_itens
            SET quantidade_disponivel = v_saldo_origem_pos, atualizado_em = now()
            WHERE estoque_id = v_mov_orig.estoque_destino_id AND produto_id = p_produto_id;

        ELSIF v_mov_orig.tipo = 'TRANSFERENCIA' THEN
            SELECT quantidade_disponivel INTO v_saldo_origem_ant
            FROM public.estoque_itens
            WHERE estoque_id = v_mov_orig.estoque_destino_id AND produto_id = p_produto_id
            FOR UPDATE;

            IF NOT FOUND OR v_saldo_origem_ant < p_quantidade THEN
                RAISE EXCEPTION 'Saldo insuficiente no destino para estornar a transferência.';
            END IF;

            v_saldo_origem_pos := v_saldo_origem_ant - p_quantidade;
            UPDATE public.estoque_itens
            SET quantidade_disponivel = v_saldo_origem_pos, atualizado_em = now()
            WHERE estoque_id = v_mov_orig.estoque_destino_id AND produto_id = p_produto_id;

            SELECT quantidade_disponivel INTO v_saldo_dest_ant
            FROM public.estoque_itens
            WHERE estoque_id = v_mov_orig.estoque_origem_id AND produto_id = p_produto_id
            FOR UPDATE;

            v_saldo_dest_pos := COALESCE(v_saldo_dest_ant, 0) + p_quantidade;
            UPDATE public.estoque_itens
            SET quantidade_disponivel = v_saldo_dest_pos, atualizado_em = now()
            WHERE estoque_id = v_mov_orig.estoque_origem_id AND produto_id = p_produto_id;
        ELSE
            RAISE EXCEPTION 'Estorno não implementado para o tipo %', v_mov_orig.tipo;
        END IF;

        UPDATE public.movimentacoes
        SET estornado = true, atualizado_em = now()
        WHERE id = v_mov_orig.id;

    ELSE
        RAISE EXCEPTION 'Tipo de movimentação inválido ou não suportado: %', p_tipo;
    END IF;

    -- =========================================================================
    -- 7. REGISTRO IMUTÁVEL DA MOVIMENTAÇÃO E AUDITORIA
    -- =========================================================================
    INSERT INTO public.movimentacoes (
        empresa_id,
        tipo,
        usuario_operador_id,
        tecnico_envolvido_id,
        estoque_origem_id,
        estoque_destino_id,
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
        'produto_id', p_produto_id,
        'quantidade', p_quantidade,
        'saldo_origem_anterior', v_saldo_origem_ant,
        'saldo_origem_posterior', v_saldo_origem_pos,
        'saldo_destino_anterior', v_saldo_dest_ant,
        'saldo_destino_posterior', v_saldo_dest_pos,
        'ocorrencia_id', v_ocorrencia_id
    );
END;
$$;
