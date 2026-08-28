import { PageHero } from '@/components/public/page-hero'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const GROUPS = [
  { name: 'Major FX pairs', example: 'EUR/USD, GBP/USD, USD/JPY, USD/CHF' },
  { name: 'Minor & exotic FX pairs', example: 'EUR/GBP, AUD/CAD, USD/TRY' },
  { name: 'Precious metals', example: 'XAU/USD, XAG/USD' },
  { name: 'Major indices', example: 'US500, US30, UK100, DE40' },
]

export default function InstrumentsPage() {
  return (
    <div>
      <PageHero
        eyebrow="Trading instruments"
        title="A focused instrument set, cleanly organized"
        description="Instrument-level pricing and execution live on MT5. This page describes the catalogue shape, not live quotes."
      />
      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-14 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <Card key={group.name}>
            <CardHeader>
              <CardTitle className="text-base">{group.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">{group.example}</CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
