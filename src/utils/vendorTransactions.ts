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
  const match = text.match(/\border\s*(?:number|no\.?|id)?\s*[:#]?\s*#?([a-z0-9-]*\d[a-z0-9-]{3,})\b/i)
  return match ? match[1] : null
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
  if (/\bout for delivery\b|\barriving today\b|\ben route\b|\bdelivery window\b|\binhome delivery\b/.test(text)) return 'out_for_delivery'
  if (/\bshipped\b|\bpackage on the way\b|\btransit\b/.test(text)) return 'shipped'
  if (/\b(payment|charged|temporary hold)\b/.test(text)) return 'payment'
  if (/\b(confirmed|scheduled|placed|order received|delivery of)\b/.test(text)) return 'confirmed'
  return null
}

function isDeliveryTransitStage(stage: string): stage is DeliveryTransitStage {
  return ['confirmed', 'payment', 'shipped', 'out_for_delivery', 'delivered', 'problem'].includes(stage)
}

function isAddressLike(text?: string | null): boolean {
  if (!text) return false
  const trimmed = text.trim()
  return (
    /^\d+\s+[A-Za-z]/i.test(trimmed) ||
    /\b(Rd|Road|St|Street|Ave|Avenue|Dr|Drive|Blvd|Boulevard|Ln|Lane|Way|Ct|Court|Pl|Place|FL|Florida|\d{5})\b/i.test(trimmed)
  )
}

function resolveVendorName(item: PrepItem): string {
  const legacy = legacyVendor(item)
  if (legacy) return legacy
  if (item.attention_vendor && !isAddressLike(item.attention_vendor)) {
    return item.attention_vendor.trim()
  }
  return 'Parcel'
}

function deliveryDateKey(item: PrepItem): string {
  if (item.due_by) {
    return item.due_by.slice(0, 10)
  }
  if (item.event_date) {
    return item.event_date.slice(0, 10)
  }
  if (item.created_at) {
    return item.created_at.slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

export function vendorTransactionIdentity(item: PrepItem): VendorTransactionIdentity | null {
  if (item.source_type !== 'gmail') return null

  const vendor = resolveVendorName(item)
  if (vendor === 'Parcel') return null

  const vendorKey = normalizeKeyPart(vendor)
  const explicitKey = item.attention_thread_key?.trim()
  const explicitMessageFallback = explicitKey?.includes(':message:') || explicitKey?.includes('suggestion:') ? explicitKey : null
  const extractedOrderId = orderId(item)
  const descriptor = transactionDescriptor(item)
  const dateKey = deliveryDateKey(item)

  // A canonical transaction key has an actual numeric order ID (e.g. transaction:walmart:2000151-91693117)
  const isCanonicalOrderKey = Boolean(
    explicitKey &&
    !explicitMessageFallback &&
    /^transaction:[a-z0-9-]+:[a-z0-9-]*\d[a-z0-9-]*$/i.test(explicitKey)
  )

  const key =
    (isCanonicalOrderKey ? explicitKey : null)
    || (extractedOrderId
      ? `transaction:${vendorKey}:${normalizeKeyPart(extractedOrderId)}`
      : descriptor
        ? `transaction:${vendorKey}:items:${descriptor}`
        : `delivery:${vendorKey}:${dateKey}`)

  return { key, vendor, stage: transactionStage(item) }
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

function extractAmount(text?: string | null): string | null {
  if (!text) return null
  const match = text.match(/\$[\d,]+(?:\.\d{2})?/)
  return match ? match[0] : null
}

export function isDeliveryTransitItem(item: PrepItem): boolean {
  if (item.type === 'delivery') return true
  if (isPerishableDelivery(item)) return true
  const text = `${item.event_title ?? ''} ${item.description}`.toLowerCase()
  if (/\b(inhome delivery|delivery window|grocery delivery|package delivery|courier delivery|out for delivery|shipped|en route)\b/.test(text)) {
    return true
  }
  const vendor = resolveVendorName(item)
  // Vendor payment/pricing/charge notifications (e.g. "final charge for your Walmart order", "temporary hold is $138.65")
  if (vendor !== 'Parcel' && (
    item.type === 'payment' ||
    /\b(charge|hold|total|receipt|order amount|temporary hold|final charge|order total|charged)\b/i.test(text)
  )) {
    return true
  }
  const stage = transactionStage(item)
  if (stage === 'shipped' || stage === 'out_for_delivery' || stage === 'delivered') return true
  if (vendor !== 'Parcel' && (item.type === 'delivery' || item.attention_stage === 'confirmed' || item.attention_stage === 'shipped')) return true
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
  const vendor = transaction?.vendor || resolveVendorName(item)
  const stage = transaction?.stage || transactionStage(item) || 'shipped'
  const isPerish = isPerishableDelivery(item)

  // Extract clean summary
  const desc = item.description || ''
  const itemMatch = desc.match(/(?:delivered:\s*|delivery of\s+)([A-Za-z0-9\s™+'-]{2,60}?\+\s*\d+\s*items?)/i)
    || desc.match(/(\d+\s+items?\s+including\s+[A-Za-z0-9\s™+'-]{3,40})/i)
    || desc.match(/(Delivery of InHome order)/i)
    || desc.match(/(\d+\s+items?|[A-Za-z0-9\s™+'-]{3,40}(?:Book|Tools|Kit|Packs?|Order|Box))/i)

  const itemSummary = itemMatch ? itemMatch[1] || itemMatch[0].trim() : (isPerish ? 'Grocery Delivery' : 'Package')

  // Extract cost / amount
  const cost = extractAmount(desc) || (item.event_title ? extractAmount(item.event_title) : null)

  // Extract ETA or time window
  const etaMatch = desc.match(/(?:(?:delivery\s+)?window\s+(?:is\s+)?[\d:apm\s–-]+|between\s+[\d:apm\s–-]+|today\s+by\s+[\d:apm]+|today\s+between\s+[\d:apm\s–-]+|expected\s+today)/i)
  const etaDisplay = etaMatch ? etaMatch[0].trim() : (item.due_by ? new Date(item.due_by).toLocaleDateString() : null)

  return {
    id: item.id,
    threadKey: transaction?.key || `delivery:${normalizeKeyPart(vendor)}:${deliveryDateKey(item)}`,
    vendor,
    title: item.event_title || `${vendor} Delivery`,
    itemSummary,
    stage,
    cost,
    isPerishable: isPerish,
    etaDisplay,
    occurredAt: item.created_at,
    rawItem: item,
  }
}
