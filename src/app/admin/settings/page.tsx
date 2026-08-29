import { PageHeader } from '@/components/admin/page-header'
import { EmailTemplateEditor, type EmailTemplate } from '@/components/admin/email-template-editor'
import { SettingRow, type SettingField } from '@/components/admin/settings-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { requirePermission } from '@/lib/rbac/require-permission'
import { loadSettingRows } from '@/lib/settings'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const GROUP_TITLES: Record<string, { title: string; description: string }> = {
  general: { title: 'Brand', description: 'Names and contact details shown to clients.' },
  finance: {
    title: 'Finance controls',
    description:
      'These are live controls, not labels: the auto-credit limit and the dual-approval threshold are read by the deposit and withdrawal workflows every time one runs.',
  },
  trading: {
    title: 'Trading accounts',
    description: 'What clients can request, and whether a real account needs approval first.',
  },
  growth: {
    title: 'Partner programme',
    description: 'Default reward rates. A partner rank benefit overrides the referral rate.',
  },
  compliance: { title: 'Compliance', description: 'Verification requirements.' },
}

function fieldKind(key: string, value: unknown): SettingField['kind'] {
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'list'
  if (typeof value === 'number') return 'number'
  void key
  return 'text'
}

function stringify(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return String(value ?? '')
}

export default async function AdminSettingsPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.SETTINGS_MANAGE)

  const rows = await loadSettingRows(supabase)

  const { data: templateRows } = await supabase
    .from('email_templates')
    .select('key, name, subject, body, available_variables')
    .order('key')

  const templates = (templateRows ?? []) as unknown as EmailTemplate[]

  const grouped = new Map<string, SettingField[]>()
  for (const row of rows) {
    const field: SettingField = {
      key: row.key,
      label: row.label,
      description: row.description,
      value: stringify(row.value),
      kind: fieldKind(row.key, row.value),
    }
    grouped.set(row.group, [...(grouped.get(row.group) ?? []), field])
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Every change here is validated against that setting's own schema before it is written, and recorded in the audit log with its before and after value."
      />

      {[...grouped.entries()].map(([group, fields]) => {
        const meta = GROUP_TITLES[group] ?? { title: group, description: '' }
        return (
          <Card key={group}>
            <CardHeader>
              <CardTitle className="text-base">{meta.title}</CardTitle>
              {meta.description ? <CardDescription>{meta.description}</CardDescription> : null}
            </CardHeader>
            <CardContent className="pt-0">
              {fields.map((field) => (
                <SettingRow key={field.key} field={field} />
              ))}
            </CardContent>
          </Card>
        )
      })}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email templates</CardTitle>
          <CardDescription>
            Rendered by the simulated email adapter. In this build the message is written to the
            integration log instead of being sent — no real email leaves the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {templates.length === 0 ? (
            <p className="text-muted-foreground py-4 text-sm">No templates configured.</p>
          ) : (
            templates.map((template) => (
              <EmailTemplateEditor key={template.key} template={template} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
