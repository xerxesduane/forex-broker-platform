import { PageHero } from '@/components/public/page-hero'

export default function AboutPage() {
  return (
    <div>
      <PageHero
        eyebrow="About"
        title="A demonstration of what disciplined brokerage operations look like"
        description="Aurion Markets is a fictional brand built to show a Forex brokerage's client and operations platform end to end — verification, account provisioning, and (in later phases) money movement, referrals and support, all backed by an immutable ledger."
      />
      <section className="mx-auto max-w-3xl space-y-4 px-4 py-14 text-sm leading-relaxed">
        <p>
          This build exists to demonstrate product direction and operational workflows to a
          prospective client. It intentionally does not process real money, collect genuine identity
          documents, or connect to a production MT5 environment — every integration runs in
          simulation mode.
        </p>
        <p>
          The platform is organized around three experiences: a public site, a guided client portal,
          and a queue-oriented admin portal for operations staff — mirroring how a real brokerage
          separates client self-service from back-office control.
        </p>
      </section>
    </div>
  )
}
