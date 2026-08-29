import { z } from 'zod'

const totpToken = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.')

export const confirmMfaSchema = z.object({ token: totpToken })
export type ConfirmMfaInput = z.infer<typeof confirmMfaSchema>

export const disableMfaSchema = z.object({ token: totpToken })
export type DisableMfaInput = z.infer<typeof disableMfaSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z
      .string()
      .min(10, 'Password must be at least 10 characters.')
      .regex(/[a-z]/, 'Include at least one lowercase letter.')
      .regex(/[A-Z]/, 'Include at least one uppercase letter.')
      .regex(/[0-9]/, 'Include at least one number.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'Choose a password you have not used here before.',
    path: ['newPassword'],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
