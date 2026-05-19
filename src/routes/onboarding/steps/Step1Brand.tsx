// Step1Brand.tsx — Sua Escola: nome, slug, URL, logo, cor
// WCAG AA: section aria-labelledby, Field + aria-describedby, role=radiogroup/radio.
// Auto-slug: slugify(nome) enquanto não editado manualmente.
// Slug check server: debounced 400ms via useOnboarding.checkSlug.

import { useEffect, useId, useState } from 'react'
import { CheckCircle, WarningCircle, CircleNotch } from '@phosphor-icons/react'
import { Field } from '@/components/ui/Field'
import { DropZone } from '@/components/ui/DropZone'
import type { SlugCheckResult } from '@/hooks/useOnboarding'

function slugify(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32)
}

const COLOR_PRESETS = [
  { label: 'Verde Mentoria', value: '#16DF6F', bg: 'bg-[#16DF6F]' },
  { label: 'Azul', value: '#3B82F6', bg: 'bg-blue-500' },
  { label: 'Roxo', value: '#8B5CF6', bg: 'bg-violet-500' },
  { label: 'Laranja', value: '#F97316', bg: 'bg-orange-500' },
]

export type Step1Data = {
  name: string
  slug: string
  url: string
  logoUrl: string | null
  brandColor: string
}

type Props = {
  initial: Step1Data
  slugCheck: SlugCheckResult
  onSlugChange: (slug: string) => void
  onSlugBlur: (slug: string) => void
  onLogoUpload: (file: File) => Promise<string | null>
  onChange: (data: Step1Data) => void
  touched: Record<string, boolean>
  onBlur: (field: string) => void
  uploadError: string | null
  uploadLoading: boolean
}

