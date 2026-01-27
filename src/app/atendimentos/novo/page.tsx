import { AppLayout } from '@/components/app-layout'
import { AtendimentoForm } from '@/components/forms/atendimento-form'

export default function NovoAtendimentoPage() {
  return (
    <AppLayout>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold mb-6">Novo Pagamento</h1>
        <AtendimentoForm />
      </div>
    </AppLayout>
  )
}
