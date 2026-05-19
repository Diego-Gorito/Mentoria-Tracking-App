# Onboarding Wizard -- Spec UX (5 steps)

> Persona: Uma (UX Design Expert) -- Mentoria Tracking SaaS
> Data: 19/05/2026
> Status: APROVADO PARA IMPLEMENTACAO -- Dex implementa TSX
> Referencia de design: DESIGN.md v1.7 (Stitch + Vercel polish)
> Stack: Vite 5 + React 18 + Tailwind 3.4 + Phosphor Icons 2.1.7

---

## 1. Visao geral

### Persona
Gestor/Dono de escola: chegou pelo signup, sem tenant configurado.
Desktop 80%, tablet/mobile 20%. Quer painel funcionando rapido.

### Job-to-be-done
"Em menos de 30 minutos, minha escola configurada com primeiro evento chegando no painel."

### Fluxo
/signup -> /onboarding (step 1) -> step 2 -> step 3 -> step 4 -> step 5 -> /dashboard

Pode sair e voltar (progress persiste em tenants.onboarding_step).
Pode pular todas as plataformas no step 4.

### Save and Continue Later
- Persiste via PATCH /api/onboarding/progress body { step, data }
- tenants.onboarding_step no banco guarda ultimo step completo
- Ao reentrar: GET /api/onboarding/progress, toast info "Continuando de onde voce parou -- Etapa 2"

---

## 2. Layout global

### Estrutura de pagina

Header minimal (sem AppShell padrao):
- Esquerda: Logo 24px height
- Direita: link ghost "Sair do wizard" -> ConfirmDialog

Sticky em mobile: Progress bar + Steps nav

Card central:
- max-w-2xl mx-auto
- p-8 desktop / p-5 mobile
- var(--app-card-bg) border var(--app-card-border)

Footer:
- Esquerda: Button ghost "Voltar" (disabled step 1)
- Centro: link ghost "Salvar e terminar depois" (visivel a partir step 2)
- Direita: Button primary "Salvar e continuar"

### Progress bar

role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={5} aria-label="Progresso do setup"
Barra: h-1.5 rounded-full bg-white/[0.08] + fill bg-brand-green transition-all duration-slow
Largura fill: (step / 5) * 100 + '%'
Label acima: "Etapa 3 de 5" text-body-sm text-fg-on-dark-muted

### Steps nav

role="tablist" / cada step: role="tab" aria-selected={isActive} aria-disabled={isFuture}

Estados:
- Done: CheckCircle fill verde 14px + label muted
- Active: bg-brand-green/10 text-brand-green border border-brand-green/20
- Future: text-fg-on-dark-subtle + numero em circle bg-white/[0.08]

Steps futuros nao sao clicaveis. Mobile <640px: label oculta (hidden sm:inline).

### ConfirmDialog de saida

Titulo: "Sair do setup?"
Mensagem: "Seu progresso ate aqui foi salvo. Voce pode retomar depois em Configuracoes."
CTA primario: "Sair mesmo assim"
Secundario: "Continuar configurando"

---

## 3. Step 1 -- Sua Escola (Brand)

### Objetivo
Capturar identidade visual e identificador unico do tenant.

### Campo: Nome da escola (obrigatorio)

Field label="Nome da escola" type="text" required
placeholder="Ex: Colegio Alfa, Cursinho Beta"
Validacao: nao vazio, min 2 chars
Error: "O nome da escola e obrigatorio"
Auto-popula de localStorage['mentoria-tracking.signup-company']

### Campo: Slug (obrigatorio)

Field label="Identificador (slug)" type="text" required
placeholder="colegio-alfa"
Hint quando valido: "Seu painel ficara em: tracking.escolaclick.com.br/{slug}"
Auto-gerado via slugify(nome) enquanto usuario nao editar manualmente
Validacao client: /^[a-z0-9-]+$/, min 3, max 32 chars

Validacao server ao onBlur via GET /api/onboarding/check-slug?slug=X:
- Loading: spinner 14px no suffix enquanto verifica
- Disponivel: CheckCircle verde no suffix
- Indisponivel: WarningCircle + error "Este slug ja esta em uso. Que tal '{sugestao}'?"
- Erro rede: hint "Nao foi possivel verificar. Tentaremos ao salvar." (nao bloqueia)

