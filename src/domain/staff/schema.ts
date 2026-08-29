import { z } from 'zod'
import { STAFF_ROLE_KEYS } from '@/domain/rbac/permissions'

export const inviteStaffSchema = z.object({
  email: z.email('Enter a valid email address.'),
  firstName: z.string().trim().min(1, 'Enter a first name.').max(60),
  lastName: z.string().trim().min(1, 'Enter a last name.').max(60),
  roleKey: z.enum(STAFF_ROLE_KEYS, { message: 'Choose a role.' }),
})

export type InviteStaffInput = z.infer<typeof inviteStaffSchema>

export const assignRoleSchema = z.object({
  profileId: z.uuid(),
  roleKey: z.enum(STAFF_ROLE_KEYS, { message: 'Choose a role.' }),
})

export type AssignRoleInput = z.infer<typeof assignRoleSchema>

export const revokeRoleSchema = z.object({
  profileId: z.uuid(),
  roleKey: z.enum(STAFF_ROLE_KEYS),
  reason: z.string().trim().min(4, 'Give a reason — role changes are audited.').max(300),
})

export type RevokeRoleInput = z.infer<typeof revokeRoleSchema>

export const toggleRolePermissionSchema = z.object({
  roleKey: z.enum(STAFF_ROLE_KEYS),
  permissionKey: z.string().trim().min(3),
  grant: z.boolean(),
})

export type ToggleRolePermissionInput = z.infer<typeof toggleRolePermissionSchema>
