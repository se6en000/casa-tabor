/**
 * Deterministic Entity & Canonical Order Resolver
 * Pure ES Module (zero external dependencies) for Edge Functions, Node test runner, and Client.
 *
 * Conforms to CanonicalEntityResult in PROJECT.md.
 */

export const VENDOR_ALIASES = [
  { vendor: 'Walmart', aliases: ['walmart.com', 'walmart+', 'walmart', 'inhome', 'walmart grocery', 'walmart inhome'] },
  { vendor: 'Amazon', aliases: ['amazon.com', 'amazon', 'prime', 'amazon fresh', 'whole foods'] },
  { vendor: 'Jiffy.com', aliases: ['jiffy.com', 'jiffy transfers', 'jiffy shirts', 'jiffy'] },
  { vendor: 'HelloFresh', aliases: ['hellofresh', 'hello fresh', 'greenchef', 'green chef', 'factor75', 'factor', 'blue apron'] },
  { vendor: 'Target', aliases: ['target.com', 'target', 'shipt', 'target circle'] },
  { vendor: 'Apple', aliases: ['apple.com', 'apple store', 'apple'] },
  { vendor: 'Nike', aliases: ['nike.com', 'nike'] },
  { vendor: 'Instacart', aliases: ['instacart.com', 'instacart'] },
  { vendor: 'DoorDash', aliases: ['doordash.com', 'doordash'] },
  { vendor: 'Uber Eats', aliases: ['ubereats.com', 'uber eats', 'ubereats'] },
  { vendor: 'FedEx', aliases: ['fedex.com', 'fedex'] },
  { vendor: 'UPS', aliases: ['ups.com', 'ups'] },
  { vendor: 'USPS', aliases: ['usps.com', 'usps', 'postal service'] },
  { vendor: 'DHL', aliases: ['dhl.com', 'dhl express', 'dhl ecommerce', 'dhl'] },
  { vendor: 'Etsy', aliases: ['etsy.com', 'etsy'] },
  { vendor: 'Sephora', aliases: ['sephora.com', 'sephora'] },
  { vendor: 'Nordstrom', aliases: ['nordstrom.com', 'nordstrom'] },
  { vendor: 'Chewy', aliases: ['chewy.com', 'chewy'] },
  { vendor: 'Pottery Barn', aliases: ['potterybarn.com', 'pottery barn'] },
  { vendor: 'Williams Sonoma', aliases: ['williams-sonoma.com', 'williams sonoma'] },
]

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function normalizeKeyPart(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Canonicalizes raw order number into standardized string for known vendors.
 * - Walmart: 15/16 digits -> 7-8 format (e.g. 2000154-80824348)
 * - Amazon: 17 digits -> 3-7-7 format (e.g. 112-8472910-4829103)
 * - Apple: W + 9-10 digits -> uppercase (e.g. W123456789)
 * - Nike: C0/C- + 9-11 digits -> uppercase C0... (e.g. C0123456789)
 * - Target: 10-14 digits -> clean numeric
 * - Jiffy: 8-12 digits -> clean numeric
 * - HelloFresh & meal kits: HF-, GC-, BA-, FACT- -> uppercase
 */
export function canonicalizeOrderId(vendor, rawId) {
  if (!rawId) return ''
  let clean = String(rawId).trim().replace(/^[#:\s]+/, '')
  clean = clean.replace(/^(?:order|confirmation|reference|invoice|receipt|wm)\s*(?:number|no\.?|id|#|:)\s*[:#]?\s*/i, '')
  const v = String(vendor || '').toLowerCase()

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

/**
 * Standardizes courier tracking number.
 * - UPS: 1Z uppercase or 20-34 digits Mail Innovations
 * - FedEx: 12, 14, 15, 20-22 digits
 * - USPS: 20-24 digits or international UPU S10 (13 char uppercase)
 * - DHL: 10-11 digits or eCommerce prefix GM/LX/RX/JD
 */
export function canonicalizeTrackingNumber(carrier, rawTracking) {
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

/**
 * Detects carrier and tracking number from text or source reference.
 * Returns carrier ('ups' | 'fedex' | 'usps' | 'dhl' | null), trackingNumber, and trackingUrl.
 */
export function detectCarrierAndTracking(text) {
  if (!text) {
    return { carrier: null, trackingNumber: null, trackingUrl: null }
  }

  const str = String(text)

  // 1. UPS (1Z format: 18 chars)
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

  // 3. USPS International UPU S10 (13 chars: e.g. EA123456789US)
  const uspsIntlMatch = str.match(/\b([A-Za-z]{2}\d{9}[A-Za-z]{2})\b/)
  if (uspsIntlMatch) {
    const trackingNumber = canonicalizeTrackingNumber('usps', uspsIntlMatch[1])
    return {
      carrier: 'usps',
      trackingNumber,
      trackingUrl: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`,
    }
  }

  // 4. UPS Mail Innovations (when text includes 'ups')
  const upsMiMatch = str.match(/\bups\b[^\d]*(92\d{20,32})\b/i)
  if (upsMiMatch) {
    const trackingNumber = canonicalizeTrackingNumber('ups', upsMiMatch[1])
    return {
      carrier: 'ups',
      trackingNumber,
      trackingUrl: `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`,
    }
  }

  // 5. DHL (10-11 digits or eCommerce prefix GM/LX/RX/JD)
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

  // 6. FedEx (12, 14, 15, 20-22 digits with FedEx or tracking context)
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

function isAddressLike(text) {
  if (!text) return false
  const trimmed = String(text).trim()
  return (
    /^\d+\s+[A-Za-z]/i.test(trimmed) ||
    /\b(Rd|Road|St|Street|Ave|Avenue|Dr|Drive|Blvd|Boulevard|Ln|Lane|Way|Ct|Court|Pl|Place|FL|Florida|\d{5})\b/i.test(trimmed)
  )
}

/**
 * Resolves standard vendor name from text or vendor hint.
 */
export function detectVendor(text, vendorHint) {
  if (vendorHint && !isAddressLike(vendorHint)) {
    const raw = String(vendorHint).trim()
    for (const { vendor, aliases } of VENDOR_ALIASES) {
      if (aliases.some((alias) => raw.toLowerCase().includes(alias))) {
        return vendor
      }
    }
    return raw
  }

  if (text) {
    const lower = String(text).toLowerCase()
    for (const { vendor, aliases } of VENDOR_ALIASES) {
      if (aliases.some((alias) => lower.includes(alias))) {
        return vendor
      }
    }
  }

  return null
}

/**
 * Detects vendor and order ID from text.
 */
export function detectVendorAndOrder(text, vendorHint) {
  const combined = String(text || '')
  const vendor = detectVendor(combined, vendorHint)
  const vendorKey = vendor ? normalizeKeyPart(vendor) : null

  let rawOrderId = null

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

  // 2. Walmart formatted order numbers: e.g. "2000154-80824348", "1000154-80824348"
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

  // 3. Apple Web Order Number e.g. "W123456789"
  if (!rawOrderId) {
    const appleMatch = combined.match(/\bW\d{9,10}\b/i)
    if (appleMatch) {
      rawOrderId = appleMatch[0]
    }
  }

  // 4. Nike Order Number e.g. "C0123456789" or "C-0123456789"
  if (!rawOrderId) {
    const nikeMatch = combined.match(/\bC[0-]\d{9,11}\b/i)
    if (nikeMatch) {
      rawOrderId = nikeMatch[0]
    }
  }

  // 5. HelloFresh / Meal Kit Order Number e.g. "HF-12345678", "GC-12345678"
  if (!rawOrderId) {
    const mealKitMatch = combined.match(/\b(?:HF|GC|BA|FACT)-\d{6,10}\b/i)
    if (mealKitMatch) {
      rawOrderId = mealKitMatch[0]
    }
  }

  // 6. Explicit numeric or alphanumeric Order / Cart / Confirmation / Reference number
  // e.g. "Order #2541442349", "Order # 2000154-80824348", "Order number: 987654321", "Cart #50 (Order #2541442349)", "orderId=200015480824348"
  if (!rawOrderId) {
    const explicitOrderMatch = combined.match(/\b(?:order|cart|confirmation|reference|invoice|receipt|wm)\s*(?:number|no\.?|id|#|:)\s*[:#]?\s*#?([a-z0-9-]*\d{4,}[a-z0-9-]*)\b/i)
    if (explicitOrderMatch) {
      rawOrderId = explicitOrderMatch[1]
    }
  }

  // 7. URL query parameter e.g. orderId=..., order_number=...
  if (!rawOrderId) {
    const orderParamMatch = combined.match(/\b(?:orderId|order_id|orderNumber|order_number)=([a-z0-9-]+)\b/i)
    if (orderParamMatch) {
      rawOrderId = orderParamMatch[1]
    }
  }

  // 8. Direct standalone order hashtag e.g. "#2541442349"
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

/**
 * Builds deterministic composite thread key.
 * - Primary vendor order: `transaction:${vendorKey}:${canonicalOrderId}`
 * - Standalone courier: `courier:${carrier}:${normalizedTrackingNumber}`
 * - Item descriptor fallback: `transaction:${vendorKey}:items:${descriptor}`
 * - Generic date fallback: `delivery:${vendorKey}:${dateKey}`
 * - Message fallback: `transaction:${vendorKey}:message:${sourceRef}`
 */
export function buildCompositeThreadKey(params) {
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

  // 1. Merchant order identity takes top precedence
  if (vKey && canonicalId) {
    return `transaction:${vKey}:${normalizeKeyPart(canonicalId)}`
  }

  // 2. Standalone courier tracking identity
  if (carrier && trackingNumber) {
    const cKey = String(carrier).toLowerCase()
    const tNum = canonicalizeTrackingNumber(cKey, trackingNumber).toLowerCase()
    return `courier:${cKey}:${tNum}`
  }

  // 3. Item descriptor fallback
  if (vKey && descriptor) {
    return `transaction:${vKey}:items:${normalizeKeyPart(descriptor)}`
  }

  // 4. Generic date key fallback
  if (vKey && dateKey) {
    return `delivery:${vKey}:${dateKey}`
  }

  // 5. Source reference fallback
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

/**
 * Determines stage from text indicators and attention fields.
 * Stages: confirmed | payment | shipped | out_for_delivery | delivered | problem
 */
export function resolveTransactionStage(itemOrText) {
  let combined = ''
  let attentionStage = null
  let type = null

  if (typeof itemOrText === 'string') {
    combined = itemOrText.toLowerCase()
  } else if (itemOrText && typeof itemOrText === 'object') {
    const desc = itemOrText.description || ''
    const title = itemOrText.event_title || itemOrText.title || ''
    combined = `${title} ${desc}`.toLowerCase()
    attentionStage = itemOrText.attention_stage || itemOrText.transaction_status || null
    type = itemOrText.type || null
  }

  // Policy disclaimer check: e.g. "Claims for missing, wrong, or damaged items must be made within 3 days..."
  const isClaimPolicyDisclaimer = /\b(?:claims? for (?:missing|wrong|damaged|lost)|claims? must be made within|return (?:window|policy)|in case of missing)\b/i.test(combined)

  // 1. Problem / Cancellation exceptions
  if (type === 'cancellation') return 'problem'
  if (!isClaimPolicyDisclaimer && /\b(cancelled|canceled|failed|problem|issue|missing|damaged|exception)\b/i.test(combined)) {
    return 'problem'
  }
  if (isClaimPolicyDisclaimer && /\b(package was (?:damaged|lost)|item is damaged|reported damaged|delivery failed|delivery exception)\b/i.test(combined)) {
    return 'problem'
  }

  // 2. Pure Payment notifications
  const isDeliveryOrOrderNotice = /\b(?:thanks for your|order confirmation|scheduled for delivery|delivery scheduled|will be delivered|arriving|being prepared|preparing|add more to|edit your order)\b/i.test(combined)
  const isPurePayment = (type === 'payment' && !isDeliveryOrOrderNotice) || (
    /\b(payment method|temporary hold|charged for|receipt for payment|order amount)\b/i.test(combined) &&
    !/\b(has been delivered|was delivered|out for delivery|shipped|scheduled for delivery|delivery scheduled|will be delivered|arriving)\b/i.test(combined) &&
    !isDeliveryOrOrderNotice
  )
  if (isPurePayment) return 'payment'

  // 3. Tense-Aware Delivery Detection
  const isFutureDeliveryNotice = /\b(?:will be delivered|scheduled (?:to be|for) deliver(?:y|ed)|estimated (?:to be )?delivered|expected (?:to be )?delivered|to be delivered|arriving on|arriving monday|arriving tuesday|arriving wednesday|arriving thursday|arriving friday|arriving saturday|arriving sunday)\b/i.test(combined)
  const isExplicitDelivered = !isFutureDeliveryNotice && /\b(?:has been delivered|was delivered|package delivered|delivered at|delivered to (?:front|porch|door|garage|mailbox|reception)|proof of delivery|delivered on \w+, \w+ \d+ at \d+:\d+)\b/i.test(combined)

  if (isExplicitDelivered) return 'delivered'
  if (attentionStage === 'delivered' && !isFutureDeliveryNotice) return 'delivered'

  // 4. Being Prepared / Order In Preparation / Add More Items / Editing Window (In-Preparation Lock)
  const isBeingPreparedOrEdited = /\b(?:being prepared|is being prepared|preparing your order|preparing your items|we're preparing|last minute to add|last call to edit|add more to (?:your )?order|add items to (?:your )?order|edit your order|need to add anything|time to add items)\b/i.test(combined)
  if (isBeingPreparedOrEdited) return 'confirmed'

  // 5. Out for delivery (Active driver dispatch on day of delivery)
  const isExplicitOutForDelivery = /\b(?:out for delivery|driver is on the way|driver on the way|driver heading your way|driver is heading|heading your way|arriving soon|should arrive by \d+:\d+|en route to your)\b/i.test(combined)
  if (isExplicitOutForDelivery) return 'out_for_delivery'
  if (attentionStage === 'out_for_delivery' && !isBeingPreparedOrEdited && !isFutureDeliveryNotice) return 'out_for_delivery'

  // 6. Shipped / In transit
  if (/\b(?:shipped|package on the way|in transit|dispatched|carrier tracking|shipment for)\b/i.test(combined)) return 'shipped'
  if (attentionStage === 'shipped') return 'shipped'

  // 7. Confirmed / Order Placed / Future Delivery notice
  if (isFutureDeliveryNotice) return 'confirmed'
  if (attentionStage === 'confirmed') return 'confirmed'
  if (/\b(confirmed|scheduled|placed|order received|order confirmation|thank you for your order|thanks for your|delivery of inhome order|delivery of)\b/i.test(combined)) return 'confirmed'

  // 8. General payment fallback
  if (/\b(payment|charged|temporary hold)\b/i.test(combined)) return 'payment'
  if (attentionStage === 'payment') return 'payment'

  if (attentionStage && ['confirmed', 'payment', 'shipped', 'out_for_delivery', 'delivered', 'problem'].includes(attentionStage)) {
    return attentionStage
  }

  return 'confirmed'
}

function parseCalendarDayTimestamp(dateVal) {
  if (!dateVal) return null
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal)
  if (isNaN(d.getTime())) return null
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/**
 * Applies Future Arrival Date Guardrail and Past Courier Auto-Resolution.
 * - Future arrival date (deliveryDate > now): Never resolves to 'delivered' (downgrades to 'confirmed' / 'shipped').
 * - Past same-day courier (deliveryDate < now & rawStage === 'out_for_delivery'): Auto-resolves to 'delivered'.
 * - Past multi-day transit (shipped/confirmed): Stays in its active stage (does NOT auto-resolve).
 */
export function resolveEffectiveStage(rawStage, deliveryDate, now) {
  if (rawStage === 'problem') {
    return 'problem'
  }
  if (!deliveryDate || !now) {
    return rawStage
  }

  const deliveryDay = parseCalendarDayTimestamp(deliveryDate)
  const nowDay = parseCalendarDayTimestamp(now)

  if (deliveryDay === null || nowDay === null) {
    return rawStage
  }

  // 1. Future Arrival Date Guardrail:
  // If delivery target date is strictly in the future, order CANNOT be marked as 'delivered'.
  if (deliveryDay > nowDay) {
    if (rawStage === 'delivered') {
      return 'confirmed'
    }
    return rawStage
  }

  // 2. Past Courier Auto-Resolution:
  // ONLY same-day courier dispatches ('out_for_delivery') on past calendar days auto-resolve to 'delivered'.
  // 'confirmed', 'payment', 'shipped' do NOT auto-resolve.
  if (deliveryDay < nowDay) {
    if (rawStage === 'out_for_delivery') {
      return 'delivered'
    }
  }

  return rawStage
}

/**
 * Extracts return or claim policy disclaimer footnote.
 */
export function extractPolicyDisclaimer(text) {
  if (!text) return null
  const match = String(text).match(/(?:claims? for (?:missing|wrong|damaged|lost)[^.]*|claims? must be made within[^.]*|return window[^.]*|return (?:by|eligible)[^.]*)/i)
  return match ? match[0].trim() : null
}

/**
 * Determines if item describes perishable grocery or meal kit.
 */
export function isPerishableDelivery(textOrItem) {
  let combined = ''
  if (typeof textOrItem === 'string') {
    combined = textOrItem.toLowerCase()
  } else if (textOrItem && typeof textOrItem === 'object') {
    const desc = textOrItem.description || ''
    const title = textOrItem.event_title || textOrItem.title || ''
    const vendor = textOrItem.vendor || textOrItem.attention_vendor || ''
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

function formatShortMonthDay(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
}

function formatWeekdayMonthDay(date) {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
}

/**
 * Formats glanceable ETA string.
 */
export function formatDeliveryEta(rawEta, deliveryDate, stage, now) {
  if (stage === 'problem') {
    return 'Delivery exception'
  }

  const d = deliveryDate ? (deliveryDate instanceof Date ? deliveryDate : new Date(deliveryDate)) : null
  const isValidDate = d && !isNaN(d.getTime())

  if (stage === 'delivered') {
    if (!isValidDate) return 'Delivered'
    if (now) {
      const dDay = parseCalendarDayTimestamp(d)
      const nDay = parseCalendarDayTimestamp(now)
      if (dDay !== null && nDay !== null) {
        const diffDays = Math.round((dDay - nDay) / (86400000))
        if (diffDays === 0) return 'Delivered today'
        if (diffDays === -1) return 'Delivered yesterday'
        if (diffDays < -1) return `Delivered ${formatShortMonthDay(d)}`
      }
    }
    return `Delivered ${formatShortMonthDay(d)}`
  }

  if (!isValidDate) {
    return rawEta || null
  }

  if (now) {
    const dDay = parseCalendarDayTimestamp(d)
    const nDay = parseCalendarDayTimestamp(now)
    if (dDay !== null && nDay !== null) {
      const diffDays = Math.round((dDay - nDay) / (86400000))
      if (diffDays === 0) {
        return rawEta || 'Today'
      }
      if (diffDays === 1) {
        return rawEta ? `Tomorrow (${rawEta})` : 'Tomorrow'
      }
      if (diffDays > 1) {
        return formatWeekdayMonthDay(d)
      }
      if (dDay < nDay) {
        return `Delivered ${formatShortMonthDay(d)}`
      }
    }
  }

  return rawEta || formatWeekdayMonthDay(d)
}

function extractCost(text) {
  if (!text) return null
  const match = String(text).match(/\$[\d,]+(?:\.\d{2})?/)
  return match ? match[0] : null
}

function extractSummary(text, isPerishable) {
  if (!text) return isPerishable ? 'Grocery Delivery' : 'Package'
  const fullText = String(text).trim()
  const match = fullText.match(/(?:delivered:\s*|delivery of\s+)([A-Za-z0-9\s™+'-]{2,60}?\+\s*\d+\s*items?)/i)
    || fullText.match(/(\d+\s+items?\s+including\s+[A-Za-z0-9\s™+'-]{3,40})/i)
    || fullText.match(/(Delivery of InHome order)/i)
    || fullText.match(/(\d+\s+items?|[A-Za-z0-9\s™+'-]{3,40}(?:Book|Tools|Kit|Packs?|Order|Box))/i)

  return match ? (match[1] || match[0]).trim() : (isPerishable ? 'Grocery Delivery' : 'Package')
}

/**
 * Full deterministic entity resolver conforming to CanonicalEntityResult.
 *
 * @param {object} input
 * @param {{ now?: Date }} [options]
 * @returns {import('../../../src/types').CanonicalEntityResult}
 */
export function resolveCanonicalEntity(input, options) {
  const item = input || {}
  const now = options?.now || (item.now instanceof Date ? item.now : new Date())
  const combined = `${item.title || item.event_title || ''} ${item.description || ''} ${item.text || ''} ${item.source_ref || ''}`.trim()

  // 1. Vendor & Order Resolution
  const vendorDetection = detectVendorAndOrder(combined, item.vendor || item.attention_vendor)
  const carrierDetection = detectCarrierAndTracking(combined)

  const vendor = vendorDetection.vendor || (carrierDetection.carrier ? carrierDetection.carrier.toUpperCase() : 'Parcel')
  const vendorKey = vendorDetection.vendorKey || (carrierDetection.carrier ? carrierDetection.carrier : 'parcel')
  const orderId = vendorDetection.orderId
  const canonicalOrderId = vendorDetection.canonicalOrderId

  const trackingNumber = carrierDetection.trackingNumber || item.trackingNumber || null
  const carrier = carrierDetection.carrier || (item.carrier ? String(item.carrier).toLowerCase() : null)

  // 2. Composite Thread Key
  const dateKey = item.deliveryDate || (item.due_by ? String(item.due_by).slice(0, 10) : item.event_date ? String(item.event_date).slice(0, 10) : item.created_at ? String(item.created_at).slice(0, 10) : null)
  const compositeThreadKey = item.attention_thread_key?.trim() || buildCompositeThreadKey({
    vendor,
    vendorKey,
    orderId,
    canonicalOrderId,
    carrier,
    trackingNumber,
    dateKey,
    sourceRef: item.source_ref,
  })

  // 3. Stage & Date Resolution
  const rawStage = resolveTransactionStage(item)
  const deliveryDateObj = item.deliveryDate ? new Date(item.deliveryDate) : (item.due_by ? new Date(item.due_by) : item.event_date ? new Date(item.event_date) : null)
  const deliveryDateIso = (deliveryDateObj && !isNaN(deliveryDateObj.getTime())) ? deliveryDateObj.toISOString().slice(0, 10) : null
  const effectiveStage = resolveEffectiveStage(rawStage, deliveryDateObj, now)

  // 4. Perishable & Policy Disclaimer
  const isPerishable = isPerishableDelivery(item) || isPerishableDelivery(combined)
  const policyDisclaimer = item.policy_disclaimer || extractPolicyDisclaimer(combined)
  const cost = item.cost || extractCost(combined)
  const itemSummary = item.itemSummary || extractSummary(combined, isPerishable)

  // 5. ETA Display
  const rawEta = item.etaDisplay || item.rawEta || null
  const etaDisplay = formatDeliveryEta(rawEta, deliveryDateObj, effectiveStage, now)

  // 6. Agency Level (0 for passive logistics radar)
  const agencyLevel = typeof item.agency_level === 'number' ? item.agency_level : 0

  return {
    vendor,
    vendorKey,
    orderId,
    canonicalOrderId,
    trackingNumber,
    carrier,
    compositeThreadKey,
    effectiveStage,
    rawStage,
    isPerishable,
    cost,
    itemSummary,
    etaDisplay,
    deliveryDate: deliveryDateIso,
    policyDisclaimer,
    agencyLevel,
  }
}
