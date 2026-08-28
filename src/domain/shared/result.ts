/**
 * Shared Result type for domain and adapter code (ADR 0005): expected
 * failures are values, not thrown exceptions, so callers must handle them.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}
