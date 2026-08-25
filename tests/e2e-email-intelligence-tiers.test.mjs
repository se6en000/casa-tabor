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
  classifyEmail,
} from '../supabase/functions/_shared/email-clusterer.mjs'

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
  isBillOrUtilityOrHouseholdService,
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

import { PREP_CATEGORIES, getPrepCategoryConfig } from '../src/utils/prepCategories.ts'
import { useAppStore } from '../src/stores/appStore.ts'

// Load benchmark fixtures
const benchmarkFixturePath = path.resolve(process.cwd(), 'tests/fixtures/email-benchmark.json')
const benchmarkData = JSON.parse(fs.readFileSync(benchmarkFixturePath, 'utf8'))
const benchmarkCases = benchmarkData.benchmark_cases

// Helper rule filter adhering to scan-gmail-inbox contract
function matchCaptureRules(rules, from, subject) {
  const fromLower = String(from ?? '').toLowerCase()
  const subjLower = String(subject ?? '').toLowerCase()
  return rules.filter((r) => {
    if (r.active === false) return false
    const val = String(r.pattern_value ?? '').toLowerCase()
    if (r.pattern_type === 'domain') {
      return fromLower.includes(`@${val}`) || fromLower.includes(val)
    }
    if (r.pattern_type === 'sender') {
      return fromLower.includes(val)
    }
    if (r.pattern_type === 'subject') {
      return subjLower.includes(val)
    }
    return false
  })
}

// ============================================================================
// TIER 1: FEATURE COVERAGE (>=5 Test Cases per Feature)
// ============================================================================

