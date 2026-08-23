// src/lib/email-clustering.ts
// Casa Tabor Autonomous Household Email Intelligence System
// Client-side TypeScript wrapper & type definitions for 6-Archetype Semantic Clustering & PII Redaction

export type SemanticArchetype =
  | 'logistics_parcels'
  | 'executive_actions'
  | 'temporal_appointments'
  | 'lifecycle_updates'
  | 'estate_knowledge'
  | 'promotional_noise'

export type EmailSubCategory =
  | 'ecommerce_order'
  | 'grocery_delivery'
  | 'courier_tracking'
  | 'meal_kit'
  | 'perishable_shipment'
  | 'permission_slip'
  | 'liability_waiver'
  | 'bill_invoice_due'
  | 'registration_required'
  | 'form_signature'
  | 'document_submission'
  | 'medical_doctor'
  | 'dental_ortho'
  | 'therapy_session'
  | 'school_event_calendar'
  | 'sports_practice_game'
  | 'travel_itinerary'
  | 'music_lesson'
  | 'flight_schedule_change'
  | 'flight_gate_change'
  | 'order_item_cancellation'
  | 'delivery_delay_exception'
  | 'appointment_reschedule'
  | 'utility_service_outage'
  | 'school_newsletter'
  | 'hoa_rules_digest'
  | 'home_maintenance_guide'
  | 'student_supply_list'
  | 'utility_service_notice'
  | 'community_announcement'
  | 'retail_sale'
  | 'coupon_discount'
  | 'marketing_digest'
  | 'charity_solicitation'
  | 'social_newsletter'

export type AgencyLevel = 0 | 1 | 2 | 3

export interface StandardEmailMessage {
  id: string
  threadId?: string
  messageId?: string | null
  inReplyTo?: string | null
  references?: string[]
  from: string
  to?: string[]
  cc?: string[]
  subject: string
  snippet?: string
  bodyText?: string
  bodyHtml?: string
  internalDate?: string
  receivedAt?: string
  labelIds?: string[]
  mailboxOwner?: string
  mailboxes?: string[]
  duplicateCount?: number
  canonicalKey?: string
  groundTruth?: {
    archetype: SemanticArchetype
    subCategory: string
    agencyLevel: number
    expectedEntities?: {
      vendor?: string
      orderId?: string
      trackingNumber?: string
      carrier?: 'ups' | 'fedex' | 'usps' | 'dhl'
      appointmentDate?: string
      amountDue?: string
      dueDate?: string
      piiTokens?: string[]
    }
  }
}

export interface EmailClassificationResult {
  archetype: SemanticArchetype
  subCategory: EmailSubCategory | string
  confidence: number
  agencyLevel: AgencyLevel
  reasoning: string
}

export interface RedactionResult {
  anonymizedText: string
  anonymizedSubject: string
  anonymizedSnippet?: string
  anonymizedFrom?: string
  anonymizedTo?: string[]
  senderDomain: string
  detectedPiiTypes: string[]
  preservedEntities: {
    orderId: string | null
    trackingNumber: string | null
    carrier: string | null
    merchantName: string | null
  }
}

export interface ExtractedEntityPayload {
  merchantName: string | null
  orderId: string | null
  canonicalOrderId: string | null
  trackingNumbers: Array<{
    carrier: 'ups' | 'fedex' | 'usps' | 'dhl'
    trackingNumber: string
  }>
  monetaryAmounts: Array<{
    raw: string
    amount: number
    currency: string
    context: 'total' | 'balance_due' | 'fee' | 'discount' | 'refund'
  }>
  actionUrls: Array<{
    label: string
    url: string
    actionType: 'pay' | 'sign' | 'track' | 'register'
  }>
  dates: Array<{
    dateStr: string
    isoDate: string | null
    type: 'due_date' | 'delivery_date' | 'appointment_date'
  }>
}

export interface CorpusClusteringStats {
  archetypeDistribution: Record<
    SemanticArchetype,
    { count: number; percentage: number }
  >
  piiStats: {
    names: number
    phones: number
    personal_emails: number
    addresses: number
    credit_cards: number
    bank_accounts: number
    ssns: number
    credentials: number
    total_redactions: number
  }
  deduplicationRate: number
}

export interface ProcessedEmailItem extends StandardEmailMessage {
  classification: EmailClassificationResult
  entities: ExtractedEntityPayload
  redaction: RedactionResult | null
}

export interface ClusterEmailCorpusResult {
  totalRawEmails: number
  totalDeduplicated: number
  clusters: Record<SemanticArchetype, ProcessedEmailItem[]>
  processedEmails: ProcessedEmailItem[]
  stats: CorpusClusteringStats
}

// ============================================================================
// CLIENT IMPLEMENTATION LOGIC
// ============================================================================

export const SEMANTIC_ARCHETYPES: SemanticArchetype[] = [
  'logistics_parcels',
  'executive_actions',
  'temporal_appointments',
  'lifecycle_updates',
  'estate_knowledge',
  'promotional_noise',
]

const KNOWN_FAMILY_NAMES = [
  'Jacob Tabor', 'Jake Tabor', 'Kelly Tabor', 'Kelly Loucks',
  'Olivia Tabor', 'Liv Tabor', 'Emerson Tabor', 'Emme Tabor',
  'Owen Tabor', 'Milo Tabor', 'Giselle',
  'Michael Tabor', 'Rachel Tabor', 'Sarah Tabor', 'Alex Tabor',
  'François Müller', 'Renée Tabor', 'John Doe', 'Jane Doe',
]

