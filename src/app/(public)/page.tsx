import Link from 'next/link'
import { ArrowRight, LineChart, ShieldCheck, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const HIGHLIGHTS = [
  {
    icon: LineChart,
    title: 'Trade on MetaTrader 5',
    body: 'Demo and (in a future phase) real accounts provisioned on MT5, with transparent spreads and clear trading conditions.',
  },
  {
    icon: ShieldCheck,
    title: 'Verified, guided onboarding',
    body: 'A simple identity verification flow with plain-language status updates at every step — no jargon, no guesswork.',
  },
  {
    icon: Users,
    title: 'Introducing Broker program',
    body: 'Refer clients, track commissions and rebates, and follow your network — all backed by ledger-evidenced payouts.',
  },
]

const ACCOUNT_PREVIEW = [
  { name: 'Standard', spread: 'From 1.2 pips', commission: 'None', minDeposit: '$100' },
  { name: 'Raw', spread: 'From 0.0 pips', commission: '$6 per lot round-turn', minDeposit: '$500' },
]

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <Badge variant="secondary" className="mb-4">
          Demo platform — simulated data only
        </Badge>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          A calmer way to run a Forex brokerage.
        </h1>
        <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
          Aurion Markets pairs a guided client portal with a queue-first operations console — demo
          and real trading accounts, KYC review, and money movement all evidenced by an immutable
          ledger.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            size="lg"
            render={
              <Link href="/register">
                Open a demo account <ArrowRight className="ml-1 size-4" />
              </Link>
            }
          />
          <Button
            size="lg"
            variant="outline"
            render={<Link href="/trading">Explore trading conditions</Link>}
          />
        </div>
      </section>

      <section className="bg-secondary/30 border-y py-16">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:grid-cols-3">
          {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="border-none bg-transparent shadow-none">
              <CardHeader>
                <Icon className="text-accent-foreground mb-2 size-6" aria-hidden="true" />
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">{body}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Account types at a glance</h2>
            <p className="text-muted-foreground mt-1">
              Full conditions on the{' '}
              <Link href="/account-types" className="underline underline-offset-4">
                account types
              </Link>{' '}
              page.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {ACCOUNT_PREVIEW.map((account) => (
            <Card key={account.name}>
              <CardHeader>
                <CardTitle>{account.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <dl className="grid grid-cols-2 gap-y-2">
                  <dt className="text-muted-foreground">Spreads</dt>
                  <dd>{account.spread}</dd>
                  <dt className="text-muted-foreground">Commission</dt>
                  <dd>{account.commission}</dd>
                  <dt className="text-muted-foreground">Minimum deposit</dt>
                  <dd>{account.minDeposit} (demo)</dd>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}
