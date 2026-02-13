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

import type { CardFeeRule, Procedure, Professional, Source, BonusRule, SplitRule, SystemSetting } from '@/types'

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
  ownerProfessionalId?: string // Owner professional ID for correct split attribution
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
  ownerProfessionalId?: string // Owner professional ID for correct split attribution
}

/**
 * Determine the owner professional ID from system settings or professionals list
 * The owner is the person whose share goes to finalValueBruno
 */
export function determineOwnerProfessionalId(
  professionals: Professional[],
  systemSettings?: SystemSetting[]
): string | undefined {
  // Check system setting first
  const settingValue = systemSettings?.find(s => s.key === 'owner_professional_id')?.value
  if (settingValue) return settingValue

  // Heuristic fallback: owner is the professional whose name is NOT Valquíria
  const owner = professionals.find(p =>
    !p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('valquiria')
  )
  return owner?.id
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
 * Calculate specificity of a split rule (reusable helper)
 * Higher = more specific: procedure+professional(3) > procedure(2) > professional(1) > generic(0)
 */
export function splitRuleSpecificity(rule: SplitRule): number {
  return (rule.procedure_id ? 2 : 0) + (rule.professional_id ? 1 : 0)
}

/**
 * Find the best applicable split rule for a given procedure and professional
 * Returns the most specific matching rule, or null if none match
 */
export function findApplicableSplitRule(
  procedureId: string | null,
  professionalId: string | null,
  splitRules: SplitRule[]
): SplitRule | null {
  if (!splitRules || splitRules.length === 0) return null

  const matching = splitRules
    .filter((rule) => {
      if (!rule.is_active) return false
      const procedureMatches = !rule.procedure_id || rule.procedure_id === procedureId
      const professionalMatches = !rule.professional_id || rule.professional_id === professionalId
      return procedureMatches && professionalMatches
    })
    .sort((a, b) => {
      const specDiff = splitRuleSpecificity(b) - splitRuleSpecificity(a)
      if (specDiff !== 0) return specDiff
      return b.priority - a.priority
    })

  return matching[0] ?? null
}

/**
 * Apply split distribution from a rule
 * Validates distributions and returns safe defaults (100% Bruno) for invalid rules
 *
 * IMPORTANT: Uses ownerProfessionalId to determine which share goes to finalValueBruno (owner)
 * vs finalValueProfessional (non-owner). This correctly handles the case where
 * the owner IS the appointment's professional (e.g., Bruno doing Endolaser Bruno).
 */
export function applySplitDistribution(
  netValue: number,
  rule: SplitRule,
  ownerProfessionalId: string
): { finalValueBruno: number; finalValueProfessional: number; professionalShare: number } {
  const defaultResult = { finalValueBruno: netValue, finalValueProfessional: 0, professionalShare: 0 }

  if (!rule.distributions || rule.distributions.length === 0) {
    console.warn(`[applySplitDistribution] Rule "${rule.name}" has empty distributions, defaulting to 100% Bruno`)
    return defaultResult
  }

  const totalPercentage = rule.distributions.reduce((sum, d) => sum + d.percentage, 0)
  if (Math.abs(totalPercentage - 100) > 0.01) {
    console.warn(`[applySplitDistribution] Rule "${rule.name}" distributions sum to ${totalPercentage}%, not 100%. Defaulting to 100% Bruno`)
    return defaultResult
  }

  let finalValueBruno = 0
  let finalValueProfessional = 0
  let professionalShare = 0

  for (const dist of rule.distributions) {
    const share = netValue * (dist.percentage / 100)
    if (dist.professional_id === ownerProfessionalId) {
      // Owner's share → finalValueBruno
      finalValueBruno += share
    } else {
      // Non-owner share → finalValueProfessional (payout)
      finalValueProfessional += share
      professionalShare += dist.percentage
    }
  }

  return { finalValueBruno, finalValueProfessional, professionalShare }
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

  const isEndolaser = procedure.name.toLowerCase().includes('endolaser')
  const isValquiria = professional.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('valquiria')

  // Step 4a: Calculate bonuses
  if (input.bonusRules && input.bonusRules.length > 0) {
    const { totalBonus } = calculateBonusFromRules(
      grossValue,
      netValue,
      netValue,
      procedure.id,
      professional.id,
      input.bonusRules
    )
    vanessaBonus = totalBonus
  } else {
    // Legacy bonus logic
    if (isEndolaser && !isValquiria && procedure.has_vanessa_bonus) {
      const effectivePercentage = procedure.vanessa_bonus_percentage || vanessaBonusPercentage
      vanessaBonus = netValue * (effectivePercentage / 100)
    }
  }

  // Step 4b: Apply professional split logic (always, regardless of bonus source)
  if (input.splitRules && input.splitRules.length > 0 && input.ownerProfessionalId) {
    // Database-driven split rules
    const rule = findApplicableSplitRule(procedure.id, professional.id, input.splitRules)
    if (rule) {
      const split = applySplitDistribution(netValue, rule, input.ownerProfessionalId)
      finalValueBruno = split.finalValueBruno
      finalValueProfessional = split.finalValueProfessional
      professionalShare = split.professionalShare
    }
    // No match or invalid rule → default 100% Bruno (already set)
  } else if (!input.splitRules || input.splitRules.length === 0) {
    // Fallback legado (hardcoded por nomes) — sem split_rules no banco
    if (isEndolaser && isValquiria) {
      professionalShare = 50
      finalValueBruno = netValue * 0.5
      finalValueProfessional = netValue * 0.5
    } else if (isValquiria) {
      professionalShare = 100
      finalValueBruno = 0
      finalValueProfessional = netValue
    }
  }
  // else: splitRules exist but ownerProfessionalId not provided → default 100% Bruno (safe)

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

  const isValquiria = professional.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('valquiria')

  // Step 4a: Calculate bonuses
  if (input.bonusRules && input.bonusRules.length > 0) {
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
  } else {
    // Legacy bonus logic
    if (hasEndolaser && !isValquiria && hasVanessaBonus) {
      vanessaBonus = netValue * (effectiveVanessaPercentage / 100)
    }
  }

  // Step 4b: Apply professional split logic (always, regardless of bonus source)
  if (input.splitRules && input.splitRules.length > 0 && input.ownerProfessionalId) {
    // Database-driven split rules: find best rule across all procedures
    let bestRule: SplitRule | null = null
    let bestSpecificity = -1

    for (const proc of procedures) {
      const rule = findApplicableSplitRule(proc.id, professional.id, input.splitRules)
      if (rule) {
        const spec = splitRuleSpecificity(rule)
        if (spec > bestSpecificity || (spec === bestSpecificity && rule.priority > (bestRule?.priority ?? -1))) {
          bestRule = rule
          bestSpecificity = spec
        }
      }
    }

    if (bestRule) {
      const split = applySplitDistribution(netValue, bestRule, input.ownerProfessionalId)
      finalValueBruno = split.finalValueBruno
      finalValueProfessional = split.finalValueProfessional
      professionalShare = split.professionalShare
    }
    // No match or invalid rule → default 100% Bruno (already set)
  } else if (!input.splitRules || input.splitRules.length === 0) {
    // Fallback legado (hardcoded por nomes) — sem split_rules no banco
    if (hasEndolaser && isValquiria) {
      professionalShare = 50
      finalValueBruno = netValue * 0.5
      finalValueProfessional = netValue * 0.5
    } else if (isValquiria) {
      professionalShare = 100
      finalValueBruno = 0
      finalValueProfessional = netValue
    }
  }
  // else: splitRules exist but ownerProfessionalId not provided → default 100% Bruno (safe)

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
