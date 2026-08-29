/**
 * A minimal QR encoder, byte mode, error-correction level M, versions
 * 1–10 (up to 213 bytes — comfortably more than an otpauth:// URI needs).
 *
 * Written rather than pulled in, for one specific reason: the alternative
 * was rendering the enrolment QR through a public image service, which
 * would have sent every client's TOTP secret to a third party in a query
 * string. A second-factor secret must not leave this system, so the code
 * is drawn here and served as inline SVG.
 *
 * Framework-free per ADR 0002 — no Node or browser APIs at all, so it is
 * testable with plain Vitest and runs on either side.
 *
 * Reference: ISO/IEC 18004. The tables below are the standard's, for
 * level M only.
 */

/** [ecCodewordsPerBlock, group1Blocks, group1DataCodewords, group2Blocks, group2DataCodewords] */
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

/** Alignment-pattern centre coordinates by version. */
const ALIGNMENT_CENTRES: Record<number, number[]> = {
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

function dataCapacityBytes(version: number): number {
  const [, g1Blocks, g1Data, g2Blocks, g2Data] = EC_TABLE_M[version]!
  return g1Blocks * g1Data + g2Blocks * g2Data
}

// --- GF(256) arithmetic for Reed-Solomon -----------------------------------

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]!
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return EXP[LOG[a]! + LOG[b]!]!
}

/** Generator polynomial for `degree` error-correction codewords. */
function generatorPolynomial(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = (next[j] ?? 0) ^ gfMul(poly[j]!, EXP[i]!)
      next[j + 1] = (next[j + 1] ?? 0) ^ poly[j]!
    }
    poly = next
  }
  return poly
}

function errorCorrection(data: number[], ecLength: number): number[] {
  const generator = generatorPolynomial(ecLength)
  const remainder = new Array<number>(ecLength).fill(0)

  for (const byte of data) {
    const factor = byte ^ remainder[0]!
    remainder.shift()
    remainder.push(0)
    for (let i = 0; i < ecLength; i += 1) {
      remainder[i] = remainder[i]! ^ gfMul(generator[i + 1]!, factor)
    }
  }
  return remainder
}

// --- BCH codes for the format and version information ----------------------

function bchFormat(data: number): number {
  let value = data << 10
  for (let i = 4; i >= 0; i -= 1) {
    if (value & (1 << (i + 10))) value ^= 0x537 << i
  }
  return ((data << 10) | value) ^ 0x5412
}

function bchVersion(version: number): number {
  let value = version << 12
  for (let i = 5; i >= 0; i -= 1) {
    if (value & (1 << (i + 12))) value ^= 0x1f25 << i
  }
  return (version << 12) | value
}

// --- Encoding ---------------------------------------------------------------

function toUtf8Bytes(text: string): number[] {
  const bytes: number[] = []
  for (const char of text) {
    const code = char.codePointAt(0)!
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else if (code < 0x10000)
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    else
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      )
  }
  return bytes
}

function chooseVersion(byteLength: number): number {
  for (let version = 1; version <= 10; version += 1) {
    // Mode indicator (4 bits) + character count (8 or 16 bits) + payload.
    const headerBits = 4 + (version < 10 ? 8 : 16)
    if (dataCapacityBytes(version) * 8 >= headerBits + byteLength * 8) return version
  }
  throw new Error(
    `QR payload of ${byteLength} bytes exceeds the supported range (version 10, 213 bytes).`,
  )
}

function buildCodewords(bytes: number[], version: number): number[] {
  const bits: number[] = []
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1)
  }

  push(0b0100, 4) // byte mode
  push(bytes.length, version < 10 ? 8 : 16)
  for (const byte of bytes) push(byte, 8)

  const capacityBits = dataCapacityBytes(version) * 8
  push(0, Math.min(4, capacityBits - bits.length)) // terminator
  while (bits.length % 8 !== 0) bits.push(0)

  const codewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j]!
    codewords.push(byte)
  }

  const padBytes = [0xec, 0x11]
  let padIndex = 0
  while (codewords.length < dataCapacityBytes(version)) {
    codewords.push(padBytes[padIndex % 2]!)
    padIndex += 1
  }
  return codewords
}

