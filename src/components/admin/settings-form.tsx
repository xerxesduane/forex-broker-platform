'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updatePlatformSetting } from '@/server/settings'

export type SettingField = {
  key: string
  label: string
  description: string
  /** Already stringified for the input. */
  value: string
  kind: 'text' | 'number' | 'boolean' | 'list'
}

/**
 * One row per setting, saved individually.
 *
 * Each value is re-validated server-side against that key's own schema, so
 * a bad edit is refused rather than silently breaking a finance rule three
 * screens away.
 */
export function SettingRow({ field }: { field: SettingField }) {
  const router = useRouter()
  const [value, setValue] = useState(field.value)
  const [pending, startTransition] = useTransition()
  const dirty = value !== field.value

  function save() {
    startTransition(async () => {
      const result = await updatePlatformSetting({ key: field.key, value })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`${field.label} saved.`)
      router.refresh()
    })
  }

  return (
    <div className="grid gap-3 border-b py-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        <Label htmlFor={`setting-${field.key}`} className="font-medium">
          {field.label}
        </Label>
        <p className="text-muted-foreground mt-0.5 text-sm">{field.description}</p>
        <p className="text-muted-foreground mt-1 font-mono text-[11px]">{field.key}</p>
      </div>
      <div className="flex items-start gap-2">
        {field.kind === 'boolean' ? (
          <select
            id={`setting-${field.key}`}
            className="border-input bg-background h-9 flex-1 rounded-md border px-3 text-sm"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          >
            <option value="true">On</option>
            <option value="false">Off</option>
          </select>
        ) : (
          <Input
            id={`setting-${field.key}`}
            type={field.kind === 'number' ? 'number' : 'text'}
            step={field.kind === 'number' ? '0.01' : undefined}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="flex-1"
          />
        )}
        <Button
          size="sm"
          variant={dirty ? 'default' : 'outline'}
          disabled={!dirty || pending}
          onClick={save}
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" aria-hidden="true" />
          )}
          <span className="sr-only">Save {field.label}</span>
        </Button>
      </div>
    </div>
  )
}