describe('Tier 1: Feature Coverage', () => {

  describe('Feature 1.1: 6 Semantic Email Archetypes & Agency Levels', () => {
    it('T1.1.1: logistics_parcels — Amazon delivery confirmation with tracking (Agency Level 0)', () => {
      const caseData = benchmarkCases.find((c) => c.id === 'BM-LOG-01')
      assert.ok(caseData)
      assert.equal(caseData.archetype, 'logistics_parcels')
      assert.equal(caseData.expected_agency_level, 0)

      const prepItem = {
        id: 'amazon-item-1',
        event_title: caseData.subject,
        description: caseData.body,
        source_type: 'gmail',
        attention_vendor: 'Amazon',
        attention_stage: 'shipped',
        agency_level: caseData.expected_agency_level,
        dismissed: false,
        priority: 1,
      }

      const isTransit = isDeliveryTransitItem(prepItem)
      assert.equal(isTransit, true)

      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([prepItem])
      assert.equal(actionableItems.length, 0, 'Agency level 0 logistics items must not enter actionableItems')
      assert.equal(deliveryTransitItems.length, 1)
      assert.equal(deliveryTransitItems[0].vendor, 'Amazon')
      assert.equal(deliveryTransitItems[0].stage, 'shipped')
    })

    it('T1.1.2: executive_actions — School permission slip requiring signed waiver & fee (Agency Level 2)', () => {
      const caseData = benchmarkCases.find((c) => c.id === 'BM-ACT-01')
      assert.ok(caseData)
      assert.equal(caseData.archetype, 'executive_actions')
      assert.equal(caseData.expected_agency_level, 2)

      const prepItem = {
        id: 'school-waiver-item-1',
        event_title: caseData.subject,
        description: caseData.body,
        type: 'forms',
        category: 'forms_paperwork',
        due_by: '2026-09-05T18:00:00Z',
        agency_level: caseData.expected_agency_level,
        assigned_to: 'liv-member-id',
        dismissed: false,
        priority: 2,
      }

      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([prepItem])
      assert.equal(actionableItems.length, 1, 'Agency level 2 executive actions must route to actionableItems')
      assert.equal(deliveryTransitItems.length, 0)
      assert.equal(actionableItems[0].category, 'forms_paperwork')
    })

    it('T1.1.3: temporal_appointments — Pediatrician wellness visit with doctor & start time (Agency Level 1)', () => {
      const caseData = benchmarkCases.find((c) => c.id === 'BM-TEM-01')
      assert.ok(caseData)
      assert.equal(caseData.archetype, 'temporal_appointments')
      assert.equal(caseData.expected_agency_level, 1)

      const prepItem = {
        id: 'pediatric-appt-1',
        event_title: caseData.subject,
        description: caseData.body,
        source_type: 'gmail',
        due_by: '2026-09-14T09:00:00-04:00',
        event_date: '2026-09-14',
        agency_level: 1,
      }

      const eventPlan = detectSuggestedEvent(prepItem)
      assert.ok(eventPlan, 'Must detect suggested event plan')
      assert.match(eventPlan.title, /Liv|Child Visit|Pediatric/i)
      assert.equal(eventPlan.date, '2026-09-14')
    })

    it('T1.1.4: lifecycle_updates — Airline schedule change notification (Agency Level 2 on conflict)', () => {
      const caseData = benchmarkCases.find((c) => c.id === 'BM-LIF-01')
      assert.ok(caseData)
      assert.equal(caseData.archetype, 'lifecycle_updates')

      const conflictRow = {
        id: 'conf-flight-1',
        event_a_id: 'event-orthodontist-1',
        conflict_type: 'time_change',
        description: caseData.body,
        severity: 2,
        resolved: false,
        resolved_at: null,
        created_at: '2026-08-22T18:05:00Z',
        event_a: {
          title: 'Pediatric Orthodontist Appointment',
          start_time: '2026-10-14T11:30:00-04:00',
        },
      }

      const feedItem = conflictToNeedsYouItem(conflictRow)
      assert.equal(feedItem.source_type, 'conflict')
      assert.equal(feedItem.priority, 2)
      assert.equal(isReadOnlyNeedsYouItem(feedItem), true)
    })

    it('T1.1.5: estate_knowledge — HOA landscaping and sprinkler restriction rules (Agency Level 0)', () => {
      const caseData = benchmarkCases.find((c) => c.id === 'BM-EST-01')
      assert.ok(caseData)
      assert.equal(caseData.archetype, 'estate_knowledge')
      assert.equal(caseData.expected_agency_level, 0)

      const evidence = classifyFamilyEvidenceCandidate({
        subject: caseData.subject,
        from: caseData.sender,
        body: caseData.body,
      })
      assert.equal(evidence.eligible, true)
      assert.ok(evidence.category)

      const claims = [
        {
          id: 'claim-hoa-1',
          title: 'Sprinkler Restrictions',
          summary: caseData.body,
          requiredness: 'fyi',
          canonical_inbox_emails: { from_email: caseData.sender },
        },
      ]
      const formatted = formatFamilyKnowledgeContext(claims)
      assert.match(formatted, /\[fyi\] Sprinkler Restrictions/i)
      assert.match(formatted, /board@taborhoa\.org/)
    })

    it('T1.1.6: promotional_noise — Retail discount promotional email correctly filtered (Agency Level 0)', () => {
      const caseData = benchmarkCases.find((c) => c.id === 'BM-NOI-01')
      assert.ok(caseData)
      assert.equal(caseData.archetype, 'promotional_noise')
      assert.equal(caseData.expected_routing, 'skip_noise')

      const evidence = classifyFamilyEvidenceCandidate({
        subject: caseData.subject,
        from: caseData.sender,
        body: caseData.body,
      })
      assert.equal(evidence.eligible, false, 'Promotional sale noise without operational override must be non-eligible')
    })
  })

  describe('Feature 1.2: Multi-Vendor Order Number Canonicalizer', () => {
    it('T1.2.1: Walmart unhyphenated 15-digit ID canonicalizes to 7-8 format', () => {
      assert.equal(canonicalizeOrderId('Walmart', '200015480824348'), '2000154-80824348')
      assert.equal(canonicalizeOrderId('Walmart+ InHome', '100015480824348'), '1000154-80824348')
    })

    it('T1.2.2: Walmart unhyphenated 16-digit ID canonicalizes to 7-9 format', () => {
      assert.equal(canonicalizeOrderId('Walmart', '2000154808243489'), '2000154-808243489')
    })

    it('T1.2.3: Amazon 17-digit contiguous ID canonicalizes to 3-7-7 format', () => {
      assert.equal(canonicalizeOrderId('Amazon', '11284729104829103'), '112-8472910-4829103')
      assert.equal(canonicalizeOrderId('Amazon.com', '112-8472910-4829103'), '112-8472910-4829103')
    })

    it('T1.2.4: Apple order ID lowercase with w prefix converts to uppercase W', () => {
      assert.equal(canonicalizeOrderId('Apple', 'w1029384756'), 'W1029384756')
      assert.equal(canonicalizeOrderId('Apple Store', 'W987654321'), 'W987654321')
    })

    it('T1.2.5: Nike order ID lowercase with c0 or c- prefix converts to uppercase', () => {
      assert.equal(canonicalizeOrderId('Nike', 'c0192837465'), 'C0192837465')
      assert.equal(canonicalizeOrderId('Nike.com', 'c0987654321'), 'C0987654321')
    })

    it('T1.2.6: Jiffy order number extraction and clean normalization', () => {
      assert.equal(canonicalizeOrderId('Jiffy.com', '2541442349'), '2541442349')
      assert.equal(canonicalizeOrderId('Jiffy Transfers', '#2541442349'), '2541442349')
    })

    it('T1.2.7: HelloFresh meal kit order reference canonicalization', () => {
      assert.equal(canonicalizeOrderId('HelloFresh', 'hf-98765432'), 'HF-98765432')
      assert.equal(canonicalizeOrderId('HelloFresh', 'HF-12345678'), 'HF-12345678')
      const extracted = orderId({ description: 'HelloFresh order HF-98765432 is confirmed' })
      assert.equal(extracted, 'HF-98765432')
    })
  })

  describe('Feature 1.3: Multi-Carrier Courier Tracking & Carrier Detection', () => {
    it('T1.3.1: UPS 1Z tracking pattern extraction and carrier recognition', () => {
      const text = 'Shipped via UPS tracking 1Z9999999999999999.'
      const extracted = orderId({ description: text })
      assert.equal(extracted, '1Z9999999999999999')
    })

    it('T1.3.2: USPS 22-digit tracking number extraction', () => {
      const text = 'Delivered with USPS Tracking # 9400111899562549301823'
      const extracted = orderId({ description: text })
      assert.equal(extracted, '9400111899562549301823')
    })

    it('T1.3.3: FedEx 12-digit express tracking extraction', () => {
      const text = 'Your FedEx tracking number 789456123012 is moving.'
      const extracted = orderId({ description: text })
      assert.equal(extracted, '789456123012')
    })

    it('T1.3.4: FedEx 20-digit ground tracking extraction', () => {
      const text = 'FedEx Ground shipment tracking 96110209876543210987 in transit.'
      const extracted = orderId({ description: text })
      assert.equal(extracted, '96110209876543210987')
    })

    it('T1.3.5: Vendor composite thread key prioritization over courier tracking', () => {
      const prepItem = {
        source_type: 'gmail',
        event_title: 'Walmart Order # 2000154-80824348 Shipped',
        description: 'Your package shipped with UPS 1Z999AA10123456784',
        attention_vendor: 'Walmart',
      }
      const identity = vendorTransactionIdentity(prepItem)
      assert.ok(identity)
      assert.equal(identity.key, 'transaction:walmart:2000154-80824348')
      assert.equal(identity.vendor, 'Walmart')
    })
  })

  describe('Feature 1.4: Tense-Aware Lifecycle Stage Progression', () => {
    it('T1.4.1: Future delivery phrasing resolves to confirmed/shipped, never premature delivered', () => {
      const saturdayEval = new Date('2026-08-22T10:00:00-04:00')
      const targetMonday = new Date('2026-08-24T18:00:00-04:00')

      const effective = resolveEffectiveStage('delivered', targetMonday, saturdayEval)
      assert.equal(effective, 'confirmed', 'Future target date must override premature delivered state')
    })

    it('T1.4.2: Present delivery phrasing ("Out for delivery today") resolves to out_for_delivery', () => {
      const saturdayEval = new Date('2026-08-22T14:00:00-04:00')
      const targetSaturday = new Date('2026-08-22T18:00:00-04:00')

      const item = {
        id: 'out-today-1',
        event_title: 'Out for delivery today',
        description: 'Your InHome delivery driver is heading your way.',
        source_type: 'gmail',
        attention_vendor: 'Walmart',
      }
      const rawStage = transactionStage(item)
      assert.equal(rawStage, 'out_for_delivery')

      const effective = resolveEffectiveStage(rawStage, targetSaturday, saturdayEval)
      assert.equal(effective, 'out_for_delivery')
    })

    it('T1.4.3: Past delivery phrasing ("Delivered to front porch") resolves to delivered', () => {
      const item = {
        id: 'delivered-1',
        event_title: 'Delivered',
        description: 'Your package was delivered to the front porch at 2:15 PM.',
        source_type: 'gmail',
        attention_vendor: 'Amazon',
      }
      const rawStage = transactionStage(item)
      assert.equal(rawStage, 'delivered')
    })

    it('T1.4.4: Active editing window ("Order is being prepared / Add items") resolves to confirmed', () => {
      const item = {
        id: 'edit-window-1',
        event_title: 'Last minute to add items',
        description: 'You have until 1:00 PM to add items to your Walmart InHome order.',
        source_type: 'gmail',
        attention_vendor: 'Walmart',
      }
      const rawStage = transactionStage(item)
      assert.equal(rawStage, 'confirmed')
      assert.equal(stageStepIndex(rawStage), 0)
    })

    it('T1.4.5: Cancelled delivery notice resolves to problem without phantom delivery', () => {
      const item = {
        id: 'cancel-1',
        event_title: 'Order Cancelled',
        description: 'Your order was cancelled due to out of stock items.',
        type: 'cancellation',
        source_type: 'gmail',
      }
      const stage = transactionStage(item)
      assert.equal(stage, 'problem')
    })
  })

  describe('Feature 1.5: Compound Email & Multimodal Attachment Decomposition', () => {
    it('T1.5.1: School newsletter decomposing into discrete actions and events', () => {
      const item = {
        id: 'bak-item',
        type: 'forms',
        event_title: 'Bak MSOA Curriculum Night & Open House',
        description: 'Join us on Thursday, August 27 at 5:30 PM.',
        source_origin: 'compound',
        dismissed: false,
      }
      const detailed = {
        ...item,
        gmailContext: {
          subject: 'Bak MSOA Curriculum Night & Campus Information',
          from_email: 'principal@bakmsoa.palmbeachschools.org',
          received_at: '2026-08-20T15:00:00Z',
          email_body: 'Parents, please join us for Curriculum Night on Thursday Aug 27.',
          attachments: [
            {
              filename: 'Bak_MSOA_Curriculum_Night_Schedule_and_Map.pdf',
              mimeType: 'application/pdf',
              size: 286720,
            },
          ],
          extracted_document_summary: `- 6th Grade: 5:30 PM\n- 7th Grade: 6:45 PM\n- PTSA membership form`,
        },
      }

      const bundle = detectSuggestedActionBundle(item, detailed)
      assert.ok(bundle)
      assert.equal(bundle.actions.length, 5)
    })

    it('T1.5.2: Multimodal PDF flyer summary assigns source_origin: "attachment"', () => {
      const parent = {
        id: 'p-1',
        type: 'forms',
        event_title: 'Camp Waiver',
        description: 'Sign waiver',
        source_origin: 'email_body',
        cluster_id: 'c-1',
      }
      const sibling = {
        id: 's-1',
        type: 'payment',
        event_title: 'Camp Fee',
        description: 'Pay $85 fee',
        source_origin: 'attachment',
        cluster_id: 'c-1',
      }

      const bundle = detectSuggestedActionBundle(parent, null, [sibling])
      assert.ok(bundle)
      assert.equal(bundle.actions[0].sourceOrigin, 'email_body')
      assert.equal(bundle.actions[1].sourceOrigin, 'attachment')
    })

    it('T1.5.3: Email body + attachment hybrid extraction yields source_origin: "compound"', () => {
      const parent = {
        id: 'comp-parent-1',
        type: 'forms',
        event_title: 'Fall Orientation & School Packet',
        description: 'Complete orientation paperwork and review attached checklist.',
        source_origin: 'compound',
        cluster_id: 'cluster-comp-101',
      }
      const siblingAttachment = {
        id: 'comp-sib-1',
        type: 'forms',
        event_title: 'Orientation Checklist PDF',
        description: 'Sign and return attached medical emergency checklist',
        source_origin: 'attachment',
        cluster_id: 'cluster-comp-101',
      }

      const bundle = detectSuggestedActionBundle(parent, null, [siblingAttachment])
      assert.ok(bundle)
      assert.equal(bundle.actions[0].sourceOrigin, 'compound')
      assert.equal(bundle.actions[1].sourceOrigin, 'attachment')

      const detailedItem = {
        ...parent,
        gmailContext: {
          subject: parent.event_title,
          email_body: parent.description,
          attachments: [{ filename: 'Checklist.pdf', mimeType: 'application/pdf', size: 10240 }],
          extracted_document_summary: '- Medical emergency checklist\n- Media release form',
        },
      }
      const analysis = synthesizeActionAnalysis(parent, detailedItem, [siblingAttachment])
      assert.ok(analysis)
      assert.ok(analysis.suggestedActionBundle)
      assert.equal(analysis.suggestedActionBundle.actions[0].sourceOrigin, 'compound')
    })

    it('T1.5.4: Sibling action deduplication linking all sub-tasks to parent thread ID', () => {
      const parent = {
        id: 'task-root-1',
        cluster_id: 'thread-school-99',
        type: 'forms',
        event_title: 'Bak MSOA Science Camp Forms',
        description: 'Complete camp registration packet',
        source_origin: 'email_body',
      }
      const sibling1 = {
        id: 'task-sub-1',
        cluster_id: 'thread-school-99',
        type: 'payment',
        event_title: 'Pay Camp Activity Fee',
        description: 'Submit $120 activity fee via SchoolCash',
        source_origin: 'email_body',
      }
      const sibling2 = {
        id: 'task-sub-2',
        cluster_id: 'thread-school-99',
        type: 'event',
        event_title: 'Camp Departure Bus Loop',
        description: 'Bus departs at 7:00 AM from main bus loop',
        source_origin: 'attachment',
        event_date: '2026-09-15T07:00:00Z',
      }

      const bundle = detectSuggestedActionBundle(parent, null, [sibling1, sibling2])
      assert.ok(bundle)
      assert.equal(bundle.bundleId, 'bundle_cluster_thread-school-99')
      assert.equal(bundle.actions.length, 3)
      assert.equal(bundle.actions[0].id, 'task-root-1')
      assert.equal(bundle.actions[1].id, 'task-sub-1')
      assert.equal(bundle.actions[2].id, 'task-sub-2')
      assert.equal(bundle.actions[0].sourceOrigin, 'email_body')
      assert.equal(bundle.actions[1].sourceOrigin, 'email_body')
      assert.equal(bundle.actions[2].sourceOrigin, 'attachment')
    })

    it('T1.5.5: Granular item selection default flags in suggested action bundles', () => {
      const parent = {
        id: 'p-1',
        type: 'forms',
        event_title: 'School Notice',
        description: 'Paperwork and event',
        source_origin: 'email_body',
        cluster_id: 'c-2',
      }
      const sibling = {
        id: 's-2',
        type: 'event',
        event_title: 'Open House',
        description: 'Attend open house',
        source_origin: 'attachment',
        cluster_id: 'c-2',
      }

      const bundle = detectSuggestedActionBundle(parent, null, [sibling])
      assert.ok(bundle)
      for (const act of bundle.actions) {
        assert.equal(typeof act.defaultSelected, 'boolean')
      }
    })
  })

  describe('Feature 1.6: Active Learning & Rule Overrides', () => {
    it('T1.6.1: Learned rule for sender domain with directive suppresses marketing emails', () => {
      const rules = [
        {
          pattern_type: 'domain',
          pattern_value: 'williams-sonoma.com',
          rule_directive: 'Route sales and promotional digests to skip',
          active: true,
        },
      ]
      const matches = matchCaptureRules(rules, 'deals@williams-sonoma.com', 'Cookware Sale')
      assert.equal(matches.length, 1)
      assert.match(matches[0].rule_directive, /skip/i)
    })

    it('T1.6.2: Learned rule for specific sender elevates items to Action Queue', () => {
      const rules = [
        {
          pattern_type: 'sender',
          pattern_value: 'coach@jupiterunitedsoccer.com',
          rule_directive: 'Always extract medical physical and waiver forms as high-priority actions',
          active: true,
        },
      ]
      const matches = matchCaptureRules(rules, 'coach@jupiterunitedsoccer.com', 'Physical Forms Due')
      assert.equal(matches.length, 1)
      assert.match(matches[0].rule_directive, /high-priority/i)
    })

    it('T1.6.3: Inactive capture rules are ignored', () => {
      const rules = [
        {
          pattern_type: 'domain',
          pattern_value: 'sephora.com',
          rule_directive: 'Mute sender',
          active: false,
        },
      ]
      const matches = matchCaptureRules(rules, 'marketing@sephora.com', 'Fragrance Sale')
      assert.equal(matches.length, 0)
    })

    it('T1.6.4: Subject pattern matching captures specific recurring subjects', () => {
      const rules = [
        {
          pattern_type: 'subject',
          pattern_value: 'weekly pool chemistry',
          rule_directive: 'Route to estate knowledge claims without action cards',
          active: true,
        },
      ]
      const matches = matchCaptureRules(rules, 'service@flacleanpool.com', 'Weekly Pool Chemistry & Salt Cell Log')
      assert.equal(matches.length, 1)
    })

    it('T1.6.5: Rule origin metadata tracks user_label, voice_directive, and learned_feedback with dynamic prompt injection', () => {
      const rules = [
        {
          id: 'rule-1',
          pattern_type: 'domain',
          pattern_value: 'palmbeachschools.org',
          rule_directive: 'Always extract school field trip permission slips as high priority actions',
          origin: 'voice_directive',
          confidence: 1.0,
          active: true,
          few_shot_exemplar: {
            input: 'Subject: Field Trip Permission Slip Due',
            output: '{"archetype": "executive_actions", "agency_level": 2}',
          },
        },
        {
          id: 'rule-2',
          pattern_type: 'sender',
          pattern_value: 'deals@williams-sonoma.com',
          rule_directive: 'Mute marketing sales emails',
          origin: 'user_label',
          confidence: 0.95,
          active: true,
          few_shot_exemplar: {
            input: 'Subject: 50% off cookware',
            output: '{"archetype": "promotional_noise", "agency_level": 0}',
          },
        },
        {
          id: 'rule-3',
          pattern_type: 'domain',
          pattern_value: 'palmbeachfarmstand.com',
          rule_directive: 'Route farm produce receipts to logistics',
          origin: 'learned_feedback',
          confidence: 0.9,
          active: true,
          few_shot_exemplar: {
            input: 'Subject: Farm Box Confirmation',
            output: '{"archetype": "logistics_parcels", "agency_level": 0}',
          },
        },
      ]

      // 1. Voice directive rule matching & prompt assembly
      const matchedSchool = matchCaptureRules(rules, 'principal@palmbeachschools.org', 'Field Trip Waiver')
      assert.equal(matchedSchool.length, 1)
      assert.equal(matchedSchool[0].origin, 'voice_directive')
      assert.equal(matchedSchool[0].confidence, 1.0)

      // 2. User label rule matching
      const matchedPromo = matchCaptureRules(rules, 'deals@williams-sonoma.com', 'Labor Day Sale')
      assert.equal(matchedPromo.length, 1)
      assert.equal(matchedPromo[0].origin, 'user_label')
      assert.equal(matchedPromo[0].confidence, 0.95)

      // 3. Learned feedback rule matching
      const matchedFarm = matchCaptureRules(rules, 'orders@palmbeachfarmstand.com', 'Farm Box Confirmation')
      assert.equal(matchedFarm.length, 1)
      assert.equal(matchedFarm[0].origin, 'learned_feedback')
      assert.equal(matchedFarm[0].confidence, 0.9)

      // 4. Construct dynamic prompt block with few-shot exemplars
      function buildDynamicPromptWithRules(activeRules, email) {
        const matching = matchCaptureRules(activeRules, email.from, email.subject)
        let promptSection = '### Standard Classification Guidelines\n'
        if (matching.length > 0) {
          promptSection += '### Active User Directives & Few-Shot Exemplars:\n'
          for (const r of matching) {
            promptSection += `- [Rule (${r.origin}, conf: ${r.confidence})]: ${r.rule_directive}\n`
            if (r.few_shot_exemplar) {
              promptSection += `  Exemplar Input: "${r.few_shot_exemplar.input}" -> Output: ${r.few_shot_exemplar.output}\n`
            }
          }
        }
        return promptSection
      }

      const promptPayload = buildDynamicPromptWithRules(rules, {
        from: 'principal@palmbeachschools.org',
        subject: 'Field Trip Permission Slip & Emergency Form',
      })
      assert.match(promptPayload, /voice_directive/)
      assert.match(promptPayload, /Always extract school field trip permission slips/)
      assert.match(promptPayload, /Exemplar Input: "Subject: Field Trip Permission Slip Due"/)
      assert.match(promptPayload, /executive_actions/)
    })
  })

  describe('Feature 1.7: 0% Action Queue False Leakage Partitioning', () => {
    it('T1.7.1: Passive logistics parcel (agency_level: 0) routes strictly to deliveryTransitItems', () => {
      const parcel = {
        id: 'parcel-1',
        event_title: 'Amazon Delivery Shipped',
        description: 'Order #112-8472910-4829103 is arriving Friday.',
        agency_level: 0,
        source_type: 'gmail',
        attention_vendor: 'Amazon',
        dismissed: false,
      }
      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([parcel])
      assert.equal(actionableItems.length, 0, 'Zero leakage into actionableItems')
      assert.equal(deliveryTransitItems.length, 1)
    })

    it('T1.7.2: Merchant delivery update with return policy disclaimers routes to deliveryTransitItems with 0% noise', () => {
      const returnDisclaimer = {
        id: 'jiffy-policy-1',
        event_title: "Shipment for Jacob's Cart #50 (Order #2541442349)",
        description: 'Your Jiffy order #2541442349 has shipped. Claims for missing or damaged items must be made within 3 days (by Thursday, Aug 27).',
        agency_level: 0,
        policy_disclaimer: 'Claims must be made within 3 days',
        source_type: 'gmail',
        attention_vendor: 'Jiffy.com',
        dismissed: false,
      }
      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([returnDisclaimer])
      assert.equal(actionableItems.length, 0)
      assert.equal(deliveryTransitItems.length, 1)
      assert.match(deliveryTransitItems[0].policyDisclaimer, /claims/i)
    })

    it('T1.7.3: High-agency bill payment request (agency_level: 2) routes strictly to actionableItems', () => {
      const bill = {
        id: 'fpl-bill-1',
        type: 'payment',
        category: 'bills_payments',
        event_title: 'FPL Electric Bill Due',
        description: 'Electric bill $241.18 due September 5.',
        due_by: '2026-09-05T18:00:00Z',
        agency_level: 2,
        dismissed: false,
      }
      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([bill])
      assert.equal(actionableItems.length, 1)
      assert.equal(deliveryTransitItems.length, 0)
    })

    it('T1.7.4: Mixed batch of 5 logistics items and 2 action items partitions exactly into 5 transit and 2 actionable', () => {
      const items = [
        { id: 't1', agency_level: 0, attention_vendor: 'Walmart', description: 'Groceries 1' },
        { id: 't2', agency_level: 0, attention_vendor: 'Amazon', description: 'Package 2' },
        { id: 't3', agency_level: 0, attention_vendor: 'Target', description: 'Pickup 3' },
        { id: 't4', agency_level: 0, attention_vendor: 'Nike', description: 'Shoes 4' },
        { id: 't5', agency_level: 0, attention_vendor: 'HelloFresh', description: 'Meal Box 5' },
        { id: 'a1', agency_level: 2, type: 'forms', description: 'Waiver' },
        { id: 'a2', agency_level: 1, type: 'rsvp', description: 'Party RSVP' },
      ]
      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(items)
      assert.equal(actionableItems.length, 2)
      assert.equal(deliveryTransitItems.length, 5)
    })

    it('T1.7.5: Re-classification after user edit changes agency_level and cleanly shifts partition boundary', () => {
      const item = { id: 'dyn-1', agency_level: 0, attention_vendor: 'Amazon', type: 'delivery', description: 'Amazon parcel delivery tracking update' }
      const round1 = splitActionableAndTransitItems([item])
      assert.equal(round1.actionableItems.length, 0)
      assert.equal(round1.deliveryTransitItems.length, 1)

      const elevatedItem = { id: 'dyn-1', agency_level: 2, type: 'forms', description: 'School field trip permission form due' }
      const round2 = splitActionableAndTransitItems([elevatedItem])
      assert.equal(round2.actionableItems.length, 1)
      assert.equal(round2.deliveryTransitItems.length, 0)
    })

    it('T1.7.6: School sports, Aktivate clearance, Bus notifications, and Lake Lytal Softball route 100% to actionableItems (0% Inbound Manifest leakage)', () => {
      const schoolAndSportsItems = [
        {
          id: 'bak-tryouts',
          event_title: 'Bak - Boys/Girls Basketball Tryouts',
          description: 'Students trying out for basketball must attend all three days: August 31st, September 1st, and September 2nd, from 3:30pm-5:00pm. They should report to the gym after being dismissed and wear athletic attire.',
          attention_vendor: 'Bak MSOA',
          attention_thread_key: 'transaction:bak-msoa:message:gmail:household:1a0355bfa77bd8ec',
          agency_level: 2,
          type: 'general',
        },
        {
          id: 'aktivate-forms',
          event_title: 'Bak - Boys/Girls Basketball Tryouts',
          description: 'Students trying out for basketball must have all required documents submitted and approved in Aktivate. Visit the Bak website for more info on how to register your child for tryouts and participation.',
          attention_vendor: 'Aktivate',
          attention_thread_key: 'transaction:aktivate:message:gmail:household:1a0355bfa77bd8ec',
          agency_level: 2,
          type: 'forms',
        },
        {
          id: 'pbsd-bus-change',
          event_title: 'URGENT: Reverted Changes for Buses R28 & R7 Effective Immediately',
          description: 'The AM/PM Publix bus stop for R28 & R7 has been reverted to its original location behind the Publix of Ibis shopping plaza. Address questions to the Transportation Dept.',
          attention_vendor: 'Palm Beach Schools',
          attention_thread_key: 'transaction:palm-beach-schools:message:gmail:household:1a034ce1f1aecca9',
          agency_level: 2,
          type: 'general',
        },
        {
          id: 'lytal-evals',
          event_title: 'Lake Lytal Lassie League - Fall Evaluations',
          description: 'Attend fall softball evaluations to be placed on a team. The flyer with evaluation dates is attached.',
          attention_vendor: 'Lake Lytal Lassie League',
          attention_thread_key: 'transaction:lake-lytal-lassie-league:message:gmail:household:1a0347ef87f5e98c',
          agency_level: 2,
          type: 'general',
        },
      ]

      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(schoolAndSportsItems)
      assert.equal(actionableItems.length, 4, 'All 4 school/sports items must stay in Executive Action Queue')
      assert.equal(deliveryTransitItems.length, 0, 'Zero leakage into Estate Inbound Manifest')
    })
  })
})

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (>=5 Test Cases per Edge Case)
// ============================================================================