aria-describedby aponta para hint + error (separados por espaco quando ambos presentes).

### Campo: URL do site (opcional)

Field label="URL do seu site (opcional)" type="url"
placeholder="https://colegio.com.br"
Hint: "Usamos para associar eventos do GTM ao seu dominio"
Validacao: se preenchido, deve comecar com "https://" -- error "URL deve comecar com https://"

### Campo: Logo (opcional)

Container drag-and-drop:
- border-2 border-dashed border-white/20 rounded-xl p-6 flex flex-col items-center gap-3
- Icone ImageSquare Phosphor 32px duotone aria-hidden
- Label: "Arraste seu logo aqui, ou escolha um arquivo"
- Sub-label caption: "PNG, JPG ou SVG -- ate 2 MB"
- input type="file" accept="image/png,image/jpeg,image/svg+xml" className="sr-only" aria-label="Upload de logo da escola"

Preview ao selecionar: img 64x64 rounded-lg + "Trocar imagem" ghost + "Remover" ghost danger

Upload para /api/onboarding/upload-logo (multipart) -- nao localStorage:
- Loading: skeleton 64x64 animate-pulse bg-white/[0.08] rounded-lg
- Sucesso: preview + toast success "Logo enviado com sucesso"
- Erro tamanho (client-side, antes do upload): role="alert" "Arquivo muito grande. Maximo 2 MB."
- Erro formato: role="alert" "Formato nao suportado. Use PNG, JPG ou SVG."
- Erro rede: role="alert" "Falha ao enviar. Tente de novo." + btn "Tentar novamente"

Link "Adicionar logo depois" abaixo da area -- skip silencioso.

### Campo: Cor do painel (opcional)

role="radiogroup" aria-label="Cor principal do painel"
Presets:
- Verde Mentoria #16DF6F (padrao)
- Azul #3B82F6
- Roxo #8B5CF6
- Laranja #F97316

Mais: input type="color" visivel + label "Outra cor"
Cada preset: role="radio" aria-checked aria-label="{cor.label}" -- botao circular h-8 w-8 rounded-full
Preview ao vivo: document.documentElement.style.setProperty('--brand-green', value)

### Save step 1

1. Marcar touched em campos obrigatorios
2. Verificar slug se ainda nao verificado
3. POST /api/onboarding/step/1 body { name, slug, url?, logo_url?, brand_color }
4. Loading: botao com spinner disabled
5. Erro server: Toast error "Algo falhou ao salvar. Tente de novo."
6. Sucesso: avanca step 2, useEffect move foco para h2 do step 2

### A11y step 1

section aria-labelledby="step1-title" / h2 id="step1-title" "Sua Escola"
Tab order: Nome > Slug > URL > botao upload logo > presets cor > botao Salvar
Erros: role="alert" + campo com aria-describedby apontando pro erro
Focus ao avancar: mover para h2 do proximo step

---

## 4. Step 2 -- Script de Tracking

### Objetivo
Instalar snippet GTM Web e confirmar recepcao de eventos reais.

### Bloco de instrucao

Descricao: "Cole o codigo abaixo no <head> de todas as paginas do seu site. Se usar WordPress, va no GTM4WP ou no header.php."

### Snippet de codigo

Conteudo:
```
<!-- Google Tag Manager -- Mentoria Tracking -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-PPVPWNXG');</script>
<!-- Fim Google Tag Manager -->
```

Container: pre role="region" aria-label="Snippet GTM para copiar"
Estilo: bg-black/40 rounded-xl p-4 text-brand-green text-body-sm overflow-x-auto tabular-nums

Header do bloco:
- label caption "Snippet GTM" text-fg-on-dark-muted
- Button ghost sm "Copiar codigo" aria-label="Copiar snippet GTM" com icone Copy Phosphor
  - Apos copiar: icone Copy -> CheckCircle por 2s + toast "Copiado!"

Nota: "O container ID GTM-PPVPWNXG ja esta configurado para o seu tenant." caption muted

### Callout WordPress (colapsavel, inicialmente expandido)

