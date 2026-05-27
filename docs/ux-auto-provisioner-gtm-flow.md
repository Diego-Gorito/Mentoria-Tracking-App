# UX Flow — Auto-Provisioner GTM (MVP Hostinger-Only)

**Autora:** Uma (UX Design Expert)
**Data:** 2026-05-25
**Status:** Draft pra revisão Diego + handoff Nova/River/Dex
**Modelo:** Opus 4.7 (1M context)
**Insumos:** PRD Kai (`docs/prd-auto-provisioner-gtm-mvp.md`) + design-system-extract (tokens/components/copy snippets ERP→tracking-app)

> **Princípio orientador (Manifesto 22/05):** Diego é único usuário. UI tem que dar **confiança absoluta** ("o sistema fez certo?") e **eliminar fricção** ("não preciso pensar"). Cada tela tem que responder à pergunta da Diego: "o que está acontecendo agora?" e "o que eu faço se quebrar?".

---

## 1. User & Job-to-Be-Done

### 1.1 Persona — Diego (MVP único user)

| Eixo | Detalhe |
|---|---|
| Role | Admin Mentoria (proprietário da stack) |
| Contexto técnico | Conhece GTM, dataLayer, Hostinger, mas quer **deixar de operar manualmente** |
| Device primário | Desktop (1440px+) — operação ops em casa/escritório |
| Device secundário | Mobile 375px — conferir status rápido fora do escritório |
| Mood durante uso | **Cauteloso** ("vai modificar meu site em prod") + **impaciente** ("se for igual mexer no hPanel não vale a pena") |

### 1.2 Jobs-to-Be-Done

**Job principal:**
> "Quando eu precisar instalar tracking GTM num site WP que eu administro, eu quero **clicar em 1 botão e ter confiança de que vai funcionar**, pra economizar 45-90min de operação manual sem arriscar quebrar o site em produção."

**Sub-jobs emocionais:**
1. **Confiança** — "preciso ver que o sistema realmente instalou (não só disse que instalou)"
2. **Reversibilidade** — "se der ruim, quero saber **como reverter** sem entrar no SSH"
3. **Auditoria** — "preciso de log do que foi feito quando, caso descubra problema 3 dias depois"
4. **Economia cognitiva** — "não quero abrir Hostinger + WP-admin + GTM em 3 abas pra entender o status"

### 1.3 Não-jobs (explicitamente fora — Onda 2)

- ❌ Onboarding self-service de gestor externo (Diego pula login direto)
- ❌ Wizard tipo SaaS (Diego não precisa hand-holding)
- ❌ Multi-account Hostinger (1 token só MVP)
- ❌ Gestão tags GTM (continua em tagmanager.google.com)

---

## 2. Information Architecture

### 2.1 Posicionamento no menu lateral existente

```
┌─ Sidebar ───────────────────┐
│  Logo Mentoria              │
│                             │
│  📊 Dashboard               │
│  🌐 Sites Conectados   NEW  │  ← Nova entrada
│  ⚙️  Configurações          │
│  📨 Webhooks                │
│  📈 Analytics               │
│                             │
│  ─────────────────────      │
│  Avatar Diego               │
└─────────────────────────────┘
```

**Decisão UX-001:** Entrada nova **"Sites Conectados"** entre Dashboard e Configurações.
- **Por quê não em Configurações?** É operação recorrente (não config one-shot). Diego vai voltar lá pra ver status dos 4 brands. Merece nível 1 no menu.
- **Por quê não "Sites" só?** Ambíguo (sites de quê?). "Sites Conectados" sinaliza que tem **estado** ("conectado vs não conectado").
- **Badge NEW** primeiros 14 dias (orientação visual) depois remove.

### 2.2 Hierarquia de rotas

```
/sites                          → Lista de sites conectados + empty state
/sites/connect                  → Wizard conectar provider (Hostinger MVP)
/sites/:siteId                  → Detalhe de 1 site instalado + audit log
/sites/:siteId/install          → Modal/route deploy em progresso
/sites/:siteId/logs             → Audit log completo (opcional, pode ser tab dentro de detalhe)
```

**Decisão UX-002:** `/sites/connect` é **rota dedicada**, não modal. Justificativa:
- Token Hostinger é dado **sensível**, sem distração de UI atrás
- Permite voltar via browser back sem perder progresso
- Diego pode bookmarkar pra colar token novo quando expirar

**Decisão UX-003:** Install progress é **modal full-screen**, não rota:
- Diego precisa **focar** no progresso (4 passos, 30-90s)
- Modal previne navegação acidental durante deploy
- Esc desabilitado durante install (só após sucesso/falha)

---

## 3. Flow detalhado — 7 telas

### Tela 1 — `/sites` Empty state (primeiro uso)

**Objetivo:** Mostrar que feature existe + dar 1 caminho óbvio.

