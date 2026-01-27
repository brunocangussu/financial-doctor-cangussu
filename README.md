# Financial Doctor

Sistema de gestão financeira para clínicas médicas. Desenvolvido com Next.js, Supabase e shadcn/ui.

## Funcionalidades

### Dashboard
- Faturamento bruto e líquido do período
- Gráficos por origem de paciente e procedimento
- Estatísticas por profissional
- Filtros por data

### Registro de Pagamentos
- Formulário com cálculo automático de taxas, impostos e repasses
- Autocomplete de pacientes
- Suporte a múltiplos procedimentos por pagamento
- Regras especiais por profissional e procedimento (Endolaser, Hospital/Memorial)
- Edição e exclusão de registros (somente admin)

### Repasses
- Visualização mensal separada por profissional
- Seleção por mês/ano (não por dia)
- Cada mês com card independente: receita, despesas, líquido
- Marcar como pago por mês individual
- Controle de bônus Vanessa (Endolaser)
- Detalhamento de atendimentos por profissional (expansível)

### Despesas
- Cadastro de despesas pontuais, mensais ou com recorrência personalizada
- Responsabilidade por profissional (percentual configurável)
- Categorias: aluguel, equipamento, material, serviços, impostos, marketing, software, outros
- Integração automática com repasses (abate despesas do líquido)

### Configurações
- Profissionais: nome, status ativo
- Procedimentos: nome, custo fixo, bônus Vanessa (percentual editável)
- Origens: nome, flags para hospital (pula taxa/imposto)
- Taxas de cartão: faixas InfinitePay por faturamento mensal (Novus, Crescere, Magnus, Optimus)
- Formas de pagamento: PIX, Débito, Crédito 1x-12x

## Regras de Cálculo

```
Valor Bruto
  - Taxa de Cartão (% conforme faixa InfinitePay e parcelamento)
  = Valor Base
  - Imposto (3% padrão, 0% para hospital/Memorial)
  - Custo do Procedimento (valor fixo, ex: Endolaser = R$1.301,61)
  = Líquido Final
```

### Regras Especiais

| Cenário | Regra |
|---------|-------|
| Endolaser + Bruno | Bônus Vanessa = 1,5% do líquido |
| Endolaser + Valquíria | Divisão 50/50 do líquido (Bruno/Valquíria) |
| Outros + Valquíria | 100% do líquido para Valquíria |
| Origem Hospital/Memorial | Pula taxa de cartão e/ou imposto; permite informar valor líquido direto |

### Faixas de Taxa InfinitePay

| Faixa | Faturamento Mensal | Crédito 1x |
|-------|--------------------|-------------|
| Novus | até R$20k | 3,15% |
| Crescere | R$20k–R$40k | 2,89% |
| Magnus | R$40k–R$80k | 2,79% |
| Optimus | acima R$80k | 2,69% |

Cada faixa tem taxas específicas para débito e parcelamento de 2x a 12x. A taxa é fixada no momento do cadastro do pagamento (não recalcula retroativamente).

## Banco de Dados (Supabase/PostgreSQL)

### Tabelas Principais

| Tabela | Descrição |
|--------|-----------|
| `patients` | Pacientes (id, name) |
| `professionals` | Profissionais (id, name, is_active) |
| `procedures` | Procedimentos (name, fixed_cost, has_vanessa_bonus, vanessa_bonus_percentage) |
| `payment_methods` | Formas de pagamento (PIX, Débito, Crédito) |
| `sources` | Origens de paciente (HSR, Instagram, Memorial, etc.) |
| `appointments` | Pagamentos registrados com todos os valores calculados |
| `transfers` | Repasses marcados como pagos (professional_id, period_start, period_end, amount, status) |
| `vanessa_payments` | Bônus Vanessa pagos (period_start, period_end, amount, status) |
| `expenses` | Despesas (name, amount, recurrence_type, responsibility JSONB, is_active) |
| `card_fee_tiers` | Faixas de faturamento (Novus, Crescere, Magnus, Optimus) |
| `card_fee_tier_rates` | Taxas por faixa + forma de pagamento + parcelamento |
| `user_profiles` | Perfis de usuário (role: admin/secretary) |

### Campos Calculados em `appointments`

Cada pagamento salva os valores no momento do cadastro:
- `card_fee_percentage`, `card_fee_value`
- `tax_percentage`, `tax_value`
- `procedure_cost`, `net_value`
- `vanessa_bonus`
- `professional_share`, `final_value_bruno`, `final_value_professional`

### RLS (Row Level Security)

Todas as tabelas possuem políticas RLS ativas. Usuários autenticados podem ler; INSERT/UPDATE/DELETE verificam role em `user_profiles`.

## Stack Tecnológico

| Camada | Tecnologia |
|--------|------------|
| Framework | Next.js 16 (App Router) |
| UI | shadcn/ui + Tailwind CSS + Radix UI |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| Gráficos | Recharts |
| Exportação | xlsx |
| Datas | date-fns + date-fns/locale/pt-BR |

## Estrutura do Projeto

```
src/
├── app/
│   ├── page.tsx                # Dashboard principal
│   ├── layout.tsx              # Layout com navegação lateral
│   ├── globals.css             # Estilos globais + variáveis de tema
│   ├── atendimentos/
│   │   ├── page.tsx            # Lista de pagamentos
│   │   └── novo/page.tsx       # Formulário de registro
│   ├── repasses/
│   │   └── page.tsx            # Repasses mensais por profissional
│   ├── despesas/
│   │   └── page.tsx            # Gestão de despesas
│   ├── configuracoes/
│   │   └── page.tsx            # Configurações do sistema
│   └── login/
│       └── page.tsx            # Autenticação
├── components/
│   ├── ui/                     # Componentes shadcn (button, card, dialog, select, etc.)
│   ├── forms/
│   │   └── atendimento-form.tsx
│   ├── tables/
│   │   └── atendimentos-table.tsx
│   ├── dashboard/
│   │   ├── stats-cards.tsx
│   │   └── charts.tsx
│   ├── navigation.tsx          # Menu lateral
│   └── app-layout.tsx          # Layout wrapper
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Cliente browser
│   │   └── server.ts           # Cliente server-side
│   ├── calculations.ts         # Lógica de cálculos financeiros
│   ├── expenses.ts             # Cálculo de ocorrências de despesas
│   ├── hooks.ts                # React hooks (useAppointments, useProfessionals, useExpenses, etc.)
│   └── utils.ts                # Utilitários (cn, formatCurrency)
├── middleware.ts               # Middleware de autenticação
└── types/
    └── index.ts                # Tipos TypeScript (Appointment, Professional, Expense, etc.)
```

## Setup

### 1. Supabase

1. Crie um projeto no [Supabase](https://supabase.com)
2. Configure as tabelas conforme o schema descrito acima (via SQL Editor ou Dashboard)
3. Ative RLS em todas as tabelas
4. Crie usuários em Authentication > Users

### 2. Variáveis de Ambiente

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon
```

### 3. Executar

```bash
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000)

## Deploy

```bash
npm run build
```

Configure as variáveis de ambiente no provedor de hospedagem (Vercel, etc.) com as credenciais do Supabase.
