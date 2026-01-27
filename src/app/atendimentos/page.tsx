'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { PlusCircle } from 'lucide-react'
import { AppLayout } from '@/components/app-layout'
import { Button } from '@/components/ui/button'

// Dynamic import para evitar erro de hydration com Radix UI
const AtendimentosTable = dynamic(
  () => import('@/components/tables/atendimentos-table').then(mod => ({ default: mod.AtendimentosTable })),
  { ssr: false, loading: () => <div className="text-center py-8 text-muted-foreground">Carregando...</div> }
)

export default function AtendimentosPage() {
  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Pagamentos</h1>
        <Link href="/atendimentos/novo">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Novo Pagamento
          </Button>
        </Link>
      </div>
      <AtendimentosTable />
    </AppLayout>
  )
}
