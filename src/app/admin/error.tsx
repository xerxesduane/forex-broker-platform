'use client'

import { ErrorState } from '@/components/error-state'

export default function AdminError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState {...props} homeHref="/admin" homeLabel="Back to dashboard" />
}
