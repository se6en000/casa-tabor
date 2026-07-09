export interface FastPathEvent {
  title: string
  start_time: string
  end_time: string
  all_day?: boolean
  location_name?: string | null
}

export const FASTPATH_BLOCK_VERBS: RegExp
export const FASTPATH_NEXT: RegExp
export const FASTPATH_TODAY: RegExp
export const FASTPATH_TOMORROW: RegExp

export function tryLocalScheduleAnswer(
  text: string,
  events: FastPathEvent[],
  now?: Date,
): string | null
