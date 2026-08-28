import type { AdapterResult } from '../shared/types'

export type ProvisionDemoAccountRequest = {
  idempotencyKey: string
  clientId: string
  baseCurrency: string
  leverage: number
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

export interface Mt5Adapter {
  provisionDemoAccount(
    req: ProvisionDemoAccountRequest,
  ): Promise<AdapterResult<ProvisionDemoAccountResponse>>

  getAccountSnapshot(mt5Login: number): Promise<AdapterResult<Mt5AccountSnapshot>>
}
