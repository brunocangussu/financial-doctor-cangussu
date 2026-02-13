/**
 * Script de recalculo em lote dos atendimentos
 *
 * Uso:
 *   npx tsx scripts/recalculate-appointments.ts --dry-run   # apenas mostra mudancas
 *   npx tsx scripts/recalculate-appointments.ts              # aplica as correcoes
 *
 * O script reutiliza as funcoes de calculo existentes de calculations.ts
 * para garantir 100% de consistencia com a logica da aplicacao.
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Carregar .env.local (dotenv por padrao so carrega .env)
config({ path: resolve(__dirname, '../.env.local') })
import { createClient } from '@supabase/supabase-js'

// Path aliases nao funcionam com tsx, importar com caminhos relativos
import {
  calculateAppointment,
  calculateBonusFromRules,
  findApplicableSplitRule,
  applySplitDistribution,
  determineOwnerProfessionalId,
  type CalculationInput,
  type CalculationResult,
} from '../src/lib/calculations'

import type {
  Professional,
  Procedure,
  SystemSetting,
  CardFeeRule,
  CardFeeTierRate,
  CurrentFeeTierInfo,
  BonusRule,
  SplitRule,
  Appointment,
} from '../src/types'

// ─── Configuracao ────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run')
const VERBOSE = process.argv.includes('--verbose')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Erro: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou NEXT_PUBLIC_SUPABASE_ANON_KEY) devem estar definidos em .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function isSignificantlyDifferent(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) > tolerance
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(70))
  console.log('  RECALCULO EM LOTE DOS ATENDIMENTOS')
  console.log(`  Modo: ${DRY_RUN ? 'DRY RUN (apenas simulacao)' : 'EXECUCAO REAL'}`)
  console.log('='.repeat(70))
  console.log()

  // 1. Buscar dados de referencia
  console.log('Buscando dados de referencia...')

  const [
    { data: professionals, error: profErr },
    { data: procedures, error: procErr },
    { data: systemSettings, error: settErr },
    { data: bonusRules, error: bonusErr },
    { data: splitRules, error: splitErr },
  ] = await Promise.all([
    supabase.from('professionals').select('*'),
    supabase.from('procedures').select('*'),
    supabase.from('system_settings').select('*'),
    supabase.from('bonus_rules').select('*').eq('is_active', true),
    supabase.from('split_rules').select('*').eq('is_active', true),
  ])

  if (profErr || procErr || settErr || bonusErr || splitErr) {
    console.error('Erro ao buscar dados de referencia:', { profErr, procErr, settErr, bonusErr, splitErr })
    process.exit(1)
  }

  // Buscar card fee rules (tier system ou legado)
  const cardFeeRules = await fetchCardFeeRules()

  // System settings
  const settings = (systemSettings || []) as SystemSetting[]
  const defaultTaxPercentage = parseFloat(
    settings.find(s => s.key === 'default_tax_percentage')?.value || '3'
  )
  const vanessaBonusPercentage = parseFloat(
    settings.find(s => s.key === 'vanessa_bonus_percentage')?.value || '1.5'
  )

  // Owner professional
  const ownerProfessionalId = determineOwnerProfessionalId(
    (professionals || []) as Professional[],
    settings
  )

  const ownerName = (professionals as Professional[])?.find(p => p.id === ownerProfessionalId)?.name || '?'

  console.log(`  Profissionais: ${(professionals || []).length}`)
  console.log(`  Procedimentos: ${(procedures || []).length}`)
  console.log(`  Split Rules: ${(splitRules || []).length}`)
  console.log(`  Bonus Rules: ${(bonusRules || []).length}`)
  console.log(`  Card Fee Rules: ${cardFeeRules.length}`)
  console.log(`  Owner: ${ownerName} (${ownerProfessionalId})`)
  console.log(`  Imposto padrao: ${defaultTaxPercentage}%`)
  console.log(`  Bonus Vanessa padrao: ${vanessaBonusPercentage}%`)
  console.log()

  if (!ownerProfessionalId) {
    console.error('ERRO: Nao foi possivel determinar o ownerProfessionalId!')
    process.exit(1)
  }

  // 2. Buscar todos os atendimentos
  console.log('Buscando atendimentos...')
  const { data: appointments, error: appErr } = await supabase
    .from('appointments')
    .select('*, professional:professionals(*), procedure:procedures(*)')
    .order('date', { ascending: true })

  if (appErr) {
    console.error('Erro ao buscar atendimentos:', appErr)
    process.exit(1)
  }

  const allAppointments = (appointments || []) as Appointment[]
  console.log(`  Total: ${allAppointments.length} atendimentos`)
  console.log()

  // 3. Recalcular cada atendimento
  let updated = 0
  let unchanged = 0
  let errors = 0
  let totalDiffBruno = 0
  let totalDiffProfessional = 0

  for (const apt of allAppointments) {
    try {
      const professional = (professionals as Professional[]).find(p => p.id === apt.professional_id)
      const procedure = (procedures as Procedure[]).find(p => p.id === apt.procedure_id)

      if (!professional || !procedure) {
        if (VERBOSE) {
          console.log(`  SKIP ${apt.date} ${apt.patient_name}: profissional ou procedimento nao encontrado`)
        }
        errors++
        continue
      }

      // Construir source
      const source = {
        id: '',
        name: apt.is_hospital ? 'Hospital' : 'Clinica',
        is_hospital: apt.is_hospital,
        custom_tax_percentage: apt.is_hospital ? 0 : null as number | null,
        is_active: true,
        created_at: '',
      }

      // Montar input
      const input: CalculationInput = {
        grossValue: apt.gross_value,
        netValueInput: apt.net_value_input || null,
        paymentMethodId: apt.payment_method_id || '',
        source,
        procedure,
        professional,
        cardFeeRules,
        defaultTaxPercentage,
        vanessaBonusPercentage,
        bonusRules: (bonusRules || []) as BonusRule[],
        splitRules: (splitRules || []) as SplitRule[],
        ownerProfessionalId,
      }

      // Recalcular
      let result: CalculationResult

      if (apt.net_value_input && apt.net_value_input > 0) {
        // Atendimento com valor liquido manual - recalcular com base no valor manual
        result = recalculateWithManualNet(apt, input, procedure, professional, ownerProfessionalId)
      } else {
        result = calculateAppointment(input)
      }

      // Comparar com valores armazenados
      const hasDiff =
        isSignificantlyDifferent(apt.final_value_bruno, result.finalValueBruno) ||
        isSignificantlyDifferent(apt.final_value_professional, result.finalValueProfessional) ||
        isSignificantlyDifferent(apt.vanessa_bonus, result.vanessaBonus) ||
        isSignificantlyDifferent(apt.net_value, result.netValue) ||
        isSignificantlyDifferent(apt.professional_share, result.professionalShare)

      if (!hasDiff) {
        unchanged++
        if (VERBOSE) {
          console.log(`  OK ${apt.date} ${apt.patient_name} - sem mudanca`)
        }
        continue
      }

      // Logar diferenca
      const diffBruno = result.finalValueBruno - apt.final_value_bruno
      const diffProf = result.finalValueProfessional - apt.final_value_professional
      totalDiffBruno += diffBruno
      totalDiffProfessional += diffProf

      console.log(`  DIFF ${apt.date} | ${apt.patient_name} | ${procedure.name} | ${professional.name}`)
      if (isSignificantlyDifferent(apt.net_value, result.netValue)) {
        console.log(`       Liquido:      ${formatCurrency(apt.net_value)} -> ${formatCurrency(result.netValue)}`)
      }
      if (isSignificantlyDifferent(apt.final_value_bruno, result.finalValueBruno)) {
        console.log(`       Valor ${ownerName}:  ${formatCurrency(apt.final_value_bruno)} -> ${formatCurrency(result.finalValueBruno)} (${diffBruno >= 0 ? '+' : ''}${formatCurrency(diffBruno)})`)
      }
      if (isSignificantlyDifferent(apt.final_value_professional, result.finalValueProfessional)) {
        console.log(`       Valor Prof:   ${formatCurrency(apt.final_value_professional)} -> ${formatCurrency(result.finalValueProfessional)} (${diffProf >= 0 ? '+' : ''}${formatCurrency(diffProf)})`)
      }
      if (isSignificantlyDifferent(apt.vanessa_bonus, result.vanessaBonus)) {
        console.log(`       Bonus:        ${formatCurrency(apt.vanessa_bonus)} -> ${formatCurrency(result.vanessaBonus)}`)
      }
      if (isSignificantlyDifferent(apt.professional_share, result.professionalShare)) {
        console.log(`       Share:        ${apt.professional_share}% -> ${result.professionalShare}%`)
      }

      // Atualizar (se nao dry-run)
      if (!DRY_RUN) {
        const { error: updateErr } = await supabase
          .from('appointments')
          .update({
            card_fee_percentage: result.cardFeePercentage,
            card_fee_value: result.cardFeeValue,
            tax_percentage: result.taxPercentage,
            tax_value: result.taxValue,
            procedure_cost: result.procedureCost,
            net_value: result.netValue,
            vanessa_bonus: result.vanessaBonus,
            professional_share: result.professionalShare,
            final_value_bruno: result.finalValueBruno,
            final_value_professional: result.finalValueProfessional,
          })
          .eq('id', apt.id)

        if (updateErr) {
          console.error(`       ERRO ao atualizar: ${updateErr.message}`)
          errors++
          continue
        }
      }

      updated++
    } catch (err) {
      console.error(`  ERRO ${apt.date} ${apt.patient_name}:`, err)
      errors++
    }
  }

  // 4. Relatorio final
  console.log()
  console.log('='.repeat(70))
  console.log('  RELATORIO FINAL')
  console.log('='.repeat(70))
  console.log(`  Total de atendimentos: ${allAppointments.length}`)
  console.log(`  Sem mudanca:           ${unchanged}`)
  console.log(`  ${DRY_RUN ? 'Mudarias' : 'Atualizados'}:          ${updated}`)
  console.log(`  Erros:                 ${errors}`)
  console.log()
  console.log(`  Diferenca total ${ownerName}: ${totalDiffBruno >= 0 ? '+' : ''}${formatCurrency(totalDiffBruno)}`)
  console.log(`  Diferenca total Prof:  ${totalDiffProfessional >= 0 ? '+' : ''}${formatCurrency(totalDiffProfessional)}`)
  console.log()

  if (DRY_RUN && updated > 0) {
    console.log('  >>> Execute sem --dry-run para aplicar as correcoes <<<')
  }
  if (!DRY_RUN && updated > 0) {
    console.log('  Correcoes aplicadas com sucesso!')
  }
}

// ─── Card Fee Rules ──────────────────────────────────────────────────────────

async function fetchCardFeeRules(): Promise<CardFeeRule[]> {
  // Tentar buscar via sistema de tiers primeiro
  const { data: tierInfo } = await supabase
    .from('current_fee_tier_info')
    .select('*')
    .single()

  if (tierInfo) {
    const currentTier = tierInfo as CurrentFeeTierInfo
    const { data: tierRates } = await supabase
      .from('card_fee_tier_rates')
      .select('*')
      .eq('tier_id', currentTier.id)

    if (tierRates && tierRates.length > 0) {
      return (tierRates as CardFeeTierRate[]).map(rate => ({
        id: rate.id,
        payment_method_id: rate.payment_method_id,
        min_value: 0,
        max_value: null,
        fee_percentage: rate.fee_percentage,
        created_at: rate.created_at,
        updated_at: rate.created_at,
      } as CardFeeRule))
    }
  }

  // Fallback: card_fee_rules legado
  const { data: legacyRules } = await supabase
    .from('card_fee_rules')
    .select('*')

  return (legacyRules || []) as CardFeeRule[]
}

// ─── Recalculo com net value manual ──────────────────────────────────────────

/**
 * Para atendimentos que foram salvos com net_value_input (valor liquido manual),
 * precisamos recalcular bonus e split baseados no valor manual, nao no calculado.
 */
