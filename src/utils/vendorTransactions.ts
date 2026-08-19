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

function orderId(item: PrepItem): string | null {
  const text = `${item.event_title ?? ''} ${item.description}`

  // Amazon order format: 123-1234567-1234567
  const amazonMatch = text.match(/\b\d{3}-\d{7}-\d{7}\b/)
  if (amazonMatch) return amazonMatch[0]

  // Explicit numeric Order Number: e.g. "Order #20001519169311", "Order number: 987654321", "#2000151-91693117"
  const explicitOrderMatch = text.match(/\border\s*(?:number|no\.?|id|#)\s*[:#]?\s*#?([a-z0-9-]*\d{6,}[a-z0-9-]*)\b/i)
  if (explicitOrderMatch) return explicitOrderMatch[1]

  // Tracking numbers (UPS, FedEx, USPS)
  const upsMatch = text.match(/\b1Z[0-9A-Z]{16}\b/i)
  if (upsMatch) return upsMatch[0].toUpperCase()

  const uspsMatch = text.match(/\b9[2345]\d{20,24}\b/)
  if (uspsMatch) return uspsMatch[0]

  return null
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
    const raw = item.attention_vendor.trim()
    if (/walmart/i.test(raw)) return 'Walmart'
    if (/amazon/i.test(raw)) return 'Amazon'
    if (/target/i.test(raw)) return 'Target'
    if (/hello\s*fresh/i.test(raw)) return 'HelloFresh'
    if (/instacart/i.test(raw)) return 'Instacart'
    if (/fedex/i.test(raw)) return 'FedEx'
    if (/ups/i.test(raw)) return 'UPS'
    if (/usps/i.test(raw)) return 'USPS'
    return raw
  }
  return 'Parcel'
}

function deliveryDateKey(item: PrepItem): string {
  const text = `${item.event_title ?? ''} ${item.description}`.toLowerCase()
  if (text.includes('today') || text.includes('arriving today')) {
    return new Date().toISOString().slice(0, 10)
  }
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

function extractOrderIdFromExplicitKey(explicitKey?: string | null): string | null {
  if (!explicitKey) return null
  const match = explicitKey.match(/^transaction:[a-z0-9-]+:([a-z0-9-]*\d{6,}[a-z0-9-]*)$/i)
  return match ? match[1] : null
}

export function vendorTransactionIdentity(item: PrepItem): VendorTransactionIdentity | null {
  if (item.source_type !== 'gmail') return null

  const vendor = resolveVendorName(item)
  if (vendor === 'Parcel') return null

  const vendorKey = normalizeKeyPart(vendor)
  const explicitKey = item.attention_thread_key?.trim()
  const explicitOrderNumber = extractOrderIdFromExplicitKey(explicitKey)
  const extractedOrderId = orderId(item)
  const dateKey = deliveryDateKey(item)

  const finalOrderNumber = explicitOrderNumber || extractedOrderId

  const key = finalOrderNumber
    ? `transaction:${vendorKey}:${normalizeKeyPart(finalOrderNumber)}`
    : `delivery:${vendorKey}:${dateKey}`

  return { key, vendor, stage: transactionStage(item) }
}

export function mergeItemSummary(summaryA?: string | null, summaryB?: string | null): string {
  const isGeneric = (s?: string | null) =>
    !s || /final charge|temporary hold|charge for your|receipt for|your walmart order|package|grocery delivery/i.test(s)

  if (!summaryA && !summaryB) return 'Grocery Delivery'
  if (!summaryA) return summaryB!
  if (!summaryB) return summaryA

  const aIsGeneric = isGeneric(summaryA)
  const bIsGeneric = isGeneric(summaryB)

  if (aIsGeneric && !bIsGeneric) return summaryB
  if (!aIsGeneric && bIsGeneric) return summaryA

  const aHasInHome = /inhome/i.test(summaryA)
  const bHasInHome = /inhome/i.test(summaryB)
  const aHasItems = /\d+\s+items?/i.test(summaryA)
  const bHasItems = /\d+\s+items?/i.test(summaryB)

  if (aHasInHome && bHasItems && !aHasItems) {
    const itemsPart = summaryB.match(/\d+\s+items?(?:\s+including\s+[A-Za-z0-9\s™+'-]{3,40})?/i)?.[0]
    return itemsPart ? `Delivery of InHome order (${itemsPart})` : summaryA
  }
  if (bHasInHome && aHasItems && !bHasItems) {
    const itemsPart = summaryA.match(/\d+\s+items?(?:\s+including\s+[A-Za-z0-9\s™+'-]{3,40})?/i)?.[0]
    return itemsPart ? `Delivery of InHome order (${itemsPart})` : summaryB
  }

  return summaryA.length >= summaryB.length ? summaryA : summaryB
}

export function mergeEtaDisplay(etaA?: string | null, etaB?: string | null): string | null {
  if (!etaA && !etaB) return null
  if (!etaA) return etaB!
  if (!etaB) return etaA

  const isSpecificTime = (s: string) => /\b\d{1,2}:\d{2}(?:am|pm)?\b/i.test(s)
  const isWindow = (s: string) => /\b(?:between|window|2pm\s*–\s*6pm)\b/i.test(s)

  const aIsSpecific = isSpecificTime(etaA)
  const bIsSpecific = isSpecificTime(etaB)
  const aIsWindow = isWindow(etaA)
  const bIsWindow = isWindow(etaB)

  if (aIsSpecific && bIsWindow && !aIsWindow) {
    const timeMatch = etaA.match(/(?:expected\s+)?by\s+\d{1,2}:\d{2}(?:am|pm)?(?:\s+today)?/i)?.[0] || etaA
    return `${timeMatch} · ${etaB}`
  }
  if (bIsSpecific && aIsWindow && !bIsWindow) {
    const timeMatch = etaB.match(/(?:expected\s+)?by\s+\d{1,2}:\d{2}(?:am|pm)?(?:\s+today)?/i)?.[0] || etaB
    return `${timeMatch} · ${etaA}`
  }

  if (aIsSpecific && !bIsSpecific) return etaA
  if (bIsSpecific && !aIsSpecific) return etaB
  if (aIsWindow && !bIsWindow) return etaA
  if (bIsWindow && !aIsWindow) return etaB

  return etaA.length >= etaB.length ? etaA : etaB
}

export function mergeDeliveryTransitItem(
  existing: DeliveryTransitItem,
  incoming: DeliveryTransitItem
): DeliveryTransitItem {
  const stageRank: DeliveryTransitStage[] = ['confirmed', 'payment', 'shipped', 'out_for_delivery', 'delivered', 'problem']
  const existingRank = stageRank.indexOf(existing.stage)
  const incomingRank = stageRank.indexOf(incoming.stage)
  const higherStage = incomingRank > existingRank ? incoming.stage : existing.stage

  const mergedCost = incoming.cost || existing.cost || null
  const mergedSummary = mergeItemSummary(existing.itemSummary, incoming.itemSummary)
  const mergedEta = mergeEtaDisplay(existing.etaDisplay, incoming.etaDisplay)

  const newerDate =
    new Date(incoming.occurredAt).getTime() >= new Date(existing.occurredAt).getTime()
      ? incoming.occurredAt
      : existing.occurredAt

  return {
    ...existing,
    stage: higherStage,
    cost: mergedCost,
    itemSummary: mergedSummary,
    etaDisplay: mergedEta,
    isPerishable: existing.isPerishable || incoming.isPerishable,
    occurredAt: newerDate,
  }
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

  // Extract clean summary from combined title & description
  const fullText = `${item.event_title ?? ''} ${item.description ?? ''}`.trim()
  const itemMatch = fullText.match(/(?:delivered:\s*|delivery of\s+)([A-Za-z0-9\s™+'-]{2,60}?\+\s*\d+\s*items?)/i)
    || fullText.match(/(\d+\s+items?\s+including\s+[A-Za-z0-9\s™+'-]{3,40})/i)
    || fullText.match(/(Delivery of InHome order)/i)
    || fullText.match(/(\d+\s+items?|[A-Za-z0-9\s™+'-]{3,40}(?:Book|Tools|Kit|Packs?|Order|Box))/i)

  const itemSummary = itemMatch ? itemMatch[1] || itemMatch[0].trim() : (isPerish ? 'Grocery Delivery' : 'Package')

  // Extract cost / amount
  const cost = extractAmount(fullText)

  // Extract ETA or time window
  const etaMatch = fullText.match(/(?:(?:arrive|expected|arriving|delivery)\s+(?:today\s+)?by\s+[\d:apm\s–-]+|today\s+by\s+[\d:apm]+|(?:delivery\s+)?window\s+(?:is\s+)?[\d:apm\s–-]+|between\s+[\d:apm\s–-]+|today\s+between\s+[\d:apm\s–-]+|expected\s+today)/i)
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
