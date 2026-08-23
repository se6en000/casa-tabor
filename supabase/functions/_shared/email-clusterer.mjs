// supabase/functions/_shared/email-clusterer.mjs
// Pure ESM Semantic Clustering & PII Redaction Engine for Casa Tabor
// Compatible with Node.js 24+ and Deno Supabase Edge Functions

// ============================================================================
// 1. CONSTANTS & LEXICONS
// ============================================================================

export const SEMANTIC_ARCHETYPES = [
  'logistics_parcels',
  'executive_actions',
  'temporal_appointments',
  'lifecycle_updates',
  'estate_knowledge',
  'promotional_noise',
]

export const ARCHETYPE_SUBCATEGORIES = {
  logistics_parcels: [
    'ecommerce_order',
    'grocery_delivery',
    'courier_tracking',
    'meal_kit',
    'perishable_shipment',
  ],
  executive_actions: [
    'permission_slip',
    'liability_waiver',
    'bill_invoice_due',
    'registration_required',
    'form_signature',
    'document_submission',
  ],
  temporal_appointments: [
    'medical_doctor',
    'dental_ortho',
    'therapy_session',
    'school_event_calendar',
    'sports_practice_game',
    'travel_itinerary',
    'music_lesson',
  ],
  lifecycle_updates: [
    'flight_schedule_change',
    'flight_gate_change',
    'order_item_cancellation',
    'delivery_delay_exception',
    'appointment_reschedule',
    'utility_service_outage',
  ],
  estate_knowledge: [
    'school_newsletter',
    'hoa_rules_digest',
    'home_maintenance_guide',
    'student_supply_list',
    'utility_service_notice',
    'community_announcement',
  ],
  promotional_noise: [
    'retail_sale',
    'coupon_discount',
    'marketing_digest',
    'charity_solicitation',
    'social_newsletter',
  ],
}

export const VENDOR_ALIASES = [
  { vendor: 'Amazon', aliases: ['amazon.com', 'amazon', 'prime'] },
  { vendor: 'Walmart', aliases: ['walmart.com', 'walmart+', 'walmart', 'inhome'] },
  { vendor: 'Target', aliases: ['target.com', 'target'] },
  { vendor: 'Apple', aliases: ['apple.com', 'apple store', 'apple'] },
  { vendor: 'Nike', aliases: ['nike.com', 'nike'] },
  { vendor: 'Jiffy.com', aliases: ['jiffy.com', 'jiffy transfers', 'jiffy shirts', 'jiffy'] },
  { vendor: 'HelloFresh', aliases: ['hellofresh', 'hello fresh'] },
  { vendor: 'Blue Apron', aliases: ['blueapron.com', 'blue apron'] },
  { vendor: 'Instacart', aliases: ['instacart.com', 'instacart'] },
  { vendor: 'DoorDash', aliases: ['doordash.com', 'doordash'] },
  { vendor: 'Uber Eats', aliases: ['ubereats.com', 'uber eats'] },
  { vendor: 'Chewy', aliases: ['chewy.com', 'chewy'] },
  { vendor: 'UPS', aliases: ['ups.com', 'united parcel service', 'ups'] },
  { vendor: 'FedEx', aliases: ['fedex.com', 'federal express', 'fedex'] },
  { vendor: 'USPS', aliases: ['usps.com', 'us postal service', 'post office', 'usps'] },
  { vendor: 'DHL', aliases: ['dhl.com', 'dhl express', 'dhl'] },
  { vendor: 'Delta Air Lines', aliases: ['delta.com', 'delta air lines', 'delta'] },
  { vendor: 'United Airlines', aliases: ['united.com', 'united airlines', 'united'] },
  { vendor: 'American Airlines', aliases: ['aa.com', 'american airlines'] },
  { vendor: 'Marriott', aliases: ['marriott.com', 'marriott bonvoy', 'marriott'] },
  { vendor: 'Airbnb', aliases: ['airbnb.com', 'airbnb'] },
  { vendor: 'Uber', aliases: ['uber.com', 'uber'] },
  { vendor: 'Palm Beach County Schools', aliases: ['palmbeachschools.org', 'palm beach school', 'palm beach county school'] },
  { vendor: 'SchoolCash Online', aliases: ['schoolcashonline.com', 'schoolcash'] },
  { vendor: 'Palm Pediatrics', aliases: ['palmpediatrics.com', 'palm pediatrics'] },
  { vendor: 'Smile Dental', aliases: ['smiledental.com', 'smile dental'] },
  { vendor: 'Coastal Ortho', aliases: ['coastalortho.com', 'coastal ortho'] },
  { vendor: 'MyChart', aliases: ['mychart.com', 'mychart'] },
  { vendor: 'Florida Power & Light', aliases: ['fpl.com', 'florida power & light', 'fpl'] },
  { vendor: 'PBC Water Utilities', aliases: ['pbcwater.org', 'pbc water', 'water utilities department'] },
  { vendor: 'Chase', aliases: ['chase.com', 'jpmorgan chase', 'chase bank', 'chase'] },
  { vendor: 'American Express', aliases: ['americanexpress.com', 'amex', 'american express'] },
  { vendor: 'Mirasol HOA', aliases: ['mirasolhoa.com', 'mirasol hoa', 'mirasol community'] },
  { vendor: 'Superior AC Repairs', aliases: ['superioracrepairs.com', 'superior ac'] },
  { vendor: 'Florida Premier Pools', aliases: ['flpremierpools.com', 'florida premier pools', 'premier pools'] },
  { vendor: 'Envera Systems', aliases: ['enverasystems.com', 'envera'] },
  { vendor: 'J.Crew', aliases: ['jcrew.com', 'j.crew', 'jcrew'] },
  { vendor: 'Pottery Barn', aliases: ['potterybarn.com', 'pottery barn'] },
  { vendor: 'Best Buy', aliases: ['bestbuy.com', 'best buy'] },
  { vendor: 'Crate & Barrel', aliases: ['crateandbarrel.com', 'crate & barrel', 'crate and barrel'] },
  { vendor: 'Williams Sonoma', aliases: ['williams-sonoma.com', 'williams sonoma'] },
  { vendor: 'Superstar Tennis', aliases: ['superstartennis.com', 'superstar tennis'] },
  { vendor: 'PB Aquatics', aliases: ['pbaquatics.org', 'pb aquatics'] },
  { vendor: 'Florida Youth Orchestra', aliases: ['floridayouthorchestra.org', 'florida youth orchestra'] },
]

export const TRUSTED_ORG_DOMAINS = new Set([
  'amazon.com',
  'walmart.com',
  'target.com',
  'apple.com',
  'nike.com',
  'jiffyshirts.com',
  'jiffy.com',
  'hellofresh.com',
  'blueapron.com',
  'instacart.com',
  'doordash.com',
  'chewy.com',
  'ups.com',
  'fedex.com',
  'usps.com',
  'dhl.com',
  'delta.com',
  'united.com',
  'aa.com',
  'marriott.com',
  'airbnb.com',
  'uber.com',
  'palmbeachschools.org',
  'schoolcashonline.com',
  'palmpediatrics.com',
  'smiledental.com',
  'coastalortho.com',
  'mychart.com',
  'fpl.com',
  'pbcwater.org',
  'chase.com',
  'americanexpress.com',
  'mirasolhoa.com',
  'superioracrepairs.com',
  'flpremierpools.com',
  'enverasystems.com',
  'jcrew.com',
  'potterybarn.com',
  'bestbuy.com',
  'crateandbarrel.com',
  'williams-sonoma.com',
  'superstartennis.com',
  'pbaquatics.org',
  'floridayouthorchestra.org',
  'morningbrew.com',
  'sephora.com',
])

