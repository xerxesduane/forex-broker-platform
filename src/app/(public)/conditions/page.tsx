import { PageHero } from '@/components/public/page-hero'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const ROWS = [
  { pair: 'EUR/USD', standard: '1.2 pips', raw: '0.1 pips + $6/lot' },
  { pair: 'GBP/USD', standard: '1.6 pips', raw: '0.3 pips + $6/lot' },
  { pair: 'USD/JPY', standard: '1.3 pips', raw: '0.2 pips + $6/lot' },
  { pair: 'XAU/USD', standard: '25 points', raw: '18 points + $6/lot' },
]

export default function ConditionsPage() {
  return (
    <div>
      <PageHero
        eyebrow="Spreads & conditions"
        title="Transparent, illustrative pricing"
        description="Representative figures for this demo, not live quotes. Real conditions would come from a liquidity/pricing integration in a future phase."
      />
      <section className="mx-auto max-w-4xl px-4 py-14">
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instrument</TableHead>
                <TableHead>Standard account</TableHead>
                <TableHead>Raw account</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map((row) => (
                <TableRow key={row.pair}>
                  <TableCell className="font-medium">{row.pair}</TableCell>
                  <TableCell>{row.standard}</TableCell>
                  <TableCell>{row.raw}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
