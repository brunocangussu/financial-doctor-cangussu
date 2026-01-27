'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Pencil, Trash2, X, Check, Search } from 'lucide-react'

import { AppLayout } from '@/components/app-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { useExpenses, useProfessionals } from '@/lib/hooks'
import { formatCurrency } from '@/lib/calculations'
import { EXPENSE_CATEGORIES, getCategoryLabel, formatRecurrence } from '@/lib/expenses'
import type { Expense, ExpenseInput, ExpenseResponsibility } from '@/types'

export default function DespesasPage() {
  const supabase = createClient()
  const { data: expenses, loading, refetch } = useExpenses(false) // false = mostrar todas (ativas e inativas)
  const { data: professionals } = useProfessionals()

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)

  // Filter state
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('active')

  // Form states
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formRecurrenceType, setFormRecurrenceType] = useState<'once' | 'monthly' | 'custom'>('monthly')
  const [formRecurrenceInterval, setFormRecurrenceInterval] = useState('1')
  const [formRecurrenceUnit, setFormRecurrenceUnit] = useState<'days' | 'weeks' | 'months'>('months')
  const [formStartDate, setFormStartDate] = useState<Date>(new Date())
  const [formEndDate, setFormEndDate] = useState<Date | undefined>(undefined)
  const [formHasEndDate, setFormHasEndDate] = useState(false)
  const [formResponsibility, setFormResponsibility] = useState<Record<string, { selected: boolean; percentage: number }>>({})
  const [saving, setSaving] = useState(false)

  // Initialize form responsibility when professionals load
  const initializeResponsibility = (expense?: Expense) => {
    const resp: Record<string, { selected: boolean; percentage: number }> = {}
    professionals.forEach((p) => {
      const existing = expense?.responsibility.find((r) => r.professional_id === p.id)
      resp[p.id] = {
        selected: !!existing,
        percentage: existing?.percentage || 0,
      }
    })
    setFormResponsibility(resp)
  }

  // Reset form
  const resetForm = () => {
    setFormName('')
    setFormDescription('')
    setFormCategory('')
    setFormAmount('')
    setFormRecurrenceType('monthly')
    setFormRecurrenceInterval('1')
    setFormRecurrenceUnit('months')
    setFormStartDate(new Date())
    setFormEndDate(undefined)
    setFormHasEndDate(false)
    initializeResponsibility()
  }

  // Open create dialog
  const openCreateDialog = () => {
    resetForm()
    setCreateDialogOpen(true)
  }

  // Open edit dialog
  const openEditDialog = (expense: Expense) => {
    setSelectedExpense(expense)
    setFormName(expense.name)
    setFormDescription(expense.description || '')
    setFormCategory(expense.category || '')
    setFormAmount(expense.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }))
    setFormRecurrenceType(expense.recurrence_type)
    setFormRecurrenceInterval(expense.recurrence_interval?.toString() || '1')
    setFormRecurrenceUnit(expense.recurrence_unit || 'months')
    setFormStartDate(new Date(expense.start_date + 'T12:00:00'))
    setFormHasEndDate(!!expense.end_date)
    setFormEndDate(expense.end_date ? new Date(expense.end_date + 'T12:00:00') : undefined)
    initializeResponsibility(expense)
    setEditDialogOpen(true)
  }

  // Open delete dialog
  const openDeleteDialog = (expense: Expense) => {
    setSelectedExpense(expense)
    setDeleteDialogOpen(true)
  }

  // Format amount input
  const handleAmountChange = (value: string) => {
    const numbers = value.replace(/\D/g, '')
    if (numbers === '') {
      setFormAmount('')
      return
    }
    const amount = parseFloat(numbers) / 100
    setFormAmount(amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }

  // Update responsibility percentage
  const updateResponsibilityPercentage = (profId: string, percentage: number) => {
    setFormResponsibility((prev) => ({
      ...prev,
      [profId]: { ...prev[profId], percentage },
    }))
  }

  // Toggle responsibility selection
  const toggleResponsibility = (profId: string) => {
    setFormResponsibility((prev) => {
      const newSelected = !prev[profId]?.selected
      const selectedCount = Object.values(prev).filter((r) => r.selected).length + (newSelected ? 1 : -1)

      // Auto-distribute percentages when toggling
      const newResp = { ...prev }
      newResp[profId] = {
        selected: newSelected,
        percentage: newSelected ? Math.floor(100 / selectedCount) : 0,
      }

      // Redistribute for other selected professionals
      const selectedIds = Object.entries(newResp)
        .filter(([, r]) => r.selected)
        .map(([id]) => id)

      if (selectedIds.length > 0) {
        const perProf = Math.floor(100 / selectedIds.length)
        const remainder = 100 - perProf * selectedIds.length
        selectedIds.forEach((id, index) => {
          newResp[id].percentage = perProf + (index === 0 ? remainder : 0)
        })
      }

      return newResp
    })
  }

  // Build responsibility array for saving
  const buildResponsibilityArray = (): ExpenseResponsibility[] => {
    return Object.entries(formResponsibility)
      .filter(([, r]) => r.selected && r.percentage > 0)
      .map(([profId, r]) => ({
        professional_id: profId,
        percentage: r.percentage,
      }))
  }

  // Validate form
  const validateForm = (): boolean => {
    if (!formName.trim()) {
      toast.error('Informe o nome da despesa')
      return false
    }
    if (!formAmount || parseFloat(formAmount.replace(/\D/g, '')) === 0) {
      toast.error('Informe o valor da despesa')
      return false
    }
    const responsibility = buildResponsibilityArray()
    if (responsibility.length === 0) {
      toast.error('Selecione pelo menos um profissional responsável')
      return false
    }
    const totalPercentage = responsibility.reduce((sum, r) => sum + r.percentage, 0)
    if (totalPercentage !== 100) {
      toast.error(`A soma das porcentagens deve ser 100% (atual: ${totalPercentage}%)`)
      return false
    }
    return true
  }

  // Save new expense
  const handleCreate = async () => {
    if (!validateForm()) return

    setSaving(true)
    try {
      const amountNum = parseFloat(formAmount.replace(/\D/g, '')) / 100

      const input: ExpenseInput = {
        name: formName.trim(),
        description: formDescription.trim() || null,
        category: formCategory || null,
        amount: amountNum,
        recurrence_type: formRecurrenceType,
        recurrence_interval: formRecurrenceType === 'custom' ? parseInt(formRecurrenceInterval) : null,
        recurrence_unit: formRecurrenceType === 'custom' ? formRecurrenceUnit : null,
        start_date: format(formStartDate, 'yyyy-MM-dd'),
        end_date: formHasEndDate && formEndDate ? format(formEndDate, 'yyyy-MM-dd') : null,
        responsibility: buildResponsibilityArray(),
      }

      const { error } = await supabase.from('expenses').insert(input)

      if (error) throw error

      toast.success('Despesa criada com sucesso!')
      setCreateDialogOpen(false)
      refetch()
    } catch (error) {
      console.error('Error creating expense:', error)
      toast.error('Erro ao criar despesa')
    } finally {
      setSaving(false)
    }
  }

  // Update expense
  const handleUpdate = async () => {
    if (!selectedExpense || !validateForm()) return

    setSaving(true)
    try {
      const amountNum = parseFloat(formAmount.replace(/\D/g, '')) / 100

      const { error } = await supabase
        .from('expenses')
        .update({
          name: formName.trim(),
          description: formDescription.trim() || null,
          category: formCategory || null,
          amount: amountNum,
          recurrence_type: formRecurrenceType,
          recurrence_interval: formRecurrenceType === 'custom' ? parseInt(formRecurrenceInterval) : null,
          recurrence_unit: formRecurrenceType === 'custom' ? formRecurrenceUnit : null,
          start_date: format(formStartDate, 'yyyy-MM-dd'),
          end_date: formHasEndDate && formEndDate ? format(formEndDate, 'yyyy-MM-dd') : null,
          responsibility: buildResponsibilityArray(),
        })
        .eq('id', selectedExpense.id)

      if (error) throw error

      toast.success('Despesa atualizada com sucesso!')
      setEditDialogOpen(false)
      setSelectedExpense(null)
      refetch()
    } catch (error) {
      console.error('Error updating expense:', error)
      toast.error('Erro ao atualizar despesa')
    } finally {
      setSaving(false)
    }
  }

  // Toggle expense active status
  const handleToggleActive = async (expense: Expense) => {
    try {
      const { error } = await supabase
        .from('expenses')
        .update({ is_active: !expense.is_active })
        .eq('id', expense.id)

      if (error) throw error

      toast.success(expense.is_active ? 'Despesa encerrada' : 'Despesa reativada')
      refetch()
    } catch (error) {
      console.error('Error toggling expense:', error)
      toast.error('Erro ao atualizar despesa')
    }
  }

  // Delete expense
  const handleDelete = async () => {
    if (!selectedExpense) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', selectedExpense.id)

      if (error) throw error

      toast.success('Despesa excluída com sucesso!')
      setDeleteDialogOpen(false)
      setSelectedExpense(null)
      refetch()
    } catch (error) {
      console.error('Error deleting expense:', error)
      toast.error('Erro ao excluir despesa')
    } finally {
      setSaving(false)
    }
  }

  // Filter expenses
  const filteredExpenses = expenses.filter((expense) => {
    // Search filter
    if (searchTerm && !expense.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }
    // Category filter
    if (filterCategory !== 'all' && expense.category !== filterCategory) {
      return false
    }
    // Status filter
    if (filterStatus === 'active' && !expense.is_active) {
      return false
    }
    if (filterStatus === 'inactive' && expense.is_active) {
      return false
    }
    return true
  })

  // Get professional names for responsibility display
  const getResponsibilityDisplay = (expense: Expense): string => {
    return expense.responsibility
      .map((r) => {
        const prof = professionals.find((p) => p.id === r.professional_id)
        return `${prof?.name || 'Desconhecido'} (${r.percentage}%)`
      })
      .join(', ')
  }

  // Form content - rendered inline to avoid re-mount on state change
  const formContent = (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="expense-name">Nome da Despesa *</Label>
          <Input
            id="expense-name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Ex: Aluguel do consultório"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={formCategory} onValueChange={setFormCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="expense-description">Descrição</Label>
        <Input
          id="expense-description"
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          placeholder="Detalhes opcionais..."
          autoComplete="off"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="expense-amount">Valor (R$) *</Label>
          <Input
            id="expense-amount"
            value={formAmount}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="0,00"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label>Recorrência *</Label>
          <Select value={formRecurrenceType} onValueChange={(v) => setFormRecurrenceType(v as 'once' | 'monthly' | 'custom')}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="once">Pontual (única vez)</SelectItem>
              <SelectItem value="monthly">Mensal</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {formRecurrenceType === 'custom' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="expense-interval">A cada</Label>
            <Input
              id="expense-interval"
              type="number"
              min="1"
              value={formRecurrenceInterval}
              onChange={(e) => setFormRecurrenceInterval(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label>Unidade</Label>
            <Select value={formRecurrenceUnit} onValueChange={(v) => setFormRecurrenceUnit(v as 'days' | 'weeks' | 'months')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="days">Dias</SelectItem>
                <SelectItem value="weeks">Semanas</SelectItem>
                <SelectItem value="months">Meses</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Data de Início *</Label>
          <DatePickerInput
            value={formStartDate}
            onChange={(d) => d && setFormStartDate(d)}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="hasEndDate"
              checked={formHasEndDate}
              onCheckedChange={(checked) => setFormHasEndDate(!!checked)}
            />
            <Label htmlFor="hasEndDate">Data de Término</Label>
          </div>
          {formHasEndDate && (
            <DatePickerInput
              value={formEndDate}
              onChange={(d) => setFormEndDate(d)}
            />
          )}
        </div>
      </div>

      <div className="space-y-3">
        <Label>Responsabilidade *</Label>
        <p className="text-xs text-muted-foreground">
          Selecione quem é responsável por esta despesa e a porcentagem de cada um
        </p>
        <div className="space-y-2">
          {professionals.map((prof) => (
            <div key={prof.id} className="flex items-center gap-4 p-3 border rounded-lg">
              <Checkbox
                checked={formResponsibility[prof.id]?.selected || false}
                onCheckedChange={() => toggleResponsibility(prof.id)}
              />
              <span className="flex-1 font-medium">{prof.name}</span>
              {formResponsibility[prof.id]?.selected && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    className="w-20"
                    value={formResponsibility[prof.id]?.percentage || 0}
                    onChange={(e) => updateResponsibilityPercentage(prof.id, parseInt(e.target.value) || 0)}
                    autoComplete="off"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Total: {Object.values(formResponsibility).filter(r => r.selected).reduce((sum, r) => sum + r.percentage, 0)}%
        </p>
      </div>
    </div>
  )

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Despesas</h1>
          <Button onClick={openCreateDialog} className="bg-brand-gradient hover:opacity-90">
            <Plus className="h-4 w-4 mr-2" />
            Nova Despesa
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativas</SelectItem>
                  <SelectItem value="inactive">Encerradas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>Lista de Despesas</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : filteredExpenses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma despesa encontrada
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Recorrência</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                    <TableRow key={expense.id} className={!expense.is_active ? 'opacity-50' : ''}>
                      <TableCell className="font-medium">{expense.name}</TableCell>
                      <TableCell>{getCategoryLabel(expense.category)}</TableCell>
                      <TableCell>{formatCurrency(expense.amount)}</TableCell>
                      <TableCell>{formatRecurrence(expense)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {getResponsibilityDisplay(expense)}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            expense.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {expense.is_active ? 'Ativa' : 'Encerrada'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(expense)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleToggleActive(expense)}
                          >
                            {expense.is_active ? (
                              <X className="h-4 w-4 text-orange-500" />
                            ) : (
                              <Check className="h-4 w-4 text-green-500" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteDialog(expense)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Nova Despesa</DialogTitle>
            <DialogDescription>
              Cadastre uma nova despesa fixa ou pontual
            </DialogDescription>
          </DialogHeader>
          {formContent}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Salvando...' : 'Criar Despesa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Editar Despesa</DialogTitle>
            <DialogDescription>
              Altere os dados da despesa
            </DialogDescription>
          </DialogHeader>
          {formContent}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Despesa</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a despesa &quot;{selectedExpense?.name}&quot;?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  )
}