export function Step1Brand({
  initial,
  slugCheck,
  onSlugChange,
  onSlugBlur,
  onLogoUpload,
  onChange,
  touched,
  onBlur,
  uploadError,
  uploadLoading,
}: Props) {
  const uid = useId()
  const [data, setData] = useState<Step1Data>(initial)
  const [slugManual, setSlugManual] = useState(false)
  const [colorIdx, setColorIdx] = useState(0)
  const [customColor, setCustomColor] = useState('')

  // Propagate changes up
  useEffect(() => { onChange(data) }, [data, onChange])

  // Auto-slug a partir do nome
  useEffect(() => {
    if (!slugManual) {
      const auto = slugify(data.name)
      setData((d) => ({ ...d, slug: auto }))
      if (auto.length >= 3) onSlugChange(auto)
    }
  }, [data.name, slugManual, onSlugChange])

  // Sync brand color with CSS var
  useEffect(() => {
    const color = customColor || COLOR_PRESETS[colorIdx]?.value || '#16DF6F'
    document.documentElement.style.setProperty('--brand-green', color)
    setData((d) => ({ ...d, brandColor: color }))
  }, [colorIdx, customColor])

  function handleNameChange(v: string) {
    setData((d) => ({ ...d, name: v }))
  }

  function handleSlugInputChange(v: string) {
    setSlugManual(true)
    const clean = slugify(v)
    setData((d) => ({ ...d, slug: clean }))
    onSlugChange(clean)
  }

  function handleSlugBlur() {
    onBlur('slug')
    onSlugBlur(data.slug)
  }

  async function handleLogoFile(file: File, previewUrl: string) {
    setData((d) => ({ ...d, logoUrl: previewUrl }))
    const serverUrl = await onLogoUpload(file)
    if (serverUrl) setData((d) => ({ ...d, logoUrl: serverUrl }))
  }

  function handleLogoRemove() {
    setData((d) => ({ ...d, logoUrl: null }))
  }

  // Slug suffix icon
  const slugSuffix = (() => {
    if (slugCheck.status === 'checking') {
      return <CircleNotch size={14} className="text-fg-on-dark-subtle animate-spin" aria-label="Verificando slug..." />
    }
    if (slugCheck.status === 'available') {
      return <CheckCircle size={14} className="text-brand-green" aria-hidden="true" />
    }
    if (slugCheck.status === 'unavailable') {
      return <WarningCircle size={14} className="text-red-400" aria-hidden="true" />
    }
    return null
  })()

  const nameError = touched.name && !data.name.trim()
    ? 'O nome da escola é obrigatório'
    : undefined

  const slugError = (() => {
    if (touched.slug && !data.slug) return 'O slug é obrigatório'
    if (data.slug && data.slug.length < 3) return 'Mínimo 3 caracteres'
    if (data.slug && !/^[a-z0-9-]+$/.test(data.slug)) return 'Use apenas letras minúsculas, números e hífen'
    if (slugCheck.status === 'unavailable') {
      const s = slugCheck as Extract<SlugCheckResult, { status: 'unavailable' }>
      return `Este slug já está em uso.${s.suggestion ? ` Que tal '${s.suggestion}'?` : ''}`
    }
    return undefined
  })()

  const urlError = touched.url && data.url && !data.url.startsWith('https://')
    ? 'URL deve começar com https://'
    : undefined

  const slugHint = !slugError && data.slug
    ? `Seu painel ficará em: tracking.colegiomentoria.com.br/${data.slug}`
    : undefined

  const urlHint = !urlError
    ? 'Usamos para associar eventos do GTM ao seu domínio'
    : undefined

  return (
    <section aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="text-h2 font-semibold text-fg-on-dark mb-1">
        Sua Escola
      </h2>
      <p className="text-body-md text-fg-on-dark-muted mb-6">
        Vamos configurar a identidade da sua escola no painel de tracking.
      </p>

      <div className="flex flex-col gap-4">
        {/* Nome */}
        <Field
          id={`${uid}-nome`}
          label="Nome da escola"
          type="text"
          required
          placeholder="Ex: Colégio Alfa, Cursinho Beta Vestibulares"
          value={data.name}
          onChange={(e) => handleNameChange(e.target.value)}
          onBlur={() => onBlur('name')}
          error={nameError}
        />

        {/* Slug */}
        <Field
          id={`${uid}-slug`}
          label="Identificador (slug)"
          type="text"
          required
          placeholder="colegio-alfa"
          value={data.slug}
          onChange={(e) => handleSlugInputChange(e.target.value)}
          onBlur={handleSlugBlur}
          error={slugError}
          hint={slugHint}
          suffix={slugSuffix}
        />

        {/* URL */}
        <Field
          id={`${uid}-url`}
          label="URL do seu site (opcional)"
          type="url"
          placeholder="https://colegio.com.br"
          value={data.url}
          onChange={(e) => setData((d) => ({ ...d, url: e.target.value }))}
          onBlur={() => onBlur('url')}
          error={urlError}
          hint={urlHint}
        />

        {/* Logo */}
        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-fg-on-dark-muted">
            Logo da escola (opcional)
          </span>
          <DropZone
            id={`${uid}-logo`}
            onFile={handleLogoFile}
            onRemove={handleLogoRemove}
            previewUrl={data.logoUrl}
            loading={uploadLoading}
            error={uploadError ?? undefined}
          />
          {!data.logoUrl && !uploadLoading && (
            <button
              type="button"
              className="self-start text-caption text-fg-on-dark-subtle hover:text-fg-on-dark transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-green rounded"
            >
              Adicionar logo depois
            </button>
          )}
        </div>

        {/* Cor do painel */}
        <div className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-fg-on-dark-muted">
            Cor principal do painel
          </span>
          <div className="flex items-center gap-3 flex-wrap" role="radiogroup" aria-label="Cor principal do painel">
            {COLOR_PRESETS.map((c, i) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={colorIdx === i && !customColor}
                aria-label={c.label}
                onClick={() => { setColorIdx(i); setCustomColor('') }}
                className={`h-8 w-8 rounded-full ${c.bg} transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green ${
                  colorIdx === i && !customColor
                    ? 'ring-2 ring-white/60 ring-offset-2 ring-offset-transparent scale-110'
                    : 'hover:scale-105'
                }`}
              />
            ))}
            {/* Cor customizada */}
            <div className="flex items-center gap-2">
              <input
                type="color"
                id={`${uid}-custom-color`}
                value={customColor || COLOR_PRESETS[colorIdx].value}
                onChange={(e) => { setCustomColor(e.target.value) }}
                aria-label="Outra cor"
                className="h-8 w-8 rounded-full cursor-pointer border-2 border-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
              />
              <label htmlFor={`${uid}-custom-color`} className="text-caption text-fg-on-dark-subtle cursor-pointer">
                Outra cor
              </label>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