```
┌─────────────────────────────────────────────────────────────┐
│  Sites Conectados                                            │
│  Instale tracking GTM nos seus sites com 1 clique.          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                                                              │
│                    ┌────────────────┐                        │
│                    │   🌐  (icon)   │                        │
│                    └────────────────┘                        │
│                                                              │
│           Nenhum site conectado ainda                        │
│                                                              │
│     Conecte sua conta Hostinger pra listar seus sites       │
│     WordPress e instalar tracking automaticamente.           │
│                                                              │
│            [  Conectar via Hostinger  ]                      │
│                                                              │
│            Outros providers em breve (cPanel, WPEngine)      │
│                                                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Microcopy:**
- Header: **"Sites Conectados"** (h1, text-display-sm)
- Subhead: **"Instale tracking GTM nos seus sites com 1 clique."**
- Empty title: **"Nenhum site conectado ainda"**
- Empty body: **"Conecte sua conta Hostinger pra listar seus sites WordPress e instalar tracking automaticamente."**
- CTA primário: **"Conectar via Hostinger"** (Button variant=primary, verde Mentoria)
- Texto teaser: **"Outros providers em breve (cPanel, WPEngine)"** (text-muted, sem CTA)

**Componente reaproveitado:** `<EmptyState />` do design-system-extract.

**States:**
- Loading (primeiro paint): skeleton centralizado (3 lines + button-shaped)
- Error (API `/api/sites` falhou): EmptyState variant=error + CTA "Tentar de novo"
- Offline: banner topo `"Sem conexão. Mostrando dados em cache."` (se houver cache)

---

### Tela 2 — `/sites/connect` Conectar Hostinger

**Objetivo:** Diego cola token, sistema valida, persiste em Vault.

```
┌─────────────────────────────────────────────────────────────┐
│  ←  Voltar                                                   │
│                                                              │
│  Conectar Hostinger                                          │
│  Cole seu token API pra listar seus sites.                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Como obter seu token Hostinger?               ▼   │    │
│  ├────────────────────────────────────────────────────┤    │
│  │  1. Acesse hpanel.hostinger.com                    │    │
│  │  2. Vá em Conta → Acesso API                       │    │
│  │  3. Clique "Gerar token" e copie o valor           │    │
│  │  4. Cole abaixo. Vamos criptografar antes de       │    │
│  │     armazenar (Supabase Vault).                    │    │
│  │  [ Abrir hPanel em nova aba ↗ ]                    │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  Apelido da conta (opcional)                                 │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Minha conta principal                              │    │
│  └────────────────────────────────────────────────────┘    │
│  Útil se você tiver mais de uma conta Hostinger.            │
│                                                              │
│  Token API Hostinger *                                       │
│  ┌──────────────────────────────────────────────┬─────┐    │
│  │  ••••••••••••••••••••••••••••••              │ 👁  │    │
│  └──────────────────────────────────────────────┴─────┘    │
│  Seu token é criptografado antes de salvar.                  │
│                                                              │
│                                                              │
│  [ Validar e conectar ]    [ Cancelar ]                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Microcopy:**
- Back link: **"← Voltar"** (text-link)
- Header: **"Conectar Hostinger"**
- Subhead: **"Cole seu token API pra listar seus sites."**
- Accordion title: **"Como obter seu token Hostinger?"** (collapsed por default; aberto na primeira visita)
- Passo 1: **"Acesse hpanel.hostinger.com"** (link com `target=_blank rel=noopener`)
- Passo 2: **"Vá em Conta → Acesso API"**
- Passo 3: **"Clique 'Gerar token' e copie o valor"**
- Passo 4: **"Cole abaixo. Vamos criptografar antes de armazenar (Supabase Vault)."**
- CTA accordion: **"Abrir hPanel em nova aba ↗"**
- Field label: **"Apelido da conta (opcional)"**
- Field hint: **"Útil se você tiver mais de uma conta Hostinger."**
- Field label: **"Token API Hostinger *"** (asterisco vermelho = obrigatório)
- Field placeholder: vazio (não placeholder com exemplo de token — leak risk)
- Field hint: **"Seu token é criptografado antes de salvar."**
- Toggle visibility: ícone Eye (Phosphor) — `aria-label="Mostrar/ocultar token"`
- CTA primário: **"Validar e conectar"**
- CTA secundário: **"Cancelar"** (ghost variant)

**Validação client-side (antes do submit):**
- Token vazio → vermelho inline `"Campo obrigatório"`
- Token <20 chars → `"Token muito curto — verifique se copiou o valor completo"`
- Apelido >50 chars → `"Apelido deve ter no máximo 50 caracteres"`

**Validação server-side (após submit):**
- Loading: botão vira `"Validando…"` com spinner inline + disabled. Form inputs disabled.
- Sucesso: toast verde `"Conta Hostinger conectada com sucesso"` + redirect pra `/sites`
- 401 Hostinger: vermelho inline no token field `"Token inválido. Verifique o valor copiado e tente de novo."`
- 429 rate limit: banner amarelo topo `"Limite da Hostinger atingido. Tente em alguns minutos."`
- 500 unknown: toast vermelho `"Algo falhou. Tente de novo. Se persistir, contate suporte."` + log id na toast

**A11y:**
- Token input: `type="password"` por default + toggle eye-icon (`aria-pressed`)
- Foco automático no field token quando entra na tela
- Form com `aria-describedby` apontando pra hint text
- Errors anunciados via `aria-live="polite"` numa região fora do field
- Esc na rota dá `confirm("Descartar token não salvo?")` se field tem conteúdo

---

### Tela 3 — `/sites` Lista de sites Hostinger encontrados

**Objetivo:** Mostrar inventário Hostinger + status de instalação por site + atribuição brand.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Sites Conectados                                                    │
│  4 sites encontrados na conta "Minha conta principal"  [⟳ Atualizar]│
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Filtros:  [ Todos ▾ ]  [ Status: todos ▾ ]   [+ Conectar conta]   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ ● colegiomentoria.com.br                                      │  │
│  │   WordPress 6.5 · PHP 8.2 · 23ms                              │  │
│  │                                                                │  │
│  │   Brand:  [ Mentoria      ▾ ]   Status:  ● Instalado          │  │
│  │   Container: GTM-5J587HS3                                      │  │
│  │                                                                │  │
│  │   Última instalação: hoje, 14:32 · Validado ✓                 │  │
│  │                                                                │  │
│  │   [ Ver detalhes ]   [ Revalidar ]   [ Reinstalar ]            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ ● zerohum.colegiomentoria.com.br                              │  │
│  │   WordPress 6.4 · PHP 8.1 · 41ms                              │  │
│  │                                                                │  │
│  │   Brand:  [ Selecionar… ▾ ]   Status:  ○ Não instalado        │  │
│  │                                                                │  │
│  │   [ Instalar tracking ]                                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ ⚠ ifrn-preparatorio.com.br                                    │  │
│  │   WordPress 5.9 · PHP 7.4 · 156ms                             │  │
│  │                                                                │  │
│  │   Brand:  [ IFRN          ▾ ]   Status:  ⚠ Drift detectado    │  │
│  │   Container: GTM-5J587HS3 (esperado: GTM-5J587HS3 ✓)           │  │
│  │   dataLayer: ausente no DOM                                    │  │
│  │                                                                │  │
│  │   [ Ver detalhes ]   [ Revalidar ]   [ Reinstalar ]            │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ ⊘ landing-experimento-2024.com.br                             │  │
│  │   WordPress não detectado (HTML estático?)                     │  │
│  │                                                                │  │
│  │   Status:  ⊘ Não suportado                                     │  │
│  │   Esse provedor exige WordPress. Mais providers em breve.      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Microcopy:**
- Header: **"Sites Conectados"**
- Subhead dinâmico: **"4 sites encontrados na conta 'Minha conta principal'"**
- Botão refresh: **"⟳ Atualizar"** (sync com Hostinger API)
- Filtros: **"Todos"** / **"Status: todos / instalado / não instalado / drift / não suportado"**
- CTA secundário: **"+ Conectar conta"** (adicionar 2ª conta Hostinger no futuro)

**Card de site — anatomia:**
- **Header card:** indicador status (• verde / ⚠ amarelo / ○ cinza / ⊘ off) + domain (link `https://`)
- **Metadata row:** WP version · PHP version · TTFB (cinza, mono)
- **Brand selector:** dropdown opções `Mentoria / Mentoria APP / Zerohum / IFRN / (sem brand)`
- **Status pill:** DotPill com tom de cor por estado
- **Container info:** mono font, em cinza
- **Última instalação:** texto relativo ("hoje, 14:32" / "há 3 dias")
- **Actions:** botões secundários inline

**Estados possíveis do card:**

