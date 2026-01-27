'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Download, Check, FileText, ChevronDown, ChevronUp, ArrowUpDown, Pencil, Eye, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

import { AppLayout } from '@/components/app-layout'
import { Button } from '@/components/ui/button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, calculateAppointment } from '@/lib/calculations'
import { useProfessionals, useUserProfile, useProcedures, usePaymentMethods, useCurrentTierCardFeeRules, useSystemSettings, useExpenses } from '@/lib/hooks'
import { calculateProfessionalExpenses } from '@/lib/expenses'
import type { ProfessionalExpenses } from '@/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { Appointment, Transfer, VanessaPayment } from '@/types'

export default function RepassesPage() {
  // Memoize supabase client
  const supabase = useMemo(() => createClient(), [])
  const { data: professionals, loading: loadingProfessionals } = useProfessionals()
  const { data: procedures } = useProcedures()
  const { data: paymentMethods } = usePaymentMethods()
  const { data: cardFeeRules } = useCurrentTierCardFeeRules()
  const { data: systemSettings } = useSystemSettings()
  const { isAdmin } = useUserProfile()
  const { data: expenses } = useExpenses(true) // Apenas despesas ativas

  // Date range state - default to current month
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()))
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()))

  // Data state
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [vanessaPayments, setVanessaPayments] = useState<VanessaPayment[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog state
  const [payDialogOpen, setPayDialogOpen] = useState(false)
  const [selectedTransfer, setSelectedTransfer] = useState<{
    type: 'professional' | 'vanessa'
    professionalId?: string
    professionalName?: string
    amount: number
    monthStart?: Date
    monthEnd?: Date
    monthLabel?: string
  } | null>(null)
  const [paying, setPaying] = useState(false)

  // View/Edit/Delete dialog state
  const [viewDialogOpen, setViewDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
  // Note: selectedTransfer now includes monthStart/monthEnd for per-month payment
  const [deleting, setDeleting] = useState(false)
  const [editDate, setEditDate] = useState<Date>(new Date())
  const [editPatientName, setEditPatientName] = useState('')
  const [editProfessionalId, setEditProfessionalId] = useState('')
  const [editProcedureId, setEditProcedureId] = useState('')
  const [editPaymentMethodId, setEditPaymentMethodId] = useState('')
  const [editIsHospital, setEditIsHospital] = useState(false)
  const [editGrossValue, setEditGrossValue] = useState('')
  const [editNetValue, setEditNetValue] = useState('')
  const [editUseManualNet, setEditUseManualNet] = useState(false)
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Month selector helpers
  const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const YEARS = [2024, 2025, 2026, 2027]

  const setStartMonth = (month: number) => {
    setStartDate(new Date(startDate.getFullYear(), month, 1))
  }
  const setStartYear = (year: number) => {
    setStartDate(new Date(year, startDate.getMonth(), 1))
  }
  const setEndMonth = (month: number) => {
    const d = new Date(endDate.getFullYear(), month, 1)
    setEndDate(endOfMonth(d))
  }
  const setEndYear = (year: number) => {
    const d = new Date(year, endDate.getMonth(), 1)
    setEndDate(endOfMonth(d))
  }

  // Months in the selected range
  const monthsInRange = useMemo(() => {
    const months: { start: Date; end: Date; label: string }[] = []
    let current = startOfMonth(startDate)
    const endLimit = startOfMonth(endDate)
    while (current <= endLimit) {
      months.push({
        start: current,
        end: endOfMonth(current),
        label: format(current, "MMMM 'de' yyyy", { locale: ptBR }),
      })
      current = addMonths(current, 1)
    }
    return months
  }, [startDate, endDate])

  // Filter and sort state - Profissionais
  const [filterProfessional, setFilterProfessional] = useState<string>('all')
  const [expandedProfessionals, setExpandedProfessionals] = useState<Set<string>>(new Set())
  const [sortProfField, setSortProfField] = useState<'date' | 'patient' | 'value'>('date')
  const [sortProfOrder, setSortProfOrder] = useState<'asc' | 'desc'>('desc')

  // Filter and sort state - Vanessa
  const [sortVanessaField, setSortVanessaField] = useState<'date' | 'patient' | 'value' | 'bonus'>('date')
  const [sortVanessaOrder, setSortVanessaOrder] = useState<'asc' | 'desc'>('desc')

  // Toggle expand/collapse
  const toggleProfessional = (profId: string) => {
    setExpandedProfessionals(prev => {
      const newSet = new Set(prev)
      if (newSet.has(profId)) {
        newSet.delete(profId)
      } else {
        newSet.add(profId)
      }
      return newSet
    })
  }

  const expandAll = () => {
    const allIds: string[] = []
    monthlyData.forEach((md) => {
      Object.keys(md.professionalTotals).forEach((profId) => {
        allIds.push(`${profId}-${format(md.monthStart, 'yyyy-MM')}`)
      })
    })
    setExpandedProfessionals(new Set(allIds))
  }

  const collapseAll = () => {
    setExpandedProfessionals(new Set())
  }

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true)

    const startStr = format(startDate, 'yyyy-MM-dd')
    const endStr = format(endDate, 'yyyy-MM-dd')

    try {
      // Fetch appointments for the period
      const { data: appointmentsData, error: appError } = await supabase
        .from('appointments')
        .select(`
          *,
          professional:professionals(*),
          procedure:procedures(*),
          payment_method:payment_methods(*)
        `)
        .gte('date', startStr)
        .lte('date', endStr)

      if (appError) {
        console.error('[Repasses] Error fetching appointments:', appError)
      } else if (appointmentsData) {
        setAppointments(appointmentsData as Appointment[])
      }

      // Fetch existing transfers
      const { data: transfersData, error: transError } = await supabase
        .from('transfers')
        .select('*, professional:professionals(*)')
        .gte('period_start', startStr)
        .lte('period_end', endStr)

      if (transError) {
        console.error('[Repasses] Error fetching transfers:', transError)
      } else if (transfersData) {
        setTransfers(transfersData as Transfer[])
      }

      // Fetch Vanessa payments
      const { data: vanessaData, error: vanessaError } = await supabase
        .from('vanessa_payments')
        .select('*')
        .gte('period_start', startStr)
        .lte('period_end', endStr)

      if (vanessaError) {
        console.error('[Repasses] Error fetching vanessa payments:', vanessaError)
      } else if (vanessaData) {
        setVanessaPayments(vanessaData as VanessaPayment[])
      }
    } catch (error) {
      console.error('[Repasses] Exception:', error)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Calculate expenses per professional
  const professionalExpenses = useMemo(() => {
    const expensesMap: Record<string, ProfessionalExpenses> = {}
    professionals.forEach((prof) => {
      expensesMap[prof.id] = calculateProfessionalExpenses(
        prof.id,
        expenses,
        startDate,
        endDate
      )
    })
    return expensesMap
  }, [professionals, expenses, startDate, endDate])

  // Calculate totals per professional
  // Cada profissional recebe sua parte conforme as regras de divisao
  const professionalTotals = professionals.reduce<
    Record<string, { name: string; total: number; appointments: Appointment[]; field: string; expenses: ProfessionalExpenses; netAfterExpenses: number }>
  >((acc, prof) => {
    // Verificar se é Bruno (pelo nome) - ele recebe de final_value_bruno de TODOS os atendimentos
    const isBruno = prof.name.toLowerCase() === 'bruno'
    const profExpenses = professionalExpenses[prof.id] || { total: 0, details: [] }

    if (isBruno) {
      // Bruno recebe a soma de final_value_bruno de todos os atendimentos
      const allAppointmentsWithBrunoValue = appointments.filter(a => a.final_value_bruno > 0)
      const total = allAppointmentsWithBrunoValue.reduce((sum, a) => sum + a.final_value_bruno, 0)

      if (total > 0 || profExpenses.total > 0) {
        acc[prof.id] = {
          name: prof.name,
          total,
          appointments: allAppointmentsWithBrunoValue,
          field: 'final_value_bruno',
          expenses: profExpenses,
          netAfterExpenses: total - profExpenses.total
        }
      }
    } else {
      // Outros profissionais recebem final_value_professional dos atendimentos que executaram
      const profAppointments = appointments.filter(
        (a) => a.professional_id === prof.id && a.final_value_professional > 0
      )
      const total = profAppointments.reduce((sum, a) => sum + a.final_value_professional, 0)

      if (total > 0 || profExpenses.total > 0) {
        acc[prof.id] = {
          name: prof.name,
          total,
          appointments: profAppointments,
          field: 'final_value_professional',
          expenses: profExpenses,
          netAfterExpenses: total - profExpenses.total
        }
      }
    }
    return acc
  }, {})

  // Calculate Vanessa bonus total
  const vanessaTotal = appointments.reduce((sum, a) => sum + a.vanessa_bonus, 0)
  const vanessaAppointments = appointments.filter((a) => a.vanessa_bonus > 0)

  // Filter professionals
  const filteredProfessionalTotals = filterProfessional === 'all'
    ? professionalTotals
    : Object.fromEntries(
        Object.entries(professionalTotals).filter(([id]) => id === filterProfessional)
      )

  // Sort function for appointments
  const sortAppointments = (apps: Appointment[], field: string, order: 'asc' | 'desc', valueField: string) => {
    return [...apps].sort((a, b) => {
      let comparison = 0
      switch (field) {
        case 'date':
          comparison = new Date(a.date).getTime() - new Date(b.date).getTime()
          break
        case 'patient':
          comparison = (a.patient_name || '').localeCompare(b.patient_name || '')
          break
        case 'value':
          comparison = a.net_value - b.net_value
          break
        case 'bonus':
          comparison = a.vanessa_bonus - b.vanessa_bonus
          break
        default:
          comparison = 0
      }
      return order === 'asc' ? comparison : -comparison
    })
  }

  // Sorted Vanessa appointments
  const sortedVanessaAppointments = sortAppointments(vanessaAppointments, sortVanessaField, sortVanessaOrder, 'vanessa_bonus')

  // Per-month data computation
  const monthlyData = useMemo(() => {
    return monthsInRange.map(({ start: mStart, end: mEnd, label }) => {
      // Filter appointments for this month
      const monthAppts = appointments.filter((a) => {
        const d = new Date(a.date + 'T12:00:00')
        return d >= mStart && d <= mEnd
      })

      // Calculate expenses per professional for this month
      const monthExpenses: Record<string, ProfessionalExpenses> = {}
      professionals.forEach((prof) => {
        monthExpenses[prof.id] = calculateProfessionalExpenses(prof.id, expenses, mStart, mEnd)
      })

      // Calculate professional totals for this month
      const profTotals = professionals.reduce<
        Record<string, { name: string; total: number; appointments: Appointment[]; field: string; expenses: ProfessionalExpenses; netAfterExpenses: number }>
      >((acc, prof) => {
        const isBruno = prof.name.toLowerCase() === 'bruno'
        const profExp = monthExpenses[prof.id] || { total: 0, details: [] }

        if (isBruno) {
          const brunoAppts = monthAppts.filter((a) => a.final_value_bruno > 0)
          const total = brunoAppts.reduce((sum, a) => sum + a.final_value_bruno, 0)
          if (total > 0 || profExp.total > 0) {
            acc[prof.id] = { name: prof.name, total, appointments: brunoAppts, field: 'final_value_bruno', expenses: profExp, netAfterExpenses: total - profExp.total }
          }
        } else {
          const profAppts = monthAppts.filter((a) => a.professional_id === prof.id && a.final_value_professional > 0)
          const total = profAppts.reduce((sum, a) => sum + a.final_value_professional, 0)
          if (total > 0 || profExp.total > 0) {
            acc[prof.id] = { name: prof.name, total, appointments: profAppts, field: 'final_value_professional', expenses: profExp, netAfterExpenses: total - profExp.total }
          }
        }
        return acc
      }, {})

      // Vanessa bonus for this month
      const vanessaAppts = monthAppts.filter((a) => a.vanessa_bonus > 0)
      const vanessaTotal = monthAppts.reduce((sum, a) => sum + a.vanessa_bonus, 0)

      return {
        label,
        monthStart: mStart,
        monthEnd: mEnd,
        professionalTotals: profTotals,
        vanessaAppointments: vanessaAppts,
        vanessaTotal,
      }
    })
  }, [monthsInRange, appointments, professionals, expenses])

  // Check if transfer exists for a specific month
  const getTransferForMonth = (professionalId: string, monthStart: Date, monthEnd: Date) => {
    const startStr = format(monthStart, 'yyyy-MM-dd')
    const endStr = format(monthEnd, 'yyyy-MM-dd')
    return transfers.find(
      (t) => t.professional_id === professionalId && t.period_start === startStr && t.period_end === endStr
    )
  }

  const getVanessaPaymentForMonth = (monthStart: Date, monthEnd: Date) => {
    const startStr = format(monthStart, 'yyyy-MM-dd')
    const endStr = format(monthEnd, 'yyyy-MM-dd')
    return vanessaPayments.find(
      (v) => v.period_start === startStr && v.period_end === endStr
    )
  }

  // Legacy helpers (kept for backward compatibility with existing transfer records)
  const getTransferStatus = (professionalId: string) => {
    return transfers.find((t) => t.professional_id === professionalId)
  }

  const getVanessaPaymentStatus = () => {
    return vanessaPayments.length > 0 ? vanessaPayments[0] : null
  }

  // Mark as paid (per month)
  const handleMarkAsPaid = async () => {
    if (!selectedTransfer || !selectedTransfer.monthStart || !selectedTransfer.monthEnd) return

    setPaying(true)
    try {
      const startStr = format(selectedTransfer.monthStart, 'yyyy-MM-dd')
      const endStr = format(selectedTransfer.monthEnd, 'yyyy-MM-dd')

      if (selectedTransfer.type === 'professional' && selectedTransfer.professionalId) {
        const existingTransfer = getTransferForMonth(selectedTransfer.professionalId, selectedTransfer.monthStart, selectedTransfer.monthEnd)

        if (existingTransfer) {
          await supabase
            .from('transfers')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
            })
            .eq('id', existingTransfer.id)
        } else {
          await supabase.from('transfers').insert({
            professional_id: selectedTransfer.professionalId,
            period_start: startStr,
            period_end: endStr,
            total_amount: selectedTransfer.amount,
            status: 'paid',
            paid_at: new Date().toISOString(),
          })
        }
      } else if (selectedTransfer.type === 'vanessa') {
        const existingPayment = getVanessaPaymentForMonth(selectedTransfer.monthStart, selectedTransfer.monthEnd)

        if (existingPayment) {
          await supabase
            .from('vanessa_payments')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
            })
            .eq('id', existingPayment.id)
        } else {
          await supabase.from('vanessa_payments').insert({
            period_start: startStr,
            period_end: endStr,
            total_bonus: selectedTransfer.amount,
            status: 'paid',
            paid_at: new Date().toISOString(),
          })
        }
      }

      toast.success('Pagamento registrado com sucesso!')
      setPayDialogOpen(false)
      setSelectedTransfer(null)

      // Refresh data for full range
      const rangeStartStr = format(startDate, 'yyyy-MM-dd')
      const rangeEndStr = format(endDate, 'yyyy-MM-dd')

      const { data: newTransfers } = await supabase
        .from('transfers')
        .select('*, professional:professionals(*)')
        .gte('period_start', rangeStartStr)
        .lte('period_end', rangeEndStr)
      if (newTransfers) setTransfers(newTransfers as Transfer[])

      const { data: newVanessa } = await supabase
        .from('vanessa_payments')
        .select('*')
        .gte('period_start', rangeStartStr)
        .lte('period_end', rangeEndStr)
      if (newVanessa) setVanessaPayments(newVanessa as VanessaPayment[])
    } catch (error) {
      console.error('Error marking as paid:', error)
      toast.error('Erro ao registrar pagamento')
    } finally {
      setPaying(false)
    }
  }

  // Get system settings
  const defaultTaxPercentage = parseFloat(
    systemSettings.find((s) => s.key === 'default_tax_percentage')?.value || '3'
  )
  const vanessaBonusPercentage = parseFloat(
    systemSettings.find((s) => s.key === 'vanessa_bonus_percentage')?.value || '1.5'
  )

  // Handle currency input
  const handleCurrencyInput = (value: string, setter: (value: string) => void) => {
    const numbers = value.replace(/\D/g, '')
    if (numbers === '') {
      setter('')
      return
    }
    const amount = parseInt(numbers) / 100
    setter(amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }

  // Open view dialog
  const openViewDialog = (appointment: Appointment) => {
    setSelectedAppointment(appointment)
    setViewDialogOpen(true)
  }

  // Open delete dialog
  const openDeleteDialog = (appointment: Appointment) => {
    setSelectedAppointment(appointment)
    setDeleteDialogOpen(true)
  }

  // Handle delete
  const handleDelete = async () => {
    if (!selectedAppointment) return

    setDeleting(true)
    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', selectedAppointment.id)

      if (error) throw error

      toast.success('Pagamento excluído com sucesso!')
      setDeleteDialogOpen(false)
      setSelectedAppointment(null)
      fetchData()
    } catch (error) {
      console.error('Error deleting appointment:', error)
      toast.error('Erro ao excluir pagamento')
    } finally {
      setDeleting(false)
    }
  }

  // Open edit dialog
  const openEditDialog = (appointment: Appointment) => {
    setEditingAppointment(appointment)
    // Adiciona T12:00:00 para evitar problema de timezone (UTC vs local)
    setEditDate(new Date(appointment.date + 'T12:00:00'))
    setEditPatientName(appointment.patient_name || '')
    setEditProfessionalId(appointment.professional_id || '')
    setEditProcedureId(appointment.procedure_id || '')
    setEditPaymentMethodId(appointment.payment_method_id || '')
    setEditIsHospital(appointment.is_hospital || false)
    setEditGrossValue(appointment.gross_value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    setEditNetValue(appointment.net_value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    setEditUseManualNet(!!appointment.net_value_input)
    setEditNotes(appointment.notes || '')
    setEditDialogOpen(true)
  }

  // Save edit
  const handleSaveEdit = async () => {
    if (!editingAppointment) return

    setSaving(true)
    try {
      const grossValueNum = parseFloat(editGrossValue.replace(/\D/g, '')) / 100
      const manualNetValueNum = editUseManualNet && editNetValue
        ? parseFloat(editNetValue.replace(/\D/g, '')) / 100
        : null

      const selectedProcedure = procedures.find((p) => p.id === editProcedureId)
      const selectedProfessional = professionals.find((p) => p.id === editProfessionalId)

      if (!selectedProcedure || !selectedProfessional) {
        toast.error('Selecione todos os campos obrigatórios')
        return
      }

      // Create source object based on isHospital checkbox
      const sourceForCalc = {
        id: '',
        name: editIsHospital ? 'Hospital' : 'Clinica',
        is_hospital: editIsHospital,
        custom_tax_percentage: editIsHospital ? 0 : null,
        is_active: true,
        created_at: '',
      }

      // Calculate values
      const calculation = calculateAppointment({
        grossValue: grossValueNum,
        netValueInput: manualNetValueNum,
        paymentMethodId: editPaymentMethodId,
        source: sourceForCalc,
        procedure: selectedProcedure,
        professional: selectedProfessional,
        cardFeeRules,
        defaultTaxPercentage,
        vanessaBonusPercentage,
      })

      // If using manual net value, override calculation
      let finalCalculation = { ...calculation }
      if (editUseManualNet && manualNetValueNum) {
        const totalProcedureCost = selectedProcedure.fixed_cost
        const valueAfterProcedure = manualNetValueNum + totalProcedureCost
        const taxRate = defaultTaxPercentage / 100
        const valueAfterCardFee = valueAfterProcedure / (1 - taxRate)
        const customCardFeeValue = grossValueNum - valueAfterCardFee
        const customCardFeePercentage = (customCardFeeValue / grossValueNum) * 100

        finalCalculation = {
          ...finalCalculation,
          cardFeePercentage: customCardFeePercentage,
          cardFeeValue: customCardFeeValue,
          netValue: manualNetValueNum,
        }
      }

      const { error } = await supabase
        .from('appointments')
        .update({
          date: format(editDate, 'yyyy-MM-dd'),
          patient_name: editPatientName,
          professional_id: editProfessionalId,
          procedure_id: editProcedureId,
          payment_method_id: editPaymentMethodId,
          is_hospital: editIsHospital,
          gross_value: grossValueNum,
          net_value_input: manualNetValueNum,
          card_fee_percentage: finalCalculation.cardFeePercentage,
          card_fee_value: finalCalculation.cardFeeValue,
          tax_percentage: finalCalculation.taxPercentage,
          tax_value: finalCalculation.taxValue,
          procedure_cost: finalCalculation.procedureCost,
          net_value: finalCalculation.netValue,
          vanessa_bonus: finalCalculation.vanessaBonus,
          professional_share: finalCalculation.professionalShare,
          final_value_bruno: finalCalculation.finalValueBruno,
          final_value_professional: finalCalculation.finalValueProfessional,
          notes: editNotes,
        })
        .eq('id', editingAppointment.id)

      if (error) throw error

      toast.success('Pagamento atualizado com sucesso!')
      setEditDialogOpen(false)
      setEditingAppointment(null)
      fetchData()
    } catch (error) {
      console.error('Error updating appointment:', JSON.stringify(error, null, 2))
      toast.error('Erro ao atualizar pagamento')
    } finally {
      setSaving(false)
    }
  }

  // Export to Excel
  const handleExportExcel = (
    type: 'professional' | 'vanessa',
    professionalId?: string
  ) => {
    let data: unknown[]
    let fileName: string

    if (type === 'professional' && professionalId) {
      const profData = professionalTotals[professionalId]
      if (!profData) return

      data = profData.appointments.map((a) => {
        const repasseValue = profData.field === 'final_value_bruno'
          ? a.final_value_bruno
          : a.final_value_professional
        return {
          Data: format(new Date(a.date), 'dd/MM/yyyy'),
          Paciente: a.patient_name,
          'Profissional Executor': a.professional?.name || '-',
          'Valor Bruto': a.gross_value,
          'Valor Líquido': a.net_value,
          'Valor Repasse': repasseValue,
        }
      })
      fileName = `repasse_${profData.name}_${format(startDate, 'yyyy-MM')}.xlsx`
    } else {
      data = vanessaAppointments.map((a) => ({
        Data: format(new Date(a.date), 'dd/MM/yyyy'),
        Paciente: a.patient_name,
        Procedimento: 'Endolaser (Bruno)',
        'Valor Líquido': a.net_value,
        'Bônus (1,5%)': a.vanessa_bonus,
      }))
      fileName = `bonus_vanessa_${format(startDate, 'yyyy-MM')}.xlsx`
    }

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Repasse')
    XLSX.writeFile(wb, fileName)
    toast.success('Arquivo exportado com sucesso')
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-700 dark:text-slate-200">Repasses</h1>

          <div className="flex items-center gap-2">
            <Select value={String(startDate.getMonth())} onValueChange={(v) => setStartMonth(parseInt(v))}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS_PT.map((m, i) => (
                  <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(startDate.getFullYear())} onValueChange={(v) => setStartYear(parseInt(v))}>
              <SelectTrigger className="w-[85px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-slate-400">até</span>
            <Select value={String(endDate.getMonth())} onValueChange={(v) => setEndMonth(parseInt(v))}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS_PT.map((m, i) => (
                  <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(endDate.getFullYear())} onValueChange={(v) => setEndYear(parseInt(v))}>
              <SelectTrigger className="w-[85px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : (
          <Tabs defaultValue="professionals">
            <TabsList>
              <TabsTrigger value="professionals">Profissionais</TabsTrigger>
              <TabsTrigger value="vanessa">Bônus Vanessa</TabsTrigger>
            </TabsList>

            <TabsContent value="professionals" className="space-y-4">
              {/* Filtros e controles */}
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Filtrar:</span>
                  <Select value={filterProfessional} onValueChange={setFilterProfessional}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Profissionais</SelectItem>
                      {professionals.filter(p => p.is_active).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={expandAll}>
                    <ChevronDown className="mr-1 h-4 w-4" />
                    Expandir Todos
                  </Button>
                  <Button variant="outline" size="sm" onClick={collapseAll}>
                    <ChevronUp className="mr-1 h-4 w-4" />
                    Recolher Todos
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Ordenar:</span>
                  <Select value={sortProfField} onValueChange={(v) => setSortProfField(v as 'date' | 'patient' | 'value')}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Data</SelectItem>
                      <SelectItem value="patient">Paciente</SelectItem>
                      <SelectItem value="value">Valor</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSortProfOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {sortProfOrder === 'asc' ? 'Crescente' : 'Decrescente'}
                  </span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                Valores a receber por cada profissional no período selecionado.
              </p>

              {monthlyData.map((monthData) => {
                const filteredProfTotals = filterProfessional === 'all'
                  ? monthData.professionalTotals
                  : Object.fromEntries(
                      Object.entries(monthData.professionalTotals).filter(([id]) => id === filterProfessional)
                    )

                const hasData = Object.entries(filteredProfTotals).length > 0

                return (
                  <div key={monthData.label} className="space-y-4">
                    {/* Month heading */}
                    <h2 className="text-lg font-semibold text-slate-600 dark:text-slate-300 border-b pb-2 capitalize">
                      {monthData.label}
                    </h2>

                    {!hasData ? (
                      <Card className="border-0 shadow-sm rounded-xl" style={{ background: 'linear-gradient(135deg, rgba(32, 32, 63, 0.02) 0%, rgba(32, 32, 63, 0.05) 100%)' }}>
                        <CardContent className="py-6 text-center" style={{ color: '#64748B' }}>
                          Nenhum repasse neste mês
                        </CardContent>
                      </Card>
                    ) : (
                      Object.entries(filteredProfTotals).map(([profId, profData]) => {
                        const transfer = getTransferForMonth(profId, monthData.monthStart, monthData.monthEnd)
                        const isPaid = transfer?.status === 'paid'
                        const expandKey = `${profId}-${format(monthData.monthStart, 'yyyy-MM')}`
                        const isExpanded = expandedProfessionals.has(expandKey)
                        const sortedAppts = sortAppointments(profData.appointments, sortProfField, sortProfOrder, profData.field)

                        return (
                          <Collapsible
                            key={expandKey}
                            open={isExpanded}
                            onOpenChange={() => toggleProfessional(expandKey)}
                          >
                            <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(206, 48, 249, 0.03) 0%, rgba(86, 19, 138, 0.06) 100%)' }}>
                              <CardHeader className="pb-4">
                                <div className="flex items-center justify-between">
                                  <CollapsibleTrigger asChild>
                                    <div className="flex items-center gap-3 cursor-pointer hover:opacity-80">
                                      {isExpanded ? (
                                        <ChevronUp className="h-5 w-5" style={{ color: '#CE30F9' }} />
                                      ) : (
                                        <ChevronDown className="h-5 w-5" style={{ color: '#CE30F9' }} />
                                      )}
                                      <div>
                                        <CardTitle className="text-lg font-semibold" style={{ color: '#20203F' }}>{profData.name}</CardTitle>
                                        <CardDescription style={{ color: '#64748B' }}>
                                          {profData.appointments.length} atendimento(s) - Líquido: <span className="font-semibold" style={{ color: profData.netAfterExpenses >= 0 ? '#00D9A3' : '#EF4444' }}>{formatCurrency(profData.netAfterExpenses)}</span>{profData.expenses.total > 0 && <span className="text-xs text-muted-foreground ml-2">(Receita: {formatCurrency(profData.total)} - Despesas: {formatCurrency(profData.expenses.total)})</span>}
                                        </CardDescription>
                                      </div>
                                    </div>
                                  </CollapsibleTrigger>
                                  <div className="flex items-center gap-2">
                                    {isPaid ? (
                                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                                        <Check className="mr-1 h-3 w-3" />
                                        Pago em {format(new Date(transfer.paid_at!), 'dd/MM/yyyy')}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline">Pendente</Badge>
                                    )}
                                  </div>
                                </div>
                              </CardHeader>
                              <CollapsibleContent>
                                <CardContent>
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead
                                          className="cursor-pointer hover:bg-muted/50 select-none"
                                          onClick={() => {
                                            if (sortProfField === 'date') {
                                              setSortProfOrder(prev => prev === 'asc' ? 'desc' : 'asc')
                                            } else {
                                              setSortProfField('date')
                                              setSortProfOrder('desc')
                                            }
                                          }}
                                        >
                                          <div className="flex items-center gap-1">
                                            Data
                                            {sortProfField === 'date' && <ArrowUpDown className="h-3 w-3" />}
                                          </div>
                                        </TableHead>
                                        <TableHead
                                          className="cursor-pointer hover:bg-muted/50 select-none"
                                          onClick={() => {
                                            if (sortProfField === 'patient') {
                                              setSortProfOrder(prev => prev === 'asc' ? 'desc' : 'asc')
                                            } else {
                                              setSortProfField('patient')
                                              setSortProfOrder('asc')
                                            }
                                          }}
                                        >
                                          <div className="flex items-center gap-1">
                                            Paciente
                                            {sortProfField === 'patient' && <ArrowUpDown className="h-3 w-3" />}
                                          </div>
                                        </TableHead>
                                        <TableHead>Profissional Executor</TableHead>
                                        <TableHead
                                          className="cursor-pointer hover:bg-muted/50 select-none text-right"
                                          onClick={() => {
                                            if (sortProfField === 'value') {
                                              setSortProfOrder(prev => prev === 'asc' ? 'desc' : 'asc')
                                            } else {
                                              setSortProfField('value')
                                              setSortProfOrder('desc')
                                            }
                                          }}
                                        >
                                          <div className="flex items-center justify-end gap-1">
                                            Valor Líquido
                                            {sortProfField === 'value' && <ArrowUpDown className="h-3 w-3" />}
                                          </div>
                                        </TableHead>
                                        <TableHead className="text-right">Repasse</TableHead>
                                        <TableHead className="w-[100px] text-center">Ações</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {sortedAppts.map((a) => {
                                        const repasseValue = profData.field === 'final_value_bruno'
                                          ? a.final_value_bruno
                                          : a.final_value_professional
                                        return (
                                          <TableRow key={a.id}>
                                            <TableCell>{format(new Date(a.date), 'dd/MM/yyyy')}</TableCell>
                                            <TableCell>{a.patient_name}</TableCell>
                                            <TableCell>{a.professional?.name || '-'}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(a.net_value)}</TableCell>
                                            <TableCell className="text-right font-medium">{formatCurrency(repasseValue)}</TableCell>
                                            <TableCell>
                                              <div className="flex items-center justify-center gap-1">
                                                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openViewDialog(a) }} title="Visualizar">
                                                  <Eye className="h-4 w-4" />
                                                </Button>
                                                {isAdmin && (
                                                  <>
                                                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditDialog(a) }} title="Editar">
                                                      <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openDeleteDialog(a) }} title="Excluir" className="text-destructive hover:text-destructive">
                                                      <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                  </>
                                                )}
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        )
                                      })}
                                    </TableBody>
                                  </Table>

                                  <Separator className="my-4" />

                                  {/* Resumo Financeiro */}
                                  <div className="space-y-3 mb-4">
                                    <div className="flex justify-between items-center">
                                      <span className="text-muted-foreground">Receita (atendimentos):</span>
                                      <span className="font-semibold text-green-600">{formatCurrency(profData.total)}</span>
                                    </div>

                                    {profData.expenses.details.length > 0 && (
                                      <>
                                        <div className="text-sm text-muted-foreground">Despesas do período:</div>
                                        {profData.expenses.details.map((expense, idx) => (
                                          <div key={idx} className="flex justify-between items-center pl-4 text-sm">
                                            <span className="text-muted-foreground">{expense.name}</span>
                                            <span className="text-red-500">-{formatCurrency(expense.amount)}</span>
                                          </div>
                                        ))}
                                        <div className="flex justify-between items-center border-t pt-2">
                                          <span className="text-muted-foreground">Total despesas:</span>
                                          <span className="font-semibold text-red-500">-{formatCurrency(profData.expenses.total)}</span>
                                        </div>
                                      </>
                                    )}

                                    <Separator />

                                    <div className="flex justify-between items-center">
                                      <span className="text-lg font-bold">Líquido a Receber:</span>
                                      <span className="text-2xl font-bold" style={{ color: profData.netAfterExpenses >= 0 ? '#00D9A3' : '#EF4444' }}>
                                        {formatCurrency(profData.netAfterExpenses)}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-end">
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        onClick={() => handleExportExcel('professional', profId)}
                                      >
                                        <Download className="mr-2 h-4 w-4" />
                                        Exportar
                                      </Button>
                                      {!isPaid && isAdmin && (
                                        <Button
                                          onClick={() => {
                                            setSelectedTransfer({
                                              type: 'professional',
                                              professionalId: profId,
                                              professionalName: profData.name,
                                              amount: profData.netAfterExpenses,
                                              monthStart: monthData.monthStart,
                                              monthEnd: monthData.monthEnd,
                                              monthLabel: monthData.label,
                                            })
                                            setPayDialogOpen(true)
                                          }}
                                        >
                                          <Check className="mr-2 h-4 w-4" />
                                          Marcar como Pago
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </CollapsibleContent>
                            </Card>
                          </Collapsible>
                        )
                      })
                    )}
                  </div>
                )
              })}
            </TabsContent>

            <TabsContent value="vanessa" className="space-y-4">
              {/* Filtros e ordenação */}
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Ordenar por:</span>
                  <Select value={sortVanessaField} onValueChange={(v) => setSortVanessaField(v as 'date' | 'patient' | 'value' | 'bonus')}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Data</SelectItem>
                      <SelectItem value="patient">Paciente</SelectItem>
                      <SelectItem value="value">Valor Líquido</SelectItem>
                      <SelectItem value="bonus">Bônus</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSortVanessaOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {sortVanessaOrder === 'asc' ? 'Crescente' : 'Decrescente'}
                  </span>
                </div>
              </div>

              {monthlyData.map((monthData) => {
                const vanessaPayment = getVanessaPaymentForMonth(monthData.monthStart, monthData.monthEnd)
                const isVanessaPaid = vanessaPayment?.status === 'paid'
                const sortedMonthVanessa = sortAppointments(monthData.vanessaAppointments, sortVanessaField, sortVanessaOrder, 'vanessa_bonus')

                return (
                  <div key={monthData.label} className="space-y-4">
                    <h2 className="text-lg font-semibold text-slate-600 dark:text-slate-300 border-b pb-2 capitalize">
                      {monthData.label}
                    </h2>

                    <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(0, 217, 163, 0.1) 0%, rgba(0, 217, 163, 0.18) 100%)' }}>
                      <CardHeader className="pb-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-lg font-semibold" style={{ color: '#00A87D' }}>Bônus Vanessa</CardTitle>
                            <CardDescription style={{ color: 'rgba(0, 168, 125, 0.7)' }}>
                              1,5% sobre atendimentos de Endolaser do Bruno
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            {isVanessaPaid ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-800">
                                <Check className="mr-1 h-3 w-3" />
                                Pago em {format(new Date(vanessaPayment.paid_at!), 'dd/MM/yyyy')}
                              </Badge>
                            ) : (
                              <Badge variant="outline">Pendente</Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {sortedMonthVanessa.length === 0 ? (
                          <div className="py-6 text-center text-muted-foreground">
                            Nenhum bônus neste mês
                          </div>
                        ) : (
                          <>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="cursor-pointer hover:bg-muted/50 select-none" onClick={() => { if (sortVanessaField === 'date') { setSortVanessaOrder(prev => prev === 'asc' ? 'desc' : 'asc') } else { setSortVanessaField('date'); setSortVanessaOrder('desc') } }}>
                                    <div className="flex items-center gap-1">Data {sortVanessaField === 'date' && <ArrowUpDown className="h-3 w-3" />}</div>
                                  </TableHead>
                                  <TableHead className="cursor-pointer hover:bg-muted/50 select-none" onClick={() => { if (sortVanessaField === 'patient') { setSortVanessaOrder(prev => prev === 'asc' ? 'desc' : 'asc') } else { setSortVanessaField('patient'); setSortVanessaOrder('asc') } }}>
                                    <div className="flex items-center gap-1">Paciente {sortVanessaField === 'patient' && <ArrowUpDown className="h-3 w-3" />}</div>
                                  </TableHead>
                                  <TableHead>Procedimento</TableHead>
                                  <TableHead className="cursor-pointer hover:bg-muted/50 select-none text-right" onClick={() => { if (sortVanessaField === 'value') { setSortVanessaOrder(prev => prev === 'asc' ? 'desc' : 'asc') } else { setSortVanessaField('value'); setSortVanessaOrder('desc') } }}>
                                    <div className="flex items-center justify-end gap-1">Valor Líquido {sortVanessaField === 'value' && <ArrowUpDown className="h-3 w-3" />}</div>
                                  </TableHead>
                                  <TableHead className="cursor-pointer hover:bg-muted/50 select-none text-right" onClick={() => { if (sortVanessaField === 'bonus') { setSortVanessaOrder(prev => prev === 'asc' ? 'desc' : 'asc') } else { setSortVanessaField('bonus'); setSortVanessaOrder('desc') } }}>
                                    <div className="flex items-center justify-end gap-1">Bônus (1,5%) {sortVanessaField === 'bonus' && <ArrowUpDown className="h-3 w-3" />}</div>
                                  </TableHead>
                                  <TableHead className="w-[100px] text-center">Ações</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sortedMonthVanessa.map((a) => (
                                  <TableRow key={a.id}>
                                    <TableCell>{format(new Date(a.date), 'dd/MM/yyyy')}</TableCell>
                                    <TableCell>{a.patient_name}</TableCell>
                                    <TableCell>Endolaser (Bruno)</TableCell>
                                    <TableCell className="text-right">{formatCurrency(a.net_value)}</TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(a.vanessa_bonus)}</TableCell>
                                    <TableCell>
                                      <div className="flex items-center justify-center gap-1">
                                        <Button variant="ghost" size="icon" onClick={() => openViewDialog(a)} title="Visualizar"><Eye className="h-4 w-4" /></Button>
                                        {isAdmin && (
                                          <>
                                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(a)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" onClick={() => openDeleteDialog(a)} title="Excluir" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                                          </>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>

                            <Separator className="my-4" />

                            <div className="flex items-center justify-between">
                              <div className="text-2xl font-bold">
                                Total: {formatCurrency(monthData.vanessaTotal)}
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" onClick={() => handleExportExcel('vanessa')}>
                                  <Download className="mr-2 h-4 w-4" />
                                  Exportar
                                </Button>
                                {!isVanessaPaid && monthData.vanessaTotal > 0 && isAdmin && (
                                  <Button
                                    onClick={() => {
                                      setSelectedTransfer({
                                        type: 'vanessa',
                                        professionalName: 'Vanessa',
                                        amount: monthData.vanessaTotal,
                                        monthStart: monthData.monthStart,
                                        monthEnd: monthData.monthEnd,
                                        monthLabel: monthData.label,
                                      })
                                      setPayDialogOpen(true)
                                    }}
                                  >
                                    <Check className="mr-2 h-4 w-4" />
                                    Marcar como Pago
                                  </Button>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )
              })}
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Pay Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <FileText className="inline mr-2 h-5 w-5" />
              Confirmar Pagamento
            </DialogTitle>
            <DialogDescription>
              Confirme o pagamento do repasse abaixo
            </DialogDescription>
          </DialogHeader>

          {selectedTransfer && (
            <div className="py-4 space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Beneficiário:</span>
                <span className="font-medium">{selectedTransfer.professionalName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Período:</span>
                <span className="font-medium capitalize">
                  {selectedTransfer.monthLabel || `${format(startDate, 'dd/MM/yyyy')} a ${format(endDate, 'dd/MM/yyyy')}`}
                </span>
              </div>
              <div className="flex justify-between text-lg">
                <span>Valor Total:</span>
                <span className="font-bold text-primary">
                  {formatCurrency(selectedTransfer.amount)}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPayDialogOpen(false)}
              disabled={paying}
            >
              Cancelar
            </Button>
            <Button onClick={handleMarkAsPaid} disabled={paying}>
              {paying ? 'Registrando...' : 'Confirmar Pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Detalhes do Pagamento
            </DialogTitle>
          </DialogHeader>

          {selectedAppointment && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Data</p>
                  <p className="font-medium">{format(new Date(selectedAppointment.date), 'dd/MM/yyyy')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Paciente</p>
                  <p className="font-medium">{selectedAppointment.patient_name || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Profissional</p>
                  <p className="font-medium">{selectedAppointment.professional?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Procedimento</p>
                  <p className="font-medium">{selectedAppointment.procedure?.name || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Hospital</p>
                  <p className="font-medium">{selectedAppointment.is_hospital ? 'Sim' : 'Não'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Forma de Pagamento</p>
                  <p className="font-medium">{selectedAppointment.payment_method?.name || '-'}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Valor Bruto</p>
                  <p className="font-medium">{formatCurrency(selectedAppointment.gross_value)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Taxa Cartão ({selectedAppointment.card_fee_percentage.toFixed(2)}%)</p>
                  <p className="font-medium text-destructive">-{formatCurrency(selectedAppointment.card_fee_value)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Imposto ({selectedAppointment.tax_percentage}%)</p>
                  <p className="font-medium text-destructive">-{formatCurrency(selectedAppointment.tax_value)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Custo Procedimento</p>
                  <p className="font-medium text-destructive">-{formatCurrency(selectedAppointment.procedure_cost)}</p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Valor Líquido</p>
                  <p className="font-medium text-lg text-primary">{formatCurrency(selectedAppointment.net_value)}</p>
                </div>
                {selectedAppointment.vanessa_bonus > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Bônus Vanessa</p>
                    <p className="font-medium">{formatCurrency(selectedAppointment.vanessa_bonus)}</p>
                  </div>
                )}
              </div>

              {(selectedAppointment.final_value_bruno > 0 && selectedAppointment.final_value_professional > 0) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Bruno</p>
                    <p className="font-medium">{formatCurrency(selectedAppointment.final_value_bruno)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Valor {selectedAppointment.professional?.name}{selectedAppointment.professional_share === 50 ? ' (50%)' : ''}
                    </p>
                    <p className="font-medium">{formatCurrency(selectedAppointment.final_value_professional)}</p>
                  </div>
                </div>
              )}

              {selectedAppointment.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Observações</p>
                    <p className="font-medium">{selectedAppointment.notes}</p>
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Fechar
            </Button>
            {isAdmin && selectedAppointment && (
              <Button onClick={() => {
                setViewDialogOpen(false)
                openEditDialog(selectedAppointment)
              }}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Confirmar Exclusão
            </DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. O pagamento será removido permanentemente.
            </DialogDescription>
          </DialogHeader>

          {selectedAppointment && (
            <div className="py-4 space-y-2">
              <p><strong>Data:</strong> {format(new Date(selectedAppointment.date), 'dd/MM/yyyy')}</p>
              <p><strong>Paciente:</strong> {selectedAppointment.patient_name}</p>
              <p><strong>Valor:</strong> {formatCurrency(selectedAppointment.gross_value)}</p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Pagamento</DialogTitle>
            <DialogDescription>
              Edite os dados do pagamento. Os valores serão recalculados automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Data e Paciente */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data</Label>
                <DatePickerInput
                  value={editDate}
                  onChange={(d) => d && setEditDate(d)}
                  placeholder="dd/mm/aaaa"
                />
              </div>
              <div className="space-y-2">
                <Label>Paciente</Label>
                <Input
                  value={editPatientName}
                  onChange={(e) => setEditPatientName(e.target.value)}
                />
              </div>
            </div>

            {/* Profissional e Procedimento */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Profissional</Label>
                <Select value={editProfessionalId} onValueChange={setEditProfessionalId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {professionals.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Procedimento</Label>
                <Select value={editProcedureId} onValueChange={setEditProcedureId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {procedures.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Forma de Pagamento e Hospital */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                <Select value={editPaymentMethodId} onValueChange={setEditPaymentMethodId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Hospital</Label>
                <div className="flex items-center space-x-2 h-10">
                  <Switch
                    id="edit-hospital-repasses"
                    checked={editIsHospital}
                    onCheckedChange={setEditIsHospital}
                  />
                  <Label htmlFor="edit-hospital-repasses" className="text-sm text-muted-foreground">
                    {editIsHospital ? 'Sim (sem imposto)' : 'Não'}
                  </Label>
                </div>
              </div>
            </div>

            {/* Valor Bruto */}
            <div className="space-y-2">
              <Label>Valor Bruto (R$)</Label>
              <Input
                value={editGrossValue}
                onChange={(e) => handleCurrencyInput(e.target.value, setEditGrossValue)}
                className="max-w-xs"
              />
            </div>

            {/* Valor Líquido Manual */}
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base cursor-pointer">
                    Informar valor líquido manualmente
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Ative para informar o valor líquido e calcular a taxa automaticamente
                  </p>
                </div>
                <Switch
                  checked={editUseManualNet}
                  onCheckedChange={(checked) => {
                    setEditUseManualNet(checked)
                    if (!checked) setEditNetValue('')
                  }}
                />
              </div>
              {editUseManualNet && (
                <div className="space-y-2">
                  <Label>Valor Líquido (R$)</Label>
                  <Input
                    value={editNetValue}
                    onChange={(e) => handleCurrencyInput(e.target.value, setEditNetValue)}
                  />
                </div>
              )}
            </div>

            {/* Observações */}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Observações opcionais"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
