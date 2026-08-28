import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { DemoBanner } from '@/components/demo-banner'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Aurion Markets — Forex Brokerage Demo',
  description:
    'Private demonstration platform for a Forex brokerage: public site, client portal and admin portal. All balances, accounts and provider responses are simulated demo data.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <DemoBanner />
          {children}
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  )
}
