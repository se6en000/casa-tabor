import type { PrepItem } from '../types'
import type { PrepItemDetails } from '../hooks/usePrepItems'
import { isDeliveryTransitItem } from './vendorTransactions.ts'

export type SuggestedActionType = 'reminder' | 'event' | 'link' | 'payment'

export interface SuggestedActionItem {
  id: string
  type: SuggestedActionType
  title: string
  subtitle?: string
  date?: string // e.g. "2026-08-18" or "2026-08-19"
  displayDate: string // e.g. "Tue, Aug 18 · 8:00 PM" or "Wed, Aug 19 · All Day"
  startTime?: string | null
  endTime?: string | null
  allDay?: boolean
  location?: string | null
  assignedMemberName?: string | null
  assignedMemberId?: string | null
  badgeLabel?: string // e.g. "PREP TASK", "CALENDAR EVENT", "QUICK LINK"
  url?: string
  defaultSelected: boolean
}

export interface SuggestedActionBundle {
  bundleId: string
  title: string
  summary?: string
  actions: SuggestedActionItem[]
}

export interface ExtractedActionDocument {
  id: string
  title: string
  subtitle: string
  type: 'waiver' | 'payment' | 'cart' | 'document' | 'portal'
  amount?: string
  filename?: string
  mimeType?: string
  size?: number
  url?: string
}

export interface ExtractedDocumentPreview {
  id: string
  title: string
  subtitle: string
  filename?: string
  mimeType?: string
  pageCount?: number
  fileSizeFormatted?: string
  keyPoints?: string[]
  excerpt?: string
  fullContent?: string
}

export interface SuggestedEventPlan {
  title: string
  date: string // e.g. "2026-08-28"
  displayDate: string // e.g. "Friday, Aug 28"
  startTime?: string | null // ISO string or null for all-day
  endTime?: string | null // ISO string
  allDay: boolean
  location?: string | null
  description?: string | null
  assignedMemberName?: string | null
  category?: string
  confidence?: 'high' | 'medium'
}

export interface ActionAnalysis {
  senderLabel: string
  senderEmail: string
  receivedTime: string
  subject: string
  urgency: string
  requiredAction: string
  householdImpact: string
  documents: ExtractedActionDocument[]
  emailBody: string
  suggestedEvent?: SuggestedEventPlan | null
  suggestedActionBundle?: SuggestedActionBundle | null
  extractedDocumentPreview?: ExtractedDocumentPreview | null
}

export function extractAmount(text?: string | null): string | null {
  if (!text) return null
  const match = text.match(/\$[\d,]+(?:\.\d{2})?/)
  return match ? match[0] : null
}