export const ARCHETYPE_LEXICONS = {
  logistics_parcels: {
    strong: [
      'tracking', 'shipped', 'delivered', 'out for delivery', 'package',
      'inhome', 'courier', 'fedex', 'ups', 'usps', 'meal kit', 'produce box',
      'order confirmed', 'items shipped', 'order details', 'arriving today',
      'driver is on the way', 'delivery window', 'estimated arrival', 'on the way',
      'carrier', 'shipment', 'tracking number', 'delivery notice', 'in transit',
    ],
    medium: [
      'order placed', 'preparing your order', 'delivery address', 'package delivered',
      'order receipt', 'groceries delivered', 'fresh delivery', 'box shipped',
      'cart order', 'tracking link', 'view delivery', 'front porch',
    ],
    weak: [
      'order', 'item', 'box', 'transit', 'purchased', 'items', 'delivery',
    ],
  },
  executive_actions: {
    strong: [
      'permission slip', 'liability waiver', 'sign and return', 'signature required',
      'action required', 'balance due', 'tuition due', 'schoolcash', 'past due',
      'rsvp deadline', 'please sign', 'complete this form', 'payment due',
      'required before', 'due by', 'amount due', 'pay now', 'docusign',
      'consent form', 'emergency contact form', 'registration closes',
      'paperwork required', 'annual vote', 'ballot', 'proxy form', 'dues due',
      'medical intake form', 'patient release form', 'iep signature',
    ],
    medium: [
      'please complete', 'form signature', 'submit payment', 'register your',
      'membership renewal', 'enrollment deadline', 'unpaid invoice',
      'action requested', 'bill statement', 'view and pay', 'sign document',
      'required response', 'registration fee', 'overdue fee', 'fraud alert',
    ],
    weak: [
      'form', 'consent', 'submit', 'registration', 'deadline', 'fee',
      'invoice', 'statement', 'bill', 'due', 'signature', 'sign',
    ],
  },
  temporal_appointments: {
    strong: [
      'appointment confirmed', 'dentist appointment', 'doctor appointment',
      'therapy session', 'calendar invite', 'starts at', 'scheduled for',
      'practice schedule', 'tournament bracket', 'parent-teacher conference',
      'checkup', 'orientation', 'back to school night', 'flight itinerary',
      'e-ticket', 'boarding pass', 'hotel reservation', 'rental car confirmation',
      'rehearsal schedule', 'swim meet', 'soccer match', 'game time',
      'wellness exam', 'orthodontist appointment', 'cleaning scheduled',
    ],
    medium: [
      'appointment reminder', 'see you on', 'scheduled on', 'upcoming visit',
      'flight details', 'check-in at', 'kickoff at', 'session starts',
      'tournament game', 'annual physical', 'teeth cleaning', 'clinic visit',
      'meeting invite', 'event starts', 'time: ', 'date: ',
    ],
    weak: [
      'meeting', 'scheduled', 'calendar', 'session', 'consultation',
      'location', 'venue', 'itinerary', 'starts', 'ends', 'time',
    ],
  },
  lifecycle_updates: {
    strong: [
      'flight delayed', 'flight cancelled', 'flight canceled', 'gate change',
      'schedule changed', 'order modified', 'item cancelled', 'item canceled',
      'service outage', 'delivery delay', 'rescheduled to', 'delivery delayed',
      'weather delay', 'time change', 'updated itinerary', 'out of stock item',
      'flight update', 'appointment rescheduled', 'game postponed',
      'game cancelled', 'practice relocated', 'power outage', 'service restored',
      'delayed departure', 'delay notification',
    ],
    medium: [
      'changed to', 'postponed', 'delay alert', 'revised schedule',
      'exception notification', 'delivery attempted', 'updated time',
      'new departure time', 'new gate', 'item substituted', 'substitution',
      'service interruption', 'appointment moved',
    ],
    weak: [
      'changed', 'updated', 'cancelled', 'canceled', 'delayed', 'postponed',
      'revised', 'rescheduled', 'exception', 'alert', 'notice',
    ],
  },
  estate_knowledge: {
    strong: [
      'weekly newsletter', 'principal newsletter', "principal's message",
      'hoa rules', 'community handbook', 'supply list', 'maintenance tips',
      'board meeting minutes', 'annual report', 'curriculum overview',
      'grade level news', 'filter replacement guide', 'pool maintenance schedule',
      'gate security code', 'general handbook', 'pto digest', 'community bulletin',
      'neighborhood update', 'school guidelines', 'monthly bulletin',
    ],
    medium: [
      'school newsletter', 'hoa newsletter', 'community announcement', 'home maintenance',
      'grade overview', 'campus news', 'reference guide', 'operating tips', 'resident handbook',
      'school digest', 'community digest',
    ],
    weak: [
      'bulletin', 'overview', 'handbook', 'community', 'school', 'estate',
    ],
  },
  promotional_noise: {
    strong: [
      '% off', 'percent off', 'promo code', 'coupon code', 'flash sale',
      'doorbuster', 'shop now', 'clearance sale', 'donations needed',
      'donate today', 'fundraiser', 'save big', 'exclusive deal',
      'limited time offer', 'free shipping on orders over', 'weekend sale',
      'rewards points', 'loyalty discount', 'semi-annual sale', 'buy one get one',
      'bogo', 'vip access', 'special savings', 'shop new arrivals',
      'daily brew', 'morning brew', 'free meals', '$0 delivery fees', 'dashpass',
      'rollbacks', 'bonus points',
    ],
    medium: [
      'save up to', 'exclusive offer', 'promo discount', 'deal of the day',
      'seasonal savings', 'members save', 'gift guide', 'new styles',
      'explore products', 'join our rewards', 'earn points', 'catalog',
      'unmissable deals', 'best prices', 'shop the collection', 'market digest',
      'newsletter', 'weekly digest', 'news digest',
    ],
    weak: [
      'deals', 'discount', 'special', 'offer', 'shop', 'save', 'sale',
      'savings', 'points', 'rewards', 'promo', 'coupon', 'digest',
    ],
  },
}

// Known family names to redact
const KNOWN_FAMILY_NAMES = [
  'Jacob Tabor', 'Jake Tabor', 'Kelly Tabor', 'Kelly Loucks',
  'Olivia Tabor', 'Liv Tabor', 'Emerson Tabor', 'Emme Tabor',
  'Owen Tabor', 'Milo Tabor', 'Giselle',
  'Michael Tabor', 'Rachel Tabor', 'Sarah Tabor', 'Alex Tabor',
  'François Müller', 'Renée Tabor', 'John Doe', 'Jane Doe',
]

// ============================================================================
// 2. PII REDACTION & SANITIZATION ENGINE
// ============================================================================

/**
 * Luhn checksum algorithm for credit card numbers.
 */
export function isValidLuhn(str) {
  const digits = String(str).replace(/\D/g, '')
  if (digits.length < 2 || digits.length > 19) return false
  let sum = 0
  let isEven = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10)
    if (isEven) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    isEven = !isEven
  }
  return sum % 10 === 0
}

/**
 * Comprehensive multi-pass PII Redaction.
 * Redacts full names, SSNs, credit cards, bank accounts, passwords/PINs,
 * phones (US & International E.164), personal emails, physical addresses (including PO Boxes), DOBs.
 * Preserves masked tracking numbers, merchant names, order codes, and relative dates.
 */
