import { PageHero } from '@/components/public/page-hero'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const ACCOUNT_TYPES = [
  {
    name: 'Demo',
    badge: 'Available in this demo',
    description:
      'Risk-free practice account with simulated funds. Instantly provisioned after KYC approval.',
    rows: [
      ['Starting balance', '$10,000 (simulated)'],
      ['Base currency', 'USD, EUR or GBP'],
      ['Leverage', 'Up to 1:500'],
      ['Spread model', 'Standard'],
    ],
  },
  {
    name: 'Standard (Real)',
    badge: 'Future phase',
    description: 'Real-money trading with standard spreads and no separate commission.',
    rows: [
      ['Minimum deposit', '$100'],
      ['Spread model', 'Standard, from 1.2 pips'],
      ['Commission', 'None'],
      ['Leverage', 'Up to 1:200'],
    ],
  },
  {
    name: 'Raw (Real)',
    badge: 'Future phase',
    description: 'Tighter raw spreads plus a transparent per-lot commission.',
    rows: [
      ['Minimum deposit', '$500'],
      ['Spread model', 'Raw, from 0.0 pips'],
      ['Commission', '$6 per lot round-turn'],
      ['Leverage', 'Up to 1:200'],
    ],
  },
]

export default function AccountTypesPage() {
  return (
    <div>
      <PageHero
        eyebrow="Account types"
        title="Choose the account that fits how you trade"
        description="This demo provisions demo accounts end-to-end. Real accounts are modeled in the platform but gated for a future phase — see the product plan for the reasoning."
      />
      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-3">
        {ACCOUNT_TYPES.map((account) => (
          <Card key={account.name}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{account.name}</CardTitle>
                <Badge variant="outline">{account.badge}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4 text-sm">{account.description}</p>
              <dl className="space-y-2 text-sm">
                {account.rows.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between gap-4 border-t pt-2 first:border-0 first:pt-0"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
