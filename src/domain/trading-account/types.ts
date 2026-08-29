export type TradingAccountType = 'demo' | 'real'

export type TradingAccountStatus =
  'requested' | 'provisioning' | 'active' | 'rejected' | 'suspended' | 'closed'

export type TradingAccountEvent =
  | { type: 'START_PROVISIONING' }
  | { type: 'REJECT_REQUEST'; reason: string }
  | { type: 'PROVISION_SUCCEEDED' }
  | { type: 'PROVISION_FAILED'; reason: string }
  | { type: 'SUSPEND'; reason: string }
  | { type: 'REACTIVATE' }
  | { type: 'CLOSE'; reason: string }

export const DEMO_STARTING_BALANCE = 10_000
export const DEMO_BASE_CURRENCY = 'USD'
export const ALLOWED_LEVERAGE_OPTIONS = [50, 100, 200, 500] as const
export type LeverageOption = (typeof ALLOWED_LEVERAGE_OPTIONS)[number]

/**
 * The account plans a client can choose between. Trading conditions are
 * fixed at request time (see the trading_accounts columns) — this table is
 * the single source for what the public site advertises, what the request
 * form offers, and what the admin console displays, so the three can
 * never drift apart.
 */
export const ACCOUNT_PLANS = [
  {
    key: 'standard',
    name: 'Standard',
    spreadModel: 'standard',
    commissionModel: 'none',
    spreadFrom: 1.2,
    commissionPerLot: 0,
    minDeposit: 100,
    maxLeverage: 500,
    blurb: 'All-in spreads, no commission. The simplest place to start.',
  },
  {
    key: 'raw',
    name: 'Raw',
    spreadModel: 'raw_plus_commission',
    commissionModel: 'per_lot',
    spreadFrom: 0.0,
    commissionPerLot: 6,
    minDeposit: 500,
    maxLeverage: 200,
    blurb: 'Interbank spreads from 0.0 pips plus a fixed round-turn commission.',
  },
] as const

export type AccountPlanKey = (typeof ACCOUNT_PLANS)[number]['key']

export function accountPlan(key: string) {
  return ACCOUNT_PLANS.find((plan) => plan.key === key) ?? ACCOUNT_PLANS[0]
}
