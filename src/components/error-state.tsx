'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Lock, RotateCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * The shared error boundary body.
 *
 * A permission failure is a *designed* outcome here, not a fault:
 * requirePermission() throws rather than returning, so a member of staff
 * who opens a URL their role does not cover lands in this boundary. That
 * deserves a clear explanation, not a stack trace — so it is detected and
 * presented separately from a genuine failure.
 */
export function ErrorState({
  error,
  reset,
  homeHref = '/',
  homeLabel = 'Back to safety',
}: {
  error: Error & { digest?: string }
  reset: () => void
  homeHref?: string
  homeLabel?: string
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const denied =
    error.name === 'PermissionDeniedError' || error.message.includes('Missing required permission')

  if (denied) {
    const permission = error.message.split(': ')[1]
    return (
      <div className="mx-auto max-w-xl py-10">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="text-muted-foreground size-4" aria-hidden="true" />
              You don&apos;t have access to this
            </CardTitle>
            <CardDescription>
              Your role doesn&apos;t include the permission this page needs
              {permission ? (
                <>
                  {' '}
                  (<code className="font-mono text-xs">{permission}</code>)
                </>
              ) : null}
              . That&apos;s the access control working, not a fault — nothing was shown to you and
              the attempt is recorded.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" render={<Link href={homeHref}>{homeLabel}</Link>} />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TriangleAlert className="size-4 text-amber-600" aria-hidden="true" />
            Something went wrong
          </CardTitle>
          <CardDescription>
            This page couldn&apos;t load. Nothing was changed — you can try again safely.
            {error.digest ? (
              <>
                {' '}
                Reference <code className="font-mono text-xs">{error.digest}</code>.
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={reset}>
            <RotateCw className="mr-1 size-3.5" aria-hidden="true" />
            Try again
          </Button>
          <Button variant="outline" render={<Link href={homeHref}>{homeLabel}</Link>} />
        </CardContent>
      </Card>
    </div>
  )
}
