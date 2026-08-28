import { randomInt } from 'node:crypto'
import { err, ok } from '@/domain/shared/result'
import { DEMO_STARTING_BALANCE } from '@/domain/trading-account/types'
import { withTimeout } from '../shared/resilience'
import type { AdapterResult, IntegrationEventRecorder } from '../shared/types'
import type {
  Mt5AccountSnapshot,
  Mt5Adapter,
  ProvisionDemoAccountRequest,
  ProvisionDemoAccountResponse,
} from './types'

const DEMO_SERVER = process.env.MT5_DEMO_SERVER_NAME || 'AurionMarkets-Demo'
const DEMO_GROUP = process.env.MT5_DEMO_GROUP || 'demo\\standard'
const CALL_TIMEOUT_MS = 5000

/**
 * Simulated MT5 adapter. Never reads MT5_MANAGER_* credentials — those
 * env vars exist only as placeholders for a future, separately-reviewed
 * `live` implementation (ADR 0005). Idempotency is the caller's
 * responsibility: check `integration_events` for an existing succeeded
 * row with this idempotencyKey before calling provisionDemoAccount again.
 */
export class SimulatedMt5Adapter implements Mt5Adapter {
  constructor(private readonly recordEvent: IntegrationEventRecorder) {}

  async provisionDemoAccount(
    req: ProvisionDemoAccountRequest,
  ): Promise<AdapterResult<ProvisionDemoAccountResponse>> {
    const result = await withTimeout(
      async () => {
        // Demo logins use a fixed, clearly-fake prefix so they can never be
        // mistaken for a real MT5 login number in a screenshot or export.
        const mt5Login = Number(`9${randomInt(100_000, 999_999)}`)
        const response: ProvisionDemoAccountResponse = {
          mt5Login,
          mt5Server: DEMO_SERVER,
          mt5Group: DEMO_GROUP,
          startingBalance: DEMO_STARTING_BALANCE,
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
      eventType: 'provision_demo_account',
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

  async getAccountSnapshot(mt5Login: number): Promise<AdapterResult<Mt5AccountSnapshot>> {
    // Demo accounts never trade in this build, so the snapshot mirrors the
    // starting balance with zero exposure — a real sync job would poll MT5
    // for open-position-derived equity/margin here.
    void mt5Login
    const snapshot: Mt5AccountSnapshot = {
      balance: DEMO_STARTING_BALANCE,
      equity: DEMO_STARTING_BALANCE,
      credit: 0,
      usedMargin: 0,
      freeMargin: DEMO_STARTING_BALANCE,
      marginLevel: null,
      syncedAt: new Date().toISOString(),
    }
    return ok(snapshot)
  }
}
