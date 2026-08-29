'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

/**
 * next-themes was already a dependency — the Toaster calls useTheme() —
 * but nothing provided it, so the class never landed on <html> and the
 * dark palette in globals.css was unreachable. This wires it up.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
