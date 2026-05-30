-- 0268_cost_sync_runs_audit.sql
-- Observabilidade do cost-sync (SaaS alto padrão): cada execução grava um registro
-- de auditoria com resultado, contas processadas e erros por plataforma. Permite
-- diagnosticar o cron via SQL sem depender de logs do container. @see docs/adr-0011 §5b.

CREATE TABLE IF NOT EXISTS tracking.cost_sync_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  trigger            text NOT NULL DEFAULT 'cron',  -- cron | api
  tenants            int  NOT NULL DEFAULT 0,
  campaigns_upserted int  NOT NULL DEFAULT 0,
  ok                 boolean NOT NULL DEFAULT false,
  detail             jsonb NOT NULL DEFAULT '{}'::jsonb,  -- byTenant/byPlatform (sem PII, sem token)
  error              text
);

CREATE INDEX IF NOT EXISTS cost_sync_runs_started_idx ON tracking.cost_sync_runs (started_at DESC);

-- Tabela de ops: só o backend (service_role) escreve/lê. RLS habilitado = default
-- deny pra anon/authenticated (sem policy). Nada de PII aqui.
ALTER TABLE tracking.cost_sync_runs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON tracking.cost_sync_runs TO service_role;

COMMENT ON TABLE tracking.cost_sync_runs IS
  'Auditoria de execuções do cost-sync (resultado + erros por plataforma). Sem PII/token. @see docs/adr-0011 5b.';
