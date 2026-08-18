export type LivingFlowMode = 'event' | 'reminder'
export type LogisticsMode = 'stay' | 'dropoff_only' | 'pickup_only' | 'two_way' | 'none'
export type TravelBehavior = 'stay' | 'dropoff' | 'dropoff_only' | 'pickup_only' | 'two_way' | 'none'
export type RecurrenceScope = 'this' | 'all'

export interface VenueInfo {
  name: string
  address: string
  driveMinutes: number
  distanceMiles: number
  routeSummary?: string | null
  trafficDelayMinutes?: number
  icon?: string
}

export interface LivingFlowState {
  mode: LivingFlowMode
  title: string
  category: string
  categoryIcon: string
  travelBehavior: TravelBehavior
  driverLeg1: string
  driverLeg2: string
  startDate: Date
  endDate: Date
  durationMinutes: number
  bufferMinutes: number
  recurScope: RecurrenceScope
  venue: VenueInfo
  isCalculatingRoute?: boolean
  selectedMemberIds: string[]
  primaryMemberId: string | null
  isAllDay?: boolean
}

export interface LivingFlowProps {
  event: import('../../../hooks/useCalendarEvents').EventWithDetails | null
  onClose: () => void
  embedded?: boolean
  onAskAi?: (prompt?: string) => void
  onSwitchToAi?: () => void
}
