// What Alexa is talking about from Ahead (canvas 63B; Jake, Oct 7: "after we discuss and decide an action. alexa should
// offer to clear it from the list as well"): set when a line is tapped; when that conversation saves something (a
// reminder, an event, a to-do, a plan), the line is marked handled with what was made, and it leaves the list.

export interface HorizonTopic { key: string; title: string; date: string; at: number }

/** A talk about one is good for a quarter of an hour; after that a save is about something else. */
const FRESH_MS = 15 * 60_000
let topic: HorizonTopic | null = null

export function setHorizonTopic(next: { key: string; title: string; date: string } | null, now = Date.now()): void {
  topic = next ? { ...next, at: now } : null
}

/** The topic, if a talk about it is still going. */
export function horizonTopic(now = Date.now()): HorizonTopic | null {
  return topic && now - topic.at <= FRESH_MS ? topic : null
}

/** What the saved card made, in a line for the timeline: "Reminder: Thu Oct 8, 9 AM", "To-do: Buy supplies · Fri Oct 16". */
export function outcomeText(tool: string, args: Record<string, unknown>): string {
  const title = typeof args.title === 'string' ? args.title : ''
  const start = typeof args.start === 'string' ? args.start : typeof args.due === 'string' ? args.due : ''
  const d = start ? new Date(start.length === 10 ? `${start}T12:00:00` : start) : null
  const when = d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '') + (args.all_day === true || start.length === 10 ? '' : `, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00 ', ' ')}`)
    : ''
  if (tool === 'create_event') return `${args.event_type === 'reminder' ? 'Reminder' : 'On the calendar'}: ${title}${when ? ` · ${when}` : ''}`
  if (tool === 'add_todo') return `To-do: ${title}${when ? ` · ${when}` : ''}`
  if (tool === 'plan_project' || tool === 'apply_plan') return `Plan: ${title}`
  if (tool === 'update_event') return `Changed: ${title || 'the event'}`
  return 'Handled'
}
