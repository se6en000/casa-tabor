import type { PrepItem, DeliveryTransitItem, DeliveryTransitStage } from '../types'

export interface VendorTransactionIdentity {
  key: string
  vendor: string
  stage: DeliveryTransitStage | null
}

const VENDOR_ALIASES = [
  { vendor: 'Walmart', aliases: ['walmart.com', 'walmart+', 'walmart', 'inhome'] },
  { vendor: 'Amazon', aliases: ['amazon.com', 'amazon', 'prime'] },
  { vendor: 'HelloFresh', aliases: ['hellofresh', 'hello fresh'] },
  { vendor: 'Target', aliases: ['target.com', 'target'] },
  { vendor: 'Instacart', aliases: ['instacart'] },
  { vendor: 'DoorDash', aliases: ['doordash'] },
  { vendor: 'Uber Eats', aliases: ['uber eats', 'ubereats'] },
  { vendor: 'FedEx', aliases: ['fedex'] },
  { vendor: 'UPS', aliases: ['ups'] },
  { vendor: 'USPS', aliases: ['usps', 'postal service'] },
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

function transactionDescriptor(item: PrepItem) {
  const text = `${item.event_title ?? ''} ${item.description}`
  const descriptor = text.match(
    /(?:delivered:\s*|delivery of\s+)([a-z0-9][a-z0-9™+ .'-]{2,100}?\+\s*\d+\s*items?)/i,
  )?.[1]
  return descriptor ? normalizeKeyPart(descriptor) : null
}

export function transactionStage(item: PrepItem): DeliveryTransitStage | null {
  if (item.attention_stage && isDeliveryTransitStage(item.attention_stage)) {
    return item.attention_stage as DeliveryTransitStage
  }
  if (item.type === 'payment') return 'payment'
  if (item.type === 'cancellation') return 'problem'
  const text = `${item.event_title ?? ''} ${item.description}`.toLowerCase()
  if (/\b(cancelled|canceled|failed|problem|issue|missing|damaged)\b/.test(text)) return 'problem'
  if (/\bdelivered\b/.test(text)) return 'delivered'
  if (/\bout for delivery\b|\barriving today\b|\ben route\b/.test(text)) return 'out_for_delivery'
  if (/\bshipped\b|\bpackage on the way\b|\btransit\b/.test(text)) return 'shipped'
  if (/\b(payment|charged|temporary hold)\b/.test(text)) return 'payment'
  if (/\b(confirmed|scheduled|placed|order received)\b/.test(text)) return 'confirmed'
  return null
}

function isDeliveryTransitStage(stage: string): stage is DeliveryTransitStage {
  return ['confirmed', 'payment', 'shipped', 'out_for_delivery', 'delivered', 'problem'].includes(stage)
}

export function vendorTransactionIdentity(item: PrepItem): VendorTransactionIdentity | null {
  if (item.source_type !== 'gmail') return null

  const vendor = item.attention_vendor?.trim() || legacyVendor(item)
  if (!vendor) return null

  const explicitKey = item.attention_thread_key?.trim()
  const explicitMessageFallback = explicitKey?.includes(':message:') ? explicitKey : null
  const extractedOrderId = orderId(item)
  const descriptor = transactionDescriptor(item)
  const key = (explicitKey && !explicitMessageFallback ? explicitKey : null)
    || (extractedOrderId
      ? `transaction:${normalizeKeyPart(vendor)}:${normalizeKeyPart(extractedOrderId)}`
      : descriptor
        ? `transaction:${normalizeKeyPart(vendor)}:items:${descriptor}`
        : explicitMessageFallback || item.source_ref
          ? explicitMessageFallback ?? `transaction:${normalizeKeyPart(vendor)}:message:${item.source_ref}`
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

  const stageRank: DeliveryTransitStage[] = ['confirmed', 'payment', 'shipped', 'out_for_delivery', 'delivered', 'problem']
  return stageRank.indexOf(itemStage as DeliveryTransitStage ?? 'confirmed') > stageRank.indexOf(currentStage as DeliveryTransitStage ?? 'confirmed')
}

export function isDeliveryTransitItem(item: PrepItem): boolean {
  if (item.type === 'delivery') return true
  const stage = transactionStage(item)
  if (stage === 'shipped' || stage === 'out_for_delivery' || stage === 'delivered') return true
  const vendor = item.attention_vendor || legacyVendor(item)
  if (vendor && (item.type === 'delivery' || item.attention_stage === 'confirmed' || item.attention_stage === 'shipped')) return true
  return false
}

export function isPerishableDelivery(item: PrepItem): boolean {
  const text = `${item.event_title ?? ''} ${item.description}`.toLowerCase()
  return (
    text.includes('inhome') ||
    text.includes('hellofresh') ||
    text.includes('instacart') ||
    text.includes('perishable') ||
    text.includes('refrigerat') ||
    text.includes('fresh') ||
    text.includes('grocer') ||
    text.includes('produce')
  )
}

export function stageStepIndex(stage: DeliveryTransitStage | null): number {
  switch (stage) {
    case 'confirmed':
    case 'payment':
      return 0
    case 'shipped':
      return 1
    case 'out_for_delivery':
      return 2
    case 'delivered':
      return 3
    case 'problem':
      return -1
    default:
      return 0
  }
}

export function buildDeliveryTransitItem(item: PrepItem): DeliveryTransitItem {
  const transaction = vendorTransactionIdentity(item)
  const vendor = transaction?.vendor || item.attention_vendor || legacyVendor(item) || 'Parcel'
  const stage = transaction?.stage || transactionStage(item) || 'shipped'
  const isPerish = isPerishableDelivery(item)

  // Extract clean summary
  const desc = item.description || ''
  const itemMatch = desc.match(/(\d+\s+items?|[A-Za-z0-9\s™+'-]{3,40}(?:Book|Tools|Kit|Packs?|Order|Box))/i)
  const itemSummary = itemMatch ? itemMatch[0].trim() : (isPerish ? 'Grocery Delivery' : 'Package')

  // Extract ETA or time window
  const etaMatch = desc.match(/(?:between\s+[\d:apm\s-]+|today\s+by\s+[\d:apm]+|today\s+between\s+[\d:apm\s-]+|expected\s+today)/i)
  const etaDisplay = etaMatch ? etaMatch[0] : (item.due_by ? new Date(item.due_by).toLocaleDateString() : null)

  return {
    id: item.id,
    threadKey: transaction?.key || item.id,
    vendor,
    title: item.event_title || `${vendor} Delivery`,
    itemSummary,
    stage,
    isPerishable: isPerish,
    etaDisplay,
    occurredAt: item.created_at,
    rawItem: item,
  }
}
