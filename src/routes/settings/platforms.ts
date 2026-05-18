// platforms.ts — config das 6 integracoes MVP
// Cada plataforma define: label, descricao, emoji, docs URL, fields (form modal)
// PT-BR. Estavel: providerIds usados como chave em localStorage + tenant_credentials.

export type PlatformId =
  | 'meta_capi'
  | 'hotmart'
  | 'gtm'
  | 'chatwoot'
  | 'pinterest_capi'
  | 'google_ads'

export type FieldSpec = {
  key: string
  label: string
  placeholder?: string
  defaultValue?: string
  hint?: string
  help?: string
  required?: boolean
  secret?: boolean
  copyable?: boolean
  readOnly?: boolean
}

export type PlatformMeta = {
  label: string
  emoji: string
  description: string
  docs: string
  fields: FieldSpec[]
}

export const PLATFORM_ORDER: PlatformId[] = [
  'meta_capi',
  'hotmart',
  'gtm',
  'chatwoot',
  'pinterest_capi',
  'google_ads',
]

export const PLATFORM_META: Record<PlatformId, PlatformMeta> = {
  meta_capi: {
    label: 'Meta',
    emoji: '📘',
    description: 'Captura conversoes via Conversions API.',
    docs: 'https://developers.facebook.com/docs/marketing-api/conversions-api',
    fields: [
      {
        key: 'pixel_id',
        label: 'Pixel ID',
        placeholder: '1234567890123456',
        required: true,
        help: 'Acesse Eventos -> Gerenciador de Eventos -> Selecione seu pixel. O ID aparece no topo da pagina.',
      },
      {
        key: 'access_token',
        label: 'Access Token (System User)',
        placeholder: 'EAAxxxxxxxxxxxxxxxx',
        required: true,
        secret: true,
        help: 'Business Manager -> Configuracoes do negocio -> Usuarios -> Usuarios do sistema -> Gerar token. Permissoes: ads_management + business_management.',
      },
      {
        key: 'ad_account_id',
        label: 'Ad Account ID',
        placeholder: 'act_1234567890',
        required: true,
        help: 'Gerenciador de Anuncios -> Configuracoes da conta. Inclua o prefixo "act_".',
      },
    ],
  },
  hotmart: {
    label: 'Hotmart',
    emoji: '🛒',
    description: 'Recebe webhooks de compras + Hottok.',
    docs: 'https://developers.hotmart.com/docs/en/webhook',
    fields: [
      {
        key: 'hottok',
        label: 'Hottok',
        placeholder: 'aBcDeFgHiJkL1234',
        required: true,
        secret: true,
        help: 'Hotmart -> Ferramentas -> Webhooks -> Hottok. Use o mesmo Hottok em todos os produtos da conta.',
      },
      {
        key: 'webhook_url_secondary',
        label: 'URL secundaria (Hotmart)',
        defaultValue: 'https://webhooks.colegiomentoria.com.br/track/hotmart',
        readOnly: true,
        copyable: true,
        hint: 'Cole esta URL no campo "URL secundaria" do webhook Hotmart.',
      },
    ],
  },
  gtm: {
    label: 'GTM + sGTM',
    emoji: '🏷️',
    description: 'Container Web + Server-side self-hosted.',
    docs: 'https://developers.google.com/tag-platform/tag-manager/server-side',
    fields: [
      {
        key: 'container_web',
        label: 'Container ID Web',
        placeholder: 'GTM-XXXXXXX',
        required: true,
        help: 'Tag Manager -> Workspace -> ID do container Web (formato GTM-XXXXXXX).',
      },
      {
        key: 'container_server',
        label: 'Container ID Server',
        placeholder: 'GTM-YYYYYYY',
        required: true,
        help: 'Tag Manager -> Workspace -> Container Server (precisa ser sGTM self-hosted, nao Stape).',
      },
    ],
  },
  chatwoot: {
    label: 'Chatwoot',
    emoji: '💬',
    description: 'Score de leads via eventos de atendimento.',
    docs: 'https://www.chatwoot.com/docs/product/others/webhooks',
    fields: [
      {
        key: 'account_id',
        label: 'Account ID',
        placeholder: '12345',
        required: true,
        help: 'Chatwoot -> Configuracoes do perfil -> Account ID (no menu superior direito).',
      },
      {
        key: 'api_token',
        label: 'API Token',
        placeholder: 'cwt_xxxxxxxxxxxxxx',
        required: true,
        secret: true,
        help: 'Chatwoot -> Perfil -> Access Token -> Gerar token. Salve no cofre do gerenciador de senhas.',
      },
      {
        key: 'webhook_url',
        label: 'Webhook URL (use em Chatwoot)',
        defaultValue: 'https://webhooks.colegiomentoria.com.br/track/chatwoot',
        readOnly: true,
        copyable: true,
        hint: 'Cole esta URL em Integrations -> Webhooks no Chatwoot.',
      },
    ],
  },
  pinterest_capi: {
    label: 'Pinterest',
    emoji: '📌',
    description: 'Conversions API do Pinterest.',
    docs: 'https://developers.pinterest.com/docs/conversions/conversion-management/',
    fields: [
      {
        key: 'ad_account_id',
        label: 'Ad Account ID',
        placeholder: '549123456789',
        required: true,
        help: 'Pinterest Ads -> Conta de anuncios -> Detalhes. O ID tem 12+ digitos.',
      },
      {
        key: 'access_token',
        label: 'Access Token',
        placeholder: 'pina_xxxxxxxxxxxxxx',
        required: true,
        secret: true,
        help: 'Pinterest Business -> Apps & API -> Acesso a API -> Gerar token. Permissoes: ads:read + conversions:read.',
      },
    ],
  },
  google_ads: {
    label: 'Google Ads',
    emoji: '📊',
    description: 'Enhanced Conversions via GTM tag (sem Developer Token).',
    docs: 'https://support.google.com/google-ads/answer/9888656',
    fields: [
      {
        key: 'conversion_id',
        label: 'Conversion ID',
        placeholder: 'AW-123456789',
        required: true,
        help: 'Google Ads -> Ferramentas -> Conversoes -> Acoes -> Tag. Formato AW-XXXXXXXXX.',
      },
      {
        key: 'conversion_label',
        label: 'Conversion Label',
        placeholder: 'abCdEfGhIjK_lMnOpQ',
        required: true,
        help: 'Mesma tela acima -> Detalhes do evento -> Conversion Label (alfanumerico).',
      },
    ],
  },
}
