import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { AiCircuitBreakerState, SystemAlertSummary } from '../lib/systemHealth.mjs'

export interface ActiveSystemAlerts {
  breaker: AiCircuitBreakerState | null
  critical_alerts: SystemAlertSummary[]
}

// Polled rather than realtime, like useSyncHealth: one cheap RPC a minute per device
// (get_active_system_alerts reads a settings row plus open critical alerts only).
export function useSystemAlerts() {
  return useQuery({
    queryKey: ['system-alerts', 'active'],
    queryFn: async (): Promise<ActiveSystemAlerts> => {
      const { data, error } = await supabase.rpc('get_active_system_alerts')
      if (error) {
        console.warn('[useSystemAlerts] Failed to fetch active alerts:', error.message)
        return { breaker: null, critical_alerts: [] }
      }
      return (data as ActiveSystemAlerts) ?? { breaker: null, critical_alerts: [] }
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}
