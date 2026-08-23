import type { PrepItem, DeliveryTransitItem, DeliveryTransitStage, CanonicalEntityResult } from '../types'
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

export const VENDOR_ALIASES = [
  { vendor: 'Walmart', aliases: ['walmart.com', 'walmart+', 'walmart', 'inhome', 'walmart grocery', 'walmart inhome'] },
  { vendor: 'Amazon', aliases: ['amazon.com', 'amazon', 'prime', 'amazon fresh', 'whole foods'] },
  { vendor: 'Jiffy.com', aliases: ['jiffy.com', 'jiffy transfers', 'jiffy shirts', 'jiffy'] },
  { vendor: 'HelloFresh', aliases: ['hellofresh', 'hello fresh', 'greenchef', 'green chef', 'factor75', 'factor', 'blue apron'] },
  { vendor: 'Target', aliases: ['target.com', 'target', 'shipt', 'target circle'] },
  { vendor: 'Instacart', aliases: ['instacart.com', 'instacart'] },
  { vendor: 'DoorDash', aliases: ['doordash.com', 'doordash'] },
  { vendor: 'Uber Eats', aliases: ['uber eats', 'ubereats.com', 'ubereats'] },
  { vendor: 'FedEx', aliases: ['fedex.com', 'fedex'] },
  { vendor: 'UPS', aliases: ['ups.com', 'ups'] },
  { vendor: 'USPS', aliases: ['usps.com', 'usps', 'postal service'] },
  { vendor: 'DHL', aliases: ['dhl.com', 'dhl express', 'dhl ecommerce', 'dhl'] },
  { vendor: 'Nike', aliases: ['nike.com', 'nike'] },
  { vendor: 'Apple', aliases: ['apple.com', 'apple store', 'apple'] },
  { vendor: 'Etsy', aliases: ['etsy.com', 'etsy'] },
  { vendor: 'Sephora', aliases: ['sephora.com', 'sephora'] },
  { vendor: 'Nordstrom', aliases: ['nordstrom.com', 'nordstrom'] },
  { vendor: 'Pottery Barn', aliases: ['potterybarn.com', 'pottery barn'] },
  { vendor: 'Williams Sonoma', aliases: ['williams-sonoma.com', 'williams sonoma'] },
  { vendor: 'Chewy', aliases: ['chewy.com', 'chewy'] },
] as const

