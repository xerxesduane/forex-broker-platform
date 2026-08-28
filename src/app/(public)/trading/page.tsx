import { PageHero } from '@/components/public/page-hero'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const STEPS = [
  {
    title: '1. Verify your identity',
    body: 'Complete a short profile and a simulated KYC submission. A KYC analyst reviews and decides.',
  },
  {
    title: '2. Request a trading account',
    body: 'Choose an account type, base currency and leverage. Demo accounts provision instantly.',
  },
  {
    title: '3. Trade on MT5',
    body: 'Connect with the provided login on MetaTrader 5. Order execution and charts live in MT5 itself.',
  },
]

export default function TradingOverviewPage() {
  return (
    <div>
      <PageHero
        eyebrow="Trading overview"
        title="How trading works on Aurion Markets"
        description="This platform handles verification, account provisioning and account-level oversight. Order execution, charts, open positions and pending orders live in MT5."
      />
      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-3">
        {STEPS.map((step) => (
          <Card key={step.title}>
            <CardHeader>
              <CardTitle className="text-base">{step.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">{step.body}</CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
