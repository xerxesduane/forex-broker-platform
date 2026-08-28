import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

/**
 * Minimal, accessible form-field wrapper used with React Hook Form's
 * `register()` directly (shadcn's `form` primitive isn't available for
 * this project's shadcn/Base UI combination — see components/ui). Every
 * field gets a linked label, and errors are announced via role="alert"
 * and aria-describedby.
 */
export function FormField({
  label,
  htmlFor,
  error,
  description,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  description?: string
  children: ReactNode
}) {
  const errorId = `${htmlFor}-error`
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {description && !error && <p className="text-muted-foreground text-xs">{description}</p>}
      {error && (
        <p id={errorId} className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function fieldAria(htmlFor: string, error?: string) {
  return {
    id: htmlFor,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${htmlFor}-error` : undefined,
  } as const
}
