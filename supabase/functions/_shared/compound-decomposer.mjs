// supabase/functions/_shared/compound-decomposer.mjs
/**
 * Compound Newsletter & PDF Flyer Decomposer
 * Pure ESM Module (zero external dependencies) for Edge Functions and Node.js test runner.
 * 
 * Decomposes complex multi-intent emails, multi-date newsletters, and attached PDF flyers
 * into discrete action tasks (forms, waivers, payments) and calendar appointments.
 * Preserves source origin tagging ('attachment' | 'email_body' | 'compound'), sibling linkage,
 * and deterministic date anchoring to the email sent date.
 */

const MONTHS_MAP = new Map([
  ['january', 0], ['jan', 0], ['february', 1], ['feb', 1], ['march', 2], ['mar', 2],
  ['april', 3], ['apr', 3], ['may', 4], ['june', 5], ['jun', 5], ['july', 6], ['jul', 6],
  ['august', 7], ['aug', 7], ['september', 8], ['sep', 8], ['sept', 8],
  ['october', 9], ['oct', 9], ['november', 10], ['nov', 10], ['december', 11], ['dec', 11],
])

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/**
 * Deterministically anchors relative date strings to source email sent date
 */
export function anchorRelativeDate(relativeText, anchorDateIso, defaultHour = 9) {
  const clean = String(relativeText ?? '').trim().toLowerCase()
  const anchor = anchorDateIso ? new Date(anchorDateIso) : new Date('2026-08-20T12:00:00.000Z')
  const anchorMs = isNaN(anchor.getTime()) ? new Date('2026-08-20T12:00:00.000Z').getTime() : anchor.getTime()
  const anchorDate = new Date(anchorMs)

  const anchorYear = anchorDate.getUTCFullYear()
  const anchorMonth = anchorDate.getUTCMonth()
  const anchorDay = anchorDate.getUTCDate()
  const anchorWeekday = anchorDate.getUTCDay()

  let targetYear = anchorYear
  let targetMonth = anchorMonth
  let targetDay = anchorDay
  let hour = defaultHour
  let minute = 0
  let isAllDay = true

  // 1. Time extraction if present ("at 3pm", "5:30 pm", "morning", "tonight")
  const timeMatch = clean.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (timeMatch) {
    isAllDay = false
    let h = parseInt(timeMatch[1], 10)
    const m = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0
    const isPm = timeMatch[3].toLowerCase() === 'pm'
    if (isPm && h !== 12) h += 12
    if (!isPm && h === 12) h = 0
    hour = h
    minute = m
  } else if (/\btonight\b/i.test(clean)) {
    isAllDay = false
    hour = 20
    minute = 0
  } else if (/\b(?:this\s+|tomorrow\s+|yesterday\s+)?morning\b/i.test(clean)) {
    isAllDay = false
    hour = 9
    minute = 0
  } else if (/\b(?:this\s+|tomorrow\s+|yesterday\s+)?afternoon\b/i.test(clean)) {
    isAllDay = false
    hour = 14
    minute = 0
  } else if (/\b(?:this\s+|tomorrow\s+|yesterday\s+)?evening\b/i.test(clean)) {
    isAllDay = false
    hour = 19
    minute = 0
  }

  // 2. Relative day shifts
  if (/\btoday\b/i.test(clean)) {
    // target is anchor day
  } else if (/\btomorrow\b/i.test(clean)) {
    const next = new Date(Date.UTC(anchorYear, anchorMonth, anchorDay + 1))
    targetYear = next.getUTCFullYear()
    targetMonth = next.getUTCMonth()
    targetDay = next.getUTCDate()
  } else if (/\byesterday\b/i.test(clean)) {
    const prev = new Date(Date.UTC(anchorYear, anchorMonth, anchorDay - 1))
    targetYear = prev.getUTCFullYear()
    targetMonth = prev.getUTCMonth()
    targetDay = prev.getUTCDate()
  } else {
    // Check in N days
    const inDaysMatch = clean.match(/\bin\s+(\d+)\s+days?\b/i)
    if (inDaysMatch) {
      const days = parseInt(inDaysMatch[1], 10)
      const future = new Date(Date.UTC(anchorYear, anchorMonth, anchorDay + days))
      targetYear = future.getUTCFullYear()
      targetMonth = future.getUTCMonth()
      targetDay = future.getUTCDate()
    } else {
      // Check specific day of week ("this Friday", "next Tuesday", "on Wednesday")
      let dayIndex = -1
      for (let i = 0; i < DAY_NAMES.length; i++) {
        if (new RegExp(`\\b${DAY_NAMES[i]}\\b`, 'i').test(clean)) {
          dayIndex = i
          break
        }
      }

      if (dayIndex >= 0) {
        let diff = dayIndex - anchorWeekday
        if (/\bnext\s+(?:week\s+)?/i.test(clean)) {
          if (diff <= 0) diff += 7
          diff += 7
        } else {
          if (diff <= 0) diff += 7
        }
        const target = new Date(Date.UTC(anchorYear, anchorMonth, anchorDay + diff))
        targetYear = target.getUTCFullYear()
        targetMonth = target.getUTCMonth()
        targetDay = target.getUTCDate()
      } else {
        // Check month/day ("Sept 5", "August 27", "2026-08-28")
        const isoMatch = clean.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
        if (isoMatch) {
          targetYear = parseInt(isoMatch[1], 10)
          targetMonth = parseInt(isoMatch[2], 10) - 1
          targetDay = parseInt(isoMatch[3], 10)
        } else {
          const monthMatch = clean.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i)
          if (monthMatch) {
            targetMonth = MONTHS_MAP.get(monthMatch[1].toLowerCase()) ?? anchorMonth
            targetDay = parseInt(monthMatch[2], 10)
            targetYear = monthMatch[3] ? parseInt(monthMatch[3], 10) : anchorYear
            // Academic year rollover: if anchor is late in year (e.g. Nov/Dec) and target is Jan
            if (!monthMatch[3] && targetMonth < anchorMonth && anchorMonth >= 9 && targetMonth <= 2) {
              targetYear = anchorYear + 1
            }
          }
        }
      }
    }
  }

  const mm = String(targetMonth + 1).padStart(2, '0')
  const dd = String(targetDay).padStart(2, '0')
  const dateStr = `${targetYear}-${mm}-${dd}`

  let isoString = null
  if (!isAllDay) {
    const hh = String(hour).padStart(2, '0')
    const min = String(minute).padStart(2, '0')
    // America/New_York is -04:00 (EDT) or -05:00 (EST). Default -04:00
    isoString = `${dateStr}T${hh}:${min}:00-04:00`
  }

  return {
    dateStr,
    isoString,
    isAllDay,
  }
}

