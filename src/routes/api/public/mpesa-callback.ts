import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const callbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string().optional(),
      CheckoutRequestID: z.string(),
      ResultCode: z.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z.object({ Item: z.array(z.object({ Name: z.string(), Value: z.union([z.string(), z.number()]).optional() })) }).optional(),
    }),
  }),
})

type PrivateRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
}

export const Route = createFileRoute('/api/public/mpesa-callback')({
  server: { handlers: { POST: async ({ request }) => {
    const url = new URL(request.url)
    const expected = process.env['MPESA_CALLBACK_TOKEN']
    if (!expected || url.searchParams.get('token') !== expected) return new Response('Unauthorized', { status: 401 })
    const parsed = callbackSchema.safeParse(await request.json())
    if (!parsed.success) return new Response('Invalid callback', { status: 400 })
    const cb = parsed.data.Body.stkCallback
    const metadata = Object.fromEntries((cb.CallbackMetadata?.Item ?? []).map((item) => [item.Name, item.Value ?? null]))
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const rpc = supabaseAdmin as unknown as PrivateRpcClient
    const operation = cb.ResultCode === 0
      ? rpc.rpc('srv_complete_mpesa_deposit', {
          _checkout_request_id: cb.CheckoutRequestID,
          _receipt: String(metadata['MpesaReceiptNumber'] ?? ''),
          _amount: Number(metadata['Amount'] ?? 0),
          _phone: String(metadata['PhoneNumber'] ?? ''),
          _metadata: { merchant_request_id: cb.MerchantRequestID ?? '', result_code: cb.ResultCode },
        })
      : rpc.rpc('srv_fail_mpesa_deposit', {
          _checkout_request_id: cb.CheckoutRequestID,
          _reason: cb.ResultDesc,
          _metadata: { merchant_request_id: cb.MerchantRequestID ?? '', result_code: cb.ResultCode },
        })
    const { error } = await operation
    if (error) { console.error('M-Pesa callback processing failed', error.message); return new Response('Processing failed', { status: 500 }) }
    return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  } } },
})
