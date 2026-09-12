import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

const phoneSchema = z.string().regex(/^254\d{9}$/, 'Use a valid Kenyan number starting with 254')

type PrivateRpcClient = {
  schema: (name: string) => {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  }
}

export const getFarmData = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [profile, packages, investments, transactions, commissions, roles] = await Promise.all([
      context.supabase.from('profiles').select('*').eq('id', context.userId).maybeSingle(),
      context.supabase.from('packages').select('*').eq('is_active', true).order('display_order'),
      context.supabase.from('investments').select('*, packages(*)').eq('user_id', context.userId).order('started_at', { ascending: false }),
      context.supabase.from('transactions').select('*').eq('user_id', context.userId).order('created_at', { ascending: false }).limit(30),
      context.supabase.from('referral_commissions').select('*').eq('earner_id', context.userId).order('created_at', { ascending: false }),
      context.supabase.from('user_roles').select('role').eq('user_id', context.userId),
    ])
    const error = [profile.error, packages.error, investments.error, transactions.error, commissions.error, roles.error].find(Boolean)
    if (error) throw new Error(error.message)
    return { profile: profile.data, packages: packages.data ?? [], investments: investments.data ?? [], transactions: transactions.data ?? [], commissions: commissions.data ?? [], isAdmin: roles.data?.some((r) => r.role === 'admin') ?? false }
  })

export const createProfile = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.string().email(), phone: phoneSchema, displayName: z.string().min(2).max(80), referralCode: z.string().max(20).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: profile, error } = await (supabaseAdmin as unknown as PrivateRpcClient).schema('private').rpc('ensure_my_profile', { _user_id: context.userId, _email: data.email, _phone: data.phone, _display_name: data.displayName, _referral_code: data.referralCode || null })
    if (error) throw new Error(error.message)
    return profile
  })

export const buyPackage = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ packageId: z.number().int().positive() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: id, error } = await (supabaseAdmin as unknown as PrivateRpcClient).schema('private').rpc('purchase_package', { _user_id: context.userId, _package_id: data.packageId })
    if (error) throw new Error(error.message)
    return { id }
  })

export const collectFarmIncome = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: balance, error } = await (supabaseAdmin as unknown as PrivateRpcClient).schema('private').rpc('collect_income', { _user_id: context.userId })
    if (error) throw new Error(error.message)
    return { balance }
  })

export const withdrawFunds = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ amount: z.number().positive(), phone: phoneSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data: id, error } = await (supabaseAdmin as unknown as PrivateRpcClient).schema('private').rpc('request_withdrawal', { _user_id: context.userId, _amount: data.amount, _phone: data.phone })
    if (error) throw new Error(error.message)
    return { id }
  })

export const updateMyProfile = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ phone: phoneSchema, displayName: z.string().min(2).max(80), avatarAnimal: z.string().max(30) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from('profiles').update({ phone: data.phone, display_name: data.displayName, avatar_animal: data.avatarAnimal }).eq('id', context.userId)
    if (error) throw new Error(error.message)
    return { ok: true }
  })
