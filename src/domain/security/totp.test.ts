import { describe, expect, it } from 'vitest'
import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  generateRecoveryCodes,
  generateTotp,
  generateTotpSecret,
  hotp,
  verifyTotp,
} from './totp'

/** RFC 4226 Appendix D uses the ASCII secret "12345678901234567890". */
const RFC4226_SECRET = new TextEncoder().encode('12345678901234567890')

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64, 32, 16, 8])
    expect(Array.from(base32Decode(base32Encode(bytes)))).toEqual(Array.from(bytes))
  })

  it('matches RFC 4648 test vectors', () => {
    expect(base32Encode(new TextEncoder().encode('f'))).toBe('MY')
    expect(base32Encode(new TextEncoder().encode('fo'))).toBe('MZXQ')
    expect(base32Encode(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI')
  })

  it('tolerates lowercase, padding and whitespace in a pasted secret', () => {
    const encoded = base32Encode(new TextEncoder().encode('foobar'))
    const messy = `${encoded.toLowerCase().slice(0, 5)} ${encoded.toLowerCase().slice(5)}==`
    expect(Array.from(base32Decode(messy))).toEqual(Array.from(base32Decode(encoded)))
  })

  it('rejects a secret with an invalid character', () => {
    expect(() => base32Decode('MZXW6YTB01')).toThrow(/Invalid base32/)
  })
})

describe('hotp — RFC 4226 Appendix D test vectors', () => {
  const EXPECTED = [
    '755224',
    '287082',
    '359152',
    '969429',
    '338314',
    '254676',
    '287922',
    '162583',
    '399871',
    '520489',
  ]

  it.each(EXPECTED.map((code, counter) => [counter, code]))(
    'counter %i produces %s',
    (counter, expected) => {
      expect(hotp({ secret: RFC4226_SECRET, counter: counter as number })).toBe(expected)
    },
  )
})

describe('generateTotp — RFC 6238 test vectors (SHA-1)', () => {
  // RFC 6238 Appendix B, using the 20-byte ASCII seed above.
  const secret = base32Encode(RFC4226_SECRET)

  it.each([
    [59_000, '287082'],
    [1_111_111_109_000, '081804'],
    [1_111_111_111_000, '050471'],
    [1_234_567_890_000, '005924'],
    [2_000_000_000_000, '279037'],
  ])('at %i ms produces %s', (timestampMs, expected) => {
    expect(generateTotp({ secret, timestampMs: timestampMs as number })).toBe(expected)
  })
})

describe('verifyTotp', () => {
  const secret = generateTotpSecret()
  const now = 1_700_000_000_000

  it('accepts the current code', () => {
    const token = generateTotp({ secret, timestampMs: now })
    expect(verifyTotp({ secret, token, timestampMs: now })).toBe(true)
  })

  it('accepts a code from the previous window (clock drift)', () => {
    const token = generateTotp({ secret, timestampMs: now - 30_000 })
    expect(verifyTotp({ secret, token, timestampMs: now })).toBe(true)
  })

  it('accepts a code from the next window', () => {
    const token = generateTotp({ secret, timestampMs: now + 30_000 })
    expect(verifyTotp({ secret, token, timestampMs: now })).toBe(true)
  })

  it('rejects a code two windows old', () => {
    const token = generateTotp({ secret, timestampMs: now - 90_000 })
    expect(verifyTotp({ secret, token, timestampMs: now })).toBe(false)
  })

  it('rejects a code from a different secret', () => {
    const token = generateTotp({ secret: generateTotpSecret(), timestampMs: now })
    expect(verifyTotp({ secret, token, timestampMs: now })).toBe(false)
  })

  it('rejects malformed input without throwing', () => {
    for (const token of ['', '12345', '1234567', 'abcdef', '12 34 56 78']) {
      expect(verifyTotp({ secret, token, timestampMs: now })).toBe(false)
    }
  })

  it('tolerates a code the user pasted with a space in it', () => {
    const token = generateTotp({ secret, timestampMs: now })
    const spaced = `${token.slice(0, 3)} ${token.slice(3)}`
    expect(verifyTotp({ secret, token: spaced, timestampMs: now })).toBe(true)
  })
})

describe('generateTotpSecret', () => {
  it('produces a 32-character base32 secret (160 bits)', () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
  })

  it('does not repeat', () => {
    const secrets = new Set(Array.from({ length: 50 }, () => generateTotpSecret()))
    expect(secrets.size).toBe(50)
  })
})

describe('buildOtpAuthUri', () => {
  it('builds a URI an authenticator app can read', () => {
    const uri = buildOtpAuthUri({
      secret: 'JBSWY3DPEHPK3PXP',
      accountName: 'demo@aurion-markets.example',
      issuer: 'Aurion Markets',
    })
    expect(uri).toContain('otpauth://totp/Aurion%20Markets%3Ademo%40aurion-markets.example?')
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP')
    expect(uri).toContain('issuer=Aurion+Markets')
    expect(uri).toContain('digits=6')
    expect(uri).toContain('period=30')
  })
})

describe('generateRecoveryCodes', () => {
  it('produces the requested number of distinct, formatted codes', () => {
    const codes = generateRecoveryCodes(8)
    expect(codes).toHaveLength(8)
    expect(new Set(codes).size).toBe(8)
    for (const code of codes) expect(code).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/)
  })
})