export function normalizeKeyPart(value: string | null | undefined) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function canonicalizeOrderId(vendor: string, rawId: string): string {
  if (!rawId) return ''
  let clean = rawId.trim().replace(/^[#:\s]+/, '')
  clean = clean.replace(/^(?:order|confirmation|reference|invoice|receipt|wm)\s*(?:number|no\.?|id|#|:)\s*[:#]?\s*/i, '')
  const v = vendor.toLowerCase()

  if (v.includes('walmart')) {
    clean = clean.replace(/^WM-?/i, '')
    const digitsOnly = clean.replace(/[^0-9]/g, '')
    if (digitsOnly.length === 15 || digitsOnly.length === 16) {
      return `${digitsOnly.slice(0, 7)}-${digitsOnly.slice(7)}`
    }
    return normalizeKeyPart(clean)
  }

  if (v.includes('amazon')) {
    if (/^D01-/i.test(clean)) {
      return clean.toUpperCase()
    }
    const digitsOnly = clean.replace(/[^0-9]/g, '')
    if (digitsOnly.length === 17) {
      return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 10)}-${digitsOnly.slice(10)}`
    }
    return normalizeKeyPart(clean)
  }

  const appleSanitized = clean.replace(/[\s.-]+/g, '')
  const appleMatch = appleSanitized.match(/W\d{9,10}/i)
  if (v.includes('apple') || appleMatch) {
    return appleMatch ? appleMatch[0].toUpperCase() : appleSanitized.toUpperCase()
  }

  const nikeSanitized = clean.replace(/[\s.]+/g, '')
  const nikeMatch = nikeSanitized.match(/C[0-]\d{9,11}/i)
  if (v.includes('nike') || nikeMatch) {
    const matched = nikeMatch ? nikeMatch[0] : nikeSanitized
    return matched.toUpperCase()
  }

  const mealKitMatch = clean.match(/(?:HF|GC|BA|FACT)-\d{6,10}/i)
  if (mealKitMatch) {
    return mealKitMatch[0].toUpperCase()
  }
  if (v.includes('hellofresh')) {
    if (/^\d{6,10}$/.test(clean)) return `HF-${clean}`
    return clean.toUpperCase()
  }

  if (v.includes('target')) {
    const digits = clean.replace(/[^0-9]/g, '')
    if (digits.length >= 9 && digits.length <= 14) {
      return digits
    }
  }

  if (v.includes('jiffy')) {
    const digits = clean.replace(/[^0-9]/g, '')
    if (digits.length >= 8 && digits.length <= 12) {
      return digits
    }
  }

  return normalizeKeyPart(clean)
}

export function canonicalizeTrackingNumber(carrier: string | null, rawTracking: string): string {
  if (!rawTracking) return ''
  const clean = String(rawTracking).trim().replace(/[\s-]+/g, '')
  const c = String(carrier || '').toLowerCase()

  if (c === 'ups') {
    return clean.toUpperCase()
  }
  if (c === 'fedex') {
    return clean.replace(/[^0-9]/g, '')
  }
  if (c === 'usps') {
    if (/^[A-Za-z]{2}\d{9}[A-Za-z]{2}$/.test(clean)) {
      return clean.toUpperCase()
    }
    return clean.replace(/[^0-9]/g, '')
  }
  if (c === 'dhl') {
    if (/^(?:GM|LX|RX|JD)/i.test(clean)) {
      return clean.toUpperCase()
    }
    return clean.replace(/[^0-9]/g, '')
  }

  return clean.toUpperCase()
}

export function detectCarrierAndTracking(text?: string | null): {
  carrier: 'ups' | 'fedex' | 'usps' | 'dhl' | null
  trackingNumber: string | null
  trackingUrl: string | null
} {
  if (!text) {
    return { carrier: null, trackingNumber: null, trackingUrl: null }
  }

  const str = String(text)

  // 1. UPS (1Z format)
  const upsMatch = str.match(/\b(1Z[0-9A-Za-z]{16})\b/i)
  if (upsMatch) {
    const trackingNumber = canonicalizeTrackingNumber('ups', upsMatch[1])
    return {
      carrier: 'ups',
      trackingNumber,
      trackingUrl: `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`,
    }
  }

  // 2. USPS Domestic routing barcode (20-24 digits starting with 92/93/94/95)
  const uspsMatch = str.match(/\b(9[2345]\d{20,24})\b/)
  if (uspsMatch) {
    const trackingNumber = canonicalizeTrackingNumber('usps', uspsMatch[1])
    return {
      carrier: 'usps',
      trackingNumber,
      trackingUrl: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`,
    }
  }

  // 3. USPS International UPU S10 (13 chars)
  const uspsIntlMatch = str.match(/\b([A-Za-z]{2}\d{9}[A-Za-z]{2})\b/)
  if (uspsIntlMatch) {
    const trackingNumber = canonicalizeTrackingNumber('usps', uspsIntlMatch[1])
    return {
      carrier: 'usps',
      trackingNumber,
      trackingUrl: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`,
    }
  }

  // 4. UPS Mail Innovations
  const upsMiMatch = str.match(/\bups\b[^\d]*(92\d{20,32})\b/i)
  if (upsMiMatch) {
    const trackingNumber = canonicalizeTrackingNumber('ups', upsMiMatch[1])
    return {
      carrier: 'ups',
      trackingNumber,
      trackingUrl: `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`,
    }
  }

  // 5. DHL
  const dhlMatch = str.match(/\b(?:dhl|dhl express)\b[^\d]*(\d{10,11})\b/i)
  if (dhlMatch) {
    const trackingNumber = canonicalizeTrackingNumber('dhl', dhlMatch[1])
    return {
      carrier: 'dhl',
      trackingNumber,
      trackingUrl: `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(trackingNumber)}`,
    }
  }

  const dhlEcommerceMatch = str.match(/\b((?:GM|LX|RX|JD)\d{10,20})\b/i)
  if (dhlEcommerceMatch) {
    const trackingNumber = canonicalizeTrackingNumber('dhl', dhlEcommerceMatch[1])
    return {
      carrier: 'dhl',
      trackingNumber,
      trackingUrl: `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(trackingNumber)}`,
    }
  }

  // 6. FedEx
  const fedexMatch = str.match(/\bfedex\b[^\d]*(\d{12}|\d{14}|\d{15}|\d{20,22})\b/i) || str.match(/\btracking\b[^\d]*(\d{12}|\d{15})\b/i)
  if (fedexMatch) {
    const trackingNumber = canonicalizeTrackingNumber('fedex', fedexMatch[1])
    return {
      carrier: 'fedex',
      trackingNumber,
      trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`,
    }
  }

  return { carrier: null, trackingNumber: null, trackingUrl: null }
}

function legacyVendor(item: PrepItem) {
  const text = `${item.event_title ?? ''} ${item.description}`.toLowerCase()
  return VENDOR_ALIASES.find(({ aliases }) => aliases.some((alias) => text.includes(alias)))?.vendor ?? null
}

