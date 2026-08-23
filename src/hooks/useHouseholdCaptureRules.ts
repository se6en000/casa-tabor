import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type CaptureRulePatternType = 'domain' | 'sender' | 'subject' | 'phrase'
export type CaptureRuleOrigin =
  | 'voice_directive'
  | 'fast_dismissal'
  | 'user_untrain'
  | 'manual_teach'
  | 'user_label'
  | 'learned_feedback'
export type CaptureRuleArchetype =
  | 'logistics_parcels'
  | 'executive_actions'
  | 'temporal_appointments'
  | 'lifecycle_updates'
  | 'estate_knowledge'
  | 'promotional_noise'

export interface HouseholdCaptureRule {
  id?: string
  pattern_type: CaptureRulePatternType
  pattern_value: string
  rule_directive: string
  origin?: CaptureRuleOrigin
  confidence?: number
  active?: boolean
  default_archetype?: CaptureRuleArchetype | string | null
  category_routing?: Record<string, string>
  voice_transcript?: string | null
  feedback_count?: number
  last_matched_at?: string | null
  created_at?: string
  updated_at?: string
}

export function useHouseholdCaptureRules() {
  const qc = useQueryClient()

  // 1. Realtime query with stale-while-revalidate
  const { data: rules = [], isLoading } = useQuery<HouseholdCaptureRule[]>({
    queryKey: ['household-capture-rules'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('household_capture_rules')
          .select('*')
          .order('created_at', { ascending: false })
        if (!error && Array.isArray(data)) return data as HouseholdCaptureRule[]
      } catch {
        // Fallback to settings table query below
      }

      try {
        const { data: setting } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'household_capture_rules')
          .maybeSingle()
        if (setting?.value && Array.isArray(setting.value)) return setting.value as HouseholdCaptureRule[]
      } catch {
        // Fallback to empty rules array
      }
      return []
    },
    staleTime: 60_000,
  })

  // 2. Realtime Postgres Changes Subscription
  useEffect(() => {
    const channel = supabase
      .channel('realtime:household_capture_rules')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'household_capture_rules' },
        () => {
          qc.invalidateQueries({ queryKey: ['household-capture-rules'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [qc])

  // 3. Upsert Rule Mutation
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
            default_archetype: rule.default_archetype ?? null,
            category_routing: rule.category_routing ?? {},
            voice_transcript: rule.voice_transcript ?? null,
            feedback_count: rule.feedback_count ?? 1,
            last_matched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'pattern_type,pattern_value' })
        if (!error) return
      } catch {
        // Fallback to settings table persistence
      }

      // Fallback to settings table
      const { data: setting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'household_capture_rules')
        .maybeSingle()
      const current: HouseholdCaptureRule[] = Array.isArray(setting?.value) ? setting.value : []
      const idx = current.findIndex(
        (r) => r.pattern_type === rule.pattern_type && r.pattern_value.toLowerCase() === normVal
      )
      if (idx >= 0) {
        current[idx] = {
          ...current[idx],
          ...rule,
          feedback_count: (current[idx].feedback_count ?? 1) + 1,
          updated_at: new Date().toISOString(),
        }
      } else {
        current.unshift({
          ...rule,
          id: crypto.randomUUID(),
          feedback_count: 1,
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })
      }
      await supabase.from('settings').upsert({ key: 'household_capture_rules', value: current })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['household-capture-rules'] })
    },
  })

  // 4. Fast Dismissal Helper
  const fastDismiss = useMutation({
    mutationFn: async (item: { domain?: string; sender?: string; subject?: string }) => {
      const patternValue = item.domain || item.sender || item.subject || ''
      if (!patternValue) return
      const patternType: CaptureRulePatternType = item.domain ? 'domain' : item.sender ? 'sender' : 'phrase'

      await saveRule.mutateAsync({
        pattern_type: patternType,
        pattern_value: patternValue,
        rule_directive: 'suppress',
        default_archetype: 'promotional_noise',
        origin: 'fast_dismissal',
        confidence: 0.95,
        active: true,
      })
    },
  })

  // 5. Untrain / Remove Rule Mutation
  const untrainRule = useMutation({
    mutationFn: async (target: { pattern_type: CaptureRulePatternType; pattern_value: string }) => {
      const normVal = target.pattern_value.toLowerCase().trim()
      try {
        await supabase
          .from('household_capture_rules')
          .delete()
          .eq('pattern_type', target.pattern_type)
          .eq('pattern_value', normVal)
      } catch {
        // Fallback to settings table cleanup
      }

      try {
        const { data: setting } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'household_capture_rules')
          .maybeSingle()
        if (setting?.value && Array.isArray(setting.value)) {
          const filtered = setting.value.filter(
            (r: HouseholdCaptureRule) =>
              !(r.pattern_type === target.pattern_type && r.pattern_value.toLowerCase() === normVal)
          )
          await supabase.from('settings').upsert({ key: 'household_capture_rules', value: filtered })
        }
      } catch {
        // Ignore settings fallback errors
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['household-capture-rules'] })
    },
  })

  // 6. Category Routing Adjustment Helper
  const adjustCategoryRouting = useMutation({
    mutationFn: async ({
      pattern_type,
      pattern_value,
      default_archetype,
      category_routing = {},
    }: {
      pattern_type: CaptureRulePatternType
      pattern_value: string
      default_archetype: CaptureRuleArchetype
      category_routing?: Record<string, string>
    }) => {
      await saveRule.mutateAsync({
        pattern_type,
        pattern_value,
        rule_directive: 'route_archetype',
        default_archetype,
        category_routing,
        origin: 'manual_teach',
        confidence: 1.0,
        active: true,
      })
    },
  })

  // 7. Record Voice Directive Helper
  const recordVoiceDirective = useMutation({
    mutationFn: async ({
      transcript,
      rule,
    }: {
      transcript: string
      rule: HouseholdCaptureRule
    }) => {
      await saveRule.mutateAsync({
        ...rule,
        voice_transcript: transcript,
        origin: rule.origin || 'voice_directive',
      })
    },
  })

  // 8. Client Matching Helper
  const matchRule = (from: string, subject: string, body?: string) => {
    const fromLower = (from || '').toLowerCase()
    const subjLower = (subject || '').toLowerCase()
    const bodyLower = (body || '').toLowerCase()

    const matches: { rule: HouseholdCaptureRule; precedence: number }[] = []

    for (const r of rules) {
      if (r.active === false) continue
      const val = (r.pattern_value ?? '').toLowerCase().trim()
      if (!val) continue

      let matched = false
      let precedence = 0

      if (r.pattern_type === 'sender') {
        if (fromLower.includes(val)) {
          matched = true
          precedence = 4
        }
      } else if (r.pattern_type === 'domain') {
        if (fromLower.includes(`@${val}`) || fromLower.includes(val)) {
          matched = true
          precedence = 3
        }
      } else if (r.pattern_type === 'subject') {
        if (subjLower.includes(val)) {
          matched = true
          precedence = 2
        }
      } else if (r.pattern_type === 'phrase') {
        if (subjLower.includes(val) || (bodyLower && bodyLower.includes(val))) {
          matched = true
          precedence = 1
        }
      }

      if (matched) {
        matches.push({ rule: r, precedence })
      }
    }

    return matches
      .sort((a, b) => {
        if (b.precedence !== a.precedence) return b.precedence - a.precedence
        return (b.rule.confidence ?? 1.0) - (a.rule.confidence ?? 1.0)
      })
      .map((m) => m.rule)
  }

  return {
    rules,
    isLoading,
    saveRule: saveRule.mutateAsync,
    removeRule: untrainRule.mutateAsync,
    untrainRule: untrainRule.mutateAsync,
    fastDismiss: fastDismiss.mutateAsync,
    fastDismissRule: fastDismiss.mutateAsync,
    adjustCategoryRouting: adjustCategoryRouting.mutateAsync,
    recordVoiceDirective: recordVoiceDirective.mutateAsync,
    matchRule,
    isSaving:
      saveRule.isPending ||
      untrainRule.isPending ||
      fastDismiss.isPending ||
      adjustCategoryRouting.isPending ||
      recordVoiceDirective.isPending,
  }
}
