export type PendingConfirmationIntent = 'confirm' | 'cancel'

export function classifyPendingConfirmation(
  value: unknown,
): PendingConfirmationIntent | null