role="region" aria-label="Instrucoes para WordPress"
Titulo: "Usando WordPress?"
Opcao 1: Plugin GTM4WP -- instale e cole o Container ID GTM-PPVPWNXG nas configuracoes.
Opcao 2: Sem plugin -- cole o snippet antes de </head> no header.php do seu tema.
Link "Ver instrucoes detalhadas" (nova aba)

### Status de verificacao automatica

Polling GET /api/onboarding/check-tracking a cada 10s, max 5 min.
Container com aria-live="polite".

Estado AGUARDANDO (polling ativo):
- Card: border-amber-500/20 bg-amber-500/[0.04] rounded-xl p-5
- Icone: CircleNotch 24px animate-spin text-amber-400 role="status" aria-label="Verificando eventos"
- Titulo: "Aguardando primeiro evento..."
- Corpo: "Acesse qualquer pagina do seu site apos instalar o snippet. Pode levar ate 1 minuto."
- Timer caption: "Verificando ha {N} segundos"
- Btn ghost "Verificar agora" -- forca poll imediato

Estado RECEBIDO (sucesso):
- Card: border-brand-green/30 bg-brand-green/[0.06] rounded-xl p-5
- Icone: CheckCircle fill verde 32px aria-hidden
- aria-live="assertive" anuncia "Evento recebido. Tracking funcionando."
- Titulo: "Evento recebido!"
- Corpo: "Recebemos um evento do seu site. O tracking esta funcionando."
- Sub-detalhe caption: "Fonte: {event.source} -- {relative_time}"
- CTA "Salvar e continuar" habilitado

Estado TIMEOUT (5 min sem evento):
- Card: border-white/10 bg-white/[0.02] rounded-xl p-5
- Icone: ClockCountdown 32px duotone text-fg-on-dark-subtle aria-hidden
- Titulo: "Nenhum evento detectado ainda"
- Corpo: "Tudo bem -- as vezes leva mais tempo. Voce pode continuar e verificar depois em Configuracoes."
- Btn primario "Continuar mesmo assim"
- Btn ghost "Tentar novamente" (reinicia polling)
- Link "Ver guia de solucao de problemas" (nova aba)

### Contrato API step 2

GET /api/onboarding/check-tracking
  -> { received: boolean, event?: { source: string, type: string, received_at: string } }

POST /api/onboarding/step/2
  body { tracking_verified: boolean }
  -> { ok: true }
  (salva mesmo sem verificacao -- nao bloqueia avanco)

### A11y step 2

Container de status: aria-live="polite" (mudancas nao criticas)
Evento recebido: aria-live="assertive" (anuncio imediato)
Spinner: role="status" aria-label="Verificando eventos"
pre do snippet: role="region" aria-label="Snippet GTM para copiar"

---

## 5. Step 3 -- Fontes de Conversao

### Objetivo
Identificar de onde virao os eventos de compra e lead.

### Titulo e descricao

Titulo: "Fontes de Conversao"
Descricao: "De onde chegam as compras e leads que voce quer rastrear? Selecione todas que se aplicam."

### Opcoes em fieldset

fieldset / legend "Selecione todas as fontes que voce usa:"

Anatomia de cada opcao -- label envolvendo card inteiro (area de toque completa):
- input type="checkbox" className="sr-only" id aria-describedby="{id}-desc"
- Checkbox visual: h-5 w-5 rounded border-2
  - Unchecked: border-white/20
  - Checked: border-brand-green bg-brand-green + Check Phosphor 12px branco
- Icone 20px aria-hidden
- Span label font-medium text-body-md + Span id="{id}-desc" text-body-sm muted
- Focus: focus-within:outline-2 focus-within:outline-brand-green focus-within:outline-offset-2

Estado card unchecked: border-white/10 bg-white/[0.02] hover:bg-white/[0.04]
Estado card checked: border-brand-green/30 bg-brand-green/[0.05]

HOTMART:
- Badge StatusBadge success "Mais popular" no topo direito
- Descricao: "Vendas de cursos ou produtos digitais na plataforma Hotmart"
- Checked por padrao se localStorage indica produto digital

