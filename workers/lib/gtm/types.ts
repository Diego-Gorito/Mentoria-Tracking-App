/**
 * Types pra integração com Google Tag Manager API v2.
 *
 * Spec: https://developers.google.com/tag-manager/api/v2/reference
 * Spec interna: ADR-0009 §5 (endpoint contract).
 *
 * NOTA: GTM API tem mais campos que estes — incluímos só os usados pelo
 * fluxo de provision (clone + parametrize + publish).
 */

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** Service Account credentials carregadas do JSON key. */
export interface GtmServiceAccountKey {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

/** Scopes do GTM API. */
export const GTM_SCOPES = {
  readonly: 'https://www.googleapis.com/auth/tagmanager.readonly',
  editContainers: 'https://www.googleapis.com/auth/tagmanager.edit.containers',
  editContainerVersions:
    'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
  publish: 'https://www.googleapis.com/auth/tagmanager.publish',
  manageUsers: 'https://www.googleapis.com/auth/tagmanager.manage.users',
} as const;

export type GtmScope = (typeof GTM_SCOPES)[keyof typeof GTM_SCOPES];

// ─── Container ────────────────────────────────────────────────────────────────

/** Resposta da GTM API para containers. */
export interface GtmContainer {
  path: string;
  accountId: string;
  containerId: string; // '253664662' — interno
  name: string;
  publicId: string; // 'GTM-XXXXXXX' — visível
  usageContext: ('web' | 'server' | 'android' | 'ios' | 'amp')[];
  fingerprint?: string;
  tagManagerUrl?: string;
}

export interface GtmWorkspace {
  path: string;
  accountId: string;
  containerId: string;
  workspaceId: string;
  name: string;
  description?: string;
  fingerprint?: string;
}

// ─── Entities (Tag, Variable, Trigger, Template, Client) ──────────────────────

export interface GtmParameter {
  type: 'template' | 'boolean' | 'integer' | 'list' | 'map' | 'tagReference';
  key?: string;
  value?: string;
  list?: GtmParameter[];
  map?: GtmParameter[];
}

export interface GtmTag {
  path?: string;
  accountId?: string;
  containerId?: string;
  workspaceId?: string;
  tagId?: string;
  name: string;
  type: string; // 'html', 'cvt_XXX', 'baut', 'gaawe', 'googtag', etc.
  parameter?: GtmParameter[];
  firingTriggerId?: string[];
  blockingTriggerId?: string[];
  paused?: boolean;
  priority?: GtmParameter;
  tagFiringOption?: 'oncePerEvent' | 'oncePerLoad' | 'unlimited';
  consentSettings?: {
    consentStatus?: 'notSet' | 'needed' | 'notNeeded';
    consentType?: GtmParameter;
  };
  monitoringMetadata?: GtmParameter;
  fingerprint?: string;
}

export interface GtmVariable {
  path?: string;
  accountId?: string;
  containerId?: string;
  workspaceId?: string;
  variableId?: string;
  name: string;
  type: string; // 'c' (constant), 'v' (data layer), 'jsm', 'k' (cookie), etc.
  parameter?: GtmParameter[];
  notes?: string;
  fingerprint?: string;
  enablingTriggerId?: string[];
  disablingTriggerId?: string[];
}

export interface GtmTrigger {
  path?: string;
  accountId?: string;
  containerId?: string;
  workspaceId?: string;
  triggerId?: string;
  name: string;
  type: string; // 'pageview','domReady','customEvent','click','linkClick','formSubmission', etc.
  customEventFilter?: GtmParameter[];
  filter?: GtmParameter[];
  autoEventFilter?: GtmParameter[];
  waitForTags?: GtmParameter;
  checkValidation?: GtmParameter;
  waitForTagsTimeout?: GtmParameter;
  uniqueTriggerId?: GtmParameter;
  fingerprint?: string;
}

export interface GtmCustomTemplate {
  path?: string;
  accountId?: string;
  containerId?: string;
  workspaceId?: string;
  templateId?: string;
  name: string;
  templateData: string; // formato proprietário GTM (sections ___INFO___ etc)
  galleryReference?: {
    host: string;
    owner: string;
    repository: string;
    version: string;
    signature: string;
    galleryTemplateId?: string;
  };
  fingerprint?: string;
}

export interface GtmClient {
  path?: string;
  accountId?: string;
  containerId?: string;
  workspaceId?: string;
  clientId?: string;
  name: string;
  type: string; // 'gaaw_client', 'cvt_XXX' (custom client)
  parameter?: GtmParameter[];
  priority?: number;
  fingerprint?: string;
}

// ─── Version + Publish ────────────────────────────────────────────────────────

export interface GtmContainerVersion {
  path?: string;
  accountId?: string;
  containerId?: string;
  containerVersionId: string;
  name?: string;
  description?: string;
  fingerprint?: string;
  deleted?: boolean;
  published?: boolean;
  // Counts of nested entities (não retorna lista completa em todos endpoints)
  tag?: GtmTag[];
  variable?: GtmVariable[];
  trigger?: GtmTrigger[];
  customTemplate?: GtmCustomTemplate[];
  client?: GtmClient[];
}

// ─── Request shapes (input pra nossos métodos) ────────────────────────────────

/** Input pra clone de master → tenant container. */
export interface CloneContainerInput {
  sourceAccountId: string;
  sourceContainerId: string;
  sourceWorkspaceId: string;
  targetAccountId: string;
  targetContainerId: string;
  targetWorkspaceId: string;
  /** Callback p/ progress tracking (SSE). */
  onProgress?: (step: CloneStep, detail?: string) => void;
}

export type CloneStep =
  | 'init'
  | 'copy_variables'
  | 'copy_triggers'
  | 'copy_templates'
  | 'copy_clients'
  | 'copy_tags'
  | 'remap_references'
  | 'complete';

export interface CloneResult {
  copiedCounts: {
    variables: number;
    triggers: number;
    templates: number;
    clients: number;
    tags: number;
  };
  /** Mapping de IDs source → target (pra debug + remap downstream). */
  idMap: {
    variables: Map<string, string>;
    triggers: Map<string, string>;
    templates: Map<string, string>;
    clients: Map<string, string>;
    tags: Map<string, string>;
  };
}
