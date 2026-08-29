import { describe, expect, it } from 'vitest'
import { buildOtpAuthUri, generateTotpSecret } from './totp'
import { encodeQr, qrSvg } from './qr'

/** Reads the 15-bit format information back out of the finished grid. */
function readFormatBits(grid: boolean[][]): number {
  let bits = 0
  for (let i = 0; i < 15; i += 1) {
    let dark: boolean
    if (i < 6) dark = grid[i]![8]!
    else if (i < 8) dark = grid[i + 1]![8]!
    else if (i === 8) dark = grid[8]![7]!
    else dark = grid[8]![14 - i]!
    if (dark) bits |= 1 << i
  }
  return bits
}

function hasFinderAt(grid: boolean[][], row: number, col: number): boolean {
  const expected = [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ]
  return expected.every((line, r) =>
    line.every((value, c) => grid[row + r]![col + c] === (value === 1)),
  )
}

describe('encodeQr', () => {
  it('sizes the symbol to the payload', () => {
    // Version = (size - 17) / 4.
    expect((encodeQr('HELLO').length - 17) / 4).toBe(1)
    expect((encodeQr('x'.repeat(100)).length - 17) / 4).toBeGreaterThanOrEqual(6)
  })

  it('places all three finder patterns', () => {
    const grid = encodeQr('https://aurion-markets.example')
    const size = grid.length
    expect(hasFinderAt(grid, 0, 0)).toBe(true)
    expect(hasFinderAt(grid, 0, size - 7)).toBe(true)
    expect(hasFinderAt(grid, size - 7, 0)).toBe(true)
  })

  it('lays down both timing patterns', () => {
    const grid = encodeQr('timing')
    for (let i = 8; i < grid.length - 8; i += 1) {
      expect(grid[6]![i]).toBe(i % 2 === 0)
      expect(grid[i]![6]).toBe(i % 2 === 0)
    }
  })

  it('always sets the dark module', () => {
    const grid = encodeQr('dark module')
    expect(grid[grid.length - 8]![8]).toBe(true)
  })

  it('writes format information that survives its own BCH check', () => {
    const grid = encodeQr('format')
    const bits = readFormatBits(grid) ^ 0x5412

    // Dividing by the BCH generator must leave no remainder.
    let remainder = bits
    for (let i = 4; i >= 0; i -= 1) {
      if (remainder & (1 << (i + 10))) remainder ^= 0x537 << i
    }
    expect(remainder).toBe(0)

    // The top two bits of the data are the EC level: 0b00 is level M.
    expect((bits >> 13) & 0b11).toBe(0b00)
  })

  it('encodes a full otpauth URI without overflowing', () => {
    const uri = buildOtpAuthUri({
      secret: generateTotpSecret(),
      accountName: 'a-fairly-long-demo-address@demo.aurion-markets.test',
      issuer: 'Aurion Markets',
    })
    expect(uri.length).toBeGreaterThan(100)
    const grid = encodeQr(uri)
    expect(grid.length).toBeGreaterThanOrEqual(45) // version 8 or larger
    expect(hasFinderAt(grid, 0, 0)).toBe(true)
  })

  it('refuses a payload beyond the supported range', () => {
    expect(() => encodeQr('x'.repeat(300))).toThrow(/exceeds the supported range/)
  })

  it('is deterministic', () => {
    expect(encodeQr('same input')).toEqual(encodeQr('same input'))
  })
})

