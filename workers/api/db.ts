// db.ts — Supabase JS client wrapper
// Supabase rebase (Fase 3 — ADR-0007 v1.2)
// Substitui pool pg KV2 por @supabase/supabase-js.
//
// Dois clientes:
//   supabaseAdmin — service_role (bypassa RLS — usar em operacoes internas)
//   supabaseAnon  — anon key (respeita RLS — usar com JWT do usuario)
//
// LGPD: sem dados sensíveis em logs.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) throw new Error('[db] SUPABASE_URL env var não configurado')
if (!SUPABASE_ANON_KEY) throw new Error('[db] SUPABASE_ANON_KEY env var não configurado')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('[db] SUPABASE_SERVICE_ROLE_KEY env var não configurado')

// Admin client — bypassa RLS (service_role). Usar apenas para operacoes
// que precisam de acesso irrestrito (ex: criar tenant, provisionar credenciais).
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Anon client — base pra criar clientes com JWT do usuario.
// Nao usar diretamente — usar createUserClient(jwt) ou supabaseAdmin.
export const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Criar cliente com JWT do usuario para respeitar RLS (multi-tenant isolation).
// O JWT emitido pelo Supabase Auth ja carrega tenant_id + products via Custom
// Access Token Hook (ADR-0085).
export function createUserClient(accessToken: string) {
  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}

// Helper: executar RPC com admin client (sem RLS).
export async function rpcAdmin<T = unknown>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T | null> {
  const { data, error } = await supabaseAdmin.rpc(fn, args)
  if (error) throw new Error(`[db] rpc ${fn} error: ${error.message}`)
  return (data as T) ?? null
}

// Helper: buscar primeira linha de tabela/view com admin client.
export async function selectOneAdmin<T = Record<string, unknown>>(
  table: string,
  match: Record<string, unknown>,
): Promise<T | null> {
  const query = supabaseAdmin.from(table).select()
  const entries = Object.entries(match)
  let q = query
  for (const [col, val] of entries) {
    q = q.eq(col, val as string)
  }
  const { data, error } = await q.limit(1).single()
  if (error && error.code !== 'PGRST116') {
    throw new Error(`[db] selectOneAdmin ${table} error: ${error.message}`)
  }
  return (data as T) ?? null
}