FORMULARIO WEB:
- Ao marcar: exibe grupo de chips role="group" aria-label="Plataforma de formularios"
  Chips: Elementor / WPForms / Gravity Forms / HTML puro (nao obrigatorio)

CHATWOOT:
- Badge StatusBadge info "Beta"
- Descricao: "Pontua leads com base em eventos de atendimento no chat"

### Alerta se nenhum ao tentar avancar

role="alert" border-amber-500/20 bg-amber-500/[0.04] rounded-xl p-4
Texto: "Selecione pelo menos uma fonte para continuar. Se nao tiver certeza, escolha a que planeja usar primeiro."

Btn ghost "Ainda nao sei -- configurar depois" avanca sem selecao (sources: []).

### Contrato API step 3

POST /api/onboarding/step/3
  body { sources: ('hotmart'|'form_web'|'chatwoot')[], form_platform?: string }
  -> { ok: true }

### A11y step 3

fieldset + legend envolvendo os checkboxes
Cada input checkbox: id + label htmlFor + aria-describedby apontando para descricao
Grupo de chips: role="group" aria-label="Plataforma de formularios"
Alerta: role="alert" aparece ao tentar avancar sem selecao

---

## 6. Step 4 -- Contas de Anuncios

### Objetivo
Conectar credenciais das plataformas de ads para envio de conversoes enriquecidas.

### Titulo e descricao

Titulo: "Contas de Anuncios"
Descricao: "Configure as plataformas onde voce anuncia. Pode pular tudo agora e configurar depois."
Link ghost abaixo: "Pular tudo e configurar depois em Integracoes" (nao CTA, nao penaliza)

### Grid de cards

Layout: grid grid-cols-1 sm:grid-cols-2 gap-4
Plataformas (ordem de PLATFORM_ORDER em platforms.ts):
  Meta CAPI, Hotmart, GTM Server, Chatwoot, Pinterest CAPI, Google Ads

Anatomia do card:

  article aria-label="Integracao {label} -- {status}"
    header: emoji + nome + badge opcional
    p text-body-sm muted: descricao
    Button ghost sm "Conectar" -> abre IntegrationModal
    -- ou quando configurado --
    StatusBadge success "Configurado" + Button ghost sm "Editar"

Estado nao configurado: border-white/10 bg-white/[0.02]
Estado configurado: border-brand-green/20 bg-brand-green/[0.04]
Hover: hover:shadow-card-hover transition-all

Highlight por sources do step 3:
- Hotmart marcado no step 3 -> card Hotmart badge StatusBadge warning "Recomendado" + border-amber-500/20
- Chatwoot marcado -> card Chatwoot badge "Recomendado"
- Meta CAPI: destaque sutil sempre (maioria usa)

### Modal de configuracao

Reutiliza IntegrationModal de src/routes/settings/IntegrationModal.tsx.
No wizard: modal centrado com backdrop blur (nao bottom drawer).
Titulo: "Conectar {Platform.label}"
Campos: identicos a platforms.ts (pixel_id, access_token, etc.)
Rodape: "Esses dados ficam disponiveis em Configuracoes -> Integracoes."
Apos salvar: fecha modal, card vira estado configurado.
Erro: Toast error "Credenciais invalidas. Verifique e tente de novo."

Focus:
- Ao abrir modal: mover foco para o primeiro campo do formulario
- Ao fechar modal: devolver foco ao botao "Conectar" do card correspondente

### Footer step 4

Contagem caption: "{N} de 6 plataformas configuradas"
>= 1 plataforma: CTA "Salvar e continuar"
0 plataformas: CTA "Continuar sem configurar" (primary -- nao penaliza)

### Contrato API step 4

Cada plataforma: POST /api/tenants/credentials (endpoint de Integracoes -- reutiliza)
POST /api/onboarding/step/4 body { platforms_configured: string[] } -> { ok: true }

### A11y step 4

article aria-label dinamico com status por card
Modal: role="dialog" aria-modal="true" aria-labelledby="modal-title" + focus trap + Esc fecha
Focus management ao abrir/fechar modal (documentado acima)

---

## 7. Step 5 -- Pronto!