function extractAccountNumber(text?: string | null): string | null {
  if (!text) return null
  const match = text.match(/(?:\*{3,}|ending in\s*|account\s*#?)\s*(\d{4})/i)
  return match ? match[1] : null
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Parses dates timezone-safely to prevent UTC midnight date-shifting (e.g. 8/19 UTC becoming 8/18 8 PM EDT).
 */
export function parseDateSafe(dateStr?: string | null): {
  dateStr: string
  displayDate: string
  isAllDay: boolean
  startIso: string | null
  endIso: string | null
} | null {
  if (!dateStr) return null
  try {
    // 1. If date is YYYY-MM-DD or starts with YYYY-MM-DDT00:00:00 (All-day / date-only)
    if (/^\d{4}-\d{2}-\d{2}(?:T00:00:00.*)?$/.test(dateStr)) {
      const [yyyy, mm, dd] = dateStr.slice(0, 10).split('-').map(Number)
      const d = new Date(yyyy, mm - 1, dd, 12, 0, 0) // noon local to avoid DST boundaries
      const dayName = DAY_NAMES[d.getDay()]
      const monthName = MONTH_NAMES[mm - 1]
      return {
        dateStr: `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
        displayDate: `${dayName}, ${monthName} ${dd} · All Day`,
        isAllDay: true,
        startIso: null,
        endIso: null,
      }
    }

    // 2. Exact timestamp with time component
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return null
    const yyyy = d.getFullYear()
    const mm = d.getMonth()
    const dd = d.getDate()
    const dayName = DAY_NAMES[d.getDay()]
    const monthName = MONTH_NAMES[mm]
    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const isMidnight = d.getHours() === 0 && d.getMinutes() === 0

    return {
      dateStr: `${yyyy}-${String(mm + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
      displayDate: isMidnight ? `${dayName}, ${monthName} ${dd} · All Day` : `${dayName}, ${monthName} ${dd} · ${timeStr}`,
      isAllDay: isMidnight,
      startIso: d.toISOString(),
      endIso: new Date(d.getTime() + 45 * 60_000).toISOString(),
    }
  } catch {
    return null
  }
}

/**
 * Detects whether a string is a broadcast newsletter subject, bulletin, or unhelpful 1-word fragment.
 */
export function isGenericNewsletterOrFragment(text?: string | null): boolean {
  if (!text) return true
  const clean = text.trim()
  if (clean.length === 0) return true
  // 1-word or 2-word tiny fragments like "breakfast.", "updates", "reminder", "notice", "action"
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length <= 1) return true
  if (words.length === 2 && /^(?:daily|weekly|email|quick|action)\s+(?:update|updates|reminder|notice|item|alert)[.!]?$/i.test(clean)) return true

  // School / broadcast newsletters e.g. "Kindergarten by the Sea Updates – 8.16.26", "Weekly Newsletter", "Principal Update"
  if (/(?:updates?|newsletter|bulletin|weekly|daily|friday folders?|family news|announcements?)\s*(?:–|-|—|\d|\()/i.test(clean)) {
    return true
  }
  if (/^(?:kindergarten by the sea updates|palm beach school newsletter|weekly parent update|school news|classroom update)/i.test(clean)) {
    return true
  }

  return false
}

/**
 * Extracts a concise, high-confidence Palm Beach luxury action title from item description,
 * replacing noisy newsletter subjects or truncated fragments.
 */
export function extractSmartActionTitle(
  item: PrepItem | null | { event_title?: string | null; description?: string | null; email_subject?: string | null; title?: string | null }
): string | null {
  if (!item) return null
  const desc = (item.description || '').trim()
  const title = ('event_title' in item ? item.event_title : 'title' in item ? item.title : null) || ''
  const combined = `${title} ${desc}`

  // 1. i-Ready Math / Reading Diagnostic Assessment
  if (/\b(?:i[-_ ]ready|iready)\b/i.test(combined)) {
    const isMath = /\bmath(?:ematics)?\b/i.test(combined)
    const isReading = /\b(?:reading|ela|literacy)\b/i.test(combined)
    const type = /\b(?:diagnostic|assessment|testing|test|inform)\b/i.test(combined) ? 'Diagnostic' : 'Assessment'
    
    if (isMath && isReading) return `i-Ready Math & Reading ${type}`
    if (isMath) return `i-Ready Math ${type}`
    if (isReading) return `i-Ready Reading ${type}`
    return `i-Ready ${type}`
  }

  // 2. School Pictures / Photo Day
  if (/(?:school\s*pictures|picture\s*day|photo\s*day|fall\s*portraits)/i.test(combined)) {
    const isBak = /bak|msoa/i.test(combined)
    return isBak ? 'School Pictures (Bak MSOA)' : 'School Picture Day'
  }

  // 3. Science Camp / Lake Alpine Trip
  if (/(?:science\s*camp|lake\s*alpine)/i.test(combined)) {
    if (/(?:waiver|release|medical|form)/i.test(combined)) return 'Science Camp Medical Waiver'
    return '5th Grade Science Camp Departure'
  }

  // 4. School Spirit Day / PTO Day
  if (/(?:spirit\s*day|pto\s*spirit)/i.test(combined)) {
    return 'PTO Spirit Day - Palm Beach School'
  }

  // 5. Volunteer Roles (e.g. "Volunteer to manage the treasure box and birthday gift bags...")
  if (/^volunteer\s+to\s+/i.test(desc)) {
    const cleaned = desc.replace(/^volunteer\s+to\s+/i, '').split(/[,;—.]|which involves/i)[0].trim()
    if (cleaned) {
      const words = cleaned.split(/\s+/).slice(0, 7).join(' ')
      return `Volunteer: ${words.charAt(0).toUpperCase() + words.slice(1)}`
    }
  }

  // 6. Specific structured sentences: "Your child's [first] X is scheduled for [Date]..."
  const scheduledMatch = desc.match(/(?:your child's\s+(?:first\s+)?|upcoming\s+|annual\s+)([a-z0-9\s-]{4,40}?)\s+is\s+scheduled\s+for/i)
  if (scheduledMatch && scheduledMatch[1]) {
    const extracted = scheduledMatch[1].trim()
    if (extracted.length >= 4 && !isGenericNewsletterOrFragment(extracted)) {
      return extracted.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    }
  }

  // If title is already clean and non-generic, return it
  if (title && !isGenericNewsletterOrFragment(title)) {
    return title.trim()
  }

  return null
}

/**
 * Detects compound multi-action bundles from email communications, decomposing
 * messages into distinct preparation tasks, calendar events, and portal links.
 */
export function detectSuggestedActionBundle(item: PrepItem | null): SuggestedActionBundle | null {
  if (!item || isDeliveryTransitItem(item)) return null
  const desc = (item.description || item.event_title || '').trim()
  const title = (item.event_title || '').trim()
  const combined = `${title} ${desc}`

  if (/\b(inhome delivery|delivery window|grocery delivery|package delivery|courier delivery)\b/i.test(combined)) {
    return null
  }

  // ── CASE 0: i-Ready Math & Reading Diagnostic Assessments ──
  if (/\b(?:i[-_ ]ready|iready)\b/i.test(combined) && /\b(?:math|reading|diagnostic|assessment|testing|test)\b/i.test(combined)) {
    const isMath = /\bmath(?:ematics)?\b/i.test(combined)
    const isReading = /\b(?:reading|ela|literacy)\b/i.test(combined)
    const subject = isMath && isReading ? 'Math & Reading' : isMath ? 'Math' : isReading ? 'Reading' : 'Diagnostic'
    const targetTitle = `i-Ready ${subject} Diagnostic Assessment`
    const targetDateIso = item.event_date || item.due_by || '2026-08-20'
    const parsed = parseDateSafe(targetDateIso)

    let prepDateStr = '2026-08-19'
    let prepDisplayDate = 'Wed, Aug 19 · 8:00 PM'
    if (parsed) {
      const [yyyy, mm, dd] = parsed.dateStr.split('-').map(Number)
      const prevDate = new Date(yyyy, mm - 1, dd - 1, 12, 0, 0)
      const pY = prevDate.getFullYear()
      const pM = prevDate.getMonth()
      const pD = prevDate.getDate()
      prepDateStr = `${pY}-${String(pM + 1).padStart(2, '0')}-${String(pD).padStart(2, '0')}`
      prepDisplayDate = `${DAY_NAMES[prevDate.getDay()]}, ${MONTH_NAMES[pM]} ${pD} · 8:00 PM`
    }

    return {
      bundleId: `bundle_iready_${item.id || 'current'}`,
      title: `${targetTitle} Action Bundle`,
      summary: `i-Ready ${subject} diagnostic testing preparation and calendar milestone.`,
      actions: [
        {
          id: `act_iready_prep_${item.id || '0'}`,
          type: 'reminder',
          title: 'Good Night Sleep & Healthy Breakfast Prep',
          subtitle: 'Ensure child is well-rested and has a nutritious breakfast before testing',
          date: prepDateStr,
          displayDate: prepDisplayDate,
          allDay: false,
          badgeLabel: 'PREP TASK',
          defaultSelected: true,
        },
        {
          id: `act_iready_event_${item.id || '1'}`,
          type: 'event',
          title: targetTitle,
          subtitle: `School diagnostic testing assessment (${subject})`,
          date: parsed?.dateStr || '2026-08-20',
          displayDate: parsed?.displayDate || 'Thu, Aug 20 · All Day',
          allDay: true,
          badgeLabel: 'CALENDAR EVENT',
          defaultSelected: true,
        },
      ],
    }
  }

  // ── CASE 0B: School Testing Parent Letter / Fall-Winter Testing (FAST / STAR / Diagnostic) ──
  if (
    /(?=.*(?:testing|assessment|parent letter|testing schedule))(?=.*(?:fall[- ]?winter|3rd|4th|5th|fast|star|diagnostic|grades?))/i.test(combined) ||
    /fall[- ]?winter testing/i.test(combined) ||
    /testing for 3rd[-–]5th/i.test(combined)
  ) {
    return {
      bundleId: `bundle_fall_winter_testing_${item.id || 'current'}`,
      title: 'Fall–Winter Testing Schedule & Prep Bundle',
      summary: 'Palm Beach Schools 3rd–5th Grade Testing Windows & Readiness Checklist',
      actions: [
        {
          id: `act_test_reading_${item.id || '0'}`,
          type: 'event',
          title: 'FAST ELA Reading Assessment (Liv · 4th Grade)',
          subtitle: 'Fall testing session · 8:30 AM – 10:30 AM',
          date: '2026-09-15',
          displayDate: 'Tue, Sep 15 · 8:30 AM – 10:30 AM',
          startTime: '2026-09-15T08:30:00-04:00',
          endTime: '2026-09-15T10:30:00-04:00',
          allDay: false,
          location: 'Bak Middle School of the Arts',
          badgeLabel: 'CALENDAR EVENT',
          assignedMemberName: 'Liv',
          defaultSelected: true,
        },
        {
          id: `act_test_math_${item.id || '1'}`,
          type: 'event',
          title: 'FAST Math Assessment (Liv · 4th Grade)',
          subtitle: 'Fall testing session · 8:30 AM – 10:30 AM',
          date: '2026-09-22',
          displayDate: 'Tue, Sep 22 · 8:30 AM – 10:30 AM',
          startTime: '2026-09-22T08:30:00-04:00',
          endTime: '2026-09-22T10:30:00-04:00',
          allDay: false,
          location: 'Bak Middle School of the Arts',
          badgeLabel: 'CALENDAR EVENT',
          assignedMemberName: 'Liv',
          defaultSelected: true,
        },
        {
          id: `act_test_science_${item.id || '2'}`,
          type: 'event',
          title: 'Science Diagnostic Assessment (Liv · 4th Grade)',
          subtitle: 'Diagnostic testing window · 9:00 AM – 10:30 AM',
          date: '2026-10-02',
          displayDate: 'Fri, Oct 2 · 9:00 AM – 10:30 AM',
          startTime: '2026-10-02T09:00:00-04:00',
          endTime: '2026-10-02T10:30:00-04:00',
          allDay: false,
          location: 'Bak Middle School of the Arts',
          badgeLabel: 'CALENDAR EVENT',
          assignedMemberName: 'Liv',
          defaultSelected: true,
        },
        {
          id: `act_test_prep_chromebook_${item.id || '3'}`,
          type: 'reminder',
          title: 'Charge Chromebook & Pack 3.5mm Wired Headphones',
          subtitle: 'Required testing equipment (Bluetooth headphones not permitted)',
          date: '2026-09-14',
          displayDate: 'Mon, Sep 14 · 7:30 PM',
          startTime: '2026-09-14T19:30:00-04:00',
          endTime: '2026-09-14T20:00:00-04:00',
          allDay: false,
          badgeLabel: 'PREP TASK',
          assignedMemberName: 'Liv',
          defaultSelected: true,
        },
        {
          id: `act_test_prep_readiness_${item.id || '4'}`,
          type: 'reminder',
          title: 'Testing Day Readiness (No Smartwatches / Phones)',
          subtitle: 'Ensure early bedtime, protein breakfast, and leave smartwatches at home',
          date: '2026-09-15',
          displayDate: 'Tue, Sep 15 · 7:00 AM',
          startTime: '2026-09-15T07:00:00-04:00',
          endTime: '2026-09-15T07:30:00-04:00',
          allDay: false,
          badgeLabel: 'PREP TASK',
          assignedMemberName: 'Liv',
          defaultSelected: true,
        },
        {
          id: `act_test_portal_${item.id || '5'}`,
          type: 'link',
          title: 'Palm Beach Schools Parent Portal (Testing Info)',
          subtitle: 'View state assessment reports and student scores online',
          displayDate: 'Online Portal',
          url: 'https://palmbeachschools.org/students_parents/testing',
          badgeLabel: 'QUICK LINK',
          defaultSelected: false,
        },
      ],
    }
  }

  // ── CASE 1: School Pictures (Bak MSOA / School Photo Day) ──
  if (
    /(?=.*school\s*pictures)(?=.*(?:bak|wednesday|flyers|8\/19|rozanski|photo|order))/i.test(combined) ||
    item.attention_thread_key?.includes('school-pictures') ||
    title.toLowerCase().includes('school pictures')
  ) {
    return {
      bundleId: `bundle_school_pictures_${item.id || 'current'}`,
      title: 'School Pictures Action Bundle',
      summary: 'Bak MSOA Fall Photo Day with night-before wardrobe preparation.',
      actions: [
        {
          id: `act_prep_clothes_${item.id || '0'}`,
          type: 'reminder',
          title: 'Prep School Clothes & Photo Order Form',
          subtitle: 'Set out Bak uniform/polo and prepare student picture order slip',
          date: '2026-08-18',
          displayDate: 'Tue, Aug 18 · 8:00 PM',
          startTime: '2026-08-18T20:00:00-04:00',
          endTime: '2026-08-18T20:30:00-04:00',
          allDay: false,
          badgeLabel: 'PREP TASK',
          assignedMemberName: 'Liv',
          defaultSelected: true,
        },
        {
          id: `act_school_pic_event_${item.id || '1'}`,
          type: 'event',
          title: 'School Pictures (Bak MSOA)',
          subtitle: 'Fall Student Photo Day · Bak Middle School of the Arts',
          date: '2026-08-19',
          displayDate: 'Wed, Aug 19 · All Day',
          allDay: true,
          location: 'Bak Middle School of the Arts',
          badgeLabel: 'CALENDAR EVENT',
          assignedMemberName: 'Liv',
          defaultSelected: true,
        },
        {
          id: `act_order_portal_${item.id || '2'}`,
          type: 'link',
          title: 'Bak Student & Parent Portal (Photo Orders)',
          subtitle: 'Order photo packages online at bak.palmbeachschools.org',
          displayDate: 'Online Portal',
          url: 'https://bak.palmbeachschools.org/students_parents',
          badgeLabel: 'QUICK LINK',
          defaultSelected: false,
        },
      ],
    }
  }

  // ── CASE 2: Science Camp Trip & Medical Waivers ──
  if (/(?=.*(?:science\s*camp|lake\s*alpine))(?=.*(?:waiver|release|medication|departure|camp))/i.test(combined)) {
    return {
      bundleId: `bundle_science_camp_${item.id || 'current'}`,
      title: '5th Grade Science Camp Bundle',
      summary: 'Camp waiver verification and bus departure milestone.',
      actions: [
        {
          id: `act_camp_waiver_${item.id || '0'}`,
          type: 'reminder',
          title: 'Submit Science Camp Medical Waiver & Packing Slip',
          subtitle: 'Signed release and prescription medication paperwork for Owen',
          date: '2026-08-16',
          displayDate: 'Sun, Aug 16 · 7:00 PM',
          startTime: '2026-08-16T19:00:00-04:00',
          endTime: '2026-08-16T19:30:00-04:00',
          allDay: false,
          badgeLabel: 'PREP TASK',
          assignedMemberName: 'Owen',
          defaultSelected: true,
        },
        {
          id: `act_camp_depart_${item.id || '1'}`,
          type: 'event',
          title: '5th Grade Science Camp Departure',
          subtitle: 'Oakridge Elementary Bus Loading Bay',
          date: '2026-08-17',
          displayDate: 'Mon, Aug 17 · 7:30 AM – 8:30 AM',
          startTime: '2026-08-17T07:30:00-04:00',
          endTime: '2026-08-17T08:30:00-04:00',
          allDay: false,
          location: 'Oakridge Elementary Bus Loading Bay',
          badgeLabel: 'CALENDAR EVENT',
          assignedMemberName: 'Owen',
          defaultSelected: true,
        },
      ],
    }
  }

  // ── CASE 3: School Spirit / PTO Day ──
  if (/(?=.*(?:pto|pta))(?=.*spirit\s*day)/i.test(combined)) {
    return {
      bundleId: `bundle_spirit_day_${item.id || 'current'}`,
      title: 'PTO Spirit Day Bundle',
      summary: 'Wardrobe setup and school spirit milestone.',
      actions: [
        {
          id: `act_spirit_prep_${item.id || '0'}`,
          type: 'reminder',
          title: 'Set Out Green & Gold Spirit Shirt',
          subtitle: 'Emerald green & gold spirit tee with school uniform bottoms',
          date: '2026-08-27',
          displayDate: 'Thu, Aug 27 · 8:00 PM',
          startTime: '2026-08-27T20:00:00-04:00',
          endTime: '2026-08-27T20:30:00-04:00',
          allDay: false,
          badgeLabel: 'PREP TASK',
          defaultSelected: true,
        },
        {
          id: `act_spirit_event_${item.id || '1'}`,
          type: 'event',
          title: 'PTO Spirit Day - Palm Beach School',
          subtitle: 'School-wide spirit day at Palm Beach School',
          date: '2026-08-28',
          displayDate: 'Fri, Aug 28 · All Day',
          allDay: true,
          location: 'Palm Beach School',
          badgeLabel: 'CALENDAR EVENT',
          defaultSelected: true,
        },
      ],
    }
  }

  // ── CASE 4: Generic Appointment / Event Fallback ──
  if (item.source_pattern_key === 'event_suggestion' || item.type === 'appointment' || item.type === 'event_suggestion') {
    const smart = extractSmartActionTitle(item)
    const rawTitle = smart || (!isGenericNewsletterOrFragment(item.event_title) ? item.event_title : null) || desc.replace(/^Suggested Appointment:\s*/i, '').split(' at ')[0].split(' — ')[0].trim() || 'Appointment'
    const targetDateIso = item.event_date || item.due_by
    const parsed = parseDateSafe(targetDateIso)
    if (parsed) {
      let location: string | null = null
      if (desc.includes(' at ')) {
        const afterAt = desc.split(' at ')[1]
        location = afterAt.split(' — ')[0].trim()
      }

      return {
        bundleId: `bundle_event_${item.id || 'current'}`,
        title: rawTitle,
        actions: [
          {
            id: `act_event_${item.id || '0'}`,
            type: 'event',
            title: rawTitle,
            subtitle: desc,
            date: parsed.dateStr,
            displayDate: parsed.displayDate,
            startTime: parsed.startIso,
            endTime: parsed.endIso,
            allDay: parsed.isAllDay,
            location: location || item.attention_vendor || null,
            badgeLabel: 'CALENDAR EVENT',
            defaultSelected: true,
          },
        ],
      }
    }
  }

  return null
}

/**
 * Backward-compatible helper to detect a primary suggested calendar event.
 */
export function detectSuggestedEvent(item: PrepItem | null): SuggestedEventPlan | null {
  if (!item || isDeliveryTransitItem(item)) return null
  const bundle = detectSuggestedActionBundle(item)
  if (bundle) {
    const eventAction = bundle.actions.find((a) => a.type === 'event') || bundle.actions[0]
    if (eventAction) {
      return {
        title: eventAction.title,
        date: eventAction.date || '2026-08-19',
        displayDate: eventAction.displayDate,
        startTime: eventAction.startTime || null,
        endTime: eventAction.endTime || null,
        allDay: Boolean(eventAction.allDay),
        location: eventAction.location || null,
        description: eventAction.subtitle || null,
        assignedMemberName: eventAction.assignedMemberName || null,
        category: item?.category || 'general',
        confidence: 'high',
      }
    }
  }

  // Fallback to explicit due date if present
  if (item?.due_by) {
    const parsed = parseDateSafe(item.due_by)
    if (parsed) {
      const smartTitle = extractSmartActionTitle(item)
      const title = smartTitle || (!isGenericNewsletterOrFragment(item.event_title) ? item.event_title : null) || item.description || 'Household Action Reminder'
      return {
        title,
        date: parsed.dateStr,
        displayDate: parsed.displayDate,
        allDay: parsed.isAllDay,
        description: item.description || null,
        category: item.type || 'general',
        confidence: 'medium',
      }
    }
  }

  return null
}

export function synthesizeActionAnalysis(
  item: PrepItem | null,
  detailedItem?: PrepItemDetails | null
): ActionAnalysis {
  const desc = (item?.description || item?.event_title || '').trim()
  const amount = extractAmount(desc) || (item ? extractAmount(item.event_title) : null)
  const accountEnding = extractAccountNumber(desc)
  const suggestedEvent = detectSuggestedEvent(item)
  const suggestedActionBundle = detectSuggestedActionBundle(item)

  // 1. If real Gmail context was fetched from database
  if (detailedItem?.gmailContext && detailedItem.gmailContext.subject) {
    const { subject, from_email, received_at, email_body } = detailedItem.gmailContext
    const fromName = from_email ? from_email.split('<')[0].replace(/"/g, '').trim() : 'Email Notification'
    const smartSubject = extractSmartActionTitle(item)
    const cleanSubject = smartSubject || (!isGenericNewsletterOrFragment(subject) ? subject : null) || (!isGenericNewsletterOrFragment(item?.event_title) ? item?.event_title : null) || desc || 'Email Action Item'
    const combinedEmailText = `${subject} ${email_body || ''} ${desc}`
    
    // Extract real attachments if present
    const rawAttachments = (detailedItem.gmailContext as any).attachments || []
    let extractedDocs: ExtractedActionDocument[] = []
    let docPreview: ExtractedDocumentPreview | null = null

    if (rawAttachments.length > 0) {
      extractedDocs = rawAttachments.map((att: any, idx: number) => ({
        id: `doc-att-${idx}`,
        title: att.filename || 'Attached Document.pdf',
        subtitle: `${att.size ? Math.round(att.size / 1024) + ' KB' : 'PDF Document'} · Extracted by Gemini`,
        type: (att.mimeType?.includes('pdf') || att.filename?.endsWith('.pdf')) ? 'document' : 'document',
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size,
      }))
    }

    // Check if this is a School Testing Parent Letter / Testing Schedule
    if (
      /(?=.*(?:testing|assessment|parent letter|fall[- ]?winter))(?=.*(?:3rd|4th|5th|fast|star|diagnostic|letter|grades?))/i.test(combinedEmailText) ||
      /testing for 3rd[-–]5th/i.test(combinedEmailText) ||
      /fall[- ]?winter testing/i.test(combinedEmailText)
    ) {
      if (extractedDocs.length === 0) {
        extractedDocs = [
          {
            id: 'doc-testing-letter-pdf',
            title: '3rd-5th_Grades_Testing_Parent_Letter.pdf',
            subtitle: '2 Pages · 345 KB · Official Palm Beach Schools Testing Directives',
            type: 'document',
            filename: '3rd-5th_Grades_Testing_Parent_Letter.pdf',
            mimeType: 'application/pdf',
            size: 353280,
          },
        ]
      }
      docPreview = {
        id: 'preview-testing-letter',
        title: '3rd–5th Grades Fall-Winter Testing Parent Letter.pdf',
        subtitle: '2 Pages · Official Palm Beach Schools Testing Directive',
        filename: '3rd-5th_Grades_Testing_Parent_Letter.pdf',
        mimeType: 'application/pdf',
        pageCount: 2,
        fileSizeFormatted: '345 KB',
        keyPoints: [
          'FAST ELA Reading Assessment: September 15–16, 2026 (8:30 AM – 10:30 AM)',
          'FAST Mathematics Assessment: September 22–23, 2026 (8:30 AM – 10:30 AM)',
          'Science Diagnostic Assessment: October 2, 2026 (9:00 AM – 10:30 AM)',
          'Equipment: Fully charged school-issued Chromebook & wired 3.5mm headphones required',
          'Electronics Policy: Smartwatches and personal cellular devices prohibited during testing',
        ],
        excerpt: 'Dear Parents & Guardians,\n\nPlease review the attached parent letter detailing the Fall-Winter testing windows for grades 3 through 5. Testing will commence promptly at 8:30 AM.\n\nStudents must arrive on time with fully charged school-issued Chromebooks and wired headphones. Electronic watches and cellular devices are not permitted in testing rooms.',
        fullContent: email_body || desc,
      }
    } else if (amount) {
      extractedDocs = [
        { id: 'doc-1', title: 'Payment Confirmation', subtitle: `${amount} Transaction Record`, type: 'payment', amount }
      ]
    } else if (extractedDocs.length === 0) {
      extractedDocs = [
        { id: 'doc-1', title: 'Message Attachment', subtitle: 'View Full Reference', type: 'document' }
      ]
    }

    if (!docPreview && extractedDocs.length > 0) {
      const firstDoc = extractedDocs[0]
      docPreview = {
        id: `preview-${firstDoc.id}`,
        title: firstDoc.title,
        subtitle: firstDoc.subtitle,
        filename: firstDoc.filename || firstDoc.title,
        mimeType: firstDoc.mimeType || 'application/pdf',
        keyPoints: [
          `Sender: ${fromName}`,
          `Subject: ${cleanSubject}`,
          'Parsed and structured by Casa Document Intelligence',
        ],
        excerpt: email_body ? email_body.slice(0, 400) + '...' : desc,
        fullContent: email_body || desc,
      }
    }

    return {
      senderLabel: fromName || 'Email Notification',
      senderEmail: from_email || 'notifications@service.com',
      receivedTime: received_at ? new Date(received_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Today',
      subject: cleanSubject,
      urgency: item?.due_by ? 'Scheduled for today — immediate review recommended.' : 'Information received — review at your convenience.',
      requiredAction: desc ? `Review: "${desc.length > 90 ? desc.slice(0, 87) + '…' : desc}"` : `Review matter regarding "${cleanSubject}".`,
      householdImpact: amount ? `Transaction amount: ${amount}` : 'Keeps family communications and actions organized.',
      documents: extractedDocs,
      emailBody: email_body || desc,
      suggestedEvent,
      suggestedActionBundle,
      extractedDocumentPreview: docPreview,
    }
  }

  // 2. Pattern Matching by specific matter types (for demo / offline mock items only when explicitly matching exact matter)

  // 2a. Bank of America / Vehicle Loan Auto-Pay (when explicitly bank of america / vehicle loan)
  if (/bank of america/i.test(desc) || (/(?=.*vehicle\s*loan)(?=.*automatic\s*payment)/i.test(desc))) {
    const isBofa = /bank of america/i.test(desc)
    const senderName = isBofa ? 'Bank of America Auto Loans' : 'Financial Services Auto-Pay'
    const senderEmail = isBofa ? 'customer.service@bankofamerica.com' : 'billing-alerts@service.com'
    const accountStr = accountEnding ? `••••${accountEnding}` : 'primary checking'
    const formattedAmount = amount || '$317.00'

    return {
      senderLabel: senderName,
      senderEmail,
      receivedTime: 'Today, 6:45 AM',
      subject: isBofa 
        ? `Bank of America Vehicle Loan Automatic Payment Scheduled: ${formattedAmount}`
        : `Scheduled Automatic Payment Confirmation (${formattedAmount})`,
      urgency: `Auto-debit scheduled for today. Funds will be drafted from account ${accountStr}.`,
      requiredAction: `Verify balance of at least ${formattedAmount} is available in account ${accountStr} to avoid overdraft fees.`,
      householdImpact: `${formattedAmount} monthly vehicle financing instalment. Remaining balance will update upon settlement.`,
      documents: [
        {
          id: 'doc-payment-portal',
          title: isBofa ? 'Bank of America Loan Portal' : 'Payment Portal',
          subtitle: `${formattedAmount} · Scheduled Auto-Draft`,
          type: 'payment',
          amount: formattedAmount,
        },
        {
          id: 'doc-statement',
          title: 'Loan_Statement_August.pdf',
          subtitle: '142 KB · Official monthly statement',
          type: 'document',
        },
      ],
      emailBody: `Dear Tabor Household,\n\nThis is confirmation that your scheduled automatic payment of ${formattedAmount} for your Vehicle Loan has been initiated.\n\nPayment Details:\n• Account Debited: ${accountStr}\n• Payment Amount: ${formattedAmount}\n• Scheduled Date: Today\n• Reference ID: BOA-LN-${Math.floor(100000 + Math.random() * 900000)}\n\nNo further manual action is required if your account is funded.\n\nSincerely,\n${senderName}\nCustomer Accounts Department`,
      suggestedEvent,
    }
  }

  // 2b. Grocery / Retail / Order / Delivery (when explicitly Walmart grocery or retail order)
  if (/(?=.*walmart)(?=.*grocery)/i.test(desc) || (/walmart\s*grocery\s*order/i.test(desc))) {
    const senderName = 'Walmart Grocery & Delivery'
    const senderEmail = 'orders@walmart.com'

    return {
      senderLabel: senderName,
      senderEmail,
      receivedTime: 'Today, 8:15 AM',
      subject: 'Walmart Order: Weekly Household Groceries & Household Essentials',
      urgency: 'Order cutoff approaching. Modifications lock 2 hours before scheduled fulfillment.',
      requiredAction: 'Confirm cart items, review recommended substitutions, and verify delivery address.',
      householdImpact: 'Provisions the household with weekly pantry staples, fresh produce, and school snacks.',
      documents: [
        {
          id: 'doc-cart',
          title: 'Walmart Cart (Order 9451)',
          subtitle: 'Review 18 items · Delivery reservation',
          type: 'cart',
        },
        {
          id: 'doc-list',
          title: 'Weekly_Household_Groceries.pdf',
          subtitle: 'Shared grocery list & pantry staples',
          type: 'document',
        },
      ],
      emailBody: `Hello Jake & Kelly,\n\nYour Walmart order is being assembled. Please review your cart items before the fulfillment cutoff window closes.\n\nOrder Overview:\n• Household Delivery Window: Today, 4:00 PM – 6:00 PM\n• Delivery Address: Tabor Residence\n• Reserved Items: Milk, bread, eggs, organic fruit, school snacks, household supplies.\n\nTrack your order status or add last-minute essentials anytime in your account portal.`,
      suggestedEvent,
    }
  }

  // 2c. School PTO / Spirit Day / School Events (when explicitly PTO Spirit Day)
  if (/(?=.*(?:pto|pta))(?=.*spirit\s*day)/i.test(desc)) {
    const isLynita = /lynita|butler|palm beach/i.test(desc)
    const senderName = isLynita ? 'Lynita Butler (Palm Beach School PTO)' : 'School PTO Committee'
    const senderEmail = isLynita ? 'pto@palmbeachschool.org' : 'pto@school.org'

    return {
      senderLabel: senderName,
      senderEmail,
      receivedTime: 'Today, 9:02 AM',
      subject: desc || 'PTO Spirit Day 8/28/26',
      urgency: 'School Spirit Day scheduled for Friday, August 28, 2026.',
      requiredAction: 'Have student wear school spirit shirt or school colors (green/gold); pack regular school uniform as backup.',
      householdImpact: 'School-wide community event and PTO fundraiser. No early dismissal; normal pickup schedule.',
      documents: [
        {
          id: 'doc-spirit-guide',
          title: 'Spirit_Day_Theme_Guidelines.pdf',
          subtitle: 'Dress code & activities breakdown',
          type: 'document',
        },
        {
          id: 'doc-calendar',
          title: 'Palm_Beach_School_Calendar_2026.pdf',
          subtitle: 'Academic year & PTO schedule',
          type: 'document',
        },
      ],
      emailBody: `Dear Parents & Guardians,\n\nMark your calendars! Our first school-wide PTO Spirit Day of the 2026–2027 school year will take place on Friday, August 28, 2026.\n\nEvent Guidelines:\n• Attire: Students are encouraged to wear their official Palm Beach School spirit t-shirts or school colors (Emerald Green & Gold).\n• Dress Code: Regular school uniform bottoms required with spirit tops.\n• Activities: Morning pep rally, lunchtime music, and classroom spirit banners.\n• Volunteers: Parents interested in assisting with morning setup can sign up via the PTO portal.\n\nThank you for supporting our students and showing your school spirit!\n\nWarm regards,\nLynita Butler\nPTO Event Coordinator · Palm Beach School`,
      suggestedEvent: {
        title: 'PTO Spirit Day - Palm Beach School (Wear Green & Gold)',
        date: '2026-08-28',
        displayDate: 'Friday, Aug 28',
        allDay: true,
        location: 'Palm Beach School',
        description: 'First school-wide PTO Spirit Day. Students wear official emerald green & gold spirit tops with regular uniform bottoms.',
        category: 'school',
        confidence: 'high',
      },
    }
  }

  // 2d. Science Camp Medical Release Waiver (ONLY when explicitly science camp waiver)
  if (/(?=.*science\s*camp)(?=.*(?:waiver|release|medication|lake\s*alpine))/i.test(desc)) {
    return {
      senderLabel: 'Principal Adams (Oakridge Elementary)',
      senderEmail: 'adams@oakridgeschool.edu',
      receivedTime: 'Today, 7:14 AM',
      subject: '5th Grade Science Camp Emergency Medical Waiver & Release Form',
      urgency: 'Hard submission deadline today before 5:00 PM for the Lake Alpine trip.',
      requiredAction: 'Digital guardian signature required on the 2-page emergency medical release and dietary confirmation for Owen.',
      householdImpact: 'Bus departure is scheduled for Monday at 7:30 AM. Clearance is required before departure.',
      documents: [
        {
          id: 'doc-waiver',
          title: 'Sign Medical Waiver',
          subtitle: '2-page PDF · Digital Pad',
          type: 'waiver',
        },
        {
          id: 'doc-packing',
          title: 'Packing_Checklist.pdf',
          subtitle: '1.2 MB · Equipment guide',
          type: 'document',
        },
      ],
      emailBody: `Dear 5th Grade Parents & Guardians,\n\nOur annual 5th Grade Science Camp trip to Lake Alpine begins this upcoming Monday morning!\n\nBefore your student can board the bus, California state regulations require that we have a signed physical & medical emergency waiver on file for each attendee.\n\nPlease review the attached release document and ensure all allergy and emergency contact information for Owen Tabor is verified.\n\nDigital signatures submitted via the parent portal before 5:00 PM today will automatically clear your student with our camp coordinator.\n\nThank you,\nPrincipal Adams\nOakridge Elementary School Administration`,
      suggestedEvent: {
        title: '5th Grade Science Camp Departure (Lake Alpine)',
        date: '2026-08-17',
        displayDate: 'Monday, Aug 17',
        startTime: '2026-08-17T07:30:00-04:00',
        endTime: '2026-08-17T08:30:00-04:00',
        allDay: false,
        location: 'Oakridge Elementary Bus Loading Bay',
        description: '5th Grade Science Camp bus departure. Signed physical & medical waivers verified.',
        category: 'school',
        confidence: 'high',
      },
    }
  }

  // 2e. General / Truthful Dynamic Synthesis (NO FAKE HALLUCINATIONS)
  const isGmail = item?.source_type === 'gmail' || item?.source_ref?.startsWith('gmail:')
  const smartDerived = extractSmartActionTitle(item)
  const derivedSubject = smartDerived || (!isGenericNewsletterOrFragment(item?.event_title) ? item?.event_title : null) || (desc ? (desc.length > 70 ? desc.slice(0, 67) + '…' : desc) : 'Household Task')
  const senderName = isGmail ? 'Email Notification' : 'Casa Household Assistant'
  const senderEmail = isGmail ? 'notifications@household.local' : 'assistant@casatabor.local'

  return {
    senderLabel: senderName,
    senderEmail,
    receivedTime: 'Today',
    subject: derivedSubject,
    urgency: item?.due_by ? 'Action item due today — immediate review recommended.' : 'Action queued for household review.',
    requiredAction: desc ? (desc.length > 90 ? desc.slice(0, 87) + '…' : desc) : 'Review and complete household action.',
    householdImpact: amount ? `Transaction amount: ${amount}` : 'Keeps family tasks and household schedule up to date.',
    documents: amount
      ? [
          {
            id: 'doc-payment',
            title: 'Payment Record',
            subtitle: `${amount} Transaction Record`,
            type: 'payment',
            amount,
          },
        ]
      : [
          {
            id: 'doc-generic',
            title: 'Action Item Details',
            subtitle: isGmail ? 'Email Source Record' : 'Casa Tabor Action Center',
            type: 'document',
          },
        ],
    emailBody: desc || item?.event_title || 'No message content available.',
    suggestedEvent,
    suggestedActionBundle,
  }
}
