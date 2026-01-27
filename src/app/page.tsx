'use client'

import { useState, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import { AppLayout } from '@/components/app-layout'
import { StatsCards } from '@/components/dashboard/stats-cards'
import {
  RevenueByProcedureChart,
  MonthlyTrendChart,
  RevenueByProfessionalChart,
} from '@/components/dashboard/charts'
import { Button } from '@/components/ui/button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/calculations'
import { useProfessionals } from '@/lib/hooks'
import type { Appointment } from '@/types'

export default function DashboardPage() {
  const supabase = createClient()
  const { data: professionals } = useProfessionals()

  // Date range state - default to current month
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()))
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()))

  // Data state
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [monthlyTrendData, setMonthlyTrendData] = useState<{
    month: string
    gross: number
    net: number
    bruno: number
    otherProfessional: number
    vanessaBonus: number
  }[]>([])
  const [previousPeriodData, setPreviousPeriodData] = useState<{
    gross: number
    net: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)

      // Fetch current period
      const { data: currentData } = await supabase
        .from('appointments')
        .select(`
          *,
          professional:professionals(*),
          procedure:procedures(*)
        `)
        .gte('date', format(startDate, 'yyyy-MM-dd'))
        .lte('date', format(endDate, 'yyyy-MM-dd'))

      if (currentData) {
        setAppointments(currentData as Appointment[])
      }

      // Fetch previous period for comparison
      const periodLength = endDate.getTime() - startDate.getTime()
      const prevStart = new Date(startDate.getTime() - periodLength)
      const prevEnd = new Date(endDate.getTime() - periodLength)

      const { data: prevData } = await supabase
        .from('appointments')
        .select('gross_value, net_value')
        .gte('date', format(prevStart, 'yyyy-MM-dd'))
        .lte('date', format(prevEnd, 'yyyy-MM-dd'))

      if (prevData && prevData.length > 0) {
        const prevTotals = prevData.reduce(
          (acc, a) => ({
            gross: acc.gross + a.gross_value,
            net: acc.net + a.net_value,
          }),
          { gross: 0, net: 0 }
        )
        setPreviousPeriodData(prevTotals)
      } else {
        setPreviousPeriodData(null)
      }

      // Fetch monthly trend data (last 6 months - independent of filter)
      const sixMonthsAgo = startOfMonth(subMonths(new Date(), 5))
      const { data: trendData } = await supabase
        .from('appointments')
        .select('date, gross_value, net_value, final_value_bruno, final_value_professional, vanessa_bonus')
        .gte('date', format(sixMonthsAgo, 'yyyy-MM-dd'))
        .lte('date', format(endOfMonth(new Date()), 'yyyy-MM-dd'))

      if (trendData) {
        const monthlyData = Array.from({ length: 6 }, (_, i) => {
          const date = subMonths(new Date(), 5 - i)
          const monthStart = startOfMonth(date)
          const monthEnd = endOfMonth(date)
          const monthAppointments = trendData.filter((a) => {
            const appointmentDate = new Date(a.date)
            return appointmentDate >= monthStart && appointmentDate <= monthEnd
          })
          return {
            month: format(date, 'MMM', { locale: ptBR }),
            gross: monthAppointments.reduce((sum, a) => sum + a.gross_value, 0),
            net: monthAppointments.reduce((sum, a) => sum + a.net_value, 0),
            bruno: monthAppointments.reduce((sum, a) => sum + (a.final_value_bruno || 0), 0),
            otherProfessional: monthAppointments.reduce((sum, a) => sum + (a.final_value_professional || 0), 0),
            vanessaBonus: monthAppointments.reduce((sum, a) => sum + (a.vanessa_bonus || 0), 0),
          }
        })
        setMonthlyTrendData(monthlyData)
      }

      setLoading(false)
    }

    fetchData()
  }, [startDate, endDate, supabase])

  // Calculate stats
  const totalGross = appointments.reduce((sum, a) => sum + a.gross_value, 0)
  const totalNet = appointments.reduce((sum, a) => sum + a.net_value, 0)
  const appointmentsCount = appointments.length
  const averageTicket = appointmentsCount > 0 ? totalGross / appointmentsCount : 0

  // Calculate values per professional
  const totalBruno = appointments.reduce((sum, a) => sum + (a.final_value_bruno || 0), 0)
  const totalValquiria = appointments.reduce((sum, a) => sum + (a.final_value_professional || 0), 0)
  const totalVanessa = appointments.reduce((sum, a) => sum + (a.vanessa_bonus || 0), 0)

  // Get professional names from database
  const brunoProfessional = professionals.find(p => p.name.toLowerCase() === 'bruno')
  const otherProfessional = professionals.find(p => p.name.toLowerCase() !== 'bruno')
  const brunoName = brunoProfessional?.name || 'Bruno'
  const otherProfessionalName = otherProfessional?.name || 'Profissional'

  // Calculate revenue by procedure
  const revenueByProcedure = appointments.reduce<Record<string, number>>(
    (acc, a) => {
      const procedureName = a.procedure?.name || 'Sem procedimento'
      acc[procedureName] = (acc[procedureName] || 0) + a.net_value
      return acc
    },
    {}
  )
  const procedureChartData = Object.entries(revenueByProcedure)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  // Calculate revenue by professional (based on net_value attributed to each)
  const professionalChartData = [
    { name: brunoName, value: totalBruno },
    { name: otherProfessionalName, value: totalValquiria },
  ].filter(p => p.value > 0)

  // Preset buttons
  const setCurrentMonth = () => {
    setStartDate(startOfMonth(new Date()))
    setEndDate(endOfMonth(new Date()))
  }

  const setLastMonth = () => {
    const lastMonth = subMonths(new Date(), 1)
    setStartDate(startOfMonth(lastMonth))
    setEndDate(endOfMonth(lastMonth))
  }

  const setLast3Months = () => {
    setStartDate(startOfMonth(subMonths(new Date(), 2)))
    setEndDate(endOfMonth(new Date()))
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard Financeiro</h1>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={setCurrentMonth}>
              Este Mês
            </Button>
            <Button variant="outline" size="sm" onClick={setLastMonth}>
              Mês Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={setLast3Months}>
              Últimos 3 Meses
            </Button>

            <div className="flex items-center gap-2 ml-4">
              <DatePickerInput
                value={startDate}
                onChange={(d) => d && setStartDate(d)}
                placeholder="Início"
              />
              <span className="text-muted-foreground">até</span>
              <DatePickerInput
                value={endDate}
                onChange={(d) => d && setEndDate(d)}
                placeholder="Fim"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : (
          <>
            <StatsCards
              totalGross={totalGross}
              totalNet={totalNet}
              appointmentsCount={appointmentsCount}
              averageTicket={averageTicket}
              previousPeriodGross={previousPeriodData?.gross}
              previousPeriodNet={previousPeriodData?.net}
            />

            {/* Cards de valores por profissional */}
            <div className="grid gap-3 md:grid-cols-3">
              {/* Bruno - Blue */}
              <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(74, 144, 226, 0.1) 0%, rgba(86, 19, 138, 0.1) 100%)' }}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: '#4A90E2' }}>Valor {brunoName}</div>
                      <div className="text-2xl font-bold mt-1" style={{ color: '#3A7BC8' }}>
                        {formatCurrency(totalBruno)}
                      </div>
                    </div>
                    <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(74, 144, 226, 0.2)' }}>
                      <span className="font-bold text-sm" style={{ color: '#4A90E2' }}>
                        {totalNet > 0 ? ((totalBruno / totalNet) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  </div>
                  <p className="text-xs mt-2" style={{ color: 'rgba(74, 144, 226, 0.7)' }}>
                    do valor líquido
                  </p>
                </CardContent>
              </Card>
              {/* Other Professional - Magenta */}
              <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(206, 48, 249, 0.08) 0%, rgba(86, 19, 138, 0.12) 100%)' }}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: '#56138A' }}>Valor {otherProfessionalName}</div>
                      <div className="text-2xl font-bold mt-1" style={{ color: '#CE30F9' }}>
                        {formatCurrency(totalValquiria)}
                      </div>
                    </div>
                    <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(206, 48, 249, 0.15)' }}>
                      <span className="font-bold text-sm" style={{ color: '#CE30F9' }}>
                        {totalNet > 0 ? ((totalValquiria / totalNet) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  </div>
                  <p className="text-xs mt-2" style={{ color: 'rgba(86, 19, 138, 0.7)' }}>
                    do valor líquido
                  </p>
                </CardContent>
              </Card>
              {/* Vanessa - Mint */}
              <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(0, 217, 163, 0.1) 0%, rgba(0, 217, 163, 0.18) 100%)' }}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: '#00A87D' }}>Bônus Vanessa</div>
                      <div className="text-2xl font-bold mt-1" style={{ color: '#00D9A3' }}>
                        {formatCurrency(totalVanessa)}
                      </div>
                    </div>
                    <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 217, 163, 0.2)' }}>
                      <span className="font-bold text-sm" style={{ color: '#00D9A3' }}>
                        {totalNet > 0 ? ((totalVanessa / totalNet) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  </div>
                  <p className="text-xs mt-2" style={{ color: 'rgba(0, 168, 125, 0.7)' }}>
                    do valor líquido
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <RevenueByProfessionalChart data={professionalChartData} />
              <RevenueByProcedureChart data={procedureChartData} />
            </div>

            <MonthlyTrendChart
              data={monthlyTrendData}
              brunoName={brunoName}
              otherProfessionalName={otherProfessionalName}
            />
          </>
        )}
      </div>
    </AppLayout>
  )
}
