'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Light/dark switch.
 *
 * The server cannot know which theme the browser will resolve, so any
 * markup that *differs* by theme is a guaranteed hydration mismatch. The
 * usual workaround — render nothing until a mount effect fires — trades
 * that for a flicker and a cascading render. Instead both icons are always
 * in the tree and CSS picks one from the `dark` class next-themes writes
 * on <html> before paint, so the server and client render identically and
 * the correct icon is right on first frame.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      aria-label="Toggle light or dark theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
    >
      <Sun className="hidden size-4 dark:block" aria-hidden="true" />
      <Moon className="size-4 dark:hidden" aria-hidden="true" />
    </Button>
  )
}
