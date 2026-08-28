import type { ReactNode } from 'react'

export function PageHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <section className="bg-secondary/30 border-b">
      <div className="mx-auto max-w-6xl px-4 py-14">
        {eyebrow && (
          <p className="text-accent-foreground/80 mb-2 text-sm font-semibold tracking-wide uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-3 max-w-2xl text-lg">{description}</p>
        )}
        {children}
      </div>
    </section>
  )
}