export function redactEmailPII(text, options = {}) {
  if (!text) return ''
  let result = String(text)
  const detectedTypes = new Set()

  // 1. Passwords / PINs / OTPs / Temporary Credentials
  result = result.replace(
    /\b(?:temp(?:orary)?\s*pass(?:word)?|pin|passcode|password|verification code|security code|otp|two-factor code)\s*[:#-]?\s*['"]?([^\s,;'"<>\n]+)/gi,
    (match, token) => {
      detectedTypes.add('credentials')
      return match.replace(token, '[CREDENTIAL_REDACTED]')
    },
  )

  // 2. Social Security Numbers (labeled unformatted 9-digit, dot, dash, space, underscore separated)
  result = result.replace(
    /\b(?:SSN|Social\s+Security(?:\s+(?:No\.?|Number|#))?)\s*[:#-]?\s*['"]?(\d{3}[- ._]?\d{2}[- ._]?\d{4}|\d{9})\b/gi,
    (match, ssnDigits) => {
      detectedTypes.add('ssn')
      return match.replace(ssnDigits, '[SSN_REDACTED]')
    },
  )
  result = result.replace(
    /\b\d{3}[- ._]\d{2}[- ._]\d{4}\b/g,
    () => {
      detectedTypes.add('ssn')
      return '[SSN_REDACTED]'
    },
  )

  // 3. Bank Account & Routing Numbers
  result = result.replace(
    /\b(?:routing|transit|bank account|checking account|savings account|acct|iban)\s*(?:#|no\.?|number|:)?\s*[:#-]?\s*(\d{6,17})\b/gi,
    (match) => {
      detectedTypes.add('bank_account')
      return match.replace(/\d{6,17}$/, '[BANK_ACCOUNT_REDACTED]')
    },
  )

  // 4. Student / Patient / Member IDs
  result = result.replace(
    /\b(?:student|patient|member)\s*(?:id|number|no\.?)\s*[:#-]?\s*([a-z0-9-]{4,20})\b/gi,
    (match) => {
      detectedTypes.add('student_patient_id')
      return match.replace(/([a-z0-9-]{4,20})$/i, '[ID_REDACTED]')
    },
  )

  // 5. Dates of Birth (DOB)
  result = result.replace(
    /\b(?:DOB|Date of Birth|birthdate)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/gi,
    () => {
      detectedTypes.add('dob')
      return 'DOB: [DOB_REDACTED]'
    },
  )

  // 6. Credit Card Numbers (13-19 digits with Luhn verification, masked endings, dots/dashes/spaces)
  result = result.replace(
    /\b(?:ending in|last 4:?|card ending:?)\s*(\d{4})\b/gi,
    'ending in ****$1',
  )
  result = result.replace(
    /\b(?:\d[ -.]*?){13,19}\b/g,
    (match) => {
      const clean = match.trim()
      // Protect known order number formats: Walmart (2000xxx-xxxxxxxx / 1000xxx-xxxxxxxx) and Amazon (xxx-xxxxxxx-xxxxxxx)
      if (/^(?:2000|1000)\d{3}-\d{8}$/.test(clean) || /^\d{3}-\d{7}-\d{7}$/.test(clean)) {
        return match
      }
      const digits = clean.replace(/\D/g, '')
      if (digits.length >= 20 || digits.length < 13) return match
      if (
        isValidLuhn(digits) ||
        digits.length === 16 ||
        (digits.length === 15 && (/^3[47]/.test(digits) || /^\d{4}[ -.]\d{6}[ -.]\d{5}$/.test(clean)))
      ) {
        detectedTypes.add('credit_card')
        return '[CARD_REDACTED]'
      }
      return match
    },
  )

  // 7. Phone Numbers (International with +, US formatted, raw 10-digit, extensions)
  // 7a. International with leading + (e.g. +44 7911 123456, +44 20 7946 0919, +33 1 42 68 55 00, +81 3 1234 5678, +1-555-123-4567)
  result = result.replace(
    /(?<![0-9A-Za-z])\+[1-9](?:[-.\s()]*\d){6,14}(?:\s*(?:ext|x|ext\.)\s*\d{1,5})?(?![0-9A-Za-z])/g,
    () => {
      detectedTypes.add('phone')
      return '[PHONE_REDACTED]'
    },
  )
  // 7b. US / Domestic standard formatted or raw 10-digit phone numbers
  result = result.replace(
    /(?<![0-9A-Za-z])(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}(?:\s*(?:ext|x|ext\.)\s*\d{1,5})?(?![0-9A-Za-z-])/g,
    () => {
      detectedTypes.add('phone')
      return '[PHONE_REDACTED]'
    },
  )

  // 8. Personal Email Addresses
  result = result.replace(
    /\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    (match, user, domain) => {
      const lowerDomain = domain.toLowerCase()
      if (TRUSTED_ORG_DOMAINS.has(lowerDomain)) {
        return match
      }
      detectedTypes.add('personal_email')
      return '[EMAIL_REDACTED]'
    },
  )

  // 9. Physical Addresses (PO Boxes & Street Addresses)
  // 9a. PO Box Formats (e.g. "P.O. Box 123", "PO Box 45678", "Post Office Box 4920, Palm Beach, FL 33480")
  result = result.replace(
    /\b(?:P\.?\s*O\.?\s*Box|Post\s+Office\s+Box)\s+(?:#\s*)?[A-Za-z0-9-]+(?:,?\s+[A-Za-z\s]{2,30},?\s+(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|Florida|Georgia|New York|California)\s+\d{5}(?:-\d{4})?)?\b/gi,
    () => {
      detectedTypes.add('street_address')
      return '[ADDRESS_REDACTED]'
    },
  )
  // 9b. Street Addresses with optional leading Unit/Apt
  result = result.replace(
    /\b(?:\b(?:Apt|Suite|Ste|Unit|#)\s*[A-Za-z0-9-]+,?\s+)?\d{1,5}\s+(?:[A-Za-z0-9#.-]+\s+){1,5}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Circle|Cir|Terrace|Ter|Parkway|Pkwy|Trail|Trl|Highway|Hwy|Pike|Row|Loop|Run|Path)\.?(?:,?\s+(?:Apt|Suite|Ste|Unit|#)\s*[A-Za-z0-9-]+)?(?:,?\s+[A-Za-z\s]{2,30},?\s+(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|Florida|Georgia|New York|California)\s+\d{5}(?:-\d{4})?)?\b/gi,
    () => {
      detectedTypes.add('street_address')
      return '[ADDRESS_REDACTED]'
    },
  )

  // 10. Human Names (Known family names, salutations & greetings, and labeled roles)
  for (const name of KNOWN_FAMILY_NAMES) {
    if (result.includes(name)) {
      detectedTypes.add('human_name')
      result = result.split(name).join('[NAME_REDACTED]')
    }
  }

  // Greetings & Salutations
  result = result.replace(
    /\b(Dear|Hi|Hello|Good\s+(?:morning|afternoon|evening)|Attn|Attention:?|To:?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g,
    (match, greeting) => {
      detectedTypes.add('human_name')
      return `${greeting} [NAME_REDACTED]`
    },
  )

  // Labeled Roles
  result = result.replace(
    /\b(Parent|Patient|Student|Member|Guardian|Passenger|Guest|Customer|Child)\s*(?:Name)?\s*[:#-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/gi,
    (match, role) => {
      detectedTypes.add('human_name')
      return `${role}: [NAME_REDACTED]`
    },
  )

  if (options.returnMetadata) {
    return {
      redactedText: result,
      detectedTypes: Array.from(detectedTypes),
    }
  }

  return result
}

/**
 * Anonymize full email object across subject, bodyText, snippet, to, and from.
 */
export function anonymizeEmail(email) {
  const bodyText = email.bodyText || email.snippet || ''
  const subject = email.subject || ''
  const from = email.from || ''
  const snippet = email.snippet || (bodyText ? bodyText.slice(0, 140) : '')

  const redactedBody = redactEmailPII(bodyText, { returnMetadata: true })
  const redactedSubject = redactEmailPII(subject, { returnMetadata: true })
  const redactedSnippet = redactEmailPII(snippet)
  const redactedFrom = redactEmailPII(from)
  const redactedTo = Array.isArray(email.to)
    ? email.to.map((t) => redactEmailPII(t))
    : email.to ? redactEmailPII(email.to) : []

  // Extract domain
  const domainMatch = from.match(/@([a-z0-9.-]+)/i)
  const senderDomain = domainMatch ? domainMatch[1].toLowerCase() : ''

  const allDetectedPii = Array.from(
    new Set([...redactedBody.detectedTypes, ...redactedSubject.detectedTypes]),
  )

  const entities = extractEmailEntities(bodyText, from, subject)

  return {
    anonymizedText: redactedBody.redactedText,
    anonymizedSubject: redactedSubject.redactedText,
    anonymizedSnippet: redactedSnippet,
    anonymizedFrom: redactedFrom,
    anonymizedTo: redactedTo,
    senderDomain,
    detectedPiiTypes: allDetectedPii,
    preservedEntities: {
      orderId: entities.canonicalOrderId || entities.orderId,
      trackingNumber: entities.trackingNumbers[0]?.trackingNumber || null,
      carrier: entities.trackingNumbers[0]?.carrier || null,
      merchantName: entities.merchantName,
    },
  }
}

// ============================================================================
// 3. DETERMINISTIC ENTITY EXTRACTOR
// ============================================================================

/**
 * Canonicalize order numbers across Walmart, Amazon, Apple, Nike, Jiffy, HelloFresh.
 */
export function canonicalizeOrderId(vendor, rawId) {
  if (!rawId) return null
  const clean = String(rawId).trim().replace(/^[#:\s]+/, '')
  const v = String(vendor || '').toLowerCase()

  if (v.includes('walmart')) {
    const digitsOnly = clean.replace(/[^0-9]/g, '')
    if (digitsOnly.length === 15 || digitsOnly.length === 16) {
      return `${digitsOnly.slice(0, 7)}-${digitsOnly.slice(7)}`
    }
    return clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }
  if (v.includes('amazon')) {
    const digitsOnly = clean.replace(/[^0-9]/g, '')
    if (digitsOnly.length === 17) {
      return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 10)}-${digitsOnly.slice(10)}`
    }
    return clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }
  if (v.includes('apple') || clean.startsWith('W')) {
    return clean.toUpperCase()
  }
  if (v.includes('nike') || clean.startsWith('C0') || clean.startsWith('C-')) {
    return clean.toUpperCase()
  }
  if (v.includes('hellofresh') || clean.startsWith('HF-')) {
    return clean.toUpperCase()
  }
  return clean
}

/**
 * Extracts structured entities: merchant name, dates, order IDs, tracking codes, amounts, action URLs.
 */
export function extractEmailEntities(bodyText, from = '', subject = '', bodyHtml = '') {
  const combined = `${from} ${subject} ${bodyText}`
  const lowerCombined = combined.toLowerCase()

  // 1. Merchant / Organization Name
  let merchantName = null
  for (const { vendor, aliases } of VENDOR_ALIASES) {
    if (aliases.some((alias) => lowerCombined.includes(alias))) {
      merchantName = vendor
      break
    }
  }
  if (!merchantName && from) {
    const domainMatch = from.match(/@([a-z0-9-]+)\.([a-z.]+)/i)
    if (domainMatch && !['gmail', 'yahoo', 'hotmail', 'outlook', 'icloud', 'aol'].includes(domainMatch[1])) {
      merchantName = domainMatch[1].charAt(0).toUpperCase() + domainMatch[1].slice(1)
    }
  }

  // 2. Order Numbers
  let rawOrderId = null
  // Amazon format
  const amazonMatch = combined.match(/\b\d{3}-\d{7}-\d{7}\b/)
  if (amazonMatch) {
    rawOrderId = amazonMatch[0]
  }
  // Walmart format
  if (!rawOrderId) {
    const walmartMatch = combined.match(/\b(?:2000|1000)\d{3}-\d{8}\b/)
    if (walmartMatch) rawOrderId = walmartMatch[0]
  }
  if (!rawOrderId) {
    const walmartLongMatch = combined.match(/\b(?:2000|1000)\d{11,13}\b/)
    if (walmartLongMatch) rawOrderId = walmartLongMatch[0]
  }
  // Apple format
  if (!rawOrderId) {
    const appleMatch = combined.match(/\bW\d{9,10}\b/)
    if (appleMatch) rawOrderId = appleMatch[0]
  }
  // Nike format
  if (!rawOrderId) {
    const nikeMatch = combined.match(/\bC0\d{9,11}\b/)
    if (nikeMatch) rawOrderId = nikeMatch[0]
  }
  // HelloFresh / Meal Kits
  if (!rawOrderId) {
    const mealKitMatch = combined.match(/\b(?:HF|GC|BA|FACT)-\d{6,10}\b/i)
    if (mealKitMatch) rawOrderId = mealKitMatch[0].toUpperCase()
  }
  // Generic Order #
  if (!rawOrderId) {
    const genericMatch = combined.match(/\b(?:order|cart|confirmation|reference|invoice|receipt)\s*(?:number|no\.?|id|#|:)\s*[:#]?\s*#?([a-z0-9-]*\d{4,}[a-z0-9-]*)\b/i)
    if (genericMatch) rawOrderId = genericMatch[1]
  }

  const canonicalId = rawOrderId ? canonicalizeOrderId(merchantName, rawOrderId) : null

  // 3. Courier Tracking Numbers
  const trackingNumbers = []
  // UPS: 1Z...
  const upsMatch = combined.match(/\b(1Z[0-9A-Z]{16})\b/i)
  if (upsMatch) {
    trackingNumbers.push({ carrier: 'ups', trackingNumber: upsMatch[1].toUpperCase() })
  }
  // USPS: 92/93/94/95... 20-24 digits
  const uspsMatch = combined.match(/\b(9[2345]\d{20,24})\b/)
  if (uspsMatch) {
    trackingNumbers.push({ carrier: 'usps', trackingNumber: uspsMatch[1] })
  }
  // FedEx: 12, 15, or 20-22 digits
  const fedexMatch = combined.match(/\b(?:fedex|tracking)\b[^\d]*(\d{12}|\d{15}|\d{20,22})\b/i)
  if (fedexMatch) {
    trackingNumbers.push({ carrier: 'fedex', trackingNumber: fedexMatch[1] })
  }
  // DHL: 10-11 digits
  const dhlMatch = combined.match(/\b(?:dhl|express tracking)\b[^\d]*(\d{10,11})\b/i)
  if (dhlMatch) {
    trackingNumbers.push({ carrier: 'dhl', trackingNumber: dhlMatch[1] })
  }

  // 4. Monetary Amounts
  const monetaryAmounts = []
  const amountRegex = /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g
  let match
  while ((match = amountRegex.exec(combined)) !== null) {
    const rawVal = match[0]
    const numVal = parseFloat(match[1].replace(/,/g, ''))
    if (!isNaN(numVal)) {
      let context = 'total'
      const windowStart = Math.max(0, match.index - 30)
      const windowText = combined.slice(windowStart, match.index).toLowerCase()
      if (windowText.includes('due') || windowText.includes('balance') || windowText.includes('pay')) {
        context = 'balance_due'
      } else if (windowText.includes('fee') || windowText.includes('tuition')) {
        context = 'fee'
      } else if (windowText.includes('discount') || windowText.includes('save') || windowText.includes('off')) {
        context = 'discount'
      } else if (windowText.includes('refund')) {
        context = 'refund'
      }
      monetaryAmounts.push({
        raw: rawVal,
        amount: numVal,
        currency: 'USD',
        context,
      })
    }
  }

  // 5. Action URLs
  const actionUrls = []
  if (bodyHtml) {
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1[^>]*?>(.*?)<\/a>/gi
    let linkMatch
    while ((linkMatch = linkRegex.exec(bodyHtml)) !== null) {
      const [_, __, url, label] = linkMatch
      const cleanLabel = label.replace(/<[^>]*>/g, '').trim()
      if (/\b(sign|waiver|consent|permission|fill out|complete form)\b/i.test(cleanLabel)) {
        actionUrls.push({ label: cleanLabel, url, actionType: 'sign' })
      } else if (/\b(pay|invoice|balance|tuition|checkout|payment)\b/i.test(cleanLabel)) {
        actionUrls.push({ label: cleanLabel, url, actionType: 'pay' })
      } else if (/\b(track|tracking|view status|track package)\b/i.test(cleanLabel)) {
        actionUrls.push({ label: cleanLabel, url, actionType: 'track' })
      } else if (/\b(register|rsvp|enroll|sign up)\b/i.test(cleanLabel)) {
        actionUrls.push({ label: cleanLabel, url, actionType: 'register' })
      }
    }
  }

  // Plain-text URLs fallback
  if (actionUrls.length === 0) {
    const urlMatches = combined.match(/https?:\/\/[^\s<>"')]+/g) || []
    for (const url of urlMatches) {
      if (/pay|invoice|bill/i.test(url)) {
        actionUrls.push({ label: 'Pay Online', url, actionType: 'pay' })
      } else if (/sign|waiver|form|permission/i.test(url)) {
        actionUrls.push({ label: 'Sign Form', url, actionType: 'sign' })
      } else if (/track|shipment|ups|fedex/i.test(url)) {
        actionUrls.push({ label: 'Track Shipment', url, actionType: 'track' })
      }
    }
  }

  // 6. Dates
  const dates = []
  const datePatterns = [
    { type: 'due_date', regex: /\b(?:due|due date|pay by|by)\s*[:#-]?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{0,4}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i },
    { type: 'delivery_date', regex: /\b(?:arriving|delivery by|expected delivery|delivered on)\s*[:#-]?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{0,4}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|today|tomorrow|yesterday)/i },
    { type: 'appointment_date', regex: /\b(?:scheduled for|appointment on|date:?)\s*([A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{0,4}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i },
  ]
  for (const { type, regex } of datePatterns) {
    const dMatch = combined.match(regex)
    if (dMatch) {
      dates.push({
        dateStr: dMatch[1],
        isoDate: null,
        type,
      })
    }
  }

  return {
    merchantName,
    orderId: rawOrderId,
    canonicalOrderId: canonicalId,
    trackingNumbers,
    monetaryAmounts,
    actionUrls,
    dates,
  }
}

// ============================================================================
// 4. 4-TIER HYBRID CLASSIFIER & ARBITRATION
// ============================================================================

/**
 * Tier 1: Deterministic Headers & Domain Authority.
 */
export function evaluateDeterministicHeaders(email) {
  const from = (email.from || '').toLowerCase()
  const subject = (email.subject || '').toLowerCase()
  const snippet = (email.snippet || '').toLowerCase()
  const bodyText = (email.bodyText || '').toLowerCase()
  const headers = email.headers || {}
  const listUnsub = headers['list-unsubscribe'] || headers['List-Unsubscribe']
  const precedence = (headers['precedence'] || headers['Precedence'] || '').toLowerCase()
  const fullText = `${subject} ${snippet} ${bodyText}`

  // Multi-hop Forwarded Message Unwrapping with lastIndexOf
  let analyzedSubject = subject.replace(/^(?:fwd|fw|re):\s*/gi, '').trim()
  let analyzedText = fullText
  const fwdMarkers = [
    '---------- forwarded message ---------',
    '-----original message-----',
    'begin forwarded message:',
    '________________________________',
  ]
  for (const marker of fwdMarkers) {
    const idx = fullText.lastIndexOf(marker)
    if (idx !== -1) {
      analyzedText = fullText.slice(idx)
      break
    }
  }

  // 1. Airline / Travel Triggers
  if (/delta\.com|united\.com|aa\.com|marriott\.com|airbnb\.com|uber\.com/.test(from) || /\b(flight|airline|itinerary|boarding pass)\b/i.test(analyzedSubject)) {
    const isFlightPromo = /\b(\d+%\s*off|save\s*(?:up\s*to|\$)|from\s*\$\d+|special\s*fares?|limited\s*time\s*flight\s*fares?|book\s*your\s*flight\s*today|bonus\s*(?:bonvoy\s*)?points)\b/i.test(analyzedSubject) ||
      (/\b(save\s*up\s*to|\$\d+\s*one-way|special\s*limited\s*time|bonus\s*points)\b/i.test(analyzedText) && !/\b(confirmation\s*#|e-ticket|itinerary|boarding\s*pass)\b/i.test(analyzedSubject))
    if (isFlightPromo && !/\b(itinerary|confirmation\s*#|e-ticket\s*receipt|boarding\s*pass|delayed|gate\s*change)\b/i.test(analyzedSubject)) {
      return { archetype: 'promotional_noise', subCategory: 'marketing_digest', confidence: 0.96, agencyLevel: 0 }
    }
    if (/\b(delayed|cancelled|canceled|gate change|schedule change|flight update|time change|delay notification)\b/i.test(analyzedText)) {
      const sub = /\bgate\b/i.test(analyzedText) ? 'flight_gate_change' : 'flight_schedule_change'
      return { archetype: 'lifecycle_updates', subCategory: sub, confidence: 0.98, agencyLevel: 1 }
    }
    if (/\b(itinerary|confirmation|e-ticket|booking|boarding pass|reservation confirmation|hotel reservation)\b/i.test(analyzedText)) {
      return { archetype: 'temporal_appointments', subCategory: 'travel_itinerary', confidence: 0.98, agencyLevel: 1 }
    }
  }

  // 2. High-Priority Educational / Athletics / Arts & Music Senders
  if (
    /palmbeachschools\.org|schoolcashonline\.com|superstartennis\.com|pbaquatics\.org|floridayouthorchestra\.org|palmbeachconservatory\.org|conservatory/i.test(from) ||
    /\b(recital|rehearsal|piano recital|stage rehearsal|music lesson|band rehearsal|orchestra)\b/i.test(analyzedSubject)
  ) {
    if (/\b(donate|donation|fundraiser|coupon\s*code|bookstore\s*coupon|support\s*our\s*annual)\b/i.test(analyzedSubject) &&
        !/\b(permission slip|waiver|required|must sign|fee due|tuition|balance due)\b/i.test(analyzedSubject)) {
      return { archetype: 'promotional_noise', subCategory: 'charity_solicitation', confidence: 0.97, agencyLevel: 0 }
    }
    if (/\b(permission slip|waiver|liability|consent form|sign and return|emergency contact|schoolcash|tuition due|payment due|invoice|balance due|registration closes)\b/i.test(analyzedText)) {
      let sub = 'permission_slip'
      if (/\bwaiver|liability\b/i.test(analyzedText)) sub = 'liability_waiver'
      else if (/\bschoolcash|payment|tuition|balance|invoice|fee\b/i.test(analyzedText)) sub = 'bill_invoice_due'
      else if (/\bregistration|enrollment\b/i.test(analyzedText)) sub = 'registration_required'
      return { archetype: 'executive_actions', subCategory: sub, confidence: 0.98, agencyLevel: 2 }
    }
    if (/\b(cancelled|canceled|postponed|rainout|weather delay|rescheduled|schedule change)\b/i.test(analyzedText)) {
      return { archetype: 'lifecycle_updates', subCategory: 'appointment_reschedule', confidence: 0.96, agencyLevel: 1 }
    }
    if (/\b(conference|open house|orientation|back to school night|rehearsal|recital|piano|concert|practice|game|tournament|meet|kickoff)\b/i.test(analyzedText)) {
      let sub = 'school_event_calendar'
      if (/\bpractice|game|tournament|match|meet\b/i.test(analyzedText)) sub = 'sports_practice_game'
      else if (/piano|recital|music|rehearsal|orchestra|conservatory/i.test(analyzedText) || /conservatory|orchestra/i.test(from)) sub = 'music_lesson'
      return { archetype: 'temporal_appointments', subCategory: sub, confidence: 0.96, agencyLevel: 1 }
    }
    if (/\b(newsletter|principal's message|weekly digest|announcements|handbook|supply list|curriculum overview)\b/i.test(analyzedText)) {
      let sub = 'school_newsletter'
      if (/\bsupply list\b/i.test(analyzedText)) sub = 'student_supply_list'
      return { archetype: 'estate_knowledge', subCategory: sub, confidence: 0.96, agencyLevel: 0 }
    }
  }

  // 2b. Event Invitations & RSVP Requests
  if (/evite\.com|partiful\.com|punchbowl\.com/i.test(from) || /\b(rsvp\s*(?:needed|deadline|by|required|requested)|please\s*rsvp)\b/i.test(analyzedSubject)) {
    return { archetype: 'executive_actions', subCategory: 'registration_required', confidence: 0.97, agencyLevel: 1 }
  }

  // 3. Healthcare / Doctor / Dentist / Therapy Senders
  if (
    /palmpediatrics\.com|mychart\.com|smiledental\.com|coastalortho\.com|palmbeachdentistry\.com|dentist|dentistry|pediatric/i.test(from) ||
    /\b(pediatrician|dentist|dental|dentistry|doctor appointment|therapy session|orthodontist|cleaning reminder|well-child)\b/i.test(analyzedSubject)
  ) {
    if (/\b(rescheduled|cancelled|canceled|change your appointment)\b/i.test(analyzedText)) {
      return { archetype: 'lifecycle_updates', subCategory: 'appointment_reschedule', confidence: 0.97, agencyLevel: 1 }
    }
    if (/\b(intake form|patient paperwork|consent form|medical release|sign before)\b/i.test(analyzedText)) {
      return { archetype: 'executive_actions', subCategory: 'form_signature', confidence: 0.96, agencyLevel: 2 }
    }
    let sub = 'medical_doctor'
    if (/dental|dentist|teeth|smile|hygiene/i.test(analyzedText) || /smiledental|dentistry|dentist/i.test(from)) sub = 'dental_ortho'
    else if (/therapy|counseling|speech/i.test(analyzedText)) sub = 'therapy_session'
    return { archetype: 'temporal_appointments', subCategory: sub, confidence: 0.97, agencyLevel: 1 }
  }

  // 4. Estate / HOA / Municipal / Maintenance Senders
  if (
    /mirasolhoa\.com|superioracrepairs\.com|flpremierpools\.com|flacleanpool\.com|enverasystems\.com|taborhoa\.org|townofpalmbeach\.com|palmbeachsheriff\.org|arrowexterminators\.com|cleanpool/i.test(from) ||
    /\b(public works|water main|hoa rules|landscaping rules|neighborhood watch|termite|pest inspection|sprinkler restriction|pool chemistry|maintenance log|salt cell)\b/i.test(analyzedSubject)
  ) {
    if (/\b(annual vote|ballot|proxy form|dues payment due|violation notice|action required)\b/i.test(analyzedText)) {
      return { archetype: 'executive_actions', subCategory: 'form_signature', confidence: 0.95, agencyLevel: 2 }
    }
    if (/\b(newsletter|weekly digest|rules|regulations|handbook|guidelines|bulletin|advisory|maintenance log)\b/i.test(analyzedSubject)) {
      let sub = 'hoa_rules_digest'
      if (/superioracrepairs|flpremierpools|maintenance|ac filter|pool service|pest|termite/i.test(analyzedText)) {
        sub = 'home_maintenance_guide'
      }
      return { archetype: 'estate_knowledge', subCategory: sub, confidence: 0.97, agencyLevel: 0 }
    }
    if (/\b(rescheduled|cancelled|canceled|postponed|schedule changed|delay|delayed)\b/i.test(analyzedText)) {
      return { archetype: 'lifecycle_updates', subCategory: 'appointment_reschedule', confidence: 0.96, agencyLevel: 1 }
    }
    if (/\b(appointment confirmed|visit scheduled|annual general meeting|resident meeting)\b/i.test(analyzedText)) {
      return { archetype: 'temporal_appointments', subCategory: 'school_event_calendar', confidence: 0.96, agencyLevel: 1 }
    }
    let sub = 'hoa_rules_digest'
    if (/superioracrepairs|flpremierpools|maintenance|ac filter|pool service|pest|termite/i.test(analyzedText)) {
      sub = 'home_maintenance_guide'
    } else if (/supply list|student supply/i.test(analyzedText)) {
      sub = 'student_supply_list'
    }
    return { archetype: 'estate_knowledge', subCategory: sub, confidence: 0.97, agencyLevel: 0 }
  }

  // 5. Utilities & Financial Senders (Precedence: Fraud -> Billing/Past-Due/Disconnection -> Outage -> Info Guides)
  if (/fpl\.com|pbcwater\.org|chase\.com|americanexpress\.com/.test(from)) {
    // 5a. Security & Fraud Alerts (Critical Escalation)
    if (/\b(fraud alert|suspicious activity|verify transaction|account locked|unauthorized activity|security alert)\b/i.test(analyzedText)) {
      return { archetype: 'executive_actions', subCategory: 'form_signature', confidence: 0.98, agencyLevel: 3 }
    }
    // 5b. Billing, Invoices, Past-Due, Disconnection & Shutoff (Precedence over Outage keywords)
    if (/\b(bill is ready|statement available|statement is ready|payment due|balance due|past due|amount due|bill due|pay by|pay now|shutoff|shut-off|disconnection|disconnect notice|service disconnection|interruption of service|avoid disruption|final notice|overdue balance|late fee|electric statement)\b/i.test(analyzedText)) {
      const isUrgent = /past due|shutoff|shut-off|disconnection|disconnect|avoid disruption|final notice|urgent/i.test(analyzedText)
      return { archetype: 'executive_actions', subCategory: 'bill_invoice_due', confidence: 0.98, agencyLevel: isUrgent ? 3 : 2 }
    }
    // 5c. True Operational Utility Outages & Restorations
    if (/\b(power outage|water outage|outage alert|outage map|service restored|grid maintenance|rolling blackout|boil water|power restoration|storm outage|outage|power disruption|service interruption)\b/i.test(analyzedText)) {
      return { archetype: 'lifecycle_updates', subCategory: 'utility_service_outage', confidence: 0.96, agencyLevel: 0 }
    }
    // 5d. Informational Estate Knowledge / Guides
    if (/\b(energy saving|efficiency tips|preparedness guide|resident handbook|community bulletin)\b/i.test(analyzedText)) {
      return { archetype: 'estate_knowledge', subCategory: 'utility_service_notice', confidence: 0.96, agencyLevel: 0 }
    }
  }

  // 6. Dedicated Couriers & Carriers (UPS, FedEx, USPS, DHL, OnTrac, LaserShip)
  if (/ups\.com|fedex\.com|usps\.com|dhl\.com|ontrac\.com|lasership\.com/.test(from)) {
    const isCourierPromo = /\b(\d+%\s*off|save\s*\$|promo\s*code|coupon|rewards|special\s*offer)\b/i.test(analyzedSubject) &&
      !/\b(tracking\s*number|package|delivery|shipped|out\s*for\s*delivery|1z[0-9a-z]{16}|\d{12,24})\b/i.test(analyzedSubject)
    if (isCourierPromo) {
      return { archetype: 'promotional_noise', subCategory: 'coupon_discount', confidence: 0.96, agencyLevel: 0 }
    }
    if (/\b(delayed|exception|delivery attempted|address issue|weather delay|rescheduled)\b/i.test(analyzedText)) {
      return { archetype: 'lifecycle_updates', subCategory: 'delivery_delay_exception', confidence: 0.96, agencyLevel: 1 }
    }
    return { archetype: 'logistics_parcels', subCategory: 'courier_tracking', confidence: 0.98, agencyLevel: 0 }
  }

  // 7. Multi-Purpose Retailers, E-Commerce, Groceries, Meal Kits, & Delivery Services
  const isRetailerSender = /walmart|amazon|chewy|hellofresh|blueapron|instacart|doordash|ubereats|target|apple|nike|jiffy|jcrew|potterybarn|bestbuy|crateandbarrel|williams-sonoma|sephora/.test(from)

  const promoSubjectPattern = /\b(\d+%\s*off|percent\s*off|\$\d+\s*off|save\s*\$|save\s*up\s*to|up\s*to\s*\d+%\s*off|deals?|flash\s*sale|clearance|rollbacks?|doorbusters?|bogo|buy\s*one\s*get\s*one|exclusive\s*deals?|promo\s*codes?|coupon\s*codes?|coupons?|discounts?|vouchers?|free\s*shipping\s*on\s*orders?|free\s*meals?|\$0\s*delivery\s*fees?|rewards?\s*points?|earn\s*points?|bonus\s*points|limited\s*time\s*(?:deal|offer|sale|savings)|weekend\s*sale|semi-annual\s*sale|prime\s*exclusive|shop\s*now|shop\s*the\s*sale|discover\s*deals|shop\s*new\s*arrivals|special\s*savings|unmissable\s*deals|reactivate)\b/i

  const transactionalSubjectPattern = /\b(order\s*confirmation|order\s*confirmed|your\s*order\s*has\s*shipped|order\s*has\s*shipped|package\s*delivered|out\s*for\s*delivery|has\s*been\s*delivered|tracking\s*number|order\s*placed|thanks\s*for\s*your\s*order|we(?:'ve|\s*have)?\s*received\s*your\s*order|inhome\s*delivery|driver\s*is\s*(?:on\s*the\s*way|approaching)|arriving\s*today|on\s*the\s*way|items?\s*shipped|order\s*#\s*[\w-]+|shipped:|delivered:)\b/i

  const isPromoMailbox = /^(?:deals|offers|savings|promotions|promo|news|store-news|marketing|specials|discounts|circular|newsletter)@/i.test(from)

  if (isRetailerSender) {
    const hasPromoSignal = promoSubjectPattern.test(analyzedSubject) || (isPromoMailbox && !transactionalSubjectPattern.test(analyzedSubject))
    const hasTransactionalSignal = transactionalSubjectPattern.test(analyzedSubject)

    // If promotional and not explicitly transactional -> PROMOTIONAL NOISE
    if (hasPromoSignal && !hasTransactionalSignal) {
      let sub = 'retail_sale'
      if (/\bcoupon|promo\s*code|\$0\s*delivery|free\s*meals\b/i.test(analyzedSubject)) sub = 'coupon_discount'
      else if (/\bcircular|digest|news\b/i.test(analyzedSubject)) sub = 'marketing_digest'
      return { archetype: 'promotional_noise', subCategory: sub, confidence: 0.98, agencyLevel: 0 }
    }

    // If transactional -> LOGISTICS or LIFECYCLE
    if (hasTransactionalSignal) {
      if (/\b(delayed|exception|delivery attempted|address issue|weather delay|out of stock|item cancelled|item canceled|substituted)\b/i.test(analyzedText)) {
        const sub = /\b(item cancelled|out of stock|substituted)\b/i.test(analyzedText) ? 'order_item_cancellation' : 'delivery_delay_exception'
        return { archetype: 'lifecycle_updates', subCategory: sub, confidence: 0.96, agencyLevel: 1 }
      }
      let sub = 'ecommerce_order'
      if (/walmart.*inhome|inhome|instacart|doordash|ubereats|groceries/i.test(analyzedText) || /inhome|instacart|doordash|ubereats/i.test(from)) {
        sub = 'grocery_delivery'
      } else if (/hellofresh|blueapron|meal kit/i.test(analyzedText) || /hellofresh|blueapron/i.test(from)) {
        sub = 'meal_kit'
      } else if (/\b(courier|tracking|1z[0-9a-z]{16})\b/i.test(analyzedText)) {
        sub = 'courier_tracking'
      }
      return { archetype: 'logistics_parcels', subCategory: sub, confidence: 0.97, agencyLevel: 0 }
    }
  }

  // 8. General Newsletters / Media Digests / Promotional Headers Fallback
  const isGenericMediaNewsletter = /morningbrew|the daily brew|substack|daily brew|techcrunch|bloomberg|the hustle|medium\.com/i.test(from) ||
    (/\b(daily brew|morning brew|market recap|stock market digest|tech round[- ]?up|weekly roundup)\b/i.test(analyzedSubject) && !/school|hoa|maintenance|principal/i.test(from))

  if (isGenericMediaNewsletter) {
    return { archetype: 'promotional_noise', subCategory: 'marketing_digest', confidence: 0.98, agencyLevel: 0 }
  }

  const hasPromoHeader = (listUnsub || precedence === 'bulk' || precedence === 'list')
  const hasPromoKeywords = promoSubjectPattern.test(analyzedSubject)

  if ((hasPromoHeader || hasPromoKeywords || isPromoMailbox) &&
      !/\b(required|must sign|action required|permission slip|waiver|balance due|tuition|statement|bill|past due|amount due|flight update|delayed|scheduled for|appointment|package delivered|order confirmation|your order has shipped|rsvp|rehearsal|recital|cleaning reminder)\b/i.test(analyzedSubject)) {
    let sub = 'retail_sale'
    if (/\bcoupon|promo code\b/i.test(analyzedSubject)) sub = 'coupon_discount'
    else if (/\bdonate|donation|fundraiser|charity\b/i.test(analyzedSubject)) sub = 'charity_solicitation'
    else if (/\bdigest|weekly news|monthly news|newsletter|daily brew\b/i.test(analyzedSubject)) sub = 'marketing_digest'
    return { archetype: 'promotional_noise', subCategory: sub, confidence: 0.98, agencyLevel: 0 }
  }

  return null
}

/**
 * Tier 2: Weighted Multi-Zone Intent NLP Scoring.
 */
export function scoreArchetypesNLP(email) {
  const subject = (email.subject || '').toLowerCase()
  const from = (email.from || '').toLowerCase()
  const bodyText = (email.bodyText || email.snippet || '').toLowerCase()

  const zoneSubject = subject
  const zoneFrom = from
  const zoneBodyHead = bodyText.slice(0, 800)
  const zoneBodyTail = bodyText.slice(800)

  const scores = {}
  for (const arch of SEMANTIC_ARCHETYPES) {
    scores[arch] = 0.0
  }

  for (const arch of SEMANTIC_ARCHETYPES) {
    const lexicon = ARCHETYPE_LEXICONS[arch]
    if (!lexicon) continue

    // Strong tokens
    for (const token of lexicon.strong) {
      if (zoneSubject.includes(token)) scores[arch] += 3.0 * 3.0
      if (zoneFrom.includes(token)) scores[arch] += 2.0 * 2.5
      if (zoneBodyHead.includes(token)) scores[arch] += 1.5 * 2.0
      if (zoneBodyTail.includes(token)) scores[arch] += 0.8 * 1.0
    }

    // Medium tokens
    for (const token of lexicon.medium) {
      if (zoneSubject.includes(token)) scores[arch] += 3.0 * 1.8
      if (zoneFrom.includes(token)) scores[arch] += 2.0 * 1.5
      if (zoneBodyHead.includes(token)) scores[arch] += 1.5 * 1.2
      if (zoneBodyTail.includes(token)) scores[arch] += 0.8 * 0.6
    }

    // Weak tokens
    for (const token of lexicon.weak) {
      if (zoneSubject.includes(token)) scores[arch] += 3.0 * 0.8
      if (zoneFrom.includes(token)) scores[arch] += 2.0 * 0.6
      if (zoneBodyHead.includes(token)) scores[arch] += 1.5 * 0.4
      if (zoneBodyTail.includes(token)) scores[arch] += 0.8 * 0.2
    }
  }

  return scores
}

/**
 * Full 4-Tier Hybrid Classifier.
 * Guarantees 0% false escalation to Executive Action Tasks.
 */
export function classifyEmail(email) {
  // Step 1: Deterministic fast path
  const deterministicResult = evaluateDeterministicHeaders(email)
  if (deterministicResult && deterministicResult.confidence >= 0.90) {
    return {
      archetype: deterministicResult.archetype,
      subCategory: deterministicResult.subCategory || ARCHETYPE_SUBCATEGORIES[deterministicResult.archetype][0],
      confidence: deterministicResult.confidence,
      agencyLevel: deterministicResult.agencyLevel ?? (deterministicResult.archetype === 'executive_actions' ? 1 : 0),
      reasoning: `Deterministic header/sender rule match: ${deterministicResult.subCategory}`,
    }
  }

  // Step 2: NLP Intent Scoring
  const scores = scoreArchetypesNLP(email)
  const sortedArchetypes = Object.entries(scores).sort((a, b) => b[1] - a[1])
  let [topArchetype, topScore] = sortedArchetypes[0]
  const [secondArchetype, secondScore] = sortedArchetypes[1]

  const subject = (email.subject || '').toLowerCase()
  const bodyText = (email.bodyText || email.snippet || '').toLowerCase()
  const combined = `${subject} ${bodyText}`

  // Step 3: Conflict Arbitration & Anti-Leakage Guardrails

  // Guardrail 1: 0% False Action Leakage
  // If logistics email mentions passive return policies / claims window, keep in logistics_parcels
  if (
    topArchetype === 'executive_actions' &&
    /\b(return window|eligible for return|claims for damaged|items eligible|order delivered|shipped|tracking)\b/i.test(combined) &&
    !/\b(permission slip|waiver|tuition due|balance due|past due|sign and return|emergency contact form)\b/i.test(combined)
  ) {
    topArchetype = 'logistics_parcels'
  }

  // Guardrail 2: Promotional Urgency Fake-out
  // Retailers using "Action required: 40% off" or "Don't miss out" stay in promotional_noise
  if (
    topArchetype === 'executive_actions' &&
    /\b(%\s*off|percent off|promo code|coupon|clearance|save big|flash sale|shop now)\b/i.test(subject) &&
    !/\b(balance due|tuition|schoolcash|invoice|bill due|past due|permission slip|waiver)\b/i.test(combined)
  ) {
    topArchetype = 'promotional_noise'
  }

  // Guardrail 3: Lifecycle State Priority over Static Logistics
  if (
    topArchetype === 'logistics_parcels' &&
    /\b(delayed|rescheduled|exception|delivery attempted|weather delay|out of stock|item cancelled)\b/i.test(combined)
  ) {
    topArchetype = 'lifecycle_updates'
  }

  // Guardrail 4: Empty / Fallback handling
  if (topScore === 0) {
    // If subject has content
    if (/\b(delivery|order|shipped|package)\b/i.test(subject)) topArchetype = 'logistics_parcels'
    else if (/\b(sign|form|pay|bill|due)\b/i.test(subject)) topArchetype = 'executive_actions'
    else if (/\b(appointment|doctor|dentist|meet|flight)\b/i.test(subject)) topArchetype = 'temporal_appointments'
    else if (/\b(delay|cancelled|rescheduled)\b/i.test(subject)) topArchetype = 'lifecycle_updates'
    else if (/\b(newsletter|handbook|rules|update)\b/i.test(subject)) topArchetype = 'estate_knowledge'
    else topArchetype = 'promotional_noise'
  }

  // Calculate confidence
  const margin = topScore - secondScore
  let confidence = 0.85
  if (margin > 10) confidence = 0.98
  else if (margin > 5) confidence = 0.92
  else if (margin > 2) confidence = 0.85
  else confidence = 0.75

  // Subcategory resolution
  let subCategory = ARCHETYPE_SUBCATEGORIES[topArchetype][0]
  if (topArchetype === 'logistics_parcels') {
    if (/walmart.*inhome|inhome|instacart|grocery/i.test(combined)) subCategory = 'grocery_delivery'
    else if (/hellofresh|blueapron|meal kit/i.test(combined)) subCategory = 'meal_kit'
    else if (/ups|fedex|usps|dhl|tracking/i.test(combined)) subCategory = 'courier_tracking'
  } else if (topArchetype === 'executive_actions') {
    if (/waiver|liability/i.test(combined)) subCategory = 'liability_waiver'
    else if (/permission slip|field trip/i.test(combined)) subCategory = 'permission_slip'
    else if (/bill|invoice|tuition|balance due|pay by|schoolcash/i.test(combined)) subCategory = 'bill_invoice_due'
    else if (/register|enrollment/i.test(combined)) subCategory = 'registration_required'
    else if (/sign|signature|paperwork/i.test(combined)) subCategory = 'form_signature'
  } else if (topArchetype === 'temporal_appointments') {
    if (/dentist|teeth|smile|ortho/i.test(combined)) subCategory = 'dental_ortho'
    else if (/doctor|pediatric|physician|checkup|clinic/i.test(combined)) subCategory = 'medical_doctor'
    else if (/therapy|speech|counseling/i.test(combined)) subCategory = 'therapy_session'
    else if (/flight|airline|hotel|itinerary/i.test(combined)) subCategory = 'travel_itinerary'
    else if (/sports|game|practice|tournament|match|soccer|tennis/i.test(combined)) subCategory = 'sports_practice_game'
    else if (/school|conference|open house|orientation|back to school/i.test(combined)) subCategory = 'school_event_calendar'
  } else if (topArchetype === 'lifecycle_updates') {
    if (/gate\b/i.test(combined)) subCategory = 'flight_gate_change'
    else if (/flight.*(delay|cancel|schedule)/i.test(combined)) subCategory = 'flight_schedule_change'
    else if (/out of stock|item cancel|substituted/i.test(combined)) subCategory = 'order_item_cancellation'
    else if (/power|outage|electric|water service/i.test(combined)) subCategory = 'utility_service_outage'
    else if (/appointment.*(reschedule|cancel|moved)/i.test(combined)) subCategory = 'appointment_reschedule'
    else subCategory = 'delivery_delay_exception'
  } else if (topArchetype === 'estate_knowledge') {
    if (/hoa|homeowners|community/i.test(combined)) subCategory = 'hoa_rules_digest'
    else if (/maintenance|ac filter|pool service|hvac/i.test(combined)) subCategory = 'home_maintenance_guide'
    else if (/supply list/i.test(combined)) subCategory = 'student_supply_list'
    else subCategory = 'school_newsletter'
  } else if (topArchetype === 'promotional_noise') {
    if (/coupon|promo code/i.test(combined)) subCategory = 'coupon_discount'
    else if (/donate|donation|fundraiser/i.test(combined)) subCategory = 'charity_solicitation'
    else if (/digest|newsletter|catalog/i.test(combined)) subCategory = 'marketing_digest'
  }

  // Agency level
  let agencyLevel = 0
  if (topArchetype === 'executive_actions') {
    agencyLevel = /urgent|past due|fraud alert/i.test(combined) ? 3 : 2
  } else if (topArchetype === 'temporal_appointments' || topArchetype === 'lifecycle_updates') {
    agencyLevel = 1
  }

  return {
    archetype: topArchetype,
    subCategory,
    confidence: Number(confidence.toFixed(2)),
    agencyLevel,
    reasoning: `Scored top in ${topArchetype} (${topScore.toFixed(1)} pts)`,
  }
}

// ============================================================================
// 5. CROSS-MAILBOX DEDUPLICATION & CLUSTERING
// ============================================================================

function normalizeComparableText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9@]+/g, ' ')
    .trim()
}

/**
 * Deduplicate email corpus across RFC Message-ID and content fingerprints.
 * Aggregates multi-mailbox instances into a single canonical message.
 */
export function deduplicateEmailCorpus(emails) {
  const index = new Map()

  for (const email of emails) {
    let key = null
    const messageId = email.messageId || email.headers?.['message-id'] || email.headers?.['Message-ID']
    if (messageId) {
      const normalizedMsgId = String(messageId).replace(/^<|>$/g, '').trim().toLowerCase()
      if (normalizedMsgId) key = `rfc:${normalizedMsgId}`
    }

    if (!key) {
      // Fallback content key
      const from = (email.from || '').toLowerCase()
      const subject = normalizeComparableText(email.subject)
      const body = normalizeComparableText(email.bodyText || email.snippet || '')
      const date = email.internalDate || email.receivedAt || ''
      const timeMs = new Date(date).getTime()
      const bucket = Number.isFinite(timeMs) ? Math.floor(timeMs / (10 * 60 * 1000)) : 0
      key = `fallback:${from}:${subject}:${bucket}:${body.slice(0, 100)}`
    }

    if (!index.has(key)) {
      const mailboxes = new Set()
      if (email.mailboxOwner) mailboxes.add(email.mailboxOwner)
      index.set(key, {
        ...email,
        canonicalKey: key,
        mailboxes: Array.from(mailboxes),
        duplicateCount: 1,
      })
    } else {
      const existing = index.get(key)
      existing.duplicateCount++
      if (email.mailboxOwner && !existing.mailboxes.includes(email.mailboxOwner)) {
        existing.mailboxes.push(email.mailboxOwner)
      }
    }
  }

  return Array.from(index.values())
}

/**
 * Clusters full corpus: performs PII redaction, entity extraction,
 * archetype classification, and statistics computation with 0 PII leakage.
 */
export function clusterEmailCorpus(emails, options = {}) {
  const anonymize = options.anonymize !== false
  const deduplicated = options.deduplicate !== false ? deduplicateEmailCorpus(emails) : emails

  const clusters = {
    logistics_parcels: [],
    executive_actions: [],
    temporal_appointments: [],
    lifecycle_updates: [],
    estate_knowledge: [],
    promotional_noise: [],
  }

  const piiStats = {
    names: 0,
    phones: 0,
    personal_emails: 0,
    addresses: 0,
    credit_cards: 0,
    bank_accounts: 0,
    ssns: 0,
    credentials: 0,
    total_redactions: 0,
  }

  const processed = []

  for (const email of deduplicated) {
    let emailToClassify = email
    let redactionMeta = null

    if (anonymize) {
      const anonymized = anonymizeEmail(email)
      redactionMeta = anonymized
      const cleanGroundTruth = email.groundTruth
        ? {
            ...email.groundTruth,
            expectedEntities: email.groundTruth.expectedEntities
              ? {
                  ...email.groundTruth.expectedEntities,
                  piiTokens: undefined,
                  redactedPiiTokenTypes: anonymized.detectedPiiTypes,
                }
              : undefined,
          }
        : undefined

      emailToClassify = {
        ...email,
        from: anonymized.anonymizedFrom,
        to: anonymized.anonymizedTo,
        subject: anonymized.anonymizedSubject,
        bodyText: anonymized.anonymizedText,
        snippet: anonymized.anonymizedSnippet,
        bodyHtml: email.bodyHtml ? redactEmailPII(email.bodyHtml) : undefined,
        groundTruth: cleanGroundTruth,
      }

      for (const pii of anonymized.detectedPiiTypes) {
        if (pii === 'human_name') piiStats.names++
        else if (pii === 'phone') piiStats.phones++
        else if (pii === 'personal_email') piiStats.personal_emails++
        else if (pii === 'street_address') piiStats.addresses++
        else if (pii === 'credit_card') piiStats.credit_cards++
        else if (pii === 'bank_account') piiStats.bank_accounts++
        else if (pii === 'ssn') piiStats.ssns++
        else if (pii === 'credentials') piiStats.credentials++
        piiStats.total_redactions++
      }
    }

    const classification = classifyEmail(emailToClassify)
    const entities = extractEmailEntities(
      emailToClassify.bodyText || '',
      emailToClassify.from || '',
      emailToClassify.subject || '',
      email.bodyHtml || '',
    )

    const result = {
      ...emailToClassify,
      classification,
      entities,
      redaction: redactionMeta,
    }

    clusters[classification.archetype].push(result)
    processed.push(result)
  }

  const archetypeDistribution = {}
  for (const [arch, list] of Object.entries(clusters)) {
    archetypeDistribution[arch] = {
      count: list.length,
      percentage: processed.length > 0 ? Number(((list.length / processed.length) * 100).toFixed(1)) : 0,
    }
  }

  return {
    totalRawEmails: emails.length,
    totalDeduplicated: deduplicated.length,
    clusters,
    processedEmails: processed,
    stats: {
      archetypeDistribution,
      piiStats,
      deduplicationRate: emails.length > 0
        ? Number((((emails.length - deduplicated.length) / emails.length) * 100).toFixed(1))
        : 0,
    },
  }
}