/** Split into blocks, add error correction, then interleave as the spec requires. */
function interleave(codewords: number[], version: number): number[] {
  const [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] = EC_TABLE_M[version]!

  const dataBlocks: number[][] = []
  const ecBlocks: number[][] = []
  let offset = 0

  for (let i = 0; i < g1Blocks; i += 1) {
    const block = codewords.slice(offset, offset + g1Data)
    offset += g1Data
    dataBlocks.push(block)
    ecBlocks.push(errorCorrection(block, ecPerBlock))
  }
  for (let i = 0; i < g2Blocks; i += 1) {
    const block = codewords.slice(offset, offset + g2Data)
    offset += g2Data
    dataBlocks.push(block)
    ecBlocks.push(errorCorrection(block, ecPerBlock))
  }

  const result: number[] = []
  const maxData = Math.max(g1Data, g2Data)
  for (let i = 0; i < maxData; i += 1) {
    for (const block of dataBlocks) if (i < block.length) result.push(block[i]!)
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of ecBlocks) result.push(block[i]!)
  }
  return result
}

// --- Matrix construction ----------------------------------------------------

type Matrix = { size: number; modules: (boolean | null)[][]; reserved: boolean[][] }

function createMatrix(version: number): Matrix {
  const size = version * 4 + 17
  const modules: (boolean | null)[][] = Array.from({ length: size }, () =>
    new Array<boolean | null>(size).fill(null),
  )
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  )
  const matrix: Matrix = { size, modules, reserved }

  const set = (row: number, col: number, dark: boolean) => {
    modules[row]![col] = dark
    reserved[row]![col] = true
  }

  // Finder patterns, with their separators.
  const placeFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = row + r
        const cc = col + c
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue
        const inRing =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        set(rr, cc, inRing)
      }
    }
  }
  placeFinder(0, 0)
  placeFinder(0, size - 7)
  placeFinder(size - 7, 0)

  // Timing patterns.
  for (let i = 8; i < size - 8; i += 1) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }

  // Alignment patterns, skipping the finder corners.
  const centres = ALIGNMENT_CENTRES[version]!
  for (const row of centres) {
    for (const col of centres) {
      const nearFinder =
        (row <= 8 && col <= 8) || (row <= 8 && col >= size - 9) || (row >= size - 9 && col <= 8)
      if (nearFinder) continue
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          set(row + r, col + c, Math.max(Math.abs(r), Math.abs(c)) !== 1)
        }
      }
    }
  }

  // The dark module, always set.
  set(size - 8, 8, true)

  // Reserve the format-information areas.
  for (let i = 0; i < 9; i += 1) {
    if (modules[8]![i] === null) set(8, i, false)
    if (modules[i]![8] === null) set(i, 8, false)
  }
  for (let i = 0; i < 8; i += 1) {
    if (modules[8]![size - 1 - i] === null) set(8, size - 1 - i, false)
    if (modules[size - 1 - i]![8] === null) set(size - 1 - i, 8, false)
  }

  // Version information, for version 7 and up.
  if (version >= 7) {
    const bits = bchVersion(version)
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >> i) & 1) === 1
      const row = Math.floor(i / 3)
      const col = (i % 3) + size - 11
      set(row, col, dark)
      set(col, row, dark)
    }
  }

  return matrix
}

function placeData(matrix: Matrix, codewords: number[]): void {
  const { size, modules, reserved } = matrix
  let bitIndex = 0
  let upward = true

  for (let right = size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern; the zig-zag skips it.
    const columnPair = right === 6 ? 5 : right
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step
      for (const col of [columnPair, columnPair - 1]) {
        if (reserved[row]![col]) continue
        const byte = codewords[bitIndex >> 3] ?? 0
        modules[row]![col] = ((byte >> (7 - (bitIndex & 7))) & 1) === 1
        bitIndex += 1
      }
    }
    upward = !upward
  }
}

const MASKS: ((row: number, col: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

function applyMask(matrix: Matrix, maskIndex: number): boolean[][] {
  const { size, modules, reserved } = matrix
  const mask = MASKS[maskIndex]!
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => {
      const value = modules[row]![col] ?? false
      return reserved[row]![col] ? value : value !== mask(row, col)
    }),
  )
}

