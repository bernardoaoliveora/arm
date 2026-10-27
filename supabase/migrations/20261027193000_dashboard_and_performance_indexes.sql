-- ============================================================================
-- MIGRATION: 20261027193000_dashboard_and_performance_indexes.sql
-- DESCRIÇÃO: Índices de alta performance e funções RPC para Dashboard, Histórico e Alertas
-- ============================================================================

-- 1. ÍNDICES DE PERFORMANCE PARA MOVIMENTAÇÕES E AUDITORIA
CREATE INDEX IF NOT EXISTS idx_movimentacoes_empresa_criado ON public.movimentacoes (empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_tipo ON public.movimentacoes (tipo);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_tecnico ON public.movimentacoes (tecnico_envolvido_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_operador ON public.movimentacoes (usuario_operador_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_origem ON public.movimentacoes (estoque_origem_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_destino ON public.movimentacoes (estoque_destino_id);

-- 2. ÍNDICES PARA ITENS DE MOVIMENTAÇÃO
CREATE INDEX IF NOT EXISTS idx_mov_itens_movimentacao ON public.movimentacao_itens (movimentacao_id);
CREATE INDEX IF NOT EXISTS idx_mov_itens_produto ON public.movimentacao_itens (produto_id);

-- 3. ÍNDICES PARA SALDOS (ESTOQUE_ITENS) E CUSTÓDIA
CREATE INDEX IF NOT EXISTS idx_estoque_itens_composto ON public.estoque_itens (estoque_id, produto_id);
CREATE INDEX IF NOT EXISTS idx_estoque_itens_produto ON public.estoque_itens (produto_id);
CREATE INDEX IF NOT EXISTS idx_custodia_empresa_tecnico ON public.custodia_itens (empresa_id, tecnico_id);
CREATE INDEX IF NOT EXISTS idx_custodia_produto ON public.custodia_itens (produto_id);

-- 4. ÍNDICES PARA OCORRÊNCIAS E ALERTAS DE ESTOQUE
CREATE INDEX IF NOT EXISTS idx_ocorrencias_empresa_tipo ON public.ocorrencias (empresa_id, tipo, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_produtos_empresa_minimo ON public.produtos (empresa_id, estoque_minimo) WHERE ativo = true;

-- 5. FUNÇÃO RPC SEGURA: OBTER MÉTRICAS CONSOLIDADAS DO DASHBOARD
CREATE OR REPLACE FUNCTION public.obter_metricas_dashboard(
    p_empresa_id UUID,
    p_estoque_id UUID DEFAULT NULL,
    p_tecnico_id UUID DEFAULT NULL,
    p_data_inicio TIMESTAMPTZ DEFAULT NULL,
    p_data_fim TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_perfil VARCHAR;
    v_usuario_id UUID := auth.uid();
    v_inicio TIMESTAMPTZ := COALESCE(p_data_inicio, date_trunc('month', now()));
    v_fim TIMESTAMPTZ := COALESCE(p_data_fim, now());
    v_filtro_tecnico UUID := p_tecnico_id;
    v_resultado JSONB;
    
    v_total_produtos INT := 0;
    v_consumiveis INT := 0;
    v_ferramentas INT := 0;
    v_produtos_baixo_estoque INT := 0;
    v_saldos_estoque JSONB := '[]'::jsonb;
    v_custodia_tecnicos JSONB := '[]'::jsonb;
    v_consumo_periodo JSONB := '[]'::jsonb;
    v_total_eventos_consumo INT := 0;
    v_total_perdas INT := 0;
    v_total_danos INT := 0;
    v_ocorrencias JSONB := '[]'::jsonb;
BEGIN
    -- Validar autenticação
    IF v_usuario_id IS NULL THEN
        RAISE EXCEPTION 'Acesso não autorizado: usuário não autenticado';
    END IF;

    -- Obter perfil
    SELECT perfil INTO v_perfil FROM public.usuarios WHERE id = v_usuario_id;
    IF v_perfil IS NULL THEN
        RAISE EXCEPTION 'Perfil de usuário não localizado';
    END IF;

    -- Se for Técnico, restringe o filtro exclusivamente à sua própria custódia
    IF v_perfil = 'TECNICO' THEN
        v_filtro_tecnico := v_usuario_id;
    END IF;

    -- Validar acesso à empresa
    IF v_perfil <> 'ADMINISTRADOR' AND NOT public.usuario_tem_acesso_empresa(p_empresa_id) THEN
        RAISE EXCEPTION 'Acesso negado para a empresa informada';
    END IF;

    -- A. Contagem de produtos cadastrados ativos
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE tipo = 'CONSUMIVEL'),
        COUNT(*) FILTER (WHERE tipo = 'REUTILIZAVEL')
    INTO v_total_produtos, v_consumiveis, v_ferramentas
    FROM public.produtos
    WHERE empresa_id = p_empresa_id AND ativo = true;

    -- B. Produtos abaixo do estoque mínimo
    -- REGRA: Avalia exclusivamente o saldo disponível nos depósitos da empresa (sem somar a posse com técnicos)
    SELECT COUNT(DISTINCT p.id)
    INTO v_produtos_baixo_estoque
    FROM public.produtos p
    LEFT JOIN (
        SELECT ei.produto_id, COALESCE(SUM(ei.quantidade_disponivel), 0) AS saldo_total_deposito
        FROM public.estoque_itens ei
        JOIN public.estoques e ON e.id = ei.estoque_id
        WHERE e.empresa_id = p_empresa_id AND e.ativo = true
          AND (p_estoque_id IS NULL OR e.id = p_estoque_id)
        GROUP BY ei.produto_id
    ) dep ON dep.produto_id = p.id
    WHERE p.empresa_id = p_empresa_id 
      AND p.ativo = true 
      AND p.estoque_minimo > 0
      AND COALESCE(dep.saldo_total_deposito, 0) < p.estoque_minimo;

    -- C. Quantidade disponível por estoque (discriminada por produto e unidade de medida, sem somar grandezas incompatíveis)
    SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb)
    INTO v_saldos_estoque
    FROM (
        SELECT 
            e.id AS estoque_id,
            e.nome AS estoque_nome,
            e.tipo AS estoque_tipo,
            COUNT(DISTINCT ei.produto_id) FILTER (WHERE ei.quantidade_disponivel > 0) AS total_skus_disponiveis,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'produto_id', p.id,
                        'nome', p.nome,
                        'codigo_sku', p.codigo_sku,
                        'unidade_medida', p.unidade_medida,
                        'tipo', p.tipo,
                        'quantidade_disponivel', ei.quantidade_disponivel
                    ) ORDER BY p.nome
                ) FILTER (WHERE ei.quantidade_disponivel > 0),
                '[]'::jsonb
            ) AS itens
        FROM public.estoques e
        LEFT JOIN public.estoque_itens ei ON ei.estoque_id = e.id
        LEFT JOIN public.produtos p ON p.id = ei.produto_id
        WHERE e.empresa_id = p_empresa_id 
          AND e.ativo = true
          AND (p_estoque_id IS NULL OR e.id = p_estoque_id)
        GROUP BY e.id, e.nome, e.tipo
        ORDER BY e.nome
    ) sub;

    -- D. Quantidade sob custódia de técnicos
    SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb)
    INTO v_custodia_tecnicos
    FROM (
        SELECT 
            u.id AS tecnico_id,
            u.nome AS tecnico_nome,
            u.email AS tecnico_email,
            COUNT(DISTINCT ci.produto_id) FILTER (WHERE ci.quantidade_posse > 0) AS total_itens_distintos,
            COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'produto_id', p.id,
                        'nome', p.nome,
                        'codigo_sku', p.codigo_sku,
                        'unidade_medida', p.unidade_medida,
                        'tipo', p.tipo,
                        'quantidade_posse', ci.quantidade_posse
                    ) ORDER BY p.nome
                ) FILTER (WHERE ci.quantidade_posse > 0),
                '[]'::jsonb
            ) AS itens
        FROM public.usuarios u
        JOIN public.custodia_itens ci ON ci.tecnico_id = u.id
        JOIN public.produtos p ON p.id = ci.produto_id
        WHERE ci.empresa_id = p_empresa_id
          AND ci.quantidade_posse > 0
          AND (v_filtro_tecnico IS NULL OR u.id = v_filtro_tecnico)
        GROUP BY u.id, u.nome, u.email
        ORDER BY u.nome
    ) sub;

    -- E. Consumo no período (Agrupado por produto com unidade de medida, sem soma de unidades incompatíveis)
    SELECT COUNT(*)
    INTO v_total_eventos_consumo
    FROM public.movimentacoes m
    WHERE m.empresa_id = p_empresa_id
      AND m.tipo = 'CONSUMO'
      AND m.estornado = false
      AND m.criado_em >= v_inicio 
      AND m.criado_em <= v_fim
      AND (v_filtro_tecnico IS NULL OR m.tecnico_envolvido_id = v_filtro_tecnico);

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'produto_id', p.id,
                'nome', p.nome,
                'codigo_sku', p.codigo_sku,
                'unidade_medida', p.unidade_medida,
                'quantidade_total', c_prod.qtd_total
            ) ORDER BY c_prod.qtd_total DESC
        ),
        '[]'::jsonb
    )
    INTO v_consumo_periodo
    FROM (
        SELECT 
            mi.produto_id, 
            SUM(mi.quantidade) AS qtd_total
        FROM public.movimentacoes m
        JOIN public.movimentacao_itens mi ON mi.movimentacao_id = m.id
        WHERE m.empresa_id = p_empresa_id
          AND m.tipo = 'CONSUMO'
          AND m.estornado = false
          AND m.criado_em >= v_inicio 
          AND m.criado_em <= v_fim
          AND (v_filtro_tecnico IS NULL OR m.tecnico_envolvido_id = v_filtro_tecnico)
        GROUP BY mi.produto_id
    ) c_prod
    JOIN public.produtos p ON p.id = c_prod.produto_id;

    -- F. Perdas e Danos no período
    SELECT 
        COUNT(*) FILTER (WHERE tipo = 'PERDA'),
        COUNT(*) FILTER (WHERE tipo = 'DANO')
    INTO v_total_perdas, v_total_danos
    FROM public.ocorrencias
    WHERE empresa_id = p_empresa_id
      AND criado_em >= v_inicio
      AND criado_em <= v_fim
      AND (v_filtro_tecnico IS NULL OR tecnico_id = v_filtro_tecnico);

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', o.id,
                'tipo', o.tipo,
                'produto_nome', p.nome,
                'codigo_sku', p.codigo_sku,
                'unidade_medida', p.unidade_medida,
                'quantidade', o.quantidade,
                'motivo', o.motivo,
                'situacao_item', o.situacao_item,
                'tecnico_nome', u.nome,
                'criado_em', o.criado_em
            ) ORDER BY o.criado_em DESC
        ),
        '[]'::jsonb
    )
    INTO v_ocorrencias
    FROM (
        SELECT * FROM public.ocorrencias
        WHERE empresa_id = p_empresa_id
          AND criado_em >= v_inicio
          AND criado_em <= v_fim
          AND (v_filtro_tecnico IS NULL OR tecnico_id = v_filtro_tecnico)
        LIMIT 10
    ) o
    JOIN public.produtos p ON p.id = o.produto_id
    LEFT JOIN public.usuarios u ON u.id = o.tecnico_id;

    -- Montagem do objeto JSON final
    v_resultado := jsonb_build_object(
        'periodo', jsonb_build_object(
            'inicio', v_inicio,
            'fim', v_fim
        ),
        'resumo_produtos', jsonb_build_object(
            'total_cadastrados', v_total_produtos,
            'consumiveis', v_consumiveis,
            'ferramentas', v_ferramentas,
            'abaixo_minimo', v_produtos_baixo_estoque
        ),
        'saldos_por_estoque', v_saldos_estoque,
        'custodia_tecnicos', v_custodia_tecnicos,
        'consumo', jsonb_build_object(
            'total_eventos', COALESCE(v_total_eventos_consumo, 0),
            'itens', v_consumo_periodo
        ),
        'perdas_e_danos', jsonb_build_object(
            'total_perdas', v_total_perdas,
            'total_danos', v_total_danos,
            'recentes', v_ocorrencias
        )
    );

    RETURN v_resultado;
