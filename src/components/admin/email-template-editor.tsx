'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { updateEmailTemplate } from '@/server/settings'

export type EmailTemplate = {
  key: string
  name: string
  subject: string
  body: string
  available_variables: string[]
}

export function EmailTemplateEditor({ template }: { template: EmailTemplate }) {
  const router = useRouter()
  const [subject, setSubject] = useState(template.subject)
  const [body, setBody] = useState(template.body)
  const [pending, startTransition] = useTransition()
  const dirty = subject !== template.subject || body !== template.body

  return (
    <div className="space-y-3 border-b py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{template.name}</h3>
        <span className="text-muted-foreground font-mono text-[11px]">{template.key}</span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`subject-${template.key}`}>Subject</Label>
        <Input
          id={`subject-${template.key}`}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`body-${template.key}`}>Body</Label>
        <Textarea
          id={`body-${template.key}`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={7}
          className="font-mono text-xs"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground text-xs">Variables:</span>
          {template.available_variables.map((variable) => (
            <Badge key={variable} variant="outline" className="font-mono text-[10px]">
              {`{{${variable}}}`}
            </Badge>
          ))}
        </span>
        <Button
          size="sm"
          disabled={!dirty || pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateEmailTemplate({ key: template.key, subject, body })
              if (!result.ok) {
                toast.error(result.error)
                return
              }
              toast.success(`${template.name} saved.`)
              router.refresh()
            })
          }
        >
          {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
          Save template
        </Button>
      </div>
    </div>
  )
}
