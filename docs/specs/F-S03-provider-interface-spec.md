# F-S03 — Provider Interface Specification (portable, code-agnostic)

**Story:** F-S03 — `IHostingProvider` adapter pattern interface
**Author:** Dex
**Data:** 2026-05-25
**Status:** spec only (no code committed yet — repo location TBD)
**Upstream:**
- Story spec: [`/docs/stories/F-S03.md`](../stories/F-S03.md)
- ADR adapter pattern: [`/docs/adr-0008-auto-provisioner-gtm-architecture.md`](../adr-0008-auto-provisioner-gtm-architecture.md) §3.3
- Mirror pattern in ERP: ADR-0011 (Integration Bridge)

---

## 1. Contexto & escopo

Esta spec define o contrato TypeScript da interface `IHostingProvider` que abstrai
provedores de hospedagem WordPress (Hostinger via MCP no MVP-F; WPRestAdapter
genérico em Onda 2). **Nenhum código foi escrito ainda** — Diego está decidindo
onde o `tracking-api` Hono da feature F vai morar (repo `Mentoria-Tracking` raiz?
`Mentoria-Tracking-App/workers/api/`? Repo novo?).

Quando o repo for definido, Dex copia o conteúdo desta spec direto pra `*.ts`.
Sem dependências externas além de `vitest` (devDep) — interface é stdlib-only.

**Out of scope:**
- Implementação real do `HostingerAdapter` (= F-S04, separate story)
- Exception middleware Hono (= F-S05)
- Auditoria / RLS / DB writes (= F-S01 storage)

---

## 2. Decisões herdadas

| Decisão | Origem | Notes |
|---|---|---|
| Adapter pattern Strategy | ADR-0008 §3.3 | espelha ADR-0011 ERP Integration Bridge |
| Factory `getProvider()` retorna instance | River F-S03 spec AC-3 | stateless, sem singleton |
| Class-based impl (não factory fn) | River spec §Tech Notes | permite subclass se preciso |
| Error handling via `throw` + classes | River F-S03 briefing | hierarchy específica desta spec §5 |
| Credentials plaintext no constructor | River spec §Tech Notes | caller decifra ANTES (F-S02 sealDecrypt) |
| 4 métodos canônicos na interface | River spec AC-1 | adições futuras = breaking change ADR |
| `MockProvider` separado do `HostingerAdapter` stub | Pax briefing | facilita tests downstream F-S05+ |

**Conflito briefing × story spec resolvido:**
- Briefing default Pax sugeriu 5 métodos (`validateToken`, `listSites`, `deployPlugin`, `validateDomain`, `uninstallPlugin`) + `MockProvider`.
- Story spec River (autoridade) define 4 métodos (`listSites`, `verifyDomain`, `deployPlugin`, `pingToken`) + `HostingerAdapter` stub.
- **Esta spec consolida ambos:**
  - 4 métodos canônicos do River (interface enxuta) — usados por endpoints F-S05.
  - Error class hierarchy do briefing Pax — pré-cria classes pra F-S05 reusar.
  - `MockProvider` separado pra testes downstream (briefing Pax) — `HostingerAdapter` permanece stub vazio (F-S04 ownership).
- `uninstallPlugin` (rollback) **fica fora da interface no MVP-F** — ADR-0008 não exige rollback ainda. Vira candidato pra Onda 2 ou story dedicada F-S0X. Documentado no §8 Open Questions.

---

## 3. Estrutura de arquivos proposta

Caminho relativo ao `tracking-api/` (qualquer que seja o repo final):

```
src/lib/providers/
├── IHostingProvider.ts        # interface + types (~80 LoC)
├── errors.ts                  # ProviderError + 4 subclasses (~50 LoC)
├── HostingerAdapter.ts        # stub class, F-S04 implementa (~40 LoC)
├── MockProvider.ts            # impl in-memory determinística pra tests (~80 LoC)
├── factory.ts (ou inline em index.ts)
├── index.ts                   # public API: re-exports (~30 LoC)
└── __tests__/
    ├── factory.test.ts        # 5 testes AC-5
    └── mock-provider.test.ts  # 6 testes smoke MockProvider
```

