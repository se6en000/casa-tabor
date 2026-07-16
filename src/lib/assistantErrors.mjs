export function assistantErrorMessage(code, message) {
  if (code === 'quota_exceeded') {
    return 'AI quota reached for today. Go to Settings → AI to check your billing.'
  }
  if (
    code === 'model_timeout' ||
    /model_timeout_\d+ms|timed?\s*out|taking too long/i.test(String(message ?? ''))
  ) {
    return 'Casa AI took too long to respond. Please try again.'
  }
  if (code === 'incomplete_recipe') {
    return 'Casa could not finish the full recipe, so it left out the partial answer. Please try again.'
  }
  return 'Casa AI could not complete that request. Please try again.'
}
