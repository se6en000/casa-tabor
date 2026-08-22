import type { PrepItem, DeliveryTransitItem, DeliveryTransitStage } from '../types'
import {
  format,
  isBefore,
  startOfDay,
  isSameDay,
  differenceInCalendarDays,
} from 'date-fns'

export interface VendorTransactionIdentity {
  key: string
  vendor: string
  stage: DeliveryTransitStage | null
}

const VENDOR_ALIASES = [
  { vendor: 'Walmart', aliases: ['walmart.com', 'walmart+', 'walmart', 'inhome'] },
  { vendor: 'Amazon', aliases: ['amazon.com', 'amazon', 'prime'] },
  { vendor: 'Jiffy.com', aliases: ['jiffy.com', 'jiffy transfers', 'jiffy shirts', 'jiffy'] },
  { vendor: 'HelloFresh', aliases: ['hellofresh', 'hello fresh'] },
  { vendor: 'Target', aliases: ['target.com', 'target'] },
  { vendor: 'Instacart', aliases: ['instacart'] },
  { vendor: 'DoorDash', aliases: ['doordash'] },
  { vendor: 'Uber Eats', aliases: ['uber eats', 'ubereats'] },
  { vendor: 'FedEx', aliases: ['fedex'] },
  { vendor: 'UPS', aliases: ['ups'] },
  { vendor: 'USPS', aliases: ['usps', 'postal service'] },
  { vendor: 'Nike', aliases: ['nike.com', 'nike'] },
  { vendor: 'Apple', aliases: ['apple.com', 'apple store'] },
  { vendor: 'Etsy', aliases: ['etsy.com', 'etsy'] },
  { vendor: 'Sephora', aliases: ['sephora.com', 'sephora'] },
  { vendor: 'Nordstrom', aliases: ['nordstrom.com', 'nordstrom'] },
  { vendor: 'Pottery Barn', aliases: ['potterybarn.com', 'pottery barn'] },
  { vendor: 'Williams Sonoma', aliases: ['williams-sonoma.com', 'williams sonoma'] },
  { vendor: 'Chewy', aliases: ['chewy.com', 'chewy'] },
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

  // Explicit numeric Order Number: e.g. "Order #2541442349", "Order #20001519169311", "Order number: 987654321", "#2000151-91693117", "(Order #2541442349)"
  const explicitOrderMatch = text.match(/\b(?:order|cart)\s*(?:number|no\.?|id|#)\s*[:#]?\s*#?([a-z0-9-]*\d{4,}[a-z0-9-]*)\b/i)
  if (explicitOrderMatch) return explicitOrderMatch[1]

  // Direct standalone order hashtag e.g. "#2541442349"
  const directHashMatch = text.match(/#(\d{6,})\b/)
  if (directHashMatch) return directHashMatch[1]

  // Tracking numbers (UPS, FedEx, USPS)
  const upsMatch = text.match(/\b1Z[0-9A-Z]{16}\b/i)
  if (upsMatch) return upsMatch[0].toUpperCase()

  const uspsMatch = text.match(/\b9[2345]\d{20,24}\b/)
  if (uspsMatch) return uspsMatch[0]

  return null
}

export function transactionStage(item: PrepItem): DeliveryTransitStage | null {
  const desc = (item.description ?? '').toLowerCase()
  const title = (item.event_title ?? '').toLowerCase()
  const combined = `${title} ${desc}`.toLowerCase()

  // Policy disclaimer check: e.g. "Claims for missing, wrong, or damaged items must be made within 3 days..."
  const isClaimPolicyDisclaimer = /\b(?:claims? for (?:missing|wrong|damaged|lost)|claims? must be made within|return (?:window|policy)|in case of missing)\b/i.test(combined)

  // 1. Problem / Cancellation exceptions (ignoring standard policy disclaimers unless an actual exception occurred)
  if (item.type === 'cancellation') return 'problem'
  if (!isClaimPolicyDisclaimer && /\b(cancelled|canceled|failed|problem|issue|missing|damaged|exception)\b/.test(combined)) return 'problem'
  if (isClaimPolicyDisclaimer && /\b(package was (?:damaged|lost)|item is damaged|reported damaged|delivery failed)\b/.test(combined)) return 'problem'

  // 2. Pure Payment notifications (where type === 'payment' or description is purely about payment/charge)
  const isPurePayment = item.type === 'payment' || (
    /\b(payment method|temporary hold|charged for|final charge|receipt for payment|order amount)\b/.test(desc) &&
    !/\b(has been delivered|was delivered|out for delivery|shipped)\b/.test(desc)
  )
  if (isPurePayment) return 'payment'

  // 3. Tense-Aware Delivery Detection:
  // Distinguish between actual completed deliveries vs future delivery notices (e.g. "will be delivered on Monday", "is arriving on Monday")
  const isFutureDeliveryNotice = /\b(?:will be delivered|scheduled (?:to be|for) deliver(?:y|ed)|estimated (?:to be )?delivered|expected (?:to be )?delivered|to be delivered|arriving on|arriving monday|arriving tuesday|arriving wednesday|arriving thursday|arriving friday|arriving saturday|arriving sunday)\b/i.test(combined)
  const isExplicitDelivered = !isFutureDeliveryNotice && /\b(?:has been delivered|was delivered|package delivered|delivered at|delivered to (?:front|porch|door|garage|mailbox|reception)|proof of delivery|delivered on \w+, \w+ \d+ at \d+:\d+)\b/i.test(combined)

  if (isExplicitDelivered) return 'delivered'
  if (item.attention_stage === 'delivered' && !isFutureDeliveryNotice) return 'delivered'

  // 4. Out for delivery (Day of delivery)
  if (/\bout for delivery\b|\barriving today\b|\ben route\b|\bdelivery window\b|\binhome delivery\b/.test(combined)) return 'out_for_delivery'
  if (item.attention_stage === 'out_for_delivery') return 'out_for_delivery'

  // 5. Shipped / In transit
  if (/\bshipped\b|\bpackage on the way\b|\btransit\b|\bdispatched\b|\bcarrier tracking\b|\bshipment for\b/.test(combined)) return 'shipped'
  if (item.attention_stage === 'shipped') return 'shipped'

  // 6. Confirmed / Order Placed / Future Delivery notice
  if (isFutureDeliveryNotice) return 'confirmed'
  if (item.attention_stage === 'confirmed') return 'confirmed'
  if (/\b(confirmed|scheduled|placed|order received|order confirmation|thank you for your order|delivery of)\b/.test(combined)) return 'confirmed'

  // 7. General payment fallback
  if (/\b(payment|charged|temporary hold)\b/.test(combined)) return 'payment'
  if (item.attention_stage === 'payment') return 'payment'

  return item.attention_stage && isDeliveryTransitStage(item.attention_stage) ? (item.attention_stage as DeliveryTransitStage) : null
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
    if (/jiffy/i.test(raw)) return 'Jiffy.com'
    if (/target/i.test(raw)) return 'Target'
    if (/hello\s*fresh/i.test(raw)) return 'HelloFresh'
    if (/instacart/i.test(raw)) return 'Instacart'
    if (/fedex/i.test(raw)) return 'FedEx'
    if (/ups/i.test(raw)) return 'UPS'
    if (/usps/i.test(raw)) return 'USPS'
    if (/nike/i.test(raw)) return 'Nike'
    if (/apple/i.test(raw)) return 'Apple'
    return raw
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

function extractOrderIdFromExplicitKey(explicitKey?: string | null): string | null {
  if (!explicitKey) return null
  const match = explicitKey.match(/^transaction:[a-z0-9.-]+:([a-z0-9.-]*\d{4,}[a-z0-9.-]*)$/i)
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
  const mergedPolicy = incoming.policyDisclaimer || existing.policyDisclaimer || null

  const newerDate =
    new Date(incoming.occurredAt).getTime() >= new Date(existing.occurredAt).getTime()
      ? incoming.occurredAt
      : existing.occurredAt

  // Aggregate and deduplicate update history
  const combinedHistory = [
    ...(existing.updateHistory || [
      {
        id: existing.id,
        title: existing.title,
        description: existing.rawItem?.description,
        stage: existing.stage,
        occurredAt: existing.occurredAt,
        sourceRef: existing.rawItem?.source_ref,
        rawItem: existing.rawItem,
      },
    ]),
    ...(incoming.updateHistory || [
      {
        id: incoming.id,
        title: incoming.title,
        description: incoming.rawItem?.description,
        stage: incoming.stage,
        occurredAt: incoming.occurredAt,
        sourceRef: incoming.rawItem?.source_ref,
        rawItem: incoming.rawItem,
      },
    ]),
  ]

  const seenIds = new Set<string>()
  const uniqueHistory = combinedHistory
    .filter((h) => {
      if (seenIds.has(h.id)) return false
      seenIds.add(h.id)
      return true
    })
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())

  return {
    ...existing,
    stage: higherStage,
    cost: mergedCost,
    itemSummary: mergedSummary,
    etaDisplay: mergedEta,
    isPerishable: existing.isPerishable || incoming.isPerishable,
    occurredAt: newerDate,
    policyDisclaimer: mergedPolicy,
    updateHistory: uniqueHistory,
  }
}

export function consolidateTransitItems(items: DeliveryTransitItem[]): DeliveryTransitItem[] {
  const transitMap = new Map<string, DeliveryTransitItem>()

  for (const item of items) {
    const existing = transitMap.get(item.threadKey)
    if (!existing) {
      transitMap.set(item.threadKey, item)
    } else {
      transitMap.set(item.threadKey, mergeDeliveryTransitItem(existing, item))
    }
  }

  // Second pass: Merge generic delivery:${vendor}:${date} items into specific transaction:${vendor}:${orderId} on that same date
  const consolidated = Array.from(transitMap.values())
  const finalMap = new Map<string, DeliveryTransitItem>()

  for (const item of consolidated) {
    const isGenericDateKey = /^delivery:[a-z0-9-]+:\d{4}-\d{2}-\d{2}$/.test(item.threadKey)
    if (isGenericDateKey) {
      const vendorKey = normalizeKeyPart(item.vendor)
      const dateKey = deliveryDateKey(item.rawItem)
      // Check if there is an explicit order transaction for this vendor on this date
      const matchingExplicit = consolidated.find(
        (other) =>
          other !== item &&
          normalizeKeyPart(other.vendor) === vendorKey &&
          deliveryDateKey(other.rawItem) === dateKey &&
          !/^delivery:[a-z0-9-]+:\d{4}-\d{2}-\d{2}$/.test(other.threadKey)
      )

      if (matchingExplicit) {
        const existingInFinal = finalMap.get(matchingExplicit.threadKey) || matchingExplicit
        finalMap.set(matchingExplicit.threadKey, mergeDeliveryTransitItem(existingInFinal, item))
        continue
      }
    }

    const existing = finalMap.get(item.threadKey)
    if (!existing) {
      finalMap.set(item.threadKey, item)
    } else {
      finalMap.set(item.threadKey, mergeDeliveryTransitItem(existing, item))
    }
  }

  return Array.from(finalMap.values()).sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  )
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
  if (/\b(inhome delivery|delivery window|grocery delivery|package delivery|courier delivery|out for delivery|shipped|en route|shipment for)\b/.test(text)) {
    return true
  }

  const vendor = resolveVendorName(item)
  const hasOrderNumber = Boolean(orderId(item))

  // Return/claim policy disclaimers & shipping notices on orders
  const isOrderPolicyOrClaimNotice = /\b(?:claims? for (?:missing|wrong|damaged|lost)|claims? must be made within|return window|return (?:by|eligible)|final delivery|shipment for)\b/i.test(text)
  if (isOrderPolicyOrClaimNotice && (vendor !== 'Parcel' || hasOrderNumber)) {
    return true
  }

  // Vendor payment/pricing/charge notifications (e.g. "final charge for your Walmart order", "temporary hold is $138.65")
  if (vendor !== 'Parcel' && (
    item.type === 'payment' ||
    /\b(charge|hold|total|receipt|order amount|temporary hold|final charge|order total|charged)\b/i.test(text)
  )) {
    return true
  }

  const stage = transactionStage(item)
  if (stage === 'shipped' || stage === 'out_for_delivery' || stage === 'delivered') return true
  if ((vendor !== 'Parcel' || hasOrderNumber) && (
    item.type === 'delivery' ||
    item.attention_stage === 'confirmed' ||
    item.attention_stage === 'shipped' ||
    item.attention_stage === 'out_for_delivery' ||
    item.attention_stage === 'delivered' ||
    stage === 'confirmed' ||
    stage === 'problem'
  )) {
    return true
  }
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

export function resolveDeliveryDate(item: PrepItem): Date | null {
  if (item.due_by) {
    const d = new Date(item.due_by)
    if (!isNaN(d.getTime())) return d
  }
  if (item.event_date) {
    const d = new Date(item.event_date)
    if (!isNaN(d.getTime())) return d
  }
  if (item.created_at) {
    const d = new Date(item.created_at)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

export function resolveEffectiveStage(
  rawStage: DeliveryTransitStage,
  deliveryDate: Date | null,
  now?: Date
): DeliveryTransitStage {
  if (rawStage === 'problem') {
    return rawStage
  }
  if (!deliveryDate || !now) {
    return rawStage
  }

  const todayStart = startOfDay(now)
  const deliveryStart = startOfDay(deliveryDate)

  // 1. Future Date Guardrail:
  // If the delivery target date is strictly in the future (e.g. Monday Aug 24 when today is Saturday Aug 22),
  // this order is still in progress and CANNOT be marked as 'delivered'.
  if (isBefore(todayStart, deliveryStart)) {
    if (rawStage === 'delivered') {
      return 'confirmed'
    }
    return rawStage
  }

  // 2. Past Courier / Same-Day Auto-Resolution:
  // If the delivery target date is strictly in the past (before today's start-of-day in local time)
  // and it was marked out for delivery, shipped, or confirmed without issues,
  // same-day and courier deliveries have completed.
  if (isBefore(deliveryStart, todayStart)) {
    if (rawStage === 'out_for_delivery' || rawStage === 'shipped' || rawStage === 'confirmed' || rawStage === 'payment') {
      return 'delivered'
    }
  }

  return rawStage
}

export function formatDeliveryEta(
  rawEta: string | null,
  deliveryDate: Date | null,
  stage: DeliveryTransitStage,
  now?: Date
): string | null {
  if (stage === 'problem') {
    return 'Delivery exception'
  }

  if (stage === 'delivered') {
    if (!deliveryDate) return 'Delivered'
    if (now) {
      const diff = differenceInCalendarDays(deliveryDate, now)
      if (diff === 0) return 'Delivered today'
      if (diff === -1) return 'Delivered yesterday'
      if (diff < -1) return `Delivered ${format(deliveryDate, 'MMM d')}`
    }
    return `Delivered ${format(deliveryDate, 'MMM d')}`
  }

  if (!deliveryDate) {
    return rawEta || null
  }

  if (now) {
    const diff = differenceInCalendarDays(deliveryDate, now)
    if (diff === 0) {
      return rawEta || 'Today'
    }
    if (diff === 1) {
      return rawEta ? `Tomorrow (${rawEta})` : 'Tomorrow'
    }
    if (diff > 1) {
      return format(deliveryDate, 'EEE, MMM d')
    }
    if (isBefore(deliveryDate, startOfDay(now))) {
      return `Delivered ${format(deliveryDate, 'MMM d')}`
    }
  }

  return rawEta || format(deliveryDate, 'EEE, MMM d')
}

export function isItemArrivingToday(item: DeliveryTransitItem, now: Date): boolean {
  const targetDate = resolveDeliveryDate(item.rawItem)
  const effectiveStage = resolveEffectiveStage(item.stage, targetDate, now)
  if (effectiveStage === 'delivered' || effectiveStage === 'problem') return false
  if (!targetDate) return false
  return isSameDay(targetDate, now)
}

export function isItemScheduledLater(item: DeliveryTransitItem, now: Date): boolean {
  const targetDate = resolveDeliveryDate(item.rawItem)
  const effectiveStage = resolveEffectiveStage(item.stage, targetDate, now)
  if (effectiveStage === 'delivered' || effectiveStage === 'problem') return false
  if (!targetDate) return false
  return isBefore(startOfDay(now), startOfDay(targetDate))
}

export function isItemInTransit(item: DeliveryTransitItem, now?: Date): boolean {
  const targetDate = resolveDeliveryDate(item.rawItem)
  const effectiveStage = resolveEffectiveStage(item.stage, targetDate, now)
  return effectiveStage === 'shipped' || effectiveStage === 'out_for_delivery' || effectiveStage === 'confirmed' || effectiveStage === 'payment'
}

export function isItemDelivered(item: DeliveryTransitItem, now?: Date): boolean {
  const targetDate = resolveDeliveryDate(item.rawItem)
  const effectiveStage = resolveEffectiveStage(item.stage, targetDate, now)
  return effectiveStage === 'delivered'
}

export function buildDeliveryTransitItem(item: PrepItem, now?: Date): DeliveryTransitItem {
  const transaction = vendorTransactionIdentity(item)
  const vendor = transaction?.vendor || resolveVendorName(item)
  const rawStage = transaction?.stage || transactionStage(item) || 'shipped'
  const isPerish = isPerishableDelivery(item)
  const targetDate = resolveDeliveryDate(item)
  const effectiveStage = resolveEffectiveStage(rawStage, targetDate, now)

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
  const etaMatch = fullText.match(/(?:(?:arrive|expected|arriving|delivery)\s+(?:today\s+)?by\s+[\d:apm\s–-]+|today\s+by\s+[\d:apm]+|(?:delivery\s+)?window\s+(?:is\s+)?[\d:apm\s–-]+|between\s+[\d:apm\s–-]+|today\s+between\s+[\d:apm\s–-]+|expected\s+today|(?:expected\s+to\s+arrive|arriving|expected|arrive)\s+(?:on\s+)?[A-Za-z]+,?\s+[A-Za-z]+\s+\d+)/i)
  const rawEta = etaMatch ? etaMatch[0].trim() : (targetDate ? format(targetDate, 'EEE, MMM d') : (item.due_by ? new Date(item.due_by).toLocaleDateString() : null))
  const etaDisplay = now ? formatDeliveryEta(rawEta, targetDate, effectiveStage, now) : (rawEta || (targetDate ? format(targetDate, 'EEE, MMM d') : null))

  // Extract return/claim policy disclaimer if present
  const policyMatch = fullText.match(/(?:claims? for (?:missing|wrong|damaged|lost)[^.]*|claims? must be made within[^.]*|return window[^.]*|return eligible[^.]*)/i)
  const policyDisclaimer = item.policy_disclaimer || (policyMatch ? policyMatch[0].trim() : null)

  const initialHistory = [
    {
      id: item.id,
      title: item.event_title || `${vendor} Delivery`,
      description: item.description,
      stage: effectiveStage,
      occurredAt: item.created_at,
      sourceRef: item.source_ref,
      rawItem: item,
    },
  ]

  return {
    id: item.id,
    threadKey: transaction?.key || `delivery:${normalizeKeyPart(vendor)}:${deliveryDateKey(item)}`,
    vendor,
    title: item.event_title || `${vendor} Delivery`,
    itemSummary,
    stage: effectiveStage,
    cost,
    isPerishable: isPerish,
    etaDisplay,
    occurredAt: item.created_at,
    rawItem: item,
    policyDisclaimer,
    updateHistory: initialHistory,
  }
}