| Status | Visual | Actions disponíveis | Microcopy status |
|---|---|---|---|
| `not_installed` | ○ cinza, sem container info | `[Instalar tracking]` (primário) | **"Não instalado"** |
| `installing` | ◐ animado azul | `[Cancelar]` (ghost) | **"Instalando…"** |
| `installed` | ● verde, container info visível | `[Ver detalhes] [Revalidar] [Reinstalar]` | **"Instalado"** |
| `drift_detected` | ⚠ amarelo, container info + warning | `[Ver detalhes] [Revalidar] [Reinstalar]` | **"Drift detectado"** |
| `install_failed` | ✕ vermelho | `[Ver detalhes] [Tentar novamente]` | **"Falha na instalação"** |
| `not_supported` | ⊘ cinza escuro, sem actions | (nenhuma) | **"Não suportado"** |

**Validação cliente antes de `[Instalar tracking]`:**
- Se brand_slug não selecionado → button disabled + tooltip `"Escolha uma brand antes de instalar"`
- Se brand_slug = mesma de outro site já instalado → confirm `"Já existe site com brand 'Mentoria' instalado. Deseja prosseguir mesmo assim?"`

**A11y:**
- Cards são `<article>` com `aria-labelledby` apontando ao domain
- Status DotPill: `aria-label="Status: instalado"` (não só cor!)
- Brand selector: `<select>` nativo com `<label>` visualmente oculto mas presente
- Foco visível em todos botões inline (outline verde 2px)

**States da página:**
- **Loading inicial:** skeleton 4 cards (cinza animado)
- **Empty (nenhum site na conta Hostinger):** EmptyState `"Sua conta Hostinger não tem sites ainda."` + CTA `"Adicionar site no hPanel ↗"`
- **Error sync:** Banner topo amarelo `"Não consegui atualizar a lista. Mostrando última versão de 5min atrás. [Tentar de novo]"`
- **Offline:** Banner topo cinza `"Sem conexão. Mostrando dados em cache."`

---

### Tela 4 — Modal de confirmação pré-instalação

**Objetivo:** Mostrar **exatamente o que vai acontecer** antes de Diego clicar OK. Reduz ansiedade ("vai quebrar meu site?").

