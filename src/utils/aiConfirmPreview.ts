import { addDays, differenceInMinutes, format, isSameDay } from 'date-fns'
import { formatAllDayRangeLabel } from './allDayEventRange.ts'

type ConfirmEvent = {
  title: string
  start_time: string
  end_time: string
  all_day?: boolean
  location_name?: string | null
  address?: string | null
  id?: string
}

function parseDate(value: string): Date {
  return new Date(value)
}

function formatDayLabel(value: Date, relativeTo?: Date): string {
  if (relativeTo && isSameDay(value, relativeTo)) return 'Today'
  if (relativeTo && isSameDay(value, addDays(relativeTo, 1))) return 'Tomorrow'
  return format(value, 'EEE, MMM d')
}

function formatTimedRange(startValue: string, endValue: string, relativeTo?: Date): string {
  const start = parseDate(startValue)
  const end = parseDate(endValue)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Unknown time'
  const startLabel = `${formatDayLabel(start, relativeTo)} · ${format(start, 'h:mm a')}`
  const endLabel = format(end, 'h:mm a')
  return `${startLabel} – ${endLabel}`
}

export function formatEventSpan(
  event: Pick<ConfirmEvent, 'start_time' | 'end_time' | 'all_day'>,
  relativeTo?: Date,
): string {
  if (event.all_day) return formatAllDayRangeLabel(event.start_time, event.end_time)
  return formatTimedRange(event.start_time, event.end_time, relativeTo)
}

export function formatUpdateTargetSpan(args: Record<string, unknown>, fallbackEvent?: Pick<ConfirmEvent, 'start_time' | 'end_time' | 'all_day'>): string | null {
  const start = typeof args.start === 'string' ? args.start : fallbackEvent?.start_time
  const end = typeof args.end === 'string' ? args.end : fallbackEvent?.end_time
  if (!start || !end) return null
  const allDay = args.all_day === true || fallbackEvent?.all_day === true
  return formatEventSpan({ start_time: start, end_time: end, all_day: allDay })
}

export function buildUpdatePreviewCopy(
  args: Record<string, unknown>,
  event?: Pick<ConfirmEvent, 'title' | 'start_time' | 'end_time' | 'all_day'>,
): { heading: string; currentSpan: string | null; nextSpan: string | null; details: string[] } {
  const eventTitle = event?.title ?? String(args.title ?? 'this event')
  const heading = args.start !== undefined || args.end !== undefined
    ? `Move "${eventTitle}"`
    : `Update "${eventTitle}"`
  const currentSpan = event ? formatEventSpan(event) : null
  const nextSpan = formatUpdateTargetSpan(args, event ?? undefined)
  const details: string[] = []
  if (args.location !== undefined) details.push(`Location: ${String(args.location ?? '(clear)')}`)
  if (args.address !== undefined) details.push(`Address: ${String(args.address ?? '(clear)')}`)
  if (args.notes !== undefined) details.push(`Notes: ${String(args.notes ?? '(clear)')}`)
  if (args.category !== undefined) details.push(`Category: ${String(args.category ?? '(clear)')}`)
  if (args.what_to_bring !== undefined) {
    details.push(`What to bring: ${Array.isArray(args.what_to_bring) ? `${args.what_to_bring.length} item(s)` : 'updated'}`)
  }
  if (args.members_add !== undefined) details.push(`Add: ${Array.isArray(args.members_add) ? args.members_add.join(', ') : 'updated'}`)
  if (args.members_remove !== undefined) details.push(`Remove: ${Array.isArray(args.members_remove) ? args.members_remove.join(', ') : 'updated'}`)
  return { heading, currentSpan, nextSpan, details }
}

export function buildCreatePreviewCopy(
  args: Record<string, unknown>,
  options: { now?: Date } = {},
): { heading: string; when: string | null; details: string[]; impact: string } {
  const heading = `Ready to add "${String(args.title ?? 'new event')}"?`
  const when = typeof args.start === 'string' && typeof args.end === 'string'
    ? formatEventSpan({
      start_time: args.start,
      end_time: args.end,
      all_day: args.all_day === true,
    }, options.now)
    : null
  const details: string[] = []
  if (args.location !== undefined) details.push(`Location: ${String(args.location ?? '(clear)')}`)
  if ((args.members as string[] | undefined)?.length) details.push(`People: ${(args.members as string[]).join(', ')}`)
  if (args.all_day === true) details.push('All day')
  if (args.all_day !== true && typeof args.start === 'string' && typeof args.end === 'string') {
    const duration = differenceInMinutes(parseDate(args.end), parseDate(args.start))
    if (duration > 0) {
      details.push(duration % 60 === 0
        ? `Duration: ${duration / 60} hour${duration === 60 ? '' : 's'}`
        : `Duration: ${duration} minutes`)
    }
  }
  return {
    heading,
    when,
    details,
    impact: 'Adds to Casa Calendar now; connected calendar sync follows automatically.',
  }
}

export function buildDeletePreviewCopy(
  event?: Pick<ConfirmEvent, 'title' | 'start_time' | 'end_time' | 'all_day'>,
  args?: Record<string, unknown>,
): { heading: string; when: string | null; note: string } {
  const title = event?.title ?? String(args?.title ?? 'this event')
  return {
    heading: `Delete "${title}"`,
    when: event ? formatEventSpan(event) : null,
    note: 'This removes it from your calendar.',
  }
}

function summarizeDeleteEvent(event: Pick<ConfirmEvent, 'title' | 'start_time' | 'end_time' | 'all_day' | 'location_name' | 'address'>): string {
  const span = formatEventSpan(event)
  const place = event.location_name || event.address ? ` · ${event.location_name ?? event.address}` : ''
  return `${event.title} — ${span}${place}`
}

export function buildDeleteManyPreviewCopy(
  events: Array<Pick<ConfirmEvent, 'id' | 'title' | 'start_time' | 'end_time' | 'all_day' | 'location_name' | 'address'>>,
  args: Record<string, unknown>,
): { heading: string; note: string; matches: string[]; count: number } {
  const titleQuery = String(args.title_query ?? '').trim()
  const ids = Array.isArray(args.ids) ? args.ids.map((id) => String(id)) : []
  const matched = ids.length > 0
    ? events.filter((event) => event.id && ids.includes(event.id))
    : titleQuery
      ? events.filter((event) => event.title.toLowerCase().includes(titleQuery.toLowerCase()))
      : []
  const count = Number.isFinite(Number(args.count)) ? Number(args.count) : matched.length
  const matches = matched.slice(0, 4).map(summarizeDeleteEvent)
  return {
    heading: count === 1 ? `Delete 1 matching event?` : `Delete ${count} matching events?`,
    note: titleQuery
      ? `Matches "${titleQuery}" and will remove ${count} event${count === 1 ? '' : 's'}.`
      : `This will remove ${count} event${count === 1 ? '' : 's'} from your calendar.`,
    matches,
    count,
  }
}
