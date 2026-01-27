'use client'

import * as React from 'react'
import { format, parse, isValid, setMonth, setYear } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Marco',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

interface DatePickerInputProps {
  value?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  yearRange?: { start: number; end: number }
}

export function DatePickerInput({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa',
  disabled = false,
  className,
  yearRange,
}: DatePickerInputProps) {
  const [inputValue, setInputValue] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [calendarMonth, setCalendarMonth] = React.useState<Date>(value || new Date())

  // Calculate year range
  const currentYear = new Date().getFullYear()
  const startYear = yearRange?.start || currentYear - 10
  const endYear = yearRange?.end || currentYear + 5
  const years = React.useMemo(() => {
    const arr = []
    for (let y = endYear; y >= startYear; y--) {
      arr.push(y)
    }
    return arr
  }, [startYear, endYear])

  // Sync input value with prop value
  React.useEffect(() => {
    if (value && isValid(value)) {
      setInputValue(format(value, 'dd/MM/yyyy'))
      setCalendarMonth(value)
    } else if (!value) {
      setInputValue('')
    }
  }, [value])

  // Format input as user types (dd/mm/yyyy)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, '')

    // Auto-insert slashes
    if (val.length >= 2) {
      val = val.slice(0, 2) + '/' + val.slice(2)
    }
    if (val.length >= 5) {
      val = val.slice(0, 5) + '/' + val.slice(5)
    }

    // Limit to dd/mm/yyyy format
    val = val.slice(0, 10)

    setInputValue(val)

    // Try to parse complete date
    if (val.length === 10) {
      const parsed = parse(val, 'dd/MM/yyyy', new Date())
      if (isValid(parsed)) {
        onChange?.(parsed)
        setCalendarMonth(parsed)
      }
    }
  }

  // Handle blur to validate and format
  const handleBlur = () => {
    if (inputValue.length === 10) {
      const parsed = parse(inputValue, 'dd/MM/yyyy', new Date())
      if (isValid(parsed)) {
        onChange?.(parsed)
        setCalendarMonth(parsed)
      } else {
        // Reset to previous valid value or clear
        if (value && isValid(value)) {
          setInputValue(format(value, 'dd/MM/yyyy'))
        } else {
          setInputValue('')
        }
      }
    } else if (inputValue.length > 0 && inputValue.length < 10) {
      // Incomplete date, reset
      if (value && isValid(value)) {
        setInputValue(format(value, 'dd/MM/yyyy'))
      } else {
        setInputValue('')
      }
    }
  }

  // Handle calendar selection
  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      onChange?.(date)
      setInputValue(format(date, 'dd/MM/yyyy'))
      setCalendarMonth(date)
    }
    setOpen(false)
  }

  // Handle month dropdown change
  const handleMonthChange = (monthStr: string) => {
    const newMonth = parseInt(monthStr, 10)
    const newDate = setMonth(calendarMonth, newMonth)
    setCalendarMonth(newDate)
  }

  // Handle year dropdown change
  const handleYearChange = (yearStr: string) => {
    const newYear = parseInt(yearStr, 10)
    const newDate = setYear(calendarMonth, newYear)
    setCalendarMonth(newDate)
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <Input
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className="w-[130px]"
        maxLength={10}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            disabled={disabled}
            className={cn(
              'shrink-0',
              !value && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-3 border-b flex items-center gap-2">
            <Select
              value={calendarMonth.getMonth().toString()}
              onValueChange={handleMonthChange}
            >
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS_PT.map((month, index) => (
                  <SelectItem key={index} value={index.toString()}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={calendarMonth.getFullYear().toString()}
              onValueChange={handleYearChange}
            >
              <SelectTrigger className="h-8 w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleCalendarSelect}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            locale={ptBR}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