```
┌─────────────────────────────────────────────────────────────┐
│  Confirmar instalação                            ✕          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Vamos instalar tracking no site:                            │
│  ┌────────────────────────────────────────────────────┐    │
│  │  🌐 zerohum.colegiomentoria.com.br                  │    │
│  │  Brand: Zerohum                                      │    │
│  │  GTM Container: GTM-WVWQVMP                          │    │
│  └────────────────────────────────────────────────────┘    │
│                                                              │
│  O que vai acontecer:                                        │
│                                                              │
│  ✓  Upload do plugin GTM4WP pré-configurado                  │
│  ✓  Ativação do plugin no WordPress                          │
│  ✓  Configuração automática do container ID                  │
│  ✓  Validação automática (HTTP check + dataLayer)            │
│                                                              │
│  ⚠ Esta ação vai modificar o site em produção.               │
│  Você pode reverter depois clicando em "Desinstalar".        │
│                                                              │
│                                                              │
│  [ Cancelar ]              [ Sim, instalar tracking ]        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Microcopy:**
- Modal title: **"Confirmar instalação"**
- Body intro: **"Vamos instalar tracking no site:"**
- Info card: domain (mono) + brand + container ID
- Sub-header: **"O que vai acontecer:"**
- Checklist:
  - **"Upload do plugin GTM4WP pré-configurado"**
  - **"Ativação do plugin no WordPress"**
  - **"Configuração automática do container ID"**
  - **"Validação automática (HTTP check + dataLayer)"**
- Warning destacado (amarelo bg + ⚠ icon): **"Esta ação vai modificar o site em produção. Você pode reverter depois clicando em 'Desinstalar'."**
- CTA primário: **"Sim, instalar tracking"** (verde Mentoria)
- CTA secundário: **"Cancelar"** (ghost)

**Componente reaproveitado:** `<ConfirmDialog />` do design-system-extract — com slot pra conteúdo custom (checklist + warning).

**A11y:**
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
- Focus trap dentro do modal (useFocusTrap hook)
- Foco inicial em **"Cancelar"** (safe default, não em destructive action)
- Esc fecha modal
- Tab ciclia: Cancelar → Sim, instalar → fechar X → Cancelar

---

### Tela 5 — Modal de progress instalação (full-screen, não fechável)

**Objetivo:** Mostrar 4 passos do install em tempo real. Diego vê o sistema **trabalhando**, não fica olhando spinner mudo.

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│              Instalando tracking…                            │
│                                                              │
│              zerohum.colegiomentoria.com.br                  │
│                                                              │
│                                                              │
│   ✓  Conectando com Hostinger          (3.2s)               │
│                                                              │
│   ⟳  Instalando plugin GTM4WP…         (em andamento)       │
│                                                              │
│   ◯  Validando dataLayer                                     │
│                                                              │
│   ◯  Registrando audit log                                   │
│                                                              │
│                                                              │
│              ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                  │
│              ━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░  50%             │
│                                                              │
│   Não feche esta janela. Estimado ~30s no total.            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Microcopy:**
- Title: **"Instalando tracking…"** (h2, com reticências)
- Subtitle: domain (mono, text-muted)
- 4 passos com estado visual:
  - `✓` (verde, completo) + label + tempo gasto entre parênteses
  - `⟳` (azul animado spinner) + label + **"(em andamento)"**
  - `◯` (cinza, pending) + label
- Progress bar: barra horizontal 50% completion (cinza→verde gradiente)
- Footer hint: **"Não feche esta janela. Estimado ~30s no total."** (text-muted, italic)

**Passos do install (ordem fixa):**
1. **"Conectando com Hostinger"** — verificando token + listando sites + permissions
2. **"Instalando plugin GTM4WP…"** — deploy via Hostinger MCP
3. **"Validando dataLayer"** — HTTP GET site + regex check container ID
4. **"Registrando audit log"** — persist `core.gtm_installations` row

**A11y:**
- `role="dialog"` + `aria-modal="true"` + `aria-busy="true"` (enquanto roda)
- Esc **desabilitado** durante install (prev. accidental abort)
- `aria-live="polite"` no container dos passos — screen reader anuncia "Passo 2 concluído" etc
- Botão fechar X **escondido** (mas com `aria-label` se aparecer pós-fail)

**Edge cases:**
- **Timeout (>90s sem resposta):** modal vira state failure (Tela 7). Microcopy: **"Demorou demais. A instalação pode ter sido feita ou não — revalide o site."**
- **Network drop mid-install:** retry automático 3x backoff exponencial. Microcopy linha extra: **"Reconectando… (tentativa 2 de 3)"**
- **User fecha aba durante install:** server-side continua (transação atômica). Quando volta, Tela 3 mostra status real.

---

### Tela 6 — Success state (pós-install ok)

**Objetivo:** Celebrar vitória + dar caminhos naturais de próxima ação.

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│              ┌──────────────┐                                │
│              │   ✓ (anim)   │                                │
│              └──────────────┘                                │
│                                                              │
│           Tracking instalado com sucesso!                    │
│                                                              │
│      zerohum.colegiomentoria.com.br agora coleta             │
│      eventos via GTM Container GTM-WVWQVMP.                  │
│                                                              │
│                                                              │
│   ✓ Plugin GTM4WP ativo                                      │
│   ✓ dataLayer detectado no DOM                               │
│   ✓ Container ID configurado corretamente                    │
│   ✓ Audit log registrado                                     │
│                                                              │
│   Tempo total: 28 segundos                                   │
│                                                              │
│                                                              │
│   [ Abrir site ↗ ]   [ Ver audit log ]                       │
│                                                              │
│   [ Instalar em outro site ]      [ Voltar à lista ]         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Microcopy:**
- Icon: checkmark animado grande (Phosphor `CheckCircle` + scale animation 0→1)
- Title: **"Tracking instalado com sucesso!"**
- Body: **"zerohum.colegiomentoria.com.br agora coleta eventos via GTM Container GTM-WVWQVMP."**
- Resultado checklist (todos verdes):
  - **"Plugin GTM4WP ativo"**
  - **"dataLayer detectado no DOM"**
  - **"Container ID configurado corretamente"**
  - **"Audit log registrado"**
- Métrica: **"Tempo total: 28 segundos"** (text-muted, mono)
- CTA primário: **"Abrir site ↗"** (abre em nova aba)
- CTA secundário: **"Ver audit log"** (rota detalhe)
- CTA terciário: **"Instalar em outro site"** (volta à lista, mantém momentum)
- CTA quartenário: **"Voltar à lista"** (ghost)

**Microinteração celebratória (sutil, sem confetti):**
- Checkmark scale 0→1.2→1.0 em 400ms (ease-out-back)
- Cada linha do checklist anima fade-in stagger 80ms
- Sem confetti (Diego é técnico, pouco apreciado em tooling)
- Toast paralelo no canto: **"Tracking ativo em zerohum.colegiomentoria.com.br"** (verde, 5s)

**A11y:**
- Foco automático no botão **"Abrir site ↗"** (next likely action)
- `aria-live="polite"` no title pra screen reader anunciar success
- Reduced motion (`prefers-reduced-motion`): desativa scale + stagger; mostra estático

---

### Tela 7 — Failure state (install falhou)

**Objetivo:** Explicar **o que deu errado** + dar **ação clara** de recovery. Nunca deixar Diego "no escuro".

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│              ┌──────────────┐                                │
│              │   ✕ (red)    │                                │
│              └──────────────┘                                │
│                                                              │
│       Não consegui instalar o tracking                       │
│                                                              │
│   zerohum.colegiomentoria.com.br                             │
│                                                              │
│                                                              │
│   ✓ Conectando com Hostinger                                 │
│   ✕ Instalando plugin GTM4WP                                 │
│   ◯ Validando dataLayer                                      │
│   ◯ Registrando audit log                                    │
│                                                              │
│                                                              │
│   ┌────────────────────────────────────────────────────┐    │
│   │ Detalhe técnico:                                    │    │
│   │                                                     │    │
│   │ Hostinger API retornou 403 Forbidden ao instalar    │    │
│   │ o plugin. Provável causa: token sem permissão       │    │
│   │ "wordpress.plugins.write".                          │    │
│   │                                                     │    │
│   │ ID do erro: err_2026-05-25_001                      │    │
│   └────────────────────────────────────────────────────┘    │
│                                                              │
│   O que tentar:                                              │
│                                                              │
│   1. Verifique se seu token tem permissão de escrita        │
│      em plugins WordPress no hPanel.                         │
│   2. Gere um novo token se necessário e reconecte a conta.  │
│   3. Tente instalar de novo após reconectar.                 │
│                                                              │
│                                                              │
│   [ Tentar novamente ]   [ Reconectar Hostinger ]            │
│                                                              │
│   [ Copiar ID do erro ]   [ Voltar à lista ]                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Microcopy:**
- Icon: X grande vermelho (Phosphor `XCircle`)
- Title: **"Não consegui instalar o tracking"** (não "Erro!" — humano)
- Subtitle: domain (mono)
- Checklist com passo falho destacado (✕ vermelho)
- Box "Detalhe técnico" (bg cinza + mono):
  - Mensagem amigável + ID do erro
  - **"ID do erro: err_2026-05-25_001"** (Diego pode citar em suporte)
- Sub-header: **"O que tentar:"**
- Lista numerada de passos concretos (não "tente novamente" genérico)
- CTA primário: **"Tentar novamente"** (verde, se erro é retryable)
- CTA secundário: **"Reconectar Hostinger"** (se erro é de auth/token)
- CTA terciário: **"Copiar ID do erro"** (clipboard + toast `"Copiado"`)
- CTA quartenário: **"Voltar à lista"** (ghost)

**Erros conhecidos e mensagens específicas:**

| Erro técnico | "Detalhe técnico" exibido | "O que tentar" |
|---|---|---|
| Hostinger 401 | `"Token expirado ou inválido."` | "Gere novo token no hPanel e reconecte" |
| Hostinger 403 | `"Token sem permissão wordpress.plugins.write"` | "Habilite permissão no hPanel" |
| Hostinger 429 | `"Limite de requisições atingido"` | "Aguarde alguns minutos e tente de novo" |
| Hostinger 5xx | `"Erro temporário no Hostinger"` | "Tente em alguns minutos. Se persistir, verifique status.hostinger.com" |
| Plugin install fail (WP rejeita) | `"WordPress rejeitou a ativação do plugin"` | "Verifique se PHP ≥ 7.4 e WP ≥ 5.6" |
| Validador falha (plugin instala mas dataLayer não aparece) | `"Plugin instalou mas dataLayer não foi detectado no DOM"` | "Verifique conflito com outros plugins de cache/optimization. Limpe cache do site." |
| Timeout | `"Hostinger não respondeu em 90s"` | "A instalação pode ter sido feita parcialmente. Verifique manualmente." |
| Network/offline | `"Sem conexão com o servidor"` | "Verifique sua conexão e tente de novo" |

**A11y:**
- Foco automático em **"Tentar novamente"** (most likely recovery)
- `role="alert"` no container pra screen reader anunciar imediato
- Detalhe técnico em `<pre>` com `aria-label="Detalhe técnico do erro"`
- ID do erro com `<code>` + button "Copiar" `aria-label="Copiar ID do erro"`

---

## 4. Microcopy PT-BR consolidado

### 4.1 CTAs (padrão: verbo + objeto direto)

| Contexto | CTA |
|---|---|
| Empty state primeiro acesso | **"Conectar via Hostinger"** |
| Form validar token | **"Validar e conectar"** |
| Form cancelar input | **"Cancelar"** |
| Card site sem install | **"Instalar tracking"** |
| Card site instalado — info | **"Ver detalhes"** |
| Card site instalado — refresh check | **"Revalidar"** |
| Card site instalado — reinstall | **"Reinstalar"** |
| Card site falha | **"Tentar novamente"** |
| Modal confirm install | **"Sim, instalar tracking"** |
| Modal cancel install | **"Cancelar"** |
| Success — abrir site | **"Abrir site ↗"** |
| Success — log | **"Ver audit log"** |
| Success — próximo install | **"Instalar em outro site"** |
| Success — voltar | **"Voltar à lista"** |
| Failure — retry | **"Tentar novamente"** |
| Failure — auth | **"Reconectar Hostinger"** |
| Failure — copy id | **"Copiar ID do erro"** |
| Card uninstall (Should #3) | **"Desinstalar tracking"** (destructive variant) |

### 4.2 Status labels (DotPill)

| Status code | Label visível | Tom |
|---|---|---|
| `not_installed` | **"Não instalado"** | neutral (cinza) |
| `installing` | **"Instalando…"** | info (azul) |
| `installed` | **"Instalado"** | success (verde) |
| `drift_detected` | **"Drift detectado"** | warning (amarelo) |
| `install_failed` | **"Falha na instalação"** | danger (vermelho) |
| `uninstalled` | **"Desinstalado"** | neutral (cinza) |
| `not_supported` | **"Não suportado"** | neutral escuro |
| `token_expired` | **"Token expirado"** | warning |

### 4.3 Empty states

| Tela | Título | Body | CTA |
|---|---|---|---|
| `/sites` primeiro acesso | "Nenhum site conectado ainda" | "Conecte sua conta Hostinger pra listar seus sites WordPress e instalar tracking automaticamente." | "Conectar via Hostinger" |
| `/sites` conta sem sites | "Sua conta Hostinger não tem sites ainda" | "Adicione um site no hPanel pra ver ele aqui." | "Abrir hPanel ↗" |
| Audit log vazio | "Nenhum log ainda" | "O log aparece após a primeira instalação ou revalidação." | — |

### 4.4 Loading states

| Contexto | Microcopy |
|---|---|
| Lista sites primeiro paint | (skeleton — sem texto) |
| Refresh lista | "Atualizando lista…" |
| Validar token | "Validando…" |
| Install passo 1 | "Conectando com Hostinger…" |
| Install passo 2 | "Instalando plugin GTM4WP…" |
| Install passo 3 | "Validando dataLayer…" |
| Install passo 4 | "Registrando audit log…" |
| Revalidar site | "Revalidando…" |
| Desinstalar | "Desinstalando…" |

### 4.5 Sucesso (toasts 4-5s verdes)

| Ação | Toast |
|---|---|
| Conta conectada | "Conta Hostinger conectada com sucesso" |
| Install ok | "Tracking ativo em [domain]" |
| Revalidação ok | "Site validado — tudo certo" |
| Reinstall ok | "Tracking reinstalado com sucesso" |
| Desinstall ok | "Tracking removido de [domain]" |
| Copiar ID erro | "ID do erro copiado" |
| Copiar container | "Container ID copiado" |

### 4.6 Errors (mensagens humanas + ação)

| Situação | Mensagem |
|---|---|
| Token vazio | "Campo obrigatório" |
| Token curto | "Token muito curto — verifique se copiou o valor completo" |
| Token inválido (401) | "Token inválido. Verifique o valor copiado e tente de novo." |
| Token sem permissão (403) | "Token sem permissão necessária. Habilite escrita de plugins no hPanel." |
| Rate limit (429) | "Limite da Hostinger atingido. Tente em alguns minutos." |
| Hostinger 5xx | "Hostinger fora do ar. Tente em alguns minutos." |
| Plugin rejeita ativação | "WordPress rejeitou a ativação do plugin. Verifique PHP ≥ 7.4 e WP ≥ 5.6." |
| dataLayer ausente pós-install | "Plugin instalado mas dataLayer não detectado. Pode ser conflito com plugin de cache." |
| Timeout 90s | "Demorou demais. A instalação pode ter sido feita ou não — revalide o site." |
| Offline | "Sem conexão. Verifique sua internet e tente de novo." |
| Erro desconhecido | "Algo falhou. Tente de novo. Se persistir, contate suporte." |
| Brand obrigatório | "Escolha uma brand antes de instalar" (tooltip) |

### 4.7 Confirmações destrutivas

| Ação | Modal title | Body | CTA destrutivo |
|---|---|---|---|
| Reinstalar (override) | "Reinstalar tracking?" | "Isso vai sobrescrever a instalação atual. Pode ser útil se houver drift." | "Sim, reinstalar" |
| Desinstalar | "Desinstalar tracking?" | "Esta ação vai remover o plugin GTM4WP do site. **Eventos param de ser coletados.** Você pode reinstalar depois." | "Sim, desinstalar" |
| Descartar token não salvo | "Descartar token?" | "Você ainda não salvou esse token. Quer mesmo sair sem conectar?" | "Sim, descartar" |
| Deletar conta Hostinger | "Remover conta Hostinger?" | "Você ainda tem N sites instalados via essa conta. Eles vão continuar funcionando mas você não poderá gerenciá-los daqui." | "Sim, remover conta" |

---

## 5. Acessibilidade WCAG AA

### 5.1 Contraste (mínimo AA)

| Elemento | Foreground | Background | Ratio (esperado) |
|---|---|---|---|
| Body text light | `--text-strong` (#0F1620) | `--bg-canvas` (#FAFBFC) | 16.4:1 ✓ |
| Body text dark | `--text-strong` (#F0F4F8) | `--bg-canvas` (#0A0E14) | 15.8:1 ✓ |
| Button primary (verde Mentoria) | #FFFFFF | #16DF6F | 4.6:1 ✓ |
| Status DotPill text | `--text-strong` | DotPill bg (tom 8% opacity) | ~10:1 ✓ |
| Link text | `--brand-green` | `--bg-canvas` | 4.8:1 ✓ |
| Error inline | `--danger` (#E11D48) | `--bg-canvas` | 4.9:1 ✓ |

**Validação obrigatória pra Dex:**
- Rodar `axe-core` ou Lighthouse a11y audit em cada tela
- Score ≥ 95 antes de Quinn gate
- Sem warnings de contrast

### 5.2 Keyboard navigation

| Tela | Tab order |
|---|---|
| `/sites` empty | CTA "Conectar via Hostinger" → menu lateral |
| `/sites/connect` | Back → accordion → apelido → token → eye toggle → "Validar e conectar" → "Cancelar" |
| `/sites` lista | Refresh → filtros → cards (cada card: brand select → action button) |
| Modal confirm | "Cancelar" (focus default) → "Sim, instalar" → X close |
| Modal progress | (esc desabilitado, sem tab) |
| Success state | "Abrir site" (focus default) → "Ver audit log" → "Instalar outro" → "Voltar" |
| Failure state | "Tentar novamente" (focus default) → "Reconectar" → "Copiar ID" → "Voltar" |

**Regras gerais:**
- Esc fecha modais (exceto progress in-flight)
- Enter submete forms quando foco em input final
- Setas em dropdowns brand (combobox pattern)
- Focus ring verde 2px em todos elementos focáveis
- Skip link "Pular para o conteúdo" no topo (reaproveitar AppShell)

### 5.3 Screen reader (ARIA)

| Elemento | ARIA |
|---|---|
| Status DotPill | `aria-label="Status: [label]"` (não só cor!) |
| Spinner loading | `role="status"` + `aria-label="Carregando…"` |
| Modal | `role="dialog" aria-modal="true" aria-labelledby aria-describedby` |
| Form errors | `aria-live="polite"` + `aria-invalid="true"` no field |
| Progress steps | `aria-live="polite"` + cada step com `aria-current="step"` se em andamento |
| Token input | `aria-describedby` apontando ao hint |
| Eye toggle | `aria-pressed` + `aria-label="Mostrar/ocultar token"` |
| Card site | `<article role="article" aria-labelledby="card-{id}-domain">` |

### 5.4 Touch targets (mobile)

| Elemento | Tamanho mínimo |
|---|---|
| Botões primários | 48px altura ≥ |
| Botões secundários inline | 44px altura ≥ |
| Eye toggle no input | 44×44px hit area |
| Brand select dropdown | 44px altura ≥ |
| Icon-only buttons | 44×44px |
| Card click area (se card todo é clickable) | bg-hover suficiente |

### 5.5 Reduced motion

- `prefers-reduced-motion: reduce` desativa:
  - Scale animation no success checkmark
  - Stagger fade-in checklist
  - Spinner rotation → vira static "⟳" com texto "Carregando…"
  - Progress bar smooth → discrete jumps
  - Spotlight cursor (já desativa per ERP)

---

## 6. Loading + Error + Offline states (resumo por tela)

| Tela | Loading | Empty | Error | Offline |
|---|---|---|---|---|
| `/sites` lista | Skeleton 4 cards | EmptyState conta sem sites | Banner topo amarelo + retry | Banner topo cinza + cache |
| `/sites/connect` | (formulário direto) | N/A | Inline field error + toast 500 | Banner "Sem conexão" antes do submit |
| `/sites/connect` (validating) | Button "Validando…" + spinner inline | N/A | Inline field error (401/403/429) | Toast "Offline. Tente quando voltar." |
| Modal progress | (spinner integrado no step) | N/A | Vira state failure (Tela 7) | Linha "Reconectando… (2/3)" |
| Audit log detail | Skeleton table rows | "Nenhum log ainda" | Banner retry | Cache + banner |

**Pattern global Offline:**
- Banner topo persistente `"Sem conexão. Algumas ações estão desabilitadas."`
- Botões que precisam network ficam disabled com tooltip `"Indisponível offline"`
- Read-only views continuam funcionando do cache (lista sites, audit log)

---

## 7. Microinteractions (animações sutis)

| Interação | Animação | Duração | Easing |
|---|---|---|---|
| Hover card site | bg lighten 4% + border green 30% | 200ms | ease-out |
| Click button | scale 0.97 → 1.0 | 120ms | ease-out |
| Spinner inline (validating) | rotate 360deg infinite | 800ms | linear |
| Eye toggle token | crossfade icon | 200ms | ease |
| Toast slide-in | translateX(20px → 0) + fade | 300ms | ease-out |
| Modal open | fade backdrop + scale(0.95→1.0) modal | 250ms | ease-out |
| Modal close | reverse | 180ms | ease-in |
| Progress step transition | spinner → check fade-swap | 300ms | ease |
| Progress bar fill | width smooth | 600ms | ease-out |
| Success checkmark | scale(0 → 1.2 → 1.0) | 400ms | ease-out-back |
| Success checklist stagger | fade-in 80ms delay each | 80ms cada | ease-out |
| DotPill status change | bg color transition | 300ms | ease |

**Regras gerais:**
- **Sem confetti** (Diego é técnico — celebração sutil basta)
- **Sem parallax** (distrai em tooling sério)
- **Spotlight cursor** já existe no AppShell ERP — manter (não exclusivo desta feature)
- Todas animações respeitam `prefers-reduced-motion`

---

## 8. Mobile responsiveness

### 8.1 Breakpoints (herdar do ERP)

- `sm`: 640px (smartphone landscape)
- `md`: 768px (tablet)
- `lg`: 1024px (desktop pequeno)
- `xl`: 1280px (desktop full)

### 8.2 Adaptações por tela

| Tela | Desktop (≥1024px) | Mobile (<640px) |
|---|---|---|
| `/sites` lista | Cards full-width col único / grid 2cols se ≥1440 | Cards stack vertical, sem grid |
| Card site | Layout horizontal (info esq + actions dir) | Stack vertical: header → metadata → brand select → actions inline |
| Card site actions | Inline buttons (3-4 visíveis) | 1 primário visível + overflow `⋯ Mais ações` |
| `/sites/connect` form | Centered max-w-md | Full-width padding 16px |
| Modal confirm | max-w-lg centered | Full-screen bottom sheet (slide-up) |
| Modal progress | max-w-md centered | Full-screen bottom sheet |
| Success/Failure state | Centered max-w-lg | Full-screen scroll |
| Audit log table | Table 5 cols visíveis | Cards stack (1 entry = 1 card) |

### 8.3 Touch-specific

- Swipe down no bottom sheet fecha modal (exceto progress in-flight)
- Long-press no card site → menu contextual (`Reinstalar / Desinstalar / Copiar URL`)
- Pull-to-refresh na lista de sites (mobile only)

### 8.4 Mobile-specific microcopy

- Botões longos truncam: `"Instalar tracking"` no mobile mantém (cabe). `"Sim, instalar tracking"` no modal vira `"Sim, instalar"`.
- Hint accordion `"Como obter seu token Hostinger?"` colapsa por default no mobile (poupa scroll).

---

## 9. Wireframes ASCII (resumo visual)

### 9.1 Tela 1 — Empty state desktop

```
┌─────────────────────────────────────────────────────────────┐
│ [Sidebar]  │  Sites Conectados                              │
│   Logo     │  Instale tracking GTM nos seus sites           │
│            ├────────────────────────────────────────────────┤
│   Dashboard│                                                 │
│ ► Sites    │              ┌──────────┐                       │
│   Config   │              │   🌐     │                       │
│   Webhooks │              └──────────┘                       │
│   Analytics│                                                 │
│            │      Nenhum site conectado ainda               │
│   ────     │                                                 │
│  [Avatar]  │  Conecte sua conta Hostinger pra listar        │
│            │  seus sites WordPress e instalar tracking      │
│            │  automaticamente.                              │
│            │                                                 │
│            │      [ Conectar via Hostinger ]                │
│            │                                                 │
│            │  Outros providers em breve (cPanel, WPEngine)  │
└────────────┴────────────────────────────────────────────────┘
```

### 9.2 Tela 1 — Empty state mobile (375px)

```
┌─────────────────┐
│ ☰  Sites        │ ← topbar com hamburger
├─────────────────┤
│                 │
│      ┌────┐     │
│      │ 🌐 │     │
│      └────┘     │
│                 │
│  Nenhum site    │
│  conectado      │
│  ainda          │
│                 │
│  Conecte sua    │
│  conta Hostinger│
│  pra listar     │
│  seus sites…    │
│                 │
│ ┌─────────────┐ │
│ │ Conectar    │ │ ← CTA full-width
│ │ Hostinger   │ │
│ └─────────────┘ │
│                 │
│ Outros provid…  │
└─────────────────┘
```

### 9.3 Tela 3 — Card site instalado (desktop)

```
┌────────────────────────────────────────────────────────────┐
│ ●  colegiomentoria.com.br                                   │
│    WordPress 6.5 · PHP 8.2 · 23ms                           │
│                                                              │
│    Brand: [Mentoria ▾]   Status: ● Instalado                │
│    Container: GTM-5J587HS3                                   │
│    Última: hoje, 14:32 · Validado ✓                          │
│                                                              │
│    [Ver detalhes]  [Revalidar]  [Reinstalar]                │
└────────────────────────────────────────────────────────────┘
```

### 9.4 Tela 3 — Card site mobile

```
┌─────────────────┐
│ ● mentoria.com  │ ← truncate se necessário
│   WP 6.5 · PHP… │
│                 │
│ Brand:          │
│ [Mentoria   ▾]  │
│                 │
│ Status:         │
│ ● Instalado     │
│                 │
│ Container:      │
│ GTM-5J587HS3    │
│                 │
│ ┌─────────────┐ │
│ │ Ver detalhes│ │
│ └─────────────┘ │
│ [⋯ Mais ações]  │ ← overflow menu
└─────────────────┘
```

### 9.5 Tela 5 — Progress modal

```
┌────────────────────────────────────┐
│                                     │
│      Instalando tracking…           │
│      zerohum.colegiomentoria.…      │
│                                     │
│                                     │
│  ✓ Conectando Hostinger    (3.2s)   │
│  ⟳ Instalando plugin…    (em curso) │
│  ◯ Validando dataLayer              │
│  ◯ Registrando audit log            │
│                                     │
│  ━━━━━━━━━━░░░░░░░░░░  50%          │
│                                     │
│  Não feche. Estimado ~30s.          │
│                                     │
└────────────────────────────────────┘
```

### 9.6 Tela 6 — Success

```
┌────────────────────────────────────┐
│            ┌─────┐                  │
│            │  ✓  │                  │
│            └─────┘                  │
│                                     │
│   Tracking instalado com sucesso!   │
│                                     │
│  zerohum.colegiomentoria.com.br     │
│  agora coleta eventos via           │
│  GTM Container GTM-WVWQVMP.         │
│                                     │
│  ✓ Plugin GTM4WP ativo              │
│  ✓ dataLayer detectado              │
│  ✓ Container configurado            │
│  ✓ Audit log registrado             │
│                                     │
│  Tempo total: 28 segundos           │
│                                     │
│  [Abrir site ↗] [Ver audit log]     │
│  [Instalar outro] [Voltar à lista]  │
└────────────────────────────────────┘
```

### 9.7 Tela 7 — Failure

```
┌────────────────────────────────────┐
│            ┌─────┐                  │
│            │  ✕  │  (vermelho)      │
│            └─────┘                  │
│                                     │
│  Não consegui instalar o tracking   │
│  zerohum.colegiomentoria.com.br     │
│                                     │
│  ✓ Conectando Hostinger             │
│  ✕ Instalando plugin (falhou)       │
│  ◯ Validando dataLayer              │
│  ◯ Registrando audit log            │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ Detalhe técnico:                 ││
│ │ Hostinger API retornou 403       ││
│ │ Forbidden. Provável: token sem   ││
│ │ permissão wordpress.plugins.write││
│ │ ID: err_2026-05-25_001           ││
│ └─────────────────────────────────┘│
│                                     │
│  O que tentar:                      │
│  1. Verifique permissão do token    │
│  2. Gere novo token se necessário   │
│  3. Tente instalar de novo          │
│                                     │
│  [Tentar novamente]                 │
│  [Reconectar Hostinger]             │
│  [Copiar ID]  [Voltar]              │
└────────────────────────────────────┘
```

---

## 10. Handoff pra Dex — Inventário de componentes

### 10.1 Componentes a REUSAR (existem no design-system-extract)

| Componente | Path | Uso nesta feature |
|---|---|---|
| `Button` | `src/components/ui/Button.tsx` | Todos os CTAs (variantes: primary, secondary, ghost, danger) |
| `EmptyState` | `src/components/ui/EmptyState.tsx` | Tela 1 + variants de erro |
| `StatusBadge` / `DotPill` | `src/components/ui/StatusBadge.tsx` | Status dos sites (instalado/drift/falha/etc) |
| `Toast` + `useToast` | `src/components/ui/Toast.tsx` | Feedback de ações (token salvo / install ok / etc) |
| `ConfirmDialog` + `useConfirm` | `src/components/ui/ConfirmDialog.tsx` | Modal confirm install (Tela 4) + destructive uninstall |
| `useFocusTrap` | `src/lib/useFocusTrap.ts` | Modals progress + success/failure |
| `KpiCard` | `src/components/ui/KpiCard.tsx` | (opcional) header `/sites` com "N sites conectados / N instalados / N com drift" |

### 10.2 Componentes a CRIAR (novos)

| Componente | Props (sugestão) | Notas |
|---|---|---|
| `<SiteCard />` | `{ site, onInstall, onRevalidate, onReinstall, onViewDetails }` | Card de 1 site com estado/actions. Responsive. |
| `<BrandSelect />` | `{ value, onChange, options }` | Dropdown estilizado com 4 brands hardcoded MVP. |
| `<InstallProgressModal />` | `{ isOpen, steps, currentStep, onComplete, onError }` | Modal não-fechável com 4 passos animados. |
| `<InstallSuccessState />` | `{ domain, container, brand, duration, onAction }` | Tela 6 — pode ser modal ou rota. |
| `<InstallFailureState />` | `{ domain, errorCode, errorMessage, suggestions, onRetry, onReconnect }` | Tela 7. |
| `<TokenInput />` | `{ value, onChange, onValidate, error }` | Input password com eye toggle + hint criptografia. |
| `<HostingerHelpAccordion />` | `{ defaultOpen }` | Accordion com 4 passos pra gerar token. |
| `<AuditLogEntry />` | `{ entry }` | 1 row de audit log (rota detalhe). |

### 10.3 Hooks a CRIAR

| Hook | Retorno |
|---|---|
| `useSites()` | `{ sites, isLoading, error, refresh }` — fetch `/api/sites` + merge com `core.gtm_installations` |
| `useHostingerAccount()` | `{ account, isConnected, connect, disconnect }` — manage 1 conta Hostinger |
| `useInstallTracking(siteId)` | `{ install, progress, status, result }` — orchestra deploy + validação |
| `useAuditLog(siteId?)` | `{ entries, isLoading }` — fetch audit log filtrado opcional |

### 10.4 Rotas Vite SPA

| Rota | Componente | Layout |
|---|---|---|
| `/sites` | `<SitesListPage />` | AppShell (sidebar + topbar) |
| `/sites/connect` | `<ConnectHostingerPage />` | AppShell |
| `/sites/:siteId` | `<SiteDetailPage />` | AppShell, tabs (Overview / Audit Log / Settings) |
| `/sites/:siteId/logs` | `<SiteAuditLogPage />` | AppShell |

### 10.5 Endpoints backend Hono (Dex referenciar)

| Endpoint | Método | Body/Query | Resposta |
|---|---|---|---|
| `/api/hostinger/accounts` | GET | — | `[{ id, label, status, created_at }]` |
| `/api/hostinger/accounts` | POST | `{ token, label }` | `{ id, status: 'connected' }` |
| `/api/hostinger/accounts/:id` | DELETE | — | `204` |
| `/api/sites` | GET | — | `[{ domain, wp_version, php_version, status, brand_slug, container_id, last_install_at }]` |
| `/api/sites/:id/install` | POST | `{ brand_slug }` | `{ job_id, sse_url }` (SSE pra progress) |
| `/api/sites/:id/revalidate` | POST | — | `{ validation_result }` |
| `/api/sites/:id/uninstall` | DELETE | — | `{ status: 'uninstalled' }` |
| `/api/sites/:id/audit-log` | GET | — | `[{ id, action, status, timestamp, payload }]` |

**Sugestão Dex:** install longo → SSE (Server-Sent Events) pra progress real-time, evita polling.

### 10.6 Critério de aceite UX (Quinn gate)

- ✓ Todos CTAs em PT-BR (zero inglês visível ao usuário)
- ✓ Empty state na primeira visita `/sites`
- ✓ Loading state em toda call API >150ms (skeleton ou spinner)
- ✓ Error state com mensagem específica + ação de recovery
- ✓ Modal progress não-fechável (Esc disabled)
- ✓ Success state com checkmark animado + 4 CTAs próximos passos
- ✓ Failure state com ID do erro copiável + sugestões concretas
- ✓ Contraste WCAG AA em todos elementos (Lighthouse ≥95)
- ✓ Keyboard nav: tab order linear + focus visible
- ✓ Screen reader: aria-live em loading/error, aria-modal em dialogs
- ✓ Touch targets ≥44px em mobile
- ✓ Reduced motion respeitado
- ✓ Confirmação destrutiva (uninstall, descartar token, deletar conta)

---

## 11. Decisões UX-chave (registradas pra futuro)

| # | Decisão | Justificativa |
|---|---|---|
| **UX-001** | "Sites Conectados" nível 1 do menu (não dentro de Configurações) | Operação recorrente com estado, merece visibilidade. |
| **UX-002** | `/sites/connect` é rota dedicada, não modal | Dado sensível (token), permite back/bookmark. |
| **UX-003** | Install progress é modal full-screen não-fechável | Foco + previne abort acidental. |
| **UX-004** | Modal confirm pré-install mostra **exatamente** o que vai acontecer | Reduz ansiedade Diego ("vai modificar prod?"). |
| **UX-005** | 4 passos visíveis no progress modal (não barra mudinha) | Sensação de sistema trabalhando + auditoria visual. |
| **UX-006** | Success tem 4 CTAs (abrir site / log / instalar outro / voltar) | Mantém momentum + dá caminhos óbvios. |
| **UX-007** | Failure mostra ID do erro copiável | Diego pode citar em suporte/debug futuro. |
| **UX-008** | Sem confetti em success | Tooling sério, celebração sutil é suficiente. |
| **UX-009** | Status DotPill sempre com `aria-label` textual além da cor | A11y — color-only é WCAG fail. |
| **UX-010** | Brand select obrigatório antes de install (button disabled) | Previne install com container errado (R4 do PRD). |
| **UX-011** | Token input default `type="password"` + eye toggle | Mitiga shoulder-surfing + screenshot leak. |
| **UX-012** | Reinstall e Desinstall com ConfirmDialog | Destructive actions sempre confirmadas. |
| **UX-013** | Audit log accessible em `/sites/:id/logs` (não só inline) | Diego pode bookmarkar pra debug específico. |
| **UX-014** | Drift detection mostra explicação ("dataLayer ausente no DOM") | Não basta dizer "drift" — explicar **o que** está drift. |
| **UX-015** | Card "não suportado" (não-WP) explica por quê | Evita "por que esse site não tem botão?" |

---

## 12. Próximos passos (handoff)

1. **Diego revisa este doc** — valida microcopy + decisões UX-001 a UX-015
2. **Nova quebra em stories** baseado em flow:
   - Story 1: Empty state + conectar Hostinger (Telas 1-2)
   - Story 2: Lista de sites + cards (Tela 3)
   - Story 3: Install flow (Telas 4-5)
   - Story 4: Success + Failure states (Telas 6-7)
   - Story 5: Audit log + detalhe site
   - Story 6: Mobile responsive + a11y pass
3. **River detalha** cada story com AC + test plan
4. **Dex implementa** seguindo §10 inventário + §10.5 endpoints
5. **Quinn gate** com §10.6 critérios + axe-core + Lighthouse a11y
6. **Felix deploy** Easypanel KV8 (frontend + backend novo)

**Bloqueio resolvido por Aria primeiro:**
- Q1 (plugin oficial vs fork) afeta passo 3 do progress modal (apenas mensagem; visual idêntico)
- Q3 (validador HEAD vs GET vs Playwright) afeta tempo total estimado mostrado no modal (~30s vs ~60s)

**Sem prazo. 1 dia ou 100 anos.** Manifesto 22/05.

---

**Fim do UX flow.**
