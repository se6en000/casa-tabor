import type { PrepItem } from '../types'

export interface AttentionTopic {
  key: string
  item: PrepItem
  items: PrepItem[]
  itemIds: string[]
  prepItemIds: string[]
  sourceTypes: string[]
}

function attentionKind(item: PrepItem) {
  return item.category?.trim().toLowerCase()
    || item.type.trim().toLowerCase()
}

function normalizedTopicText(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isReminderItem(item: PrepItem) {
  return item.source_type === 'reminder_manual' || item.source_type === 'reminder_missed'
}

function isPrepItem(item: PrepItem) {
  return item.source_type !== 'conflict' && item.source_type !== 'directory_suggestion'
}

function isHigherPriority(item: PrepItem, current: PrepItem) {
  if (item.priority !== current.priority) return item.priority > current.priority
  const itemDue = Date.parse(item.due_by ?? item.event_date ?? '')
  const currentDue = Date.parse(current.due_by ?? current.event_date ?? '')
  if (!Number.isFinite(itemDue)) return false
  if (!Number.isFinite(currentDue)) return true
  return itemDue < currentDue
}

function isRecreatedReminderMatch(item: PrepItem, topic: AttentionTopic) {
  if (!isReminderItem(item) || !isReminderItem(topic.item)) return false
  if (normalizedTopicText(item.event_title ?? item.description)
    !== normalizedTopicText(topic.item.event_title ?? topic.item.description)) return false
  const itemTime = Date.parse(item.event_date ?? '')
  const topicTime = Date.parse(topic.item.event_date ?? '')
  return Number.isFinite(itemTime)
    && Number.isFinite(topicTime)
    && Math.abs(itemTime - topicTime) <= 30 * 60 * 1000
}

export function attentionTopicKey(item: PrepItem) {
  const kind = attentionKind(item)
  if (item.event_id) return `event:${item.event_id}:${kind}`
  if (item.source_ref) return `source:${item.source_type ?? 'unknown'}:${item.source_ref}:${kind}`
  return `item:${item.id}`
}

export function buildAttentionTopics(items: PrepItem[]): AttentionTopic[] {
  const topics = new Map<string, AttentionTopic>()
  for (const item of items) {
    const reminderTopic = isReminderItem(item)
      ? [...topics.values()].find((topic) => isRecreatedReminderMatch(item, topic))
      : undefined
    const key = reminderTopic?.key ?? attentionTopicKey(item)
    const topic = topics.get(key)
    if (topic) {
      topic.items.push(item)
      topic.itemIds.push(item.id)
      if (isPrepItem(item)) topic.prepItemIds.push(item.id)
      if (item.source_type && !topic.sourceTypes.includes(item.source_type)) {
        topic.sourceTypes.push(item.source_type)
      }
      if (isHigherPriority(item, topic.item)) topic.item = item
    } else {
      topics.set(key, {
        key,
        item,
        items: [item],
        itemIds: [item.id],
        prepItemIds: isPrepItem(item) ? [item.id] : [],
        sourceTypes: item.source_type ? [item.source_type] : [],
      })
    }
  }
  return [...topics.values()]
}
