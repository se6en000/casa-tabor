import {
  buildGoogleEventDescription,
  googleLocationForEvent,
  replaceCasaDetailsBlock,
} from './google-event-details-core.mjs'

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export { replaceCasaDetailsBlock }

function googleTime(event, timezone) {
  if (event.all_day) {
    return {
      start: { date: text(event.start_time).slice(0, 10) },
      end: { date: text(event.end_time).slice(0, 10) },
    }
  }
  return {
    start: { dateTime: new Date(event.start_time).toISOString(), timeZone: timezone },
    end: { dateTime: new Date(event.end_time).toISOString(), timeZone: timezone },
  }
}

export function serializeGoogleRecurrenceProjection({
  event,
  series,
  bundle = {},
  existingGoogleDescription = '',
  invitationAttendees = [],
  casaBaseUrl = 'https://casa-tabor.vercel.app',
}) {
  if (!event?.id || !series?.id || !Number.isInteger(series.revision) || series.revision < 1) {
    throw new Error('A persisted event and revisioned series are required for Google projection.')
  }
  const timezone = text(series.timezone) || 'America/New_York'
  const location = googleLocationForEvent(event, bundle)
  const attendees = invitationAttendees
    .map((attendee) => ({
      email: text(attendee?.email),
      ...(text(attendee?.displayName) ? { displayName: text(attendee.displayName) } : {}),
    }))
    .filter((attendee) => attendee.email)
  const recurrence = Array.isArray(series.recurrence_lines)
    ? series.recurrence_lines.map(text).filter(Boolean)
    : []

  return {
    summary: text(event.title) || 'Untitled event',
    description: buildGoogleEventDescription({
      bundle,
      existingDescription: existingGoogleDescription,
      eventId: event.id,
      casaBaseUrl,
    }),
    ...(location ? { location } : {}),
    ...googleTime(event, timezone),
    ...(recurrence.length ? { recurrence } : {}),
    ...(attendees.length ? { attendees } : {}),
    extendedProperties: {
      private: {
        casaSeriesId: series.id,
        casaEventId: event.id,
        casaRevision: String(series.revision),
        casaProjectionVersion: '2',
      },
    },
  }
}

export function projectionHashInput(payload) {
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize)
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      )
    }
    return value
  }
  return JSON.stringify(normalize(payload))
}
