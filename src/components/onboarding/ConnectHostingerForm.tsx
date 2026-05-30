/**
 * ConnectHostingerForm — form reutilizável pra conectar conta Hostinger.
 *
 * Extraído de `src/routes/sites/ConnectHostingerPage.tsx` pra ser reusado
 * no Wizard V2 Step 3 sem AppShell wrapper (wizard tem header próprio).
 *
 * Comportamento idêntico:
 *  - HostingerHelpAccordion no topo (defaultOpen passa via prop)
 *  - TokenInput (password com eye toggle, paste trim)
 *  - Apelido + senha WP admin opcionais
 *  - useHostingerAccount().connect() ao submit
 *  - Toast success/error
 *
 * Não inclui AppShell — caller renderiza em qualquer surface (modal, card,
 * tela wizard).
 */

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { HostingerHelpAccordion } from '@/components/sites/HostingerHelpAccordion';
import { TokenInput } from '@/components/sites/TokenInput';
import { useHostingerAccount } from '@/hooks/useHostingerAccount';
import { Plugs } from '@phosphor-icons/react';

interface Props {
  /**
   * Disparado após connect() success. Caller normalmente usa o próprio
   * `useHostingerAccount()` pra reagir à mudança de `account` — esse callback
   * é apenas um signal "deu certo, hora de transicionar UI".
   */
  onConnected?: () => void;
  /** Disparado se user clicar "pular" (renderizado quando `allowSkip=true`). */
  onSkip?: () => void;
  /** Mostra link "Pular esta etapa" — default false. */
  allowSkip?: boolean;
  /** Help accordion open por default — default true. */
  helpOpen?: boolean;
  /** Label do botão submit. Default "Validar e conectar". */
  submitLabel?: string;
  className?: string;
}

const MIN_TOKEN_LENGTH = 10;

export function ConnectHostingerForm({
  onConnected,
  onSkip,
  allowSkip = false,
  helpOpen = true,
  submitLabel = 'Validar e conectar',
  className,
}: Props) {
  const { connect, isConnecting } = useHostingerAccount();
  const { toast } = useToast();

  const [token, setToken] = useState('');
  const [label, setLabel] = useState('');
  const [wpAdminPass, setWpAdminPass] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTokenError(null);

    const trimmed = token.trim();
    if (trimmed.length === 0) {
      setTokenError('Cole seu token Hostinger pra continuar.');
      return;
    }
    if (trimmed.length < MIN_TOKEN_LENGTH) {
      setTokenError(`Token parece curto demais (mínimo ${MIN_TOKEN_LENGTH} caracteres).`);
      return;
    }

    try {
      await connect(trimmed, label.trim() || undefined, wpAdminPass.trim() || undefined);
      toast('Conta Hostinger conectada com sucesso.', 'success');
      // useHostingerAccount.connect() já atualizou o state interno do hook.
      // Caller usa `useHostingerAccount()` próprio pra reagir ao novo `account`.
      // Esse callback é só um signal "deu certo" pra side effects opcionais.
      onConnected?.();
    } catch (err) {
      // useHostingerAccount.connect() já traduz erro PT-BR via translateApiError.
      const message = err instanceof Error ? err.message : 'Falha ao conectar conta.';
      toast(message, 'error');
      // Mantém form intacto — user pode corrigir token e tentar de novo.
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={`flex flex-col gap-5 ${className ?? ''}`}
      aria-labelledby="connect-hostinger-form-heading"
    >
      <h2 id="connect-hostinger-form-heading" className="sr-only">
        Dados de conexão Hostinger
      </h2>

      <HostingerHelpAccordion defaultOpen={helpOpen} />

      <div className="rounded-xl border bg-white p-6 flex flex-col gap-5" style={{ borderColor: 'var(--app-card-border)' }}>
        {/* Apelido */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="hostinger-account-label-v2"
            className="text-body-sm font-medium text-fg-on-light"
          >
            Apelido (opcional)
          </label>
          <input
            id="hostinger-account-label-v2"
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={isConnecting}
            placeholder="Ex: Conta Pessoal"
            maxLength={80}
            className="w-full min-h-[44px] h-11 px-3 rounded-md border border-border-default bg-white text-body-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green disabled:bg-bg-muted disabled:cursor-not-allowed transition-colors"
          />
          <p className="text-caption text-fg-on-light-muted">
            Identifica essa conta na lista (útil se você gerencia múltiplas).
          </p>
        </div>

        <TokenInput
          value={token}
          onChange={(value) => {
            setToken(value);
            if (tokenError) setTokenError(null);
          }}
          error={tokenError ?? undefined}
          disabled={isConnecting}
          autoFocus
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="wp-admin-password-v2"
            className="text-body-sm font-medium text-fg-on-light"
          >
            Senha admin WordPress (opcional)
          </label>
          <input
            id="wp-admin-password-v2"
            type="password"
            value={wpAdminPass}
            onChange={(event) => setWpAdminPass(event.target.value)}
            disabled={isConnecting}
            autoComplete="off"
            spellCheck={false}
            className="w-full min-h-[44px] h-11 px-3 rounded-md border border-border-default bg-white text-body-sm text-brand-black focus:outline-none focus:ring-2 focus:ring-brand-green/40 focus:border-brand-green disabled:bg-bg-muted disabled:cursor-not-allowed transition-colors"
          />
          <p className="text-caption text-fg-on-light-muted">
            Necessária pra ativar o plugin GTM4WP via wp-admin REST. Você pode
            pular agora e fornecer site-a-site depois.
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
          {allowSkip && onSkip && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={onSkip}
              disabled={isConnecting}
            >
              Pular esta etapa
            </Button>
          )}
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={isConnecting}
            disabled={isConnecting}
          >
            <Plugs size={14} weight="bold" aria-hidden="true" />
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
