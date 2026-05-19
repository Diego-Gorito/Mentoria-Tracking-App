// DropZone.tsx — área drag-and-drop para upload de imagem (WCAG AA)
// Sem react-dropzone: usa HTML5 DragEvent API nativo.
// Fallback <input type="file"> sempre disponível para teclado.
// Erros: role="alert" inline antes do upload (validação client-side).

import { useRef, useState } from 'react'
import { ImageSquare, ArrowUp } from '@phosphor-icons/react'
import { Button } from './Button'
import { cn } from '@/lib/utils'

const MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2 MB per spec
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml']
const ACCEPTED_MIME = ACCEPTED_TYPES.join(',')

type Props = {
  id: string
  onFile: (file: File, previewUrl: string) => void
  onRemove: () => void
  previewUrl: string | null
  loading?: boolean
  error?: string
  className?: string
}

export function DropZone({
  id,
  onFile,
  onRemove,
  previewUrl,
  loading = false,
  error,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  const displayError = error ?? clientError

  function validateAndEmit(file: File) {
    setClientError(null)
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setClientError('Formato não suportado. Use PNG, JPG ou SVG.')
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setClientError('Arquivo muito grande. Máximo 2 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      if (ev.target?.result) onFile(file, ev.target.result as string)
    }
    reader.readAsDataURL(file)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) validateAndEmit(file)
    // reset input so same file can be re-selected
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndEmit(file)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave() {
    setDragging(false)
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Área drag-and-drop */}
      {!previewUrl && !loading && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Área de upload de logo. Clique ou arraste um arquivo."
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
          className={cn(
            'border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-3 cursor-pointer',
            'transition-colors duration-base',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green',
            dragging
              ? 'border-brand-green/50 bg-brand-green/[0.04]'
              : 'border-white/20 bg-white/[0.02] hover:bg-white/[0.04]',
          )}
        >
          <ImageSquare
            size={32}
            weight="duotone"
            aria-hidden="true"
            className="text-fg-on-dark-subtle"
            style={{ '--phosphor-duotone-secondary-opacity': '0.35' } as React.CSSProperties}
          />
          <div className="text-center">
            <p className="text-body-sm text-fg-on-dark">
              Arraste seu logo aqui,{' '}
              <span className="text-brand-green underline underline-offset-2">ou escolha um arquivo</span>
            </p>
            <p className="text-caption text-fg-on-dark-subtle mt-0.5">PNG, JPG ou SVG — até 2 MB</p>
          </div>
          <ArrowUp size={16} weight="bold" aria-hidden="true" className="text-fg-on-dark-subtle" />
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="h-16 w-16 rounded-lg animate-pulse bg-white/[0.08]" aria-label="Enviando logo..." />
      )}

      {/* Preview após upload */}
      {previewUrl && !loading && (
        <div className="flex items-center gap-3">
          <img
            src={previewUrl}
            alt="Preview do logo da escola"
            className="h-16 w-16 rounded-lg object-contain border border-white/10 bg-white/[0.04]"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              Trocar imagem
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="text-red-400 hover:text-red-300"
              onClick={() => {
                onRemove()
                setClientError(null)
              }}
            >
              Remover
            </Button>
          </div>
        </div>
      )}

      {/* Input file real — sempre presente (a11y) */}
      <input
        ref={inputRef}
        type="file"
        id={id}
        accept={ACCEPTED_MIME}
        aria-label="Upload de logo da escola"
        className="sr-only"
        onChange={handleInputChange}
      />

      {/* Erros (client-side + server) */}
      {displayError && (
        <p role="alert" className="text-caption text-red-400">
          {displayError}
        </p>
      )}
    </div>
  )
}
