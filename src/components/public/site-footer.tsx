import Link from 'next/link'

const LEGAL_LINKS = [
  { href: '/legal/terms-of-business', label: 'Terms of business' },
  { href: '/legal/privacy-policy', label: 'Privacy policy' },
  { href: '/legal/risk-disclosure', label: 'Risk disclosure' },
  { href: '/legal/aml-policy', label: 'AML & KYC policy' },
]

export function SiteFooter() {
  return (
    <footer className="border-border/70 bg-secondary/40 mt-16 border-t">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="mb-2 font-semibold">Aurion Markets</p>
            <p className="text-muted-foreground">
              A demonstration Forex brokerage platform. No real trading, funds or identity documents
              are involved.
            </p>
          </div>
          <div>
            <p className="mb-2 font-semibold">Product</p>
            <ul className="text-muted-foreground space-y-1.5">
              <li>
                <Link href="/trading" className="hover:text-foreground">
                  Trading overview
                </Link>
              </li>
              <li>
                <Link href="/account-types" className="hover:text-foreground">
                  Account types
                </Link>
              </li>
              <li>
                <Link href="/platforms" className="hover:text-foreground">
                  Platforms &amp; MT5
                </Link>
              </li>
              <li>
                <Link href="/partners" className="hover:text-foreground">
                  Introducing Brokers
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-2 font-semibold">Company</p>
            <ul className="text-muted-foreground space-y-1.5">
              <li>
                <Link href="/about" className="hover:text-foreground">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-foreground">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-2 font-semibold">Legal</p>
            <ul className="text-muted-foreground space-y-1.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-muted-foreground mt-8 border-t pt-6 text-xs leading-relaxed">
          Aurion Markets is a fictional demonstration brand created for a private product
          walkthrough. It is not a licensed or regulated financial services provider, does not
          accept real deposits or client funds, and does not offer real trading services. Trading
          foreign exchange carries a high level of risk and may not be suitable for all investors;
          this statement is illustrative demo copy, not a real risk disclosure.
        </p>
      </div>
    </footer>
  )
}
