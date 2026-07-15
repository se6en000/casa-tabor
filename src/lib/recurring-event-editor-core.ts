export function truncateRecurrenceLinesForFuture(
  recurrenceLines: string[],
  originalStart: string,
): string[] {
  const splitTime = new Date(originalStart).getTime()
  if (!Number.isFinite(splitTime)) throw new Error('The selected occurrence has no valid original start time.')
  const until = new Date(splitTime - 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return recurrenceLines.map((line) => {
    if (!line.startsWith('RRULE:')) return line
    const normalized = line
      .replace(/;?UNTIL=[^;]+/g, '')
      .replace(/;?COUNT=[^;]+/g, '')
    return `${normalized};UNTIL=${until}`
  })
}