const TRUSTED_DOMAINS = new Set([
  'amazon.com', 'walmart.com', 'target.com', 'apple.com', 'nike.com',
  'jiffyshirts.com', 'jiffy.com', 'hellofresh.com', 'blueapron.com',
  'instacart.com', 'doordash.com', 'chewy.com', 'ups.com', 'fedex.com',
  'usps.com', 'dhl.com', 'delta.com', 'united.com', 'aa.com', 'marriott.com',
  'airbnb.com', 'uber.com', 'palmbeachschools.org', 'schoolcashonline.com',
  'palmpediatrics.com', 'smiledental.com', 'coastalortho.com', 'mychart.com',
  'fpl.com', 'pbcwater.org', 'chase.com', 'americanexpress.com',
  'mirasolhoa.com', 'superioracrepairs.com', 'flpremierpools.com',
  'enverasystems.com', 'jcrew.com', 'potterybarn.com', 'bestbuy.com',
  'crateandbarrel.com', 'williams-sonoma.com', 'superstartennis.com',
  'pbaquatics.org', 'floridayouthorchestra.org', 'morningbrew.com', 'sephora.com',
])

export function isValidLuhn(str: string | number): boolean {
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

export function redactEmailPII(text: string): string {
  if (!text) return ''
  let result = String(text)

  // 1. Credentials / Passwords / PINs / OTPs
  result = result.replace(
    /\b(?:temp(?:orary)?\s*pass(?:word)?|pin|passcode|password|verification code|security code|otp|two-factor code)\s*[:#-]?\s*['"]?([^\s,;'"<>\n]+)/gi,
    (match, token) => match.replace(token, '[CREDENTIAL_REDACTED]'),
  )

  // 2. SSN: labeled unformatted 9-digit, dot, dash, space, underscore separated
  result = result.replace(
    /\b(?:SSN|Social\s+Security(?:\s+(?:No\.?|Number|#))?)\s*[:#-]?\s*['"]?(\d{3}[- ._]?\d{2}[- ._]?\d{4}|\d{9})\b/gi,
    (match, ssnDigits) => match.replace(ssnDigits, '[SSN_REDACTED]'),
  )
  result = result.replace(
    /\b\d{3}[- ._]\d{2}[- ._]\d{4}\b/g,
    '[SSN_REDACTED]',
  )

  // 3. Bank Account & Routing Numbers
  result = result.replace(
    /\b(?:routing|transit|bank account|checking account|savings account|acct|iban)\s*(?:#|no\.?|number|:)?\s*[:#-]?\s*(\d{6,17})\b/gi,
    (match) => match.replace(/\d{6,17}$/, '[BANK_ACCOUNT_REDACTED]'),
  )

  // 4. Student / Patient IDs
  result = result.replace(
    /\b(?:student|patient|member)\s*(?:id|number|no\.?)\s*[:#-]?\s*([a-z0-9-]{4,20})\b/gi,
    (match) => match.replace(/([a-z0-9-]{4,20})$/i, '[ID_REDACTED]'),
  )

  // 5. DOB
  result = result.replace(
    /\b(?:DOB|Date of Birth|birthdate)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/gi,
    'DOB: [DOB_REDACTED]',
  )

  // 6. Credit Cards (Luhn verified PANs, 15/16 digits, dot/dash/space separated)
  result = result.replace(
    /\b(?:ending in|last 4:?|card ending:?)\s*(\d{4})\b/gi,
    'ending in ****$1',
  )
  result = result.replace(/\b(?:\d[ -.]*?){13,19}\b/g, (match) => {
    const clean = match.trim()
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
      return '[CARD_REDACTED]'
    }
    return match
  })

  // 7. Phone Numbers (International with +, US formatted, raw 10-digit)
  result = result.replace(
    /(?<![0-9A-Za-z])\+[1-9](?:[-.\s()]*\d){6,14}(?:\s*(?:ext|x|ext\.)\s*\d{1,5})?(?![0-9A-Za-z])/g,
    '[PHONE_REDACTED]',
  )
  result = result.replace(
    /(?<![0-9A-Za-z])(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}(?:\s*(?:ext|x|ext\.)\s*\d{1,5})?(?![0-9A-Za-z-])/g,
    '[PHONE_REDACTED]',
  )

  // 8. Personal Emails
  result = result.replace(
    /\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g,
    (match, _user, domain) => {
      if (TRUSTED_DOMAINS.has(domain.toLowerCase())) return match
      return '[EMAIL_REDACTED]'
    },
  )

  // 9. Physical Street Addresses & PO Boxes
  result = result.replace(
    /\b(?:P\.?\s*O\.?\s*Box|Post\s+Office\s+Box)\s+(?:#\s*)?[A-Za-z0-9-]+(?:,?\s+[A-Za-z\s]{2,30},?\s+(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|Florida|Georgia|New York|California)\s+\d{5}(?:-\d{4})?)?\b/gi,
    '[ADDRESS_REDACTED]',
  )
  result = result.replace(
    /\b(?:\b(?:Apt|Suite|Ste|Unit|#)\s*[A-Za-z0-9-]+,?\s+)?\d{1,5}\s+(?:[A-Za-z0-9#.-]+\s+){1,5}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Circle|Cir|Terrace|Ter|Parkway|Pkwy|Trail|Trl|Highway|Hwy|Pike|Row|Loop|Run|Path)\.?(?:,?\s+(?:Apt|Suite|Ste|Unit|#)\s*[A-Za-z0-9-]+)?(?:,?\s+[A-Za-z\s]{2,30},?\s+(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|Florida|Georgia|New York|California)\s+\d{5}(?:-\d{4})?)?\b/gi,
    '[ADDRESS_REDACTED]',
  )

  // 10. Human Names & Greetings
  for (const name of KNOWN_FAMILY_NAMES) {
    if (result.includes(name)) {
      result = result.split(name).join('[NAME_REDACTED]')
    }
  }
  result = result.replace(
    /\b(Dear|Hi|Hello|Good\s+(?:morning|afternoon|evening)|Attn|Attention:?|To:?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g,
    '$1 [NAME_REDACTED]',
  )
  result = result.replace(
    /\b(Parent|Patient|Student|Member|Guardian|Passenger|Guest|Customer|Child)\s*(?:Name)?\s*[:#-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/gi,
    '$1: [NAME_REDACTED]',
  )

  return result
}

export function canonicalizeOrderId(vendor: string | null | undefined, rawId: string): string | null {
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

export function extractEmailEntities(
  bodyText: string,
  from = '',
  subject = '',
  bodyHtml = '',
): ExtractedEntityPayload {
  const combined = `${from} ${subject} ${bodyText}`
  const lowerCombined = combined.toLowerCase()

  let merchantName: string | null = null
  const knownVendors = [
    { vendor: 'Amazon', aliases: ['amazon.com', 'amazon', 'prime'] },
    { vendor: 'Walmart', aliases: ['walmart.com', 'walmart+', 'walmart', 'inhome'] },
    { vendor: 'Target', aliases: ['target.com', 'target'] },
    { vendor: 'Apple', aliases: ['apple.com', 'apple store', 'apple'] },
    { vendor: 'Nike', aliases: ['nike.com', 'nike'] },
    { vendor: 'Jiffy.com', aliases: ['jiffy.com', 'jiffy transfers', 'jiffy shirts', 'jiffy'] },
    { vendor: 'HelloFresh', aliases: ['hellofresh', 'hello fresh'] },
    { vendor: 'Blue Apron', aliases: ['blueapron.com', 'blue apron'] },
    { vendor: 'Instacart', aliases: ['instacart.com', 'instacart'] },
    { vendor: 'Chewy', aliases: ['chewy.com', 'chewy'] },
    { vendor: 'UPS', aliases: ['ups.com', 'united parcel service', 'ups'] },
    { vendor: 'FedEx', aliases: ['fedex.com', 'federal express', 'fedex'] },
    { vendor: 'USPS', aliases: ['usps.com', 'us postal service', 'post office', 'usps'] },
    { vendor: 'DHL', aliases: ['dhl.com', 'dhl express', 'dhl'] },
    { vendor: 'Delta Air Lines', aliases: ['delta.com', 'delta air lines', 'delta'] },
    { vendor: 'United Airlines', aliases: ['united.com', 'united airlines', 'united'] },
    { vendor: 'American Airlines', aliases: ['aa.com', 'american airlines'] },
    { vendor: 'Palm Beach County Schools', aliases: ['palmbeachschools.org', 'palm beach school'] },
    { vendor: 'Florida Power & Light', aliases: ['fpl.com', 'florida power & light', 'fpl'] },
    { vendor: 'PBC Water Utilities', aliases: ['pbcwater.org', 'pbc water'] },
    { vendor: 'Chase', aliases: ['chase.com', 'jpmorgan chase', 'chase'] },
    { vendor: 'Mirasol HOA', aliases: ['mirasolhoa.com', 'mirasol hoa'] },
  ]
  for (const { vendor, aliases } of knownVendors) {
    if (aliases.some((alias) => lowerCombined.includes(alias))) {
      merchantName = vendor
      break
    }
  }

  let rawOrderId: string | null = null
  const amazonMatch = combined.match(/\b\d{3}-\d{7}-\d{7}\b/)
  if (amazonMatch) rawOrderId = amazonMatch[0]
  if (!rawOrderId) {
    const walmartMatch = combined.match(/\b(?:2000|1000)\d{3}-\d{8}\b/)
    if (walmartMatch) rawOrderId = walmartMatch[0]
  }
  if (!rawOrderId) {
    const walmartLongMatch = combined.match(/\b(?:2000|1000)\d{11,13}\b/)
    if (walmartLongMatch) rawOrderId = walmartLongMatch[0]
  }
  if (!rawOrderId) {
    const appleMatch = combined.match(/\bW\d{9,10}\b/)
    if (appleMatch) rawOrderId = appleMatch[0]
  }
  if (!rawOrderId) {
    const nikeMatch = combined.match(/\bC0\d{9,11}\b/)
    if (nikeMatch) rawOrderId = nikeMatch[0]
  }
  if (!rawOrderId) {
    const mealKitMatch = combined.match(/\b(?:HF|GC|BA|FACT)-\d{6,10}\b/i)
    if (mealKitMatch) rawOrderId = mealKitMatch[0].toUpperCase()
  }
  if (!rawOrderId) {
    const genericMatch = combined.match(/\b(?:order|cart|confirmation|reference|invoice|receipt)\s*(?:number|no\.?|id|#|:)\s*[:#]?\s*#?([a-z0-9-]*\d{4,}[a-z0-9-]*)\b/i)
    if (genericMatch) rawOrderId = genericMatch[1]
  }

  const canonicalId = rawOrderId ? canonicalizeOrderId(merchantName, rawOrderId) : null

  const trackingNumbers: ExtractedEntityPayload['trackingNumbers'] = []
  const upsMatch = combined.match(/\b(1Z[0-9A-Z]{16})\b/i)
  if (upsMatch) trackingNumbers.push({ carrier: 'ups', trackingNumber: upsMatch[1].toUpperCase() })
  const uspsMatch = combined.match(/\b(9[2345]\d{20,24})\b/)
  if (uspsMatch) trackingNumbers.push({ carrier: 'usps', trackingNumber: uspsMatch[1] })
  const fedexMatch = combined.match(/\b(?:fedex|tracking)\b[^\d]*(\d{12}|\d{15}|\d{20,22})\b/i)
  if (fedexMatch) trackingNumbers.push({ carrier: 'fedex', trackingNumber: fedexMatch[1] })
  const dhlMatch = combined.match(/\b(?:dhl|express tracking)\b[^\d]*(\d{10,11})\b/i)
  if (dhlMatch) trackingNumbers.push({ carrier: 'dhl', trackingNumber: dhlMatch[1] })

  const monetaryAmounts: ExtractedEntityPayload['monetaryAmounts'] = []
  const amountRegex = /\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/g
  let match: RegExpExecArray | null
  while ((match = amountRegex.exec(combined)) !== null) {
    const rawVal = match[0]
    const numVal = parseFloat(match[1].replace(/,/g, ''))
    if (!isNaN(numVal)) {
      let context: ExtractedEntityPayload['monetaryAmounts'][0]['context'] = 'total'
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
      monetaryAmounts.push({ raw: rawVal, amount: numVal, currency: 'USD', context })
    }
  }

  const actionUrls: ExtractedEntityPayload['actionUrls'] = []
  if (bodyHtml) {
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1[^>]*?>(.*?)<\/a>/gi
    let linkMatch: RegExpExecArray | null
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

  const dates: ExtractedEntityPayload['dates'] = []
  const datePatterns: Array<{ type: ExtractedEntityPayload['dates'][0]['type']; regex: RegExp }> = [
    { type: 'due_date', regex: /\b(?:due|due date|pay by|by)\s*[:#-]?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{0,4}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i },
    { type: 'delivery_date', regex: /\b(?:arriving|delivery by|expected delivery|delivered on)\s*[:#-]?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{0,4}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|today|tomorrow|yesterday)/i },
    { type: 'appointment_date', regex: /\b(?:scheduled for|appointment on|date:?)\s*([A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{0,4}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i },
  ]
  for (const { type, regex } of datePatterns) {
    const dMatch = combined.match(regex)
    if (dMatch) {
      dates.push({ dateStr: dMatch[1], isoDate: null, type })
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

export function classifyEmail(email: StandardEmailMessage): EmailClassificationResult {
  const from = (email.from || '').toLowerCase()
  const subject = (email.subject || '').toLowerCase()
  const snippet = (email.snippet || '').toLowerCase()
  const bodyText = (email.bodyText || '').toLowerCase()
  const fullText = `${subject} ${snippet} ${bodyText}`

  // Multi-hop Forwarded Message Unwrapping
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

  // 1. Airlines / Travel
  if (/delta\.com|united\.com|aa\.com|marriott\.com|airbnb\.com|uber\.com/.test(from) || /\b(flight|airline|itinerary|boarding pass)\b/i.test(analyzedSubject)) {
    const isFlightPromo = /\b(\d+%\s*off|save\s*(?:up\s*to|\$)|from\s*\$\d+|special\s*fares?|limited\s*time\s*flight\s*fares?|book\s*your\s*flight\s*today|bonus\s*(?:bonvoy\s*)?points)\b/i.test(analyzedSubject) ||
      (/\b(save\s*up\s*to|\$\d+\s*one-way|special\s*limited\s*time|bonus\s*points)\b/i.test(analyzedText) && !/\b(confirmation\s*#|e-ticket|itinerary|boarding\s*pass)\b/i.test(analyzedSubject))
    if (isFlightPromo && !/\b(itinerary|confirmation\s*#|e-ticket\s*receipt|boarding\s*pass|delayed|gate\s*change)\b/i.test(analyzedSubject)) {
      return { archetype: 'promotional_noise', subCategory: 'marketing_digest', confidence: 0.96, agencyLevel: 0, reasoning: 'Airline promotional offer' }
    }
    if (/\b(delayed|cancelled|canceled|gate change|schedule change|flight update|time change)\b/i.test(analyzedText)) {
      const sub: EmailSubCategory = /\bgate\b/i.test(analyzedText) ? 'flight_gate_change' : 'flight_schedule_change'
      return { archetype: 'lifecycle_updates', subCategory: sub, confidence: 0.98, agencyLevel: 1, reasoning: 'Airline schedule or gate update' }
    }
    if (/\b(itinerary|confirmation|e-ticket|booking|boarding pass|reservation confirmation|hotel reservation)\b/i.test(analyzedText)) {
      return { archetype: 'temporal_appointments', subCategory: 'travel_itinerary', confidence: 0.98, agencyLevel: 1, reasoning: 'Travel itinerary or booking confirmation' }
    }
  }

  // 2. Pure Couriers
  if (/ups\.com|fedex\.com|usps\.com|dhl\.com|ontrac\.com|lasership\.com/.test(from)) {
    const isCourierPromo = /\b(\d+%\s*off|save\s*\$|promo\s*code|coupon|rewards|special\s*offer)\b/i.test(analyzedSubject) &&
      !/\b(tracking\s*number|package|delivery|shipped|out\s*for\s*delivery|1z[0-9a-z]{16}|\d{12,24})\b/i.test(analyzedSubject)
    if (isCourierPromo) {
      return { archetype: 'promotional_noise', subCategory: 'coupon_discount', confidence: 0.96, agencyLevel: 0, reasoning: 'Courier promotional discount' }
    }
    if (/\b(delayed|exception|delivery attempted|address issue|weather delay|rescheduled)\b/i.test(analyzedText)) {
      return { archetype: 'lifecycle_updates', subCategory: 'delivery_delay_exception', confidence: 0.96, agencyLevel: 1, reasoning: 'Courier delay exception' }
    }
    return { archetype: 'logistics_parcels', subCategory: 'courier_tracking', confidence: 0.98, agencyLevel: 0, reasoning: 'Courier parcel tracking' }
  }

  // 3. Multi-Purpose Retailers & Senders
  const isRetailerSender = /walmart|amazon|chewy|hellofresh|blueapron|instacart|doordash|ubereats|target|apple|nike|jiffy|jcrew|potterybarn|bestbuy|crateandbarrel|williams-sonoma|sephora/.test(from)
  const promoSubjectPattern = /\b(\d+%\s*off|percent\s*off|\$\d+\s*off|save\s*\$|save\s*up\s*to|up\s*to\s*\d+%\s*off|deals?|flash\s*sale|clearance|rollbacks?|doorbusters?|bogo|buy\s*one\s*get\s*one|exclusive\s*deals?|promo\s*codes?|coupon\s*codes?|coupons?|discounts?|vouchers?|free\s*shipping\s*on\s*orders?|free\s*meals?|\$0\s*delivery\s*fees?|rewards?\s*points?|earn\s*points?|bonus\s*points|limited\s*time\s*(?:deal|offer|sale|savings)|weekend\s*sale|semi-annual\s*sale|prime\s*exclusive|shop\s*now|shop\s*the\s*sale|discover\s*deals|shop\s*new\s*arrivals|special\s*savings|unmissable\s*deals|reactivate)\b/i
  const transactionalSubjectPattern = /\b(order\s*confirmation|order\s*confirmed|your\s*order\s*has\s*shipped|order\s*has\s*shipped|package\s*delivered|out\s*for\s*delivery|has\s*been\s*delivered|tracking\s*number|order\s*placed|thanks\s*for\s*your\s*order|we(?:'ve|\s*have)?\s*received\s*your\s*order|inhome\s*delivery|driver\s*is\s*(?:on\s*the\s*way|approaching)|arriving\s*today|on\s*the\s*way|items?\s*shipped|order\s*#\s*[\w-]+|shipped:|delivered:)\b/i
  const isPromoMailbox = /^(?:deals|offers|savings|promotions|promo|news|store-news|marketing|specials|discounts|circular|newsletter)@/i.test(from)

  if (isRetailerSender) {
    const hasPromoSignal = promoSubjectPattern.test(analyzedSubject) || (isPromoMailbox && !transactionalSubjectPattern.test(analyzedSubject))
    const hasTransactionalSignal = transactionalSubjectPattern.test(analyzedSubject)

    if (hasPromoSignal && !hasTransactionalSignal) {
      let sub: EmailSubCategory = 'retail_sale'
      if (/\bcoupon|promo\s*code|\$0\s*delivery|free\s*meals\b/i.test(analyzedSubject)) sub = 'coupon_discount'
      else if (/\bcircular|digest|news\b/i.test(analyzedSubject)) sub = 'marketing_digest'
      return { archetype: 'promotional_noise', subCategory: sub, confidence: 0.98, agencyLevel: 0, reasoning: 'Retail promotional deal or discount' }
    }

    if (hasTransactionalSignal) {
      if (/\b(delayed|exception|delivery attempted|address issue|weather delay|out of stock|item cancelled|item canceled|substituted)\b/i.test(analyzedText)) {
        const sub: EmailSubCategory = /\b(item cancelled|out of stock|substituted)\b/i.test(analyzedText) ? 'order_item_cancellation' : 'delivery_delay_exception'
        return { archetype: 'lifecycle_updates', subCategory: sub, confidence: 0.96, agencyLevel: 1, reasoning: 'Delivery delay or cancellation' }
      }
      let sub: EmailSubCategory = 'ecommerce_order'
      if (/walmart.*inhome|inhome|instacart|doordash|ubereats|groceries/i.test(analyzedText) || /inhome|instacart|doordash|ubereats/i.test(from)) {
        sub = 'grocery_delivery'
      } else if (/hellofresh|blueapron|meal kit/i.test(analyzedText) || /hellofresh|blueapron/i.test(from)) {
        sub = 'meal_kit'
      } else if (/\b(courier|tracking|1z[0-9a-z]{16})\b/i.test(analyzedText)) {
        sub = 'courier_tracking'
      }
      return { archetype: 'logistics_parcels', subCategory: sub, confidence: 0.97, agencyLevel: 0, reasoning: 'Order fulfillment or delivery' }
    }
  }

  // 4. School & Youth Athletics
  if (/palmbeachschools\.org|schoolcashonline\.com|superstartennis\.com|pbaquatics\.org|floridayouthorchestra\.org/.test(from)) {
    if (/\b(permission slip|waiver|liability|consent form|sign and return|emergency contact|schoolcash|tuition due|payment due|invoice|balance due|registration closes)\b/i.test(analyzedText)) {
      let sub: EmailSubCategory = 'permission_slip'
      if (/\bwaiver|liability\b/i.test(analyzedText)) sub = 'liability_waiver'
      else if (/\bschoolcash|payment|tuition|balance|invoice|fee\b/i.test(analyzedText)) sub = 'bill_invoice_due'
      else if (/\bregistration|enrollment\b/i.test(analyzedText)) sub = 'registration_required'
      return { archetype: 'executive_actions', subCategory: sub, confidence: 0.98, agencyLevel: 2, reasoning: 'School or athletics action item' }
    }
    if (/\b(conference|open house|orientation|back to school night|rehearsal|practice|game|tournament|meet|kickoff)\b/i.test(analyzedText)) {
      let sub: EmailSubCategory = 'school_event_calendar'
      if (/\bpractice|game|tournament|match|meet\b/i.test(analyzedText)) sub = 'sports_practice_game'
      return { archetype: 'temporal_appointments', subCategory: sub, confidence: 0.96, agencyLevel: 1, reasoning: 'School or sports calendar event' }
    }
    if (/\b(newsletter|principal's message|weekly digest|announcements|handbook|supply list|curriculum overview)\b/i.test(analyzedText)) {
      let sub: EmailSubCategory = 'school_newsletter'
      if (/\bsupply list\b/i.test(analyzedText)) sub = 'student_supply_list'
      return { archetype: 'estate_knowledge', subCategory: sub, confidence: 0.96, agencyLevel: 0, reasoning: 'School informational bulletin' }
    }
  }

  // 5. Healthcare
  if (/palmpediatrics\.com|mychart\.com|smiledental\.com|coastalortho\.com/.test(from) || /\b(pediatrician|dentist|doctor appointment|therapy session|orthodontist)\b/i.test(analyzedSubject)) {
    if (/\b(rescheduled|cancelled|canceled|change your appointment)\b/i.test(analyzedText)) {
      return { archetype: 'lifecycle_updates', subCategory: 'appointment_reschedule', confidence: 0.97, agencyLevel: 1, reasoning: 'Rescheduled medical appointment' }
    }
    if (/\b(intake form|patient paperwork|consent form|medical release|sign before)\b/i.test(analyzedText)) {
      return { archetype: 'executive_actions', subCategory: 'form_signature', confidence: 0.96, agencyLevel: 2, reasoning: 'Medical intake or consent paperwork' }
    }
    let sub: EmailSubCategory = 'medical_doctor'
    if (/dental|dentist|teeth|smile/i.test(analyzedText) || /smiledental/i.test(from)) sub = 'dental_ortho'
    else if (/therapy|counseling|speech/i.test(analyzedText)) sub = 'therapy_session'
    return { archetype: 'temporal_appointments', subCategory: sub, confidence: 0.97, agencyLevel: 1, reasoning: 'Doctor or dental appointment' }
  }

  // 6. Estate / HOA / Maintenance
  if (/mirasolhoa\.com|superioracrepairs\.com|flpremierpools\.com|enverasystems\.com/.test(from)) {
    if (/\b(annual vote|ballot|proxy form|dues payment due|violation notice|action required)\b/i.test(analyzedText)) {
      return { archetype: 'executive_actions', subCategory: 'form_signature', confidence: 0.95, agencyLevel: 2, reasoning: 'HOA vote or dues notice' }
    }
    let sub: EmailSubCategory = 'hoa_rules_digest'
    if (/superioracrepairs|flpremierpools|maintenance|ac filter|pool service/i.test(analyzedText)) {
      sub = 'home_maintenance_guide'
    }
    return { archetype: 'estate_knowledge', subCategory: sub, confidence: 0.97, agencyLevel: 0, reasoning: 'HOA or home maintenance guide' }
  }

  // 7. Utilities & Financial Senders (Precedence: Fraud -> Billing/Past-Due/Disconnection -> Outage -> Info Guides)
  if (/fpl\.com|pbcwater\.org|chase\.com|americanexpress\.com/.test(from)) {
    if (/\b(fraud alert|suspicious activity|verify transaction|account locked|unauthorized activity|security alert)\b/i.test(analyzedText)) {
      return { archetype: 'executive_actions', subCategory: 'form_signature', confidence: 0.98, agencyLevel: 3, reasoning: 'Financial or security fraud alert' }
    }
    if (/\b(bill is ready|statement available|statement is ready|payment due|balance due|past due|amount due|bill due|pay by|pay now|shutoff|shut-off|disconnection|disconnect notice|service disconnection|interruption of service|avoid disruption|final notice|overdue balance|late fee|electric statement)\b/i.test(analyzedText)) {
      const isUrgent = /past due|shutoff|shut-off|disconnection|disconnect|avoid disruption|final notice|urgent/i.test(analyzedText)
      return { archetype: 'executive_actions', subCategory: 'bill_invoice_due', confidence: 0.98, agencyLevel: isUrgent ? 3 : 2, reasoning: 'Utility or credit card bill due' }
    }
    if (/\b(power outage|water outage|outage alert|outage map|service restored|grid maintenance|rolling blackout|boil water|power restoration|storm outage|outage|power disruption|service interruption)\b/i.test(analyzedText)) {
      return { archetype: 'lifecycle_updates', subCategory: 'utility_service_outage', confidence: 0.96, agencyLevel: 0, reasoning: 'Utility service outage or restoration' }
    }
    if (/\b(energy saving|efficiency tips|preparedness guide|resident handbook|community bulletin)\b/i.test(analyzedText)) {
      return { archetype: 'estate_knowledge', subCategory: 'utility_service_notice', confidence: 0.96, agencyLevel: 0, reasoning: 'Utility informational guide' }
    }
  }

  // 8. General Newsletters / Media Digests
  const isGenericMediaNewsletter = /morningbrew|the daily brew|substack|daily brew|techcrunch|bloomberg|the hustle|medium\.com/i.test(from) ||
    (/\b(daily brew|morning brew|market recap|stock market digest|tech round[- ]?up|weekly roundup)\b/i.test(analyzedSubject) && !/school|hoa|maintenance|principal/i.test(from))

  if (isGenericMediaNewsletter) {
    return { archetype: 'promotional_noise', subCategory: 'marketing_digest', confidence: 0.98, agencyLevel: 0, reasoning: 'External media news digest' }
  }

  // 9. General Promotional Fallback with strict 0% action leakage guardrails
  const isPromo = promoSubjectPattern.test(analyzedSubject) || isPromoMailbox
  if (isPromo && !/\b(balance due|tuition|schoolcash|invoice|bill due|past due|permission slip|waiver)\b/i.test(analyzedText)) {
    return { archetype: 'promotional_noise', subCategory: 'retail_sale', confidence: 0.96, agencyLevel: 0, reasoning: 'Retail promotional blast' }
  }

  if (/\b(permission slip|waiver|liability|sign and return|emergency contact|tuition due|balance due)\b/i.test(analyzedText)) {
    return { archetype: 'executive_actions', subCategory: 'permission_slip', confidence: 0.95, agencyLevel: 2, reasoning: 'Actionable household task' }
  }

  if (/\b(appointment|dentist|doctor|checkup|soccer match|swim meet|practice schedule)\b/i.test(analyzedText)) {
    return { archetype: 'temporal_appointments', subCategory: 'medical_doctor', confidence: 0.92, agencyLevel: 1, reasoning: 'Calendar appointment' }
  }

  if (/\b(shipped|delivered|out for delivery|tracking number|order confirmation)\b/i.test(analyzedText)) {
    return { archetype: 'logistics_parcels', subCategory: 'ecommerce_order', confidence: 0.94, agencyLevel: 0, reasoning: 'Logistics delivery' }
  }

  if (/\b(delayed|rescheduled|schedule changed|gate change)\b/i.test(analyzedText)) {
    return { archetype: 'lifecycle_updates', subCategory: 'delivery_delay_exception', confidence: 0.92, agencyLevel: 1, reasoning: 'Lifecycle change' }
  }

  if (/\b(newsletter|handbook|rules|maintenance|bulletin)\b/i.test(analyzedText)) {
    return { archetype: 'estate_knowledge', subCategory: 'school_newsletter', confidence: 0.90, agencyLevel: 0, reasoning: 'Estate knowledge' }
  }

  return { archetype: 'promotional_noise', subCategory: 'retail_sale', confidence: 0.80, agencyLevel: 0, reasoning: 'General informational or marketing update' }
}

export function deduplicateEmailCorpus(emails: StandardEmailMessage[]): StandardEmailMessage[] {
  const index = new Map<string, StandardEmailMessage>()

  for (const email of emails) {
    let key = ''
    const msgId = email.messageId
    if (msgId) {
      key = `rfc:${msgId.replace(/^<|>$/g, '').trim().toLowerCase()}`
    } else {
      const from = (email.from || '').toLowerCase()
      const subject = (email.subject || '').toLowerCase().replace(/[^a-z0-9@]+/g, ' ').trim()
      const body = (email.bodyText || email.snippet || '').toLowerCase().replace(/[^a-z0-9@]+/g, ' ').trim()
      const date = email.internalDate || email.receivedAt || ''
      const timeMs = new Date(date).getTime()
      const bucket = Number.isFinite(timeMs) ? Math.floor(timeMs / (10 * 60 * 1000)) : 0
      key = `fallback:${from}:${subject}:${bucket}:${body.slice(0, 100)}`
    }

    if (!index.has(key)) {
      const mailboxes = new Set<string>()
      if (email.mailboxOwner) mailboxes.add(email.mailboxOwner)
      index.set(key, {
        ...email,
        canonicalKey: key,
        mailboxes: Array.from(mailboxes),
        duplicateCount: 1,
      })
    } else {
      const existing = index.get(key)!
      existing.duplicateCount = (existing.duplicateCount || 1) + 1
      if (email.mailboxOwner && (!existing.mailboxes || !existing.mailboxes.includes(email.mailboxOwner))) {
        existing.mailboxes = existing.mailboxes || []
        existing.mailboxes.push(email.mailboxOwner)
      }
    }
  }

  return Array.from(index.values())
}

export function anonymizeEmail(email: StandardEmailMessage): RedactionResult {
  const bodyText = email.bodyText || email.snippet || ''
  const subject = email.subject || ''
  const from = email.from || ''
  const snippet = email.snippet || (bodyText ? bodyText.slice(0, 140) : '')

  const anonymizedText = redactEmailPII(bodyText)
  const anonymizedSubject = redactEmailPII(subject)
  const anonymizedSnippet = redactEmailPII(snippet)
  const anonymizedFrom = redactEmailPII(from)
  const anonymizedTo = Array.isArray(email.to) ? email.to.map((t) => redactEmailPII(t)) : email.to ? [redactEmailPII(email.to as unknown as string)] : []

  const domainMatch = from.match(/@([a-z0-9.-]+)/i)
  const senderDomain = domainMatch ? domainMatch[1].toLowerCase() : ''

  const entities = extractEmailEntities(bodyText, from, subject)

  const detectedPiiTypes: string[] = []
  if (anonymizedText.includes('[NAME_REDACTED]') || anonymizedSubject.includes('[NAME_REDACTED]')) detectedPiiTypes.push('human_name')
  if (anonymizedText.includes('[PHONE_REDACTED]') || anonymizedSubject.includes('[PHONE_REDACTED]')) detectedPiiTypes.push('phone')
  if (anonymizedText.includes('[EMAIL_REDACTED]') || anonymizedSubject.includes('[EMAIL_REDACTED]')) detectedPiiTypes.push('personal_email')
  if (anonymizedText.includes('[ADDRESS_REDACTED]') || anonymizedSubject.includes('[ADDRESS_REDACTED]')) detectedPiiTypes.push('street_address')
  if (anonymizedText.includes('[CARD_REDACTED]') || anonymizedSubject.includes('[CARD_REDACTED]')) detectedPiiTypes.push('credit_card')
  if (anonymizedText.includes('[BANK_ACCOUNT_REDACTED]')) detectedPiiTypes.push('bank_account')
  if (anonymizedText.includes('[SSN_REDACTED]')) detectedPiiTypes.push('ssn')
  if (anonymizedText.includes('[CREDENTIAL_REDACTED]')) detectedPiiTypes.push('credentials')

  return {
    anonymizedText,
    anonymizedSubject,
    anonymizedSnippet,
    anonymizedFrom,
    anonymizedTo,
    senderDomain,
    detectedPiiTypes,
    preservedEntities: {
      orderId: entities.canonicalOrderId || entities.orderId,
      trackingNumber: entities.trackingNumbers[0]?.trackingNumber || null,
      carrier: entities.trackingNumbers[0]?.carrier || null,
      merchantName: entities.merchantName,
    },
  }
}

export function clusterEmailCorpus(
  emails: StandardEmailMessage[],
  options: { anonymize?: boolean; deduplicate?: boolean } = {},
): ClusterEmailCorpusResult {
  const anonymize = options.anonymize !== false
  const deduplicated = options.deduplicate !== false ? deduplicateEmailCorpus(emails) : emails

  const clusters: Record<SemanticArchetype, ProcessedEmailItem[]> = {
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

  const processed: ProcessedEmailItem[] = []

  for (const email of deduplicated) {
    let emailToClassify = email
    let redactionMeta: RedactionResult | null = null

    if (anonymize) {
      redactionMeta = anonymizeEmail(email)
      const cleanGroundTruth = email.groundTruth
        ? {
            ...email.groundTruth,
            expectedEntities: email.groundTruth.expectedEntities
              ? {
                  ...email.groundTruth.expectedEntities,
                  piiTokens: undefined,
                  redactedPiiTokenTypes: redactionMeta.detectedPiiTypes,
                }
              : undefined,
          }
        : undefined

      emailToClassify = {
        ...email,
        from: redactionMeta.anonymizedFrom || email.from,
        to: redactionMeta.anonymizedTo || email.to,
        subject: redactionMeta.anonymizedSubject,
        bodyText: redactionMeta.anonymizedText,
        snippet: redactionMeta.anonymizedSnippet,
        bodyHtml: email.bodyHtml ? redactEmailPII(email.bodyHtml) : undefined,
        groundTruth: cleanGroundTruth,
      }

      for (const pii of redactionMeta.detectedPiiTypes) {
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

    const result: ProcessedEmailItem = {
      ...emailToClassify,
      classification,
      entities,
      redaction: redactionMeta,
    }

    clusters[classification.archetype].push(result)
    processed.push(result)
  }

  const archetypeDistribution = {} as CorpusClusteringStats['archetypeDistribution']
  for (const arch of SEMANTIC_ARCHETYPES) {
    const list = clusters[arch] || []
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
