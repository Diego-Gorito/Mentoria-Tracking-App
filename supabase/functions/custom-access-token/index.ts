// custom-access-token/index.ts — Supabase Custom Access Token Hook
// ADR-0085 v1.1 (ERP) + ADR-0007 v1.2 Fase 3 (Tracking)
//
// Enriquece JWT com claims customizadas necessarias pra RLS cross-product:
//   tenant_id       — uuid do tenant ativo do usuario
//   products        — array de produtos habilitados ex: ['tracking']
//   current_product — produto ativo nesta sessao (ex: 'tracking')
//   tracking_role   — 'mentoria_tracking_role' se usuario tem produto tracking
//   erp_role        — 'mentoria_erp_role' se usuario tem produto erp
//
// Runtime: Deno (Supabase Edge Functions — unica excecao REGRA #-2 Cloudflare-Last)
//
// Nota: este arquivo reside em Mentoria-Tracking-App por agora.
// Quando ERP-Mentoria tiver repo proprio de Edge Functions, mover pra la
// (hook e compartilhado cross-product per ADR-0085 §2.6).

import { createClient } from 'jsr:@supabase/supabase-js@2'

interface HookEvent {
  user_id: string
  claims: Record<string, unknown>
  metadata?: {
    current_product?: string
  }
}

interface UserTenantRow {
  tenant_id: string
}

interface UserProductRow {
  product: string
}

export default async function handler(event: HookEvent) {
  const { user_id, claims, metadata } = event

  // Admin client — service_role para leitura sem RLS
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  )

  // 1. Resolver tenant ativo do usuario (primeiro tenant por accepted_at ASC)
  const { data: tenantData, error: tenantErr } = await supabase
    .schema('core')
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user_id)
    .order('accepted_at', { ascending: true })
    .limit(1)
    .single<UserTenantRow>()

  if (tenantErr || !tenantData?.tenant_id) {
    // Usuario sem tenant — retorna claims basicas sem enrichment
    // (caso: usuario recem criado antes de provisionar tenant via onboarding)
    console.warn(`[custom-access-token] no tenant for user_id=${user_id}: ${tenantErr?.message}`)
    return {
      claims: {
        ...claims,
        tenant_id: null,
        products: [],
        current_product: null,
        tracking_role: null,
        erp_role: null,
      },
    }
  }

  const tenantId = tenantData.tenant_id

  // 2. Resolver produtos habilitados para este user/tenant
  // Usando core.tenant_users.role como proxy (Era 1 sem tabela dedicada user_products)
  // Era 2: criar core.user_products(user_id, tenant_id, product) para granularidade por produto.
  const { data: productsData } = await supabase
    .schema('core')
    .from('tenant_users')
    .select('role')
    .eq('user_id', user_id)
    .eq('tenant_id', tenantId)
    .limit(1)

  // Era 1: user que tem tenant automaticamente tem acesso a 'tracking' (produto unico)
  // Era 2: adicionar logica por produto quando houver mais produtos
  const products: string[] = productsData && productsData.length > 0 ? ['tracking'] : []

  // 3. Produto ativo na sessao:
  // Ordem de precedencia:
  //   a) metadata.current_product (do refreshSession chamado pelo frontend)
  //   b) primeiro produto da lista
  //   c) null (usuario sem produtos)
  const currentProduct: string | null =
    metadata?.current_product
    ?? products[0]
    ?? null

  return {
    claims: {
      ...claims,
      tenant_id: tenantId,
      products,
      current_product: currentProduct,
      // Roles Postgres por produto — usados por core.current_product() + RLS policies (ADR-0085)
      tracking_role: products.includes('tracking') ? 'mentoria_tracking_role' : null,
      erp_role: products.includes('erp') ? 'mentoria_erp_role' : null,
    },
  }
}