### Objetivo
Celebrar conclusao, mostrar checklist resumido, enviar ao dashboard.

### Layout

Centralizado, espacoso. Tom de celebracao contida -- sem confete, design premium.

Estrutura:
- CheckCircle 64px duotone brand-green aria-hidden="true"
- h2 id="step5-title" "Tudo pronto!"
- p body-md muted "Seu painel de tracking esta configurado e pronto para usar."
- section aria-label="Resumo do que foi configurado"
  - ul role="list"
    - li [icone aria-hidden] Escola: {name} ({slug})
    - li [icone aria-hidden] GTM status
    - li [icone aria-hidden] Fontes status
    - li [icone aria-hidden] Plataformas status
- Button primary lg autoFocus "Ir pro Dashboard"
- link ghost "Configurar o que ficou para depois" -> /settings

### Checklist

Concluido: CheckCircle fill text-brand-green 16px aria-hidden + texto text-fg-on-dark
Pendente: Circle text-fg-on-dark-subtle 16px aria-hidden + texto text-fg-on-dark-muted italic

| Condicao | Icone | Texto |
|---|---|---|
| Escola (sempre) | Check verde | Escola: {name} ({slug}) |
| GTM verificado | Check verde | Snippet GTM instalado e recebendo eventos |
| GTM nao verificado | Circle cinza | Snippet GTM nao verificado -- confirme em Configuracoes depois |
| Fontes selecionadas | Check verde | Fontes: {lista separada por virgula} |
| Nenhuma fonte | Circle cinza | Fontes de conversao nao configuradas |
| N >= 1 plataformas | Check verde | {N} plataforma(s) de anuncios conectada(s) |
| 0 plataformas | Circle cinza | Nenhuma plataforma de anuncios configurada |

### Save final e redirect

POST /api/onboarding/complete -> { redirect_to: '/dashboard' }
Marca tenants.onboarding_completed_at = now()
Loading: botao spinner + texto "Preparando seu painel..."
Apos response: navigate('/dashboard')

### Banner no Dashboard apos onboarding

Se onboarding_completed_at < 1h e itens pendentes:
StatusBadge warning + "Algumas configuracoes estao pendentes. Configure em Integracoes para aproveitar tudo."
Desaparece apos 24h ou ao clicar "Dispensar".

### A11y step 5

section aria-labelledby="step5-title" / h2 id="step5-title"
ul role="list" aria-label="Resumo do que foi configurado"
Icone decorativo grande: aria-hidden="true"
Button "Ir pro Dashboard": autoFocus ao entrar no step (via useEffect + ref.current.focus())

---

## 8. Estados transversais

### Loading por step

| Step | O que carrega | UI |
|---|---|---|
| 1 | Check slug server | Spinner 14px no suffix |
| 1 | Upload logo | Skeleton 64x64 animate-pulse |
| 1 | Save step | Botao com spinner interno |
| 2 | Poll check-tracking | CircleNotch animate-spin no card |
| 3 | Save step | Botao com spinner |
| 4 | Abrir modal | Skeleton campos do modal |
| 4 | Save credenciais | Botao Salvar do modal com spinner |
| 5 | Save + redirect | Botao spinner + "Preparando seu painel..." |

### Error states globais

Sem conexao: EmptyState icone WifiNone + "Sem conexao. Verifique sua internet e tente de novo." + btn "Tentar novamente"
Sessao expirada: redirect /login?redirect=/onboarding + toast "Sessao expirada. Faca login novamente."
Tenant 404: redirect /signup

### Retomada de sessao

GET /api/onboarding/progress na montagem do componente.
Se onboarding_step = 3: carregar direto no step 3, toast info "Retomando de onde voce parou -- Etapa 3".
Progress bar e pills refletem historico (steps anteriores ao atual = done).

---

## 9. Microinteracoes

| Elemento | Comportamento |
|---|---|
| Avancar step | Fade out conteudo (100ms) -> fade in novo (200ms) via transition-opacity |
| Slug digitado | Auto-slug debounce 300ms apos parar de digitar |
| Check slug server | Spinner apos 200ms debounce (evita flash) |
| Card plataforma configurada | border white/10 -> brand-green/20 via transition-colors duration-base |
| Botao Copiar snippet | icone Copy -> CheckCircle por 2s via transition-opacity |
| Checkbox card selecionado | border + bg via transition-colors duration-fast |
| Evento recebido step 2 | Card amarelo -> verde via transition-all duration-slow + toast success |

