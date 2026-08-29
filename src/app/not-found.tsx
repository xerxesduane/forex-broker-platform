import Link from 'next/link'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-1 items-center px-4 py-20">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Compass className="text-muted-foreground size-4" aria-hidden="true" />
            We couldn&apos;t find that page
          </CardTitle>
          <CardDescription>
            The link may be out of date, or the record may have been removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button render={<Link href="/">Go to the homepage</Link>} />
          <Button variant="outline" render={<Link href="/portal">Open my portal</Link>} />
        </CardContent>
      </Card>
    </div>
  )
}