export function orderId(item: PrepItem): string | null {
  // 0. Extract from attention_thread_key if present e.g. "transaction:walmart-com:2000151-66891710"
  if (item.attention_thread_key && item.attention_thread_key.startsWith('transaction:')) {
    const parts = item.attention_thread_key.split(':')
    if (parts.length >= 3) {
      const orderPart = parts.slice(2).join(':')
      if (!orderPart.startsWith('message:') && !orderPart.startsWith('items:')) {
        return orderPart
      }
    }
  }

  const text = `${item.event_title ?? ''} ${item.description ?? ''} ${item.source_ref ?? ''}`

  // 1. Amazon order format: 123-1234567-1234567
  const amazonMatch = text.match(/\b\d{3}-\d{7}-\d{7}\b/)
  if (amazonMatch) return amazonMatch[0]

  // 2. Walmart formatted order numbers: e.g. "2000154-80824348", "1000154-80824348"
  const walmartMatch = text.match(/\b(?:2000|1000)\d{3}-\d{8}\b/)
  if (walmartMatch) return walmartMatch[0]

  // 3. Walmart long unhyphenated numeric order ID e.g. "200015480824348"
  const walmartLongMatch = text.match(/\b(?:2000|1000)\d{11,13}\b/)
  if (walmartLongMatch) return walmartLongMatch[0]

  // 4. Explicit numeric or alphanumeric Order / Cart / Confirmation / Reference number
  // e.g. "Order #2541442349", "Order # 2000154-80824348", "Order number: 987654321", "Cart #50 (Order #2541442349)", "Confirmation # 2000154-80824348", "orderId=200015480824348"
  const explicitOrderMatch = text.match(/\b(?:order|cart|confirmation|reference|invoice|receipt|wm)\s*(?:number|no\.?|id|#|:)\s*[:#]?\s*#?([a-z0-9-]*\d{4,}[a-z0-9-]*)\b/i)
  if (explicitOrderMatch) return explicitOrderMatch[1]

  const orderParamMatch = text.match(/\b(?:orderId|order_id|orderNumber|order_number)=([a-z0-9-]+)\b/i)
  if (orderParamMatch) return orderParamMatch[1]

  // 5. Apple Web Order Number e.g. "W123456789"
  const appleMatch = text.match(/\bW\d{9,10}\b/i)
  if (appleMatch) return appleMatch[0]

  // 6. Nike Order Number e.g. "C0123456789"
  const nikeMatch = text.match(/\bC[0-]\d{9,11}\b/i)
  if (nikeMatch) return nikeMatch[0]

  // 7. HelloFresh / Meal Kit Order Number e.g. "HF-12345678", "GC-12345678"
  const mealKitMatch = text.match(/\b(?:HF|GC|BA|FACT)-\d{6,10}\b/i)
  if (mealKitMatch) return mealKitMatch[0].toUpperCase()

  // 8. Direct standalone order hashtag e.g. "#2541442349", "#2000154-80824348"
  const directHashMatch = text.match(/#([a-z0-9-]*\d{6,}[a-z0-9-]*)\b/i)
  if (directHashMatch) return directHashMatch[1]

  // 9. Tracking numbers (UPS, FedEx, USPS, DHL)
  const upsMatch = text.match(/\b1Z[0-9A-Z]{16}\b/i)
  if (upsMatch) return upsMatch[0].toUpperCase()

  const uspsMatch = text.match(/\b9[2345]\d{20,24}\b/)
  if (uspsMatch) return uspsMatch[0]

  const fedexMatch = text.match(/\b(?:fedex|tracking)\b[^\d]*(\d{12}|\d{15}|\d{20,22})\b/i)
  if (fedexMatch) return fedexMatch[1]

  const dhlMatch = text.match(/\b(?:dhl|dhl express)\b[^\d]*(\d{10,11})\b/i) || text.match(/\b(?:GM|LX|RX|JD)\d{10,20}\b/i)
  if (dhlMatch) return dhlMatch[1] || dhlMatch[0]

  // 10. Generic Target / 10-14 digit standalone order numbers when vendor is Target
  const targetMatch = text.match(/\btarget\b[^\d]*(\d{10,14})\b/i)
  if (targetMatch) return targetMatch[1]

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

  // 2. Pure Payment notifications (where type === 'payment' or description is purely about payment/charge without delivery scheduling/confirmation)
  const isDeliveryOrOrderNotice = /\b(?:thanks for your|order confirmation|scheduled for delivery|delivery scheduled|will be delivered|arriving|being prepared|preparing|add more to|edit your order)\b/i.test(combined)

  const isPurePayment = (item.type === 'payment' && !isDeliveryOrOrderNotice) || (
    /\b(payment method|temporary hold|charged for|receipt for payment|order amount)\b/.test(desc) &&
    !/\b(has been delivered|was delivered|out for delivery|shipped|scheduled for delivery|delivery scheduled|will be delivered|arriving)\b/.test(combined) &&
    !isDeliveryOrOrderNotice
  )
  if (isPurePayment) return 'payment'

  // 3. Tense-Aware Delivery Detection:
  // Distinguish between actual completed deliveries vs future delivery notices (e.g. "will be delivered on Monday", "is arriving on Monday")
  const isFutureDeliveryNotice = /\b(?:will be delivered|scheduled (?:to be|for) deliver(?:y|ed)|estimated (?:to be )?delivered|expected (?:to be )?delivered|to be delivered|arriving on|arriving monday|arriving tuesday|arriving wednesday|arriving thursday|arriving friday|arriving saturday|arriving sunday)\b/i.test(combined)
  const isExplicitDelivered = !isFutureDeliveryNotice && /\b(?:has been delivered|was delivered|package delivered|delivered at|delivered to (?:front|porch|door|garage|mailbox|reception)|proof of delivery|delivered on \w+, \w+ \d+ at \d+:\d+)\b/i.test(combined)

  if (isExplicitDelivered) return 'delivered'
  if (item.attention_stage === 'delivered' && !isFutureDeliveryNotice) return 'delivered'

  // 4. Being Prepared / Order In Preparation / Add More Items / Editing Window:
  const isBeingPreparedOrEdited = /\b(?:being prepared|is being prepared|preparing your order|preparing your items|we're preparing|last (?:chance|minute|call) to (?:add|edit)|add more to (?:your )?order|add items to (?:your )?order|edit your order|changes can be made until|need to add anything|time to add items)\b/i.test(combined)
  if (isBeingPreparedOrEdited) return 'confirmed'

  // 5. Out for delivery (Active driver dispatch on day of delivery)
  // NOTE: "inhome delivery" alone is the service name, NOT out for delivery!
  const isExplicitOutForDelivery = /\b(?:out for delivery|driver is on the way|driver on the way|driver heading your way|driver is heading|heading your way|arriving soon|should arrive by \d+:\d+|en route to your)\b/i.test(combined)
  if (isExplicitOutForDelivery) return 'out_for_delivery'
  if (item.attention_stage === 'out_for_delivery' && !isBeingPreparedOrEdited && !isFutureDeliveryNotice) return 'out_for_delivery'

  // 6. Shipped / In transit
  if (/\b(?:shipped|package on the way|in transit|dispatched|carrier tracking|shipment for)\b/i.test(combined)) return 'shipped'
  if (item.attention_stage === 'shipped') return 'shipped'

  // 7. Confirmed / Order Placed / Future Delivery notice / InHome Order Confirmation
  if (isFutureDeliveryNotice) return 'confirmed'
  if (item.attention_stage === 'confirmed') return 'confirmed'
  if (/\b(confirmed|scheduled|placed|order received|order confirmation|thank you for your order|thanks for your|delivery of inhome order|delivery of)\b/i.test(combined)) return 'confirmed'

  // 8. General payment fallback
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
    if (/dhl/i.test(raw)) return 'DHL'
    if (/nike/i.test(raw)) return 'Nike'
    if (/apple/i.test(raw)) return 'Apple'
    return raw
  }
  return 'Parcel'
}

export function detectVendorAndOrder(text?: string | null, vendorHint?: string | null): {
  vendor: string | null
  vendorKey: string | null
  orderId: string | null
  canonicalOrderId: string | null
} {
  const combined = String(text || '')
  let vendor: string | null = null

  if (vendorHint && !isAddressLike(vendorHint)) {
    const raw = String(vendorHint).trim()
    for (const { vendor: v, aliases } of VENDOR_ALIASES) {
      if (aliases.some((alias) => raw.toLowerCase().includes(alias))) {
        vendor = v
        break
      }
    }
    if (!vendor) vendor = raw
  }

  if (!vendor && combined) {
    const lower = combined.toLowerCase()
    for (const { vendor: v, aliases } of VENDOR_ALIASES) {
      if (aliases.some((alias) => lower.includes(alias))) {
        vendor = v
        break
      }
    }
  }

  const vendorKey = vendor ? normalizeKeyPart(vendor) : null
  let rawOrderId: string | null = null

  // 1. Amazon 17-digit format
  const amazonMatch = combined.match(/\b\d{3}-\d{7}-\d{7}\b/)
  if (amazonMatch) {
    rawOrderId = amazonMatch[0]
  } else if (vendor === 'Amazon') {
    const amazonDigitsMatch = combined.match(/\b\d{17}\b/)
    if (amazonDigitsMatch) rawOrderId = amazonDigitsMatch[0]
    const amazonDigitalMatch = combined.match(/\bD01-\d{7}-\d{7}\b/i)
    if (amazonDigitalMatch) rawOrderId = amazonDigitalMatch[0]
  }

  // 2. Walmart formatted order numbers
  if (!rawOrderId) {
    const walmartMatch = combined.match(/\b(?:2000|1000)\d{3}-\d{8}\b/)
    if (walmartMatch) {
      rawOrderId = walmartMatch[0]
    } else {
      const walmartLongMatch = combined.match(/\b(?:2000|1000)\d{11,13}\b/)
      if (walmartLongMatch) {
        rawOrderId = walmartLongMatch[0]
      } else if (vendor === 'Walmart') {
        const wmDigitsMatch = combined.match(/\b\d{15,16}\b/)
        if (wmDigitsMatch) rawOrderId = wmDigitsMatch[0]
      }
    }
  }

  // 3. Apple Web Order Number
  if (!rawOrderId) {
    const appleMatch = combined.match(/\bW\d{9,10}\b/i)
    if (appleMatch) {
      rawOrderId = appleMatch[0]
    }
  }

  // 4. Nike Order Number
  if (!rawOrderId) {
    const nikeMatch = combined.match(/\bC[0-]\d{9,11}\b/i)
    if (nikeMatch) {
      rawOrderId = nikeMatch[0]
    }
  }

  // 5. HelloFresh / Meal Kit Order Number
  if (!rawOrderId) {
    const mealKitMatch = combined.match(/\b(?:HF|GC|BA|FACT)-\d{6,10}\b/i)
    if (mealKitMatch) {
      rawOrderId = mealKitMatch[0]
    }
  }

  // 6. Explicit numeric or alphanumeric Order / Cart / Confirmation / Reference number
  if (!rawOrderId) {
    const explicitOrderMatch = combined.match(/\b(?:order|cart|confirmation|reference|invoice|receipt|wm)\s*(?:number|no\.?|id|#|:)\s*[:#]?\s*#?([a-z0-9-]*\d{4,}[a-z0-9-]*)\b/i)
    if (explicitOrderMatch) {
      rawOrderId = explicitOrderMatch[1]
    }
  }

  // 7. URL query param
  if (!rawOrderId) {
    const orderParamMatch = combined.match(/\b(?:orderId|order_id|orderNumber|order_number)=([a-z0-9-]+)\b/i)
    if (orderParamMatch) {
      rawOrderId = orderParamMatch[1]
    }
  }

  // 8. Direct standalone order hashtag
  if (!rawOrderId) {
    const directHashMatch = combined.match(/#([a-z0-9-]*\d{6,}[a-z0-9-]*)\b/i)
    if (directHashMatch) {
      rawOrderId = directHashMatch[1]
    }
  }

  // 9. Target 10-14 digit standalone order numbers when vendor is Target
  if (!rawOrderId && vendor === 'Target') {
    const targetMatch = combined.match(/\btarget\b[^\d]*(\d{10,14})\b/i) || combined.match(/\b(\d{10,14})\b/)
    if (targetMatch) {
      rawOrderId = targetMatch[1]
    }
  }

  const canonical = (vendor && rawOrderId) ? canonicalizeOrderId(vendor, rawOrderId) : (rawOrderId ? normalizeKeyPart(rawOrderId) : null)

  return {
    vendor,
    vendorKey,
    orderId: rawOrderId,
    canonicalOrderId: canonical,
  }
}

export function buildCompositeThreadKey(params: {
  vendor?: string | null
  vendorKey?: string | null
  orderId?: string | null
  canonicalOrderId?: string | null
  carrier?: string | null
  trackingNumber?: string | null
  dateKey?: string | null
  sourceRef?: string | null
  descriptor?: string | null
}): string {
  const {
    vendor,
    vendorKey: rawVendorKey,
    orderId,
    canonicalOrderId,
    carrier,
    trackingNumber,
    dateKey,
    sourceRef,
    descriptor,
  } = params || {}

  const vKey = rawVendorKey || (vendor ? normalizeKeyPart(vendor) : null)
  const canonicalId = canonicalOrderId || (orderId && vendor ? canonicalizeOrderId(vendor, orderId) : orderId ? normalizeKeyPart(orderId) : null)

  if (vKey && canonicalId) {
    return `transaction:${vKey}:${normalizeKeyPart(canonicalId)}`
  }

  if (carrier && trackingNumber) {
    const cKey = String(carrier).toLowerCase()
    const tNum = canonicalizeTrackingNumber(cKey, trackingNumber).toLowerCase()
    return `courier:${cKey}:${tNum}`
  }

  if (vKey && descriptor) {
    return `transaction:${vKey}:items:${normalizeKeyPart(descriptor)}`
  }

  if (vKey && dateKey) {
    return `delivery:${vKey}:${dateKey}`
  }

  if (vKey && sourceRef) {
    return `transaction:${vKey}:message:${sourceRef}`
  }

  if (vKey) {
    return `transaction:${vKey}:unknown`
  }

  if (carrier) {
    return `courier:${String(carrier).toLowerCase()}:unknown`
  }

  return 'transaction:parcel:unknown'
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
  if (item.source_type !== 'gmail' && !item.source_ref?.startsWith('gmail:')) return null

  const explicitKey = item.attention_thread_key?.trim()
  if (explicitKey?.startsWith('courier:')) {
    const carrier = explicitKey.split(':')[1]?.toUpperCase() || 'Parcel'
    return { key: explicitKey, vendor: carrier, stage: transactionStage(item) }
  }

  const vendor = resolveVendorName(item)
  if (vendor === 'Parcel') {
    const carrierDetect = detectCarrierAndTracking(`${item.event_title ?? ''} ${item.description ?? ''} ${item.source_ref ?? ''}`)
    if (carrierDetect.carrier && carrierDetect.trackingNumber) {
      const cKey = carrierDetect.carrier.toLowerCase()
      const tKey = canonicalizeTrackingNumber(cKey, carrierDetect.trackingNumber).toLowerCase()
      return {
        key: `courier:${cKey}:${tKey}`,
        vendor: carrierDetect.carrier.toUpperCase(),
        stage: transactionStage(item),
      }
    }
    return null
  }

  const isCourier = ['UPS', 'FedEx', 'USPS', 'DHL'].includes(vendor)
  const vendorKey = normalizeKeyPart(vendor)
  const explicitOrderNumber = extractOrderIdFromExplicitKey(explicitKey)
  const extractedOrderId = orderId(item)
  const rawOrderNumber = explicitOrderNumber || extractedOrderId
  const finalOrderNumber = rawOrderNumber ? (isCourier ? canonicalizeTrackingNumber(vendorKey, rawOrderNumber) : canonicalizeOrderId(vendor, rawOrderNumber)) : null
  const dateKey = deliveryDateKey(item)

  const key = finalOrderNumber
    ? (isCourier
        ? `courier:${vendorKey}:${normalizeKeyPart(finalOrderNumber)}`
        : `transaction:${vendorKey}:${normalizeKeyPart(finalOrderNumber)}`)
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
  // Aggregate and deduplicate update history
  const existingHistory = existing.updateHistory || [
    {
      id: existing.id,
      title: existing.title,
      description: existing.rawItem?.description,
      stage: existing.stage,
      occurredAt: existing.occurredAt,
      sourceRef: existing.rawItem?.source_ref,
      rawItem: existing.rawItem,
      cost: existing.cost,
      policyDisclaimer: existing.policyDisclaimer,
    },
  ]
  const incomingHistory = incoming.updateHistory || [
    {
      id: incoming.id,
      title: incoming.title,
      description: incoming.rawItem?.description,
      stage: incoming.stage,
      occurredAt: incoming.occurredAt,
      sourceRef: incoming.rawItem?.source_ref,
      rawItem: incoming.rawItem,
      cost: incoming.cost,
      policyDisclaimer: incoming.policyDisclaimer,
    },
  ]

  const combinedHistory = [...existingHistory, ...incomingHistory]
  const seenIds = new Set<string>()
  const uniqueHistory = combinedHistory
    .filter((h) => {
      if (seenIds.has(h.id)) return false
      seenIds.add(h.id)
      return true
    })
    .sort((a, b) => {
      const timeA = a.occurredAt ? new Date(a.occurredAt).getTime() : 0
      const timeB = b.occurredAt ? new Date(b.occurredAt).getTime() : 0
      return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB)
    })

  const incomingTime = incoming.occurredAt ? new Date(incoming.occurredAt).getTime() : 0
  const existingTime = existing.occurredAt ? new Date(existing.occurredAt).getTime() : 0
  const isLatestIncoming = (isNaN(incomingTime) ? 0 : incomingTime) >= (isNaN(existingTime) ? 0 : existingTime)

  // Chronological lifecycle stage resolution:
  let mergedStage: DeliveryTransitStage
  if (existing.stage === 'problem' || incoming.stage === 'problem') {
    mergedStage = 'problem'
  } else {
    const latestItem = isLatestIncoming ? incoming : existing
    const latestText = `${latestItem.rawItem?.event_title ?? ''} ${latestItem.rawItem?.description ?? ''}`.toLowerCase()
    const isLatestBeingPrepared = /\b(?:being prepared|is being prepared|preparing your order|preparing your items|we're preparing|last minute to add|last call to edit|add more to (?:your )?order|add items to (?:your )?order|edit your order)\b/i.test(latestText)

    if (isLatestBeingPrepared) {
      mergedStage = 'confirmed'
    } else {
      const stageRank: DeliveryTransitStage[] = ['confirmed', 'payment', 'shipped', 'out_for_delivery', 'delivered', 'problem']
      const existingRank = stageRank.indexOf(existing.stage)
      const incomingRank = stageRank.indexOf(incoming.stage)
      mergedStage = incomingRank > existingRank ? incoming.stage : existing.stage
    }
  }

  const reversedHistory = [...uniqueHistory].reverse()
  const historyCostItem = reversedHistory.find(
    (h) => (h as any).cost || (h as any).rawItem?.cost
  )
  const latestCost =
    (historyCostItem as any)?.cost ||
    (historyCostItem as any)?.rawItem?.cost ||
    (isLatestIncoming ? (incoming.cost || existing.cost || null) : (existing.cost || incoming.cost || null))

  const mergedSummary = mergeItemSummary(existing.itemSummary, incoming.itemSummary)
  const mergedEta = mergeEtaDisplay(existing.etaDisplay, incoming.etaDisplay)

  const historyPolicyItem = reversedHistory.find(
    (h) => (h as any).policyDisclaimer || (h as any).rawItem?.policy_disclaimer || (h as any).rawItem?.policyDisclaimer
  )
  const latestPolicy =
    (historyPolicyItem as any)?.policyDisclaimer ||
    (historyPolicyItem as any)?.rawItem?.policy_disclaimer ||
    (historyPolicyItem as any)?.rawItem?.policyDisclaimer ||
    (isLatestIncoming ? (incoming.policyDisclaimer || existing.policyDisclaimer || null) : (existing.policyDisclaimer || incoming.policyDisclaimer || null))

  const newerDate = isLatestIncoming ? incoming.occurredAt : existing.occurredAt
  const latestRawItem = isLatestIncoming ? incoming.rawItem : existing.rawItem

  return {
    ...existing,
    stage: mergedStage,
    cost: latestCost,
    itemSummary: mergedSummary,
    etaDisplay: mergedEta,
    isPerishable: existing.isPerishable || incoming.isPerishable,
    occurredAt: newerDate,
    rawItem: latestRawItem,
    policyDisclaimer: latestPolicy,
    updateHistory: uniqueHistory,
  }
}

export function consolidateTransitItems(items: DeliveryTransitItem[]): DeliveryTransitItem[] {
  const sorted = [...items].sort((a, b) => {
    const timeA = a.occurredAt ? new Date(a.occurredAt).getTime() : 0
    const timeB = b.occurredAt ? new Date(b.occurredAt).getTime() : 0
    return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB)
  })

  const transitMap = new Map<string, DeliveryTransitItem>()

  for (const item of sorted) {
    const existing = transitMap.get(item.threadKey)
    if (!existing) {
      transitMap.set(item.threadKey, item)
    } else {
      transitMap.set(item.threadKey, mergeDeliveryTransitItem(existing, item))
    }
  }

  // Second pass: Merge generic delivery:${vendor}:${date} items into specific transaction:${vendor}:${orderId} on that same date or active delivery
  const consolidated = Array.from(transitMap.values())
  const finalMap = new Map<string, DeliveryTransitItem>()

  for (const item of consolidated) {
    const isGenericDateKey = /^delivery:[a-z0-9-]+:\d{4}-\d{2}-\d{2}$/.test(item.threadKey)
    if (isGenericDateKey) {
      const vendorKey = normalizeKeyPart(item.vendor)
      const itemDateKey = deliveryDateKey(item.rawItem)

      // Find if there is an explicit order transaction for this vendor on this date (or within 36 hours)
      const matchingExplicit = consolidated.find((other) => {
        if (other === item) return false
        if (normalizeKeyPart(other.vendor) !== vendorKey) return false
        if (/^delivery:[a-z0-9-]+:\d{4}-\d{2}-\d{2}$/.test(other.threadKey)) return false
        const otherDateKey = deliveryDateKey(other.rawItem)
        if (otherDateKey === itemDateKey) return true

        const itemTime = new Date(item.occurredAt).getTime()
        const otherTime = new Date(other.occurredAt).getTime()
        return Math.abs(itemTime - otherTime) <= 36 * 3600 * 1000
      })

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
  const text = `${item.event_title ?? ''} ${item.description}`.toLowerCase()
  if (/\b(flight|airline|airlines|e-ticket|ticket receipt|boarding pass|hotel reservation|cabin getaway|airbnb|vrbo|hotel stay|reservation confirmation|maintenance visit|inspection visit|service visit|checkup|cleaning scheduled|teeth cleaning|lesson|rehearsal|recital|orientation|showcase|arborist|tennis court|annual general meeting|ptsa meeting)\b/i.test(text)) {
    return false
  }

  // If already tagged as a transaction thread
  if (item.attention_thread_key && item.attention_thread_key.startsWith('transaction:')) {
    const isProblem = item.attention_stage === 'problem' || item.type === 'cancellation' || /\b(cancelled|canceled|dispute|failed)\b/.test(text)
    if (!isProblem) return true
  }

  if (item.type === 'delivery') return true
  if (isPerishableDelivery(item)) return true
  if (/\b(inhome delivery|delivery window|grocery delivery|package delivery|courier delivery|out for delivery|shipped|en route|shipment for|walmart order|amazon order|target order|grocery order|add items to (?:your )?order|changes can be made until|last (?:chance|minute|call) to (?:add|edit))\b/i.test(text)) {
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

export function isPerishableDelivery(
  item: PrepItem | Partial<PrepItem> | { title?: string; vendor?: string; description?: string; event_title?: string; attention_vendor?: string } | string | null | undefined
): boolean {
  if (!item) return false
  let combined = ''
  if (typeof item === 'string') {
    combined = item.toLowerCase()
  } else if (typeof item === 'object') {
    const desc = (item as any).description || ''
    const title = (item as any).event_title || (item as any).title || ''
    const vendor = (item as any).vendor || (item as any).attention_vendor || ''
    combined = `${vendor} ${title} ${desc}`.toLowerCase()
  }

  return (
    combined.includes('inhome') ||
    combined.includes('hellofresh') ||
    combined.includes('hello fresh') ||
    combined.includes('greenchef') ||
    combined.includes('green chef') ||
    combined.includes('factor75') ||
    combined.includes('factor 75') ||
    combined.includes('blue apron') ||
    combined.includes('blueapron') ||
    combined.includes('meal kit') ||
    combined.includes('instacart') ||
    combined.includes('perishable') ||
    combined.includes('refrigerat') ||
    combined.includes('fresh') ||
    combined.includes('grocer') ||
    combined.includes('produce')
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
  const isValidDeliveryDate = deliveryDate instanceof Date && !isNaN(deliveryDate.getTime())
  const isValidNow = now instanceof Date && !isNaN(now.getTime())
  if (!isValidDeliveryDate || !isValidNow) {
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
  // ONLY auto-resolve if:
  // - rawStage was explicitly 'out_for_delivery' (same-day courier dispatch that completed on a past day)
  // - NEVER auto-resolve 'confirmed', 'payment', or 'shipped' (which may be active orders placed yesterday or in preparation)
  if (isBefore(deliveryStart, todayStart)) {
    if (rawStage === 'out_for_delivery') {
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

  const isValidDeliveryDate = deliveryDate instanceof Date && !isNaN(deliveryDate.getTime())
  const isValidNow = now instanceof Date && !isNaN(now.getTime())

  if (stage === 'delivered') {
    if (!isValidDeliveryDate) return 'Delivered'
    if (isValidNow) {
      const diff = differenceInCalendarDays(deliveryDate, now)
      if (diff === 0) return 'Delivered today'
      if (diff === -1) return 'Delivered yesterday'
      if (diff < -1) return `Delivered ${format(deliveryDate, 'MMM d')}`
    }
    return `Delivered ${format(deliveryDate, 'MMM d')}`
  }

  if (!isValidDeliveryDate) {
    return rawEta || null
  }

  if (isValidNow) {
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
  if (!targetDate || isNaN(targetDate.getTime()) || !now || isNaN(now.getTime())) return false
  return isSameDay(targetDate, now)
}

export function isItemScheduledLater(item: DeliveryTransitItem, now: Date): boolean {
  const targetDate = resolveDeliveryDate(item.rawItem)
  const effectiveStage = resolveEffectiveStage(item.stage, targetDate, now)
  if (effectiveStage === 'delivered' || effectiveStage === 'problem') return false
  if (!targetDate || isNaN(targetDate.getTime()) || !now || isNaN(now.getTime())) return false
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
  const isValidTargetDate = targetDate instanceof Date && !isNaN(targetDate.getTime())
  const rawEta = etaMatch
    ? etaMatch[0].trim()
    : isValidTargetDate
      ? format(targetDate, 'EEE, MMM d')
      : item.due_by && !isNaN(new Date(item.due_by).getTime())
        ? new Date(item.due_by).toLocaleDateString()
        : null
  const etaDisplay = now
    ? formatDeliveryEta(rawEta, targetDate, effectiveStage, now)
    : rawEta || (isValidTargetDate ? format(targetDate, 'EEE, MMM d') : null)

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
      cost,
      policyDisclaimer,
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

export function extractPolicyDisclaimer(text?: string | null): string | null {
  if (!text) return null
  const match = String(text).match(/(?:claims? for (?:missing|wrong|damaged|lost)[^.]*|claims? must be made within[^.]*|return window[^.]*|return (?:by|eligible)[^.]*)/i)
  return match ? match[0].trim() : null
}

export function resolveCanonicalEntity(
  input: Partial<PrepItem> & {
    vendor?: string
    text?: string
    title?: string
    orderId?: string
    trackingNumber?: string
    carrier?: 'ups' | 'fedex' | 'usps' | 'dhl' | null
    receivedAt?: string
    deliveryDate?: string | null
    cost?: string | null
    itemSummary?: string | null
    rawEta?: string | null
    etaDisplay?: string | null
    now?: Date
  },
  options?: { now?: Date }
): CanonicalEntityResult {
  const item = input || {}
  const now = options?.now || (item.now instanceof Date ? item.now : new Date())
  const combined = `${item.event_title || item.title || ''} ${item.description || ''} ${item.text || ''} ${item.source_ref || ''}`.trim()

  // 1. Vendor & Order Resolution
  const vendorDetection = detectVendorAndOrder(combined, item.vendor || item.attention_vendor)
  const carrierDetection = detectCarrierAndTracking(combined)

  const vendor = vendorDetection.vendor || (carrierDetection.carrier ? carrierDetection.carrier.toUpperCase() : 'Parcel')
  const vendorKey = vendorDetection.vendorKey || (carrierDetection.carrier ? carrierDetection.carrier : 'parcel')
  const rawOrderId = vendorDetection.orderId
  const canonicalOrderId = vendorDetection.canonicalOrderId

  const trackingNumber = carrierDetection.trackingNumber || item.trackingNumber || null
  const carrier = carrierDetection.carrier || (item.carrier ? (String(item.carrier).toLowerCase() as 'ups' | 'fedex' | 'usps' | 'dhl') : null)

  // 2. Composite Thread Key
  const dateKey = item.deliveryDate || (item.due_by ? String(item.due_by).slice(0, 10) : item.event_date ? String(item.event_date).slice(0, 10) : item.created_at ? String(item.created_at).slice(0, 10) : null)
  const compositeThreadKey = item.attention_thread_key?.trim() || buildCompositeThreadKey({
    vendor,
    vendorKey,
    orderId: rawOrderId,
    canonicalOrderId,
    carrier,
    trackingNumber,
    dateKey,
    sourceRef: item.source_ref,
  })

  // 3. Stage & Date Resolution
  const rawStage = (transactionStage(item as PrepItem) || 'confirmed') as DeliveryTransitStage
  const deliveryDateObj = item.deliveryDate ? new Date(item.deliveryDate) : (item.due_by ? new Date(item.due_by) : item.event_date ? new Date(item.event_date) : null)
  const isValidDateObj = deliveryDateObj instanceof Date && !isNaN(deliveryDateObj.getTime())
  const deliveryDateIso = isValidDateObj ? deliveryDateObj.toISOString().slice(0, 10) : null
  const effectiveStage = resolveEffectiveStage(rawStage, isValidDateObj ? deliveryDateObj : null, now)

  // 4. Perishable & Policy Disclaimer
  const isPerish = isPerishableDelivery(item as PrepItem)
  const policyDisclaimer = item.policy_disclaimer || extractPolicyDisclaimer(combined)
  const cost = item.cost || extractAmount(combined)

  // Extract Summary
  const itemMatch = combined.match(/(?:delivered:\s*|delivery of\s+)([A-Za-z0-9\s™+'-]{2,60}?\+\s*\d+\s*items?)/i)
    || combined.match(/(\d+\s+items?\s+including\s+[A-Za-z0-9\s™+'-]{3,40})/i)
    || combined.match(/(Delivery of InHome order)/i)
    || combined.match(/(\d+\s+items?|[A-Za-z0-9\s™+'-]{3,40}(?:Book|Tools|Kit|Packs?|Order|Box))/i)
  const itemSummary = item.itemSummary || (itemMatch ? (itemMatch[1] || itemMatch[0]).trim() : (isPerish ? 'Grocery Delivery' : 'Package'))

  // 5. ETA Display
  const etaMatch = combined.match(/(?:(?:arrive|expected|arriving|delivery)\s+(?:today\s+)?by\s+[\d:apm\s–-]+|today\s+by\s+[\d:apm]+|(?:delivery\s+)?window\s+(?:is\s+)?[\d:apm\s–-]+|between\s+[\d:apm\s–-]+|today\s+between\s+[\d:apm\s–-]+|expected\s+today|(?:expected\s+to\s+arrive|arriving|expected|arrive)\s+(?:on\s+)?[A-Za-z]+,?\s+[A-Za-z]+\s+\d+)/i)
  const rawEta = item.etaDisplay || item.rawEta || (etaMatch ? etaMatch[0].trim() : (isValidDateObj ? format(deliveryDateObj, 'EEE, MMM d') : null))
  const etaDisplay = formatDeliveryEta(rawEta, isValidDateObj ? deliveryDateObj : null, effectiveStage, now)

  // 6. Agency Level (0 for passive logistics radar)
  const agencyLevel = typeof item.agency_level === 'number' ? item.agency_level : 0

  return {
    vendor,
    vendorKey,
    orderId: rawOrderId,
    canonicalOrderId,
    trackingNumber,
    carrier,
    compositeThreadKey,
    effectiveStage,
    rawStage,
    isPerishable: isPerish,
    cost,
    itemSummary,
    etaDisplay,
    deliveryDate: deliveryDateIso,
    policyDisclaimer,
    agencyLevel,
  }
}