Reduced motion: todos os keyframes dentro de @media (prefers-reduced-motion: no-preference).
Herda comportamento do globals.css existente.
Spinner animate-spin: se reduced motion, substituir por reticencias "..." via opacity alternada.

---

## 10. Copy PT-BR completa

### Step 1 -- Sua Escola

| Elemento | Copy |
|---|---|
| H2 | Sua Escola |
| Subtitulo | Vamos configurar a identidade da sua escola no painel de tracking. |
| Label Nome | Nome da escola |
| Placeholder Nome | Ex: Colegio Alfa, Cursinho Beta Vestibulares |
| Erro Nome | O nome da escola e obrigatorio |
| Label Slug | Identificador (slug) |
| Placeholder Slug | colegio-alfa |
| Hint Slug OK | Seu painel ficara em: tracking.escolaclick.com.br/{slug} |
| Erro Slug vazio | O slug e obrigatorio |
| Erro Slug formato | Use apenas letras minusculas, numeros e hifen |
| Erro Slug curto | Minimo 3 caracteres |
| Erro Slug em uso | Este slug ja esta em uso. Que tal '{sugestao}'? |
| Erro Slug offline | Nao conseguimos verificar agora. Tentaremos ao salvar. |
| Label URL | URL do seu site (opcional) |
| Placeholder URL | https://colegio.com.br |
| Hint URL | Usamos para associar eventos do GTM ao seu dominio |
| Erro URL | URL deve comecar com https:// |
| Label Logo | Logo da escola (opcional) |
| Upload drag | Arraste seu logo aqui, ou escolha um arquivo |
| Upload hint | PNG, JPG ou SVG -- ate 2 MB |
| Upload trocar | Trocar imagem |
| Upload remover | Remover |
| Erro tamanho | Arquivo muito grande. Maximo 2 MB. |
| Erro formato | Formato nao suportado. Use PNG, JPG ou SVG. |
| Erro rede logo | Falha ao enviar. Tente de novo. |
| Skip logo | Adicionar logo depois |
| Label Cor | Cor principal do painel |
| CTA | Salvar e continuar |

### Step 2 -- Script de Tracking

| Elemento | Copy |
|---|---|
| H2 | Script de Tracking |
| Subtitulo | Instale o snippet abaixo para que seu site comece a enviar dados. |
| Instrucao | Cole no head de todas as paginas do seu site. |
| Btn copiar | Copiar codigo |
| Apos copiar | Copiado! |
| WP titulo | Usando WordPress? |
| WP op1 | Plugin GTM4WP -- instale e cole o Container ID GTM-PPVPWNXG nas configuracoes. |
| WP op2 | Sem plugin -- cole o snippet antes de </head> no header.php do seu tema. |
| Aguardando titulo | Aguardando primeiro evento... |
| Aguardando corpo | Acesse qualquer pagina do seu site apos instalar o snippet. Pode levar ate 1 minuto. |
| Timer | Verificando ha {N} segundos |
| Btn verificar | Verificar agora |
| Recebido titulo | Evento recebido! |
| Recebido corpo | Recebemos um evento do seu site. O tracking esta funcionando. |
| Timeout titulo | Nenhum evento detectado ainda |
| Timeout corpo | Tudo bem -- as vezes leva mais tempo. Voce pode continuar e verificar depois em Configuracoes. |
| Btn continuar timeout | Continuar mesmo assim |
| Btn tentar | Tentar novamente |
| Link solucao | Ver guia de solucao de problemas |
| CTA verificado | Salvar e continuar |
| CTA sem verificar | Continuar mesmo assim |

### Step 3 -- Fontes de Conversao

