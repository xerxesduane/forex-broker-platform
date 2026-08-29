import Link from 'next/link'
import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-[76vh] w-full max-w-md flex-col justify-center px-4 py-12">
      <Link
        href="/"
        className="mb-6 flex items-center justify-center gap-2 font-semibold tracking-tight"
      >
        <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-md text-sm font-bold">
          AM
        </span>
        <span className="text-lg">Aurion Markets</span>
      </Link>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>

      {footer ? <div className="text-muted-foreground mt-5 text-center text-sm">{footer}</div> : null}

      <p className="text-muted-foreground mt-8 text-center text-xs">
        Demonstration environment. Every account, balance and provider response is simulated.
      </p>
    </div>
  )
}
