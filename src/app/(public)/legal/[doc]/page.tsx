import { notFound } from 'next/navigation'
import { PageHero } from '@/components/public/page-hero'

const LEGAL_DOCS: Record<string, string> = {
  'terms-of-business': 'Terms of Business',
  'privacy-policy': 'Privacy Policy',
  'risk-disclosure': 'Risk Disclosure',
  'aml-policy': 'AML & KYC Policy',
}

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }))
}

export default async function LegalDocPage(props: PageProps<'/legal/[doc]'>) {
  const { doc } = await props.params
  const title = LEGAL_DOCS[doc]
  if (!title) notFound()

  return (
    <div>
      <PageHero eyebrow="Legal" title={title} />
      <section className="mx-auto max-w-3xl px-4 py-14 text-sm leading-relaxed">
        <p className="text-muted-foreground">
          Placeholder legal document for the demonstration build. In a real deployment this content
          is drafted and approved by qualified legal and compliance advisers for the operating
          jurisdiction(s) — see docs/assumptions.md.
        </p>
      </section>
    </div>
  )
}
