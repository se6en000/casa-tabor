export function formatSupabaseError(error: unknown, fallbackMessage: string): string {
  if (!error) return fallbackMessage

  if (error instanceof Error) {
    return error.message || fallbackMessage
  }

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    const message = typeof record.message === 'string' ? record.message.trim() : ''
    const code = typeof record.code === 'string' ? record.code.trim() : ''
    const details = typeof record.details === 'string' ? record.details.trim() : ''
    const hint = typeof record.hint === 'string' ? record.hint.trim() : ''

    const parts: string[] = [message || fallbackMessage]
    if (code) parts.push(`code ${code}`)
    if (details) parts.push(details)
    if (hint) parts.push(`hint: ${hint}`)
    return parts.join(' — ')
  }

  return fallbackMessage
}
