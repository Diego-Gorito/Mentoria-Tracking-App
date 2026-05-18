import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function formatDate(date: Date | string, short = false): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (short) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  }
  return d.toLocaleDateString('pt-BR')
}

// Hash simples pra avatar fallback (8 cores)
const AVATAR_COLORS = [
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-violet-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-orange-500',
]

export function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
}

/** Mascara token: exibe só os últimos 4 chars (••••abcd) */
export function maskToken(value: string): string {
  if (value.length <= 4) return '••••'
  return `••••${value.slice(-4)}`
}
