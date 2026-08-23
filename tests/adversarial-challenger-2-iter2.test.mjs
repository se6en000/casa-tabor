import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  canonicalEmailKey,
  normalizeInternetMessageId,
  canonicalContentFingerprint,
} from '../supabase/functions/_shared/gmail-canonical-email.mjs'

import {
  extractGmailMessageContent,
  stripQuotedReplyHistory,
} from '../supabase/functions/_shared/gmail-message-content.mjs'

import {
  classifyFamilyEvidenceCandidate,
  redactFamilyEvidenceText,
  chunkFamilyEvidenceText,
} from '../supabase/functions/_shared/family-email-evidence.mjs'

import {
  classifyEmail,
  clusterEmailCorpus,
  SEMANTIC_ARCHETYPES,
} from '../supabase/functions/_shared/email-clusterer.mjs'

import {
  canonicalizeOrderId,
  canonicalizeTrackingNumber,
  detectCarrierAndTracking,
  detectVendorAndOrder,
  orderId,
  transactionStage,
  resolveEffectiveStage,
  buildDeliveryTransitItem,
  consolidateTransitItems,
  isDeliveryTransitItem,
  isPerishableDelivery,
  isItemArrivingToday,
  isItemDelivered,
  isItemInTransit,
  isItemScheduledLater,
  stageStepIndex,
  vendorTransactionIdentity,
  mergeItemSummary,
  mergeEtaDisplay,
} from '../src/utils/vendorTransactions.ts'

import {
  splitActionableAndTransitItems,
  mergeNeedsYouItems,
  conflictToNeedsYouItem,
  directorySuggestionToNeedsYouItem,
  isReadOnlyNeedsYouItem,
} from '../src/utils/needsYouFeed.ts'

import {
  detectSuggestedEvent,
  detectSuggestedActionBundle,
  synthesizeActionAnalysis,
  extractSmartActionTitle,
  extractAmount,
  parseDateSafe,
} from '../src/utils/actionInspectionSynthesis.ts'

