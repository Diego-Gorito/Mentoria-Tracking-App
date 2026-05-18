/**
 * Design tokens do Mentoria Tracking App
 * Extraídos de ERP-Mentoria/tailwind.config.ts + src/styles/globals.css
 * DESIGN.md v1.5 (Stitch + Vercel polish)
 *
 * Uso no novo repo:
 *   import { tokens } from '@/styles/tokens'
 *   // Referenciar via Tailwind classes (tokens.ts é fonte de verdade pra código não-Tailwind)
 */

export const tokens = {
  colors: {
    brand: {
      green: '#16DF6F',           // CSS var: --brand-green (runtime-overridable por ColorPresetSync)
      green2: '#00A99D',          // CSS var: --brand-green-2
      greenBright: '#1FFF7F',     // CSS var: --brand-green-bright (color-mix do green + white 12%)
      greenDim: '#0FB055',        // CSS var: --brand-green-dim (color-mix do green + black 20%)
      black: '#0A0A0A',
      blackDeep: '#050505',
      white: '#FFFFFF',
    },
    bg: {
      // Light surfaces (conteudo principal)
      content: '#FAFAF7',         // off-white quente, background do body em light mode
      elevated: '#FFFFFF',        // cards em light mode
      muted: '#F4F4F1',           // backgrounds sutis, hover rows
      // Dark surfaces (sidebar + app shell)
      sidebar: '#11131A',         // grafite azulado-quente
      sidebarElevated: '#1A1C24', // hover/active bg na sidebar
      sidebarHover: '#1E2028',    // hover mais forte na sidebar
      deep: '#050505',
      dark: '#0A0A0A',            // login hero background
      elevatedDark: '#141414',
      elevated2Dark: '#1A1A1A',
    },
    // App surfaces — CSS vars, mudam com data-theme (default = dark)
    appShell: {
      // dark (default): --app-bg: #23232c
      // light:          --app-bg: #eaeaee
      bg: 'var(--app-bg)',
      sidebarBg: 'var(--app-sidebar-bg)',
      cardBg: 'var(--app-card-bg)',
      cardBgHover: 'var(--app-card-bg-hover)',
      cardBorder: 'var(--app-card-border)',
      pillBg: 'var(--app-pill-bg)',
      pillBorder: 'var(--app-pill-border)',
      pillFg: 'var(--app-pill-fg)',
      inputBg: 'var(--app-input-bg)',
      inputBorder: 'var(--app-input-border)',
      fg: 'var(--app-fg)',
      fgMuted: 'var(--app-fg-muted)',
      fgSubtle: 'var(--app-fg-subtle)',
      divider: 'var(--app-divider)',
      dividerSoft: 'var(--app-divider-soft)',
      dotColor: 'var(--app-dot-color)',
      spotlight: 'var(--app-spotlight)',
    },
    border: {
      subtle: '#F0F0F0',           // ultra sutil
      DEFAULT: '#EAEAEA',          // padrão
      strong: '#71717A',
      sidebarSubtle: '#1E2028',
      sidebarDefault: '#27292F',
      darkSubtle: '#27272A',
      dark: '#3F3F46',
    },
    fg: {
      onLight: '#09090B',
      onLightMuted: '#52525B',
      onLightSubtle: '#71717A',
      onDark: '#FAFAFA',
      onDarkMuted: '#A1A1AA',
      onDarkSubtle: '#71717A',
      onSidebar: '#FAFAFA',
      onSidebarMuted: '#A1A1AA',
      onSidebarSubtle: '#71717A',
    },
    status: {
      success: '#16DF6F',
      info: '#00A99D',
      warning: '#F59E0B',
      danger: '#EF4444',
    },
    // Texto com contraste WCAG AA (4.5:1 mínimo sobre fundo branco/off-white)
    text: {
      primary: '#0A8F4D',         // verde sobre branco: ratio ~4.6:1
      info: '#006B62',            // teal sobre branco: ratio ~4.7:1
      success: '#0A8F4D',
      warning: '#B45309',         // âmbar sobre branco: ratio ~4.8:1
      danger: '#B91C1C',          // vermelho sobre branco: ratio ~5.2:1
      muted: '#52525B',
    },
    // Backgrounds de badge por status (light mode)
    statusBadge: {
      success: { bg: '#ECFDF5', border: '#A7F3D0', text: '#0A8F4D', dot: '#16DF6F' },
      info:    { bg: '#F0FDFA', border: '#99F6E4', text: '#006B62', dot: '#00A99D' },
      warning: { bg: '#FFFBEB', border: '#FCD34D', text: '#B45309', dot: '#F59E0B' },
      danger:  { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C', dot: '#EF4444' },
      neutral: { bg: '#F4F4F1', border: '#F0F0F0', text: '#52525B', dot: '#A1A1AA' },
    },

    // ── Tracking-specific tokens ──────────────────────────────────────────
    //
    // conversion_dispatches status colors
    // Uso: DotPill, badges em tabela de dispatches, sparklines
    dispatchStatus: {
      pending:   { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)',  text: '#B45309', dot: '#F59E0B' },
      sent:      { bg: 'rgba(22,223,111,0.10)',  border: 'rgba(22,223,111,0.30)',  text: '#0A8F4D', dot: '#16DF6F' },
      failed:    { bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.30)',   text: '#B91C1C', dot: '#EF4444' },
      retracted: { bg: 'rgba(161,161,170,0.10)', border: 'rgba(161,161,170,0.30)', text: '#52525B', dot: '#A1A1AA' },
    },

    // Platform brand colors
    // Uso: ícones de plataforma em cards de Integrações, barras de ROAS por plataforma,
    //      legendas de chart — NUNCA usar como background de texto (só icon/dot/borda).
    // Nota: valores são as cores primárias oficiais de cada plataforma.
    // WCAG: não usar diretamente como text color em fundo branco sem verificar contrast ratio.
    platform: {
      meta:      '#1877F2', // Facebook/Instagram (azul Meta)
      google:    '#4285F4', // Google Ads (azul Google — usar com cautela; docs mostram multi-color)
      hotmart:   '#FF6B00', // Hotmart (laranja)
      pinterest: '#E60023', // Pinterest (vermelho)
      taboola:   '#0056CC', // Taboola (azul)
      tiktok:    '#000000', // TikTok (preto — no dark mode usar #FFFFFF ou #69C9D0)
      kwai:      '#FF6800', // Kwai (laranja)
      chatwoot:  '#1F93FF', // Chatwoot (azul)
      googleAnalytics: '#E37400', // GA4 (âmbar)
    },

    // Chart categorical palette — 6 cores distintas pra séries em charts de plataforma
    // Ordenar por plataforma mais comum primeiro.
    // Uso: recharts/visx stroke/fill em LineChart, BarChart, PieChart.
    // Contraste mínimo: testado em fundo #23232c (dark app bg) — ratio ≥ 3:1 (gráfico, não texto).
    chart: {
      c1: '#16DF6F', // brand-green — Mentoria/total
      c2: '#1877F2', // meta-blue
      c3: '#FF6B00', // hotmart-orange
      c4: '#E60023', // pinterest-red
      c5: '#00A99D', // brand-green-2 — teal
      c6: '#F59E0B', // warning-amber — Google/outros
    },
  },

  typography: {
    fontFamily: {
      sans: ['Lexend', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
    },
    // Tailwind class → [size, lineHeight, weight, letterSpacing?]
    scale: {
      'hero-5xl':    { size: '120px', lineHeight: '0.95',  weight: 700, letterSpacing: '-0.045em' },
      'hero-4xl':    { size: '96px',  lineHeight: '0.98',  weight: 700, letterSpacing: '-0.04em'  },
      'hero-3xl':    { size: '72px',  lineHeight: '1.02',  weight: 700, letterSpacing: '-0.035em' },
      'display-2xl': { size: '56px',  lineHeight: '1.05',  weight: 800, letterSpacing: '-0.03em'  },
      'display-xl':  { size: '44px',  lineHeight: '1.1',   weight: 700, letterSpacing: '-0.025em' },
      'display-lg':  { size: '36px',  lineHeight: '1.15',  weight: 700, letterSpacing: '-0.02em'  },
      'display-md':  { size: '30px',  lineHeight: '1.2',   weight: 600, letterSpacing: '-0.02em'  },
      h1:            { size: '30px',  lineHeight: '1.2',   weight: 600, letterSpacing: '-0.02em'  },
      h2:            { size: '24px',  lineHeight: '1.25',  weight: 600, letterSpacing: '-0.015em' },
      h3:            { size: '20px',  lineHeight: '1.3',   weight: 600, letterSpacing: '-0.01em'  },
      h4:            { size: '18px',  lineHeight: '1.4',   weight: 600                            },
      'heading-md':  { size: '20px',  lineHeight: '1.3',   weight: 600                            },
      'heading-sm':  { size: '18px',  lineHeight: '1.4',   weight: 600                            },
      lead:          { size: '18px',  lineHeight: '1.55',  weight: 400                            },
      'body-lg':     { size: '16px',  lineHeight: '1.55',  weight: 400                            },
      'body-md':     { size: '14px',  lineHeight: '1.55',  weight: 400                            },
      'body-sm':     { size: '13px',  lineHeight: '1.5',   weight: 400                            },
      caption:       { size: '12px',  lineHeight: '1.4',   weight: 500, letterSpacing: '0.01em'   },
      // Mono
      'mono-display':{ size: '48px',  lineHeight: '1',     weight: 600, letterSpacing: '-0.03em'  },
      'mono-lg':     { size: '24px',  lineHeight: '1.1',   weight: 500                            },
      'mono-md':     { size: '14px',  lineHeight: '1.4',   weight: 500                            },
      'mono-sm':     { size: '12px',  lineHeight: '1.4',   weight: 400                            },
    },
  },

  spacing: {
    sidebarWidth: 240,          // px — desktop expanded
    sidebarCollapsed: 64,       // px — (reservado Era 2, não implementado ainda)
    topbarHeight: 64,           // px
    sidebarMargin: 12,          // px — sidebar flutua com gap de 12px em relação à borda
    mainPaddingMobile: 32,      // px — px-8
    mainPaddingDesktop: 48,     // px — lg:px-12
    mainPaddingWide: 64,        // px — xl:px-16
    mainMaxWidth: 1600,         // px — max-w-[1600px]
    cardPadding: 28,            // px — p-7 nos KPI cards
    sectionGap: 48,             // px — mb-12 nos PageHeader
    dotGridSize: 24,            // px — dot grid background-size
  },

  radius: {
    sm: 4,    // px — rounded-sm
    md: 8,    // px — rounded-md (default — botões)
    lg: 12,   // px — rounded-lg (cards white)
    xl: 16,   // px — rounded-xl (stitch-card, modais)
    '2xl': 24,// px — rounded-2xl (sidebar, empty state icon)
    full: 9999, // px — rounded-full (pills, chips, badges redondos)
  },

  shadows: {
    xs: '0 1px 2px rgba(0,0,0,0.04)',
    sm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.03)',
    md: '0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)',
    lg: '0 10px 30px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05)',
    xl: '0 20px 50px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.06)',
    glowGreen:
      '0 0 0 1px rgba(22,223,111,0.2), 0 0 20px rgba(22,223,111,0.15), 0 0 40px rgba(22,223,111,0.05)',
    glowGreenStrong:
      '0 0 0 1px rgba(22,223,111,0.4), 0 0 30px rgba(22,223,111,0.3), 0 0 60px rgba(22,223,111,0.1)',
    cardHover:
      '0 4px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(22,223,111,0.08)',
    focusGreen:
      '0 0 0 3px rgba(22,223,111,0.12)',
    focusComplex:
      'var(--ring-focus-complex)', // CSS var: 0 0 0 2px var(--brand-green), 0 0 0 4px var(--app-bg)
  },

  animation: {
    duration: {
      fast: '150ms',
      base: '200ms',
      slow: '400ms',
    },
    easing: {
      springOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
      springInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
    },
    keyframes: {
      fadeUp:      { from: { opacity: 0, transform: 'translateY(8px)' },  to: { opacity: 1, transform: 'translateY(0)' } },
      slideInLeft: { from: { opacity: 0, transform: 'translateX(-4px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
      shimmer:     { from: { backgroundPosition: '-200% 0' },             to: { backgroundPosition: '200% 0' } },
      pulseGreen:  { '0%,100%': { boxShadow: '0 0 0 0 rgba(22,223,111,0.7)' }, '50%': { boxShadow: '0 0 0 8px rgba(22,223,111,0)' } },
      pulseSoft:   { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } },
      fadeIn:      { from: { opacity: 0 }, to: { opacity: 1 } },
      scaleIn:     { from: { opacity: 0 }, to: { opacity: 1 } },
    },
  },

  zIndex: {
    dropdown: 10,
    sticky: 20,
    fixed: 30,
    popover: 35,      // dropdowns flutuantes (TenantPill, Bell, AvatarMenu)
    modalBackdrop: 40,
    modal: 50,
    toast: 60,
    tooltip: 70,
  },

  backgrounds: {
    sidebarGradient:
      'radial-gradient(circle at 0% 0%, rgba(22,223,111,0.08) 0%, transparent 45%), radial-gradient(circle at 100% 100%, rgba(0,169,157,0.04) 0%, transparent 50%), #11131A',
    loginHeroGradient:
      'radial-gradient(ellipse at top left, rgba(22,223,111,0.14) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(0,169,157,0.08) 0%, transparent 50%), #050508',
    dotGrid:
      'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
    dotGridStrong:
      'radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)',
    stitchHero:
      'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(22,223,111,0.10) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 90% 90%, rgba(0,169,157,0.06) 0%, transparent 60%), #0A0A0A',
    ambientGlowIntensity: 'rgba(22, 223, 111, 0.025)',  // CSS var: --ambient-glow-intensity
  },
} as const

export type Tokens = typeof tokens
