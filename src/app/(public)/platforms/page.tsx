import { PageHero } from '@/components/public/page-hero'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function PlatformsPage() {
  return (
    <div>
      <PageHero
        eyebrow="Platforms"
        title="Trade on MetaTrader 5"
        description="Aurion Markets provisions and manages MT5 account access. Order execution, charting and position management happen inside MT5 itself."
      />
      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What Aurion Markets handles</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-2 text-sm">
            <p>Identity verification and account eligibility.</p>
            <p>MT5 login, server and group provisioning.</p>
            <p>Account-level balance, equity, credit and margin snapshots.</p>
            <p>Deposits, withdrawals and wallet history (future phase).</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What lives inside MT5</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-2 text-sm">
            <p>Live pricing, charts and technical analysis.</p>
            <p>Order placement, open positions and pending orders.</p>
            <p>Trade history at the individual-order level.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
