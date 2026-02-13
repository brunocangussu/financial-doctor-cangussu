'use client'

import { useState, useCallback } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  Area,
  AreaChart,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/calculations'
import { cn } from '@/lib/utils'

// Brand Colors from Financial Doctor Style Guide
const BRAND_COLORS = {
  magenta: '#CE30F9',    // Primary
  purple: '#56138A',     // Secondary
  navy: '#20203F',       // Dark
  blue: '#4A90E2',       // Info
  mint: '#00D9A3',       // Success
  peach: '#FFB088',      // Warning
}

const COLORS = [
  BRAND_COLORS.magenta,
  BRAND_COLORS.purple,
  BRAND_COLORS.blue,
  BRAND_COLORS.mint,
  BRAND_COLORS.peach,
]

const GRADIENT_COLORS = {
  bruno: { start: BRAND_COLORS.blue, end: BRAND_COLORS.purple },
  valquiria: { start: BRAND_COLORS.magenta, end: BRAND_COLORS.purple },
  gross: { start: BRAND_COLORS.magenta, end: BRAND_COLORS.purple },
  net: { start: BRAND_COLORS.mint, end: BRAND_COLORS.blue },
}

interface ChartDataItem {
  name: string
  value: number
  count?: number
}

interface MonthlyTrendData {
  month: string
  gross: number
  net: number
  bruno?: number
  otherProfessional?: number
  vanessaBonus?: number
}

interface RevenueBySourceChartProps {
  data: ChartDataItem[]
}

interface RevenueByProcedureChartProps {
  data: ChartDataItem[]
}

interface MonthlyTrendChartProps {
  data: MonthlyTrendData[]
  brunoName?: string
  otherProfessionalName?: string
}

interface RevenueByProfessionalChartProps {
  data: ChartDataItem[]
  ownerName?: string
}