function recalculateWithManualNet(
  apt: Appointment,
  input: CalculationInput,
  procedure: Procedure,
  professional: Professional,
  ownerProfessionalId: string
): CalculationResult {
  // Primeiro, calcular normalmente para obter card_fee, tax, etc
  const baseResult = calculateAppointment(input)

  // Usar o net_value_input como o valor liquido real
  const manualNet = apt.net_value_input!
  const procedureCost = procedure.fixed_cost
  const valueAfterProcedure = manualNet + procedureCost
  const taxRate = (apt.is_hospital ? 0 : input.defaultTaxPercentage) / 100
  const valueAfterCardFee = taxRate > 0
    ? valueAfterProcedure / (1 - taxRate)
    : valueAfterProcedure
  const customCardFeeValue = input.grossValue - valueAfterCardFee
  const customCardFeePercentage = input.grossValue > 0
    ? (customCardFeeValue / input.grossValue) * 100
    : 0
  const taxValue = taxRate > 0 ? valueAfterCardFee * taxRate : 0

  // Recalcular bonus com o valor manual
  let vanessaBonus = 0
  if (input.bonusRules && input.bonusRules.length > 0) {
    const { totalBonus } = calculateBonusFromRules(
      input.grossValue, manualNet, manualNet,
      procedure.id, professional.id, input.bonusRules
    )
    vanessaBonus = totalBonus
  } else {
    const isEndolaser = procedure.name.toLowerCase().includes('endolaser')
    const isValquiria = professional.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('valquiria')
    if (isEndolaser && !isValquiria && procedure.has_vanessa_bonus) {
      const effectivePercentage = procedure.vanessa_bonus_percentage || input.vanessaBonusPercentage
      vanessaBonus = manualNet * (effectivePercentage / 100)
    }
  }

  // Recalcular split com o valor manual
  let finalValueBruno = manualNet
  let finalValueProfessional = 0
  let professionalShare = 0

  if (input.splitRules && input.splitRules.length > 0) {
    const rule = findApplicableSplitRule(procedure.id, professional.id, input.splitRules)
    if (rule) {
      const split = applySplitDistribution(manualNet, rule, ownerProfessionalId)
      finalValueBruno = split.finalValueBruno
      finalValueProfessional = split.finalValueProfessional
      professionalShare = split.professionalShare
    }
  } else {
    const isEndolaser = procedure.name.toLowerCase().includes('endolaser')
    const isValquiria = professional.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('valquiria')
    if (isEndolaser && isValquiria) {
      professionalShare = 50
      finalValueBruno = manualNet * 0.5
      finalValueProfessional = manualNet * 0.5
    } else if (isValquiria) {
      professionalShare = 100
      finalValueBruno = 0
      finalValueProfessional = manualNet
    }
  }

  return {
    grossValue: input.grossValue,
    cardFeePercentage: Math.max(0, customCardFeePercentage),
    cardFeeValue: Math.max(0, customCardFeeValue),
    valueAfterCardFee,
    taxPercentage: apt.is_hospital ? 0 : input.defaultTaxPercentage,
    taxValue,
    valueAfterTax: valueAfterProcedure,
    procedureCost,
    totalProcedureCost: procedureCost,
    netValue: manualNet,
    vanessaBonus,
    professionalShare,
    finalValueBruno: finalValueBruno,
    finalValueProfessional: finalValueProfessional,
  }
}

// ─── Execucao ────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('Erro fatal:', err)
  process.exit(1)
})
