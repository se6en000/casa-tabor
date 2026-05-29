import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/** Trigger AI enrichment for a single event, with optional extra context */
export function useEnrichEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ eventId, extraContext, lockedCategory }: { eventId: string; extraContext?: string; lockedCategory?: string }) => {
      const { data, error } = await supabase.functions.invoke('enrich-event', {
        body: { event_id: eventId, extra_context: extraContext || undefined, locked_category: lockedCategory || undefined },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
    },
  })
}

/** Save a single enrichment field manually */
export function useSaveEnrichmentField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ eventId, field, value }: { eventId: string; field: string; value: unknown }) => {
      const { error } = await supabase
        .from('event_enrichments')
        .upsert({ event_id: eventId, [field]: value, updated_at: new Date().toISOString() }, { onConflict: 'event_id' })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
    },
  })
}

/** Save multiple enrichment fields at once (used by edit sheet) */
export function useSaveEnrichmentBatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ eventId, fields }: { eventId: string; fields: Record<string, unknown> }) => {
      const { error } = await supabase
        .from('event_enrichments')
        .upsert(
          { event_id: eventId, ...fields, updated_at: new Date().toISOString() },
          { onConflict: 'event_id' }
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['events'] })
    },
  })
}

