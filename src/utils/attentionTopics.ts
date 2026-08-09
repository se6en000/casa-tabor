import type { PrepItem } from '../types'
import { isNewerTransactionUpdate, vendorTransactionIdentity } from './vendorTransactions.ts'

export interface AttentionTopic {
  key: string
  item: PrepItem
  items: PrepItem[]
  itemIds: string[]
  prepItemIds: string[]
  sourceTypes: string[]
  transactionVendor: string | null
  transactionStage: string | null
}

export interface AttentionTopicRule {
  signature: string
  topic_key: string
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

const SEMANTIC_STOP_WORDS = new Set([
  'and', 'appointment', 'at', 'board', 'event', 'family', 'for', 'help',
  'meeting', 'needs', 'the', 'to', 'vote', 'your',
])

function topicTokens(value: string | null | undefined) {
  return normalizedTopicText(value)
    .split(' ')
    .filter((token) => token.length > 2 && !SEMANTIC_STOP_WORDS.has(token))
}

export function attentionLearningSignature(item: PrepItem) {
  const date = item.event_date?.slice(0, 10) ?? item.due_by?.slice(0, 10) ?? 'undated'
  return [
    item.source_type ?? 'unknown',
    attentionKind(item),
    normalizedTopicText(item.event_title ?? item.description),
    date,
  ].join(':')
}

function isSemanticEventMatch(item: PrepItem, topic: AttentionTopic) {
  if (!item.event_title || !topic.item.event_title) return false
  if (item.event_id && topic.items.some((candidate) => candidate.event_id && candidate.event_id !== item.event_id)) {
    return false
  }
  const itemTime = Date.parse(item.event_date ?? '')
  const topicTime = Date.parse(topic.item.event_date ?? '')
  if (!Number.isFinite(itemTime) || !Number.isFinite(topicTime)) return false
  if (Math.abs(itemTime - topicTime) > 2 * 60 * 60 * 1000) return false

  const topicTokenSet = new Set(topicTokens(topic.item.event_title))
  const sharedTokens = topicTokens(item.event_title).filter((token) => topicTokenSet.has(token))
  return sharedTokens.length >= 2
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
  const transaction = vendorTransactionIdentity(item)
  if (transaction) return transaction.key
  if (item.event_id) return `event:${item.event_id}`
  const kind = attentionKind(item)
  if (item.source_ref) return `source:${item.source_type ?? 'unknown'}:${item.source_ref}:${kind}`
  return `item:${item.id}`
}

export function buildAttentionTopics(items: PrepItem[], learnedRules: AttentionTopicRule[] = []): AttentionTopic[] {
  const topics = new Map<string, AttentionTopic>()
  const learnedTopicKeys = new Map(learnedRules.map((rule) => [rule.signature, rule.topic_key]))
  for (const item of items) {
    const learnedTopicKey = learnedTopicKeys.get(attentionLearningSignature(item))
    const transaction = vendorTransactionIdentity(item)
    const eventTopic = !transaction && !learnedTopicKey
      ? [...topics.values()].find((topic) =>
          !topic.transactionVendor
          && !topic.key.startsWith('separate:')
          && (
            Boolean(item.event_id && topic.items.some((candidate) => candidate.event_id === item.event_id))
            || isSemanticEventMatch(item, topic)
          ))
      : undefined
    const reminderTopic = isReminderItem(item)
      ? [...topics.values()].find((topic) => isRecreatedReminderMatch(item, topic))
      : undefined
    const key = learnedTopicKey ?? transaction?.key ?? eventTopic?.key ?? reminderTopic?.key ?? attentionTopicKey(item)
    const topic = topics.get(key)
    if (topic) {
      topic.items.push(item)
      topic.itemIds.push(item.id)
      if (isPrepItem(item)) topic.prepItemIds.push(item.id)
      if (item.source_type && !topic.sourceTypes.includes(item.source_type)) {
        topic.sourceTypes.push(item.source_type)
      }
      if (transaction
        ? isNewerTransactionUpdate(item, topic.item, transaction.stage, topic.transactionStage)
        : isHigherPriority(item, topic.item)) {
        topic.item = item
        topic.transactionStage = transaction?.stage ?? null
      }
    } else {
      topics.set(key, {
        key,
        item,
        items: [item],
        itemIds: [item.id],
        prepItemIds: isPrepItem(item) ? [item.id] : [],
        sourceTypes: item.source_type ? [item.source_type] : [],
        transactionVendor: transaction?.vendor ?? null,
        transactionStage: transaction?.stage ?? null,
      })
    }
  }
  return [...topics.values()]
}