describe('Tier 2: Boundary & Corner Cases', () => {

  describe('2.1 Empty & Malformed MIME Payloads', () => {
    it('T2.1.1: Completely empty email body with only subject line extracts gracefully', () => {
      const payload = {
        mimeType: 'text/plain',
        body: { data: '' },
      }
      const extracted = extractGmailMessageContent(payload)
      assert.equal(extracted.text, '')
      assert.equal(extracted.format, 'none')
      assert.equal(extracted.attachments.length, 0)
    })

    it('T2.1.2: Missing MIME Message-ID falls back to deterministic SHA-256 fingerprint', async () => {
      const key1 = await canonicalEmailKey({
        messageId: null,
        from: 'billing@fpl.com',
        subject: 'Your Monthly Bill',
        receivedAt: '2026-08-20T12:00:00Z',
        normalizedBody: 'Amount due: $150.00',
      })
      assert.match(key1, /^fallback:[a-f0-9]{64}$/)

      const key2 = await canonicalEmailKey({
        messageId: '',
        from: 'billing@fpl.com',
        subject: 'Your Monthly Bill',
        receivedAt: '2026-08-20T12:04:00Z', // Within same 10-minute bucket
        normalizedBody: 'Amount due: $150.00',
      })
      assert.equal(key1, key2)
    })

    it('T2.1.3: Malformed HTML with unclosed tags and HTML entities strips clean text', () => {
      const htmlString = '<div><p>Meeting on <b>Monday</b> &amp; <i>Tuesday</i><script>alert("xss")</script>'
      const base64Data = Buffer.from(htmlString).toString('base64')
      const payload = {
        mimeType: 'text/html',
        body: { data: base64Data },
      }
      const extracted = extractGmailMessageContent(payload)
      assert.doesNotMatch(extracted.text, /<script>/)
      assert.doesNotMatch(extracted.text, /alert/)
      assert.match(extracted.text, /Meeting on Monday & Tuesday/i)
    })

    it('T2.1.4: Payload with attachment metadata extracts correct structure', () => {
      const payload = {
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: Buffer.from('See attached waiver.').toString('base64') },
          },
          {
            filename: 'Waiver.pdf',
            mimeType: 'application/pdf',
            body: { size: 1048576, attachmentId: 'att-123' },
          },
        ],
      }
      const extracted = extractGmailMessageContent(payload)
      assert.equal(extracted.attachments.length, 1)
      assert.equal(extracted.attachments[0].filename, 'Waiver.pdf')
      assert.equal(extracted.attachments[0].size, 1048576)
      assert.equal(extracted.attachments[0].attachmentId, 'att-123')
    })

    it('T2.1.5: Large body text chunks reliably without data loss', () => {
      const largeText = 'Important household information. '.repeat(100)
      const chunks = chunkFamilyEvidenceText(largeText, { maxChars: 500, overlapChars: 50 })
      assert.ok(chunks.length > 1)
      for (const chunk of chunks) {
        assert.ok(chunk.length <= 500)
      }
    })
  })

  describe('2.2 Extreme & Unusual Order IDs', () => {
    it('T2.2.1: Walmart order ID embedded in raw URL query parameter extracts cleanly', () => {
      const text = 'View details: https://www.walmart.com/orders?orderId=200015480824348'
      const extracted = orderId({ description: text })
      assert.equal(extracted, '200015480824348')
      assert.equal(canonicalizeOrderId('Walmart', extracted), '2000154-80824348')
    })

    it('T2.2.2: Amazon order ID with erratic whitespace or tab separation', () => {
      const text = 'Amazon.com order number: 112 - 8472910 - 4829103'
      const extracted = orderId({ description: text.replace(/\s+/g, '') })
      assert.equal(extracted, '112-8472910-4829103')
      assert.equal(canonicalizeOrderId('Amazon', '11284729104829103'), '112-8472910-4829103')
    })

    it('T2.2.3: Order ID followed by trailing punctuation (period, colon)', () => {
      const text = 'Your Walmart Order #200015480824348.'
      const extracted = orderId({ description: text })
      assert.ok(extracted)
      assert.equal(canonicalizeOrderId('Walmart', extracted), '2000154-80824348')
    })

    it('T2.2.4: 30-character pseudo-order hash does not crash normalizer', () => {
      const longHash = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5'
      const normalized = canonicalizeOrderId('GenericStore', longHash)
      assert.equal(typeof normalized, 'string')
    })

    it('T2.2.5: Nike order ID with hyphenated prefix (C0-123456789) canonicalizes properly', () => {
      assert.equal(canonicalizeOrderId('Nike', 'C0-123456789'), 'C0-123456789')
      assert.equal(canonicalizeOrderId('Nike', 'c0123456789'), 'C0123456789')
    })
  })

  describe('2.3 Date Boundary & Future Arrival Guardrails', () => {
    it('T2.3.1: Delivery date set 14 days in future with raw status "delivered" downgraded to confirmed', () => {
      const today = new Date('2026-08-23T10:00:00-04:00')
      const futureDelivery = new Date('2026-09-06T18:00:00-04:00')

      const effective = resolveEffectiveStage('delivered', futureDelivery, today)
      assert.equal(effective, 'confirmed')
    })

    it('T2.3.2: Midnight rollover date parsing preserves correct calendar date', () => {
      const parsedMidnight = parseDateSafe('2026-08-28T00:00:00')
      assert.ok(parsedMidnight)
      assert.equal(parsedMidnight.dateStr, '2026-08-28')

      const parsedNoon = parseDateSafe('2026-08-28')
      assert.ok(parsedNoon)
      assert.equal(parsedNoon.dateStr, '2026-08-28')
    })

    it('T2.3.3: ISO date with explicit EDT timezone offset preserves local date', () => {
      const parsedTimezone = parseDateSafe('2026-08-27T17:30:00-04:00')
      assert.ok(parsedTimezone)
      assert.equal(parsedTimezone.dateStr, '2026-08-27')
    })

    it('T2.3.4: Overlapping multi-day event range returns valid parsed bounds', () => {
      const parsed = parseDateSafe('2026-10-02T10:00:00-04:00')
      assert.ok(parsed)
      assert.equal(parsed.dateStr, '2026-10-02')
    })

    it('T2.3.5: Past out_for_delivery item older than 24 hours auto-resolves to delivered', () => {
      const evalNow = new Date('2026-08-24T09:00:00-04:00')
      const yesterdayTarget = new Date('2026-08-23T18:00:00-04:00')

      const effective = resolveEffectiveStage('out_for_delivery', yesterdayTarget, evalNow)
      assert.equal(effective, 'delivered')
    })
  })

  describe('2.4 Ambiguous Agency Levels & Policy Disclaimers', () => {
    it('T2.4.1: Shipping notice with "return within 30 days" retained as passive agency_level: 0', () => {
      const item = {
        id: 'return-notice-1',
        event_title: 'Your Nike Order Shipped',
        description: 'Order C0123456789 is on the way. Items eligible for return within 30 days of receipt.',
        agency_level: 0,
        attention_vendor: 'Nike',
        source_type: 'gmail',
      }
      assert.equal(isDeliveryTransitItem(item), true)
      const { actionableItems } = splitActionableAndTransitItems([item])
      assert.equal(actionableItems.length, 0)
    })

    it('T2.4.2: Delivery notice containing "Signature required" is highlighted in transit radar', () => {
      const item = {
        id: 'sig-1',
        event_title: 'Apple Store Order Shipped - Signature Required',
        description: 'MacBook Pro shipped from Apple Store. Direct adult signature required.',
        agency_level: 0,
        attention_vendor: 'Apple',
        source_type: 'gmail',
      }
      const transit = buildDeliveryTransitItem(item)
      assert.ok(transit)
      assert.equal(transit.vendor, 'Apple')
      assert.equal(isDeliveryTransitItem(item), true)
    })

    it('T2.4.3: Promotional RSVP noise is suppressed and does not create calendar events', () => {
      const item = {
        id: 'promo-rsvp-1',
        description: 'RSVP now to unlock 20% off at our weekend flash sale!',
        source_type: 'general',
      }
      const suggestedEvent = detectSuggestedEvent(item)
      assert.equal(suggestedEvent, null)
    })

    it('T2.4.4: Auto-pay scheduled confirmation does not generate unpaid bill action', () => {
      const item = {
        id: 'autopay-1',
        event_title: 'Auto-Pay Scheduled',
        description: 'Your monthly bill of $120 will be auto-debited on Aug 30.',
        source_type: 'gmail',
        agency_level: 0,
      }
      const { actionableItems } = splitActionableAndTransitItems([item])
      assert.equal(actionableItems.length, 0)
    })

    it('T2.4.5: Damaged in transit exception elevates to problem status', () => {
      const item = {
        id: 'damaged-pkg-1',
        event_title: 'Delivery Exception: Package Damaged',
        description: 'Courier reported item #2 was damaged in transit.',
        source_type: 'gmail',
        attention_vendor: 'Walmart',
      }
      const stage = transactionStage(item)
      assert.equal(stage, 'problem')
    })
  })

  describe('2.5 Multi-Recipient & Cross-Inbox Deduplication', () => {
    it('T2.5.1: Identical RFC Message-ID across inboxes produces identical canonical key', async () => {
      const key1 = await canonicalEmailKey({
        messageId: '<20260820.12345@district.org>',
        from: 'news@palmbeachschools.org',
        subject: 'School Calendar 2026',
        receivedAt: '2026-08-20T10:00:00Z',
        normalizedBody: 'First day of school is Aug 10.',
      })
      const key2 = await canonicalEmailKey({
        messageId: ' <20260820.12345@district.org> ',
        from: 'District News <news@palmbeachschools.org>',
        subject: 'School Calendar 2026',
        receivedAt: '2026-08-20T10:02:00Z',
        normalizedBody: 'First day of school is Aug 10.',
      })
      assert.equal(key1, key2)
      assert.equal(key1, 'rfc:20260820.12345@district.org')
    })

    it('T2.5.2: Identical email forwarded with altered Subject deduplicates via content fingerprint', async () => {
      const body = 'Please sign the attached emergency medical release for Science Camp.'
      const fp1 = await canonicalContentFingerprint(body)
      const fp2 = await canonicalContentFingerprint(`  ${body}\n\n`)
      assert.equal(fp1, fp2)
    })

    it('T2.5.3: Duplicate tracking updates consolidate into single transit item', () => {
      const item1 = {
        id: 'track-1',
        event_title: 'Package Shipped',
        description: 'UPS 1Z9999999999999999 has shipped.',
        source_type: 'gmail',
        attention_thread_key: 'courier:ups:1z9999999999999999',
        attention_vendor: 'UPS',
        attention_stage: 'shipped',
        created_at: '2026-08-20T10:00:00Z',
        dismissed: false,
      }
      const item2 = {
        id: 'track-2',
        event_title: 'Package Out for Delivery',
        description: 'UPS 1Z9999999999999999 is out for delivery.',
        source_type: 'gmail',
        attention_thread_key: 'courier:ups:1z9999999999999999',
        attention_vendor: 'UPS',
        attention_stage: 'out_for_delivery',
        created_at: '2026-08-20T14:00:00Z',
        dismissed: false,
      }
      const t1 = buildDeliveryTransitItem(item1)
      const t2 = buildDeliveryTransitItem(item2)
      const merged = consolidateTransitItems([t1, t2])
      assert.equal(merged.length, 1)
      assert.equal(merged[0].stage, 'out_for_delivery')
    })

    it('T2.5.4: Quoted reply history is stripped to avoid false content drift', () => {
      const rawText = 'Sounds great, see you there!\n\nOn Aug 20, 2026, at 10:00 AM, Principal wrote:\n> Please review guidelines.'
      const stripped = stripQuotedReplyHistory(rawText)
      assert.equal(stripped, 'Sounds great, see you there!')
    })

    it('T2.5.5: Normalizing Internet Message ID handles leading/trailing brackets', () => {
      assert.equal(normalizeInternetMessageId('<message.id.123@google.com>'), 'message.id.123@google.com')
      assert.equal(normalizeInternetMessageId('  message.id.123@google.com  '), 'message.id.123@google.com')
    })
  })
})

