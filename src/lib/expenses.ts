/**
 * Lógica de cálculo de despesas
 * Financial Doctor
 */

import {
  startOfMonth,
  addDays,
  addWeeks,
  addMonths,
  isWithinInterval,
  isBefore,
  isAfter,
} from 'date-fns'
import type { Expense, ProfessionalExpenses } from '@/types'

/**
 * Gera as datas de ocorrências de uma despesa dentro de um período
 */
export function generateExpenseOccurrences(
  expense: Expense,
  periodStart: Date,
  periodEnd: Date
): Date[] {
  const occurrences: Date[] = []

  // Parse das datas da despesa com correção de timezone
  const expenseStart = new Date(expense.start_date + 'T12:00:00')
  const expenseEnd = expense.end_date ? new Date(expense.end_date + 'T12:00:00') : null

  // Se a despesa terminou antes do período, não há ocorrências
  if (expenseEnd && isBefore(expenseEnd, periodStart)) {
    return occurrences
  }

  // Se a despesa começa depois do período, não há ocorrências
  if (isAfter(expenseStart, periodEnd)) {
    return occurrences
  }

  if (expense.recurrence_type === 'once') {
    // Despesa pontual: só inclui se start_date está no período
    if (isWithinInterval(expenseStart, { start: periodStart, end: periodEnd })) {
      occurrences.push(expenseStart)
    }
  } else if (expense.recurrence_type === 'monthly') {
    // Mensal: uma ocorrência por mês
    let current = startOfMonth(expenseStart)

    while (!isAfter(current, periodEnd)) {
      // Só adiciona se está dentro do período e da vigência da despesa
      if (
        !isBefore(current, periodStart) &&
        !isBefore(current, startOfMonth(expenseStart)) &&
        (!expenseEnd || !isAfter(current, expenseEnd))
      ) {
        occurrences.push(current)
      }
      current = addMonths(current, 1)
    }
  } else if (expense.recurrence_type === 'custom' && expense.recurrence_interval) {
    // Personalizado: calcula baseado no intervalo
    let current = new Date(expenseStart)

    while (!isAfter(current, periodEnd)) {
      // Só adiciona se está dentro do período e da vigência da despesa
      if (
        !isBefore(current, periodStart) &&
        (!expenseEnd || !isAfter(current, expenseEnd))
      ) {
        occurrences.push(current)
      }

      // Avança pelo intervalo
      if (expense.recurrence_unit === 'days') {
        current = addDays(current, expense.recurrence_interval)
      } else if (expense.recurrence_unit === 'weeks') {
        current = addWeeks(current, expense.recurrence_interval)
      } else {
        current = addMonths(current, expense.recurrence_interval)
      }
    }
  }

  return occurrences
}

/**
 * Calcula o total de despesas de um profissional em um período
 */
export function calculateProfessionalExpenses(
  professionalId: string,
  expenses: Expense[],
  startDate: Date,
  endDate: Date
): ProfessionalExpenses {
  let total = 0
  const details: ProfessionalExpenses['details'] = []

  for (const expense of expenses) {
    // Verifica se a despesa está ativa
    if (!expense.is_active) continue

    // Verifica se o profissional é responsável por esta despesa
    const responsibility = expense.responsibility.find(
      (r) => r.professional_id === professionalId
    )
    if (!responsibility) continue

    // Gera as ocorrências dentro do período
    const occurrences = generateExpenseOccurrences(expense, startDate, endDate)

    if (occurrences.length === 0) continue

    // Calcula o valor proporcional do profissional
    const perOccurrence = expense.amount * (responsibility.percentage / 100)
    const expenseTotal = perOccurrence * occurrences.length

    total += expenseTotal
    details.push({
      name: responsibility.percentage < 100
        ? `${expense.name} (${responsibility.percentage}%)`
        : expense.name,
      amount: expenseTotal,
      expense_id: expense.id,
    })
  }

  return { total, details }
}

/**
 * Calcula o total de despesas para todos os profissionais em um período
 */
export function calculateAllProfessionalsExpenses(
  professionalIds: string[],
  expenses: Expense[],
  startDate: Date,
  endDate: Date
): Map<string, ProfessionalExpenses> {
  const result = new Map<string, ProfessionalExpenses>()

  for (const professionalId of professionalIds) {
    result.set(
      professionalId,
      calculateProfessionalExpenses(professionalId, expenses, startDate, endDate)
    )
  }

  return result
}

/**
 * Formata a recorrência para exibição
 */
export function formatRecurrence(expense: Expense): string {
  switch (expense.recurrence_type) {
    case 'once':
      return 'Pontual'
    case 'monthly':
      return 'Mensal'
    case 'custom':
      if (!expense.recurrence_interval || !expense.recurrence_unit) {
        return 'Personalizado'
      }
      const unitMap: Record<string, string> = {
        days: expense.recurrence_interval === 1 ? 'dia' : 'dias',
        weeks: expense.recurrence_interval === 1 ? 'semana' : 'semanas',
        months: expense.recurrence_interval === 1 ? 'mês' : 'meses',
      }
      return `A cada ${expense.recurrence_interval} ${unitMap[expense.recurrence_unit]}`
    default:
      return expense.recurrence_type
  }
}

/**
 * Categorias de despesas disponíveis
 */
export const EXPENSE_CATEGORIES = [
  { value: 'aluguel', label: 'Aluguel' },
  { value: 'equipamento', label: 'Equipamento' },
  { value: 'material', label: 'Material' },
  { value: 'servicos', label: 'Serviços' },
  { value: 'impostos', label: 'Impostos' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'software', label: 'Software' },
  { value: 'outros', label: 'Outros' },
] as const

/**
 * Retorna o label de uma categoria
 */
export function getCategoryLabel(category: string | null | undefined): string {
  if (!category) return 'Sem categoria'
  const found = EXPENSE_CATEGORIES.find((c) => c.value === category)
  return found?.label || category
}