Total estimado: ~280 LoC produção + ~150 LoC tests.

---

## 4. Interface `IHostingProvider`

### 4.1 Assinatura (literal copy-paste-ready)

```ts
export interface IHostingProvider {
  /**
   * Lista sites WP geridos pela conta autenticada pelo token.
   * @throws {TokenInvalidError} token rejeitado pelo provider
   * @throws {RateLimitError} se MCP retornar 429
   * @throws {ProviderError} qualquer outra falha upstream
   */
  listSites(): Promise<Site[]>;

  /**
   * Verifica se o domínio dado pertence à conta autenticada.
   * Anti-takeover guard. Retorna boolean — NÃO throw quando domínio não
   * pertence (apenas false).
   * @throws {TokenInvalidError} se token rejeitado
   */
  verifyDomain(domain: string): Promise<boolean>;

  /**
   * Deploya plugin GTM4WP no site alvo. Caller garante que domain está em
   * listSites() antes (idealmente via verifyDomain).
   * @throws {DomainNotOwnedError} se domínio não pertence à conta
   * @throws {TokenInvalidError} se token rejeitado
   * @throws {ProviderError} falha de upload / extração
   */
  deployPlugin(opts: DeployPluginOpts): Promise<DeployResult>;

  /**
   * Healthcheck barato de credencial. Retorna boolean — NÃO throw.
   * Usado pelo endpoint F-S05 antes de persistir conta no storage.
   */
  pingToken(): Promise<boolean>;
}
```

### 4.2 Types adjacentes

```ts
export interface Site {
  domain: string;                  // "zerohum.com.br" (sem protocolo)
  wp_version?: string;             // "6.5.3" se detectado
  php_version?: string;            // "8.2"
  ttfb_ms?: number;                // smoke health
  is_wordpress: boolean;           // false se MCP detecta não-WP
}

export interface DeployPluginOpts {
  domain: string;                  // alvo (precisa estar em listSites())
  slug: string;                    // "gtm4wp-mentoria"
  pluginPath: string;              // path absoluto local container, ex "/app/plugins/gtm4wp-mentoria"
}

export interface DeployResult {
  status: 'success' | 'partial' | 'failed';
  summary?: { successful: number; failed: number };  // file counts
  uploadDirName?: string;          // "gtm4wp-mentoria-aB3kZ9pQ"
  errorSummary?: string;           // truncated 500 chars
}
```

### 4.3 ProviderType + factory

```ts
export type ProviderType = 'hostinger' | 'wp_rest';

export function getProvider(
  type: ProviderType,
  credentials: { token: string; wpAdminPassword?: string },
): IHostingProvider {
  if (type === 'hostinger') return new HostingerAdapter(credentials);
  if (type === 'wp_rest') {
    throw new Error("Provider 'wp_rest' is Onda 2 — not implemented in MVP F");
  }
  throw new Error(`Unknown provider type: ${String(type)}`);
}
```

---

## 5. Error class hierarchy

Hierarchy enxuta (4 subclasses + base). Vive em `errors.ts`. F-S05 middleware Hono
maps cada subclasse pra HTTP status apropriado.

