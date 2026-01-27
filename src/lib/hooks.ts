'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type {
  Professional,
  Procedure,
  PaymentMethod,
  CardFeeRule,
  CardFeeTier,
  CardFeeTierRate,
  CurrentFeeTierInfo,
  Source,
  SystemSetting,
  Appointment,
  Patient,
  SplitRule,
  BonusRule,
  UserProfile,
  Expense,
} from '@/types'

// Generic hook for fetching data
function useSupabaseQuery<T>(
  tableName: string,
  options?: {
    filter?: { column: string; value: string | boolean }
    order?: { column: string; ascending?: boolean }
    select?: string
  }
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Memoize the supabase client to avoid creating a new one on every render
  const supabase = useMemo(() => createClient(), [])

  // Stringify options for stable dependency
  const optionsKey = JSON.stringify(options || {})

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase.from(tableName).select(options?.select || '*')

      if (options?.filter) {
        query = query.eq(options.filter.column, options.filter.value)
      }

      if (options?.order) {
        query = query.order(options.order.column, {
          ascending: options.order.ascending ?? true,
        })
      }

      const { data: result, error: err } = await query

      if (err) {
        console.error(`[useSupabaseQuery] Error fetching ${tableName}:`, err)
        throw err
      }

      setData(result as T[])
    } catch (e) {
      console.error(`[useSupabaseQuery] Exception in ${tableName}:`, e)
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, tableName, optionsKey])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}

// Specific hooks for each table
export function useProfessionals() {
  return useSupabaseQuery<Professional>('professionals', {
    filter: { column: 'is_active', value: true },
    order: { column: 'name' },
  })
}

export function useProcedures() {
  return useSupabaseQuery<Procedure>('procedures', {
    filter: { column: 'is_active', value: true },
    order: { column: 'name' },
  })
}

export function usePaymentMethods() {
  return useSupabaseQuery<PaymentMethod>('payment_methods', {
    filter: { column: 'is_active', value: true },
    order: { column: 'display_order' },
  })
}

export function useCardFeeRules() {
  return useSupabaseQuery<CardFeeRule>('card_fee_rules')
}

export function useSources() {
  return useSupabaseQuery<Source>('sources', {
    filter: { column: 'is_active', value: true },
    order: { column: 'name' },
  })
}

export function useSystemSettings() {
  return useSupabaseQuery<SystemSetting>('system_settings')
}

export function useSplitRules() {
  const [data, setData] = useState<SplitRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const { data: result, error: err } = await supabase
        .from('split_rules')
        .select(`
          *,
          procedure:procedures(*),
          professional:professionals(*)
        `)
        .order('priority', { ascending: false })

      if (err) throw err
      setData(result as SplitRule[])
    } catch (e) {
      console.error('[useSplitRules] Error:', e)
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}

export function useBonusRules() {
  const [data, setData] = useState<BonusRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const { data: result, error: err } = await supabase
        .from('bonus_rules')
        .select(`
          *,
          procedure:procedures(*),
          professional:professionals(*)
        `)
        .order('name')

      if (err) throw err
      setData(result as BonusRule[])
    } catch (e) {
      console.error('[useBonusRules] Error:', e)
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}

export function usePatients(searchTerm?: string) {
  const [data, setData] = useState<Patient[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) {
      setData([])
      return
    }

    const fetchPatients = async () => {
      setLoading(true)
      const { data: result, error } = await supabase
        .from('patients')
        .select('*')
        .ilike('name', `%${searchTerm}%`)
        .order('name')
        .limit(10)

      if (!error && result) {
        setData(result)
      }
      setLoading(false)
    }

    const debounce = setTimeout(fetchPatients, 300)
    return () => clearTimeout(debounce)
  }, [searchTerm, supabase])

  return { data, loading }
}

// Hook para buscar sugestoes de nomes de pacientes/pagamentos dos appointments existentes
export function usePatientNameSuggestions(searchTerm?: string) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) {
      setSuggestions([])
      return
    }

    const fetchSuggestions = async () => {
      setLoading(true)
      try {
        // Busca nomes distintos que contenham o termo de busca
        const { data: result, error } = await supabase
          .from('appointments')
          .select('patient_name')
          .ilike('patient_name', `%${searchTerm}%`)
          .order('patient_name')
          .limit(50)

        if (!error && result) {
          // Remove duplicatas e filtra nulos
          const uniqueNames = [...new Set(
            result
              .map(r => r.patient_name)
              .filter((name): name is string => !!name)
          )].slice(0, 10)
          setSuggestions(uniqueNames)
        }
      } catch (e) {
        console.error('[usePatientNameSuggestions] Error:', e)
      } finally {
        setLoading(false)
      }
    }

    const debounce = setTimeout(fetchSuggestions, 300)
    return () => clearTimeout(debounce)
  }, [searchTerm, supabase])

  return { suggestions, loading }
}

// Get a single system setting value
export function useSystemSetting(key: string) {
  const { data, loading } = useSystemSettings()
  const setting = data.find((s) => s.key === key)
  return { value: setting?.value, loading }
}

