'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { inviteStaff } from '@/server/staff'

export function InviteStaffDialog({ roles }: { roles: { key: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', roleKey: '' })
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)

  function submit() {
    startTransition(async () => {
      const result = await inviteStaff(form)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setIssued({ email: form.email, password: result.value?.temporaryPassword ?? '' })
      setForm({ email: '', firstName: '', lastName: '', roleKey: '' })
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setIssued(null)
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <UserPlus className="mr-1 size-3.5" aria-hidden="true" />
            Add staff
          </Button>
        }
      />
      <DialogContent>
        {issued ? (
          <>
            <DialogHeader>
              <DialogTitle>Staff account created</DialogTitle>
              <DialogDescription>
                This temporary password is shown once and is not stored anywhere readable. Copy it
                now.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted space-y-1 rounded-md p-3 font-mono text-sm">
              <p>{issued.email}</p>
              <p className="font-semibold">{issued.password}</p>
            </div>
            <p className="text-muted-foreground text-xs">
              A production build would email an invitation link instead of minting a password — this
              shortcut exists so the account can be demonstrated immediately.
            </p>
            <DialogFooter>
              <DialogClose render={<Button>Done</Button>} />
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add a member of staff</DialogTitle>
              <DialogDescription>
                Creates the account and assigns its first role. Both are recorded in the audit log.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="staff-first">First name</Label>
                  <Input
                    id="staff-first"
                    value={form.firstName}
                    onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="staff-last">Last name</Label>
                  <Input
                    id="staff-last"
                    value={form.lastName}
                    onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-email">Email</Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  placeholder="name@aurion-markets.example"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-role">Role</Label>
                <select
                  id="staff-role"
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                  value={form.roleKey}
                  onChange={(event) => setForm({ ...form, roleKey: event.target.value })}
                >
                  <option value="">Select a role…</option>
                  {roles.map((role) => (
                    <option key={role.key} value={role.key}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost">Cancel</Button>} />
              <Button
                onClick={submit}
                disabled={
                  pending || !form.email || !form.firstName || !form.lastName || !form.roleKey
                }
              >
                {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                Create account
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
