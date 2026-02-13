'use client'

import { useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Download, Search, Trash2, Eye, Pencil, ArrowUpDown } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { createClient } from '@/lib/supabase/client'
import {
  useAppointments,
  useProfessionals,
  useProcedures,
  useUserProfile,
  usePaymentMethods,
  useCurrentTierCardFeeRules,
  useSystemSettings,
  useSplitRules,
  useBonusRules,
} from '@/lib/hooks'
import { formatCurrency, calculateAppointment, findApplicableSplitRule, applySplitDistribution, calculateBonusFromRules, determineOwnerProfessionalId } from '@/lib/calculations'
import type { Appointment } from '@/types'

export function AtendimentosTable() {
  const supabase = createClient()
  const { isAdmin } = useUserProfile()

  // Filter state - default to current month
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(new Date()))
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(new Date()))
  const [professionalId, setProfessionalId] = useState<string>('')
  const [procedureId, setProcedureId] = useState<string>('')
  const [patientName, setPatientName] = useState('')

  // Dialog state
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saving, setSaving] = useState(false)

  // Edit form state
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

  // Sort state
  const [sortField, setSortField] = useState<'date' | 'patient' | 'gross' | 'net'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Data hooks
  const { data: professionals } = useProfessionals()
  const { data: procedures } = useProcedures()
  const { data: paymentMethods } = usePaymentMethods()
  const { data: cardFeeRules } = useCurrentTierCardFeeRules()
  const { data: systemSettings } = useSystemSettings()
  const { data: splitRules } = useSplitRules()
  const { data: bonusRules } = useBonusRules()

  // Determine owner professional ID for correct split attribution
  const ownerProfessionalId = useMemo(
    () => determineOwnerProfessionalId(professionals, systemSettings),
    [professionals, systemSettings]
  )

  // Dynamic professional names from database
  const ownerName = professionals.find(p => p.id === ownerProfessionalId)?.name || 'Bruno'
  const otherProfessionals = professionals.filter(p => p.id !== ownerProfessionalId && p.is_active)
  const otherName = otherProfessionals.length === 1 ? otherProfessionals[0].name : 'Profissionais'

  const { data: appointments, loading, refetch } = useAppointments({
    startDate: startDate ? format(startDate, 'yyyy-MM-dd') : undefined,
    endDate: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
    professional_id: professionalId && professionalId !== 'all' ? professionalId : undefined,
    procedure_id: procedureId && procedureId !== 'all' ? procedureId : undefined,
    patient_name: patientName || undefined,
  })

  const handleDelete = async () => {
    if (!selectedAppointment) return

    setDeleting(true)
    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', selectedAppointment.id)

      if (error) throw error

      toast.success('Pagamento excluído com sucesso')
      setDeleteDialogOpen(false)
      setSelectedAppointment(null)
      refetch()
    } catch (error) {
      console.error('Error deleting appointment:', error)
      toast.error('Erro ao excluir pagamento')
    } finally {
      setDeleting(false)
    }
  }

  // Open edit dialog
  const openEditDialog = (appointment: Appointment) => {
    setSelectedAppointment(appointment)
    // Adiciona T12:00:00 para evitar problema de timezone (UTC vs local)
    setEditDate(new Date(appointment.date + 'T12:00:00'))
    setEditPatientName(appointment.patient_name || '')
    setEditProfessionalId(appointment.professional_id || '')
    setEditProcedureId(appointment.procedure_id || '')
    setEditPaymentMethodId(appointment.payment_method_id || '')
    setEditIsHospital(appointment.is_hospital || false)
    setEditGrossValue(appointment.gross_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
    setEditNetValue(appointment.net_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
    setEditUseManualNet(false)
    setEditNotes(appointment.notes || '')
    setEditDialogOpen(true)
  }

  // Handle edit save
  const handleSaveEdit = async () => {
    if (!selectedAppointment) return

    setSaving(true)
    try {
      const grossValueNum = parseFloat(editGrossValue.replace(/\D/g, '')) / 100
      const netValueNum = editUseManualNet ? parseFloat(editNetValue.replace(/\D/g, '')) / 100 : null

      // Get selected entities for calculation
      const selectedProfessional = professionals.find(p => p.id === editProfessionalId)
      const selectedProcedure = procedures.find(p => p.id === editProcedureId)

      if (!selectedProfessional || !selectedProcedure) {
        toast.error('Selecione todos os campos obrigatórios')
        setSaving(false)
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

      // Get system settings
      const defaultTaxPercentage = parseFloat(
        systemSettings.find(s => s.key === 'default_tax_percentage')?.value || '3'
      )
      const vanessaBonusPercentage = parseFloat(
        systemSettings.find(s => s.key === 'vanessa_bonus_percentage')?.value || '1.5'
      )

      let updateData: Record<string, unknown>

      if (editUseManualNet && netValueNum !== null) {
        // Valor liquido manual - calcular taxa inversa
        const procedureCost = selectedProcedure.fixed_cost
        const netValueAfterProcedure = netValueNum + procedureCost
        const taxValue = netValueAfterProcedure * (defaultTaxPercentage / 100) / (1 - defaultTaxPercentage / 100)
        const valueAfterTax = netValueAfterProcedure + taxValue
        const cardFeePercentage = ((grossValueNum - valueAfterTax) / grossValueNum) * 100
        const cardFeeValue = grossValueNum - valueAfterTax

        // Calcular bonus
        let vanessaBonus = 0
        let finalValueBruno = netValueNum
        let finalValueProfessional = 0
        let professionalShare = 0

        const activeBonusRules = bonusRules.filter(r => r.is_active)
        if (activeBonusRules.length > 0) {
          const { totalBonus } = calculateBonusFromRules(
            grossValueNum, netValueNum, netValueNum,
            selectedProcedure.id, selectedProfessional.id, activeBonusRules
          )
          vanessaBonus = totalBonus
        } else {
          // Legacy bonus
          const isEndolaser = selectedProcedure.name.toLowerCase().includes('endolaser')
          const isValquiria = selectedProfessional.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('valquiria')
          if (isEndolaser && !isValquiria && selectedProcedure.has_vanessa_bonus) {
            vanessaBonus = netValueNum * (vanessaBonusPercentage / 100)
          }
        }

        // Calcular divisão de profissionais
        const activeSplitRules = splitRules.filter(r => r.is_active)
        if (activeSplitRules.length > 0 && ownerProfessionalId) {
          const rule = findApplicableSplitRule(selectedProcedure.id, selectedProfessional.id, activeSplitRules)
          if (rule) {
            const split = applySplitDistribution(netValueNum, rule, ownerProfessionalId)
            finalValueBruno = split.finalValueBruno
            finalValueProfessional = split.finalValueProfessional
            professionalShare = split.professionalShare
          }
        } else {
          // Fallback legado
          const isEndolaser = selectedProcedure.name.toLowerCase().includes('endolaser')
          const isValquiria = selectedProfessional.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('valquiria')
          if (isEndolaser && isValquiria) {
            professionalShare = 50
            finalValueBruno = netValueNum * 0.5
            finalValueProfessional = netValueNum * 0.5
          } else if (isValquiria) {
            professionalShare = 100
            finalValueBruno = 0
            finalValueProfessional = netValueNum
          }
        }

        updateData = {
          date: format(editDate, 'yyyy-MM-dd'),
          patient_name: editPatientName,
          professional_id: editProfessionalId,
          procedure_id: editProcedureId,
          payment_method_id: editPaymentMethodId,
          is_hospital: editIsHospital,
          gross_value: grossValueNum,
          net_value_input: netValueNum,
          card_fee_percentage: Math.max(0, cardFeePercentage),
          card_fee_value: Math.max(0, cardFeeValue),
          tax_percentage: editIsHospital ? 0 : defaultTaxPercentage,
          tax_value: taxValue,
          procedure_cost: procedureCost,
          net_value: netValueNum,
          vanessa_bonus: vanessaBonus,
          professional_share: professionalShare,
          final_value_bruno: finalValueBruno,
          final_value_professional: finalValueProfessional,
          notes: editNotes,
        }
      } else {
        // Cálculo automático normal
        const calculation = calculateAppointment({
          grossValue: grossValueNum,
          netValueInput: null,
          paymentMethodId: editPaymentMethodId,
          source: sourceForCalc,
          procedure: selectedProcedure,
          professional: selectedProfessional,
          cardFeeRules,
          defaultTaxPercentage,
          vanessaBonusPercentage,
          bonusRules: bonusRules.filter(r => r.is_active),
          splitRules: splitRules.filter(r => r.is_active),
          ownerProfessionalId,
        })

        updateData = {
          date: format(editDate, 'yyyy-MM-dd'),
          patient_name: editPatientName,
          professional_id: editProfessionalId,
          procedure_id: editProcedureId,
          payment_method_id: editPaymentMethodId,
          is_hospital: editIsHospital,
          gross_value: grossValueNum,
          net_value_input: null,
          card_fee_percentage: calculation.cardFeePercentage,
          card_fee_value: calculation.cardFeeValue,
          tax_percentage: calculation.taxPercentage,
          tax_value: calculation.taxValue,
          procedure_cost: calculation.procedureCost,
          net_value: calculation.netValue,
          vanessa_bonus: calculation.vanessaBonus,
          professional_share: calculation.professionalShare,
          final_value_bruno: calculation.finalValueBruno,
          final_value_professional: calculation.finalValueProfessional,
          notes: editNotes,
        }
      }

      const { error } = await supabase
        .from('appointments')
        .update(updateData)
        .eq('id', selectedAppointment.id)

      if (error) throw error

      toast.success('Pagamento atualizado com sucesso')
      setEditDialogOpen(false)
      setSelectedAppointment(null)
      refetch()
    } catch (error) {
      console.error('Error updating appointment:', JSON.stringify(error, null, 2))
      toast.error('Erro ao atualizar pagamento')
    } finally {
      setSaving(false)
    }
  }

  // Sort appointments
  const sortedAppointments = [...appointments].sort((a, b) => {
    let comparison = 0
    switch (sortField) {
      case 'date':
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime()
        break
      case 'patient':
        comparison = (a.patient_name || '').localeCompare(b.patient_name || '')
        break
      case 'gross':
        comparison = a.gross_value - b.gross_value
        break
      case 'net':
        comparison = a.net_value - b.net_value
        break
    }
    return sortOrder === 'asc' ? comparison : -comparison
  })

  // Handle sort click
  const handleSort = (field: 'date' | 'patient' | 'gross' | 'net') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  // Format currency input
  const handleCurrencyInput = (value: string, setter: (v: string) => void) => {
    const numbers = value.replace(/\D/g, '')
    if (numbers === '') {
      setter('')
      return
    }
    const amount = parseInt(numbers) / 100
    setter(amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }

  const handleExportExcel = () => {
    if (appointments.length === 0) {
      toast.error('Nenhum pagamento para exportar')
      return
    }

    const data = appointments.map((a) => ({
      Data: format(new Date(a.date), 'dd/MM/yyyy'),
      Paciente: a.patient_name,
      Profissional: a.professional?.name || '',
      Procedimento: a.procedure?.name || '',
      Hospital: a.is_hospital ? 'Sim' : 'Não',
      'Valor Bruto': a.gross_value,
      'Taxa Cartão (%)': a.card_fee_percentage,
      'Taxa Cartão (R$)': a.card_fee_value,
      'Imposto (%)': a.tax_percentage,
      'Imposto (R$)': a.tax_value,
      'Custo Procedimento': a.procedure_cost,
      'Valor Líquido': a.net_value,
      'Bônus Vanessa': a.vanessa_bonus,
      [`Valor ${ownerName}`]: a.final_value_bruno,
      [`Valor ${otherName}`]: a.final_value_professional,
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Atendimentos')

    const fileName = `atendimentos_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
    XLSX.writeFile(wb, fileName)
    toast.success('Arquivo exportado com sucesso')
  }

  const clearFilters = () => {
    setStartDate(undefined)
    setEndDate(undefined)
    setProfessionalId('')
    setProcedureId('')
    setPatientName('')
  }

  // Calculate totals
  const totals = appointments.reduce(
    (acc, a) => ({
      gross: acc.gross + a.gross_value,
      net: acc.net + a.net_value,
      vanessa: acc.vanessa + a.vanessa_bonus,
      bruno: acc.bruno + a.final_value_bruno,
      professional: acc.professional + a.final_value_professional,
    }),
    { gross: 0, net: 0, vanessa: 0, bruno: 0, professional: 0 }
  )

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold text-slate-700 dark:text-slate-200">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Row 1: Dates, Professional, Procedure */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-500">Data Inicial</Label>
                <DatePickerInput
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Selecione"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-500">Data Final</Label>
                <DatePickerInput
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="Selecione"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-500">Profissional</Label>
                <Select value={professionalId} onValueChange={setProfessionalId}>
                  <SelectTrigger className="h-10 rounded-lg border-slate-200 hover:border-violet-300 transition-colors">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {professionals.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium text-slate-500">Procedimento</Label>
                <Select value={procedureId} onValueChange={setProcedureId}>
                  <SelectTrigger className="h-10 rounded-lg border-slate-200 hover:border-violet-300 transition-colors">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {procedures.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Patient Search + Actions */}
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="space-y-2 flex-1 max-w-sm">
                <Label className="text-xs font-medium text-slate-500">Paciente</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por nome"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className="pl-9 h-10 rounded-lg border-slate-200 hover:border-violet-300 focus:border-violet-400 transition-colors"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={clearFilters}
                  className="h-10 rounded-lg border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                >
                  Limpar Filtros
                </Button>
                <Button
                  variant="outline"
                  onClick={handleExportExcel}
                  className="h-10 rounded-lg transition-colors"
                  style={{ borderColor: 'rgba(206, 48, 249, 0.3)', color: '#CE30F9' }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Exportar Excel
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary - Brand Colors */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Bruto - Navy */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(32, 32, 63, 0.05) 0%, rgba(32, 32, 63, 0.1) 100%)' }}>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: '#20203F' }}>Total Bruto</div>
            <div className="text-xl font-bold mt-1" style={{ color: '#20203F' }}>{formatCurrency(totals.gross)}</div>
          </CardContent>
        </Card>
        {/* Total Líquido - Magenta */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(206, 48, 249, 0.08) 0%, rgba(86, 19, 138, 0.12) 100%)' }}>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: '#56138A' }}>Total Líquido</div>
            <div className="text-xl font-bold mt-1" style={{ color: '#CE30F9' }}>{formatCurrency(totals.net)}</div>
          </CardContent>
        </Card>
        {/* Valor Bruno - Blue */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(74, 144, 226, 0.1) 0%, rgba(74, 144, 226, 0.18) 100%)' }}>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: '#3A7BC8' }}>Valor {ownerName}</div>
            <div className="text-xl font-bold mt-1" style={{ color: '#4A90E2' }}>{formatCurrency(totals.bruno)}</div>
          </CardContent>
        </Card>
        {/* Valor Valquiria - Purple/Magenta */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(206, 48, 249, 0.1) 0%, rgba(86, 19, 138, 0.15) 100%)' }}>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: '#56138A' }}>Valor {otherName}</div>
            <div className="text-xl font-bold mt-1" style={{ color: '#CE30F9' }}>{formatCurrency(totals.professional)}</div>
          </CardContent>
        </Card>
        {/* Bônus Vanessa - Mint */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(0, 217, 163, 0.1) 0%, rgba(0, 217, 163, 0.18) 100%)' }}>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: '#00A87D' }}>Bônus Vanessa</div>
            <div className="text-xl font-bold mt-1" style={{ color: '#00D9A3' }}>{formatCurrency(totals.vanessa)}</div>
          </CardContent>
        </Card>
        {/* Atendimentos - Peach */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(255, 176, 136, 0.15) 0%, rgba(255, 176, 136, 0.25) 100%)' }}>
          <CardContent className="p-4">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: '#C97A4A' }}>Atendimentos</div>
            <div className="text-xl font-bold mt-1" style={{ color: '#A05C32' }}>{appointments.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando...
            </div>
          ) : appointments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum pagamento encontrado
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('date')}
                  >
                    <div className="flex items-center gap-1">
                      Data
                      {sortField === 'date' && <ArrowUpDown className="h-3 w-3" />}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => handleSort('patient')}
                  >
                    <div className="flex items-center gap-1">
                      Paciente
                      {sortField === 'patient' && <ArrowUpDown className="h-3 w-3" />}
                    </div>
                  </TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Procedimento</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 select-none text-right"
                    onClick={() => handleSort('gross')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Bruto
                      {sortField === 'gross' && <ArrowUpDown className="h-3 w-3" />}
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 select-none text-right"
                    onClick={() => handleSort('net')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Líquido
                      {sortField === 'net' && <ArrowUpDown className="h-3 w-3" />}
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAppointments.map((appointment) => (
                  <TableRow key={appointment.id}>
                    <TableCell>
                      {format(new Date(appointment.date), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell>{appointment.patient_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {appointment.professional?.name}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {appointment.procedure?.name}
                      {appointment.is_hospital && (
                        <Badge variant="secondary" className="ml-2">
                          Hospital
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(appointment.gross_value)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-primary">
                      {formatCurrency(appointment.net_value)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedAppointment(appointment)
                            setDetailsDialogOpen(true)
                          }}
                          title="Ver detalhes"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(appointment)}
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => {
                                setSelectedAppointment(appointment)
                                setDeleteDialogOpen(true)
                              }}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Pagamento</DialogTitle>
          </DialogHeader>
          {selectedAppointment && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Data:</span>
                  <div className="font-medium">
                    {format(new Date(selectedAppointment.date), 'PPP', { locale: ptBR })}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Paciente:</span>
                  <div className="font-medium">{selectedAppointment.patient_name}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Profissional:</span>
                  <div className="font-medium">{selectedAppointment.professional?.name}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Procedimento:</span>
                  <div className="font-medium">{selectedAppointment.procedure?.name}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Hospital:</span>
                  <div className="font-medium">{selectedAppointment.is_hospital ? 'Sim' : 'Não'}</div>
                </div>
              </div>

              <div className="border-t pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor Bruto:</span>
                  <span className="font-medium">{formatCurrency(selectedAppointment.gross_value)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taxa Cartão ({selectedAppointment.card_fee_percentage}%):</span>
                  <span className="text-destructive">-{formatCurrency(selectedAppointment.card_fee_value)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Imposto ({selectedAppointment.tax_percentage}%):</span>
                  <span className="text-destructive">-{formatCurrency(selectedAppointment.tax_value)}</span>
                </div>
                {selectedAppointment.procedure_cost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Custo Procedimento:</span>
                    <span className="text-destructive">-{formatCurrency(selectedAppointment.procedure_cost)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2">
                  <span className="font-medium">Valor Líquido:</span>
                  <span className="font-bold text-primary">{formatCurrency(selectedAppointment.net_value)}</span>
                </div>
                {selectedAppointment.vanessa_bonus > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bônus Vanessa:</span>
                    <span>{formatCurrency(selectedAppointment.vanessa_bonus)}</span>
                  </div>
                )}
                {(selectedAppointment.final_value_bruno > 0 && selectedAppointment.final_value_professional > 0) && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor {ownerName}:</span>
                      <span>{formatCurrency(selectedAppointment.final_value_bruno)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Valor {selectedAppointment.professional?.name}{selectedAppointment.professional_share === 50 ? ' (50%)' : ''}:
                      </span>
                      <span>{formatCurrency(selectedAppointment.final_value_professional)}</span>
                    </div>
                  </>
                )}
              </div>

              {selectedAppointment.notes && (
                <div className="border-t pt-4">
                  <span className="text-muted-foreground text-sm">Observações:</span>
                  <div className="mt-1">{selectedAppointment.notes}</div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este pagamento? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {selectedAppointment && (
            <div className="py-4">
              <p>
                <strong>Paciente:</strong> {selectedAppointment.patient_name}
              </p>
              <p>
                <strong>Data:</strong>{' '}
                {format(new Date(selectedAppointment.date), 'dd/MM/yyyy')}
              </p>
              <p>
                <strong>Valor:</strong> {formatCurrency(selectedAppointment.gross_value)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
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
              Altere os dados do pagamento. Os valores serão recalculados automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Row 1: Date and Patient */}
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
                  placeholder="Nome do paciente"
                />
              </div>
            </div>

            {/* Row 2: Professional and Procedure */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Profissional</Label>
                <Select value={editProfessionalId} onValueChange={setEditProfessionalId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
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
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {procedures.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.fixed_cost > 0 && ` (${formatCurrency(p.fixed_cost)})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Payment Method and Hospital */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                <Select value={editPaymentMethodId} onValueChange={setEditPaymentMethodId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Equiparação hospitalar</Label>
                <div className="flex items-center space-x-2 h-10">
                  <Switch
                    id="edit-hospital"
                    checked={editIsHospital}
                    onCheckedChange={setEditIsHospital}
                  />
                  <Label htmlFor="edit-hospital" className="text-sm text-muted-foreground">
                    {editIsHospital ? 'Sim (sem imposto)' : 'Não'}
                  </Label>
                </div>
              </div>
            </div>

            {/* Row 4: Gross Value */}
            <div className="space-y-2">
              <Label>Valor Bruto (R$)</Label>
              <Input
                value={editGrossValue}
                onChange={(e) => handleCurrencyInput(e.target.value, setEditGrossValue)}
                placeholder="0,00"
                className="max-w-xs"
              />
            </div>

            {/* Manual Net Value */}
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Editar Valor Líquido Manualmente</Label>
                  <p className="text-xs text-muted-foreground">
                    Ative para informar o valor líquido quando as taxas fogem à regra
                  </p>
                </div>
                <Switch
                  checked={editUseManualNet}
                  onCheckedChange={setEditUseManualNet}
                />
              </div>

              {editUseManualNet && (
                <div className="space-y-2">
                  <Label>Valor Líquido (R$)</Label>
                  <Input
                    value={editNetValue}
                    onChange={(e) => handleCurrencyInput(e.target.value, setEditNetValue)}
                    placeholder="0,00"
                  />
                  <p className="text-xs text-muted-foreground">
                    O sistema irá recalcular a taxa de cartão com base neste valor
                  </p>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Observações (opcional)"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
