export function emitVoiceDebug(
  stage: string,
  message: string,
  status: 'pending' | 'success' | 'error' = 'success',
  data?: Record<string, unknown>,
) {
  window.dispatchEvent(
    new CustomEvent('voice-debug', {
      detail: {
        timestamp: Date.now(),
        stage,
        status,
        message,
        data,
      },
    })
  )
}
