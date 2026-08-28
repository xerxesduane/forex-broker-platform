import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyWebhookSignature } from './webhook'

const secret = 'test-secret'
const rawBody = JSON.stringify({ event: 'deposit.confirmed', amount: 100 })

function sign(body: string, key: string) {
  return createHmac('sha256', key).update(body).digest('hex')
}

describe('verifyWebhookSignature', () => {
  it('accepts a correctly signed payload', () => {
    const signatureHeader = sign(rawBody, secret)
    expect(verifyWebhookSignature({ rawBody, signatureHeader, secret })).toBe(true)
  })

  it('rejects a payload signed with the wrong secret', () => {
    const signatureHeader = sign(rawBody, 'wrong-secret')
    expect(verifyWebhookSignature({ rawBody, signatureHeader, secret })).toBe(false)
  })

  it('rejects a tampered body', () => {
    const signatureHeader = sign(rawBody, secret)
    const tamperedBody = JSON.stringify({ event: 'deposit.confirmed', amount: 999999 })
    expect(verifyWebhookSignature({ rawBody: tamperedBody, signatureHeader, secret })).toBe(false)
  })

  it('rejects a missing signature or secret', () => {
    expect(verifyWebhookSignature({ rawBody, signatureHeader: '', secret })).toBe(false)
    expect(
      verifyWebhookSignature({ rawBody, signatureHeader: sign(rawBody, secret), secret: '' }),
    ).toBe(false)
  })
})