| Elemento | Copy |
|---|---|
| H2 | Fontes de Conversao |
| Subtitulo | De onde chegam as compras e leads que voce quer rastrear? |
| Legend | Selecione todas as fontes que voce usa: |
| Hotmart label | Hotmart |
| Hotmart descricao | Vendas de cursos ou produtos digitais na plataforma Hotmart |
| Hotmart badge | Mais popular |
| Form label | Formulario Web |
| Form descricao | Leads captados por formularios no seu site (Elementor, WPForms ou HTML) |
| Form sub | Qual plataforma de formularios voce usa? |
| Chatwoot label | Chatwoot |
| Chatwoot descricao | Pontua leads com base em eventos de atendimento no chat |
| Chatwoot badge | Beta |
| Alerta nenhum | Selecione pelo menos uma fonte para continuar. Se nao tiver certeza, escolha a que planeja usar primeiro. |
| Btn pular | Ainda nao sei -- configurar depois |
| CTA | Salvar e continuar |

### Step 4 -- Contas de Anuncios

| Elemento | Copy |
|---|---|
| H2 | Contas de Anuncios |
| Subtitulo | Conecte as plataformas onde voce anuncia para enviar conversoes enriquecidas. |
| Link pular | Pular tudo e configurar depois em Integracoes |
| Card CTA | Conectar |
| Configurado | Configurado |
| Editar | Editar |
| Contagem | {N} de 6 plataformas configuradas |
| Modal titulo | Conectar {Nome} |
| Modal rodape | Esses dados ficam disponiveis em Configuracoes -> Integracoes. |
| Erro credenciais | Credenciais invalidas. Verifique e tente de novo. |
| CTA com plataforma | Salvar e continuar |
| CTA sem plataforma | Continuar sem configurar |

### Step 5 -- Pronto!

| Elemento | Copy |
|---|---|
| H2 | Tudo pronto! |
| Subtitulo tudo feito | Seu painel de tracking esta configurado e pronto para usar. |
| Subtitulo com pendentes | Setup concluido. Algumas configuracoes ainda podem ser feitas depois. |
| Checklist titulo | O que foi configurado: |
| Escola done | Escola: {name} ({slug}) |
| GTM verificado | Snippet GTM instalado e recebendo eventos |
| GTM nao verificado | Snippet GTM nao verificado -- confirme em Configuracoes depois |
| Fontes done | Fontes: {lista separada por virgula} |
| Sem fontes | Fontes de conversao nao configuradas |
| Plataformas done | {N} plataforma(s) de anuncios conectada(s) |
| Sem plataformas | Nenhuma plataforma de anuncios configurada |
| CTA | Ir pro Dashboard |
| CTA loading | Preparando seu painel... |
| Link pendentes | Configurar o que ficou para depois |
| Banner dashboard | Algumas configuracoes estao pendentes. Configure em Integracoes para aproveitar tudo. |

### Microcopy global

| Situacao | Copy |
|---|---|
| Voltar | Voltar |
| Salvar e sair | Salvar e terminar depois |
| Sair titulo | Sair do setup? |
| Sair corpo | Seu progresso ate aqui foi salvo. Retome quando quiser em Configuracoes -> Setup inicial. |
| Sair CTA | Sair mesmo assim |
| Sair cancelar | Continuar configurando |
| Retomada toast | Retomando de onde voce parou -- Etapa {N} |
| Erro rede global | Algo falhou. Verifique sua conexao e tente de novo. |
| Sessao expirada | Sessao expirada. Faca login novamente. |
| Toast step salvo | Etapa {N} salva! |

---

## 11. Contrato de API (para Dara implementar)

| Endpoint | Metodo | Descricao |
|---|---|---|
| /api/onboarding/progress | GET | Retorna { step: number, data: StepData } |
| /api/onboarding/check-slug?slug=X | GET | { available: boolean, suggestion?: string } |
| /api/onboarding/upload-logo | POST multipart | { url: string } |
| /api/onboarding/check-tracking | GET | { received: boolean, event?: { source, type, received_at } } |
| /api/onboarding/step/1 | POST | body { name, slug, url?, logo_url?, brand_color } -> { ok: true } |
| /api/onboarding/step/2 | POST | body { tracking_verified: boolean } -> { ok: true } |
| /api/onboarding/step/3 | POST | body { sources: string[], form_platform?: string } -> { ok: true } |
| /api/onboarding/step/4 | POST | body { platforms_configured: string[] } -> { ok: true } |
| /api/onboarding/complete | POST | body {} -> { redirect_to: string } |

