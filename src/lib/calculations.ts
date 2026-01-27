/**
 * Financial Doctor - Core Calculation Logic
 *
 * Regras de Calculo:
 *
 * Fluxo Padrao:
 * 1. Taxa Cartao - desconto baseado na forma de pagamento
 * 2. Imposto - 3% padrao (0% para hospitais)
 * 3. Custo do Procedimento - valor fixo por tipo
 * 4. Liquido Final = Valor Base - Imposto - Custo
 *
 * Regras Especiais (CONFIGURÁVEIS):
 * - Regras de Bonus: Configuradas no banco de dados (bonus_rules)
 *   Ex: Endolaser + Bruno = Vanessa recebe 1.5% do liquido
 * - Regras de Divisao: Configuradas no banco de dados (split_rules)
 *   Ex: Endolaser + Valquiria = 50/50 entre Bruno e Valquiria
 * - Memorial (Hospital): Usa valor liquido da NF direto
 */

import type { CardFeeRule, Procedure, Professional, Source, BonusRule, SplitRule } from '@/types'

export interface CalculationInput {
  grossValue: number
  netValueInput?: number | null // For hospital NF (bypasses calculation)
  paymentMethodId: string
  source: Source
  procedure: Procedure
  professional: Professional
  cardFeeRules: CardFeeRule[]
  defaultTaxPercentage: number
  vanessaBonusPercentage: number // Fallback if no bonus rules
  bonusRules?: BonusRule[] // Configurable bonus rules from database
  splitRules?: SplitRule[] // Configurable split rules from database
}

export interface CalculationResult {
  grossValue: number
  cardFeePercentage: number
  cardFeeValue: number
  valueAfterCardFee: number
  taxPercentage: number
  taxValue: number
  valueAfterTax: number
  procedureCost: number  // Primary procedure cost (for backward compatibility)
  totalProcedureCost: number  // Sum of all procedures' costs
  netValue: number
  vanessaBonus: number
  professionalShare: number
  finalValueBruno: number
  finalValueProfessional: number
}

export interface MultiProcedureCalculationInput {
  grossValue: number
  netValueInput?: number | null
  paymentMethodId: string
  source: Source
  procedures: Procedure[]  // Array of procedures
  professional: Professional
  cardFeeRules: CardFeeRule[]
  defaultTaxPercentage: number
  vanessaBonusPercentage: number
  bonusRules?: BonusRule[] // Configurable bonus rules from database
  splitRules?: SplitRule[] // Configurable split rules from database
}

/**
 * Find applicable bonus rules based on procedure and professional
 * Returns array of matching rules sorted by specificity (most specific first)
 */
export function findApplicableBonusRules(
  procedureId: string | null,
  professionalId: string | null,
  bonusRules: BonusRule[]
): BonusRule[] {
  if (!bonusRules || bonusRules.length === 0) return []

  return bonusRules
    .filter((rule) => {
      if (!rule.is_active) return false

      // Check if rule matches the procedure
      const procedureMatches = !rule.procedure_id || rule.procedure_id === procedureId

      // Check if rule matches the professional
      const professionalMatches = !rule.professional_id || rule.professional_id === professionalId

      return procedureMatches && professionalMatches
    })
    .sort((a, b) => {
      // Sort by specificity: rules with both conditions first, then procedure-only, then professional-only, then generic
      const specificityA = (a.procedure_id ? 2 : 0) + (a.professional_id ? 1 : 0)
      const specificityB = (b.procedure_id ? 2 : 0) + (b.professional_id ? 1 : 0)
      return specificityB - specificityA
    })
}

/**
 * Calculate total bonus based on applicable rules
 */
export function calculateBonusFromRules(
  grossValue: number,
  netValue: number,
  valueAfterCosts: number,
  procedureId: string | null,
  professionalId: string | null,
  bonusRules: BonusRule[]
): { totalBonus: number; appliedRules: BonusRule[] } {
  const applicableRules = findApplicableBonusRules(procedureId, professionalId, bonusRules)

  let totalBonus = 0
  const appliedRules: BonusRule[] = []

  for (const rule of applicableRules) {
    let baseValue = 0
    switch (rule.base_value) {
      case 'gross_value':
        baseValue = grossValue
        break
      case 'net_value':
        baseValue = netValue
        break
      case 'final_after_costs':
        baseValue = valueAfterCosts
        break
      default:
        baseValue = netValue
    }

    const bonusAmount = baseValue * (rule.percentage / 100)
    totalBonus += bonusAmount
    appliedRules.push(rule)
  }

  return { totalBonus, appliedRules }
}

