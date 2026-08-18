import type { PrepItem } from '../types'
import type { PrepItemDetails } from '../hooks/usePrepItems'

export interface ExtractedActionDocument {
  id: string
  title: string
  subtitle: string
  type: 'waiver' | 'payment' | 'cart' | 'document' | 'portal'
  amount?: string
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

/**
 * Helper to detect if an action item has a proactive calendar event suggestion
 * without running full multi-document analysis. Used for glanceable queue card badges.
 */
export function detectSuggestedEvent(item: PrepItem | null): SuggestedEventPlan | null {
  if (!item) return null
  const desc = (item.description || item.event_title || '').trim()

  // 1. Explicit event_suggestion or appointment source pattern
  if (item.source_pattern_key === 'event_suggestion' || item.type === 'appointment' || item.type === 'event_suggestion') {
    const rawTitle = item.event_title || desc.replace(/^Suggested Appointment:\s*/i, '').split(' at ')[0].split(' — ')[0].trim() || 'Appointment'
    const targetDateIso = item.event_date || item.due_by
    if (targetDateIso) {
      try {
        const d = new Date(targetDateIso)
        if (!isNaN(d.getTime())) {
          const yyyy = d.getFullYear()
          const mm = String(d.getMonth() + 1).padStart(2, '0')
          const dd = String(d.getDate()).padStart(2, '0')
          const dateStr = `${yyyy}-${mm}-${dd}`
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          const isMidnightUtc = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
          const isAllDay = isMidnightUtc && targetDateIso.length === 10
          
          let location: string | null = null
          if (desc.includes(' at ')) {
            const afterAt = desc.split(' at ')[1]
            location = afterAt.split(' — ')[0].trim()
          }

          const timeString = isAllDay ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

          return {
            title: rawTitle,
            date: dateStr,
            displayDate: `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}${timeString ? ` · ${timeString}` : ''}`,
            startTime: isAllDay ? null : d.toISOString(),
            endTime: isAllDay ? null : new Date(d.getTime() + 45 * 60_000).toISOString(),
            allDay: isAllDay,
            location: location || item.attention_vendor || null,
            description: desc || null,
            category: item.category || 'general',
            confidence: 'high',
          }
        }
      } catch {}
    }
  }

  // 2. School PTO / Spirit Day (8/28/26) - only if explicitly PTO spirit day
  if (/(?=.*(?:pto|pta))(?=.*spirit\s*day)/i.test(desc)) {
    return {
      title: 'PTO Spirit Day - Palm Beach School (Wear Green & Gold)',
      date: '2026-08-28',
      displayDate: 'Fri, Aug 28',
      allDay: true,
      location: 'Palm Beach School',
      description: 'First school-wide PTO Spirit Day. Wear emerald green & gold spirit shirt with uniform bottoms.',
      category: 'school',
      confidence: 'high',
    }
  }

  // 3. Science Camp Trip / Medical Waiver (8/17/26) - only if explicitly Science Camp waiver/trip
  if (/(?=.*(?:science\s*camp|lake\s*alpine))(?=.*(?:waiver|release|medication|departure|camp))/i.test(desc)) {
    return {
      title: '5th Grade Science Camp Departure (Lake Alpine)',
      date: '2026-08-17',
      displayDate: 'Mon, Aug 17',
      startTime: '2026-08-17T07:30:00-04:00',
      endTime: '2026-08-17T08:30:00-04:00',
      allDay: false,
      location: 'Oakridge Elementary Bus Loading Bay',
      description: '5th Grade Science Camp bus departure. All waivers and medication forms must be on file.',
      category: 'school',
      confidence: 'high',
    }
  }

  // 4. Fallback to explicit due date if present and within reasonable calendar window
  if (item.due_by) {
    try {
      const d = new Date(item.due_by)
      if (!isNaN(d.getTime())) {
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        const dateStr = `${yyyy}-${mm}-${dd}`
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        return {
          title: item.event_title || item.description || 'Household Action Reminder',
          date: dateStr,
          displayDate: `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`,
          allDay: true,
          description: item.description || null,
          category: item.type || 'general',
          confidence: 'medium',
        }
      }
    } catch {}
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

  // 1. If real Gmail context was fetched from database
  if (detailedItem?.gmailContext && detailedItem.gmailContext.subject) {
    const { subject, from_email, received_at, email_body } = detailedItem.gmailContext
    const fromName = from_email ? from_email.split('<')[0].replace(/"/g, '').trim() : 'Email Notification'
    const cleanSubject = subject || desc || 'Email Action Item'
    
    return {
      senderLabel: fromName || 'Email Notification',
      senderEmail: from_email || 'notifications@service.com',
      receivedTime: received_at ? new Date(received_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Today',
      subject: cleanSubject,
      urgency: item?.due_by ? 'Scheduled for today — immediate review recommended.' : 'Information received — review at your convenience.',
      requiredAction: desc ? `Review: "${desc.length > 90 ? desc.slice(0, 87) + '…' : desc}"` : `Review matter regarding "${cleanSubject}".`,
      householdImpact: amount ? `Transaction amount: ${amount}` : 'Keeps family communications and actions organized.',
      documents: amount
        ? [{ id: 'doc-1', title: 'Payment Confirmation', subtitle: `${amount} Transaction Record`, type: 'payment', amount }]
        : [{ id: 'doc-1', title: 'Message Attachment', subtitle: 'View Full Reference', type: 'document' }],
      emailBody: email_body || desc,
      suggestedEvent,
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
  const derivedSubject = item?.event_title || (desc ? (desc.length > 70 ? desc.slice(0, 67) + '…' : desc) : 'Household Task')
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
  }
}
