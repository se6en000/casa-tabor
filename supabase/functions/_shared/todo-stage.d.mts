export type TodoStage = 'snoozed' | 'overdue' | 'due' | 'heads_up' | 'quiet' | 'undated'
export function leadDays(item?: { minutes?: number | null; shape?: string | null; needs?: string[] | null }): number
export function todoStage(item: { due: string | null; snoozedUntil?: string | null; minutes?: number | null; shape?: string | null; needs?: string[] | null }, today: string): { stage: TodoStage; daysAway: number | null; leadDays: number }
export function overdueToRaise<T extends { due: string | null; snoozedUntil?: string | null; needs?: string[] | null }>(items: T[], today: string, raised?: { date: string; id?: string } | null): T | null
export function offerFor(item: { needs?: string[] | null; shape?: string | null; nextStep?: string | null; minutes?: number | null }): string
