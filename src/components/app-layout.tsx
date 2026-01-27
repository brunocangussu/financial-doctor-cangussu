'use client'

import { Navigation } from './navigation'

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="ml-64 p-8">{children}</main>
    </div>
  )
}
