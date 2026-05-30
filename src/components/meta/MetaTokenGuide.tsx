/**
 * MetaTokenGuide — Step A do conector Meta Ads. Guia passo-a-passo de como
 * gerar um System User access token no Meta Business Manager (sem OAuth/app review).
 *
 * Collapsible: cada passo expande sob demanda. Copy pt-BR informal, prática —
 * o cliente vai seguir isso de verdade.
 */

import { useState } from 'react'
import { CaretDown, ArrowSquareOut, CheckCircle } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface Props {
  /** Avança pro step de colar o token. */
  onContinue: () => void
}

interface GuideStep {
  n: number
  title: string
  body: React.ReactNode
}

const BM_SETTINGS_URL = 'https://business.facebook.com/settings'
const BM_SYSTEM_USERS_URL = 'https://business.facebook.com/settings/system-users'

const STEPS: GuideStep[] = [
  {
    n: 1,
    title: 'Abrir as Configurações do Business Manager',
    body: (
      <>
        <p>
          Entre no Meta Business Manager da sua escola e vá em{' '}
          <strong>Configurações do Negócio</strong> (Business Settings). Você
          precisa ser <strong>administrador</strong> do Business Manager pra criar
          um usuário do sistema.
        </p>
        <a
          href={BM_SETTINGS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-2 text-body-sm text-brand-green hover:underline"
        >
          Abrir business.facebook.com/settings
          <ArrowSquareOut size={14} aria-hidden="true" />
        </a>
      </>
    ),
  },
  {
    n: 2,
    title: 'Criar (ou abrir) um Usuário do Sistema',
    body: (
      <>
        <p>
          No menu lateral, em <strong>Usuários</strong>, clique em{' '}
          <strong>Usuários do sistema</strong> (System Users) →{' '}
          <strong>Adicionar</strong>. Dê um nome tipo{' '}
          <code className="px-1 rounded bg-white/10 font-mono text-caption">
            mentoria-tracking
          </code>{' '}
          e escolha a função <strong>Admin</strong> (ou Funcionário, se preferir
          mais restrito).
        </p>
        <a
          href={BM_SYSTEM_USERS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-2 text-body-sm text-brand-green hover:underline"
        >
          Ir direto pra Usuários do sistema
          <ArrowSquareOut size={14} aria-hidden="true" />
        </a>
      </>
    ),
  },
  {
    n: 3,
    title: 'Dar acesso à sua conta de anúncios',
    body: (
      <p>
        Com o usuário do sistema selecionado, clique em{' '}
        <strong>Adicionar ativos</strong> (Add Assets) →{' '}
        <strong>Contas de anúncios</strong>, marque a conta de anúncios da sua
        escola e ative o <strong>Controle total</strong> (Manage). Sem isso o token
        não enxerga a conta nem o pixel.
      </p>
    ),
  },
  {
    n: 4,
    title: 'Gerar o token com as permissões certas',
    body: (
      <>
        <p>
          Ainda no usuário do sistema, clique em{' '}
          <strong>Gerar novo token</strong> (Generate New Token). Selecione o app
          (qualquer app do seu BM serve) e marque <strong>exatamente</strong> estas
          permissões:
        </p>
        <ul className="mt-2 space-y-1">
          {['ads_read', 'ads_management'].map((scope) => (
            <li key={scope} className="flex items-center gap-2 text-body-sm">
              <CheckCircle size={15} weight="fill" className="text-brand-green" aria-hidden="true" />
              <code className="px-1 rounded bg-white/10 font-mono text-caption">{scope}</code>
            </li>
          ))}
        </ul>
        <p className="mt-2">
          <strong>Importante:</strong> em <em>Expiração do token</em>, escolha{' '}
          <strong>Nunca</strong> (token de longa duração). Assim a conexão não cai
          sozinha depois de 60 dias.
        </p>
      </>
    ),
  },
  {
    n: 5,
    title: 'Copiar o token',
    body: (
      <p>
        O Meta mostra o token <strong>uma única vez</strong>. Copie e cole no
        próximo passo aqui. Se perder, é só gerar outro — não tem problema. O token
        é cifrado no nosso banco e <strong>nunca</strong> aparece de volta na tela.
      </p>
    ),
  },
]

export function MetaTokenGuide({ onContinue }: Props) {
  // Step 1 começa aberto pra dar o pontapé.
  const [open, setOpen] = useState<Set<number>>(new Set([1]))

  function toggle(n: number) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 space-y-4">
      <div>
        <h3 className="text-h6 font-semibold text-fg-on-dark">
          Como gerar seu token do Meta
        </h3>
        <p className="text-body-sm text-fg-on-dark-muted mt-1">
          Sem login complicado nem aprovação de app: você gera um token de
          “Usuário do sistema” no Business Manager e cola aqui. Leva ~3 minutos.
        </p>
      </div>

      <ol className="space-y-2">
        {STEPS.map((s) => {
          const isOpen = open.has(s.n)
          return (
            <li
              key={s.n}
              className="rounded-md border border-white/10 bg-white/[0.02] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggle(s.n)}
                aria-expanded={isOpen}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 text-left',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-green',
                  'hover:bg-white/[0.03] transition-colors',
                )}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-green/15 text-caption font-semibold text-brand-green">
                  {s.n}
                </span>
                <span className="flex-1 text-body-sm font-medium text-fg-on-dark">
                  {s.title}
                </span>
                <CaretDown
                  size={16}
                  className={cn(
                    'shrink-0 text-fg-on-dark-muted transition-transform',
                    isOpen && 'rotate-180',
                  )}
                  aria-hidden="true"
                />
              </button>
              {isOpen && (
                <div className="px-4 pb-4 pl-13 text-body-sm text-fg-on-dark-muted leading-relaxed [&_strong]:text-fg-on-dark [&_a]:break-all">
                  {s.body}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      <div className="flex justify-end pt-2">
        <Button variant="primary" onClick={onContinue}>
          Já gerei meu token — continuar
        </Button>
      </div>
    </div>
  )
}