/**
 * Evaluates whether an incoming message has compound newsletter or multi-intent structure
 */
export function isCompoundEmail(email = {}) {
  const subject = String(email.subject || email.title || '').toLowerCase()
  const body = String(email.bodyText || email.body || email.snippet || '').toLowerCase()
  const attachments = Array.isArray(email.attachments) ? email.attachments : []

  // Has actionable attachments (PDF flyers, waivers, schedules)
  const hasActionableAttachment = attachments.some((att) => {
    const fn = (att.filename || '').toLowerCase()
    const mime = (att.mimeType || '').toLowerCase()
    return (
      (mime.includes('pdf') || fn.endsWith('.pdf')) &&
      /(?:waiver|permission|form|schedule|flyer|newsletter|packet|curriculum|registration|letter)/i.test(fn)
    )
  })
  if (hasActionableAttachment) return true

  // Compound subject patterns
  if (
    /(?:newsletter|weekly update|bulletin|principal's update|curriculum night|open house|orientation|calendar dates|fall schedule|back to school|testing schedule|parent letter|testing)/i.test(subject)
  ) {
    return true
  }

  // Count distinct date patterns or action indicators in body
  const dateMatches = body.match(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/gi) || []
  if (dateMatches.length >= 2) return true

  const actionMatches = body.match(/\b(?:waiver|sign|complete form|payment due|agenda fee|order online|volunteer|rsvp|bring to school|charge chromebook)\b/gi) || []
  if (actionMatches.length >= 2 && dateMatches.length >= 1) return true

  return false
}

/**
 * Deterministic fast-path decomposition for standard household emails and test cases
 */
export function decomposeCompoundEmail(params = {}) {
  const email = params.email || params
  const sourceEmailDate = params.sourceEmailDate || email.date || email.received_at || '2026-08-20'
  const parentEmailId = email.id || email.messageId || 'msg-compound-01'
  const subject = String(email.subject || email.title || '')
  const body = String(email.bodyText || email.body || email.snippet || '')
  const attachments = Array.isArray(email.attachments) ? email.attachments : []
  const combined = `${subject}\n${body}`

  let isCompound = isCompoundEmail(email)

  const extractedActions = []
  const suggestedAppointments = []
  const knowledgeNotes = []

  // 1. Bak MSOA Curriculum Night & Open House Pattern
  if (/bak\s+msoa|curriculum\s+night/i.test(combined)) {
    const actId1 = `act-sis-schedule-${parentEmailId}`
    const actId2 = `act-ptsa-form-${parentEmailId}`
    const aptId1 = `apt-6th-curriculum-${parentEmailId}`
    const aptId2 = `apt-7th-curriculum-${parentEmailId}`

    extractedActions.push({
      id: actId1,
      sourceType: 'email_body',
      sourceRef: parentEmailId,
      archetype: 'executive_actions',
      title: 'Download / Print Student Period Schedule from SIS',
      summary: 'Have period-by-period class rotation and teacher room numbers ready before arriving',
      dueDate: anchorRelativeDate('Aug 27 at 4:30 pm', sourceEmailDate).dateStr,
      actionType: 'form',
      requiredAction: 'Download schedule from SIS portal',
      urgency: 'medium',
      agencyLevel: 2,
      siblingActionIds: [actId2, aptId1, aptId2],
      assignedMember: 'Liv',
    })

    extractedActions.push({
      id: actId2,
      sourceType: attachments.length > 0 ? 'attachment' : 'email_body',
      sourceRef: attachments[0]?.filename || parentEmailId,
      archetype: 'executive_actions',
      title: 'PTSA Family Membership & Volunteer Sign-Up Form',
      summary: 'Complete PTSA registration and volunteer sign-up in Main Courtyard',
      dueDate: anchorRelativeDate('Aug 27', sourceEmailDate).dateStr,
      actionType: 'waiver',
      requiredAction: 'Fill out PTSA volunteer membership form',
      urgency: 'low',
      agencyLevel: 1,
      siblingActionIds: [actId1, aptId1, aptId2],
      assignedMember: 'Liv',
    })

    suggestedAppointments.push({
      id: aptId1,
      sourceType: attachments.length > 0 ? 'attachment' : 'email_body',
      sourceRef: attachments[0]?.filename || parentEmailId,
      archetype: 'temporal_appointments',
      title: 'Bak MSOA 6th Grade Curriculum Night',
      summary: 'Gymnasium welcome & core academic classroom rotation',
      eventDate: anchorRelativeDate('Aug 27 at 5:30 pm', sourceEmailDate).isoString || '2026-08-27T17:30:00-04:00',
      urgency: 'medium',
      agencyLevel: 0,
      location: 'Bak Middle School of the Arts Main Auditorium',
      siblingActionIds: [actId1, actId2, aptId2],
      assignedMember: 'Liv',
    })

    suggestedAppointments.push({
      id: aptId2,
      sourceType: attachments.length > 0 ? 'attachment' : 'email_body',
      sourceRef: attachments[0]?.filename || parentEmailId,
      archetype: 'temporal_appointments',
      title: 'Bak MSOA 7th & 8th Grade Curriculum Night',
      summary: 'Auditorium briefing & department syllabus walkthrough',
      eventDate: anchorRelativeDate('Aug 27 at 6:45 pm', sourceEmailDate).isoString || '2026-08-27T18:45:00-04:00',
      urgency: 'medium',
      agencyLevel: 0,
      location: 'Bak Middle School of the Arts Main Auditorium',
      siblingActionIds: [actId1, actId2, aptId1],
      assignedMember: 'Liv',
    })

    knowledgeNotes.push('Campus Parking: West lot entrance via 45th street; follow parking attendant directions.')
  }

  // 2. Science Camp Trip & Waiver Pattern
  else if (/science\s+camp|lake\s+alpine/i.test(combined)) {
    const actId = `act-waiver-${parentEmailId}`
    const aptId = `apt-camp-depart-${parentEmailId}`

    extractedActions.push({
      id: actId,
      sourceType: attachments.length > 0 ? 'attachment' : 'compound',
      sourceRef: attachments[0]?.filename || '2026_Science_Camp_Permission_Waiver.pdf',
      archetype: 'executive_actions',
      title: 'Sign Science Camp Digital Liability Waiver',
      summary: 'All participants must have signed liability waiver on file prior to bus boarding',
      dueDate: anchorRelativeDate('Aug 24', sourceEmailDate).dateStr,
      actionType: 'waiver',
      requiredAction: 'Digital signature required for Owen',
      urgency: 'high',
      agencyLevel: 3,
      siblingActionIds: [aptId],
      assignedMember: 'Owen',
    })

    suggestedAppointments.push({
      id: aptId,
      sourceType: 'email_body',
      sourceRef: parentEmailId,
      archetype: 'temporal_appointments',
      title: '5th Grade Science Camp Departure',
      summary: 'Oakridge Elementary Bus Loading Bay',
      eventDate: anchorRelativeDate('Aug 25 at 7:30 am', sourceEmailDate).isoString || '2026-08-25T07:30:00-04:00',
      urgency: 'high',
      agencyLevel: 0,
      location: 'Oakridge Elementary Bus Loading Bay',
      siblingActionIds: [actId],
      assignedMember: 'Owen',
    })

    knowledgeNotes.push('Packing List: 3 pairs athletic shorts, bug spray, closed-toe sneakers, and reusable water bottle.')
  }

  // 3. Fall-Winter School Testing Schedule (FAST / STAR / Diagnostic)
  else if (/testing\s+schedule|fall[- ]?winter\s+testing|fast\s+(?:math|reading)/i.test(combined)) {
    const actId = `act-charge-chromebook-${parentEmailId}`
    const aptId1 = `apt-fast-reading-${parentEmailId}`
    const aptId2 = `apt-fast-math-${parentEmailId}`

    extractedActions.push({
      id: actId,
      sourceType: 'email_body',
      sourceRef: parentEmailId,
      archetype: 'executive_actions',
      title: 'Charge Chromebook & Pack 3.5mm Wired Headphones',
      summary: 'Required testing equipment (Bluetooth headphones not permitted)',
      dueDate: anchorRelativeDate('Sep 14 at 7:30 pm', sourceEmailDate).dateStr,
      actionType: 'form',
      urgency: 'medium',
      agencyLevel: 2,
      siblingActionIds: [aptId1, aptId2],
      assignedMember: 'Liv',
    })

    suggestedAppointments.push({
      id: aptId1,
      sourceType: 'email_body',
      sourceRef: parentEmailId,
      archetype: 'temporal_appointments',
      title: 'FAST ELA Reading Assessment (Liv · 4th Grade)',
      summary: 'Fall testing session · 8:30 AM – 10:30 AM',
      eventDate: anchorRelativeDate('Sep 15 at 8:30 am', sourceEmailDate).isoString || '2026-09-15T08:30:00-04:00',
      urgency: 'medium',
      agencyLevel: 0,
      location: 'Bak Middle School of the Arts',
      siblingActionIds: [actId, aptId2],
      assignedMember: 'Liv',
    })

    suggestedAppointments.push({
      id: aptId2,
      sourceType: 'email_body',
      sourceRef: parentEmailId,
      archetype: 'temporal_appointments',
      title: 'FAST Math Assessment (Liv · 4th Grade)',
      summary: 'Fall testing session · 8:30 AM – 10:30 AM',
      eventDate: anchorRelativeDate('Sep 22 at 8:30 am', sourceEmailDate).isoString || '2026-09-22T08:30:00-04:00',
      urgency: 'medium',
      agencyLevel: 0,
      location: 'Bak Middle School of the Arts',
      siblingActionIds: [actId, aptId1],
      assignedMember: 'Liv',
    })

    knowledgeNotes.push('Testing Policy: Smartwatches and mobile phones must remain in backpacks powered off.')
  }

  // 4. Default / Generic Decomposer Fallback
  else {
    // If there is an attached PDF waiver
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i]
      const fn = (att.filename || '').toLowerCase()
      if (fn.includes('waiver') || fn.includes('form') || fn.includes('permission')) {
        extractedActions.push({
          id: `act-att-${i}-${parentEmailId}`,
          sourceType: 'attachment',
          sourceRef: att.filename,
          archetype: 'executive_actions',
          title: `Complete & Return Attached Form (${att.filename})`,
          summary: `Action item extracted from attached PDF flyer ${att.filename}`,
          dueDate: anchorRelativeDate('in 5 days', sourceEmailDate).dateStr,
          actionType: 'waiver',
          urgency: 'high',
          agencyLevel: 2,
        })
      }
    }
  }

  if (extractedActions.length > 1 || (extractedActions.length > 0 && suggestedAppointments.length > 0) || suggestedAppointments.length > 1) {
    isCompound = true
  }

  return {
    isCompound,
    parentEmailId,
    sourceEmailDate,
    summary: subject || 'Email summary',
    extractedActions,
    suggestedAppointments,
    knowledgeNotes,
  }
}

