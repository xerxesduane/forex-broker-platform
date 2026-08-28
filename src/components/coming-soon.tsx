import { Construction } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Shared placeholder for information-architecture that exists (nav item,
 * route) but isn't functionally wired in this pass — see
 * docs/product-plan.md section 7 for what's in vs. out of scope.
 */
export function ComingSoon({ title, phase, body }: { title: string; phase: string; body: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Construction className="text-muted-foreground size-4" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground space-y-2 text-sm">
        <p>{body}</p>
        <p className="text-xs">Planned for: {phase}. See docs/product-plan.md.</p>
      </CardContent>
    </Card>
  )
}
