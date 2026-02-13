'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Calculator, X, Check, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  useProfessionals,
  useProcedures,
  usePaymentMethods,
  useCurrentTierCardFeeRules,
  useSystemSettings,
  usePatientNameSuggestions,
  useBonusRules,
  useSplitRules,
} from '@/lib/hooks'
import { calculateAppointmentMultiProcedure, calculateBonusFromRules, findApplicableSplitRule, applySplitDistribution, splitRuleSpecificity, determineOwnerProfessionalId, formatCurrency, type CalculationResult } from '@/lib/calculations'
import type { Procedure, Professional, Source, SplitRule } from '@/types'

export function AtendimentoForm() {
  const router = useRouter()
  const supabase = createClient()

  // Form state
  const [date, setDate] = useState<Date>(new Date())
  const [patientName, setPatientName] = useState('')
  const [patientNameOpen, setPatientNameOpen] = useState(false)
  const [professionalId, setProfessionalId] = useState('')
  const [selectedProcedureIds, setSelectedProcedureIds] = useState<string[]>([])
  const [proceduresOpen, setProceduresOpen] = useState(false)
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [isHospital, setIsHospital] = useState(false)
  const [grossValue, setGrossValue] = useState('')
  const [netValueInput, setNetValueInput] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  // Manual net value editing (for non-hospital cases)
  const [useManualNet, setUseManualNet] = useState(false)
  const [manualNetValue, setManualNetValue] = useState('')
  const [calculatedCardFee, setCalculatedCardFee] = useState<number | null>(null)

  // Calculation preview
  const [calculation, setCalculation] = useState<CalculationResult | null>(null)

  // Data hooks
  const { data: professionals } = useProfessionals()
  const { data: procedures } = useProcedures()
  const { data: paymentMethods } = usePaymentMethods()
  const { data: cardFeeRules, currentTier } = useCurrentTierCardFeeRules()
  const { data: systemSettings } = useSystemSettings()
  const { suggestions: patientSuggestions } = usePatientNameSuggestions(patientName)
  const { data: bonusRules } = useBonusRules()
  const { data: splitRules } = useSplitRules()

  // Get selected entities
  const selectedProfessional = professionals.find((p) => p.id === professionalId)
  const selectedProcedures = useMemo(
    () => procedures.filter((p) => selectedProcedureIds.includes(p.id)),
    [procedures, selectedProcedureIds]
  )
  const primaryProcedure = selectedProcedures[0] || null

  // Toggle procedure selection
  const toggleProcedure = (procedureId: string) => {
    setSelectedProcedureIds((prev) =>
      prev.includes(procedureId)
        ? prev.filter((id) => id !== procedureId)
        : [...prev, procedureId]
    )
  }

  // Remove procedure from selection
  const removeProcedure = (procedureId: string) => {
    setSelectedProcedureIds((prev) => prev.filter((id) => id !== procedureId))
  }

  // Get system settings
  const defaultTaxPercentage = parseFloat(
    systemSettings.find((s) => s.key === 'default_tax_percentage')?.value || '3'
  )
  const vanessaBonusPercentage = parseFloat(
    systemSettings.find((s) => s.key === 'vanessa_bonus_percentage')?.value || '1.5'
  )

  // Determine owner professional ID for correct split attribution
  const ownerProfessionalId = useMemo(
    () => determineOwnerProfessionalId(professionals, systemSettings),
    [professionals, systemSettings]
  )

  // Dynamic owner name from database
  const ownerName = professionals.find(p => p.id === ownerProfessionalId)?.name || 'Bruno'

  // Calculate preview when form changes
  useEffect(() => {
    const grossValueNum = parseFloat(grossValue.replace(/\D/g, '')) / 100
    const netValueInputNum = netValueInput
      ? parseFloat(netValueInput.replace(/\D/g, '')) / 100
      : null
    const manualNetValueNum = manualNetValue
      ? parseFloat(manualNetValue.replace(/\D/g, '')) / 100
      : null

    if (
      grossValueNum > 0 &&
      selectedProfessional &&
      selectedProcedures.length > 0 &&
      paymentMethodId
    ) {
      // Create a source object based on isHospital checkbox
      const sourceForCalc: Source = {
        id: '',
        name: isHospital ? 'Hospital' : 'Clinica',
        is_hospital: isHospital,
        custom_tax_percentage: isHospital ? 0 : null,
        is_active: true,
        created_at: '',
      }

      // Calculate with standard rules first
      // Hospital: imposto = 0%, mas aplica taxa de cartão normalmente
      let result = calculateAppointmentMultiProcedure({
        grossValue: grossValueNum,
        netValueInput: null,
        paymentMethodId,
        source: sourceForCalc,
        procedures: selectedProcedures as Procedure[],
        professional: selectedProfessional as Professional,
        cardFeeRules,
        defaultTaxPercentage: isHospital ? 0 : defaultTaxPercentage,
        vanessaBonusPercentage,
        bonusRules: bonusRules.filter(r => r.is_active),
        splitRules: splitRules.filter(r => r.is_active),
        ownerProfessionalId,
      })

      // Se hospital com valor liquido informado manualmente (diferente do calculado)
      // OU se nao-hospital com valor liquido manual ativado
      const effectiveManualNet = isHospital ? netValueInputNum : (useManualNet ? manualNetValueNum : null)
      const taxRateForCalc = isHospital ? 0 : defaultTaxPercentage

      if (effectiveManualNet && Math.abs(effectiveManualNet - result.netValue) > 0.01) {
        // Calculate the effective card fee from the manual net value
        // Net = Gross - CardFee - Tax - ProcedureCost
        const totalProcedureCost = selectedProcedures.reduce((sum, p) => sum + p.fixed_cost, 0)
        const valueAfterProcedure = effectiveManualNet + totalProcedureCost

        // Para hospital: taxRate = 0, entao valueAfterCardFee = valueAfterProcedure
        // Para nao-hospital: valueAfterCardFee * (1 - taxRate) = valueAfterProcedure
        const taxRate = taxRateForCalc / 100
        const valueAfterCardFee = taxRate > 0
          ? valueAfterProcedure / (1 - taxRate)
          : valueAfterProcedure

        // CardFee = Gross - valueAfterCardFee
        const customCardFeeValue = grossValueNum - valueAfterCardFee
        const customCardFeePercentage = grossValueNum > 0 ? (customCardFeeValue / grossValueNum) * 100 : 0
        const taxValue = taxRate > 0 ? valueAfterCardFee * taxRate : 0

        // Store calculated card fee for display
        setCalculatedCardFee(customCardFeePercentage)

        // Recalculate professional splits with the manual net value
        let vanessaBonus = 0
        let finalValueBruno = effectiveManualNet
        let finalValueProfessional = 0
        let professionalShare = 0

        // Bonus: recalculate with manual net value
        const activeBonusRules = bonusRules.filter(r => r.is_active)
        if (activeBonusRules.length > 0) {
          let totalBonus = 0
          for (const proc of selectedProcedures) {
            const { totalBonus: procBonus } = calculateBonusFromRules(
              grossValueNum, effectiveManualNet, effectiveManualNet,
              proc.id, selectedProfessional.id, activeBonusRules
            )
            totalBonus += procBonus
          }
          vanessaBonus = totalBonus
        } else {
          // Legacy bonus
          const hasEndolaser = selectedProcedures.some((proc) => proc.name.toLowerCase().includes('endolaser'))
          const proceduresWithBonus = selectedProcedures.filter((proc) => proc.has_vanessa_bonus)
          const hasVanessaBonus = proceduresWithBonus.length > 0
          const effectiveVanessaPercentage = hasVanessaBonus
            ? proceduresWithBonus.reduce((sum, p) => sum + (p.vanessa_bonus_percentage || vanessaBonusPercentage), 0)
            : 0
          const isValquiria = selectedProfessional.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('valquiria')
          if (hasEndolaser && !isValquiria && hasVanessaBonus) {
            vanessaBonus = effectiveManualNet * (effectiveVanessaPercentage / 100)
          }
        }

        // Split: use centralized functions
        const activeSplitRules = splitRules.filter(r => r.is_active)
        if (activeSplitRules.length > 0) {
          // Find best rule across all procedures
          let bestRule: SplitRule | null = null
          let bestSpec = -1
          for (const proc of selectedProcedures) {
            const rule = findApplicableSplitRule(proc.id, selectedProfessional.id, activeSplitRules)
            if (rule) {
              const spec = splitRuleSpecificity(rule)
              if (spec > bestSpec || (spec === bestSpec && rule.priority > (bestRule?.priority ?? -1))) {
                bestRule = rule
                bestSpec = spec
              }
            }
          }
          if (bestRule && ownerProfessionalId) {
            const split = applySplitDistribution(effectiveManualNet, bestRule, ownerProfessionalId)
            finalValueBruno = split.finalValueBruno
            finalValueProfessional = split.finalValueProfessional
            professionalShare = split.professionalShare
          }
        } else {
          // Fallback legado
          const hasEndolaser = selectedProcedures.some((proc) => proc.name.toLowerCase().includes('endolaser'))
          const isValquiria = selectedProfessional.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('valquiria')
          if (hasEndolaser && isValquiria) {
            professionalShare = 50
            finalValueBruno = effectiveManualNet * 0.5
            finalValueProfessional = effectiveManualNet * 0.5
          } else if (isValquiria) {
            professionalShare = 100
            finalValueBruno = 0
            finalValueProfessional = effectiveManualNet
          }
        }

        result = {
          ...result,
          cardFeePercentage: customCardFeePercentage,
          cardFeeValue: customCardFeeValue,
          valueAfterCardFee,
          taxPercentage: taxRateForCalc,
          taxValue,
          valueAfterTax: valueAfterProcedure,
          netValue: effectiveManualNet,
          vanessaBonus,
          professionalShare,
          finalValueBruno,
          finalValueProfessional,
        }
      } else {
        setCalculatedCardFee(null)
      }

      setCalculation(result)
    } else {
      setCalculation(null)
      setCalculatedCardFee(null)
    }
  }, [
    grossValue,
    netValueInput,
    manualNetValue,
    useManualNet,
    professionalId,
    selectedProcedureIds,
    paymentMethodId,
    selectedProfessional,
    selectedProcedures,
    cardFeeRules,
    defaultTaxPercentage,
    vanessaBonusPercentage,
    isHospital,
    bonusRules,
    splitRules,
    ownerProfessionalId,
  ])

  // Format currency input
  const handleCurrencyInput = (
    value: string,
    setter: (value: string) => void
  ) => {
    const numbers = value.replace(/\D/g, '')
    if (numbers === '') {
      setter('')
      return
    }
    const amount = parseInt(numbers) / 100
    setter(
      amount.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!calculation || selectedProcedureIds.length === 0) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }

    setLoading(true)
    try {
      const grossValueNum = parseFloat(grossValue.replace(/\D/g, '')) / 100
      const netValueInputNum = netValueInput
        ? parseFloat(netValueInput.replace(/\D/g, '')) / 100
        : null
      const manualNetValueNum = manualNetValue
        ? parseFloat(manualNetValue.replace(/\D/g, '')) / 100
        : null

      // Determine net_value_input based on source type and manual override
      let finalNetValueInput: number | null = null
      if (isHospital) {
        finalNetValueInput = netValueInputNum
      } else if (useManualNet && manualNetValueNum) {
        finalNetValueInput = manualNetValueNum
      }

      // Insert the appointment with primary procedure (first selected)
      const { data: appointmentData, error: appointmentError } = await supabase
        .from('appointments')
        .insert({
          date: format(date, 'yyyy-MM-dd'),
          patient_name: patientName,
          professional_id: professionalId,
          procedure_id: selectedProcedureIds[0], // Primary procedure
          payment_method_id: paymentMethodId,
          is_hospital: isHospital,
          gross_value: grossValueNum,
          net_value_input: finalNetValueInput,
          card_fee_percentage: calculation.cardFeePercentage,
          card_fee_value: calculation.cardFeeValue,
          tax_percentage: calculation.taxPercentage,
          tax_value: calculation.taxValue,
          procedure_cost: calculation.procedureCost, // Primary procedure cost
          total_procedure_cost: calculation.totalProcedureCost, // Sum of all procedures
          net_value: calculation.netValue,
          vanessa_bonus: calculation.vanessaBonus,
          professional_share: calculation.professionalShare,
          final_value_bruno: calculation.finalValueBruno,
          final_value_professional: calculation.finalValueProfessional,
          notes,
        })
        .select('id')
        .single()

      if (appointmentError) throw appointmentError

      // Insert all procedures into the junction table
      if (selectedProcedureIds.length > 0 && appointmentData) {
        const procedureInserts = selectedProcedureIds.map((procId, index) => ({
          appointment_id: appointmentData.id,
          procedure_id: procId,
          sequence_order: index,
        }))

        const { error: junctionError } = await supabase
          .from('appointment_procedures')
          .insert(procedureInserts)

        if (junctionError) {
          console.error('Error inserting procedures:', junctionError)
          // Don't fail the whole operation if junction insert fails
        }
      }

      toast.success('Atendimento registrado com sucesso!')
      router.push('/atendimentos')
    } catch (error) {
      console.error('Error saving appointment:', error)
      toast.error('Erro ao salvar atendimento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Dados do Atendimento</CardTitle>
              <CardDescription>
                Preencha os dados do atendimento para calcular os valores automaticamente
              </CardDescription>
            </div>
            {currentTier && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-sm">
                  Faixa: {currentTier.name}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  (Fat. anterior: {formatCurrency(currentTier.previous_month_revenue)})
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: Date and Patient */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data do Atendimento</Label>
              <DatePickerInput
                value={date}
                onChange={(d) => d && setDate(d)}
                placeholder="dd/mm/aaaa"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="patientName">Nome Paciente | Pagamento</Label>
              <div className="relative">
                <Input
                  id="patientName"
                  placeholder="Digite para buscar ou criar novo"
                  value={patientName}
                  onChange={(e) => {
                    setPatientName(e.target.value)
                    setPatientNameOpen(true)
                  }}
                  onFocus={() => patientSuggestions.length > 0 && setPatientNameOpen(true)}
                  onBlur={() => setTimeout(() => setPatientNameOpen(false), 150)}
                  required
                  autoComplete="off"
                />
                {patientNameOpen && patientSuggestions.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md">
                    <div className="py-1">
                      {patientSuggestions.map((suggestion) => (
                        <div
                          key={suggestion}
                          className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            setPatientName(suggestion)
                            setPatientNameOpen(false)
                          }}
                        >
                          {suggestion}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Professional and Procedure */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Profissional</Label>
              <Select value={professionalId} onValueChange={setProfessionalId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o profissional" />
                </SelectTrigger>
                <SelectContent>
                  {professionals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Procedimento(s)</Label>
              <Popover open={proceduresOpen} onOpenChange={setProceduresOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={proceduresOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedProcedureIds.length === 0
                      ? 'Selecione o(s) procedimento(s)'
                      : `${selectedProcedureIds.length} selecionado(s)`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar procedimento..." />
                    <CommandList>
                      <CommandEmpty>Nenhum procedimento encontrado.</CommandEmpty>
                      <CommandGroup>
                        {procedures.map((p) => (
                          <CommandItem
                            key={p.id}
                            value={p.name}
                            onSelect={() => toggleProcedure(p.id)}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                selectedProcedureIds.includes(p.id)
                                  ? 'opacity-100'
                                  : 'opacity-0'
                              )}
                            />
                            {p.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {/* Show selected procedures as badges */}
              {selectedProcedures.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedProcedures.map((proc) => (
                    <Badge
                      key={proc.id}
                      variant="secondary"
                      className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => removeProcedure(proc.id)}
                    >
                      {proc.name}
                      <X className="ml-1 h-3 w-3" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Payment Method and Gross Value */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Forma de Pagamento</Label>
              <Select value={paymentMethodId} onValueChange={setPaymentMethodId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a forma de pagamento" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="grossValue">Valor Bruto (R$)</Label>
              <Input
                id="grossValue"
                placeholder="0,00"
                value={grossValue}
                onChange={(e) => handleCurrencyInput(e.target.value, setGrossValue)}
                required
              />
            </div>
          </div>

          {/* Hospital checkbox */}
          <div className="flex items-center gap-3">
            <Switch
              id="isHospital"
              checked={isHospital}
              onCheckedChange={(checked) => {
                setIsHospital(checked)
                // Quando marcar hospital, auto-preencher valor líquido calculado
                if (checked && grossValue && paymentMethodId) {
                  const grossValueNum = parseFloat(grossValue.replace(/\D/g, '')) / 100
                  if (grossValueNum > 0) {
                    // Calcular valor líquido: Bruto - Taxa Cartão - Custo Procedimento (sem imposto)
                    const cardFee = cardFeeRules.find(r => r.payment_method_id === paymentMethodId)
                    const cardFeePercentage = cardFee?.fee_percentage || 0
                    const cardFeeValue = grossValueNum * (cardFeePercentage / 100)
                    const totalProcCost = selectedProcedures.reduce((sum, p) => sum + p.fixed_cost, 0)
                    const estimatedNet = grossValueNum - cardFeeValue - totalProcCost
                    // Formatar e preencher
                    const formatted = Math.max(0, estimatedNet).toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })
                    setNetValueInput(formatted)
                  }
                }
              }}
            />
            <Label htmlFor="isHospital" className="cursor-pointer">
              Equiparação hospitalar (sem imposto)
            </Label>
          </div>

          {/* Net Value Input (only for hospitals) */}
          {isHospital && (
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="netValueInput">Valor Líquido da NF (R$)</Label>
              <Input
                id="netValueInput"
                placeholder="0,00"
                value={netValueInput}
                onChange={(e) => handleCurrencyInput(e.target.value, setNetValueInput)}
              />
              <p className="text-xs text-muted-foreground">
                Valor pré-calculado com taxa de cartão. Ajuste se necessário.
              </p>
            </div>
          )}

          {/* Row 5b: Manual Net Value (for non-hospital cases) */}
          {!isHospital && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="useManualNet" className="text-base cursor-pointer">
                    Informar valor líquido manualmente
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Ative para informar o valor líquido e calcular a taxa automaticamente
                  </p>
                </div>
                <Switch
                  id="useManualNet"
                  checked={useManualNet}
                  onCheckedChange={(checked) => {
                    setUseManualNet(checked)
                    if (!checked) {
                      setManualNetValue('')
                      setCalculatedCardFee(null)
                    }
                  }}
                />
              </div>

              {useManualNet && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="manualNetValue">Valor Líquido Esperado (R$)</Label>
                    <Input
                      id="manualNetValue"
                      placeholder="0,00"
                      value={manualNetValue}
                      onChange={(e) => handleCurrencyInput(e.target.value, setManualNetValue)}
                    />
                  </div>
                  {calculatedCardFee !== null && (
                    <div className="space-y-2">
                      <Label>Taxa Calculada</Label>
                      <div className="h-10 flex items-center px-3 rounded-md border bg-muted">
                        <span className="text-sm font-medium">
                          {calculatedCardFee.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Input
              id="notes"
              placeholder="Observações sobre o atendimento"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Calculation Preview */}
      {calculation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Preview dos Cálculos
              {useManualNet && manualNetValue && !isHospital && (
                <Badge variant="secondary" className="ml-2">Manual</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {useManualNet && manualNetValue && !isHospital
                ? 'Valores calculados com base no valor líquido informado manualmente'
                : 'Valores calculados automaticamente com base nas regras configuradas'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor Bruto</span>
                <span className="font-medium">{formatCurrency(calculation.grossValue)}</span>
              </div>

              {!isHospital && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      (-) {useManualNet && manualNetValue ? 'Taxas' : 'Taxa Cartão'} ({calculation.cardFeePercentage.toFixed(2)}%)
                      {useManualNet && manualNetValue && (
                        <Badge variant="outline" className="ml-2 text-xs">calculada</Badge>
                      )}
                    </span>
                    <span className="text-destructive">
                      -{formatCurrency(calculation.cardFeeValue)}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      (-) Imposto ({calculation.taxPercentage}%)
                    </span>
                    <span className="text-destructive">
                      -{formatCurrency(calculation.taxValue)}
                    </span>
                  </div>

                  {calculation.totalProcedureCost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        (-) Custo{selectedProcedures.length > 1 ? 's' : ''} do{selectedProcedures.length > 1 ? 's' : ''} Procedimento{selectedProcedures.length > 1 ? 's' : ''}
                      </span>
                      <span className="text-destructive">
                        -{formatCurrency(calculation.totalProcedureCost)}
                      </span>
                    </div>
                  )}
                </>
              )}

              {isHospital && calculation.taxValue > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">(-) Desconto NF Hospital</span>
                  <span className="text-destructive">
                    -{formatCurrency(calculation.taxValue)}
                  </span>
                </div>
              )}

              <Separator />

              <div className="flex justify-between font-medium">
                <span>Valor Líquido</span>
                <span className="text-primary">{formatCurrency(calculation.netValue)}</span>
              </div>

              {calculation.vanessaBonus > 0 && (() => {
                // Soma as porcentagens de todos os procedimentos com bonus
                const procsWithBonus = selectedProcedures.filter(p => p.has_vanessa_bonus)
                const bonusPercentage = procsWithBonus.length > 0
                  ? procsWithBonus.reduce((sum, p) => sum + (p.vanessa_bonus_percentage || 1.5), 0)
                  : 1.5
                return (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Repasse Vanessa ({bonusPercentage}%)</span>
                    <span>{formatCurrency(calculation.vanessaBonus)}</span>
                  </div>
                )
              })()}

              {(calculation.finalValueBruno > 0 && calculation.finalValueProfessional > 0) && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor {ownerName}</span>
                    <span className="font-medium">
                      {formatCurrency(calculation.finalValueBruno)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Valor {selectedProfessional?.name}{calculation.professionalShare === 50 ? ' (50%)' : ''}
                    </span>
                    <span className="font-medium">
                      {formatCurrency(calculation.finalValueProfessional)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Button */}
      <div className="flex gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={loading || !calculation || selectedProcedureIds.length === 0}>
          {loading ? 'Salvando...' : 'Registrar Pagamento'}
        </Button>
      </div>
    </form>
  )
}
