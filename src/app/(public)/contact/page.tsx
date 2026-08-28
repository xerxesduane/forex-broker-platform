import { PageHero } from '@/components/public/page-hero'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ContactPage() {
  return (
    <div>
      <PageHero eyebrow="Contact" title="Get in touch" />
      <section className="mx-auto max-w-2xl px-4 py-14">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Demo contact details</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-2 text-sm">
            <p>Email: demo@aurion-markets.example</p>
            <p>Support hours: Monday–Friday, 08:00–20:00 (demo copy)</p>
            <p>
              This is a placeholder contact page for the demonstration build — no message form is
              wired to a real inbox.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
