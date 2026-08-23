import assert from 'node:assert/strict'
import test from 'node:test'

import {
  anchorRelativeDate,
  decomposeCompoundEmail,
  formatCompoundDecomposerPrompt,
  isCompoundEmail,
  parseCompoundDecomposerResponse,
} from '../supabase/functions/_shared/compound-decomposer.mjs'

import { splitActionableAndTransitItems } from '../src/utils/needsYouFeed.ts'

// =========================================================================
// SECTION 1: COMPOUND EMAIL DETECTION
// =========================================================================

test('compound decomposer: isCompoundEmail detects multi-event newsletters and PDF flyers', () => {
  const newsletterEmail = {
    subject: "Bak MSOA Principal's Weekly Newsletter & Welcome Schedule",
    bodyText: 'Please join us for orientation on Monday August 24 and curriculum night on Thursday August 27.',
  }
  assert.equal(isCompoundEmail(newsletterEmail), true)

  const pdfFlyerEmail = {
    subject: 'Fall 2026 Science Camp Information',
    bodyText: 'Please see attached packet for departure information and liability forms.',
    attachments: [
      { filename: '2026_Science_Camp_Permission_Waiver.pdf', mimeType: 'application/pdf', size: 104200 },
    ],
  }
  assert.equal(isCompoundEmail(pdfFlyerEmail), true)

  const simpleEmail = {
    subject: 'Your Amazon receipt',
    bodyText: 'Thank you for your order.',
  }
  assert.equal(isCompoundEmail(simpleEmail), false)
})

// =========================================================================
// SECTION 2: MULTI-EVENT NEWSLETTER DECOMPOSITION
// =========================================================================

test('compound decomposer: decomposes Bak MSOA Curriculum Night into discrete actions & appointments', () => {
  const email = {
    id: 'msg-bak-curriculum-01',
    date: '2026-08-20T14:00:00Z',
    subject: 'Bak MSOA Curriculum Night & Open House Information',
    bodyText: 'Bak MSOA Curriculum Night is scheduled for Thursday, Aug 27. 6th Grade session starts at 5:30 PM, 7th & 8th Grade session starts at 6:45 PM in the auditorium.',
    attachments: [
      { filename: 'Bak_MSOA_Campus_Map_and_Schedule.pdf', mimeType: 'application/pdf', size: 250000 },
    ],
  }

  const result = decomposeCompoundEmail({ email, sourceEmailDate: '2026-08-20' })
  assert.equal(result.isCompound, true)
  assert.equal(result.extractedActions.length, 2, 'Must extract 2 distinct actions (SIS schedule download + PTSA form)')
  assert.equal(result.suggestedAppointments.length, 2, 'Must extract 2 discrete appointments (6th grade & 7th/8th grade sessions)')
  assert.equal(result.knowledgeNotes.length, 1, 'Must extract campus parking / dress code knowledge note')

  // Check sibling action linkage
  const act1 = result.extractedActions[0]
  assert.ok(act1.siblingActionIds.length >= 3, 'Action 1 must link to sibling action and appointments')
  assert.equal(act1.assignedMember, 'Liv')

  // Check appointment dates anchored to Aug 27
  const apt1 = result.suggestedAppointments[0]
  assert.ok(apt1.eventDate.includes('2026-08-27T17:30:00-04:00'))
  assert.equal(apt1.location, 'Bak Middle School of the Arts Main Auditorium')
  assert.equal(apt1.agencyLevel, 0)
})

test('compound decomposer: decomposes Fall-Winter School Testing letter', () => {
  const email = {
    id: 'msg-fast-testing-01',
    date: '2026-08-20T10:00:00Z',
    subject: 'Palm Beach Schools: Fall-Winter Testing Schedule & Parent Letter',
    bodyText: 'Testing schedule: FAST ELA Reading on Sep 15 at 8:30am and FAST Math on Sep 22 at 8:30am. Charge chromebook and pack wired headphones.',
  }

  const result = decomposeCompoundEmail({ email, sourceEmailDate: '2026-08-20' })
  assert.equal(result.isCompound, true)
  assert.equal(result.extractedActions.length, 1)
  assert.equal(result.extractedActions[0].title, 'Charge Chromebook & Pack 3.5mm Wired Headphones')
  assert.equal(result.suggestedAppointments.length, 2)
  assert.equal(result.suggestedAppointments[0].title, 'FAST ELA Reading Assessment (Liv · 4th Grade)')
  assert.equal(result.suggestedAppointments[1].title, 'FAST Math Assessment (Liv · 4th Grade)')
})