```ts
/**
 * Base class — provider invariant violation. Inclui statusCode pra middleware
 * Hono fazer map declarativo: ProviderError.statusCode ?? 502.
 */
export class ProviderError extends Error {
  readonly statusCode: number = 502;
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ProviderError';
    this.cause = cause;
  }
}

/**
 * Token rejeitado pelo provider (401/403 upstream).
 * Middleware F-S05 → HTTP 401 com body { error: 'invalid_token' }.
 */
export class TokenInvalidError extends ProviderError {
  readonly statusCode = 401;
  constructor(message = 'Token rejected by provider', cause?: unknown) {
    super(message, cause);
    this.name = 'TokenInvalidError';
  }
}

/**
 * Rate limit upstream (429). Contém retryAfterSeconds quando provider expõe.
 * Middleware F-S05 → HTTP 429 com header Retry-After.
 */
export class RateLimitError extends ProviderError {
  readonly statusCode = 429;
  readonly retryAfterSeconds?: number;

  constructor(retryAfterSeconds?: number, cause?: unknown) {
    super('Provider rate limit exceeded', cause);
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Anti-takeover guard: domínio passado pelo usuário NÃO está em listSites().
 * Middleware F-S05 → HTTP 403 com body { error: 'domain_not_owned', domain }.
 */
export class DomainNotOwnedError extends ProviderError {
  readonly statusCode = 403;
  readonly domain: string;

  constructor(domain: string) {
    super(`Domain "${domain}" not owned by authenticated account`);
    this.name = 'DomainNotOwnedError';
    this.domain = domain;
  }
}
```

**Convenção:** todas as subclasses setam `this.name = '<ClassName>'` pra logs
estruturados (Hono logger captura `err.name`). `cause` opcional preserva error
upstream original (MCP SDK error) sem perder stack.

---

## 6. `HostingerAdapter` stub (F-S04 implementa)

```ts
import type { DeployPluginOpts, DeployResult, IHostingProvider, Site } from './IHostingProvider';

/**
 * @todo F-S04 — implementar via Hostinger MCP per ADR-0008 §3.1.
 * Todos os métodos lançam Error("Not implemented yet — see F-S04").
 */
export class HostingerAdapter implements IHostingProvider {
  private readonly token: string;
  private readonly wpAdminPassword?: string;

  constructor(credentials: { token: string; wpAdminPassword?: string }) {
    this.token = credentials.token;
    this.wpAdminPassword = credentials.wpAdminPassword;
  }

  async listSites(): Promise<Site[]> {
    void this.token; void this.wpAdminPassword;
    throw new Error('Not implemented yet — see F-S04');
  }
  async verifyDomain(_domain: string): Promise<boolean> {
    throw new Error('Not implemented yet — see F-S04');
  }
  async deployPlugin(_opts: DeployPluginOpts): Promise<DeployResult> {
    throw new Error('Not implemented yet — see F-S04');
  }
  async pingToken(): Promise<boolean> {
    throw new Error('Not implemented yet — see F-S04');
  }
}
```

---

## 7. `MockProvider` (pra tests downstream)

Implementação in-memory determinística — F-S05+ usam pra unit-test endpoints sem
tocar Hostinger MCP. Comportamento configurável via constructor opts.

### 7.1 Pseudocode

