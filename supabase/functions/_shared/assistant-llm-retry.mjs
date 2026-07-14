const TRANSIENT_LLM_STATUSES = new Set([500, 502, 503])

export function shouldRetryTransientLlmStatus(status, remainingBudgetMs) {
  return TRANSIENT_LLM_STATUSES.has(status) && remainingBudgetMs >= 1500
}
