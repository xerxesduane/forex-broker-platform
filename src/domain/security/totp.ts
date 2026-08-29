/**
 * TOTP (RFC 6238) over HOTP (RFC 4226), implemented directly rather than
 * pulled in as a dependency so the demo can show a working
 * authenticator-app enrolment with no third-party service involved and no
 * supply-chain surface for a security control.
 *
 * Framework-free per ADR 0002 — node:crypto only, no Next.js/Supabase/React
 * — so it is unit-testable against the RFC 4226 test vectors.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const DEFAULT_DIGITS = 6
const DEFAULT_STEP_SECONDS = 30
/**
 * Accept the previous and next window as well as the current one, so a
 * slow-fingered user or a phone whose clock drifts by a few seconds can
 * still sign in. One step either side is the usual compromise.
 */
const DEFAULT_WINDOW = 1

export function base32Encode(buffer: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

export function base32Decode(input: string): Uint8Array {
  const normalized = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')
  let bits = 0
  let value = 0
  const output: number[] = []

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) {
      throw new Error(`Invalid base32 character "${char}" in TOTP secret`)
    }
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(output)
}

/** A fresh 160-bit secret, base32-encoded as authenticator apps expect. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/** RFC 4226 HOTP. Exposed separately so the RFC test vectors can hit it. */
export function hotp(options: {
  secret: Uint8Array
  counter: number
  digits?: number
  algorithm?: 'sha1' | 'sha256' | 'sha512'
}): string {
  const digits = options.digits ?? DEFAULT_DIGITS
  const counterBuffer = Buffer.alloc(8)
  // 64-bit big-endian counter. Split across two 32-bit writes because
  // the counter can exceed Number's 32-bit bitwise range.
  counterBuffer.writeUInt32BE(Math.floor(options.counter / 2 ** 32), 0)
  counterBuffer.writeUInt32BE(options.counter % 2 ** 32, 4)

  const digest = createHmac(options.algorithm ?? 'sha1', Buffer.from(options.secret))
    .update(counterBuffer)
    .digest()

  // Dynamic truncation (RFC 4226 §5.4): the low nibble of the last byte
  // picks a 4-byte window, whose top bit is masked off. Read as a 32-bit
  // word — offset is at most 15 and every supported digest is at least 20
  // bytes, so the window is always in range.
  const offset = digest.readUInt8(digest.length - 1) & 0x0f
  const binary = digest.readUInt32BE(offset) & 0x7fffffff

  return (binary % 10 ** digits).toString().padStart(digits, '0')
}

export function generateTotp(options: {
  secret: string
  timestampMs?: number
  stepSeconds?: number
  digits?: number
}): string {
  const step = options.stepSeconds ?? DEFAULT_STEP_SECONDS
  const timestampMs = options.timestampMs ?? Date.now()
  const counter = Math.floor(timestampMs / 1000 / step)
  return hotp({
    secret: base32Decode(options.secret),
    counter,
    digits: options.digits ?? DEFAULT_DIGITS,
  })
}

/**
 * Constant-time comparison across the accepted window, so a wrong code
 * cannot be distinguished from a nearly-right one by timing.
 */
export function verifyTotp(options: {
  secret: string
  token: string
  timestampMs?: number
  stepSeconds?: number
  digits?: number
  window?: number
}): boolean {
  const digits = options.digits ?? DEFAULT_DIGITS
  const candidate = options.token.replace(/\s/g, '')
  if (!new RegExp(`^\\d{${digits}}$`).test(candidate)) return false

  const step = options.stepSeconds ?? DEFAULT_STEP_SECONDS
  const window = options.window ?? DEFAULT_WINDOW
  const timestampMs = options.timestampMs ?? Date.now()
  const currentCounter = Math.floor(timestampMs / 1000 / step)
  const secretBytes = base32Decode(options.secret)

  let matched = false
  for (let drift = -window; drift <= window; drift += 1) {
    const expected = hotp({ secret: secretBytes, counter: currentCounter + drift, digits })
    // Compare every candidate rather than short-circuiting, so the number
    // of HMACs performed does not depend on which window matched.
    const a = Buffer.from(expected)
    const b = Buffer.from(candidate)
    if (a.length === b.length && timingSafeEqual(a, b)) {
      matched = true
    }
  }
  return matched
}

/**
 * otpauth:// URI for the enrolment QR code. The issuer is repeated as a
 * label prefix as well as a parameter, which is what authenticator apps
 * actually key off.
 */
export function buildOtpAuthUri(options: {
  secret: string
  accountName: string
  issuer: string
}): string {
  const label = encodeURIComponent(`${options.issuer}:${options.accountName}`)
  const params = new URLSearchParams({
    secret: options.secret,
    issuer: options.issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

/**
 * Single-use recovery codes, for the case the demo audience always asks
 * about: "what happens when they lose the phone?"
 */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(5)).slice(0, 8)
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`
  })
}
