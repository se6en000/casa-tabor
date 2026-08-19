import type { Conflict, PrepItem, DeliveryTransitItem } from '../types'
import type { Notification } from '../hooks/useNotifications'
import { isDeliveryTransitItem, buildDeliveryTransitItem } from './vendorTransactions.ts'

export function conflictToNeedsYouItem(conflict: Conflict): PrepItem {
  return {
    id: conflict.id,
    event_id: conflict.event_a_id,
    type: conflict.conflict_type,
    category: null,
    emoji: '',
    description: conflict.description,
    event_title: conflict.event_a?.title ?? null,
    event_date: conflict.event_a?.start_time ?? null,
    due_by: null,
    priority: conflict.severity,
    dismissed: conflict.resolved,
    dismissed_at: conflict.resolved_at,
    created_at: conflict.created_at,
    source_type: 'conflict',
    source_ref: conflict.id,
  }
}

export function directorySuggestionToNeedsYouItem(notification: Notification): PrepItem {
  return {
    id: notification.id,
    event_id: notification.event_id,
    type: 'directory_suggestion',
    category: null,
    emoji: '',
    description: notification.body ?? notification.title,
    event_title: notification.event?.title ?? null,
    event_date: notification.event?.start_time ?? null,
    due_by: null,
    // Directory suggestions are informational, not urgent — below prep item
    // priority 1 defaults so genuine prep work never gets pushed down by them.
    priority: 1,
    dismissed: notification.read,
    dismissed_at: null,
    created_at: notification.created_at,
    source_type: 'directory_suggestion',
    source_ref: notification.id,
  }
}

/** True for merged-in conflict/directory-suggestion rows, which don't yet have inline
 * actions (Phase 2) — cards should hide the Done/Snooze/Create/Downvote action row
 * for these rather than show buttons that silently do nothing. */
export function isReadOnlyNeedsYouItem(item: { source_type?: string | null }): boolean {
  return item.source_type === 'conflict' || item.source_type === 'directory_suggestion'
}

export function mergeNeedsYouItems(
  prepItems: PrepItem[],
  conflicts: Conflict[],
  directorySuggestions: Notification[],
): PrepItem[] {
  const merged: PrepItem[] = [
    ...prepItems,
    ...conflicts.filter((c) => !c.resolved).map(conflictToNeedsYouItem),
    ...directorySuggestions.filter((n) => !n.read).map(directorySuggestionToNeedsYouItem),
  ]
  return merged.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

/** Separates high-agency Action Items from passive In-Transit Deliveries */
export function splitActionableAndTransitItems(items: PrepItem[]): {
  actionableItems: PrepItem[]
  deliveryTransitItems: DeliveryTransitItem[]
} {
  const actionableItems: PrepItem[] = []
  const transitMap = new Map<string, DeliveryTransitItem>()
  const stageRank = ['confirmed', 'payment', 'shipped', 'out_for_delivery', 'delivered', 'problem']

  for (const item of items) {
    if (isDeliveryTransitItem(item)) {
      const transitItem = buildDeliveryTransitItem(item)
      const existing = transitMap.get(transitItem.threadKey)
      if (!existing) {
        transitMap.set(transitItem.threadKey, transitItem)
      } else {
        const existingRank = stageRank.indexOf(existing.stage)
        const incomingRank = stageRank.indexOf(transitItem.stage)
        const higherStage = incomingRank > existingRank ? transitItem.stage : existing.stage

        const mergedCost = transitItem.cost || existing.cost || null
        const isGenericPaymentSummary = (summary?: string | null) =>
          !summary || /final charge|temporary hold|charge for your|receipt for/i.test(summary)

        const mergedSummary = !isGenericPaymentSummary(transitItem.itemSummary)
          ? transitItem.itemSummary
          : existing.itemSummary
        const mergedEta = transitItem.etaDisplay || existing.etaDisplay || null
        const newerDate =
          new Date(transitItem.occurredAt).getTime() >= new Date(existing.occurredAt).getTime()
            ? transitItem.occurredAt
            : existing.occurredAt

        transitMap.set(transitItem.threadKey, {
          ...existing,
          stage: higherStage,
          cost: mergedCost,
          itemSummary: mergedSummary,
          etaDisplay: mergedEta,
          occurredAt: newerDate,
        })
      }
    } else {
      actionableItems.push(item)
    }
  }

  return {
    actionableItems,
    deliveryTransitItems: Array.from(transitMap.values()).sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    ),
  }
}
