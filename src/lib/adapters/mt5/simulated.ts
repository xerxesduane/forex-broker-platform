import { randomInt } from 'node:crypto'
import { err, ok } from '@/domain/shared/result'
import { DEMO_STARTING_BALANCE } from '@/domain/trading-account/types'
import { withTimeout } from '../shared/resilience'
import type { AdapterResult, IntegrationEventRecorder } from '../shared/types'
import type {
  Mt5AccountSnapshot,
  Mt5AccountStateRequest,
  Mt5Adapter,
  ProvisionDemoAccountRequest,
  ProvisionDemoAccountResponse,
  ProvisionRealAccountRequest,
} from './types'

const DEMO_SERVER = process.env.MT5_DEMO_SERVER_NAME || 'AurionMarkets-Demo'
const DEMO_GROUP = process.env.MT5_DEMO_GROUP || 'demo\\standard'
const LIVE_SERVER = 'AurionMarkets-Live01'
const CALL_TIMEOUT_MS = 5000

/**
 * Simulated MT5 adapter. Never reads MT5_MANAGER_* credentials — those
 * env vars exist only as placeholders for a future, separately-reviewed
 * `live` implementation (ADR 0005). Idempotency is the caller's
 * responsibility: check `integration_events` for an existing succeeded
 * row with this idempotencyKey before calling a provisioning method again.
 */
export class SimulatedMt5Adapter implements Mt5Adapter {
  constructor(private readonly recordEvent: IntegrationEventRecorder) {}

  async provisionDemoAccount(
    req: ProvisionDemoAccountRequest,
  ): Promise<AdapterResult<ProvisionDemoAccountResponse>> {
    return this.provision(req, {
      eventType: 'provision_demo_account',
      server: DEMO_SERVER,
      group: DEMO_GROUP,
      // Demo logins use a fixed, clearly-fake 9-prefix so they can never
      // be mistaken for a real MT5 login in a screenshot or export.
      loginPrefix: '9',
      startingBalance: DEMO_STARTING_BALANCE,
    })
  }

  async provisionRealAccount(
    req: ProvisionRealAccountRequest,
  ): Promise<AdapterResult<ProvisionDemoAccountResponse>> {
    return this.provision(req, {
      eventType: 'provision_real_account',
      server: LIVE_SERVER,
      group: `real\\${req.plan}`,
      // Still a simulated login, still visibly fake (8-prefix) — this
      // build never touches a real MT5 Manager API (ADR 0005).
      loginPrefix: '8',
      // A real account opens unfunded; money arrives through the ledger.
      startingBalance: 0,
    })
  }

  private async provision(
    req: ProvisionDemoAccountRequest,
    config: {
      eventType: string
      server: string
      group: string
      loginPrefix: string
      startingBalance: number
    },
  ): Promise<AdapterResult<ProvisionDemoAccountResponse>> {
    const result = await withTimeout(
      async () => {
        const response: ProvisionDemoAccountResponse = {
          mt5Login: Number(`${config.loginPrefix}${randomInt(100_000, 999_999)}`),
          mt5Server: config.server,
          mt5Group: config.group,
          startingBalance: config.startingBalance,
          provisionedAt: new Date().toISOString(),
        }
        return response
      },
      CALL_TIMEOUT_MS,
      () => ({
        code: 'mt5_timeout',
        message: 'Simulated MT5 provisioning timed out.',
        retryable: true,
      }),
    )

    await this.recordEvent({
      adapter: 'mt5',
      eventType: config.eventType,
      idempotencyKey: req.idempotencyKey,
      status: result.ok ? 'succeeded' : 'failed',
      simulation: true,
      requestSummary: {
        clientId: req.clientId,
        baseCurrency: req.baseCurrency,
        leverage: req.leverage,
      },
      responseSummary: result.ok ? result.value : undefined,
      errorCode: result.ok ? undefined : result.error.code,
      errorMessage: result.ok ? undefined : result.error.message,
      relatedEntityType: 'trading_account_request',
      relatedEntityId: req.clientId,
    })

    return result.ok ? ok(result.value) : err(result.error)
  }

  /**
   * Simulated snapshot. Equity is derived from the balance plus a small
   * floating P&L and a plausible used-margin figure, so an operator
   * pressing "Sync from MT5" sees the numbers move the way a live account's
   * would. Still only the account *summary* — no positions or orders,
   * because this platform is not the trading terminal.
   */
  async getAccountSnapshot(
    mt5Login: number,
    currentBalance = DEMO_STARTING_BALANCE,
  ): Promise<AdapterResult<Mt5AccountSnapshot>> {
    void mt5Login
    const balance = currentBalance

    if (balance <= 0) {
      return ok({
        balance: 0,
        equity: 0,
        credit: 0,
        usedMargin: 0,
        freeMargin: 0,
        marginLevel: null,
        syncedAt: new Date().toISOString(),
      })
    }

    // Floating P&L within ±2.5% of balance, and margin usage up to 18%.
    const floatingPnl = Math.round(balance * (randomInt(-250, 250) / 10_000) * 100) / 100
    const usedMargin = Math.round(balance * (randomInt(0, 1800) / 10_000) * 100) / 100
    const equity = Math.round((balance + floatingPnl) * 100) / 100
    const freeMargin = Math.round(Math.max(0, equity - usedMargin) * 100) / 100

    return ok({
      balance,
      equity,
      credit: 0,
      usedMargin,
      freeMargin,
      marginLevel: usedMargin > 0 ? Math.round((equity / usedMargin) * 100 * 100) / 100 : null,
      syncedAt: new Date().toISOString(),
    })
  }

  async setAccountState(
    req: Mt5AccountStateRequest,
  ): Promise<AdapterResult<{ appliedAt: string }>> {
    const response = { appliedAt: new Date().toISOString() }

    await this.recordEvent({
      adapter: 'mt5',
      eventType: 'set_account_state',
      idempotencyKey: req.idempotencyKey,
      status: 'succeeded',
      simulation: true,
      requestSummary: { mt5Login: req.mt5Login, state: req.state, reason: req.reason },
      responseSummary: response,
      relatedEntityType: 'trading_account',
      relatedEntityId: undefined,
    })

    return ok(response)
  }
}
