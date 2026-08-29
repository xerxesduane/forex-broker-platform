'use client'

import { ErrorState } from '@/components/error-state'

export default function PortalError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorState {...props} homeHref="/portal" homeLabel="Back to your dashboard" />
}