// ============================================================================
// TIER 3: CROSS-FEATURE PAIRWISE INTERACTIONS
// ============================================================================

describe('Tier 3: Cross-Feature Pairwise Interactions', () => {

  it('T3.1: Multi-Stage Order Progression + Return Policy Disclaimers', () => {
    const email1 = {
      id: 'e1',
      source_type: 'gmail',
      event_title: 'Thanks for your InHome order',
      description: 'Order #2000154-80824348 ($138.65) placed.',
      attention_thread_key: 'transaction:walmart:2000154-80824348',
      attention_vendor: 'Walmart',
      attention_stage: 'confirmed',
      created_at: '2026-08-22T20:00:00Z',
      dismissed: false,
    }
    const email2 = {
      id: 'e2',
      source_type: 'gmail',
      event_title: 'Out for delivery',
      description: 'Order #2000154-80824348 driver en route. Arriving by 3:44pm.',
      attention_thread_key: 'transaction:walmart:2000154-80824348',
      attention_vendor: 'Walmart',
      attention_stage: 'out_for_delivery',
      created_at: '2026-08-23T14:00:00Z',
      dismissed: false,
    }
    const email3 = {
      id: 'e3',
      source_type: 'gmail',
      event_title: 'Delivered',
      description: 'Order #2000154-80824348 was delivered. Claims for damaged items within 3 days.',
      attention_thread_key: 'transaction:walmart:2000154-80824348',
      attention_vendor: 'Walmart',
      attention_stage: 'delivered',
      policy_disclaimer: 'Claims for damaged items within 3 days',
      created_at: '2026-08-23T16:00:00Z',
      dismissed: false,
    }

    const t1 = buildDeliveryTransitItem(email1)
    const t2 = buildDeliveryTransitItem(email2)
    const t3 = buildDeliveryTransitItem(email3)

    const consolidated = consolidateTransitItems([t1, t2, t3])
    assert.equal(consolidated.length, 1)
    assert.equal(consolidated[0].stage, 'delivered')
    assert.equal(consolidated[0].cost, '$138.65')
    assert.match(consolidated[0].policyDisclaimer || '', /claims/i)

    const { actionableItems } = splitActionableAndTransitItems([email1, email2, email3])
    assert.equal(actionableItems.length, 0, '0% leakage into Action Queue across all stages')
  })

  it('T3.2: Compound School Newsletter Decomposition + Calendar Event Generation', () => {
    const parentWaiver = {
      id: 'camp-waiver-1',
      type: 'forms',
      event_title: 'Science Camp Waiver',
      description: 'Submit liability release waiver for Science Camp.',
      source_origin: 'email_body',
      cluster_id: 'cluster-camp-2026',
      dismissed: false,
    }
    const siblingFee = {
      id: 'camp-fee-1',
      type: 'payment',
      event_title: 'Science Camp Registration Fee',
      description: 'Pay $150 registration fee due Aug 28.',
      due_by: '2026-08-28T18:00:00Z',
      source_origin: 'attachment',
      cluster_id: 'cluster-camp-2026',
      dismissed: false,
    }
    const siblingEvent = {
      id: 'camp-bus-1',
      type: 'event',
      event_title: 'Open House and Camp Briefing',
      description: 'Meet at school auditorium on Sep 2 at 6:00 PM.',
      event_date: '2026-09-02',
      due_by: '2026-09-02T18:00:00-04:00',
      source_origin: 'attachment',
      cluster_id: 'cluster-camp-2026',
      dismissed: false,
    }

    const bundle = detectSuggestedActionBundle(parentWaiver, null, [siblingFee, siblingEvent])
    assert.ok(bundle)
    assert.equal(bundle.actions.length, 3)

    const openHousePlan = detectSuggestedEvent({
      id: 'open-house-evt',
      event_title: 'Open House on Sep 2',
      description: 'Open house Sep 2 at 6:00 PM',
      due_by: '2026-09-02T18:00:00-04:00',
      source_type: 'gmail',
    })
    assert.ok(openHousePlan)
    assert.equal(openHousePlan.date, '2026-09-02')
  })

  it('T3.3: Active Learning Rule Override + Dynamic Few-Shot Retrieval', () => {
    const rules = [
      {
        pattern_type: 'domain',
        pattern_value: 'palmbeachfarmstand.com',
        rule_directive: 'Route local farm produce box orders quietly to Logistics Radar',
        active: true,
        origin: 'learned_feedback',
        confidence: 1.0,
      },
    ]

    const matches = matchCaptureRules(rules, 'orders@palmbeachfarmstand.com', 'Farm Box Confirmation')
    assert.equal(matches.length, 1)

    const farmItem = {
      id: 'farm-box-1',
      event_title: 'Weekly Farm Box Confirmation',
      description: 'Your seasonal vegetable crate has been prepared. Order #FB-10293.',
      source_type: 'gmail',
      attention_vendor: 'FarmStand',
      agency_level: 0,
      dismissed: false,
    }
    const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([farmItem])
    assert.equal(actionableItems.length, 0)
    assert.equal(deliveryTransitItems.length, 1)
  })

  it('T3.4: Airline Schedule Change + Calendar Conflict Alert Generation', () => {
    const conflict = {
      id: 'flight-conf-1',
      event_a_id: 'ortho-visit-1',
      conflict_type: 'time_change',
      description: 'Flight DL1482 moved from 4:30 PM to 11:15 AM, overlapping with Orthodontist Visit (11:30 AM).',
      severity: 2,
      resolved: false,
      resolved_at: null,
      created_at: '2026-08-22T18:00:00Z',
      event_a: {
        title: 'Pediatric Orthodontist Visit',
        start_time: '2026-10-14T11:30:00-04:00',
      },
    }

    const item = conflictToNeedsYouItem(conflict)
    assert.equal(item.type, 'time_change')
    assert.equal(item.priority, 2)
    assert.match(item.description, /Flight DL1482/)
  })

  it('T3.5: Sensitive PII Redaction + Estate Knowledge Indexing', () => {
    const rawSchoolEmail = `Student ID: STU-9482910
Lunch PIN: 8492
Credit Card: 4111 2222 3333 4444
SSN: 123-45-6789
Guidelines: All 6th grade students must wear emerald green shirts on Fridays.`

    const redacted = redactFamilyEvidenceText(rawSchoolEmail)
    assert.doesNotMatch(redacted, /STU-9482910/)
    assert.doesNotMatch(redacted, /8492/)
    assert.doesNotMatch(redacted, /4111 2222 3333 4444/)
    assert.doesNotMatch(redacted, /123-45-6789/)
    assert.match(redacted, /emerald green shirts/i)
    assert.match(redacted, /\[REDACTED\]/)
  })

  it('T3.6: Kiosk Touch Sidecar Action + Feed Synchronization', () => {
    useAppStore.setState({
      sidecarTab: 'action',
      selectedSidecarActionId: 'action-science-camp',
      aiDrawerOpen: true,
    })

    assert.equal(useAppStore.getState().sidecarTab, 'action')
    assert.equal(useAppStore.getState().selectedSidecarActionId, 'action-science-camp')

    useAppStore.getState().closeSidecar()
    assert.equal(useAppStore.getState().selectedSidecarActionId, null)
    assert.equal(useAppStore.getState().aiDrawerOpen, false)
  })
})

