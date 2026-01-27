'use client'

import { TrendingUp, TrendingDown, DollarSign, Users, Calendar, Activity } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/calculations'

// Brand Colors
const BRAND = {
  magenta: '#CE30F9',
  purple: '#56138A',
  navy: '#20203F',
  blue: '#4A90E2',
  mint: '#00D9A3',
  peach: '#FFB088',
}

interface StatsCardsProps {
  totalGross: number
  totalNet: number
  appointmentsCount: number
  averageTicket: number
  previousPeriodGross?: number
  previousPeriodNet?: number
}

export function StatsCards({
  totalGross,
  totalNet,
  appointmentsCount,
  averageTicket,
  previousPeriodGross,
  previousPeriodNet,
}: StatsCardsProps) {
  const grossChange = previousPeriodGross
    ? ((totalGross - previousPeriodGross) / previousPeriodGross) * 100
    : 0
  const netChange = previousPeriodNet
    ? ((totalNet - previousPeriodNet) / previousPeriodNet) * 100
    : 0

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      {/* Faturamento Bruto - Navy */}
      <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(32, 32, 63, 0.05) 0%, rgba(32, 32, 63, 0.1) 100%)' }}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: BRAND.navy }}>Faturamento Bruto</div>
            <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${BRAND.navy}15` }}>
              <DollarSign className="h-4 w-4" style={{ color: BRAND.navy }} />
            </div>
          </div>
          <div className="text-2xl font-bold mt-2" style={{ color: BRAND.navy }}>{formatCurrency(totalGross)}</div>
          {previousPeriodGross !== undefined && (
            <p className="text-xs flex items-center gap-1 mt-1" style={{ color: `${BRAND.navy}80` }}>
              {grossChange >= 0 ? (
                <TrendingUp className="h-3 w-3" style={{ color: BRAND.mint }} />
              ) : (
                <TrendingDown className="h-3 w-3 text-rose-500" />
              )}
              <span style={{ color: grossChange >= 0 ? BRAND.mint : '#EF4444' }}>
                {grossChange >= 0 ? '+' : ''}
                {grossChange.toFixed(1)}%
              </span>
              vs período anterior
            </p>
          )}
        </CardContent>
      </Card>

      {/* Faturamento Líquido - Magenta/Purple */}
      <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(206, 48, 249, 0.08) 0%, rgba(86, 19, 138, 0.12) 100%)' }}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: BRAND.purple }}>Faturamento Líquido</div>
            <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${BRAND.magenta}20` }}>
              <Activity className="h-4 w-4" style={{ color: BRAND.magenta }} />
            </div>
          </div>
          <div className="text-2xl font-bold mt-2" style={{ color: BRAND.magenta }}>{formatCurrency(totalNet)}</div>
          {previousPeriodNet !== undefined && (
            <p className="text-xs flex items-center gap-1 mt-1" style={{ color: `${BRAND.purple}80` }}>
              {netChange >= 0 ? (
                <TrendingUp className="h-3 w-3" style={{ color: BRAND.mint }} />
              ) : (
                <TrendingDown className="h-3 w-3 text-rose-500" />
              )}
              <span style={{ color: netChange >= 0 ? BRAND.mint : '#EF4444' }}>
                {netChange >= 0 ? '+' : ''}
                {netChange.toFixed(1)}%
              </span>
              vs período anterior
            </p>
          )}
        </CardContent>
      </Card>

      {/* Atendimentos - Peach */}
      <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(255, 176, 136, 0.15) 0%, rgba(255, 176, 136, 0.25) 100%)' }}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: '#C97A4A' }}>Atendimentos</div>
            <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${BRAND.peach}40` }}>
              <Calendar className="h-4 w-4" style={{ color: '#C97A4A' }} />
            </div>
          </div>
          <div className="text-2xl font-bold mt-2" style={{ color: '#A05C32' }}>{appointmentsCount}</div>
          <p className="text-xs mt-1" style={{ color: '#C97A4A80' }}>no período selecionado</p>
        </CardContent>
      </Card>

      {/* Ticket Medio - Mint */}
      <Card className="border-0 shadow-sm rounded-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(0, 217, 163, 0.1) 0%, rgba(0, 217, 163, 0.18) 100%)' }}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: '#00A87D' }}>Ticket Médio</div>
            <div className="h-8 w-8 rounded-full flex items-center justify-center" style={{ backgroundColor: `${BRAND.mint}25` }}>
              <Users className="h-4 w-4" style={{ color: BRAND.mint }} />
            </div>
          </div>
          <div className="text-2xl font-bold mt-2" style={{ color: '#008F6A' }}>{formatCurrency(averageTicket)}</div>
          <p className="text-xs mt-1" style={{ color: '#00A87D80' }}>por atendimento</p>
        </CardContent>
      </Card>
    </div>
  )
}
