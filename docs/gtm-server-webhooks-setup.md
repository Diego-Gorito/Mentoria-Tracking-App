# GTM Server V2 — Webhooks Kiwify + Kirvano (Setup)

> Custom Clients criados via API 2026-05-28. Container `GTM-KLDMV2VH` (253664663).

## Estado atual

| Component | Status | ID |
|---|---|---|
| Kiwify Webhook Client template | ✅ instalado | templateId=60 |
| Kirvano Webhook Client template | ✅ instalado | templateId=61 |
| Kiwify Client instance | ✅ ativo | clientId=62 |
| Kirvano Client instance | ✅ ativo | clientId=63 |
| HMAC sig validation | ❌ TODO | — |
| Per-tenant secret lookup | ❌ TODO | — |

**MVP funcional** — recebe webhook + parsea + dispara `runContainer(eventData)`. Tags
downstream (Meta CAPI, GA4 API, G Ads) reagem ao `event_name=purchase` etc.

## Como funciona

```
[Kiwify checkout] ─POST→ https://gtm.colegiomentoria.com.br/kiwify
                          │
                          ├─ Custom Client (templateId 60) claim request
                          ├─ Parse JSON body
                          ├─ Normalize → eventData{ event_name, value, currency,
                          │              transaction_id, user_data, tracking }
                          └─ runContainer(eventData) → dispara tags downstream:
                              - Meta CAPI (purchase)
                              - GA4 server (purchase)
                              - G Ads server (conversion)
```

## Setup necessário (próxima sessão)

### 1. Rotear DNS / proxy
sGTM precisa receber traffic em `gtm.colegiomentoria.com.br`. Já existe?

Verificar:
```bash
curl -X POST https://gtm.colegiomentoria.com.br/kiwify \
  -H 'Content-Type: application/json' \
  -d '{"webhook_event_type":"compra_aprovada","order_id":"test","Customer":{"email":"test@test.com"}}'
```

### 2. Configurar webhook na conta Kiwify

URL: `https://gtm.colegiomentoria.com.br/kiwify`

Triggers a habilitar:
- `compra_aprovada` → vira `event_name=purchase`
- `compra_reembolsada` → `refund`
- `chargeback` → `chargeback`
- `carrinho_abandonado` → `abandon_checkout`
- `subscription_*` → `subscription_*`

Token compartilhado: ❗ Diego define. Vai no header `X-Kiwify-Token` (TODO no Client).

### 3. Configurar webhook na conta Kirvano

URL: `https://gtm.colegiomentoria.com.br/kirvano`

Triggers a habilitar:
- `SALE_APPROVED` → `purchase`
- `SALE_REFUNDED` → `refund`
- `SALE_CHARGEBACK` → `chargeback`
- `SUBSCRIPTION_*` → `subscription_*`

Token compartilhado: ❗ Diego define. Vai no header `X-Kirvano-Token` (TODO no Client).

### 4. Adicionar HMAC validation (próximo PR)

Atualmente os Custom Clients aceitam qualquer POST. **Risco:** alguém pode mandar webhook fake.

Plano:
```javascript
// Adicionar no início do Custom Client (após claimRequest):
const sigHeader = getRequestHeader('X-Kiwify-Token'); // ou X-Kirvano-Token
const expectedSecret = ???; // lookup via SGTM_CREDENTIALS env file

if (sigHeader !== expectedSecret) {
  setResponseStatus(401);
  setResponseBody('{"error":"invalid signature"}');
  returnResponse();
  return;
}
```

Mas isso requer:
- Definir SGTM_CREDENTIALS no env do container sGTM (`/etc/sgtm-keyfile.json`)
- Por-tenant secrets quando container for clonado pra novo cliente
- Pode usar `require('readKeyFile')` ou env var

### 5. Idempotency (próximo PR)

Mesmo webhook pode ser enviado 2x pelo Kiwify/Kirvano. Pra evitar double-counting:
- Dedup por `transaction_id` em Redis com TTL 24h
- Se já processado → 200 OK + skip runContainer

## Payload sample esperado

### Kiwify compra_aprovada
```json
{
  "webhook_event_type": "compra_aprovada",
  "order_id": "abc123",
  "order_status": "paid",
  "order_total": 49700,
  "currency": "BRL",
  "Customer": {
    "first_name": "João",
    "last_name": "Silva",
    "email": "joao@example.com",
    "mobile": "+5511987654321",
    "CPF": "12345678900",
    "city": "São Paulo",
    "state": "SP",
    "country": "BR"
  },
  "Product": {
    "product_id": "prod_x",
    "product_name": "Curso Exemplo"
  },
  "TrackingParameters": {
    "utm_source": "facebook",
    "utm_medium": "cpc",
    "utm_campaign": "campanha_x",
    "fbp": "fb.1.xxx",
    "fbc": "fb.1.yyy"
  }
}
```

### Kirvano SALE_APPROVED
```json
{
  "event": "SALE_APPROVED",
  "data": {
    "order": {
      "id": "abc123",
      "total": 49700,
      "currency": "BRL"
    },
    "customer": {
      "name": "João Silva",
      "email": "joao@example.com",
      "phone": "+5511987654321",
      "cpf": "12345678900"
    },
    "products": [
      {"id": "prod_x", "name": "Curso Exemplo"}
    ],
    "total_amount": 49700,
    "currency": "BRL",
    "tracking": {
      "utm_source": "facebook",
      "fbp": "fb.1.xxx",
      "fbc": "fb.1.yyy"
    }
  }
}
```

## Tags downstream que reagem

Tags existentes no SERVER V2 que devem disparar com `event_name=purchase`:

| Tag | Trigger esperado |
|---|---|
| `01.01 [CT] [GA4] Evento - purchase` | Custom Event = purchase |
| `02.01 [CT] [Meta Ads] Conversão - purchase` | Custom Event = purchase |
| `03.03 [CT] [G Ads] Conversão - purchase` | Custom Event = purchase |
| `n8n Forward — All Events` | All Events trigger |

❗ **Validar** se triggers atuais (criados pra GA4 client) reagem a events gerados por Custom Client.
Em GTM Server, `runContainer(eventData)` dispara TODAS as tags cujo trigger matche o eventData — independente do client source. Deve funcionar.

## Roadmap

- [x] Templates Kiwify + Kirvano Custom Client criados via API
- [x] Client instances ativos no container
- [x] Snapshot v0.2 do SERVER V2
- [ ] HMAC sig validation
- [ ] Per-tenant secret lookup
- [ ] Idempotency dedup
- [ ] Tests com payload samples
- [ ] Smoke test E2E em produção
- [ ] Publicar version live