/** ISO/IEC 18004 penalty rules, used to pick the least-noisy mask. */
function penalty(grid: boolean[][]): number {
  const size = grid.length
  let score = 0

  // Rule 1: runs of five or more identical modules in a row or column.
  for (let i = 0; i < size; i += 1) {
    for (const line of [grid[i]!, grid.map((row) => row[i]!)]) {
      let run = 1
      for (let j = 1; j < size; j += 1) {
        if (line[j] === line[j - 1]) {
          run += 1
          if (run === 5) score += 3
          else if (run > 5) score += 1
        } else run = 1
      }
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const v = grid[r]![c]
      if (v === grid[r]![c + 1] && v === grid[r + 1]![c] && v === grid[r + 1]![c + 1]) score += 3
    }
  }

  // Rule 3: finder-like 1:1:3:1:1 patterns.
  const pattern = [true, false, true, true, true, false, true, false, false, false, false]
  const reversed = [...pattern].reverse()
  const matches = (line: boolean[], at: number, target: boolean[]) =>
    target.every((value, offset) => line[at + offset] === value)

  for (let i = 0; i < size; i += 1) {
    for (const line of [grid[i]!, grid.map((row) => row[i]!)]) {
      for (let j = 0; j + 11 <= size; j += 1) {
        if (matches(line, j, pattern) || matches(line, j, reversed)) score += 40
      }
    }
  }

  // Rule 4: deviation from an even balance of dark and light.
  const dark = grid.flat().filter(Boolean).length
  const percent = (dark * 100) / (size * size)
  score += Math.floor(Math.abs(percent - 50) / 5) * 10

  return score
}

function placeFormat(grid: boolean[][], maskIndex: number): void {
  const size = grid.length
  // 0b00 is error-correction level M.
  const bits = bchFormat((0b00 << 3) | maskIndex)

  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >> i) & 1) === 1
    if (i < 6) grid[i]![8] = dark
    else if (i < 8) grid[i + 1]![8] = dark
    else if (i === 8) grid[8]![7] = dark
    else grid[8]![14 - i] = dark

    if (i < 8) grid[8]![size - 1 - i] = dark
    else grid[size - 15 + i]![8] = dark
  }
}

/** The finished module grid: `true` is a dark module. */
export function encodeQr(text: string): boolean[][] {
  const bytes = toUtf8Bytes(text)
  const version = chooseVersion(bytes.length)
  const codewords = interleave(buildCodewords(bytes, version), version)

  const matrix = createMatrix(version)
  placeData(matrix, codewords)

  let best: boolean[][] | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (let maskIndex = 0; maskIndex < 8; maskIndex += 1) {
    const candidate = applyMask(matrix, maskIndex)
    placeFormat(candidate, maskIndex)
    const score = penalty(candidate)
    if (score < bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best!
}

/**
 * Inline SVG for the given text. `currentColor` for the dark modules so it
 * inherits the surrounding theme; an explicit white ground because
 * scanners need the contrast in either light or dark mode.
 */
export function qrSvg(text: string, options?: { size?: number; quietZone?: number }): string {
  const grid = encodeQr(text)
  const quiet = options?.quietZone ?? 4
  const modules = grid.length + quiet * 2
  const pixelSize = options?.size ?? 180

  const paths: string[] = []
  for (let row = 0; row < grid.length; row += 1) {
    let run = 0
    for (let col = 0; col <= grid.length; col += 1) {
      if (col < grid.length && grid[row]![col]) {
        run += 1
        continue
      }
      if (run > 0) {
        paths.push(`M${col - run + quiet} ${row + quiet}h${run}v1h-${run}z`)
        run = 0
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${modules} ${modules}"`,
    ` width="${pixelSize}" height="${pixelSize}" shape-rendering="crispEdges" role="img">`,
    `<rect width="${modules}" height="${modules}" fill="#ffffff"/>`,
    `<path d="${paths.join('')}" fill="#000000"/>`,
    '</svg>',
  ].join('')
}
