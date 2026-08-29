import Link from 'next/link'
import {
  ArrowRight,
  BookLock,
  Gauge,
  LineChart,
  ScrollText,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ACCOUNT_PLANS } from '@/domain/trading-account/types'

const HIGHLIGHTS = [
  {
    icon: LineChart,
    title: 'Trade on MetaTrader 5',
    body: 'Demo and live accounts provisioned on MT5 with transparent spreads, published commission and no surprises in the small print.',
  },
  {
    icon: ShieldCheck,
    title: 'Verification that explains itself',
    body: 'Plain-language status at every step. If we need something else from you, we say exactly what and why — not just "rejected".',
  },
  {
    icon: Wallet,
    title: 'Funding you can audit',
    body: 'Every deposit, withdrawal, transfer and rebate appears on your statement as a line you can trace. Balances are derived from that record, never typed into it.',
  },
  {
    icon: Users,
    title: 'A partner programme with real numbers',
    body: 'Track referred clients, tier progress and commission as it is earned — calculated from credited deposits, and paid into your wallet.',
  },
]

const OPERATIONS = [
  {
    icon: BookLock,
    title: 'Immutable double-entry ledger',
    body: 'Client balances are folded from balanced debit and credit rows at read time. There is no editable balance column anywhere in the schema — corrections are new compensating entries, never edits.',
  },
  {
    icon: ScrollText,
    title: 'Evidence on every decision',
    body: 'Each sensitive action records who did it, under which role, why, and against which record — appended to a log the database itself refuses to update or delete.',
  },
  {
    icon: Gauge,
    title: 'Maker-checker on money out',
    body: 'Withdrawals above a configurable threshold require two distinct approvers. The same person signing twice is refused in the interface, in the server action, and by a database constraint.',
  },
]

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="border-b">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <Badge variant="secondary" className="mb-4">
            Demonstration platform — every value is simulated
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            A calmer way to run a Forex brokerage.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
            Aurion Markets pairs a guided client portal with a queue-first operations console.
            Onboarding, verification, funding, trading accounts and partner payouts — all evidenced
            by an immutable ledger and an audit trail nobody can quietly edit.
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

          <dl className="mt-12 grid max-w-3xl gap-6 sm:grid-cols-3">
            {[
              { value: 'MT5', label: 'Demo and live accounts, provisioned in seconds' },
              { value: '24/5', label: 'Support from Monday open to Friday close' },
              { value: '4 tiers', label: 'Partner programme, from Bronze to Platinum' },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="text-2xl font-semibold tracking-tight">{stat.value}</dt>
                <dd className="text-muted-foreground mt-1 text-sm">{stat.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* For clients */}
      <section className="bg-secondary/30 border-b py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-2xl font-semibold tracking-tight">Built around the client</h2>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            The parts of a brokerage relationship people actually feel: getting verified, getting
            funded, and knowing where their money is.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <Card key={title} className="border-none bg-transparent shadow-none">
                <CardHeader className="pb-2">
                  <Icon className="text-accent-foreground mb-2 size-6" aria-hidden="true" />
                  <CardTitle className="text-base">{title}</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">{body}</CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* For the back office */}
      <section className="border-b py-16">
        <div className="mx-auto max-w-6xl px-4">
          <Badge variant="outline" className="mb-3">
            Behind the portal
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight">
            The controls a regulator would ask about
          </h2>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Most broker back-offices treat these as features to add later. Here they are the
            foundation, enforced in the database rather than promised in a policy document.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {OPERATIONS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-lg border p-5">
                <Icon className="text-accent-foreground mb-3 size-6" aria-hidden="true" />
                <h3 className="font-medium">{title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Account types */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
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
          <Button variant="outline" render={<Link href="/register">Open an account</Link>} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {ACCOUNT_PLANS.map((plan) => (
            <Card key={plan.key}>
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <p className="text-muted-foreground text-sm">{plan.blurb}</p>
              </CardHeader>
              <CardContent className="text-sm">
                <dl className="grid grid-cols-2 gap-y-2">
                  <dt className="text-muted-foreground">Spreads</dt>
                  <dd>From {plan.spreadFrom.toFixed(1)} pips</dd>
                  <dt className="text-muted-foreground">Commission</dt>
                  <dd>
                    {plan.commissionPerLot > 0
                      ? `$${plan.commissionPerLot} per lot round-turn`
                      : 'None'}
                  </dd>
                  <dt className="text-muted-foreground">Minimum deposit</dt>
                  <dd>${plan.minDeposit}</dd>
                  <dt className="text-muted-foreground">Maximum leverage</dt>
                  <dd>1:{plan.maxLeverage}</dd>
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Close */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-12">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              See the whole journey in about five minutes.
            </h2>
            <p className="mt-1 max-w-xl opacity-90">
              Register, get verified, fund a wallet and watch the posting land in the ledger — with
              the operations console open beside it.
            </p>
          </div>
          <Button
            size="lg"
            variant="secondary"
            render={
              <Link href="/register">
                Start now <ArrowRight className="ml-1 size-4" />
              </Link>
            }
          />
        </div>
      </section>
    </div>
  )
}
