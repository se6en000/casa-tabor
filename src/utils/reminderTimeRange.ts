const MINIMUM_REMINDER_DURATION_MS = 60_000

export function normalizeReminderTimeRange(
  editedStartLocal: string,
  storedStartIso: string,
  storedEndIso: string,
): { start: string; end: string } {
  const start = new Date(editedStartLocal)
  if (!Number.isFinite(start.getTime())) {
    throw new Error('Choose a valid reminder date and time.')
  }

  const storedStart = new Date(storedStartIso).getTime()
  const storedEnd = new Date(storedEndIso).getTime()
  const storedDuration = storedEnd - storedStart
  const duration = Number.isFinite(storedDuration) && storedDuration > 0
    ? storedDuration
    : MINIMUM_REMINDER_DURATION_MS

  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + duration).toISOString(),
  }
}