```ts
export interface MockProviderOpts {
  /** Sites que listSites() retorna. Default: array com 1 site fake. */
  sites?: Site[];
  /** Domínios que verifyDomain() retorna true. Default: extraído de sites[]. */
  ownedDomains?: string[];
  /** Se true, todos os métodos lançam TokenInvalidError. Default: false. */
  invalidToken?: boolean;
  /** Se setado, lança RateLimitError(retryAfter). Default: undefined. */
  rateLimitRetryAfter?: number;
  /** Override do retorno de deployPlugin. Default: { status: 'success', ... }. */
  deployResult?: DeployResult;
  /** Override do retorno de pingToken. Default: !invalidToken. */
  pingResult?: boolean;
}

export class MockProvider implements IHostingProvider {
  constructor(opts: MockProviderOpts = {}) { ... }

  async listSites(): Promise<Site[]> {
    if (this.opts.invalidToken) throw new TokenInvalidError();
    if (this.opts.rateLimitRetryAfter !== undefined) {
      throw new RateLimitError(this.opts.rateLimitRetryAfter);
    }
    return this.opts.sites ?? [DEFAULT_FAKE_SITE];
  }

  async verifyDomain(domain: string): Promise<boolean> {
    if (this.opts.invalidToken) throw new TokenInvalidError();
    const owned = this.opts.ownedDomains
      ?? (this.opts.sites ?? [DEFAULT_FAKE_SITE]).map(s => s.domain);
    return owned.includes(domain);
  }

  async deployPlugin(opts: DeployPluginOpts): Promise<DeployResult> {
    if (this.opts.invalidToken) throw new TokenInvalidError();
    const owned = await this.verifyDomain(opts.domain);
    if (!owned) throw new DomainNotOwnedError(opts.domain);
    return this.opts.deployResult ?? {
      status: 'success',
      summary: { successful: 12, failed: 0 },
      uploadDirName: `${opts.slug}-mock${Math.random().toString(36).slice(2, 10)}`,
    };
  }

  async pingToken(): Promise<boolean> {
    if (this.opts.rateLimitRetryAfter !== undefined) {
      throw new RateLimitError(this.opts.rateLimitRetryAfter);
    }
    return this.opts.pingResult ?? !this.opts.invalidToken;
  }
}

const DEFAULT_FAKE_SITE: Site = {
  domain: 'mock-site.test',
  wp_version: '6.5.3',
  php_version: '8.2',
  ttfb_ms: 120,
  is_wordpress: true,
};
```

**Não exportar de `index.ts` em prod** — `MockProvider` é só pra `__tests__/`.
F-S05+ importam direto: `import { MockProvider } from '../providers/MockProvider'`.

---

## 8. Test scenarios

### 8.1 `factory.test.ts` — 5 testes (AC-5 + extras)

| # | Scenario | Expectativa |
|---|---|---|
| 1 | `getProvider('hostinger', { token })` | `instanceof HostingerAdapter` + 4 methods são `function` |
| 2 | `getProvider('wp_rest', { token })` | throw com regex `/Onda 2/` |
| 3 | `getProvider('unknown' as any, { token })` | throw com regex `/Unknown provider/` |
| 4 | `adapter.listSites()` (stub) | rejects com regex `/Not implemented/` |
| 5 | `getProvider('hostinger', { token, wpAdminPassword })` | aceita constructor opcional, `instanceof HostingerAdapter` |

### 8.2 `mock-provider.test.ts` — 6 testes smoke

| # | Scenario | Setup | Expectativa |
|---|---|---|---|
| 1 | Default mock: listSites retorna 1 fake | `new MockProvider()` | `[{ domain: 'mock-site.test', is_wordpress: true, ... }]` |
| 2 | verifyDomain matches sites array | `new MockProvider({ sites: [siteA, siteB] })` | `verifyDomain('siteA.com')` → true; `'other.com'` → false |
| 3 | invalidToken propaga TokenInvalidError | `new MockProvider({ invalidToken: true })` | `await listSites()` rejects `TokenInvalidError` |
| 4 | rateLimitRetryAfter propaga RateLimitError | `new MockProvider({ rateLimitRetryAfter: 60 })` | rejeita com `err.retryAfterSeconds === 60` |
| 5 | deployPlugin throw DomainNotOwnedError quando domain ausente | mock com sites=[zerohum.com.br]; chamar com `domain='evil.com'` | rejects `DomainNotOwnedError`, `err.domain === 'evil.com'` |
| 6 | deployPlugin success path | default mock | `result.status === 'success'`, `summary.successful === 12` |

### 8.3 Type-only assertion (compile-time)

```ts
// Falha tsc se HostingerAdapter ou MockProvider sair fora do contrato.
const _h: IHostingProvider = new HostingerAdapter({ token: 'x' });
const _m: IHostingProvider = new MockProvider();
void _h; void _m;
```

### 8.4 Smoke pós-deploy (F-S05+)

```bash
node -e "const { getProvider } = require('./dist/lib/providers'); \
  console.log(getProvider('hostinger', { token: 't' }).constructor.name)"
# expected stdout: HostingerAdapter
```

