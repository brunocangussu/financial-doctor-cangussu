// Database Types for Financial Doctor

export interface Patient {
  id: string
  name: string
  phone?: string | null
  created_at: string
  updated_at: string
}

export interface Professional {
  id: string
  name: string
  bank_info?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Procedure {
  id: string
  name: string
  fixed_cost: number
  has_vanessa_bonus: boolean
  vanessa_bonus_percentage: number  // Porcentagem do bonus Vanessa (ex: 1.5 = 1.5%)
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PaymentMethod {
  id: string
  name: string
  display_order: number
  is_active: boolean
  created_at: string
}

export interface CardFeeRule {
  id: string
  payment_method_id: string
  min_value: number
  max_value: number | null
  fee_percentage: number
  created_at: string
  updated_at: string
}

// Sistema de faixas de taxa por faturamento
export interface CardFeeTier {
  id: string
  name: string
  min_revenue: number
  max_revenue: number | null
  priority: number
  is_active: boolean
  created_at: string
}

export interface CardFeeTierRate {
  id: string
  tier_id: string
  payment_method_id: string
  fee_percentage: number
  created_at: string
  // Joined data
  tier?: CardFeeTier
  payment_method?: PaymentMethod
}

export interface CurrentFeeTierInfo {
  id: string
  name: string
  min_revenue: number
  max_revenue: number | null
  previous_month_revenue: number
  revenue_range_display: string
}

export interface Source {
  id: string
  name: string
  is_hospital: boolean
  custom_tax_percentage?: number | null
  is_active: boolean
  created_at: string
}

export interface SystemSetting {
  id: string
  key: string
  value: string
  description?: string | null
  created_at: string
  updated_at: string
}

export interface Appointment {
  id: string
  date: string
  patient_id?: string | null
  patient_name?: string | null
  professional_id?: string | null
  procedure_id?: string | null  // Primary procedure for backward compatibility
  payment_method_id?: string | null
  is_hospital: boolean  // Indica se eh atendimento em hospital (nao cobra imposto)

  // Values
  gross_value: number
  net_value_input?: number | null

  // Calculated fields
  card_fee_percentage: number
  card_fee_value: number
  tax_percentage: number
  tax_value: number
  procedure_cost: number
  total_procedure_cost: number  // Sum of all procedures' costs
  net_value: number
  vanessa_bonus: number
  professional_share: number
  final_value_bruno: number
  final_value_professional: number

  // Metadata
  notes?: string | null
  created_at: string
  updated_at: string
  created_by?: string | null

  // Joined data
  professional?: Professional
  procedure?: Procedure  // Primary procedure
  payment_method?: PaymentMethod
  patient?: Patient
  appointment_procedures?: AppointmentProcedure[]  // All procedures for this appointment
}

export interface Transfer {
  id: string
  professional_id?: string | null
  period_start: string
  period_end: string
  total_amount: number
  status: 'pending' | 'paid'
  paid_at?: string | null
  notes?: string | null
  created_at: string
  updated_at: string

  // Joined data
  professional?: Professional
}

export interface VanessaPayment {
  id: string
  period_start: string
  period_end: string
  total_bonus: number
  status: 'pending' | 'paid'
  paid_at?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
}

// Distribuição dentro de uma regra de divisão
export interface SplitDistribution {
  professional_id: string
  percentage: number
}

// Regra de divisão de valores entre profissionais
export interface SplitRule {
  id: string
  name: string

  // Condições
  procedure_id?: string | null
  professional_id?: string | null

  // Distribuição
  distributions: SplitDistribution[]

  // O que descontar
  deduct_procedure_cost: boolean
  deduct_card_fee: boolean
  deduct_tax: boolean

  priority: number
  is_active: boolean
  created_at: string
  updated_at: string

  // Joined data
  procedure?: Procedure
  professional?: Professional
}

// Regra de bônus (ex: Vanessa)
export interface BonusRule {
  id: string
  name: string
  beneficiary_name: string

  // Condições
  procedure_id?: string | null
  professional_id?: string | null

  // Cálculo
  percentage: number
  base_value: 'gross_value' | 'net_value' | 'final_after_costs'

  is_active: boolean
  created_at: string
  updated_at: string

  // Joined data
  procedure?: Procedure
  professional?: Professional
}

export interface UserProfile {
  id: string
  email: string
  full_name?: string | null
  role: 'admin' | 'secretary'
  created_at: string
  updated_at: string
}

// Junction table for multiple procedures per appointment
export interface AppointmentProcedure {
  id: string
  appointment_id: string
  procedure_id: string
  sequence_order: number
  created_at: string

  // Joined data
  procedure?: Procedure
}

// Input types for forms
export interface AppointmentInput {
  date: string
  patient_name: string
  professional_id: string
  procedure_id: string  // Primary procedure
  procedure_ids?: string[]  // All selected procedures
  payment_method_id: string
  is_hospital: boolean
  gross_value: number
  net_value_input?: number | null
  notes?: string | null
}

// Calculation result type
export interface CalculationResult {
  gross_value: number
  card_fee_percentage: number
  card_fee_value: number
  value_after_card_fee: number
  tax_percentage: number
  tax_value: number
  value_after_tax: number
  procedure_cost: number
  net_value: number
  vanessa_bonus: number
  professional_share: number
  final_value_bruno: number
  final_value_professional: number
}

// Dashboard stats types
export interface DashboardStats {
  totalGross: number
  totalNet: number
  totalByProfessional: {
    professional_id: string
    professional_name: string
    total: number
  }[]
  totalBySource: {
    source_id: string
    source_name: string
    count: number
    total: number
  }[]
  totalByProcedure: {
    procedure_id: string
    procedure_name: string
    count: number
    total: number
  }[]
  monthlyTrend: {
    month: string
    gross: number
    net: number
  }[]
}

// Filter types
export interface AppointmentFilters {
  startDate?: string
  endDate?: string
  professional_id?: string
  procedure_id?: string
  patient_name?: string
  is_hospital?: boolean
}

// Expense types
export interface ExpenseResponsibility {
  professional_id: string
  percentage: number
}

export interface Expense {
  id: string
  name: string
  description?: string | null
  category?: string | null
  amount: number
  recurrence_type: 'once' | 'monthly' | 'custom'
  recurrence_interval?: number | null
  recurrence_unit?: 'days' | 'weeks' | 'months' | null
  start_date: string
  end_date?: string | null
  responsibility: ExpenseResponsibility[]
  is_active: boolean
  created_at: string
  updated_at: string
  created_by?: string | null
}

export interface ExpenseOccurrence {
  id: string
  expense_id: string
  occurrence_date: string
  amount: number
  status: 'pending' | 'paid' | 'cancelled'
  paid_at?: string | null
  notes?: string | null
  created_at: string
  expense?: Expense
}

export interface ExpenseInput {
  name: string
  description?: string | null
  category?: string | null
  amount: number
  recurrence_type: 'once' | 'monthly' | 'custom'
  recurrence_interval?: number | null
  recurrence_unit?: 'days' | 'weeks' | 'months' | null
  start_date: string
  end_date?: string | null
  responsibility: ExpenseResponsibility[]
}

// Expense calculation result
export interface ProfessionalExpenses {
  total: number
  details: {
    name: string
    amount: number
    expense_id: string
  }[]
}
