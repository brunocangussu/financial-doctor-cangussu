'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, Save, Pencil } from 'lucide-react'
import { toast } from 'sonner'

import { AppLayout } from '@/components/app-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Switch } from '@/components/ui/switch'
import { SortablePaymentMethods } from '@/components/sortable-payment-methods'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/calculations'
import {
  useProfessionals,
  useProcedures,
  usePaymentMethods,
  useSystemSettings,
  useSplitRules,
  useBonusRules,
  useCardFeeTiers,
  useCardFeeTierRates,
  useCurrentFeeTier,
} from '@/lib/hooks'
import type {
  Professional,
  Procedure,
  PaymentMethod,
  CardFeeTierRate,
  SplitRule,
  BonusRule,
  SplitDistribution,
} from '@/types'

export default function ConfiguracoesPage() {
  // Memoize supabase client
  const supabase = useMemo(() => createClient(), [])

  // Data hooks
  const { data: professionals, refetch: refetchProfessionals } = useProfessionals()
  const { data: procedures, refetch: refetchProcedures } = useProcedures()
  const { data: paymentMethods, refetch: refetchPaymentMethods } = usePaymentMethods()
  const { data: cardFeeTiers } = useCardFeeTiers()
  const { data: cardFeeTierRates, refetch: refetchTierRates } = useCardFeeTierRates()
  const { data: currentFeeTier } = useCurrentFeeTier()
  const { data: systemSettings, refetch: refetchSettings } = useSystemSettings()
  const { data: splitRules, refetch: refetchSplitRules } = useSplitRules()
  const { data: bonusRules, refetch: refetchBonusRules } = useBonusRules()

  // Dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<{
    type: 'professional' | 'procedure' | 'payment_method' | 'card_fee_tier_rate' | 'bonus_rule' | 'split_rule'
    data: Partial<Professional | Procedure | PaymentMethod | CardFeeTierRate | BonusRule | SplitRule>
    isNew: boolean
  } | null>(null)
  const [deletingItem, setDeletingItem] = useState<{
    type: string
    id: string
    name: string
  } | null>(null)
  const [saving, setSaving] = useState(false)

  // System settings state
  const [defaultTax, setDefaultTax] = useState('')
  const [vanessaBonus, setVanessaBonus] = useState('')

  // Fee tier selection state
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null)

  // Set default selected tier to current tier
  useEffect(() => {
    if (currentFeeTier && !selectedTierId) {
      setSelectedTierId(currentFeeTier.id)
    } else if (cardFeeTiers.length > 0 && !selectedTierId) {
      setSelectedTierId(cardFeeTiers[0].id)
    }
  }, [currentFeeTier, cardFeeTiers, selectedTierId])

  // Load system settings
  useEffect(() => {
    const tax = systemSettings.find((s) => s.key === 'default_tax_percentage')
    const bonus = systemSettings.find((s) => s.key === 'vanessa_bonus_percentage')
    if (tax) setDefaultTax(tax.value)
    if (bonus) setVanessaBonus(bonus.value)
  }, [systemSettings])

  // Save handlers
  const handleSave = async () => {
    if (!editingItem) return

    setSaving(true)
    try {
      const { type, data, isNew } = editingItem
      let tableName: string = ''
      let saveData = { ...data }

      switch (type) {
        case 'professional':
          tableName = 'professionals'
          break
        case 'procedure':
          tableName = 'procedures'
          // Garante que campos opcionais estejam definidos
          const procData = saveData as Partial<Procedure>
          if (procData.vanessa_bonus_percentage === undefined) {
            (saveData as Record<string, unknown>).vanessa_bonus_percentage = procData.has_vanessa_bonus ? 1.5 : 0
          }
          break
        case 'payment_method':
          tableName = 'payment_methods'
          break
        case 'card_fee_tier_rate':
          tableName = 'card_fee_tier_rates'
          break
        case 'bonus_rule':
          tableName = 'bonus_rules'
          // Remove joined data before saving
          delete (saveData as Record<string, unknown>).procedure
          delete (saveData as Record<string, unknown>).professional
          break
        case 'split_rule':
          tableName = 'split_rules'
          // Remove joined data before saving
          delete (saveData as Record<string, unknown>).procedure
          delete (saveData as Record<string, unknown>).professional
          break
      }

      if (isNew) {
        const { error } = await supabase.from(tableName).insert(saveData)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from(tableName)
          .update(saveData)
          .eq('id', saveData.id)
        if (error) throw error
      }

      toast.success(isNew ? 'Item criado com sucesso' : 'Item atualizado com sucesso')
      setEditDialogOpen(false)
      setEditingItem(null)

      // Refetch data
      switch (type) {
        case 'professional':
          refetchProfessionals()
          break
        case 'procedure':
          refetchProcedures()
          break
        case 'payment_method':
          refetchPaymentMethods()
          break
        case 'card_fee_tier_rate':
          refetchTierRates()
          break
        case 'bonus_rule':
          refetchBonusRules()
          break
        case 'split_rule':
          refetchSplitRules()
          break
      }
    } catch (error: unknown) {
      console.error('Error saving:', error)
      const errorMessage = error instanceof Error ? error.message :
        (error as { message?: string })?.message || 'Erro desconhecido'
      toast.error(`Erro ao salvar: ${errorMessage}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingItem) return

    setSaving(true)
    try {
      const { error } = await supabase
        .from(deletingItem.type)
        .delete()
        .eq('id', deletingItem.id)

      if (error) throw error

      toast.success('Item excluído com sucesso')
      setDeleteDialogOpen(false)
      setDeletingItem(null)

      // Refetch all data
      refetchProfessionals()
      refetchProcedures()
      refetchPaymentMethods()
      refetchTierRates()
      refetchSplitRules()
      refetchBonusRules()
    } catch (error) {
      console.error('Error deleting:', error)
      toast.error('Erro ao excluir')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      await supabase
        .from('system_settings')
        .update({ value: defaultTax })
        .eq('key', 'default_tax_percentage')

      await supabase
        .from('system_settings')
        .update({ value: vanessaBonus })
        .eq('key', 'vanessa_bonus_percentage')

      toast.success('Configurações salvas com sucesso')
      refetchSettings()
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('Erro ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  // Get payment method name for card fee rules
  const getPaymentMethodName = (id: string) => {
    return paymentMethods.find((p) => p.id === id)?.name || 'Desconhecido'
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>

        <Tabs defaultValue="settings">
          <TabsList className="flex-wrap bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="settings">Geral</TabsTrigger>
            <TabsTrigger value="split_rules">Regras de Divisão</TabsTrigger>
            <TabsTrigger value="bonus_rules">Regras de Bônus</TabsTrigger>
            <TabsTrigger value="professionals">Profissionais</TabsTrigger>
            <TabsTrigger value="procedures">Procedimentos</TabsTrigger>
            <TabsTrigger value="payment_methods">Pagamentos</TabsTrigger>
            <TabsTrigger value="card_fees">Taxas</TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="settings">
            <Card className="border-0 shadow-sm rounded-xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Configurações Gerais</CardTitle>
                <CardDescription>
                  Configure os parâmetros de cálculo do sistema
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="defaultTax">Imposto Padrão (%)</Label>
                    <Input
                      id="defaultTax"
                      type="number"
                      step="0.1"
                      value={defaultTax}
                      onChange={(e) => setDefaultTax(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Percentual de imposto aplicado sobre o valor base
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vanessaBonus">Bônus Vanessa (%)</Label>
                    <Input
                      id="vanessaBonus"
                      type="number"
                      step="0.1"
                      value={vanessaBonus}
                      onChange={(e) => setVanessaBonus(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Percentual do bônus sobre Endolaser do Bruno
                    </p>
                  </div>
                </div>
                <Button onClick={handleSaveSettings} disabled={saving}>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Configurações
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Split Rules */}
          <TabsContent value="split_rules">
            <Card className="border-0 shadow-sm rounded-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Regras de Divisão</CardTitle>
                    <CardDescription>
                      Configure como dividir os valores entre profissionais por procedimento
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => {
                      setEditingItem({
                        type: 'split_rule',
                        data: {
                          name: '',
                          procedure_id: null,
                          professional_id: null,
                          distributions: [],
                          deduct_procedure_cost: true,
                          deduct_card_fee: true,
                          deduct_tax: true,
                          priority: 0,
                          is_active: true,
                        } as Partial<SplitRule>,
                        isNew: true,
                      })
                      setEditDialogOpen(true)
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Regra de Divisão
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {splitRules.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Nenhuma regra de divisão configurada.</p>
                    <p className="text-sm mt-2">
                      Crie regras para definir como dividir valores entre profissionais
                      (ex: Endolaser + Valquíria = 50/50).
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome da Regra</TableHead>
                        <TableHead>Procedimento</TableHead>
                        <TableHead>Profissional</TableHead>
                        <TableHead>Distribuição</TableHead>
                        <TableHead>Prioridade</TableHead>
                        <TableHead className="text-center">Ativo</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {splitRules.map((rule) => {
                        const dists = (rule.distributions as SplitDistribution[]) || []
                        const distStr = dists.map(d => {
                          const prof = professionals.find(p => p.id === d.professional_id)
                          return `${prof?.name || '?'}: ${d.percentage}%`
                        }).join(', ')

                        return (
                          <TableRow key={rule.id}>
                            <TableCell className="font-medium">{rule.name}</TableCell>
                            <TableCell>{rule.procedure?.name || <span className="text-muted-foreground">Qualquer</span>}</TableCell>
                            <TableCell>{rule.professional?.name || <span className="text-muted-foreground">Qualquer</span>}</TableCell>
                            <TableCell>{distStr}</TableCell>
                            <TableCell>{rule.priority}</TableCell>
                            <TableCell className="text-center">
                              {rule.is_active ? (
                                <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                              ) : (
                                <span className="inline-block w-2 h-2 bg-gray-300 rounded-full" />
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingItem({
                                    type: 'split_rule',
                                    data: { ...rule },
                                    isNew: false,
                                  })
                                  setEditDialogOpen(true)
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => {
                                  setDeletingItem({
                                    type: 'split_rules',
                                    id: rule.id,
                                    name: rule.name,
                                  })
                                  setDeleteDialogOpen(true)
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
                <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium mb-2">Como funciona:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li><strong>Procedimento:</strong> Se definido, a regra só se aplica a esse procedimento</li>
                    <li><strong>Profissional:</strong> Se definido, a regra só se aplica quando esse profissional realiza o atendimento</li>
                    <li><strong>Distribuição:</strong> Define quanto cada profissional recebe (deve somar 100%)</li>
                    <li><strong>Prioridade:</strong> Em caso de empate na especificidade, a regra com maior prioridade vence</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bonus Rules */}
          <TabsContent value="bonus_rules">
            <Card className="border-0 shadow-sm rounded-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Regras de Bônus/Repasse</CardTitle>
                    <CardDescription>
                      Configure bônus e repasses para terceiros (ex: Vanessa).
                      Cada regra define quando e quanto repassar com base no procedimento e/ou profissional.
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => {
                      setEditingItem({
                        type: 'bonus_rule',
                        data: {
                          name: '',
                          beneficiary_name: '',
                          procedure_id: null,
                          professional_id: null,
                          percentage: 1.5,
                          base_value: 'net_value',
                          is_active: true,
                        },
                        isNew: true,
                      })
                      setEditDialogOpen(true)
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Regra de Bônus
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {bonusRules.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>Nenhuma regra de bônus configurada.</p>
                    <p className="text-sm mt-2">
                      Crie regras para definir quando um bônus deve ser aplicado
                      (ex: Vanessa recebe 1,5% quando Bruno realiza Endolaser).
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome da Regra</TableHead>
                        <TableHead>Beneficiário</TableHead>
                        <TableHead>Procedimento</TableHead>
                        <TableHead>Profissional</TableHead>
                        <TableHead className="text-right">Percentual</TableHead>
                        <TableHead>Base</TableHead>
                        <TableHead className="text-center">Ativo</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bonusRules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="font-medium">{rule.name}</TableCell>
                          <TableCell>{rule.beneficiary_name}</TableCell>
                          <TableCell>
                            {rule.procedure?.name || <span className="text-muted-foreground">Qualquer</span>}
                          </TableCell>
                          <TableCell>
                            {rule.professional?.name || <span className="text-muted-foreground">Qualquer</span>}
                          </TableCell>
                          <TableCell className="text-right">{rule.percentage}%</TableCell>
                          <TableCell>
                            {rule.base_value === 'gross_value' && 'Valor Bruto'}
                            {rule.base_value === 'net_value' && 'Valor Líquido'}
                            {rule.base_value === 'final_after_costs' && 'Valor Líquido'}
                          </TableCell>
                          <TableCell className="text-center">
                            {rule.is_active ? (
                              <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                            ) : (
                              <span className="inline-block w-2 h-2 bg-gray-300 rounded-full" />
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingItem({
                                  type: 'bonus_rule',
                                  data: { ...rule },
                                  isNew: false,
                                })
                                setEditDialogOpen(true)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => {
                                setDeletingItem({
                                  type: 'bonus_rules',
                                  id: rule.id,
                                  name: rule.name,
                                })
                                setDeleteDialogOpen(true)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                  <h4 className="font-medium mb-2">Como funciona:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li><strong>Procedimento:</strong> Se definido, a regra só se aplica a esse procedimento</li>
                    <li><strong>Profissional:</strong> Se definido, a regra só se aplica quando esse profissional realiza o atendimento</li>
                    <li><strong>Combinação:</strong> Pode definir ambos (ex: Endolaser + Bruno = Vanessa recebe 1,5%)</li>
                    <li><strong>Deixar vazio:</strong> Se deixar "Qualquer", aplica a todos os casos</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Professionals */}
          <TabsContent value="professionals">
            <Card className="border-0 shadow-sm rounded-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Profissionais</CardTitle>
                    <CardDescription>Gerencie os profissionais da clínica</CardDescription>
                  </div>
                  <Button
                    onClick={() => {
                      setEditingItem({
                        type: 'professional',
                        data: { name: '', bank_info: '' },
                        isNew: true,
                      })
                      setEditDialogOpen(true)
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Profissional
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Dados Bancários</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {professionals.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.bank_info || '-'}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingItem({
                                type: 'professional',
                                data: { ...p },
                                isNew: false,
                              })
                              setEditDialogOpen(true)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => {
                              setDeletingItem({
                                type: 'professionals',
                                id: p.id,
                                name: p.name,
                              })
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Procedures */}
          <TabsContent value="procedures">
            <Card className="border-0 shadow-sm rounded-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Procedimentos</CardTitle>
                    <CardDescription>Gerencie os tipos de procedimentos</CardDescription>
                  </div>
                  <Button
                    onClick={() => {
                      setEditingItem({
                        type: 'procedure',
                        data: { name: '', fixed_cost: 0, has_vanessa_bonus: false, vanessa_bonus_percentage: 0 },
                        isNew: true,
                      })
                      setEditDialogOpen(true)
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Procedimento
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead className="text-right">Custo Fixo</TableHead>
                      <TableHead className="text-center">Repasse Vanessa</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {procedures.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(p.fixed_cost)}
                        </TableCell>
                        <TableCell className="text-center">
                          {p.has_vanessa_bonus ? `${p.vanessa_bonus_percentage || 1.5}%` : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingItem({
                                type: 'procedure',
                                data: { ...p },
                                isNew: false,
                              })
                              setEditDialogOpen(true)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => {
                              setDeletingItem({
                                type: 'procedures',
                                id: p.id,
                                name: p.name,
                              })
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Methods */}
          <TabsContent value="payment_methods">
            <Card className="border-0 shadow-sm rounded-xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Formas de Pagamento</CardTitle>
                    <CardDescription>
                      Arraste os itens para reordenar. A ordem será salva automaticamente.
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => {
                      setEditingItem({
                        type: 'payment_method',
                        data: { name: '', display_order: paymentMethods.length + 1 },
                        isNew: true,
                      })
                      setEditDialogOpen(true)
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nova Forma de Pagamento
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <SortablePaymentMethods
                  items={paymentMethods}
                  onReorder={async (reorderedItems) => {
                    // Update display_order for each item
                    const updates = reorderedItems.map((item, index) => ({
                      id: item.id,
                      display_order: index + 1,
                    }))

                    try {
                      for (const update of updates) {
                        await supabase
                          .from('payment_methods')
                          .update({ display_order: update.display_order })
                          .eq('id', update.id)
                      }
                      toast.success('Ordem salva com sucesso')
                      refetchPaymentMethods()
                    } catch (error) {
                      console.error('Error updating order:', error)
                      toast.error('Erro ao salvar ordem')
                    }
                  }}
                  onEdit={(item) => {
                    setEditingItem({
                      type: 'payment_method',
                      data: { ...item },
                      isNew: false,
                    })
                    setEditDialogOpen(true)
                  }}
                  onDelete={(item) => {
                    setDeletingItem({
                      type: 'payment_methods',
                      id: item.id,
                      name: item.name,
                    })
                    setDeleteDialogOpen(true)
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Card Fee Tiers */}
          <TabsContent value="card_fees">
            <div className="space-y-4">
              {/* Current Tier Info */}
              {currentFeeTier && (
                <Card className="border-0 shadow-sm rounded-xl bg-brand-gradient-soft">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <span className="inline-block w-3 h-3 bg-[#00D9A3] rounded-full animate-pulse" />
                      Faixa Atual: {currentFeeTier.name}
                    </CardTitle>
                    <CardDescription>
                      Baseado no faturamento do mês anterior: {formatCurrency(currentFeeTier.previous_month_revenue)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">
                      Faixa de faturamento: {formatCurrency(currentFeeTier.min_revenue)} - {currentFeeTier.max_revenue ? formatCurrency(currentFeeTier.max_revenue) : 'Sem limite'}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Tier Selection */}
              <Card className="border-0 shadow-sm rounded-xl">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Taxas por Faixa de Faturamento (InfinitePay)</CardTitle>
                      <CardDescription>
                        As taxas são aplicadas automaticamente conforme o faturamento do mês anterior.
                        Selecione uma faixa abaixo para ver as taxas correspondentes.
                      </CardDescription>
                    </div>
                    {selectedTierId && (
                      <Button
                        onClick={() => {
                          setEditingItem({
                            type: 'card_fee_tier_rate',
                            data: { tier_id: selectedTierId, payment_method_id: '', fee_percentage: 0 },
                            isNew: true,
                          })
                          setEditDialogOpen(true)
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Nova Taxa
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Tier Tabs */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {cardFeeTiers.map((tier) => (
                      <Button
                        key={tier.id}
                        variant={selectedTierId === tier.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedTierId(tier.id)}
                        className={`relative rounded-lg transition-all duration-200 ${
                          selectedTierId === tier.id
                            ? 'bg-brand-gradient shadow-brand-sm text-white hover:opacity-90'
                            : 'hover:border-primary/50'
                        }`}
                      >
                        {tier.name}
                        {currentFeeTier?.id === tier.id && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#00D9A3] rounded-full" />
                        )}
                      </Button>
                    ))}
                  </div>

                  {/* Selected Tier Info */}
                  {selectedTierId && (
                    <div className="mb-4 p-3 bg-accent rounded-xl">
                      {(() => {
                        const tier = cardFeeTiers.find(t => t.id === selectedTierId)
                        if (!tier) return null
                        return (
                          <p className="text-sm">
                            <strong>{tier.name}</strong>: Faturamento entre{' '}
                            {formatCurrency(tier.min_revenue)} e{' '}
                            {tier.max_revenue ? formatCurrency(tier.max_revenue) : 'sem limite'}
                          </p>
                        )
                      })()}
                    </div>
                  )}

                  {/* Rates Table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Forma de Pagamento</TableHead>
                        <TableHead className="text-right">Taxa (%)</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cardFeeTierRates
                        .filter(rate => rate.tier_id === selectedTierId)
                        .sort((a, b) => {
                          const pmA = a.payment_method?.name || ''
                          const pmB = b.payment_method?.name || ''
                          return pmA.localeCompare(pmB)
                        })
                        .map((rate) => (
                          <TableRow key={rate.id}>
                            <TableCell className="font-medium">
                              {rate.payment_method?.name || getPaymentMethodName(rate.payment_method_id)}
                            </TableCell>
                            <TableCell className="text-right">{rate.fee_percentage}%</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingItem({
                                    type: 'card_fee_tier_rate',
                                    data: {
                                      id: rate.id,
                                      tier_id: rate.tier_id,
                                      payment_method_id: rate.payment_method_id,
                                      fee_percentage: rate.fee_percentage,
                                    },
                                    isNew: false,
                                  })
                                  setEditDialogOpen(true)
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => {
                                  setDeletingItem({
                                    type: 'card_fee_tier_rates',
                                    id: rate.id,
                                    name: rate.payment_method?.name || 'Taxa',
                                  })
                                  setDeleteDialogOpen(true)
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      {cardFeeTierRates.filter(rate => rate.tier_id === selectedTierId).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                            Nenhuma taxa cadastrada para esta faixa
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem?.isNew ? 'Nova' : 'Editar'}{' '}
              {editingItem?.type === 'professional' && 'Profissional'}
              {editingItem?.type === 'procedure' && 'Procedimento'}
              {editingItem?.type === 'payment_method' && 'Forma de Pagamento'}
              {editingItem?.type === 'card_fee_tier_rate' && 'Taxa de Cartão'}
              {editingItem?.type === 'bonus_rule' && 'Regra de Bônus'}
              {editingItem?.type === 'split_rule' && 'Regra de Divisão'}
            </DialogTitle>
          </DialogHeader>

          {editingItem && (
            <div className="space-y-4">
              {/* Professional Form */}
              {editingItem.type === 'professional' && (
                <>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={(editingItem.data as Partial<Professional>).name || ''}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          data: { ...editingItem.data, name: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Dados Bancários</Label>
                    <Input
                      value={(editingItem.data as Partial<Professional>).bank_info || ''}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          data: { ...editingItem.data, bank_info: e.target.value },
                        })
                      }
                    />
                  </div>
                </>
              )}

              {/* Procedure Form */}
              {editingItem.type === 'procedure' && (
                <>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={(editingItem.data as Partial<Procedure>).name || ''}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          data: { ...editingItem.data, name: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Custo Fixo (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={(editingItem.data as Partial<Procedure>).fixed_cost || 0}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          data: {
                            ...editingItem.data,
                            fixed_cost: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={(editingItem.data as Partial<Procedure>).has_vanessa_bonus || false}
                        onCheckedChange={(checked) =>
                          setEditingItem({
                            ...editingItem,
                            data: {
                              ...editingItem.data,
                              has_vanessa_bonus: checked,
                              vanessa_bonus_percentage: checked ? ((editingItem.data as Partial<Procedure>).vanessa_bonus_percentage || 1.5) : 0,
                            },
                          })
                        }
                      />
                      <Label>Repasse para Vanessa</Label>
                    </div>
                    {(editingItem.data as Partial<Procedure>).has_vanessa_bonus && (
                      <div className="space-y-2 ml-6">
                        <Label>Porcentagem do Repasse (%)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={(editingItem.data as Partial<Procedure>).vanessa_bonus_percentage || 1.5}
                          onChange={(e) =>
                            setEditingItem({
                              ...editingItem,
                              data: {
                                ...editingItem.data,
                                vanessa_bonus_percentage: parseFloat(e.target.value) || 0,
                              },
                            })
                          }
                          className="max-w-[120px]"
                        />
                        <p className="text-xs text-muted-foreground">
                          Porcentagem do valor líquido repassada para Vanessa
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Payment Method Form */}
              {editingItem.type === 'payment_method' && (
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={(editingItem.data as Partial<PaymentMethod>).name || ''}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        data: { ...editingItem.data, name: e.target.value },
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Use drag-and-drop na lista para alterar a ordem
                  </p>
                </div>
              )}

              {/* Card Fee Tier Rate Form */}
              {editingItem.type === 'card_fee_tier_rate' && (
                <>
                  <div className="space-y-2">
                    <Label>Faixa</Label>
                    <Input
                      value={cardFeeTiers.find(t => t.id === (editingItem.data as Partial<CardFeeTierRate>).tier_id)?.name || ''}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">
                      A faixa é determinada pela seleção na tela anterior
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Forma de Pagamento</Label>
                    <select
                      className="w-full h-10 px-3 border rounded-md bg-background"
                      value={(editingItem.data as Partial<CardFeeTierRate>).payment_method_id || ''}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          data: { ...editingItem.data, payment_method_id: e.target.value },
                        })
                      }
                    >
                      <option value="">Selecione...</option>
                      {paymentMethods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Taxa (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={(editingItem.data as Partial<CardFeeTierRate>).fee_percentage || 0}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          data: {
                            ...editingItem.data,
                            fee_percentage: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </div>
                </>
              )}

              {/* Bonus Rule Form */}
              {editingItem.type === 'bonus_rule' && (
                <>
                  <div className="space-y-2">
                    <Label>Nome da Regra</Label>
                    <Input
                      value={(editingItem.data as Partial<BonusRule>).name || ''}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          data: { ...editingItem.data, name: e.target.value },
                        })
                      }
                      placeholder="Ex: Bônus Vanessa Endolaser Bruno"
                    />
                    <p className="text-xs text-muted-foreground">
                      Nome para identificar a regra (ex: Bônus Vanessa Endolaser)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Beneficiário</Label>
                    <Input
                      value={(editingItem.data as Partial<BonusRule>).beneficiary_name || ''}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          data: { ...editingItem.data, beneficiary_name: e.target.value },
                        })
                      }
                      placeholder="Ex: Vanessa"
                    />
                    <p className="text-xs text-muted-foreground">
                      Nome de quem recebe o bônus (ex: Vanessa)
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Procedimento (condição)</Label>
                      <select
                        className="w-full h-10 px-3 border rounded-md bg-background"
                        value={(editingItem.data as Partial<BonusRule>).procedure_id || ''}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            data: {
                              ...editingItem.data,
                              procedure_id: e.target.value || null,
                            },
                          })
                        }
                      >
                        <option value="">Qualquer procedimento</option>
                        {procedures.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Profissional (condição)</Label>
                      <select
                        className="w-full h-10 px-3 border rounded-md bg-background"
                        value={(editingItem.data as Partial<BonusRule>).professional_id || ''}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            data: {
                              ...editingItem.data,
                              professional_id: e.target.value || null,
                            },
                          })
                        }
                      >
                        <option value="">Qualquer profissional</option>
                        {professionals.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg text-sm">
                    <strong>Condição:</strong>{' '}
                    {(() => {
                      const proc = procedures.find(p => p.id === (editingItem.data as Partial<BonusRule>).procedure_id)
                      const prof = professionals.find(p => p.id === (editingItem.data as Partial<BonusRule>).professional_id)
                      if (proc && prof) {
                        return `Bônus aplicado quando ${prof.name} realiza ${proc.name}`
                      } else if (proc) {
                        return `Bônus aplicado para qualquer ${proc.name}`
                      } else if (prof) {
                        return `Bônus aplicado para qualquer procedimento de ${prof.name}`
                      }
                      return 'Bônus aplicado para qualquer atendimento'
                    })()}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Percentual (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={(editingItem.data as Partial<BonusRule>).percentage || 0}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            data: {
                              ...editingItem.data,
                              percentage: parseFloat(e.target.value) || 0,
                            },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Base de Cálculo</Label>
                      <select
                        className="w-full h-10 px-3 border rounded-md bg-background"
                        value={(editingItem.data as Partial<BonusRule>).base_value || 'net_value'}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            data: {
                              ...editingItem.data,
                              base_value: e.target.value as 'gross_value' | 'net_value' | 'final_after_costs',
                            },
                          })
                        }
                      >
                        <option value="gross_value">Valor Bruto</option>
                        <option value="net_value">Valor Líquido</option>
                      </select>
                      <p className="text-xs text-muted-foreground">
                        Bruto = valor cobrado | Líquido = após taxa, imposto e custos
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={(editingItem.data as Partial<BonusRule>).is_active ?? true}
                      onCheckedChange={(checked) =>
                        setEditingItem({
                          ...editingItem,
                          data: { ...editingItem.data, is_active: checked },
                        })
                      }
                    />
                    <Label>Regra ativa</Label>
                  </div>
                </>
              )}

              {/* Split Rule Form */}
              {editingItem.type === 'split_rule' && (
                <>
                  <div className="space-y-2">
                    <Label>Nome da Regra</Label>
                    <Input
                      value={(editingItem.data as Partial<SplitRule>).name || ''}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          data: { ...editingItem.data, name: e.target.value },
                        })
                      }
                      placeholder="Ex: Endolaser - Valquíria (50/50)"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Procedimento (condição)</Label>
                      <select
                        className="w-full h-10 px-3 border rounded-md bg-background"
                        value={(editingItem.data as Partial<SplitRule>).procedure_id || ''}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            data: {
                              ...editingItem.data,
                              procedure_id: e.target.value || null,
                            },
                          })
                        }
                      >
                        <option value="">Qualquer procedimento</option>
                        {procedures.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>Profissional (condição)</Label>
                      <select
                        className="w-full h-10 px-3 border rounded-md bg-background"
                        value={(editingItem.data as Partial<SplitRule>).professional_id || ''}
                        onChange={(e) =>
                          setEditingItem({
                            ...editingItem,
                            data: {
                              ...editingItem.data,
                              professional_id: e.target.value || null,
                            },
                          })
                        }
                      >
                        <option value="">Qualquer profissional</option>
                        {professionals.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Prioridade</Label>
                    <Input
                      type="number"
                      min="0"
                      value={(editingItem.data as Partial<SplitRule>).priority || 0}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          data: {
                            ...editingItem.data,
                            priority: parseInt(e.target.value) || 0,
                          },
                        })
                      }
                      className="max-w-[120px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      Em caso de empate na especificidade, a regra com maior prioridade vence
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Distribuição</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const dists = [...((editingItem.data as Partial<SplitRule>).distributions || [])]
                          dists.push({ professional_id: '', percentage: 0 })
                          setEditingItem({
                            ...editingItem,
                            data: { ...editingItem.data, distributions: dists },
                          })
                        }}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Adicionar
                      </Button>
                    </div>
                    {((editingItem.data as Partial<SplitRule>).distributions || []).map((dist, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          className="flex-1 h-10 px-3 border rounded-md bg-background"
                          value={dist.professional_id}
                          onChange={(e) => {
                            const dists = [...((editingItem.data as Partial<SplitRule>).distributions || [])]
                            dists[idx] = { ...dists[idx], professional_id: e.target.value }
                            setEditingItem({
                              ...editingItem,
                              data: { ...editingItem.data, distributions: dists },
                            })
                          }}
                        >
                          <option value="">Selecione...</option>
                          {professionals.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={dist.percentage}
                          onChange={(e) => {
                            const dists = [...((editingItem.data as Partial<SplitRule>).distributions || [])]
                            dists[idx] = { ...dists[idx], percentage: parseFloat(e.target.value) || 0 }
                            setEditingItem({
                              ...editingItem,
                              data: { ...editingItem.data, distributions: dists },
                            })
                          }}
                          className="w-[100px]"
                          placeholder="%"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            const dists = [...((editingItem.data as Partial<SplitRule>).distributions || [])]
                            dists.splice(idx, 1)
                            setEditingItem({
                              ...editingItem,
                              data: { ...editingItem.data, distributions: dists },
                            })
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {(() => {
                      const dists = (editingItem.data as Partial<SplitRule>).distributions || []
                      const total = dists.reduce((sum, d) => sum + d.percentage, 0)
                      return (
                        <p className={`text-sm ${Math.abs(total - 100) < 0.01 ? 'text-green-600' : 'text-destructive'}`}>
                          Total: {total.toFixed(1)}% {Math.abs(total - 100) < 0.01 ? '(OK)' : '(deve somar 100%)'}
                        </p>
                      )
                    })()}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={(editingItem.data as Partial<SplitRule>).is_active ?? true}
                      onCheckedChange={(checked) =>
                        setEditingItem({
                          ...editingItem,
                          data: { ...editingItem.data, is_active: checked },
                        })
                      }
                    />
                    <Label>Regra ativa</Label>
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false)
                setEditingItem(null)
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir &quot;{deletingItem?.name}&quot;? Esta ação não
              pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setDeletingItem(null)
              }}
              disabled={saving}
            >
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
