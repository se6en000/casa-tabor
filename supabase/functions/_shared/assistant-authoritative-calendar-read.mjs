import { executeAgentReadTool } from './assistant-agent-read.mjs'

export function buildAuthoritativeCalendarRead(range, events, utcOffset) {
  const result = executeAgentReadTool('calendar.get_range', {
    start: range?.contextStart ?? range?.start,
    end: range?.contextEnd ?? range?.end,
    primary_start: range?.start,
    primary_end: range?.end,
    utc_offset: utcOffset,
  }, { events })

  if (!result.supported) {
    throw new TypeError(`Invalid authoritative calendar range: ${result.code ?? 'unknown'}`)
  }

  return {
    scope: {
      start: range.start,
      end: range.end,
      label: range.label,
      utcOffset,
    },
    count: result.primaryEvents.length,
    events: result.primaryEvents.map(promptEvent),
    sameDayContext: result.contextEvents
      .filter((event) => result.laterContextEventIds.includes(event.id))
      .map(promptEvent),
  }
}

export function calendarReadSynthesisPrompt(userText, result) {
  const eventLines = result.events.map(formatPromptEvent)
  const contextLines = result.sameDayContext.map(formatPromptEvent)
  return [
    `User request: ${String(userText ?? '').trim()}`,
    `Requested range: ${result.scope.label} (${result.scope.start} to ${result.scope.end}, UTC offset ${result.scope.utcOffset}).`,
    `${result.count} authoritative calendar items are in the requested range.`,
    eventLines.length > 0 ? `Requested items:\n${eventLines.join('\n')}` : 'Requested items: none.',
    contextLines.length > 0 ? `Later same-day context:\n${contextLines.join('\n')}` : '',
    'Answer naturally and concisely. Mention every item exactly once, preserving its title, time, type, people, and location when provided. State explicitly when there are no items. Do not invent, omit, merge, or expose internal IDs.',
  ].filter(Boolean).join('\n\n')
}

export function calendarReadFallbackText(result) {
  if (result.events.length === 0) {
    return `Nothing is on the calendar ${result.scope.label}.`
  }
  const header = result.events.length === 1
    ? `There is one calendar item ${result.scope.label}:`
    : `There are ${result.events.length} calendar items ${result.scope.label}:`
  return `${header}\n${result.events.map((event) =>
    `- ${event.allDay ? 'All day' : formatLocalTime(event.start, result.scope.utcOffset)} — ${event.title}${event.location ? ` at ${event.location}` : ''}`
  ).join('\n')}`
}

export function isCalendarReadAnswerComplete(text, result) {
  const answer = normalizeComparableText(text)
  if (!answer) return false
  return result.events.every((event) => answer.includes(normalizeComparableText(event.title)))
}

function promptEvent(event) {
  return {
    id: event.id,
    title: event.title,
    start: event.start_time,
    end: event.end_time,
    allDay: event.all_day,
    eventType: event.event_type,
    location: event.address ?? event.location_name ?? null,
    members: event.members,
  }
}

function formatPromptEvent(event) {
  return `- ${event.eventType}: ${event.title} | ${event.allDay ? 'all day' : `${event.start} to ${event.end}`}${event.members.length > 0 ? ` | people: ${event.members.join(', ')}` : ''}${event.location ? ` | location: ${event.location}` : ''}`
}

function formatLocalTime(value, utcOffset) {
  const timestamp = Date.parse(value)
  const match = String(utcOffset ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!Number.isFinite(timestamp) || !match) return value
  const minutes = (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]))
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(timestamp + minutes * 60000))
}

function normalizeComparableText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
