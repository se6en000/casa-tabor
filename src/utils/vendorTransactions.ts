import type { PrepItem } from '../types'

export interface VendorTransactionIdentity {
  key: string
  vendor: string
  stage: string | null
}

const VENDOR_ALIASES = [
  { vendor: 'Walmart', aliases: ['walmart.com', 'walmart+', 'walmart', 'inhome'] },
  { vendor: 'Amazon', aliases: ['amazon.com', 'amazon'] },
  { vendor: 'Target', aliases: ['target.com', 'target'] },
  { vendor: 'Instacart', aliases: ['instacart'] },
  { vendor: 'DoorDash', aliases: ['doordash'] },
  { vendor: 'Uber Eats', aliases: ['uber eats'] },
] as const

function normalizeKeyPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function legacyVendor(item: PrepItem) {
  const text = `${item.event_title ?? ''} ${item.description}`.toLowerCase()
  return VENDOR_ALIASES.find(({ aliases }) => aliases.some((alias) => text.includes(alias)))?.vendor ?? null
}

function orderId(item: PrepItem) {
  const text = `${item.event_title ?? ''} ${item.description}`
  return text.match(/\border\s*(?:number|no\.?)?\s*#?\s*([a-z0-9][a-z0-9-]{5,})\b/i)?.[1] ?? null
}

function transactionStage(item: PrepItem) {
  if (item.attention_stage) return item.attention_stage
  if (item.type === 'payment') return 'payment'
  if (item.type === 'cancellation') return 'problem'
  const text = `${item.event_title ?? ''} ${item.description}`.toLowerCase()
  if (/\b(cancelled|canceled|failed|problem|issue|missing|damaged)\b/.test(text)) return 'problem'
  if (/\bdelivered\b/.test(text)) return 'delivered'
  if (/\bout for delivery\b/.test(text)) return 'out_for_delivery'
  if (/\bshipped\b/.test(text)) return 'shipped'
  if (/\b(payment|charged|temporary hold)\b/.test(text)) return 'payment'
  if (/\b(confirmed|scheduled|placed)\b/.test(text)) return 'confirmed'
  return null
}

export function vendorTransactionIdentity(item: PrepItem): VendorTransactionIdentity | null {
  if (item.source_type !== 'gmail') return null

  const vendor = item.attention_vendor?.trim() || legacyVendor(item)
  if (!vendor) return null

  const explicitKey = item.attention_thread_key?.trim()
  const extractedOrderId = orderId(item)
  const key = explicitKey
    || (extractedOrderId
      ? `transaction:${normalizeKeyPart(vendor)}:${normalizeKeyPart(extractedOrderId)}`
      : item.source_ref
        ? `transaction:${normalizeKeyPart(vendor)}:message:${item.source_ref}`
        : null)

  return key ? { key, vendor, stage: transactionStage(item) } : null
}

export function isNewerTransactionUpdate(
  item: PrepItem,
  current: PrepItem,
  itemStage: string | null,
  currentStage: string | null,
) {
  const itemCreated = Date.parse(item.created_at)
  const currentCreated = Date.parse(current.created_at)
  if (Number.isFinite(itemCreated) && Number.isFinite(currentCreated) && itemCreated !== currentCreated) {
    return itemCreated > currentCreated
  }

  const stageRank = ['confirmed', 'payment', 'shipped', 'out_for_delivery', 'delivered', 'problem']
  return stageRank.indexOf(itemStage ?? '') > stageRank.indexOf(currentStage ?? '')
}