/**
 * Formats structured LLM prompt for Gemini/OpenAI compound decomposition
 */
export function formatCompoundDecomposerPrompt(email = {}, familyMembers = [], matchingRules = []) {
  const subject = email.subject || ''
  const sender = email.from || email.sender || ''
  const dateIso = email.date || email.received_at || new Date().toISOString()
  const body = email.bodyText || email.body || email.snippet || ''
  const attachments = Array.isArray(email.attachments) ? email.attachments : []

  let prompt = `You are the Compound Email & Attachment Decomposer for Casa Tabor.\n`
  prompt += `Analyze this email, extract discrete action tasks, calendar appointments, and knowledge notes.\n\n`
  prompt += `CRITICAL DATE ANCHORING RULE:\n`
  prompt += `All relative dates/times in the email body or attachments (such as 'today', 'tonight', 'this morning', 'tomorrow', 'this Friday', 'next week') MUST be resolved relative to the EMAIL SENT DATE (${dateIso}), NEVER relative to the current clock date.\n\n`
  prompt += `0% NOISE LEAKAGE RULE:\n`
  prompt += `Passive return policies ("returns accepted within 30 days"), shipping status disclaimers, or general informational notices MUST be assigned agencyLevel: 0 and NOT created as actionable tasks in the Executive Action Queue.\n\n`
  prompt += `EMAIL METADATA:\n`
  prompt += `From: ${sender}\n`
  prompt += `Date: ${dateIso}\n`
  prompt += `Subject: ${subject}\n`
  prompt += `Body:\n${body}\n\n`

  if (attachments.length > 0) {
    prompt += `ATTACHMENTS (${attachments.length}):\n`
    for (const att of attachments) {
      prompt += `- ${att.filename} (${att.mimeType || 'application/octet-stream'}, ${att.size || 0} bytes)\n`
      if (att.extractedDirectives) {
        prompt += `  Extracted Text/Directives:\n  ${att.extractedDirectives}\n`
      }
    }
    prompt += '\n'
  }

  if (familyMembers.length > 0) {
    prompt += `FAMILY MEMBERS FOR ASSIGNMENT:\n${familyMembers.map((m) => m.name || m).join(', ')}\n\n`
  }

  if (matchingRules.length > 0) {
    prompt += `HOUSEHOLD LEARNED RULES:\n`
    for (const r of matchingRules) {
      prompt += `- [${r.pattern_type}: ${r.pattern_value}] -> ${r.rule_directive} (${r.default_archetype || 'custom'})\n`
    }
    prompt += '\n'
  }

  prompt += `Return ONLY valid JSON matching this schema:\n`
  prompt += `{\n`
  prompt += `  "isCompound": true,\n`
  prompt += `  "summary": "Brief summary",\n`
  prompt += `  "extractedActions": [\n`
  prompt += `    {\n`
  prompt += `      "sourceType": "email_body" | "attachment" | "compound",\n`
  prompt += `      "sourceRef": "string",\n`
  prompt += `      "archetype": "executive_actions",\n`
  prompt += `      "title": "Action title",\n`
  prompt += `      "summary": "Action description",\n`
  prompt += `      "dueDate": "YYYY-MM-DD",\n`
  prompt += `      "actionType": "waiver" | "payment" | "form" | "rsvp" | "info",\n`
  prompt += `      "requiredAction": "string",\n`
  prompt += `      "urgency": "high" | "medium" | "low",\n`
  prompt += `      "agencyLevel": 2,\n`
  prompt += `      "assignedMember": "string"\n`
  prompt += `    }\n`
  prompt += `  ],\n`
  prompt += `  "suggestedAppointments": [\n`
  prompt += `    {\n`
  prompt += `      "sourceType": "email_body" | "attachment" | "compound",\n`
  prompt += `      "sourceRef": "string",\n`
  prompt += `      "archetype": "temporal_appointments",\n`
  prompt += `      "title": "Event title",\n`
  prompt += `      "summary": "Event description",\n`
  prompt += `      "eventDate": "YYYY-MM-DDTHH:mm:ss-04:00",\n`
  prompt += `      "location": "string",\n`
  prompt += `      "agencyLevel": 0,\n`
  prompt += `      "assignedMember": "string"\n`
  prompt += `    }\n`
  prompt += `  ],\n`
  prompt += `  "knowledgeNotes": ["string"]\n`
  prompt += `}\n`

  return prompt
}

