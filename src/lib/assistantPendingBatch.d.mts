export interface PendingBatchAction {
  count: number
  titles: string[]
}

export function derivePendingBatchAction(
  messages: Array<{
    role?: string
    toolActionBatch?: {
      actions?: Array<{
        status?: string
        args?: { title?: unknown }
      }>
    }
  }>,
): PendingBatchAction | undefined