END;
$$;

-- 6. FUNÇÃO RPC: OBTER ALERTAS DE ESTOQUE BAIXO COM DISCRIMINAÇÃO CLARA DE CUSTÓDIA
CREATE OR REPLACE FUNCTION public.obter_alertas_estoque(
    p_empresa_id UUID,
    p_estoque_id UUID DEFAULT NULL
)
RETURNS TABLE (
    produto_id UUID,
    codigo_sku VARCHAR,
    produto_nome VARCHAR,
    tipo_produto VARCHAR,
    unidade_medida VARCHAR,
    estoque_minimo NUMERIC,
    saldo_disponivel_deposito NUMERIC,
    saldo_em_custodia_tecnica NUMERIC,
    deficit_reposicao NUMERIC,
    nivel_urgencia VARCHAR,
    estoques_detalhe JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH saldos_dep AS (
        SELECT 
            ei.produto_id,
            COALESCE(SUM(ei.quantidade_disponivel), 0) AS total_deposito,
            jsonb_agg(
                jsonb_build_object(
                    'estoque_id', e.id,
                    'estoque_nome', e.nome,
                    'saldo', ei.quantidade_disponivel
                )
            ) AS estoques_info
        FROM public.estoque_itens ei
        JOIN public.estoques e ON e.id = ei.estoque_id
        WHERE e.empresa_id = p_empresa_id AND e.ativo = true
          AND (p_estoque_id IS NULL OR e.id = p_estoque_id)
        GROUP BY ei.produto_id
    ),
    custodia_tec AS (
        SELECT 
            ci.produto_id,
            COALESCE(SUM(ci.quantidade_posse), 0) AS total_posse
        FROM public.custodia_itens ci
        WHERE ci.empresa_id = p_empresa_id
        GROUP BY ci.produto_id
    )
    SELECT 
        p.id AS produto_id,
        p.codigo_sku,
        p.nome AS produto_nome,
        p.tipo AS tipo_produto,
        p.unidade_medida,
        p.estoque_minimo,
        COALESCE(sdep.total_deposito, 0) AS saldo_disponivel_deposito,
        COALESCE(ctec.total_posse, 0) AS saldo_em_custodia_tecnica,
        GREATEST(0, p.estoque_minimo - COALESCE(sdep.total_deposito, 0)) AS deficit_reposicao,
        (CASE 
            WHEN COALESCE(sdep.total_deposito, 0) = 0 THEN 'CRITICO'
            WHEN COALESCE(sdep.total_deposito, 0) < p.estoque_minimo THEN 'ALERTA'
            ELSE 'ATENCAO'
        END)::VARCHAR AS nivel_urgencia,
        COALESCE(sdep.estoques_info, '[]'::jsonb) AS estoques_detalhe
    FROM public.produtos p
    LEFT JOIN saldos_dep sdep ON sdep.produto_id = p.id
    LEFT JOIN custodia_tec ctec ON ctec.produto_id = p.id
    WHERE p.empresa_id = p_empresa_id
      AND p.ativo = true
      AND p.estoque_minimo > 0
      AND COALESCE(sdep.total_deposito, 0) <= (p.estoque_minimo * 1.2)
    ORDER BY 
        CASE 
            WHEN COALESCE(sdep.total_deposito, 0) = 0 THEN 1
            WHEN COALESCE(sdep.total_deposito, 0) < p.estoque_minimo THEN 2
            ELSE 3
        END,
        (p.estoque_minimo - COALESCE(sdep.total_deposito, 0)) DESC;
END;
$$;
