import { notesOf } from '../../supabase/functions/_shared/event-notes.mjs'
import type { WallEvent } from './engine/types'

/**
 * What a card adds to something already there — get & pack lines, or lines under its notes — spelled out line by line
 * (Jake, Oct 7: "i need to see on the card, what will actually be added … its a confidence thing"). A change that also
 * moves, renames or re-places it is the full card's (assistantCard.ts), which shows its notes too.
 */
export interface AddsCard {
  kind: 'prep' | 'notes'
  title: string
  /** "Tue, Oct 20 · all day", "Thu, Oct 8 · 7:00 AM". */
  when: string
  /** The notes already there, for context (a notes card only). */
  existing: string[]
  adding: string[]
  yes: string
}

const lines = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).map((l) => String(l ?? '').trim()).filter(Boolean)

function whenOf(e: WallEvent | undefined): string {
  if (!e) return ''
  const utc = new Date(e.start_time)
  const day = e.all_day ? new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()) : utc
  const date = day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return `${date} · ${e.all_day ? 'all day' : utc.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

export function addsCard(action: { tool: string; args: Record<string, unknown> } | null, events: WallEvent[]): AddsCard | null {
  if (!action) return null
  const a = action.args
  if (action.tool === 'add_prep_item') {
    const adding = lines(Array.isArray(a.labels) ? a.labels : a.label)
    if (!adding.length) return null
    const event = events.find((e) => e.id === a.event_id)
    return { kind: 'prep', title: event?.title ?? String(a.event_title ?? 'The event'), when: whenOf(event), existing: [], adding, yes: adding.length === 1 ? 'Yes, add it' : `Yes, add ${adding.length}` }
  }
  if (action.tool === 'update_event') {
    const adding = lines(a.notes_add)
    const other = Object.keys(a).filter((k) => !['id', 'expected_updated_at', 'notes_add'].includes(k))
    if (!adding.length || other.length) return null
    const event = events.find((e) => e.id === a.id)
    const existing = notesOf(event?.description ?? null).split('\n').map((l) => l.trim()).filter(Boolean)
    return { kind: 'notes', title: event?.title ?? 'The event', when: whenOf(event), existing, adding, yes: 'Yes, add to the notes' }
  }
  return null
}
