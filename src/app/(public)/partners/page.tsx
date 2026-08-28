import { PageHero } from '@/components/public/page-hero'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const TIERS = [
  { name: 'Associate', threshold: 'Any referred volume', rebate: 'Base rebate rate' },
  { name: 'Partner', threshold: '$250k+ referred volume', rebate: 'Enhanced rebate rate' },
  { name: 'Elite Partner', threshold: '$1M+ referred volume', rebate: 'Top-tier rebate rate' },
]

export default function PartnersPage() {
  return (
    <div>
      <PageHero
        eyebrow="Introducing Broker program"
        title="Refer clients, earn transparent commissions"
        description="Every commission and rebate traces back to a specific ledger-evidenced transaction — nothing is a manual spreadsheet calculation."
      />
      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-3">
        {TIERS.map((tier) => (
          <Card key={tier.name}>
            <CardHeader>
              <CardTitle className="text-base">{tier.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground space-y-1 text-sm">
              <p>{tier.threshold}</p>
              <p>{tier.rebate}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
