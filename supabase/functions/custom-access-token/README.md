# custom-access-token — Auth Hook (Edge Function Deno)

Enriquece JWT com claims customizadas para RLS cross-product:
`tenant_id`, `products`, `current_product`, `tracking_role`, `erp_role`.

Ref: ADR-0007 v1.2 Fase 3 + ADR-0085 v1.1 (ERP).

> REGRA #-2: Edge Function Deno é **única exceção** Cloudflare-Last (Supabase obriga Deno runtime para Auth Hooks).

---

## Deploy

```bash
# Autenticar (uma vez por sessão)
supabase login

# Deploy para o projeto staging
supabase functions deploy custom-access-token --project-ref cjtwrzlwfqvzukjinmjr
```

## Variáveis de ambiente necessárias

Devem estar configuradas no Dashboard Supabase → Project Settings → Edge Functions:

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto: `https://cjtwrzlwfqvzukjinmjr.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service_role (Dashboard → Project Settings → API → Service Role) |

Ambas são injetadas automaticamente por `wrappers` no Supabase — confirmar se estão presentes via Dashboard.

## Ativar o Hook no Dashboard

1. Dashboard Supabase → **Authentication** → **Hooks**
2. Seção **Custom Access Token**
3. Tipo: **HTTP Request**
4. URL: `https://cjtwrzlwfqvzukjinmjr.supabase.co/functions/v1/custom-access-token`
5. Clicar **Save**

> Alternativa via `config.toml` (já configurado): `supabase db push` aplica o hook via CLI se o projeto local estiver linkado.

## Testar (invoke manual)

```bash
# Substituir <ANON_KEY> pela chave anon do projeto
# (Dashboard → Project Settings → API → anon public)
curl -X POST https://cjtwrzlwfqvzukjinmjr.supabase.co/functions/v1/custom-access-token \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "<uuid-do-user>",
    "claims": { "sub": "<uuid-do-user>", "email": "test@test.com" }
  }'
```

Resposta esperada (usuário com tenant):
```json
{
  "claims": {
    "sub": "<uuid>",
    "email": "test@test.com",
    "tenant_id": "<tenant-uuid>",
    "products": ["tracking"],
    "current_product": "tracking",
    "tracking_role": "mentoria_tracking_role",
    "erp_role": null
  }
}
```

Resposta esperada (usuário sem tenant — recém-criado):
```json
{
  "claims": {
    "sub": "<uuid>",
    "email": "test@test.com",
    "tenant_id": null,
    "products": [],
    "current_product": null,
    "tracking_role": null,
    "erp_role": null
  }
}
```

## Comportamento esperado

- **Usuário com tenant** → JWT enriched, RLS `core.events_log` filtra por `current_product='tracking'`
- **Usuário sem tenant** → claims básicas retornadas, nenhuma RLS cross-product ativa
- **Erro DB** → mesmo path que "sem tenant" (warning no log, não 500)

## Schema-qualified queries (fix C1)

O cliente Supabase JS usa `.schema('core').from('tenant_users')` — nunca `from('core.tenant_users')`.
Isso garante que o PostgREST envie o header `Accept-Profile: core` corretamente.

## Ativar Auth Hook no Dashboard

Após deploy, ativar manualmente:

1. Dashboard: https://supabase.com/dashboard/project/cjtwrzlwfqvzukjinmjr/auth/hooks
2. Seção **Custom Access Token** → Enable
3. Type: **HTTP Request**
4. URL: `https://cjtwrzlwfqvzukjinmjr.supabase.co/functions/v1/custom-access-token`
5. Clicar **Save**

> O `config.toml` já tem `[auth.hook.custom_access_token]` configurado — mas o Dashboard override tem precedência
> em branches Supabase. Confirmar via Dashboard após deploy.

## Cold start em Branch Supabase (nota operacional)

Branches Supabase têm Edge Runtime em modo idle. A **primeira** invocação após deploy ou período de inatividade
pode resultar em `IDLE_TIMEOUT` (150s) ou `504`. Isso é esperado — não indica bug na função.

**Workaround para smoke test:**
1. Invocar 2-3 vezes até warm up (geralmente resolve em <5 min após deploy)
2. OU fazer deploy e testar no dia seguinte (branch acorda com a primeira requisição real)
3. Para testes contínuos: usar `supabase functions serve` localmente com `--no-verify-jwt`

**Verificar que está deployada (mesmo sem smoke OK):**
```bash
# Checar no Dashboard
# https://supabase.com/dashboard/project/cjtwrzlwfqvzukjinmjr/functions
# A função custom-access-token deve aparecer com status Active
```

## Config.toml fix (v2.75 CLI)

O CLI v2.75 exige o campo `secrets` no `[auth.hook.custom_access_token]`. Manter como `secrets = ""` no
`config.toml` local para compatibilidade. O campo não afeta o deploy remoto.

Deploy via workdir temporário (sem auth.hook no config) é o método correto para v2.75:
```bash
# Usar /tmp/supabase-deploy-temp/ (config mínimo sem hook section)
cd /tmp/supabase-deploy-temp && supabase functions deploy custom-access-token \
  --project-ref cjtwrzlwfqvzukjinmjr --use-api
```
