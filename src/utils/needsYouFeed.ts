// Normalizes Conflict rows and directory_suggestions Notification rows into the
// PrepItem shape so the existing Needs You card (Home rail + Action Hub) can render
// all three "needs your attention" sources with zero visual special-casing. This is
// the Phase 1 data-merge step of the Needs You feed unification: conflicts and
// directory suggestions used to only appear in separate, disconnected UI (Action
// Hub's ConflictAlertsSection and the Activity/notifications drawer). They are
// intentionally read-only here — real inline Resolve/Review actions are Phase 2,
// which needs its own UX review before shipping (a small card may not comfortably
// fit "heavy" inline conflict-resolution or contact/place-confirmation actions).
import type { Conflict, PrepItem } from '../types'
import type { Notification } from '../hooks/useNotifications'

export function conflictToNeedsYouItem(conflict: Conflict): PrepItem {
  return {
    id: conflict.id,
    event_id: conflict.event_a_id,
    type: conflict.conflict_type,
    category: null,
    emoji: '⚠️',
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
    emoji: '📇',
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