---

## 9. Definition of Done (porting checklist)

Quando Dex (eu) porta esta spec pro repo definido por Diego:

- [ ] 7 arquivos criados (interface + errors + 2 impls + factory + 2 test files)
- [ ] `tsc --noEmit --strict` exit 0
- [ ] `vitest run` PASS 11/11 (5 factory + 6 mock-provider)
- [ ] `MockProvider` NÃO re-exportado em `index.ts` (só interno pra tests)
- [ ] Doc inline em `IHostingProvider.ts` cita ADR-0008 §3.3
- [ ] Doc inline em `HostingerAdapter.ts` cita `@todo F-S04`
- [ ] `errors.ts` cada subclass tem `this.name = '<ClassName>'`
- [ ] Code review Aria (fidelidade ADR-0008 §3.3) + Quinn (edge cases tests)
- [ ] Sem regressão tests existentes do repo destino

---

## 10. Open questions / trade-offs

1. **Repo location TBD** — Diego decide entre:
   - (a) `Mentoria-Tracking` raiz → `tracking-api/` novo (isolado, limpo, mas bootstrap full)
   - (b) `Mentoria-Tracking-App/workers/api/` → adicionar `providers/` ao backend Hono existente (já tem Hono + vitest disponíveis no node_modules)
   - (c) Repo novo `mentoria-tracking-api` separado (maior overhead infra)
   - **Recomendação Dex:** (b) — backend Hono já existe e roda em prod (KV8 Easypanel), zero bootstrap, F-S01 (storage) e F-S02 (crypto) podem co-habitar mesmo lugar.

2. **`uninstallPlugin` / rollback** ficou fora da interface. ADR-0008 não exige
   rollback em MVP-F. Se F-S05 precisar (ex: refund Hotmart → desinstalar tag),
   abrir story dedicada F-S0X. Alternativa: adicionar agora marcado como
   `@experimental` na interface e implementar no-op em `HostingerAdapter` stub.
   **Recomendação Dex:** deixar fora — YAGNI. Onda 2 reabre.

3. **Constructor sem validação de token format** — se `token === ''` ou
   `undefined`, `HostingerAdapter` aceita silenciosamente e falha em runtime na
   1ª chamada. River explicitamente delegou esse check pra F-S04. Spec mantém.
   `MockProvider` idem (tests passam token fake livremente).

4. **`MockProvider` no `node_modules` publicado?** Se algum dia `tracking-api`
   virar package npm, `MockProvider` é útil pra consumers testarem integração.
   Por ora mantém interno (`__tests__/` neighbor). Reavaliar em Onda 2.

5. **Error classes em arquivo separado** (`errors.ts`) ou inline em
   `IHostingProvider.ts`? Separado — F-S05 middleware Hono importa só errors
   sem trazer types da interface. Reduz acoplamento.

6. **`statusCode` em `ProviderError` é readonly numérico** — alternativa: enum
   `HttpStatus.BAD_GATEWAY`. Manter número literal: zero deps externas, suporta
   custom codes futuros sem expandir enum.

---

## 11. Próximos passos

1. **Diego decide repo location** (ver §10.1).
2. **Pax confirma F-S01 e F-S02 também escrevem specs** (não code) — pra
   garantir Sprint 0 inteiro fica portable até decisão.
3. **Dex porta esta spec pra TS** quando repo definido (~1.5h de impl + tests
   conforme story estimate 2pts).
4. **Felix PR** após F-S01 + F-S02 + F-S03 todos implementados no repo escolhido.

---

**Aderência CLAUDE.md verificada:**
- ✅ Sem Cloudflare. `tracking-api` mora em Easypanel KV8 (qualquer repo).
- ✅ Sem migrations DB. Spec é puro TypeScript.
- ✅ Sem touch git em repo nenhum (estado spec-only).
- ✅ Provider pattern canônico ERP (ADR-0011) — Dex espelha.