// Hook for appointments with filters
export function useAppointments(filters?: {
  startDate?: string
  endDate?: string
  professional_id?: string
  procedure_id?: string
  patient_name?: string
  is_hospital?: boolean
}) {
  const [data, setData] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const supabase = createClient()

  // Stringify filters to use as dependency
  const filtersKey = JSON.stringify(filters || {})

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('appointments')
        .select(`
          *,
          professional:professionals(*),
          procedure:procedures(*),
          payment_method:payment_methods(*)
        `)
        .order('date', { ascending: false })

      if (filters?.startDate) {
        query = query.gte('date', filters.startDate)
      }
      if (filters?.endDate) {
        query = query.lte('date', filters.endDate)
      }
      if (filters?.professional_id) {
        query = query.eq('professional_id', filters.professional_id)
      }
      if (filters?.procedure_id) {
        query = query.eq('procedure_id', filters.procedure_id)
      }
      if (filters?.patient_name) {
        query = query.ilike('patient_name', `%${filters.patient_name}%`)
      }
      if (filters?.is_hospital !== undefined) {
        query = query.eq('is_hospital', filters.is_hospital)
      }

      const { data: result, error: err } = await query

      if (err) throw err
      setData(result as Appointment[])
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}

// Hook for user profile and permissions
export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError) throw authError
      if (!user) {
        setProfile(null)
        return
      }

      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError) {
        // If profile doesn't exist, user might not be set up yet
        if (profileError.code === 'PGRST116') {
          console.warn('[useUserProfile] Profile not found for user:', user.id)
          setProfile(null)
        } else {
          throw profileError
        }
      } else {
        setProfile(profileData as UserProfile)
      }
    } catch (e) {
      console.error('[useUserProfile] Error:', e)
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    refetch()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refetch()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [refetch, supabase.auth])

  return {
    profile,
    loading,
    error,
    refetch,
    isAdmin: profile?.role === 'admin',
    isSecretary: profile?.role === 'secretary',
    isAuthenticated: !!profile,
  }
}

// Hook for fee tiers (faixas de taxa por faturamento)
export function useCardFeeTiers() {
  return useSupabaseQuery<CardFeeTier>('card_fee_tiers', {
    filter: { column: 'is_active', value: true },
    order: { column: 'priority', ascending: false },
  })
}

// Hook for fee tier rates
export function useCardFeeTierRates(tierId?: string) {
  const [data, setData] = useState<CardFeeTierRate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('card_fee_tier_rates')
        .select(`
          *,
          tier:card_fee_tiers(*),
          payment_method:payment_methods(*)
        `)

      if (tierId) {
        query = query.eq('tier_id', tierId)
      }

      const { data: result, error: err } = await query

      if (err) throw err
      setData(result as CardFeeTierRate[])
    } catch (e) {
      console.error('[useCardFeeTierRates] Error:', e)
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [supabase, tierId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}

// Hook for current fee tier info (based on previous month revenue)
export function useCurrentFeeTier() {
  const [data, setData] = useState<CurrentFeeTierInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      const { data: result, error: err } = await supabase
        .from('current_fee_tier_info')
        .select('*')
        .single()

      if (err) {
        // View might not exist yet or return empty
        if (err.code === 'PGRST116') {
          console.warn('[useCurrentFeeTier] No tier info found')
          setData(null)
        } else {
          throw err
        }
      } else {
        setData(result as CurrentFeeTierInfo)
      }
    } catch (e) {
      console.error('[useCurrentFeeTier] Error:', e)
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}

// Hook to get card fee rules from current tier (automatic based on previous month revenue)
export function useCurrentTierCardFeeRules() {
  const { data: currentTier, loading: tierLoading } = useCurrentFeeTier()
  const { data: allTierRates, loading: ratesLoading } = useCardFeeTierRates()
  const { data: oldRules, loading: oldRulesLoading } = useCardFeeRules()

  // Filter rates for current tier and convert to CardFeeRule format
  const data = useMemo(() => {
    if (!currentTier || allTierRates.length === 0) {
      // Fallback to old rules if tier system not available
      return oldRules
    }

    const tierRates = allTierRates.filter(rate => rate.tier_id === currentTier.id)

    // Convert to CardFeeRule format for compatibility
    return tierRates.map(rate => ({
      id: rate.id,
      payment_method_id: rate.payment_method_id,
      min_value: 0,
      max_value: null,
      fee_percentage: rate.fee_percentage,
      created_at: rate.created_at,
      updated_at: rate.created_at,
    } as CardFeeRule))
  }, [currentTier, allTierRates, oldRules])

  return {
    data,
    loading: tierLoading || ratesLoading || oldRulesLoading,
    currentTier,
  }
}

// Hook para despesas
export function useExpenses(activeOnly = true) {
  const [data, setData] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('expenses')
        .select('*')
        .order('name', { ascending: true })

      if (activeOnly) {
        query = query.eq('is_active', true)
      }

      const { data: expenses, error: fetchError } = await query

      if (fetchError) throw fetchError

      // Parse responsibility JSONB
      const parsedExpenses = (expenses || []).map((expense) => ({
        ...expense,
        responsibility: typeof expense.responsibility === 'string'
          ? JSON.parse(expense.responsibility)
          : expense.responsibility,
      })) as Expense[]

      setData(parsedExpenses)
      setError(null)
    } catch (err) {
      console.error('Error fetching expenses:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [supabase, activeOnly])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { data, loading, error, refetch }
}
