import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface HouseholdCaptureRule {
  id?: string
  pattern_type: 'domain' | 'sender' | 'subject'
  pattern_value: string
  rule_directive: string
  origin?: 'user_label' | 'manual_teach' | 'learned_feedback' | 'user_untrain'
  confidence?: number
  active?: boolean
  last_matched_at?: string | null
  created_at?: string
  updated_at?: string
}

export function useHouseholdCaptureRules() {
  const qc = useQueryClient()

  const { data: rules = [], isLoading } = useQuery<HouseholdCaptureRule[]>({
    queryKey: ['household-capture-rules'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('household_capture_rules')
          .select('*')
          .order('created_at', { ascending: false })
        if (!error && Array.isArray(data)) return data
      } catch {}

      try {
        const { data: setting } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'household_capture_rules')
          .maybeSingle()
        if (setting?.value && Array.isArray(setting.value)) return setting.value
      } catch {}
      return []
    },
    staleTime: 60_000,
  })

  const saveRule = useMutation({
    mutationFn: async (rule: HouseholdCaptureRule) => {
      const normVal = rule.pattern_value.toLowerCase().trim()
      try {
        const { error } = await supabase
          .from('household_capture_rules')
          .upsert({
            pattern_type: rule.pattern_type,
            pattern_value: normVal,
            rule_directive: rule.rule_directive,
            origin: rule.origin ?? 'manual_teach',
            confidence: rule.confidence ?? 1.0,
            active: rule.active ?? true,
            last_matched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'pattern_type,pattern_value' })
        if (!error) return
      } catch {}

      // Fallback to settings table
      const { data: setting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'household_capture_rules')
        .maybeSingle()
      const current: HouseholdCaptureRule[] = Array.isArray(setting?.value) ? setting.value : []
      const idx = current.findIndex(r => r.pattern_type === rule.pattern_type && r.pattern_value.toLowerCase() === normVal)
      if (idx >= 0) {
        current[idx] = { ...current[idx], ...rule, updated_at: new Date().toISOString() }
      } else {
        current.unshift({ ...rule, id: crypto.randomUUID(), updated_at: new Date().toISOString(), created_at: new Date().toISOString() })
      }
      await supabase.from('settings').upsert({ key: 'household_capture_rules', value: current })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['household-capture-rules'] })
    },
  })

  const removeRule = useMutation({
    mutationFn: async ({ pattern_type, pattern_value }: { pattern_type: 'domain' | 'sender' | 'subject'; pattern_value: string }) => {
      const normVal = pattern_value.toLowerCase().trim()
      try {
        await supabase
          .from('household_capture_rules')
          .delete()
          .eq('pattern_type', pattern_type)
          .eq('pattern_value', normVal)
      } catch {}

      try {
        const { data: setting } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'household_capture_rules')
          .maybeSingle()
        if (setting?.value && Array.isArray(setting.value)) {
          const filtered = setting.value.filter(
            (r: HouseholdCaptureRule) => !(r.pattern_type === pattern_type && r.pattern_value.toLowerCase() === normVal)
          )
          await supabase.from('settings').upsert({ key: 'household_capture_rules', value: filtered })
        }
      } catch {}
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['household-capture-rules'] })
    },
  })

  return {
    rules,
    isLoading,
    saveRule: saveRule.mutateAsync,
    removeRule: removeRule.mutateAsync,
    isSaving: saveRule.isPending || removeRule.isPending,
  }
}
