import { Info } from 'lucide-react'

/**
 * Always-on, site-wide reminder that this is a simulated demo. Required
 * by the engagement brief: every simulated value must be visibly labeled
 * as demo data, not just noted in code comments.
 */
export function DemoBanner() {
  return (
    <div className="bg-primary text-primary-foreground text-xs sm:text-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-1.5 text-center">
        <Info className="size-3.5 shrink-0" aria-hidden="true" />
        <p>
          Demonstration environment — all accounts, balances, KYC decisions and provider responses
          are simulated. No real money, identity documents or live MT5 accounts are used.
        </p>
      </div>
    </div>
  )
}
