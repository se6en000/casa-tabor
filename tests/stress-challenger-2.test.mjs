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
  formatFamilyKnowledgeContext,
} from '../supabase/functions/_shared/assistant-email-knowledge-read.mjs'

import {
  canonicalizeOrderId,
  canonicalizeTrackingNumber,
  detectCarrierAndTracking,
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

// ============================================================================
// CHALLENGER 2 ADVERSARIAL STRESS SUITE
// ============================================================================

describe('Challenger 2: Adversarial Stress Test Suite', () => {

  // --------------------------------------------------------------------------
  // SECTION 1: 0% ACTION QUEUE LEAKAGE INVARIANT STRESS HARNESS
  // --------------------------------------------------------------------------
  describe('Challenge 1: 0% Action Queue False Positive Leakage Invariant', () => {

    it('Stress 1.1: 50 Permutations of Passive Logistics with Deceptive Action/Claim Words', () => {
      const deceptivePhrases = [
        'Claims for missing or damaged items must be made within 3 days',
        'Return policy: return within 30 days of delivery for full refund',
        'Action required: choose where driver should place packages',
        'Please review your purchase receipt below',
        'Important notice: 90-day return window starts today',
        'Click here to track your package in real-time',
        'Survey: Please rate your delivery experience within 48 hours',
        'Warranty registration required within 14 days of receipt',
        'Customer satisfaction guarantee: contact us if items are missing',
        'Return shipping label enclosed in your parcel box',
      ]

      const vendors = ['Amazon', 'Walmart', 'Nike', 'Apple', 'Target', 'Jiffy.com', 'HelloFresh', 'Instacart', 'DoorDash', 'FedEx']

      const stressBatch = []
      for (let i = 0; i < 50; i++) {
        const vendor = vendors[i % vendors.length]
        const phrase = deceptivePhrases[i % deceptivePhrases.length]
        stressBatch.push({
          id: `stress-logistics-${i}`,
          event_title: `${vendor} order shipment update #${10000 + i}`,
          description: `Your package is moving. ${phrase}. Total order $${(20 + i * 3.5).toFixed(2)}.`,
          agency_level: 0,
          source_type: 'gmail',
          attention_vendor: vendor,
          attention_stage: 'shipped',
          dismissed: false,
          created_at: new Date(Date.now() - i * 3600000).toISOString(),
        })
      }

      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(stressBatch)
      assert.equal(
        actionableItems.length,
        0,
        `CRITICAL INVARIANT VIOLATION: Expected 0% leakage, but ${actionableItems.length} passive logistics leaked to Action Queue!`
      )
      assert.ok(deliveryTransitItems.length > 0, 'Consolidated delivery items must be non-empty')
    })

    it('Stress 1.2: Massive Mixed Ingestion Batch (200 Passive Logistics + 10 True Action Items)', () => {
      const batch = []

      // 200 Logistics items across diverse vendors and courier stages
      for (let i = 0; i < 200; i++) {
        batch.push({
          id: `bulk-logistics-${i}`,
          event_title: `Order confirmation #${2000000 + i}`,
          description: `Tracking info: UPS 1Z99999999${String(i).padStart(8, '0')}. Return window 30 days.`,
          agency_level: 0,
          source_type: 'gmail',
          attention_vendor: i % 2 === 0 ? 'Amazon' : 'Walmart',
          attention_stage: i % 3 === 0 ? 'shipped' : i % 3 === 1 ? 'out_for_delivery' : 'confirmed',
          dismissed: false,
        })
      }

      // 10 True Executive Action Items (agency_level 1 or 2)
      for (let j = 0; j < 10; j++) {
        batch.push({
          id: `bulk-action-${j}`,
          type: j % 2 === 0 ? 'forms' : 'payment',
          category: j % 2 === 0 ? 'forms_paperwork' : 'bills_payments',
          event_title: `Urgent Household Action #${j}`,
          description: `Mandatory waiver or utility invoice due #${j}.`,
          due_by: '2026-09-01T18:00:00Z',
          agency_level: 2,
          dismissed: false,
        })
      }

      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(batch)
      assert.equal(actionableItems.length, 10, 'Strictly the 10 true action items must enter Action Queue')
      assert.equal(
        deliveryTransitItems.length > 0,
        true,
        'Logistics radar must capture all 200 items in consolidated buckets'
      )
    })

    it('Stress 1.3: Perishable Grocery Items with Urgency Words Remain in Transit Radar', () => {
      const perishableUrgentItem = {
        id: 'perish-urgent-1',
        event_title: 'Walmart InHome Delivery: Refrigerate Immediately',
        description: 'Your InHome delivery driver dropped off cold items. Please unpack milk, yogurt, and seafood immediately to maintain cold chain.',
        agency_level: 0,
        source_type: 'gmail',
        attention_vendor: 'Walmart+ InHome',
        attention_stage: 'delivered',
        dismissed: false,
      }

      assert.equal(isPerishableDelivery(perishableUrgentItem), true)
      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([perishableUrgentItem])
      assert.equal(actionableItems.length, 0, 'Perishable logistics instructions must not leak to actionable tasks')
      assert.equal(deliveryTransitItems.length, 1)
      assert.equal(deliveryTransitItems[0].isPerishable, true)
    })

    it('Stress 1.4: Delivery Exception / Damaged Parcel vs Informational Claim Policy', () => {
      // 1. Passive email with claim policy disclaimer (NOT damaged)
      const policyEmail = {
        id: 'policy-only',
        event_title: 'Your Jiffy order was delivered',
        description: 'Order #2541442349. In case of missing or damaged items, claims must be filed within 3 days.',
        agency_level: 0,
        source_type: 'gmail',
        attention_vendor: 'Jiffy.com',
      }
      const stage1 = transactionStage(policyEmail)
      assert.equal(stage1, 'delivered', 'Policy disclaimer mention of damaged must NOT trigger problem stage')

      // 2. Actual damage exception
      const damagedEmail = {
        id: 'actual-damaged',
        event_title: 'Delivery Exception: Package Damaged in Transit',
        description: 'Courier reported item #2 was damaged in transit. Delivery failed.',
        agency_level: 0,
        source_type: 'gmail',
        attention_vendor: 'UPS',
      }
      const stage2 = transactionStage(damagedEmail)
      assert.equal(stage2, 'problem', 'Actual damage report must trigger problem stage')
    })
  })

  // --------------------------------------------------------------------------
  // SECTION 2: MULTI-RECIPIENT & CROSS-INBOX DEDUPLICATION STRESS HARNESS
  // --------------------------------------------------------------------------
  describe('Challenge 2: Multi-Recipient & Cross-Inbox Deduplication Stress Harness', () => {

    it('Stress 2.1: RFC Message-ID Normalization with Standard & Trimmable Angle Brackets', async () => {
      const rawIds = [
        '<20260823.ABC123XYZ@mail.google.com>',
        '  <20260823.ABC123XYZ@mail.google.com>  ',
        '20260823.ABC123XYZ@mail.google.com',
        '  20260823.ABC123XYZ@mail.google.com  \n',
      ]

      const keys = []
      for (const id of rawIds) {
        const key = await canonicalEmailKey({
          messageId: id,
          from: 'someone@domain.com',
          subject: 'Test Subject',
          receivedAt: '2026-08-23T12:00:00Z',
          normalizedBody: 'Body content',
        })
        keys.push(key)
      }

      // All keys must resolve to the identical normalized rfc key
      const expectedKey = 'rfc:20260823.abc123xyz@mail.google.com'
      for (const k of keys) {
        assert.equal(k.toLowerCase(), expectedKey)
      }
    })

    it('Stress 2.2: Cross-Inbox Multi-Recipient Delivery of School Broadcast', async () => {
      // Broadcast sent to Jacob, Courtney, and Family Inboxes simultaneously
      const jacobEmail = {
        messageId: '<PB-SCHOOLS-2026-AUG-9988@palmbeachschools.org>',
        from: 'Principal Davis <principal@bakmsoa.palmbeachschools.org>',
        subject: 'Bak MSOA Science Camp Waiver Due',
        receivedAt: '2026-08-20T15:00:00Z',
        normalizedBody: 'Parents, please sign and submit the camp waiver by Sep 5.',
      }

      const courtneyEmail = {
        messageId: ' <PB-SCHOOLS-2026-AUG-9988@palmbeachschools.org> ',
        from: 'principal@bakmsoa.palmbeachschools.org',
        subject: 'Bak MSOA Science Camp Waiver Due',
        receivedAt: '2026-08-20T15:00:15Z',
        normalizedBody: 'Parents, please sign and submit the camp waiver by Sep 5.',
      }

      const keyJacob = await canonicalEmailKey(jacobEmail)
      const keyCourtney = await canonicalEmailKey(courtneyEmail)

      assert.equal(keyJacob, keyCourtney, 'Cross-inbox deliveries with same RFC Message-ID must match 100%')
    })

    it('Stress 2.3: SHA-256 Fallback Fingerprint Robustness under Body Whitespace & Case Perturbations', async () => {
      const baseBody = 'Reminder: HOA Board meeting is on Thursday at 7:00 PM in the Clubhouse.'

      const fp1 = await canonicalContentFingerprint(baseBody)
      const fp2 = await canonicalContentFingerprint(`   ${baseBody}   \n\n\r\n`)
      const fp3 = await canonicalContentFingerprint(`REMINDER: HOA BOARD MEETING IS ON THURSDAY AT 7:00 PM IN THE CLUBHOUSE.`)

      assert.equal(fp1, fp2, 'Trailing whitespace, carriage returns, and newlines must normalize to identical fingerprint')
      assert.equal(fp1, fp3, 'Case-insensitive normalization must produce identical SHA-256 fingerprint')
    })

    it('Stress 2.4: 10-Minute Time-Bucket Windows in Missing Message-ID Fallback', async () => {
      const body = 'Your Amazon OTP verification code is 492819.'

      // Within same 10-minute window (14:02 and 14:08 -> bucket 14:00)
      const k1 = await canonicalEmailKey({
        messageId: null,
        from: 'account-update@amazon.com',
        subject: 'Your OTP Code',
        receivedAt: '2026-08-23T14:02:00Z',
        normalizedBody: body,
      })

      const k2 = await canonicalEmailKey({
        messageId: null,
        from: 'account-update@amazon.com',
        subject: 'Your OTP Code',
        receivedAt: '2026-08-23T14:08:00Z',
        normalizedBody: body,
      })

      // Different 10-minute window (14:15 -> bucket 14:10)
      const k3 = await canonicalEmailKey({
        messageId: null,
        from: 'account-update@amazon.com',
        subject: 'Your OTP Code',
        receivedAt: '2026-08-23T14:15:00Z',
        normalizedBody: body,
      })

      assert.equal(k1, k2, 'Identical content within 10-minute window must deduplicate to same key')
      assert.notEqual(k1, k3, 'Content in different 10-minute window must generate distinct keys for new events')
    })

    it('Stress 2.5: Strip Quoted Reply Chains from Standard On...Wrote Headers', () => {
      const emailWithAppleQuotes = `I have signed and attached the PDF form.

On Aug 20, 2026, at 3:15 PM, Principal Davis <principal@bakmsoa.org> wrote:
> Dear Parents, please sign the attached waiver.`

      assert.equal(stripQuotedReplyHistory(emailWithAppleQuotes), 'I have signed and attached the PDF form.')
    })
  })

  // --------------------------------------------------------------------------
  // SECTION 3: TIER 4 REAL-WORLD APPLICATION SCENARIOS STRESS HARNESS
  // --------------------------------------------------------------------------
  describe('Challenge 3: Tier 4 Real-World Application Scenarios Stress Harness', () => {

    it('Stress 3.1: Scenario 1 (Bak MSOA) — Compound Multi-Action Decomposition with Missing Dates and Multi-Child References', () => {
      const compoundEmail = {
        id: 'bak-compound-stress',
        type: 'forms',
        event_title: 'Bak MSOA 2026 Science Camp & Open House Package',
        description: 'Liv and Maya orientation packet: Science Camp waiver due Sep 5 ($175), Curriculum Night on Aug 27 at 5:30 PM, and PTSA fee $25.',
        source_origin: 'compound',
      }

      const detailedEmail = {
        ...compoundEmail,
        gmailContext: {
          subject: 'Bak MSOA 2026 Science Camp & Open House Package',
          from_email: 'principal@bakmsoa.palmbeachschools.org',
          received_at: '2026-08-20T15:00:00Z',
          email_body: 'Please complete all actions:\n1. Camp waiver by Sept 5\n2. Pay $175 camp fee\n3. Curriculum Night Aug 27 at 5:30 PM\n4. PTSA membership $25',
          attachments: [
            {
              filename: 'Bak_MSOA_Schedule.pdf',
              mimeType: 'application/pdf',
              size: 204800,
            },
          ],
          extracted_document_summary: 'Curriculum Night Schedule:\n- 6th Grade: 5:30 PM\n- 7th Grade: 6:45 PM\n- Waiver & fee deadline: Sept 5',
        },
      }

      const bundle = detectSuggestedActionBundle(compoundEmail, detailedEmail)
      assert.ok(bundle, 'Must extract suggested action bundle')
      assert.ok(bundle.actions.length >= 3, 'Must decompose into at least 3 discrete child actions')

      const dateParsed = parseDateSafe('2026-08-27T17:30:00-04:00')
      assert.ok(dateParsed)
      assert.equal(dateParsed.dateStr, '2026-08-27')
    })

    it('Stress 3.2: Scenario 2 (Walmart+ InHome) — Out-of-Order Lifecycle Stage Arrival & Consolidation', () => {
      // Ingest stages in reversed/chaotic arrival order
      const deliveredNotice = {
        id: 'wm-chaotic-delivered',
        source_type: 'gmail',
        event_title: 'Your Walmart InHome order was delivered',
        description: 'Order #200015480824348 delivered at 10:45 AM. 90-day return policy applies.',
        attention_thread_key: 'transaction:walmart:2000154-80824348',
        attention_vendor: 'Walmart+ InHome',
        attention_stage: 'delivered',
        policy_disclaimer: '90-day return policy applies',
        created_at: '2026-08-23T14:45:00Z',
        dismissed: false,
      }

      const outForDeliveryNotice = {
        id: 'wm-chaotic-out',
        source_type: 'gmail',
        event_title: 'Your InHome delivery should arrive by 10:45am',
        description: 'Order #2000154-80824348 driver en route. 27 items including fresh milk.',
        attention_thread_key: 'transaction:walmart:2000154-80824348',
        attention_vendor: 'Walmart+ InHome',
        attention_stage: 'out_for_delivery',
        created_at: '2026-08-23T14:15:00Z',
        dismissed: false,
      }

      const initialConfirmedNotice = {
        id: 'wm-chaotic-conf',
        source_type: 'gmail',
        event_title: 'Thanks for your InHome order',
        description: 'Order #200015480824348 ($142.50) confirmed.',
        attention_thread_key: 'transaction:walmart:2000154-80824348',
        attention_vendor: 'Walmart+ InHome',
        attention_stage: 'confirmed',
        created_at: '2026-08-22T20:00:00Z',
        dismissed: false,
      }

      // Ingest in reverse order (Delivered first, then Confirmed, then Out)
      const tDelivered = buildDeliveryTransitItem(deliveredNotice)
      const tConfirmed = buildDeliveryTransitItem(initialConfirmedNotice)
      const tOut = buildDeliveryTransitItem(outForDeliveryNotice)

      const consolidated = consolidateTransitItems([tDelivered, tConfirmed, tOut])
      assert.equal(consolidated.length, 1, 'All 3 events must consolidate into a single transit thread')
      assert.equal(consolidated[0].stage, 'delivered', 'Consolidated stage must preserve terminal delivered state')
      assert.equal(consolidated[0].cost, '$142.50', 'Cost must be retained from confirmed stage')
      assert.equal(consolidated[0].isPerishable, true, 'Perishable flag must be retained')
      assert.equal(consolidated[0].updateHistory.length, 3, 'Full update history must be preserved')
    })

    it('Stress 3.3: Scenario 3 (Delta Schedule Change) — Severity & Feed Routing Elevation', () => {
      const flightConflictRow = {
        id: 'delta-conflict-stress-1',
        event_a_id: 'ortho-visit-101',
        conflict_type: 'time_change',
        description: 'Flight DL1482 moved from 4:30 PM to 11:15 AM on Oct 14, 2026. Clashes with Pediatric Orthodontist (11:30 AM).',
        severity: 2,
        resolved: false,
        resolved_at: null,
        created_at: '2026-08-22T18:00:00Z',
        event_a: {
          title: 'Pediatric Orthodontist Visit',
          start_time: '2026-10-14T11:30:00-04:00',
        },
      }

      const feedItem = conflictToNeedsYouItem(flightConflictRow)
      assert.equal(feedItem.source_type, 'conflict')
      assert.equal(feedItem.priority, 2, 'Flight schedule conflict must elevate to Priority 2')
      assert.equal(isReadOnlyNeedsYouItem(feedItem), true)
      assert.match(feedItem.description, /DL1482/)
    })

    it('Stress 3.4: Scenario 4 (HOA Landscaping) — PII Redaction and Estate Knowledge Claim Indexing', () => {
      const rawHOANotice = `From: board@taborhoa.org
Subject: Annual Roof Inspection & Water Restrictions
Notice: All residents must clear perimeter walkways by Friday, Aug 28.
Irrigation Schedule: Odd numbered houses water Tuesdays/Thursdays only.
Board Contact: John Doe (Member ID: MEM-98421, SSN: 000-11-2222, Account PIN: 4829).`

      const redacted = redactFamilyEvidenceText(rawHOANotice)
      assert.doesNotMatch(redacted, /MEM-98421/)
      assert.doesNotMatch(redacted, /000-11-2222/)
      assert.doesNotMatch(redacted, /4829/)
      assert.match(redacted, /water Tuesdays\/Thursdays only/i)
      assert.match(redacted, /clear perimeter walkways/i)

      const evidence = classifyFamilyEvidenceCandidate({
        subject: 'Annual Roof Inspection & Water Restrictions',
        from: 'board@taborhoa.org',
        body: rawHOANotice,
      })
      assert.equal(evidence.eligible, true)
    })

    it('Stress 3.5: Scenario 5 (Apple Parcel) — Direct Signature Requirement Invariant & Courier Alias Precedence', () => {
      const appleMacBook = {
        id: 'apple-macbook-sig-req',
        source_type: 'gmail',
        event_title: 'Your Apple Store order #W9876543210 has shipped',
        description: 'MacBook Pro shipped from Apple Store. Direct adult signature strictly required upon delivery. Tracking UPS 1Z9999999999999999.',
        attention_thread_key: 'transaction:apple:w9876543210',
        attention_vendor: 'Apple',
        attention_stage: 'shipped',
        agency_level: 0,
        dismissed: false,
      }

      // Order ID canonicalization
      assert.equal(canonicalizeOrderId('Apple', 'w9876543210'), 'W9876543210')

      // Courier tracking detection
      const tracking = detectCarrierAndTracking(appleMacBook.description)
      assert.equal(tracking.carrier, 'ups')
      assert.equal(tracking.trackingNumber, '1Z9999999999999999')

      // Partitioning invariant
      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([appleMacBook])
      assert.equal(actionableItems.length, 0, 'Signature required shipments remain in Logistics Radar (0% Action Queue leakage)')
      assert.equal(deliveryTransitItems.length, 1)
      assert.equal(deliveryTransitItems[0].stage, 'shipped')
    })
  })
})
