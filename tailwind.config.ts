import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Marca Mentoria (DESIGN.md v1.3)
        // brand-green é runtime-overridable via CSS var (ColorPresetSync).
        // Variantes derivam via color-mix em globals.css. Mantemos hex fallback
        // pra cores estáticas (-2, black, white, etc).
        brand: {
          green: 'var(--brand-green, #16DF6F)',
          'green-2': 'var(--brand-green-2, #00A99D)',
          'green-bright': 'var(--brand-green-bright, #1FFF7F)',
          'green-dim': 'var(--brand-green-dim, #0FB055)',
          black: '#0A0A0A',
          'black-deep': '#050505',
          white: '#FFFFFF',
        },
        // Visuais
        primary: {
          DEFAULT: 'var(--brand-green, #16DF6F)',
          foreground: '#0A0A0A',
          hover: 'var(--brand-green-dim, #13C962)',
          active: 'var(--brand-green-dim, #0FB055)',
          glow: 'var(--brand-glow, rgba(22, 223, 111, 0.4))',
        },
        // Surfaces v1.3 — off-white quente + sidebar grafite
        bg: {
          // Light surfaces
          content: '#FAFAF7', // off-white quente sutil (era #FAFAFA)
          elevated: '#FFFFFF', // cards
          muted: '#F4F4F1', // muted warmer
          // Dark surfaces (sidebar)
          sidebar: '#11131A', // grafite azulado-quente (era #0A0A0A puro)
          'sidebar-elevated': '#1A1C24', // hover/active bg
          'sidebar-hover': '#1E2028', // hover stronger
          deep: '#050505',
          dark: '#0A0A0A', // login hero
          'elevated-dark': '#141414',
          'elevated-2-dark': '#1A1A1A',
          light: '#FFFFFF',
        },
        // Borders v1.3 — ultra sutis
        border: {
          subtle: '#F0F0F0', // ultra sutil (era #E4E4E7)
          DEFAULT: '#EAEAEA', // padrão (era #D4D4D8)
          strong: '#71717A',
          'sidebar-subtle': '#1E2028',
          'sidebar-default': '#27292F',
          'dark-subtle': '#27272A',
          dark: '#3F3F46',
        },
        // Foreground
        fg: {
          'on-light': '#09090B',
          'on-light-muted': '#52525B',
          'on-light-subtle': '#71717A',
          'on-dark': '#FAFAFA',
          'on-dark-muted': '#A1A1AA',
          'on-dark-subtle': '#71717A',
          'on-sidebar': '#FAFAFA',
          'on-sidebar-muted': '#A1A1AA',
          'on-sidebar-subtle': '#71717A',
        },
        // Status (visual)
        success: '#16DF6F',
        info: '#00A99D',
        warning: '#F59E0B',
        danger: '#EF4444',
        // Texto WCAG AA
        'primary-text': '#0A8F4D',
        'info-text': '#006B62',
        'success-text': '#0A8F4D',
        'warning-text': '#B45309',
        'danger-text': '#B91C1C',
        'muted-text': '#52525B',
        'content-bg': '#FAFAF7',
      },
      fontFamily: {
        sans: ['Lexend', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Editorial massive (Stitch hero) — v1.4
        'hero-5xl': ['120px', { lineHeight: '0.95', fontWeight: '700', letterSpacing: '-0.045em' }],
        'hero-4xl': ['96px', { lineHeight: '0.98', fontWeight: '700', letterSpacing: '-0.04em' }],
        'hero-3xl': ['72px', { lineHeight: '1.02', fontWeight: '700', letterSpacing: '-0.035em' }],
        'display-2xl': [
          '56px',
          { lineHeight: '1.05', fontWeight: '800', letterSpacing: '-0.03em' },
        ],
        'display-xl': ['44px', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.025em' }],
        'display-lg': ['36px', { lineHeight: '1.15', fontWeight: '700', letterSpacing: '-0.02em' }],
        'display-md': ['30px', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.02em' }],
        h1: ['30px', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.02em' }],
        h2: ['24px', { lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.015em' }],
        h3: ['20px', { lineHeight: '1.3', fontWeight: '600', letterSpacing: '-0.01em' }],
        h4: ['18px', { lineHeight: '1.4', fontWeight: '600' }],
        'heading-md': ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        'heading-sm': ['18px', { lineHeight: '1.4', fontWeight: '600' }],
        lead: ['18px', { lineHeight: '1.55', fontWeight: '400' }],
        'body-lg': ['16px', { lineHeight: '1.55', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '1.55', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        caption: ['12px', { lineHeight: '1.4', fontWeight: '500', letterSpacing: '0.01em' }],
        // Mono
        'mono-display': ['48px', { lineHeight: '1', fontWeight: '600', letterSpacing: '-0.03em' }],
        'mono-lg': ['24px', { lineHeight: '1.1', fontWeight: '500' }],
        'mono-md': ['14px', { lineHeight: '1.4', fontWeight: '500' }],
        'mono-sm': ['12px', { lineHeight: '1.4', fontWeight: '400' }],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      spacing: {
        'sidebar-width': '240px',
        'sidebar-collapsed': '64px',
        'topbar-height': '64px',
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '400ms',
      },
      transitionTimingFunction: {
        'spring-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'spring-in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      boxShadow: {
        // Sistema de elevação v1.3 — Stitch/Vercel polish
        xs: '0 1px 2px rgba(0,0,0,0.04)',
        sm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.03)',
        md: '0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)',
        lg: '0 10px 30px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.05)',
        xl: '0 20px 50px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.06)',
        // Glow verde Mentoria
        'glow-green':
          '0 0 0 1px rgba(22,223,111,0.2), 0 0 20px rgba(22,223,111,0.15), 0 0 40px rgba(22,223,111,0.05)',
        'glow-green-strong':
          '0 0 0 1px rgba(22,223,111,0.4), 0 0 30px rgba(22,223,111,0.3), 0 0 60px rgba(22,223,111,0.1)',
        // Card hover (sutil, com tom verde)
        'card-hover': '0 4px 12px rgba(0,0,0,0.06), 0 0 0 1px rgba(22,223,111,0.08)',
        // Focus ring polido
        'focus-green': '0 0 0 3px rgba(22,223,111,0.12)',
        // v1.7: focus ring complexo para backgrounds glassy (theme-aware via CSS var)
        'focus-complex': 'var(--ring-focus-complex)',
      },
      zIndex: {
        dropdown: '10',
        sticky: '20',
        fixed: '30',
        // popover: dropdowns flutuantes (UnitSwitcher, Bell, AvatarMenu) — acima de fixed, abaixo de modal-backdrop
        popover: '35',
        'modal-backdrop': '40',
        modal: '50',
        toast: '60',
        tooltip: '70',
      },
      backgroundImage: {
        'sidebar-gradient':
          'radial-gradient(circle at 0% 0%, rgba(22,223,111,0.08) 0%, transparent 45%), radial-gradient(circle at 100% 100%, rgba(0,169,157,0.04) 0%, transparent 50%), #11131A',
        'login-hero-gradient':
          'radial-gradient(ellipse at top left, rgba(22,223,111,0.14) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(0,169,157,0.08) 0%, transparent 50%), #050508',
        // v1.4 — Stitch dot grid pattern (sutil, premium)
        'dot-grid': 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
        'dot-grid-strong': 'radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)',
        // Glow ambient hero Stitch
        'stitch-hero':
          'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(22,223,111,0.10) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 90% 90%, rgba(0,169,157,0.06) 0%, transparent 60%), #0A0A0A',
      },
      backgroundSize: {
        'dot-grid': '24px 24px',
      },
      animation: {
        'fade-up': 'fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-left': 'slide-in-left 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.5s linear infinite',
        'pulse-green': 'pulse-green 2s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 1.5s ease-in-out infinite',
        'fade-in': 'fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scale-in 250ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-4px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-green': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(22,223,111,0.7)' },
          '50%': { boxShadow: '0 0 0 8px rgba(22,223,111,0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

export default config