/**
 * Find the applicable card fee percentage for a given payment method and value
 */
export function findCardFeePercentage(
  paymentMethodId: string,
  value: number,
  cardFeeRules: CardFeeRule[]
): number {
  const applicableRules = cardFeeRules.filter(
    (rule) => rule.payment_method_id === paymentMethodId
  )

  if (applicableRules.length === 0) return 0

  // Find the rule that matches the value range
  const matchingRule = applicableRules.find((rule) => {
    const minOk = value >= rule.min_value
    const maxOk = rule.max_value === null || value <= rule.max_value
    return minOk && maxOk
  })

  return matchingRule?.fee_percentage ?? 0
}

/**
 * Main calculation function
 * Implements all business rules for financial calculations
 */
export function calculateAppointment(input: CalculationInput): CalculationResult {
  const {
    grossValue,
    netValueInput,
    paymentMethodId,
    source,
    procedure,
    professional,
    cardFeeRules,
    defaultTaxPercentage,
    vanessaBonusPercentage,
  } = input

  // Standard calculation flow
  // Hospital: applies card fee but NO tax (tax = 0%)

  // Step 1: Card fee
  const cardFeePercentage = findCardFeePercentage(
    paymentMethodId,
    grossValue,
    cardFeeRules
  )
  const cardFeeValue = grossValue * (cardFeePercentage / 100)
  const valueAfterCardFee = grossValue - cardFeeValue

  // Step 2: Tax (3% default, 0% for hospitals, or custom)
  // IMPORTANTE: O imposto é calculado sobre o VALOR BRUTO, não sobre o valor após taxa
  let taxPercentage = defaultTaxPercentage
  if (source.is_hospital) {
    taxPercentage = source.custom_tax_percentage ?? 0
  }
  const taxValue = grossValue * (taxPercentage / 100)
  const valueAfterTax = valueAfterCardFee - taxValue

  // Step 3: Procedure cost
  const procedureCost = procedure.fixed_cost
  const netValue = valueAfterTax - procedureCost

  // Step 4: Professional splits and bonuses
  let vanessaBonus = 0
  let finalValueBruno = netValue
  let finalValueProfessional = 0
  let professionalShare = 0

  // Use configurable bonus rules if available
  if (input.bonusRules && input.bonusRules.length > 0) {
    // Use the new configurable bonus rules system
    const { totalBonus } = calculateBonusFromRules(
      grossValue,
      netValue,
      netValue, // valueAfterCosts is same as netValue here
      procedure.id,
      professional.id,
      input.bonusRules
    )
    vanessaBonus = totalBonus
    finalValueBruno = netValue
  } else {
    // Fallback to legacy hardcoded logic for backward compatibility
    const isEndolaser = procedure.name.toLowerCase().includes('endolaser')
    const isValquiria = professional.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('valquiria')

    if (isEndolaser) {
      if (isValquiria) {
        // Endolaser + Valquiria: 50/50 split (legacy)
        professionalShare = 50
        finalValueBruno = netValue * 0.5
        finalValueProfessional = netValue * 0.5
      } else {
        // Endolaser + Bruno: Vanessa bonus (legacy - uses procedure config)
        if (procedure.has_vanessa_bonus) {
          const effectivePercentage = procedure.vanessa_bonus_percentage || vanessaBonusPercentage
          vanessaBonus = netValue * (effectivePercentage / 100)
        }
        finalValueBruno = netValue
      }
    } else {
      // Non-Endolaser procedures
      if (isValquiria) {
        // 100% to Valquiria (legacy)
        professionalShare = 100
        finalValueBruno = 0
        finalValueProfessional = netValue
      }
    }
  }

  // TODO: Also implement split_rules for configurable splits (50/50, 100% to professional, etc.)
  // For now, split logic remains in the legacy code above

  return {
    grossValue,
    cardFeePercentage,
    cardFeeValue,
    valueAfterCardFee,
    taxPercentage,
    taxValue,
    valueAfterTax,
    procedureCost,
    totalProcedureCost: procedureCost,
    netValue,
    vanessaBonus,
    professionalShare,
    finalValueBruno,
    finalValueProfessional,
  }
}

/**
 * Calculate appointment with multiple procedures
 * Sums costs from all procedures and applies bonus rules if ANY procedure qualifies
 */