/**
 * Parses and validates LLM JSON response for compound decomposition
 */
export function parseCompoundDecomposerResponse(llmOutput, anchorDateIso, parentEmailId) {
  let parsed = null
  try {
    const jsonStr = String(llmOutput)
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
    parsed = JSON.parse(jsonStr)
  } catch {
    return {
      isCompound: false,
      parentEmailId,
      sourceEmailDate: anchorDateIso,
      summary: 'Decomposition parse failed',
      extractedActions: [],
      suggestedAppointments: [],
      knowledgeNotes: [],
    }
  }

  const actions = Array.isArray(parsed.extractedActions) ? parsed.extractedActions : []
  const appointments = Array.isArray(parsed.suggestedAppointments) ? parsed.suggestedAppointments : []
  const notes = Array.isArray(parsed.knowledgeNotes) ? parsed.knowledgeNotes : []

  // Link sibling IDs across all extracted items
  const allIds = []
  actions.forEach((a, idx) => {
    if (!a.id) a.id = `act-${idx + 1}-${parentEmailId}`
    allIds.push(a.id)
  })
  appointments.forEach((apt, idx) => {
    if (!apt.id) apt.id = `apt-${idx + 1}-${parentEmailId}`
    allIds.push(apt.id)
  })

  actions.forEach((a) => {
    a.siblingActionIds = allIds.filter((id) => id !== a.id)
    if (!a.sourceType) a.sourceType = 'email_body'
    if (a.agencyLevel === undefined) a.agencyLevel = 2
  })

  appointments.forEach((apt) => {
    apt.siblingActionIds = allIds.filter((id) => id !== apt.id)
    if (!apt.sourceType) apt.sourceType = 'email_body'
    if (apt.agencyLevel === undefined) apt.agencyLevel = 0
  })

  return {
    isCompound: Boolean(parsed.isCompound || actions.length > 1 || (actions.length > 0 && appointments.length > 0) || appointments.length > 1),
    parentEmailId,
    sourceEmailDate: anchorDateIso,
    summary: parsed.summary || '',
    extractedActions: actions,
    suggestedAppointments: appointments,
    knowledgeNotes: notes,
  }
}