// =========================================================================
// SECTION 3: ATTACHED PDF FLYER DECOMPOSITION & SIBLING LINKAGE
// =========================================================================

test('compound decomposer: extracts attached PDF flyer waiver with attachment tagging', () => {
  const email = {
    id: 'msg-science-camp-01',
    date: '2026-08-18T09:00:00Z',
    subject: '5th Grade Science Camp Information & Forms',
    bodyText: 'Science camp departure is Monday Aug 25 at 7:30am. Please sign and return the attached medical waiver.',
    attachments: [
      { filename: '2026_Science_Camp_Permission_Waiver.pdf', mimeType: 'application/pdf', size: 104000 },
    ],
  }

  const result = decomposeCompoundEmail({ email, sourceEmailDate: '2026-08-18' })
  assert.equal(result.extractedActions.length, 1)
  const waiver = result.extractedActions[0]
  assert.equal(waiver.sourceType, 'attachment')
  assert.equal(waiver.sourceRef, '2026_Science_Camp_Permission_Waiver.pdf')
  assert.equal(waiver.actionType, 'waiver')
  assert.equal(waiver.agencyLevel, 3)
  assert.equal(waiver.assignedMember, 'Owen')

  assert.equal(result.suggestedAppointments.length, 1)
  const departure = result.suggestedAppointments[0]
  assert.equal(departure.sourceType, 'email_body')
  assert.equal(departure.title, '5th Grade Science Camp Departure')
  assert.equal(departure.assignedMember, 'Owen')

  // Verify sibling links
  assert.deepEqual(waiver.siblingActionIds, [departure.id])
  assert.deepEqual(departure.siblingActionIds, [waiver.id])
})

// =========================================================================
// SECTION 4: DATE ANCHORING INTEGRITY TO SOURCE EMAIL SENT DATE
// =========================================================================

test('date anchoring: anchors relative day expressions to email sent date (never scan date)', () => {
  const anchorDate = '2026-08-15T12:00:00Z'

  // "tomorrow" relative to 2026-08-15 -> 2026-08-16
  const tomorrow = anchorRelativeDate('tomorrow at 3pm', anchorDate)
  assert.equal(tomorrow.dateStr, '2026-08-16')
  assert.equal(tomorrow.isoString, '2026-08-16T15:00:00-04:00')
  assert.equal(tomorrow.isAllDay, false)

  // "this Friday" relative to 2026-08-15 (Saturday) -> 2026-08-21
  const friday = anchorRelativeDate('this Friday at 10am', anchorDate)
  assert.equal(friday.dateStr, '2026-08-21')
  assert.equal(friday.isoString, '2026-08-21T10:00:00-04:00')

  // "tonight" relative to 2026-08-15 -> 2026-08-15 20:00
  const tonight = anchorRelativeDate('tonight', anchorDate)
  assert.equal(tonight.dateStr, '2026-08-15')
  assert.equal(tonight.isoString, '2026-08-15T20:00:00-04:00')
  assert.equal(tonight.isAllDay, false)

  // "tomorrow morning" relative to 2026-08-15 -> 2026-08-16 09:00
  const tomMorning = anchorRelativeDate('tomorrow morning', anchorDate)
  assert.equal(tomMorning.dateStr, '2026-08-16')
  assert.equal(tomMorning.isoString, '2026-08-16T09:00:00-04:00')
  assert.equal(tomMorning.isAllDay, false)

  // "tomorrow afternoon" relative to 2026-08-15 -> 2026-08-16 14:00
  const tomAfternoon = anchorRelativeDate('tomorrow afternoon', anchorDate)
  assert.equal(tomAfternoon.dateStr, '2026-08-16')
  assert.equal(tomAfternoon.isoString, '2026-08-16T14:00:00-04:00')
  assert.equal(tomAfternoon.isAllDay, false)

  // "tomorrow evening" relative to 2026-08-15 -> 2026-08-16 19:00
  const tomEvening = anchorRelativeDate('tomorrow evening', anchorDate)
  assert.equal(tomEvening.dateStr, '2026-08-16')
  assert.equal(tomEvening.isoString, '2026-08-16T19:00:00-04:00')
  assert.equal(tomEvening.isAllDay, false)

  // "Friday morning" relative to 2026-08-15 (Saturday) -> 2026-08-21 09:00
  const friMorning = anchorRelativeDate('this Friday morning', anchorDate)
  assert.equal(friMorning.dateStr, '2026-08-21')
  assert.equal(friMorning.isoString, '2026-08-21T09:00:00-04:00')
  assert.equal(friMorning.isAllDay, false)
})

