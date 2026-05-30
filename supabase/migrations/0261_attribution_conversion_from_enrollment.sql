-- 0261_attribution_conversion_from_enrollment.sql
-- @see docs/adr-0011 — Decisão 3 (atribuição multi-estratégia ERP↔tracking)
--
-- Materializa uma matrícula do ERP (erp.enrollments) como uma linha em
-- tracking.conversions atribuída ao canal de ORIGEM do lead. Roda HOJE no branch
-- `tracking-rebase` SEM referenciar erp.* — recebe os dados da matrícula por
-- parâmetro (a app lê do ERP via Supabase client do projeto apza). Pós-união do
-- banco (ver ADR-0011 Decisão 2) a fonte vira um JOIN nativo erp.enrollments ×
-- tracking.leads, mas a tabela-alvo (conversions) e a lógica de match não mudam.
--
-- conversions é a CAMADA UNIFICADA de receita (matrícula ERP + checkout digital).
-- A view analytics.roi_por_campanha já lê dela — então isto "acende" o ROAS real
-- assim que houver overlap matrícula↔lead-rastreado, sem reescrita.

-- Idempotência: 1 conversion por matrícula (source='erp', external_id=enrollment.id).
-- Índice parcial cobre também conversions digitais que tragam external_id.
CREATE UNIQUE INDEX IF NOT EXISTS conversions_source_external_uq
  ON tracking.conversions (source, external_id)
  WHERE external_id IS NOT NULL;

CREATE OR REPLACE FUNCTION tracking.attribute_conversion_from_enrollment(
  p_tenant_id         uuid,
  p_external_id       text,         -- erp.enrollments.id (idempotência)
  p_value_cents       bigint,       -- Σ enrollment_payment_terms.amount_cents
  p_occurred_at       timestamptz,  -- enrolled_at
  p_status            text DEFAULT 'completed',  -- 'completed' | 'refunded'
  p_email             text DEFAULT NULL,         -- students.email (raw — hasheado aqui)
  p_phone             text DEFAULT NULL,         -- students.phone (raw)
  p_app_user_id       uuid DEFAULT NULL,         -- students.user_id ↔ leads.mentoria_app_user_id
  p_currency          text DEFAULT 'BRL',
  p_attribution_model text DEFAULT 'first_touch',-- 'first_touch' | 'last_touch'
  p_payload           jsonb DEFAULT '{}'::jsonb
) RETURNS uuid  -- conversion_id criada/atualizada, ou NULL se não atribuível
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_lead_id     uuid;
  v_campaign_id uuid;
  v_match       text;
  v_conv_id     uuid;
BEGIN
  -- 1. Resolver lead em CASCATA DE CONFIANÇA, dentro do mesmo tenant.

  -- 1a. determinístico — aluno tem conta no app
  IF p_app_user_id IS NOT NULL THEN
    SELECT lead_id INTO v_lead_id
    FROM tracking.leads
    WHERE tenant_id = p_tenant_id AND mentoria_app_user_id = p_app_user_id
    LIMIT 1;
    IF v_lead_id IS NOT NULL THEN v_match := 'app_user_id'; END IF;
  END IF;

  -- 1b. email hash (mesmo algoritmo do Advanced Matching: sha256(lower(trim)))
  IF v_lead_id IS NULL AND p_email IS NOT NULL AND length(trim(p_email)) > 0 THEN
    SELECT lead_id INTO v_lead_id
    FROM tracking.leads
    WHERE tenant_id = p_tenant_id AND email_hash = tracking.hash_pii(p_email)
    LIMIT 1;
    IF v_lead_id IS NOT NULL THEN v_match := 'email_hash'; END IF;
  END IF;

  -- 1c. phone hash (best-effort — só dígitos; confiança menor, ver ADR-0011)
  IF v_lead_id IS NULL AND p_phone IS NOT NULL
     AND length(regexp_replace(p_phone, '\D', '', 'g')) >= 10 THEN
    SELECT lead_id INTO v_lead_id
    FROM tracking.leads
    WHERE tenant_id = p_tenant_id
      AND phone_hash = tracking.hash_pii(regexp_replace(p_phone, '\D', '', 'g'))
    LIMIT 1;
    IF v_lead_id IS NOT NULL THEN v_match := 'phone_hash'; END IF;
  END IF;

  -- 2. Sem lead rastreado → matrícula orgânica/direta/legada. NÃO cria conversion
  --    (lead_id é NOT NULL). Essa receita entra no total do ERP, não no ROAS de canal.
  IF v_lead_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 3. Campanha de origem conforme o modelo de atribuição
  IF p_attribution_model = 'last_touch' THEN
    SELECT last_campaign_id  INTO v_campaign_id FROM tracking.leads WHERE lead_id = v_lead_id;
  ELSE
    SELECT first_campaign_id INTO v_campaign_id FROM tracking.leads WHERE lead_id = v_lead_id;
  END IF;

  -- 4. Upsert idempotente por (source, external_id)
  INSERT INTO tracking.conversions (
    conversion_id, tenant_id, lead_id, conversion_type, value_cents, currency,
    source, external_id, occurred_at, recorded_at, status,
    refunded_at, attributed_campaign_id, attribution_model, payload
  ) VALUES (
    gen_random_uuid(), p_tenant_id, v_lead_id, 'enrollment', p_value_cents, p_currency,
    'erp', p_external_id, p_occurred_at, now(), p_status,
    CASE WHEN p_status = 'refunded' THEN now() ELSE NULL END,
    v_campaign_id, p_attribution_model,
    p_payload || jsonb_build_object('match_strategy', v_match)
  )
  ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL
  DO UPDATE SET
    value_cents            = EXCLUDED.value_cents,
    status                 = EXCLUDED.status,
    refunded_at            = CASE WHEN EXCLUDED.status = 'refunded'
                                  THEN now() ELSE tracking.conversions.refunded_at END,
    attributed_campaign_id = EXCLUDED.attributed_campaign_id,
    attribution_model      = EXCLUDED.attribution_model,
    payload                = EXCLUDED.payload
  RETURNING conversion_id INTO v_conv_id;

  RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION tracking.attribute_conversion_from_enrollment(
  uuid, text, bigint, timestamptz, text, text, text, uuid, text, text, jsonb
) TO service_role;

COMMENT ON FUNCTION tracking.attribute_conversion_from_enrollment IS
  'Materializa matrícula do ERP em tracking.conversions atribuída ao canal de origem do lead. @see docs/adr-0011 Decisão 3. Idempotente por (source=erp, external_id=enrollment.id). NULL se a matrícula não casa com lead rastreado (receita orgânica).';
