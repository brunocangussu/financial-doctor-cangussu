'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  Wallet,
  Receipt,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/atendimentos', label: 'Pagamentos', icon: FileText },
  { href: '/atendimentos/novo', label: 'Novo Pagamento', icon: PlusCircle },
  { href: '/repasses', label: 'Repasses', icon: Wallet },
  { href: '/despesas', label: 'Despesas', icon: Receipt },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

export function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="fixed left-0 top-0 h-full w-64 bg-card border-r border-border flex flex-col shadow-sm">
      {/* Logo Section */}
      <div className="p-5 border-b border-border">
        <Link href="/">
          <Image
            src="/images/logo.png"
            alt="Financial Doctor"
            width={200}
            height={60}
            className="h-auto"
            priority
          />
        </Link>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href) && !pathname.includes('/novo'))
          const isNewActive = item.href === '/atendimentos/novo' && pathname === '/atendimentos/novo'
          const active = isActive || isNewActive

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                active
                  ? 'bg-brand-gradient text-white shadow-brand-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5', active ? 'text-white' : '')} />
              {item.label}
            </Link>
          )
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
        >
          <LogOut className="h-5 w-5" />
          Sair
        </button>
      </div>
    </nav>
  )
}