export function calculateAppointmentMultiProcedure(input: MultiProcedureCalculationInput): CalculationResult {
  const {
    grossValue,
    netValueInput,
    paymentMethodId,
    source,
    procedures,
    professional,
    cardFeeRules,
    defaultTaxPercentage,
    vanessaBonusPercentage,
  } = input

  // Use first procedure as primary for backward compatibility
  const primaryProcedure = procedures[0]

  // Calculate total procedure cost (sum of all procedures)
  const totalProcedureCost = procedures.reduce((sum, proc) => sum + proc.fixed_cost, 0)

  // Check if ANY procedure has Vanessa bonus and SUM the percentages
  const proceduresWithBonus = procedures.filter((proc) => proc.has_vanessa_bonus)
  const hasVanessaBonus = proceduresWithBonus.length > 0
  // Soma as porcentagens de todos os procedimentos com bonus
  const effectiveVanessaPercentage = hasVanessaBonus
    ? proceduresWithBonus.reduce((sum, p) => sum + (p.vanessa_bonus_percentage || vanessaBonusPercentage), 0)
    : 0

  // Check if ANY procedure is Endolaser
  const hasEndolaser = procedures.some((proc) =>
    proc.name.toLowerCase().includes('endolaser')
  )

  // Standard calculation flow
  // Hospital: applies card fee but NO tax (tax = 0%)

  // Step 1: Card fee
  const cardFeePercentage = findCardFeePercentage(
    paymentMethodId,
    grossValue,
    cardFeeRules
  )
  const cardFeeValue = grossValue * (cardFeePercentage / 100)
  const valueAfterCardFee = grossValue - cardFeeValue

  // Step 2: Tax (3% default, 0% for hospitals, or custom)
  // IMPORTANTE: O imposto é calculado sobre o VALOR BRUTO, não sobre o valor após taxa
  let taxPercentage = defaultTaxPercentage
  if (source.is_hospital) {
    taxPercentage = source.custom_tax_percentage ?? 0
  }
  const taxValue = grossValue * (taxPercentage / 100)
  const valueAfterTax = valueAfterCardFee - taxValue

  // Step 3: Total procedure cost (sum of all procedures)
  const netValue = valueAfterTax - totalProcedureCost

  // Step 4: Professional splits and bonuses
  let vanessaBonus = 0
  let finalValueBruno = netValue
  let finalValueProfessional = 0
  let professionalShare = 0

  // Use configurable bonus rules if available
  if (input.bonusRules && input.bonusRules.length > 0) {
    // Calculate bonus for each procedure and sum them up
    let totalBonus = 0
    for (const proc of procedures) {
      const { totalBonus: procBonus } = calculateBonusFromRules(
        grossValue,
        netValue,
        netValue,
        proc.id,
        professional.id,
        input.bonusRules
      )
      totalBonus += procBonus
    }
    vanessaBonus = totalBonus
    finalValueBruno = netValue
  } else {
    // Fallback to legacy hardcoded logic
    const isValquiria = professional.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('valquiria')

    if (hasEndolaser) {
      if (isValquiria) {
        // Endolaser + Valquiria: 50/50 split (legacy)
        professionalShare = 50
        finalValueBruno = netValue * 0.5
        finalValueProfessional = netValue * 0.5
      } else {
        // Endolaser + Bruno: Vanessa bonus (legacy)
        if (hasVanessaBonus) {
          vanessaBonus = netValue * (effectiveVanessaPercentage / 100)
        }
        finalValueBruno = netValue
      }
    } else {
      // Non-Endolaser procedures
      if (isValquiria) {
        // 100% to Valquiria (legacy)
        professionalShare = 100
        finalValueBruno = 0
        finalValueProfessional = netValue
      }
    }
  }

  return {
    grossValue,
    cardFeePercentage,
    cardFeeValue,
    valueAfterCardFee,
    taxPercentage,
    taxValue,
    valueAfterTax,
    procedureCost: primaryProcedure?.fixed_cost ?? 0,
    totalProcedureCost,
    netValue,
    vanessaBonus,
    professionalShare,
    finalValueBruno,
    finalValueProfessional,
  }
}

/**
 * Format currency for display (Brazilian Real)
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`
}

/**
 * Parse currency string to number
 */
export function parseCurrency(value: string): number {
  // Remove currency symbol, dots (thousands separator), and replace comma with dot
  const cleaned = value
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  return parseFloat(cleaned) || 0
}
