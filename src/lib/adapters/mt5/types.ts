import type { AdapterResult } from '../shared/types'

export type ProvisionDemoAccountRequest = {
  idempotencyKey: string
  clientId: string
  baseCurrency: string
  leverage: number
}

export type ProvisionRealAccountRequest = ProvisionDemoAccountRequest & {
  /** 'standard' | 'raw' — decides the MT5 group the login lands in. */
  plan: string
}

export type ProvisionDemoAccountResponse = {
  mt5Login: number
  mt5Server: string
  mt5Group: string
  startingBalance: number
  provisionedAt: string
}

/**
 * Read-only account snapshot as MT5 would report it. This platform is not
 * the trading terminal — no orders/positions/charts, only the account
 * summary a broker's back office needs (docs/product-plan.md section 1).
 */
export type Mt5AccountSnapshot = {
  balance: number
  equity: number
  credit: number
  usedMargin: number
  freeMargin: number
  marginLevel: number | null
  syncedAt: string
}

export type Mt5AccountStateRequest = {
  idempotencyKey: string
  mt5Login: number
  /** MT5 distinguishes trade-disabled from fully-disabled logins. */
  state: 'enabled' | 'trade_disabled' | 'disabled'
  reason: string
}

export interface Mt5Adapter {
  provisionDemoAccount(
    req: ProvisionDemoAccountRequest,
  ): Promise<AdapterResult<ProvisionDemoAccountResponse>>

  provisionRealAccount(
    req: ProvisionRealAccountRequest,
  ): Promise<AdapterResult<ProvisionDemoAccountResponse>>

  /**
   * Refresh the balance/equity/margin snapshot. `currentBalance` is passed
   * in because the simulation derives equity from the balance the platform
   * already holds — a live adapter would ignore it and read MT5 instead.
   */
  getAccountSnapshot(
    mt5Login: number,
    currentBalance?: number,
  ): Promise<AdapterResult<Mt5AccountSnapshot>>

  setAccountState(req: Mt5AccountStateRequest): Promise<AdapterResult<{ appliedAt: string }>>
}
