import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware'

const inputSchema = z.object({
  amount: z.number().int().min(1).max(250_000),
  phone: z.string().regex(/^254\d{9}$/, 'Use a valid Kenyan number starting with 254'),
})

type DarajaResponse = {
  MerchantRequestID?: string
  CheckoutRequestID?: string
  ResponseCode?: string
  ResponseDescription?: string
  errorMessage?: string
}

function timestamp() {
  const d = new Date()
  const p = (v: number) => String(v).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
}

export const initiateMpesaDeposit = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const consumerKey = process.env['MPESA_CONSUMER_KEY']
    const consumerSecret = process.env['MPESA_CONSUMER_SECRET']
    const passkey = process.env['MPESA_PASSKEY']
    const shortcode = process.env['MPESA_SHORTCODE']
    const callbackToken = process.env['MPESA_CALLBACK_TOKEN']
    if (!consumerKey || !consumerSecret || !passkey || !shortcode || !callbackToken) {
      // Expected setup state — returned, not thrown, so the UI can explain it calmly.
      return { ok: false as const, message: 'M-Pesa deposits are not live yet: the merchant credentials still need to be added.' }
    }

    const base = process.env['MPESA_ENVIRONMENT'] === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke'
    const authResponse = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}` },
    })
    if (!authResponse.ok) return { ok: false as const, message: 'M-Pesa is unavailable right now. Please try again shortly.' }
    const auth = await authResponse.json() as { access_token?: string }
    if (!auth.access_token) return { ok: false as const, message: 'M-Pesa could not verify the merchant account.' }

    const now = timestamp()
    const callbackOrigin = process.env['MPESA_CALLBACK_ORIGIN'] ?? 'https://id-preview--e1473516-5933-4d88-9378-53199a0fe675.lovable.app'
    const response = await fetch(`${base}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: btoa(`${shortcode}${passkey}${now}`),
        Timestamp: now,
        TransactionType: 'CustomerPayBillOnline',
        Amount: data.amount,
        PartyA: data.phone,
        PartyB: shortcode,
        PhoneNumber: data.phone,
        CallBackURL: `${callbackOrigin}/api/public/mpesa-callback?token=${encodeURIComponent(callbackToken)}`,
        AccountReference: `MIFUGO-${context.userId.slice(0, 8)}`,
        TransactionDesc: 'Mifugo Farm wallet deposit',
      }),
    })
    const result = await response.json() as DarajaResponse
    if (!response.ok || result.ResponseCode !== '0' || !result.CheckoutRequestID) {
      console.error('M-Pesa STK request failed', result.ResponseDescription ?? result.errorMessage)
      return { ok: false as const, message: result.errorMessage ?? result.ResponseDescription ?? 'M-Pesa request failed' }
    }

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { error } = await supabaseAdmin.from('transactions').insert({
      user_id: context.userId,
      type: 'deposit',
      status: 'pending',
      amount_kes: data.amount,
      phone: data.phone,
      provider: 'mpesa',
      merchant_request_id: result.MerchantRequestID ?? null,
      checkout_request_id: result.CheckoutRequestID,
      metadata: { response_description: result.ResponseDescription ?? '' },
    })
    if (error) return { ok: false as const, message: 'Could not record the M-Pesa request' }
    return { ok: true as const, checkoutRequestId: result.CheckoutRequestID, message: 'Check your phone and enter your M-Pesa PIN' }
  })