export function RevenueBySourceChart({ data }: RevenueBySourceChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Faturamento por Origem</CardTitle>
          <CardDescription>ROI por canal de marketing</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Nenhum dado disponível
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Faturamento por Origem</CardTitle>
        <CardDescription>ROI por canal de marketing</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) =>
                  `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                }
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [formatCurrency(Number(value) || 0), 'Valor']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export function RevenueByProcedureChart({ data }: RevenueByProcedureChartProps) {
  if (data.length === 0) {
    return (
      <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800 rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-slate-700 dark:text-slate-200">Faturamento por Procedimento</CardTitle>
          <CardDescription className="text-slate-500">Distribuição de receita por tipo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-slate-400">
            Nenhum dado disponível
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800 rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-slate-700 dark:text-slate-200">Faturamento por Procedimento</CardTitle>
        <CardDescription className="text-slate-500">Distribuição de receita por tipo</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" barCategoryGap="15%">
              <defs>
                <linearGradient id="procedureGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={BRAND_COLORS.magenta} stopOpacity={1}/>
                  <stop offset="100%" stopColor={BRAND_COLORS.purple} stopOpacity={0.8}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" tickFormatter={(value) => formatCurrency(value)} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={90} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <Tooltip
                formatter={(value) => [formatCurrency(Number(value) || 0), 'Valor']}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
              <Bar dataKey="value" fill="url(#procedureGradient)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

// Custom Tooltip that shows only hovered line
interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    dataKey: string
    name: string
    value: number
    color: string
  }>
  label?: string
  hoveredLine: string | null
}

function CustomTooltip({ active, payload, label, hoveredLine }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  // Filter to show only the hovered line, or all if none is hovered
  const filteredPayload = hoveredLine
    ? payload.filter(p => p.dataKey === hoveredLine)
    : payload

  if (filteredPayload.length === 0) return null

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-3 min-w-[150px]">
      <p className="font-medium text-slate-700 dark:text-slate-200 mb-2">{label}</p>
      {filteredPayload.map((entry, index) => (
        <div key={index} className="flex items-center justify-between gap-4 text-sm">
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="font-medium" style={{ color: entry.color }}>
            {formatCurrency(entry.value || 0)}
          </span>
        </div>
      ))}
    </div>
  )
}

// Toggle button component for legend
interface LegendToggleProps {
  label: string
  color: string
  active: boolean
  onClick: () => void
  dashed?: boolean
}

function LegendToggle({ label, color, active, onClick, dashed }: LegendToggleProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
        active
          ? "bg-slate-100 dark:bg-slate-700"
          : "bg-slate-50 dark:bg-slate-800 opacity-50"
      )}
    >
      <span
        className={cn("w-4 h-0.5", dashed && "border-t-2 border-dashed")}
        style={{
          backgroundColor: dashed ? 'transparent' : color,
          borderColor: dashed ? color : 'transparent'
        }}
      />
      <span style={{ color: active ? color : '#94a3b8' }}>{label}</span>
    </button>
  )
}

export function MonthlyTrendChart({ data, brunoName = 'Bruno', otherProfessionalName = 'Profissional' }: MonthlyTrendChartProps) {
  // State for visible lines
  const [visibleLines, setVisibleLines] = useState({
    gross: true,
    net: true,
    bruno: true,
    otherProfessional: true,
    vanessaBonus: true,
  })

  // State for hovered line
  const [hoveredLine, setHoveredLine] = useState<string | null>(null)

  // Toggle line visibility
  const toggleLine = useCallback((key: keyof typeof visibleLines) => {
    setVisibleLines(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // Line configurations
  const lineConfigs = [
    { key: 'gross', name: 'Bruto', color: BRAND_COLORS.navy, sector: 'faturamento' },
    { key: 'net', name: 'Líquido', color: BRAND_COLORS.magenta, sector: 'faturamento' },
    { key: 'bruno', name: brunoName, color: BRAND_COLORS.blue, sector: 'profissional' },
    { key: 'otherProfessional', name: otherProfessionalName, color: BRAND_COLORS.purple, sector: 'profissional' },
    { key: 'vanessaBonus', name: 'Bônus Vanessa', color: BRAND_COLORS.mint, sector: 'bonus', dashed: true },
  ]

  // Verificar se todos os valores são zero
  const hasData = data.some(d => d.gross > 0 || d.net > 0)

  if (data.length === 0 || !hasData) {
    return (
      <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800 rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-slate-700 dark:text-slate-200">Evolução do Período</CardTitle>
          <CardDescription className="text-slate-500">Comparativo de valores (últimos 6 meses)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] flex items-center justify-center text-slate-400">
            Nenhum dado disponível para os últimos 6 meses
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800 rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-slate-700 dark:text-slate-200">Evolução do Período</CardTitle>
        <CardDescription className="text-slate-500">Comparativo de valores (últimos 6 meses) - Clique nas legendas para mostrar/ocultar</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Legend Controls by Sector */}
        <div className="flex flex-wrap gap-4 mb-4">
          {/* Faturamento Sector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Faturamento:</span>
            {lineConfigs.filter(l => l.sector === 'faturamento').map(config => (
              <LegendToggle
                key={config.key}
                label={config.name}
                color={config.color}
                active={visibleLines[config.key as keyof typeof visibleLines]}
                onClick={() => toggleLine(config.key as keyof typeof visibleLines)}
              />
            ))}
          </div>

          {/* Profissional Sector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Profissional:</span>
            {lineConfigs.filter(l => l.sector === 'profissional').map(config => (
              <LegendToggle
                key={config.key}
                label={config.name}
                color={config.color}
                active={visibleLines[config.key as keyof typeof visibleLines]}
                onClick={() => toggleLine(config.key as keyof typeof visibleLines)}
              />
            ))}
          </div>

          {/* Bonus Sector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Bônus:</span>
            {lineConfigs.filter(l => l.sector === 'bonus').map(config => (
              <LegendToggle
                key={config.key}
                label={config.name}
                color={config.color}
                active={visibleLines[config.key as keyof typeof visibleLines]}
                onClick={() => toggleLine(config.key as keyof typeof visibleLines)}
                dashed={config.dashed}
              />
            ))}
          </div>
        </div>

        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis tickFormatter={(value) => formatCurrency(value)} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={90} />
              <Tooltip
                content={<CustomTooltip hoveredLine={hoveredLine} />}
              />

              {/* Bruto */}
              {visibleLines.gross && (
                <Line
                  type="monotone"
                  dataKey="gross"
                  name="Bruto"
                  stroke={BRAND_COLORS.navy}
                  strokeWidth={hoveredLine === 'gross' ? 3 : hoveredLine ? 1 : 2}
                  strokeOpacity={hoveredLine && hoveredLine !== 'gross' ? 0.3 : 1}
                  dot={{ r: hoveredLine === 'gross' ? 6 : 4, fill: BRAND_COLORS.navy, strokeWidth: 0 }}
                  activeDot={{
                    r: 8,
                    fill: BRAND_COLORS.navy,
                    onMouseEnter: () => setHoveredLine('gross'),
                    onMouseLeave: () => setHoveredLine(null),
                  }}
                  onMouseEnter={() => setHoveredLine('gross')}
                  onMouseLeave={() => setHoveredLine(null)}
                />
              )}

              {/* Líquido */}
              {visibleLines.net && (
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Líquido"
                  stroke={BRAND_COLORS.magenta}
                  strokeWidth={hoveredLine === 'net' ? 3 : hoveredLine ? 1 : 2}
                  strokeOpacity={hoveredLine && hoveredLine !== 'net' ? 0.3 : 1}
                  dot={{ r: hoveredLine === 'net' ? 6 : 4, fill: BRAND_COLORS.magenta, strokeWidth: 0 }}
                  activeDot={{
                    r: 8,
                    fill: BRAND_COLORS.magenta,
                    onMouseEnter: () => setHoveredLine('net'),
                    onMouseLeave: () => setHoveredLine(null),
                  }}
                  onMouseEnter={() => setHoveredLine('net')}
                  onMouseLeave={() => setHoveredLine(null)}
                />
              )}

              {/* Bruno */}
              {visibleLines.bruno && (
                <Line
                  type="monotone"
                  dataKey="bruno"
                  name={brunoName}
                  stroke={BRAND_COLORS.blue}
                  strokeWidth={hoveredLine === 'bruno' ? 3 : hoveredLine ? 1 : 2}
                  strokeOpacity={hoveredLine && hoveredLine !== 'bruno' ? 0.3 : 1}
                  dot={{ r: hoveredLine === 'bruno' ? 6 : 4, fill: BRAND_COLORS.blue, strokeWidth: 0 }}
                  activeDot={{
                    r: 8,
                    fill: BRAND_COLORS.blue,
                    onMouseEnter: () => setHoveredLine('bruno'),
                    onMouseLeave: () => setHoveredLine(null),
                  }}
                  onMouseEnter={() => setHoveredLine('bruno')}
                  onMouseLeave={() => setHoveredLine(null)}
                />
              )}

              {/* Other Professional */}
              {visibleLines.otherProfessional && (
                <Line
                  type="monotone"
                  dataKey="otherProfessional"
                  name={otherProfessionalName}
                  stroke={BRAND_COLORS.purple}
                  strokeWidth={hoveredLine === 'otherProfessional' ? 3 : hoveredLine ? 1 : 2}
                  strokeOpacity={hoveredLine && hoveredLine !== 'otherProfessional' ? 0.3 : 1}
                  dot={{ r: hoveredLine === 'otherProfessional' ? 6 : 4, fill: BRAND_COLORS.purple, strokeWidth: 0 }}
                  activeDot={{
                    r: 8,
                    fill: BRAND_COLORS.purple,
                    onMouseEnter: () => setHoveredLine('otherProfessional'),
                    onMouseLeave: () => setHoveredLine(null),
                  }}
                  onMouseEnter={() => setHoveredLine('otherProfessional')}
                  onMouseLeave={() => setHoveredLine(null)}
                />
              )}

              {/* Vanessa Bonus */}
              {visibleLines.vanessaBonus && (
                <Line
                  type="monotone"
                  dataKey="vanessaBonus"
                  name="Bônus Vanessa"
                  stroke={BRAND_COLORS.mint}
                  strokeWidth={hoveredLine === 'vanessaBonus' ? 3 : hoveredLine ? 1 : 2}
                  strokeOpacity={hoveredLine && hoveredLine !== 'vanessaBonus' ? 0.3 : 1}
                  strokeDasharray="5 5"
                  dot={{ r: hoveredLine === 'vanessaBonus' ? 6 : 4, fill: BRAND_COLORS.mint, strokeWidth: 0 }}
                  activeDot={{
                    r: 8,
                    fill: BRAND_COLORS.mint,
                    onMouseEnter: () => setHoveredLine('vanessaBonus'),
                    onMouseLeave: () => setHoveredLine(null),
                  }}
                  onMouseEnter={() => setHoveredLine('vanessaBonus')}
                  onMouseLeave={() => setHoveredLine(null)}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export function RevenueByProfessionalChart({ data, ownerName = 'Bruno' }: RevenueByProfessionalChartProps) {
  if (data.length === 0) {
    return (
      <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800 rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-slate-700 dark:text-slate-200">Valor por Profissional</CardTitle>
          <CardDescription className="text-slate-500">Distribuição do valor líquido</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-slate-400">
            Nenhum dado disponível
          </div>
        </CardContent>
      </Card>
    )
  }

  // Add colors to data
  const coloredData = data.map((item, index) => ({
    ...item,
    fill: item.name === ownerName ? BRAND_COLORS.blue : BRAND_COLORS.magenta,
  }))

  return (
    <Card className="border-0 shadow-sm bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800 rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-slate-700 dark:text-slate-200">Valor por Profissional</CardTitle>
        <CardDescription className="text-slate-500">Distribuição do valor líquido</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={coloredData} barCategoryGap="20%">
              <defs>
                <linearGradient id="brunoGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND_COLORS.blue} stopOpacity={1}/>
                  <stop offset="100%" stopColor={BRAND_COLORS.purple} stopOpacity={0.8}/>
                </linearGradient>
                <linearGradient id="valquiriaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND_COLORS.magenta} stopOpacity={1}/>
                  <stop offset="100%" stopColor={BRAND_COLORS.purple} stopOpacity={0.8}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis tickFormatter={(value) => formatCurrency(value)} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} width={80} />
              <Tooltip
                formatter={(value) => [formatCurrency(Number(value) || 0), 'Valor']}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {coloredData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.name === ownerName ? 'url(#brunoGradient)' : 'url(#valquiriaGradient)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