---

## 12. Checklist A11y WCAG AA

- [ ] Todos os inputs com label associado via htmlFor + id
- [ ] Erros em role="alert" com aria-describedby no campo correspondente
- [ ] Hints com aria-describedby (separados por espaco do erro no mesmo atributo)
- [ ] Progress bar: role="progressbar" aria-valuenow aria-valuemin aria-valuemax aria-label
- [ ] Steps nav: role="tablist" + role="tab" + aria-selected
- [ ] Checkbox cards: label envolvendo o card inteiro (area de toque completa)
- [ ] Modal: role="dialog" aria-modal="true" aria-labelledby + focus trap + Esc fecha
- [ ] Foco gerenciado ao mudar step (mover para h2 do novo step)
- [ ] Input file oculto: aria-label explicito
- [ ] Live regions: polling em aria-live="polite", evento recebido em aria-live="assertive"
- [ ] Reduced motion: keyframes em @media (prefers-reduced-motion: no-preference)
- [ ] Contraste min 4.5:1 texto normal, 3:1 texto grande/UI
- [ ] Touch targets min 44x44px em mobile
- [ ] Icones decorativos: aria-hidden="true"
- [ ] Navegacao completa por teclado sem mouse
- [ ] section aria-labelledby em cada step
- [ ] Upload drag-and-drop: botao equivalente sempre disponivel para teclado

---

## 13. Edge cases

| Caso | Comportamento |
|---|---|
| Slug ja existe | Erro inline + sugestao "{slug}-2" ou "{slug}-escola" |
| Slug identico ao tenant atual ao editar | Considerar disponivel (nao erro) |
| GTM nao detecta evento em 5 min | "Continuar mesmo assim" habilitado + link troubleshooting |
| Upload logo falha rede | "Tentar novamente" + skip silencioso permitido |
| Upload arquivo > 2 MB | Erro client-side antes do upload |
| Credenciais invalidas no modal | Erro no modal -- nao fecha ate corrigir ou cancelar explicitamente |
| Usuario recarrega pagina | GET /api/onboarding/progress restaura step correto |
| Botao Voltar do browser | beforeunload -> ConfirmDialog |
| Duas abas abertas | last-write-wins no server |
| Tenant ja completou onboarding | Redirect imediato para /dashboard |
| Token expira durante wizard | Redirect /login?redirect=/onboarding + toast |
| Viewport 375px | Stack vertical em campos, footer botoes em coluna |
| Modal aberto em mobile | Full-screen bottom sheet em vez de modal centrado |

---

## 14. Componentes reutilizados x novos

### Reutilizar sem modificar

| Uso | Componente | Localizacao |
|---|---|---|
| CTAs | Button | src/components/ui/Button.tsx |
| Campos de texto | Field + Input | src/components/ui/Field.tsx + Input.tsx |
| Badges de status | StatusBadge | src/components/ui/StatusBadge.tsx |
| Toasts | useToast + ToastProvider | src/components/ui/Toast.tsx |
| Confirmacao sair | ConfirmDialog | src/components/ui/ConfirmDialog.tsx |
| Empty states (erro rede) | EmptyState | src/components/ui/EmptyState.tsx |
| Modal credenciais | IntegrationModal | src/routes/settings/IntegrationModal.tsx |
| Metadados plataformas | PLATFORM_META + PLATFORM_ORDER | src/routes/settings/platforms.ts |

### Novos componentes (Dex cria durante implementacao)

StepPolling -- encapsula logica de polling com estados loading/success/timeout (step 2)
CheckboxCard -- card de checkbox estilizado com area de toque completa (step 3)
CodeBlock -- bloco pre com botao copiar e feedback visual (step 2)
DropZone -- area drag-and-drop com fallback de botao para teclado (step 1, logo)

---

Spec entregue por Uma (UX) -- 19/05/2026.
Para implementacao TSX: Dex.
Para endpoints e SQL: Dara (task #20 em andamento).
Para review de acessibilidade pre-release: Quinn.
