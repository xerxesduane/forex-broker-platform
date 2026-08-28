import { err, ok, type Result } from '@/domain/shared/result'
import type { AdapterError } from './types'

/** Bounds how long an adapter call may run. Simulated adapters resolve
 * near-instantly, but every adapter method is wrapped in this so a future
 * `live` implementation gets the same contract without call-site changes. */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  onTimeout: () => AdapterError,
): Promise<Result<T, AdapterError>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      fn().then((value) => ({ timedOut: false as const, value })),
      new Promise<{ timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs)
      }),
    ])
    if (result.timedOut) return err(onTimeout())
    return ok(result.value)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Controlled retry for retryable adapter errors only — never retries a
 * validation-shaped failure. Exponential backoff, capped attempts. */
export async function withRetry<T>(
  fn: () => Promise<Result<T, AdapterError>>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<Result<T, AdapterError>> {
  const maxAttempts = options.maxAttempts ?? 3
  const baseDelayMs = options.baseDelayMs ?? 100
  let lastResult: Result<T, AdapterError> | undefined
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await fn()
    lastResult = result
    if (result.ok || !result.error.retryable || attempt === maxAttempts) return result
    await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)))
  }
  return lastResult as Result<T, AdapterError>
}