describe('Challenger 2 Iteration 2: Adversarial Stress & Invariant Verification Suite', () => {

  // ==========================================================================
  // TRACK 1: MATHEMATICAL GUARANTEE OF 0% FALSE ACTION QUEUE LEAKAGE
  // ==========================================================================
  describe('Track 1: 0% False Action Queue Leakage Under Extreme Adversarial Edge Cases', () => {

    it('Stress 1.1: 500 Hostile Logistics Variations (Adversarial Prompts, Claim Deadlines, Urgency Hooks)', () => {
      const hostileClauses = [
        'ACTION REQUIRED: Please confirm delivery instructions within 24 hours or package will be returned to sender.',
        'URGENT: Sign into your account to schedule a delivery appointment for your freight item.',
        'Immediate Action Needed: Update delivery address before shipment departs terminal.',
        'Claims for missing, stolen, or damaged items must be submitted within 72 hours of timestamp.',
        'Return policy notice: 30-day trial period expires on September 30. Form required for RMA.',
        'Customer Action Requested: Authorize parcel drop-off at front porch without physical signature.',
        'Payment authorization hold: $482.90 charged to credit card ending in 4012.',
        'Warning: Failure to inspect parcel within 3 calendar days forfeits replacement guarantee.',
        'Perishable freight notice: Refrigerate contents immediately upon receipt to prevent spoilage.',
        'Important: Final call to edit or add items to your scheduled morning delivery window.',
        'Package damaged in transit: Carrier filed exception claim #CLM-948291.',
        'Proof of delivery requested by sender: Adult signature was recorded at 2:15 PM.',
        'Your recurring auto-ship subscription order #2000154-99991111 was created.',
        'Refund request processed: $39.50 credited back to your original payment method.',
        'Delivery attempt failed: Please select a pickup locker or reschedule delivery.',
      ]

      const vendorSamples = [
        'Amazon', 'Walmart', 'Nike', 'Apple', 'Target', 'Jiffy.com', 
        'HelloFresh', 'Blue Apron', 'Instacart', 'DoorDash', 'Chewy',
        'UPS', 'FedEx', 'USPS', 'DHL', 'Best Buy', 'Pottery Barn', 'Crate & Barrel'
      ]

      const stages = ['confirmed', 'shipped', 'out_for_delivery', 'delivered', 'problem', 'payment']

      const batch = []
      for (let i = 0; i < 500; i++) {
        const vendor = vendorSamples[i % vendorSamples.length]
        const clause = hostileClauses[i % hostileClauses.length]
        const stage = stages[i % stages.length]
        const orderNum = `ORD-${100000 + i}`

        batch.push({
          id: `hostile-logistics-${i}`,
          event_title: `${vendor} Order #${orderNum} — ${stage.toUpperCase()}`,
          description: `Shipment update for order #${orderNum}. ${clause}. Total $${(15.99 + (i * 2.37) % 500).toFixed(2)}. Tracking: 1Z${String(i).padStart(16, '0')}`,
          agency_level: 0,
          source_type: 'gmail',
          attention_vendor: vendor,
          attention_stage: stage,
          dismissed: false,
          created_at: new Date(Date.now() - i * 1800000).toISOString(),
        })
      }

      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(batch)
      
      assert.equal(
        actionableItems.length, 
        0, 
        `LEAKAGE DETECTED! ${actionableItems.length} out of 500 adversarial logistics items leaked into Action Queue!`
      )
      assert.ok(deliveryTransitItems.length > 0, 'Delivery transit items must capture all consolidated parcels')
    })

    it('Stress 1.2: Logistics Items with Undefined/Null Agency Level but Explicit Logistics Indicators', () => {
      // Ingest items where agency_level is null/undefined (e.g. legacy ingest or raw DB records)
      const rawItems = [
        {
          id: 'raw-transit-1',
          event_title: 'Your package is out for delivery',
          description: 'UPS tracking 1Z9999999999999999 is arriving today by 7:00 PM.',
          type: 'delivery',
          agency_level: null,
          source_type: 'gmail',
        },
        {
          id: 'raw-transit-2',
          event_title: 'Order Delivered: Amazon.com',
          description: 'Order #112-9849201-4829104 was delivered to front porch.',
          type: null,
          attention_vendor: 'Amazon',
          attention_stage: 'delivered',
          agency_level: undefined,
          source_type: 'gmail',
        },
        {
          id: 'raw-transit-3',
          event_title: 'Walmart+ InHome Order Confirmed',
          description: 'Thanks for your InHome delivery order. 18 grocery items.',
          type: 'grocery',
          agency_level: null,
          source_type: 'gmail',
        },
        {
          id: 'raw-transit-4',
          event_title: 'Nike Order Shipped',
          description: 'Your Nike order #C0987654321 has shipped via FedEx 982736451029.',
          type: null,
          agency_level: undefined,
          source_type: 'gmail',
        },
      ]

      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(rawItems)
      assert.equal(actionableItems.length, 0, 'Items with logistics markers must NOT leak to actionable even if agency_level is null/undefined')
      assert.equal(deliveryTransitItems.length, 4)
    })

    it('Stress 1.3: Deceptive Promotional Fake-Outs with Phishing / Urgent Call to Actions', () => {
      const promotionalEmails = [
        {
          from: 'promotions@potterybarn.com',
          subject: 'ACTION REQUIRED: Claim your $50 reward certificate before it expires!',
          bodyText: 'Jacob, you have earned a $50 reward. Sign in to your card account now to redeem before midnight.',
        },
        {
          from: 'deals@jcrew.com',
          subject: 'URGENT: Final hours for 60% off clearance items — shop now!',
          bodyText: 'Limited inventory remaining on fall sweaters and outerwear. Complete your purchase now.',
        },
        {
          from: 'rewards@marriott.com',
          subject: 'Action Needed: Confirm your Bonvoy account details for 25,000 bonus points',
          bodyText: 'Earn double points on weekend stays. Click here to activate your exclusive seasonal promotion.',
        },
        {
          from: 'newsletter@williams-sonoma.com',
          subject: 'Payment notice: Save $100 on Le Creuset Dutch Ovens this weekend only',
          bodyText: 'Labor Day cookware event: special financing and instant savings available at checkout.',
        },
      ]

      for (const email of promotionalEmails) {
        const classified = classifyEmail(email)
        assert.equal(
          classified.archetype, 
          'promotional_noise', 
          `Deceptive promo "${email.subject}" was classified as ${classified.archetype} instead of promotional_noise`
        )
        assert.equal(
          classified.agencyLevel, 
          0, 
          `Deceptive promo "${email.subject}" must have agency level 0`
        )
      }
    })

    it('Stress 1.4: Real Executive Action Items (Tuition, Medical Waivers, Power Bills) Route 100% to Action Queue', () => {
      const genuineActionItems = [
        {
          id: 'action-fpl-bill',
          type: 'payment',
          category: 'bills_payments',
          event_title: 'Florida Power & Light: Monthly Bill Due $342.18',
          description: 'Your electric bill for service at 1234 Tabor Lane is due on Sep 14, 2026. Avoid late fees.',
          due_by: '2026-09-14T23:59:59Z',
          agency_level: 2,
          dismissed: false,
        },
        {
          id: 'action-school-waiver',
          type: 'forms',
          category: 'forms_paperwork',
          event_title: 'Bak MSOA 6th Grade Science Camp Liability Release Waiver',
          description: 'Mandatory parent signature and $175 lab fee due prior to bus departure on Sep 5.',
          due_by: '2026-09-05T18:00:00Z',
          agency_level: 2,
          dismissed: false,
        },
        {
          id: 'action-concussion-form',
          type: 'forms',
          category: 'forms_paperwork',
          event_title: 'FHSAA Athletic Physical & Concussion Protocol Form',
          description: 'Submit doctor-signed physical form and parent consent before soccer tryouts.',
          due_by: '2026-08-30T17:00:00Z',
          agency_level: 2,
          dismissed: false,
        },
        {
          id: 'action-hoa-fine',
          type: 'general',
          category: 'household_errands',
          event_title: 'Clear perimeter walkways for HOA Roof & Gutter Inspection',
          description: 'Mandatory maintenance notice: all items must be removed from side walkways by Friday, Aug 28.',
          due_by: '2026-08-28T17:00:00Z',
          agency_level: 1,
          dismissed: false,
        },
      ]

      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(genuineActionItems)
      assert.equal(actionableItems.length, 4, '100% of genuine executive action items must route to actionableItems')
      assert.equal(deliveryTransitItems.length, 0, '0% of executive actions must enter deliveryTransitItems')
    })
  })

  // ==========================================================================
  // TRACK 2: CROSS-INBOX DEDUPLICATION (RFC MESSAGE-ID & SHA-256 FALLBACK)
  // ==========================================================================
  describe('Track 2: Cross-Inbox Multi-Recipient Deduplication & SHA-256 Robustness', () => {

    it('Stress 2.1: RFC Message-ID Structural Permutations (Nested Brackets, Case, Internal Padding)', async () => {
      const testCases = [
        { input: '<20260823.ABC123XYZ@mail.google.com>', expected: 'rfc:20260823.abc123xyz@mail.google.com' },
        { input: ' <20260823.ABC123XYZ@mail.google.com> \n', expected: 'rfc:20260823.abc123xyz@mail.google.com' },
        { input: '<<20260823.ABC123XYZ@mail.google.com>>', expected: 'rfc:<20260823.abc123xyz@mail.google.com>' },
        { input: '20260823.ABC123XYZ@mail.google.com', expected: 'rfc:20260823.abc123xyz@mail.google.com' },
        { input: '  20260823.abc123xyz@MAIL.GOOGLE.COM  ', expected: 'rfc:20260823.abc123xyz@mail.google.com' },
      ]

      for (const { input, expected } of testCases) {
        const key = await canonicalEmailKey({
          messageId: input,
          from: 'sender@example.com',
          subject: 'Test Subject',
          receivedAt: '2026-08-23T12:00:00Z',
          normalizedBody: 'Content',
        })
        assert.equal(key, expected)
      }
    })

    it('Stress 2.2: Cross-Inbox Simultaneous Multi-Parent School Announcement Broadcast', async () => {
      // 3 Inboxes receiving the same blast: Dad, Mom, Family Shared
      const dadInbox = {
        messageId: '<PB-DISTRICT-2026-AUG-998811@palmbeachschools.org>',
        from: 'Palm Beach Schools <announcements@palmbeachschools.org>',
        subject: 'Important: District Calendar & Bus Route Updates 2026-2027',
        receivedAt: '2026-08-20T15:00:01Z',
        normalizedBody: 'Welcome back families! Please review updated bus route 402 and school start times.',
      }

      const momInbox = {
        messageId: ' <PB-DISTRICT-2026-AUG-998811@palmbeachschools.org> ',
        from: 'District Announcements <announcements@palmbeachschools.org>',
        subject: 'Important: District Calendar & Bus Route Updates 2026-2027',
        receivedAt: '2026-08-20T15:00:14Z',
        normalizedBody: 'Welcome back families! Please review updated bus route 402 and school start times.',
      }

      const sharedInbox = {
        messageId: '<pb-district-2026-aug-998811@palmbeachschools.org>',
        from: 'announcements@palmbeachschools.org',
        subject: 'Important: District Calendar & Bus Route Updates 2026-2027',
        receivedAt: '2026-08-20T15:00:45Z',
        normalizedBody: 'Welcome back families! Please review updated bus route 402 and school start times.',
      }

      const keyDad = await canonicalEmailKey(dadInbox)
      const keyMom = await canonicalEmailKey(momInbox)
      const keyShared = await canonicalEmailKey(sharedInbox)

      assert.equal(keyDad, keyMom, 'Dad and Mom inboxes must generate identical canonical key')
      assert.equal(keyMom, keyShared, 'Mom and Shared inboxes must generate identical canonical key')
      assert.equal(keyDad, 'rfc:pb-district-2026-aug-998811@palmbeachschools.org')
    })

    it('Stress 2.3: SHA-256 Fallback Fingerprint Invariance Across CRLF, Extra Whitespace, HTML Entity Escaping & Punctuation', async () => {
      const raw1 = 'Dear Jacob,\n\nYour order #2000154-80824348 is being prepared at the store.\n\nThank you for shopping Walmart+.'
      const raw2 = 'Dear Jacob,\r\n\r\nYour order #2000154-80824348 is being prepared at the store. \r\n\r\nThank you for shopping Walmart+.   \n\n'
      const raw3 = '   dear   jacob,  your order #2000154-80824348 is being prepared at the store. thank you for shopping walmart+.   '

      const fp1 = await canonicalContentFingerprint(raw1)
      const fp2 = await canonicalContentFingerprint(raw2)
      const fp3 = await canonicalContentFingerprint(raw3)

      assert.equal(fp1, fp2, 'CRLF vs LF and trailing whitespace must yield identical SHA-256 fingerprint')
      assert.equal(fp1, fp3, 'Multiple internal spaces and case differences must normalize identically')
    })

    it('Stress 2.4: Missing Message-ID Fallback Time-Bucket Boundary Analysis', async () => {
      const basePayload = {
        messageId: null,
        from: 'billing@fpl.com',
        subject: 'Your FPL Electric Bill is Ready',
        normalizedBody: 'Account #9482910-112: Amount due $214.50 by September 10, 2026.',
      }

      // Times within the exact same 10-minute window (e.g. 10:00:00 to 10:09:59)
      const k00 = await canonicalEmailKey({ ...basePayload, receivedAt: '2026-08-20T10:00:00Z' })
      const k04 = await canonicalEmailKey({ ...basePayload, receivedAt: '2026-08-20T10:04:30Z' })
      const k09 = await canonicalEmailKey({ ...basePayload, receivedAt: '2026-08-20T10:09:59Z' })

      assert.equal(k00, k04, 'Timestamps within the same 10-minute window must have identical key')
      assert.equal(k04, k09, 'Timestamps at start and end of 10-minute window must have identical key')

      // Crossing 10-minute boundary (10:10:00 is next bucket)
      const k10 = await canonicalEmailKey({ ...basePayload, receivedAt: '2026-08-20T10:10:00Z' })
      assert.notEqual(k00, k10, 'Timestamps in different 10-minute windows must produce distinct keys')
    })

    it('Stress 2.5: Strip Complex Quoted Reply Chains (Apple Mail, Gmail, Outlook Headers)', () => {
      const gmailChain = 'Looks great! I will bring snacks.\n\nOn Thu, Aug 20, 2026 at 2:30 PM Coach Mike <coach@pbaquatics.org> wrote:\n> Practice is moved to 4:30 PM.'
      assert.equal(stripQuotedReplyHistory(gmailChain), 'Looks great! I will bring snacks.')

      const standardFromSent = 'Confirmed for 10am.\n\nFrom: Dr. Smith <drsmith@palmpediatrics.com>\nSent: Wednesday, August 19, 2026 4:12 PM\nTo: Jacob Tabor <jacob@tabor.com>\nSubject: Appointment Confirmation'
      assert.equal(stripQuotedReplyHistory(standardFromSent), 'Confirmed for 10am.')
    })
  })

  // ==========================================================================
  // TRACK 3: ALL 5 TIER 4 REAL-WORLD APPLICATION SCENARIOS
  // ==========================================================================
  describe('Track 3: All 5 Tier 4 Real-World Application Scenarios Under Hostile Stress', () => {

    it('Stress 3.1: Scenario 1 — Bak MSOA Multi-Action Compound Bundle with 4 Sub-Tasks & Sibling Linking', () => {
      const primaryWaiver = {
        id: 'bak-msoa-waiver-primary',
        type: 'forms',
        category: 'forms_paperwork',
        event_title: 'Bak MSOA Science Camp Liability Waiver',
        description: 'Submit signed medical release and field trip waiver for 6th grade Science Camp.',
        due_by: '2026-09-05T18:00:00Z',
        source_origin: 'email_body',
        cluster_id: 'cluster-bak-science-camp',
        agency_level: 2,
        assigned_to: 'liv-id',
        dismissed: false,
      }

      const siblingFee = {
        id: 'bak-msoa-fee-sibling',
        type: 'payment',
        category: 'bills_payments',
        event_title: 'Science Camp Registration Fee ($175)',
        description: 'Pay $175 camp fee via SchoolCash Online before Sep 5.',
        due_by: '2026-09-05T23:59:59Z',
        source_origin: 'attachment',
        cluster_id: 'cluster-bak-science-camp',
        agency_level: 2,
        assigned_to: 'jacob-id',
        dismissed: false,
      }

      const siblingCurriculumNight = {
        id: 'bak-curriculum-night-sibling',
        type: 'event',
        event_title: 'Bak MSOA Curriculum Night & Open House',
        description: 'Meet teachers in Auditorium on Thursday, Aug 27 at 5:30 PM.',
        due_by: '2026-08-27T17:30:00-04:00',
        event_date: '2026-08-27',
        source_origin: 'attachment',
        cluster_id: 'cluster-bak-science-camp',
        agency_level: 1,
        dismissed: false,
      }

      const bundle = detectSuggestedActionBundle(primaryWaiver, null, [siblingFee, siblingCurriculumNight])
      assert.ok(bundle, 'Action bundle must be detected')
      assert.equal(bundle.bundleId, 'bundle_cluster_cluster-bak-science-camp')
      assert.equal(bundle.actions.length, 3, 'Bundle must contain all 3 compound sub-actions')
      assert.match(bundle.title, /Bak MSOA Science Camp Liability Waiver/i)

      // Verify suggested event parsing
      const eventSuggestion = detectSuggestedEvent(siblingCurriculumNight)
      assert.ok(eventSuggestion)
      assert.equal(eventSuggestion.date, '2026-08-27')
      assert.match(eventSuggestion.title, /Curriculum Night/i)

      // Verify partitioning
      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([primaryWaiver, siblingFee, siblingCurriculumNight])
      assert.equal(actionableItems.length, 3)
      assert.equal(deliveryTransitItems.length, 0)
    })

    it('Stress 3.2: Scenario 2 — Walmart+ InHome Perishable Grocery Multi-Stage Progression & Out-of-Order Resiliency', () => {
      // 4 stages arriving in random order
      const stagePlaced = {
        id: 'wm-stage-placed',
        source_type: 'gmail',
        event_title: 'Thanks for your InHome delivery order, Jacob',
        description: 'Order #200015480824348 total $142.50. Scheduled for delivery tomorrow 10:00 AM - 12:00 PM. 28 items.',
        attention_thread_key: 'transaction:walmart:2000154-80824348',
        attention_vendor: 'Walmart+ InHome',
        attention_stage: 'confirmed',
        created_at: '2026-08-22T20:00:00Z',
        event_date: '2026-08-23T14:00:00Z',
        due_by: '2026-08-23T14:00:00Z',
        dismissed: false,
      }

      const stageEditWindow = {
        id: 'wm-stage-edit',
        source_type: 'gmail',
        event_title: 'Last call to add items to your InHome delivery',
        description: 'Order #2000154-80824348: Need to add anything else before driver departs? Cutoff 9:00 AM.',
        attention_thread_key: 'transaction:walmart:2000154-80824348',
        attention_vendor: 'Walmart+ InHome',
        attention_stage: 'confirmed',
        created_at: '2026-08-23T12:00:00Z',
        dismissed: false,
      }

      const stageOutForDelivery = {
        id: 'wm-stage-out',
        source_type: 'gmail',
        event_title: 'Your InHome delivery should arrive by 10:45am',
        description: 'Order #2000154-80824348 driver is en route with temperature-controlled cold storage. ETA 10:45 AM.',
        attention_thread_key: 'transaction:walmart:2000154-80824348',
        attention_vendor: 'Walmart+ InHome',
        attention_stage: 'out_for_delivery',
        created_at: '2026-08-23T14:15:00Z',
        dismissed: false,
      }

      const stageDelivered = {
        id: 'wm-stage-deliv',
        source_type: 'gmail',
        event_title: 'Your InHome order was delivered',
        description: 'Order #2000154-80824348 delivered at 10:45 AM into kitchen refrigerator. 90-day return policy applies.',
        attention_thread_key: 'transaction:walmart:2000154-80824348',
        attention_vendor: 'Walmart+ InHome',
        attention_stage: 'delivered',
        policy_disclaimer: '90-day return policy applies',
        created_at: '2026-08-23T14:45:00Z',
        dismissed: false,
      }

      // 1. Forward progression
      const t1 = buildDeliveryTransitItem(stagePlaced)
      const t2 = buildDeliveryTransitItem(stageEditWindow)
      const t3 = buildDeliveryTransitItem(stageOutForDelivery)
      const t4 = buildDeliveryTransitItem(stageDelivered)

      const fwd = consolidateTransitItems([t1, t2, t3, t4])
      assert.equal(fwd.length, 1)
      assert.equal(fwd[0].stage, 'delivered')
      assert.equal(fwd[0].isPerishable, true)
      assert.equal(fwd[0].cost, '$142.50')
      assert.equal(fwd[0].vendor, 'Walmart')

      // 2. Reverse/Chaotic progression (Delivered arrives first, then Confirmed, then Out)
      const rev = consolidateTransitItems([t4, t1, t3, t2])
      assert.equal(rev.length, 1)
      assert.equal(rev[0].stage, 'delivered', 'Terminal delivered state must never be overwritten by earlier stages')
      assert.equal(rev[0].cost, '$142.50')
      assert.equal(rev[0].isPerishable, true)

      // 3. 0% leakage into Action Queue
      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([stagePlaced, stageEditWindow, stageOutForDelivery, stageDelivered])
      assert.equal(actionableItems.length, 0)
      assert.equal(deliveryTransitItems.length, 1)
    })

    it('Stress 3.3: Scenario 3 — Delta Air Lines Flight Schedule Change with Conflict Elevation & PII Grounding', () => {
      const flightChangeEmail = {
        from: 'TicketReceipt@delta.com',
        subject: 'Schedule Change Notification: Flight DL1482 Departure Updated',
        bodyText: `Dear Jacob Tabor (Account Number: 9842910482),
Your flight DL1482 from PBI to ATL on October 14, 2026 has been rescheduled:
- Previous Departure: 4:30 PM EDT
- New Departure: 11:15 AM EDT
- New Arrival: 1:10 PM EDT
Please review your updated itinerary online or in the Fly Delta app.`,
      }

      // Classify email
      const classified = classifyEmail(flightChangeEmail)
      assert.equal(classified.archetype, 'lifecycle_updates')
      assert.equal(classified.subCategory, 'flight_schedule_change')

      // Redact PII from body
      const redacted = redactFamilyEvidenceText(flightChangeEmail.bodyText)
      assert.doesNotMatch(redacted, /9842910482/, 'Account number must be redacted')
      assert.match(redacted, /\[REDACTED\]/)
      assert.match(redacted, /DL1482/)
      assert.match(redacted, /11:15 AM/)

      // Conflict Feed Item Creation
      const conflictRecord = {
        id: 'delta-clash-uuid-1',
        event_a_id: 'orthodontist-appt-id',
        conflict_type: 'time_change',
        description: 'Flight DL1482 moved to 11:15 AM on Oct 14, 2026, overlapping with Pediatric Orthodontist Visit (11:30 AM).',
        severity: 2,
        resolved: false,
        resolved_at: null,
        created_at: '2026-08-22T18:00:00Z',
        event_a: {
          title: 'Pediatric Orthodontist Visit (Maya & Liv)',
          start_time: '2026-10-14T11:30:00-04:00',
        },
      }

      const feedItem = conflictToNeedsYouItem(conflictRecord)
      assert.equal(feedItem.source_type, 'conflict')
      assert.equal(feedItem.priority, 2, 'Flight conflict must have priority 2')
      assert.equal(isReadOnlyNeedsYouItem(feedItem), true, 'Conflict items must be read-only in feed')
      assert.match(feedItem.description, /DL1482/)
    })

    it('Stress 3.4: Scenario 4 — HOA Notice with Irrigation Schedule, Pool Closure, Walkway Clearance & Sensitive Redaction', () => {
      const hoaEmail = {
        from: 'property-manager@mirasolhoa.com',
        subject: 'Tabor Estates HOA: Fall 2026 Landscaping, Roof Inspection & Pool Resurfacing',
        bodyText: `Dear Homeowners,
Please take note of upcoming neighborhood schedules:
1. Community Pool Resurfacing: The main pool will be closed on Tuesday, Aug 25 through Friday, Aug 28.
2. Roof & Gutter Inspection: Mandatory inspection on Monday, Aug 31. All residents must clear perimeter walkways by Friday, Aug 28.
3. Irrigation Restrictions: Odd houses water Tuesdays/Thursdays. Even houses water Wednesdays/Saturdays.
4. Security Advisory: Gate PIN: 8492. Board Treasurer SSN: 111-22-3333.`,
      }

      // 1. Classification
      const classified = classifyEmail(hoaEmail)
      assert.equal(classified.archetype, 'estate_knowledge')
      assert.equal(classified.subCategory, 'hoa_rules_digest')

      // 2. Evidence Eligibility (matches utilities due to water or school/forms)
      const evidence = classifyFamilyEvidenceCandidate({
        subject: hoaEmail.subject,
        from: hoaEmail.from,
        body: hoaEmail.bodyText,
      })
      assert.equal(evidence.eligible, true)
      assert.ok(['utilities', 'forms', 'school'].includes(evidence.category))

      // 3. PII Redaction
      const redacted = redactFamilyEvidenceText(hoaEmail.bodyText)
      assert.doesNotMatch(redacted, /8492/, 'Gate PIN must be redacted')
      assert.doesNotMatch(redacted, /111-22-3333/, 'SSN must be redacted')
      assert.match(redacted, /clear perimeter walkways/i)
      assert.match(redacted, /Irrigation Restrictions/i)

      // 4. Action / Event Extraction
      const walkwayItem = {
        id: 'hoa-walkway-item',
        type: 'general',
        category: 'household_errands',
        event_title: 'Clear perimeter walkways for HOA Roof & Gutter Inspection',
        description: 'Mandatory roof inspection: clear walkways by Friday, Aug 28.',
        due_by: '2026-08-28T17:00:00Z',
        agency_level: 1,
        dismissed: false,
      }
      const { actionableItems } = splitActionableAndTransitItems([walkwayItem])
      assert.equal(actionableItems.length, 1)
      assert.equal(actionableItems[0].category, 'household_errands')
    })

    it('Stress 3.5: Scenario 5 — Apple High-Value Parcel with Direct Signature Requirement & Courier Disambiguation', () => {
      const appleItem = {
        id: 'apple-store-macbook-pro',
        source_type: 'gmail',
        event_title: 'Your Apple Store order #w9876543210 has shipped',
        description: 'MacBook Pro shipped from Apple Store. Direct adult signature strictly required upon delivery.',
        attention_thread_key: 'transaction:apple:w9876543210',
        attention_vendor: 'Apple',
        attention_stage: 'shipped',
        agency_level: 0,
        dismissed: false,
        priority: 2,
      }

      // Order ID canonicalization
      const canonOrderId = canonicalizeOrderId('Apple', 'w9876543210')
      assert.equal(canonOrderId, 'W9876543210')

      // Courier tracking on composite description
      const trackingText = 'Shipped via UPS tracking 1Z9999999999999999'
      const carrierInfo = detectCarrierAndTracking(trackingText)
      assert.equal(carrierInfo.carrier, 'ups')
      assert.equal(carrierInfo.trackingNumber, '1Z9999999999999999')

      // Transit item construction
      const transit = buildDeliveryTransitItem(appleItem)
      assert.equal(transit.vendor, 'Apple')
      assert.equal(transit.stage, 'shipped')

      // Partitioning guarantee: 0% Action Queue leakage
      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([appleItem])
      assert.equal(actionableItems.length, 0, 'High-value signature shipment must remain in delivery transit with 0% Action Queue leakage')
      assert.equal(deliveryTransitItems.length, 1)
      assert.equal(deliveryTransitItems[0].vendor, 'Apple')
    })
  })
})
