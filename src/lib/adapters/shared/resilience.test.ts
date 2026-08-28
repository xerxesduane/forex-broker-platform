import { describe, expect, it, vi } from 'vitest'
import { err, ok } from '@/domain/shared/result'
import { withRetry, withTimeout } from './resilience'
import type { AdapterError } from './types'

describe('withTimeout', () => {
  it('resolves normally when the call finishes in time', async () => {
    const result = await withTimeout(
      async () => 'done',
      1000,
      () => ({
        code: 'timeout',
        message: 'timed out',
        retryable: true,
      }),
    )
    expect(result).toEqual({ ok: true, value: 'done' })
  })

  it('times out a call that never resolves in time', async () => {
    const result = await withTimeout(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
      5,
      () => ({ code: 'timeout', message: 'timed out', retryable: true }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('timeout')
  })
})

describe('withRetry', () => {
  it('does not retry a non-retryable error', async () => {
    const fn = vi.fn(async () =>
      err<AdapterError>({ code: 'bad_input', message: 'nope', retryable: false }),
    )
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(false)
  })

  it('retries a retryable error up to maxAttempts then gives up', async () => {
    const fn = vi.fn(async () =>
      err<AdapterError>({ code: 'timeout', message: 'slow', retryable: true }),
    )
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })
    expect(fn).toHaveBeenCalledTimes(3)
    expect(result.ok).toBe(false)
  })

  it('stops retrying once a call succeeds', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls += 1
      if (calls < 2) return err<AdapterError>({ code: 'timeout', message: 'slow', retryable: true })
      return ok('recovered')
    })
    const result = await withRetry(fn, { maxAttempts: 5, baseDelayMs: 1 })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ ok: true, value: 'recovered' })
  })
})