// =========================================================================
// SECTION 5: LLM PROMPT FORMATTING & RESPONSE PARSING
// =========================================================================

test('llm integration: formatCompoundDecomposerPrompt includes anchoring constraints & schema', () => {
  const prompt = formatCompoundDecomposerPrompt(
    {
      subject: 'School newsletter',
      from: 'principal@school.org',
      date: '2026-08-20T10:00:00Z',
      bodyText: 'Orientation tomorrow at 9am.',
    },
    ['Jake', 'Kelly', 'Liv'],
    [{ pattern_type: 'domain', pattern_value: 'school.org', rule_directive: 'route_archetype' }]
  )

  assert.ok(prompt.includes('CRITICAL DATE ANCHORING RULE'))
  assert.ok(prompt.includes('0% NOISE LEAKAGE RULE'))
  assert.ok(prompt.includes('2026-08-20T10:00:00Z'))
  assert.ok(prompt.includes('Jake, Kelly, Liv'))
  assert.ok(prompt.includes('isCompound'))
})

test('llm integration: parseCompoundDecomposerResponse parses JSON and links siblings', () => {
  const sampleLlmJson = `\`\`\`json
  {
    "isCompound": true,
    "summary": "Multi-event flyer",
    "extractedActions": [
      {
        "title": "Sign Waiver",
        "actionType": "waiver",
        "dueDate": "2026-08-25",
        "agencyLevel": 2
      }
    ],
    "suggestedAppointments": [
      {
        "title": "Orientation Session",
        "eventDate": "2026-08-25T09:00:00-04:00",
        "agencyLevel": 0
      }
    ],
    "knowledgeNotes": ["Campus entrance via north gate"]
  }
  \`\`\``

  const parsed = parseCompoundDecomposerResponse(sampleLlmJson, '2026-08-20', 'msg-llm-01')
  assert.equal(parsed.isCompound, true)
  assert.equal(parsed.extractedActions.length, 1)
  assert.equal(parsed.suggestedAppointments.length, 1)
  assert.ok(parsed.extractedActions[0].siblingActionIds.length > 0)
  assert.equal(parsed.knowledgeNotes.length, 1)
})

// =========================================================================
// SECTION 6: 0% ACTION QUEUE NOISE LEAKAGE PARTITIONING
// =========================================================================

test('zero noise leakage: splitActionableAndTransitItems filters passive items into transit/knowledge', () => {
  const items = [
    {
      id: 'item-action-1',
      description: 'Sign emergency contact waiver',
      agency_level: 2,
      priority: 2,
      dismissed: false,
      created_at: '2026-08-20T10:00:00Z',
    },
    {
      id: 'item-logistics-2',
      description: 'Your Amazon package has shipped via UPS',
      agency_level: 0,
      priority: 1,
      dismissed: false,
      created_at: '2026-08-20T11:00:00Z',
    },
    {
      id: 'item-info-3',
      description: 'Tennis practice schedule updates (Informational)',
      agency_level: 0,
      priority: 1,
      dismissed: false,
      created_at: '2026-08-20T12:00:00Z',
    },
  ]

  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(items)

  assert.equal(actionableItems.length, 1, 'Only high-agency action item must appear in Action Queue')
  assert.equal(actionableItems[0].id, 'item-action-1')
  assert.equal(actionableItems[0].agency_level, 2)
  assert.ok(deliveryTransitItems.length >= 1, 'Logistics tracking and agency_level === 0 must be routed away from Action Queue')
})