describe('qrSvg', () => {
  it('renders a self-contained SVG with an opaque ground', () => {
    const svg = qrSvg('https://aurion-markets.example')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    // Scanners need real contrast, so the QR is not theme-tinted.
    expect(svg).toContain('fill="#ffffff"')
    expect(svg).toContain('fill="#000000"')
    expect(svg).toContain('</svg>')
    // The only URL in the output is the SVG namespace: no image host, no
    // request, nothing that could carry the secret off this machine.
    expect(svg.match(/https?:\/\/[^"']*/g)).toEqual(['http://www.w3.org/2000/svg'])
  })

  it('includes a quiet zone around the symbol', () => {
    const grid = encodeQr('quiet')
    const svg = qrSvg('quiet', { quietZone: 4 })
    expect(svg).toContain(`viewBox="0 0 ${grid.length + 8} ${grid.length + 8}"`)
  })
})

/**
 * A decoder, written only for this test.
 *
 * The encoder is hand-written and guards a security control, so
 * "it produces plausible-looking output" is not good enough evidence.
 * This reverses every step — format read, unmask, zig-zag scan,
 * de-interleave, byte-mode parse — and checks the original string comes
 * back. If placement, masking, interleaving or the bit packing were
 * wrong in any way, this would not round-trip.
 */
function decodeQr(grid: boolean[][]): string {
  const size = grid.length
  const version = (size - 17) / 4

  const EC_TABLE_M: Record<number, [number, number, number, number, number]> = {
    1: [10, 1, 16, 0, 0],
    2: [16, 1, 28, 0, 0],
    3: [26, 1, 44, 0, 0],
    4: [18, 2, 32, 0, 0],
    5: [24, 2, 43, 0, 0],
    6: [16, 4, 27, 0, 0],
    7: [18, 4, 31, 0, 0],
    8: [22, 2, 38, 2, 39],
    9: [22, 3, 36, 2, 37],
    10: [26, 4, 43, 1, 44],
  }
  const [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] = EC_TABLE_M[version]!

  const maskIndex = ((readFormatBits(grid) ^ 0x5412) >> 10) & 0b111
  const masks: ((r: number, c: number) => boolean)[] = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ]
  const mask = masks[maskIndex]!

  // Rebuild the reserved map exactly as the encoder does, so the scan
  // skips the same modules.
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  )
  const reserve = (r: number, c: number) => {
    if (r >= 0 && r < size && c >= 0 && c < size) reserved[r]![c] = true
  }
  for (const [fr, fc] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    for (let r = -1; r <= 7; r += 1) for (let c = -1; c <= 7; c += 1) reserve(fr! + r, fc! + c)
  }
  for (let i = 0; i < size; i += 1) {
    reserve(6, i)
    reserve(i, 6)
  }
  const centres: Record<number, number[]> = {
    1: [],
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
    10: [6, 28, 50],
  }
  for (const row of centres[version]!) {
    for (const col of centres[version]!) {
      const nearFinder =
        (row <= 8 && col <= 8) || (row <= 8 && col >= size - 9) || (row >= size - 9 && col <= 8)
      if (nearFinder) continue
      for (let r = -2; r <= 2; r += 1) for (let c = -2; c <= 2; c += 1) reserve(row + r, col + c)
    }
  }
  reserve(size - 8, 8)
  for (let i = 0; i < 9; i += 1) {
    reserve(8, i)
    reserve(i, 8)
  }
  for (let i = 0; i < 8; i += 1) {
    reserve(8, size - 1 - i)
    reserve(size - 1 - i, 8)
  }
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const row = Math.floor(i / 3)
      const col = (i % 3) + size - 11
      reserve(row, col)
      reserve(col, row)
    }
  }

  // Zig-zag scan, unmasking as it goes.
  const bits: number[] = []
  let upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    const columnPair = right === 6 ? 5 : right
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step
      for (const col of [columnPair, columnPair - 1]) {
        if (reserved[row]![col]) continue
        const value = grid[row]![col]!
        bits.push(value !== mask(row, col) ? 1 : 0)
      }
    }
    upward = !upward
  }

  const interleaved: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j]!
    interleaved.push(byte)
  }

  // De-interleave the data codewords back into their blocks.
  const blockSizes = [
    ...Array.from({ length: g1Blocks }, () => g1Data),
    ...Array.from({ length: g2Blocks }, () => g2Data),
  ]
  const blocks: number[][] = blockSizes.map(() => [])
  const maxData = Math.max(g1Data, g2Data)
  let cursor = 0
  for (let i = 0; i < maxData; i += 1) {
    for (let b = 0; b < blocks.length; b += 1) {
      if (i < blockSizes[b]!) blocks[b]!.push(interleaved[cursor++]!)
    }
  }
  void ecPerBlock

  const codewords = blocks.flat()

  // Byte mode: 4-bit mode indicator, then the character count.
  let bitCursor = 0
  const read = (length: number) => {
    let value = 0
    for (let i = 0; i < length; i += 1) {
      const byte = codewords[bitCursor >> 3]!
      value = (value << 1) | ((byte >> (7 - (bitCursor & 7))) & 1)
      bitCursor += 1
    }
    return value
  }

  expect(read(4)).toBe(0b0100)
  const length = read(version < 10 ? 8 : 16)
  const bytes: number[] = []
  for (let i = 0; i < length; i += 1) bytes.push(read(8))

  return new TextDecoder().decode(new Uint8Array(bytes))
}

describe('encodeQr round trip', () => {
  it.each([
    'HELLO',
    'https://aurion-markets.example/register?ref=AM-4F2C91',
    'Ünïcödé — em dash, accents and a £ sign',
    'x'.repeat(120),
  ])('decodes back to the original: %s', (input) => {
    expect(decodeQr(encodeQr(input))).toBe(input)
  })

  it('round-trips a real otpauth enrolment URI', () => {
    const uri = buildOtpAuthUri({
      secret: generateTotpSecret(),
      accountName: 'samuel.reyes@demo.aurion-markets.test',
      issuer: 'Aurion Markets',
    })
    expect(decodeQr(encodeQr(uri))).toBe(uri)
  })
})
