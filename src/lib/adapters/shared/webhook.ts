import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Generic signed-webhook verification, shared by any adapter that would
 * receive provider callbacks in a `live` implementation (KYC decisions,
 * payment settlement). Not wired to a route in this demo — no webhook
 * receiver exists yet because no live provider does either — but the
 * contract is here so a future adapter doesn't invent its own.
 */
export function verifyWebhookSignature(params: {
  rawBody: string
  signatureHeader: string
  secret: string
}): boolean {
  const { rawBody, signatureHeader, secret } = params
  if (!secret || !signatureHeader) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  const actualBuf = Buffer.from(signatureHeader, 'hex')
  if (expectedBuf.length !== actualBuf.length) return false
  return timingSafeEqual(expectedBuf, actualBuf)
}
