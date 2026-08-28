export type TradingAccountType = 'demo' | 'real'

export type TradingAccountStatus =
  'requested' | 'provisioning' | 'active' | 'rejected' | 'suspended' | 'closed'

export type TradingAccountEvent =
  | { type: 'START_PROVISIONING' }
  | { type: 'PROVISION_SUCCEEDED' }
  | { type: 'PROVISION_FAILED'; reason: string }
  | { type: 'SUSPEND'; reason: string }
  | { type: 'REACTIVATE' }
  | { type: 'CLOSE'; reason: string }

export const DEMO_STARTING_BALANCE = 10_000
export const DEMO_BASE_CURRENCY = 'USD'
export const ALLOWED_LEVERAGE_OPTIONS = [50, 100, 200, 500] as const
export type LeverageOption = (typeof ALLOWED_LEVERAGE_OPTIONS)[number]
