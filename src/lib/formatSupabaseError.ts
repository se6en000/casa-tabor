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

/**
 * Humanizes common backend error messages for clear, friendly display in the UI.
 */
export function humanizeFunctionError(rawError: string): string {
  if (!rawError) return 'An unexpected error occurred'
  const low = rawError.toLowerCase()
  if (
    low.includes('reauthorization_required') ||
    low.includes('token refresh failed') ||
    low.includes('invalid_grant') ||
    low.includes('token expired')
  ) {
    return 'Google authorization expired. Reconnect account to resume.'
  }
  if (low.includes('ai not configured') || low.includes('missing gemini') || low.includes('api_key')) {
    return 'AI service configuration error.'
  }
  if (low.includes('rate limit') || low.includes('429') || low.includes('resource_exhausted')) {
    return 'Rate limit reached. Please retry in a few moments.'
  }
  if (low.includes('timeout') || low.includes('504') || low.includes('gateway timeout')) {
    return 'Request timed out while scanning large inbox. Retrying will continue incrementally.'
  }
  if (low.includes('no immediate family members')) {
    return 'No immediate family members configured for Gmail scanning.'
  }
  if (low.includes('jwt') || low.includes('unauthorized') || low.includes('401')) {
    return 'Authentication required or session expired.'
  }
  return rawError
}

/**
 * Unboxes error payloads from Supabase Edge Functions (FunctionsHttpError / FunctionsRelayError / FunctionsFetchError).
 * When an Edge Function returns a non-2xx status code, the SDK sets error.message = "Edge Function returned a non-2xx status code".
 * This helper asynchronously extracts the actual server response payload ({ error: string } or text) from error.context.
 */
export async function extractFunctionErrorMessage(
  error: unknown,
  fallbackMessage: string = 'Service call failed',
): Promise<string> {
  if (!error) return fallbackMessage

  if (typeof error === 'object' && error !== null) {
    const err = error as { message?: string; context?: Response; status?: number }

    if (err.context && typeof err.context === 'object') {
      try {
        const cloned = typeof err.context.clone === 'function' ? err.context.clone() : err.context
        if (typeof cloned.json === 'function') {
          const body = await cloned.json()
          if (body?.error && typeof body.error === 'string') {
            return humanizeFunctionError(body.error)
          }
          if (body?.message && typeof body.message === 'string') {
            return humanizeFunctionError(body.message)
          }
        }
      } catch {
        try {
          const cloned = typeof err.context.clone === 'function' ? err.context.clone() : err.context
          if (typeof cloned.text === 'function') {
            const text = await cloned.text()
            if (text && text.trim()) {
              return humanizeFunctionError(text.trim())
            }
          }
        } catch {
          // ignore
        }
      }
    }

    if (err.message && !err.message.includes('non-2xx status code')) {
      return humanizeFunctionError(err.message)
    }
  }

  if (error instanceof Error && error.message && !error.message.includes('non-2xx status code')) {
    return humanizeFunctionError(error.message)
  }

  return fallbackMessage
}