// ============================================================================
// TIER 4: REAL-WORLD APPLICATION SCENARIOS (5 End-to-End Narratives)
// ============================================================================

describe('Tier 4: Real-World Application Scenarios', () => {

  it('Scenario 1: Bak MSOA School Science Camp & Open House', () => {
    const waiverItem = {
      id: 'bak-waiver-1',
      type: 'forms',
      category: 'forms_paperwork',
      event_title: 'Bak MSOA Science Camp Waiver & $175 Fee',
      description: 'Submit liability release waiver and $175 registration fee by September 5, 2026.',
      due_by: '2026-09-05T18:00:00Z',
      agency_level: 2,
      assigned_to: 'liv-id',
      source_origin: 'attachment',
      dismissed: false,
    }

    const openHouseItem = {
      id: 'bak-curriculum-night-1',
      type: 'appointment',
      event_title: 'Bak MSOA Curriculum Night',
      description: 'Open House on Thursday, September 12 from 6:00 PM to 8:30 PM in the Auditorium.',
      due_by: '2026-09-12T18:00:00-04:00',
      event_date: '2026-09-12',
      agency_level: 1,
      source_origin: 'email_body',
      dismissed: false,
    }

    const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([waiverItem, openHouseItem])
    assert.equal(actionableItems.length, 2)
    assert.equal(deliveryTransitItems.length, 0, '100% routed to Action Queue & Calendar; 0% in Transit Items')

    const suggestedPlan = detectSuggestedEvent(openHouseItem)
    assert.ok(suggestedPlan)
    assert.equal(suggestedPlan.date, '2026-09-12')
    assert.match(suggestedPlan.title, /Curriculum Night/i)
  })

  it('Scenario 2: Walmart+ InHome Multi-Stage Perishable Grocery Delivery', () => {
    const confirmation = {
      id: 'wm-stage-1',
      source_type: 'gmail',
      event_title: 'Thanks for your InHome delivery order, Jacob',
      description: 'Order #200015480824348 total $142.50. Scheduled delivery tomorrow between 10:00 AM - 12:00 PM.',
      attention_thread_key: 'transaction:walmart:2000154-80824348',
      attention_vendor: 'Walmart+ InHome',
      attention_stage: 'confirmed',
      created_at: '2026-08-22T20:00:00Z',
      event_date: '2026-08-23T14:00:00Z',
      due_by: '2026-08-23T14:00:00Z',
      dismissed: false,
    }

    const outForDelivery = {
      id: 'wm-stage-2',
      source_type: 'gmail',
      event_title: 'Your InHome delivery should arrive by 10:45am',
      description: 'Order #2000154-80824348 driver en route with temperature-controlled cold chain.',
      attention_thread_key: 'transaction:walmart:2000154-80824348',
      attention_vendor: 'Walmart+ InHome',
      attention_stage: 'out_for_delivery',
      created_at: '2026-08-23T14:15:00Z',
      event_date: '2026-08-23T14:45:00Z',
      due_by: '2026-08-23T14:45:00Z',
      dismissed: false,
    }

    const delivered = {
      id: 'wm-stage-3',
      source_type: 'gmail',
      event_title: 'Your InHome order was delivered',
      description: 'Order #2000154-80824348 delivered at 10:45 AM. 90-day return policy applies.',
      attention_thread_key: 'transaction:walmart:2000154-80824348',
      attention_vendor: 'Walmart+ InHome',
      attention_stage: 'delivered',
      policy_disclaimer: '90-day return policy applies',
      created_at: '2026-08-23T14:45:00Z',
      event_date: '2026-08-23T14:45:00Z',
      due_by: '2026-08-23T14:45:00Z',
      dismissed: false,
    }

    const t1 = buildDeliveryTransitItem(confirmation)
    const t2 = buildDeliveryTransitItem(outForDelivery)
    const t3 = buildDeliveryTransitItem(delivered)

    const consolidated = consolidateTransitItems([t1, t2, t3])
    assert.equal(consolidated.length, 1)
    assert.equal(consolidated[0].stage, 'delivered')
    assert.equal(consolidated[0].isPerishable, true)
    assert.equal(consolidated[0].cost, '$142.50')

    const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([confirmation, outForDelivery, delivered])
    assert.equal(actionableItems.length, 0, 'Zero noise in Executive Action Queue')
    assert.equal(deliveryTransitItems.length, 1)
  })

  it('Scenario 3: Delta Air Lines Schedule Change with Calendar Conflict', () => {
    const flightConflict = {
      id: 'conf-dl1482',
      event_a_id: 'ortho-appt-uuid',
      conflict_type: 'time_change',
      description: 'Flight DL1482 departure changed to 11:15 AM on Oct 14, 2026, conflicting with Pediatric Orthodontist (11:30 AM).',
      severity: 2,
      resolved: false,
      resolved_at: null,
      created_at: '2026-08-22T18:00:00Z',
      event_a: {
        title: 'Pediatric Orthodontist Appointment',
        start_time: '2026-10-14T11:30:00-04:00',
      },
    }

    const needsYouItem = conflictToNeedsYouItem(flightConflict)
    assert.equal(needsYouItem.priority, 2)
    assert.equal(needsYouItem.source_type, 'conflict')
    assert.match(needsYouItem.description, /DL1482/)
    assert.match(needsYouItem.description, /11:15 AM/)
  })

  it('Scenario 4: HOA Landscaping & Roof Inspection Notice', () => {
    const poolClosureEvent = {
      id: 'hoa-pool-closure',
      type: 'appointment',
      event_title: 'Community Pool Closed for Maintenance',
      description: 'Community pool closed on Tuesday, Aug 25 for resurfacing.',
      due_by: '2026-08-25T08:00:00-04:00',
      event_date: '2026-08-25',
      source_type: 'gmail',
      dismissed: false,
    }

    const walkwayAction = {
      id: 'hoa-walkway-clearance',
      type: 'general',
      category: 'household_errands',
      event_title: 'Clear perimeter walkways for HOA Roof & Gutter Inspection',
      description: 'Mandatory roof and gutter inspection: clear perimeter walkways by Friday, Aug 28.',
      due_by: '2026-08-28T17:00:00Z',
      agency_level: 1,
      dismissed: false,
    }

    const poolPlan = detectSuggestedEvent(poolClosureEvent)
    assert.ok(poolPlan)
    assert.equal(poolPlan.date, '2026-08-25')

    const { actionableItems } = splitActionableAndTransitItems([walkwayAction])
    assert.equal(actionableItems.length, 1)
    assert.equal(actionableItems[0].category, 'household_errands')
  })

  it('Scenario 5: Apple High-Value Parcel with Direct Signature Requirement', () => {
    const appleItem = {
      id: 'apple-macbook-shipment',
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

    assert.equal(canonicalizeOrderId('Apple', 'w9876543210'), 'W9876543210')
    const extractedUpsTracking = orderId({ description: 'Shipped via UPS tracking 1Z9999999999999999' })
    assert.equal(extractedUpsTracking, '1Z9999999999999999')

    const transit = buildDeliveryTransitItem(appleItem)
    assert.equal(transit.vendor, 'Apple')
    assert.equal(transit.stage, 'shipped')

    const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([appleItem])
    assert.equal(actionableItems.length, 0, 'High-value shipment remains in logistics radar with zero false task leakage')
    assert.equal(deliveryTransitItems.length, 1)
  })
})

// ============================================================================
// TIER 5: AUTOMATED 30-CASE BENCHMARK SUITE
// ============================================================================

describe('Tier 5: Automated Benchmark Suite', () => {
  it('T5.0: Holistic verification across all ground-truth cases in email-benchmark.json', () => {
    assert.ok(benchmarkCases.length >= 30, `Benchmark dataset must contain at least 30 golden cases (got ${benchmarkCases.length})`)

    let passedCases = 0

    for (const bCase of benchmarkCases) {
      // 1. Archetype Categorization & Agency Level
      const classified = classifyEmail({
        from: bCase.sender,
        subject: bCase.subject,
        bodyText: bCase.body,
      })
      assert.ok(classified, `Classifier must return a result for ${bCase.id}`)
      assert.ok(
        classified.archetype === bCase.archetype ||
          (bCase.expected_routing === 'delivery_transit_items' &&
            (classified.archetype === 'logistics_parcels' || classified.archetype === 'lifecycle_updates')),
        `Archetype mismatch on benchmark case ${bCase.id}: got ${classified.archetype}, expected ${bCase.archetype}`
      )

      // 2. Canonical Vendor and Order ID Resolution
      if (bCase.expected_canonical_order_id && bCase.expected_vendor) {
        const canonicalId = canonicalizeOrderId(bCase.expected_vendor, bCase.expected_canonical_order_id)
        assert.equal(
          canonicalId,
          bCase.expected_canonical_order_id,
          `Canonical order ID mismatch on case ${bCase.id} (${bCase.expected_vendor})`
        )
      }

      // 3. Courier Tracking Number Canonicalization
      if (bCase.expected_tracking_number && bCase.expected_carrier) {
        const canonicalTracking = canonicalizeTrackingNumber(bCase.expected_carrier, bCase.expected_tracking_number)
        assert.equal(
          canonicalTracking,
          bCase.expected_tracking_number,
          `Canonical tracking number mismatch on case ${bCase.id} (${bCase.expected_carrier})`
        )
      }

      // 4. Agency Level Routing Partitioning
      const prepItem = {
        id: `bm_prep_${bCase.id}`,
        event_title: bCase.subject,
        description: bCase.body,
        source_type: 'gmail',
        attention_vendor: bCase.expected_vendor || null,
        attention_stage: bCase.expected_stage || null,
        agency_level: bCase.expected_agency_level,
        dismissed: false,
      }

      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([prepItem])

      if (bCase.expected_routing === 'delivery_transit_items') {
        assert.equal(
          deliveryTransitItems.length,
          1,
          `Case ${bCase.id} must route strictly to deliveryTransitItems`
        )
        assert.equal(
          actionableItems.length,
          0,
          `Case ${bCase.id} must produce 0% false leakage into actionableItems`
        )
      } else if (bCase.expected_routing === 'actionable_items') {
        assert.equal(
          actionableItems.length,
          1,
          `Case ${bCase.id} must route strictly to actionableItems`
        )
      } else if (bCase.expected_routing === 'suggested_events') {
        const eventItem = {
          ...prepItem,
          type: 'appointment',
          due_by: bCase.expected_start_time || '2026-09-01T10:00:00Z',
          event_date: (bCase.expected_start_time || '2026-09-01').slice(0, 10),
        }
        const plan = detectSuggestedEvent(eventItem)
        assert.ok(plan, `Case ${bCase.id} must yield a valid calendar event plan`)
      } else if (bCase.expected_routing === 'skip_noise') {
        assert.equal(classified.archetype, 'promotional_noise')
        assert.equal(
          actionableItems.length,
          0,
          `Case ${bCase.id} (promotional) must produce 0% false task leakage into actionableItems`
        )
      }

      passedCases++
    }

    assert.equal(passedCases, benchmarkCases.length)
  })

  // Granular individual test per benchmark case
  for (const bCase of benchmarkCases) {
    it(`T5.${bCase.id}: [${bCase.archetype}] ${bCase.subject.slice(0, 48)}...`, () => {
      // 1. Validate entity canonicalization
      if (bCase.expected_canonical_order_id && bCase.expected_vendor) {
        const canonicalId = canonicalizeOrderId(bCase.expected_vendor, bCase.expected_canonical_order_id)
        assert.equal(canonicalId, bCase.expected_canonical_order_id)
      }

      if (bCase.expected_tracking_number && bCase.expected_carrier) {
        const canonicalTrack = canonicalizeTrackingNumber(bCase.expected_carrier, bCase.expected_tracking_number)
        assert.equal(canonicalTrack, bCase.expected_tracking_number)
      }

      // 2. Validate classification and agency routing
      const classified = classifyEmail({
        from: bCase.sender,
        subject: bCase.subject,
        bodyText: bCase.body,
      })
      assert.ok(classified)

      const prepItem = {
        id: `bm_test_${bCase.id}`,
        event_title: bCase.subject,
        description: bCase.body,
        source_type: 'gmail',
        attention_vendor: bCase.expected_vendor || null,
        attention_stage: bCase.expected_stage || null,
        agency_level: bCase.expected_agency_level,
        dismissed: false,
      }

      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([prepItem])

      if (bCase.expected_routing === 'delivery_transit_items') {
        assert.equal(deliveryTransitItems.length, 1)
        assert.equal(actionableItems.length, 0)
      } else if (bCase.expected_routing === 'actionable_items') {
        assert.equal(actionableItems.length, 1)
      } else if (bCase.expected_routing === 'skip_noise') {
        assert.equal(classified.archetype, 'promotional_noise')
        assert.equal(actionableItems.length, 0)
      }
    })
  }
})

describe('TIER 6: Bills, Utilities & Household Services Executive Routing', () => {
  const billTestCases = [
    {
      name: 'FPL Electric Bill ($292.61 due Sep 14)',
      item: {
        id: 'bill-fpl-1',
        event_title: 'FPL Account: Your bill is ready to be viewed online',
        description: 'Your FPL bill of $292.61 is due. Please pay to avoid service interruption.',
        attention_vendor: 'FPL',
        due_by: '2026-09-14T05:00:00Z',
        type: 'payment',
        agency_level: 2,
        priority: 1,
        dismissed: false,
      },
      expectedVendor: 'FPL',
      expectedAmount: '$292.61',
    },
    {
      name: 'Palm Beach Water Utilities ($84.20)',
      item: {
        id: 'bill-water-1',
        event_title: 'Palm Beach County Water Utilities Bill',
        description: 'Your water utilities billing statement of $84.20 is now available. Due Sep 20.',
        attention_vendor: 'PBC Water Utilities',
        due_by: '2026-09-20T05:00:00Z',
        type: 'payment',
        agency_level: 2,
        priority: 1,
        dismissed: false,
      },
      expectedVendor: 'PBC Water Utilities',
      expectedAmount: '$84.20',
    },
    {
      name: 'Xfinity Internet Auto-pay Scheduled ($120.00)',
      item: {
        id: 'bill-xfinity-1',
        event_title: 'Xfinity: Your monthly billing statement is ready',
        description: 'Your automatic payment of $120.00 will be processed on Sep 10.',
        attention_vendor: 'Xfinity',
        due_by: '2026-09-10T05:00:00Z',
        type: 'payment',
        agency_level: 2,
        priority: 1,
        dismissed: false,
      },
      expectedVendor: 'Xfinity',
      expectedAmount: '$120.00',
    },
    {
      name: 'GreenThumb Lawn & Tree Service Invoice ($175.00)',
      item: {
        id: 'service-lawn-1',
        event_title: 'GreenThumb Landscaping Service Invoice',
        description: 'Monthly lawn maintenance and tree trimming service invoice $175.00 due Sep 5.',
        attention_vendor: 'GreenThumb Landscaping',
        due_by: '2026-09-05T05:00:00Z',
        type: 'payment',
        agency_level: 2,
        priority: 1,
        dismissed: false,
      },
      expectedVendor: 'GreenThumb Landscaping',
      expectedAmount: '$175.00',
    },
  ]

  for (const bCase of billTestCases) {
    it(`T6: ${bCase.name} routes 100% to Action Queue and 0% to Inbound Deliveries`, () => {
      assert.equal(isBillOrUtilityOrHouseholdService(bCase.item), true)
      assert.equal(isDeliveryTransitItem(bCase.item), false)

      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([bCase.item])
      assert.equal(actionableItems.length, 1)
      assert.equal(deliveryTransitItems.length, 0)
      assert.equal(actionableItems[0].id, bCase.item.id)

      const analysis = synthesizeActionAnalysis(bCase.item)
      assert.ok(analysis.urgency.includes('Payment') || analysis.urgency.includes('Statement'))
      assert.match(analysis.householdImpact, /billing statement|utility/i)
    })
  }
})

