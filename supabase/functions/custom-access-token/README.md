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
