import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'

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
  ARCHETYPE_SUBCATEGORIES,
} from '../supabase/functions/_shared/email-clusterer.mjs'

import {
  buildCompositeThreadKey,
  canonicalizeOrderId,
  canonicalizeTrackingNumber,
  detectCarrierAndTracking,
  detectVendor,
  detectVendorAndOrder,
  extractPolicyDisclaimer,
  formatDeliveryEta,
  isPerishableDelivery,
  normalizeKeyPart,
  resolveCanonicalEntity,
  resolveEffectiveStage,
  resolveTransactionStage,
  VENDOR_ALIASES,
} from '../supabase/functions/_shared/canonical-order-resolver.mjs'

import {
  buildDeliveryTransitItem,
  consolidateTransitItems,
  isDeliveryTransitItem,
  isItemArrivingToday,
  isItemDelivered,
  isItemInTransit,
  isItemScheduledLater,
  mergeDeliveryTransitItem,
  mergeEtaDisplay,
  mergeItemSummary,
  resolveEffectiveStage as clientResolveEffectiveStage,
  resolveCanonicalEntity as clientResolveCanonicalEntity,
  stageStepIndex,
  transactionStage,
  vendorTransactionIdentity,
} from '../src/utils/vendorTransactions.ts'

import {
  splitActionableAndTransitItems,
  mergeNeedsYouItems,
  conflictToNeedsYouItem,
  directorySuggestionToNeedsYouItem,
  isReadOnlyNeedsYouItem,
} from '../src/utils/needsYouFeed.ts'

import {
  applyCaptureRules,
  isCaptureRuleDirective,
  matchCaptureRules,
  parseVoiceDirective,
  resolveCaptureCommand,
  synthesizeFeedbackRule,
} from '../supabase/functions/_shared/capture-command-router.mjs'

import {
  calculateJaccardSimilarity,
  clearExemplarCache,
  extractDomainFromEmail,
  fetchExemplars,
  formatFewShotPromptBlock,
  getDefaultGoldenExemplars,
  retrieveFewShotExemplars,
  scoreAndRankExemplars,
  scoreExemplar,
  tokenizeText,
} from '../supabase/functions/_shared/few-shot-exemplar-store.mjs'

describe('Challenger 1 Milestone 5: Empirical Adversarial Probe & Edge Case Hardening Suite', () => {

  // ==========================================================================
  // SECTION 1: HOSTILE LOGISTICS EMAIL VARIATIONS & ZERO ACTION QUEUE LEAKAGE
  // ==========================================================================
  describe('Probe 1: Hostile Logistics Variations & 0% False Action Queue Leakage', () => {

    it('Stress 1.1: 1,000 Hostile Deceptive Subjects, Policy Footnotes, and Phishing Urgency Hooks', () => {
      const deceptiveUrgencyHooks = [
        'ACTION REQUIRED: Please verify delivery instructions immediately',
        'URGENT NOTICE: Sign delivery waiver before driver arrives at property',
        'FINAL CALL: Claims window for damaged items closes in 24 hours',
        'CRITICAL ALERT: Package held at distribution center awaiting confirmation',
        'IMMEDIATE ATTENTION: Update gate security code for driver access',
        'Action Needed: Review return policy and submit RMA form if returning',
        'IMPORTANT: Authorize contactless drop-off to avoid package return',
        'Payment authorization verified for freight shipment #948201',
        'Attention Customer: Missing parcel claim must be filed within 3 days',
        'Warning: 30-day satisfaction guarantee expires soon',
        'Delivery Exception: Reschedule appointment or pick up at locker',
        'Signature Required: Adult signature mandated by merchant upon delivery',
        'Perishable freight notice: Refrigerate organic groceries immediately',
        'Refund Notice: $45.00 refunded for out-of-stock grocery item',
        'Recurring delivery reminder: Next auto-shipment arrives Wednesday',
      ]

      const merchants = [
        { name: 'Walmart', prefix: '2000154-', idDigits: 8 },
        { name: 'Amazon', prefix: '112-', idDigits: 7 },
        { name: 'Apple', prefix: 'W', idDigits: 9 },
        { name: 'Nike', prefix: 'C0', idDigits: 9 },
        { name: 'Target', prefix: '984', idDigits: 6 },
        { name: 'Jiffy.com', prefix: '254', idDigits: 7 },
        { name: 'HelloFresh', prefix: 'HF-', idDigits: 8 },
        { name: 'Publix / Instacart', prefix: 'INST-', idDigits: 7 },
        { name: 'Home Depot', prefix: 'HD-', idDigits: 8 },
        { name: 'Best Buy', prefix: 'BBY-', idDigits: 8 },
        { name: 'Pottery Barn', prefix: 'PB-', idDigits: 7 },
        { name: 'Crate & Barrel', prefix: 'CB-', idDigits: 7 },
        { name: 'UPS', prefix: '1Z', idDigits: 16 },
        { name: 'FedEx', prefix: '9827', idDigits: 8 },
        { name: 'DHL', prefix: '4829', idDigits: 6 },
      ]

      const stages = ['confirmed', 'shipped', 'out_for_delivery', 'delivered', 'problem', 'payment']

      const batch = []
      for (let i = 0; i < 1000; i++) {
        const merchant = merchants[i % merchants.length]
        const hook = deceptiveUrgencyHooks[i % deceptiveUrgencyHooks.length]
        const stage = stages[i % stages.length]
        const orderNum = `${merchant.prefix}${String(100000 + i).slice(-merchant.idDigits)}`

        batch.push({
          id: `adversarial-logistics-item-${i}`,
          event_title: `${merchant.name} Order #${orderNum} — ${hook}`,
          description: `Shipment update for order #${orderNum}. ${hook}. Total: $${(12.50 + (i * 3.17) % 450).toFixed(2)}. Courier tracking: 1Z${String(i).padStart(16, '0')}. Return policy: 30-day window.`,
          agency_level: 0,
          source_type: 'gmail',
          attention_vendor: merchant.name,
          attention_stage: stage,
          dismissed: false,
          created_at: new Date(Date.now() - i * 600000).toISOString(),
        })
      }

      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(batch)

      assert.equal(
        actionableItems.length,
        0,
        `LEAKAGE DETECTED! ${actionableItems.length} out of 1,000 hostile logistics items leaked into Action Queue!`
      )
      assert.ok(
        deliveryTransitItems.length > 0,
        'Delivery transit items must capture consolidated items'
      )
    })

    it('Stress 1.2: Passive Return & Warranty Policy Disclaimer Extraction Boundary Tests', () => {
      const policySnippets = [
        {
          text: 'Your order has shipped. Claims for missing, damaged, or wrong items must be made within 3 business days of receipt.',
          mustMatch: /claims for missing, damaged, or wrong items/i,
        },
        {
          text: 'Delivered to front door. Return window open until October 31, 2026. Standard restocking fees apply.',
          mustMatch: /return window open until/i,
        },
        {
          text: 'Package dropped off. Claims must be made within 48 hours of final delivery for damaged goods.',
          mustMatch: /claims must be made within/i,
        },
        {
          text: 'Apple Store order shipped. Return eligible until November 15, 2026 for a full refund.',
          mustMatch: /return eligible until/i,
        },
        {
          text: 'Nike order confirmed. Please note: Return by Oct 30 for return credit.',
          mustMatch: /return by oct 30/i,
        },
      ]

      for (const snippet of policySnippets) {
        const disclaimer = extractPolicyDisclaimer(snippet.text)
        assert.ok(disclaimer, `Failed to extract policy disclaimer from: "${snippet.text}"`)
        assert.match(disclaimer, snippet.mustMatch)

        const stage = resolveTransactionStage(snippet.text)
        assert.notEqual(
          stage,
          'problem',
          `Policy disclaimer mentioning damage/missing must NOT falsely classify stage as 'problem': "${snippet.text}"`
        )
      }

      // Clean non-policy texts must return null
      assert.equal(extractPolicyDisclaimer('Your package has arrived at the front door.'), null)
      assert.equal(extractPolicyDisclaimer('Thanks for your order! It is on its way.'), null)
    })

    it('Stress 1.3: Genuine Action Items vs Logistics False-Positive Discrimination', () => {
      const mixedCorpus = [
        // Genuine Action Items (Must enter Action Queue)
        {
          id: 'action-1',
          event_title: 'Pay FPL Electric Bill ($284.10)',
          description: 'Payment due on Sept 12 to avoid interruption of service.',
          agency_level: 2,
          type: 'payment',
          category: 'bills_payments',
          due_by: '2026-09-12T23:59:59Z',
          dismissed: false,
        },
        {
          id: 'action-2',
          event_title: 'Sign Palm Beach Schools Field Trip Permission Slip',
          description: 'Parent digital signature and emergency contact form required.',
          agency_level: 2,
          type: 'forms',
          category: 'forms_paperwork',
          due_by: '2026-09-02T17:00:00Z',
          dismissed: false,
        },
        {
          id: 'action-3',
          event_title: 'Schedule Annual Pediatric Dental Checkup for Owen',
          description: 'Follow-up appointment recommended every 6 months.',
          agency_level: 1,
          type: 'general',
          category: 'household_errands',
          due_by: '2026-09-15T17:00:00Z',
          dismissed: false,
        },
        // Logistics Items with Action-like keywords (Must NOT enter Action Queue)
        {
          id: 'logistics-1',
          event_title: 'Payment processed for Amazon Order #112-8492019-3829104',
          description: 'Your credit card was billed $49.99 for shipment.',
          agency_level: 0,
          source_type: 'gmail',
          attention_vendor: 'Amazon',
          attention_stage: 'confirmed',
          dismissed: false,
        },
        {
          id: 'logistics-2',
          event_title: 'Delivery Schedule Update: Walmart+ InHome',
          description: 'Your delivery has been scheduled for tomorrow 10am-12pm.',
          agency_level: 0,
          source_type: 'gmail',
          attention_vendor: 'Walmart',
          attention_stage: 'confirmed',
          dismissed: false,
        },
        {
          id: 'logistics-3',
          event_title: 'UPS Signature Release Form on File',
          description: 'Driver authorized to leave package at side entrance without signature.',
          agency_level: 0,
          source_type: 'gmail',
          attention_vendor: 'UPS',
          attention_stage: 'out_for_delivery',
          dismissed: false,
        },
      ]

      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(mixedCorpus)
      assert.equal(actionableItems.length, 3, 'Must route exactly the 3 genuine action items to Action Queue')
      assert.equal(deliveryTransitItems.length, 3, 'Must route exactly the 3 logistics items to Delivery Transit')

      const actionableIds = actionableItems.map(i => i.id)
      assert.deepEqual(actionableIds.sort(), ['action-1', 'action-2', 'action-3'].sort())
    })
  })

  // ==========================================================================
  // SECTION 2: MULTI-EMAIL LIFECYCLE PERMUTATIONS & DELAY RESILIENCY
  // ==========================================================================
  describe('Probe 2: Multi-Email Lifecycle Permutations & Out-of-Order Convergence', () => {

    it('Stress 2.1: Full 720-Permutation (6! Stages) Exhaustive Ordering Invariance', () => {
      const orderNumber = '2000154-80824348'
      const makeLifecycleStages = () => [
        {
          id: 's1-placed',
          title: 'Order Placed',
          vendor: 'Walmart',
          threadKey: `transaction:walmart:${orderNumber}`,
          stage: 'confirmed',
          cost: '$148.20',
          itemSummary: 'Walmart InHome Order (24 items)',
          occurredAt: '2026-08-20T08:00:00Z',
          rawItem: { event_title: 'Order Placed', description: 'Thank you for your order #2000154-80824348', created_at: '2026-08-20T08:00:00Z' },
        },
        {
          id: 's2-preparing',
          title: 'Being Prepared',
          vendor: 'Walmart',
          threadKey: `transaction:walmart:${orderNumber}`,
          stage: 'confirmed',
          cost: '$148.20',
          itemSummary: 'Walmart InHome Order (24 items)',
          occurredAt: '2026-08-20T10:00:00Z',
          rawItem: { event_title: 'Items being picked from shelves', description: 'Store associate preparing groceries', created_at: '2026-08-20T10:00:00Z' },
        },
        {
          id: 's3-shipped',
          title: 'Dispatched',
          vendor: 'Walmart',
          threadKey: `transaction:walmart:${orderNumber}`,
          stage: 'shipped',
          cost: '$148.20',
          itemSummary: 'Walmart InHome Order (24 items)',
          occurredAt: '2026-08-20T12:00:00Z',
          rawItem: { event_title: 'Driver loaded order', description: 'InHome van in transit', created_at: '2026-08-20T12:00:00Z' },
        },
        {
          id: 's4-transit',
          title: 'In Transit',
          vendor: 'Walmart',
          threadKey: `transaction:walmart:${orderNumber}`,
          stage: 'shipped',
          cost: '$148.20',
          itemSummary: 'Walmart InHome Order (24 items)',
          occurredAt: '2026-08-20T12:30:00Z',
          rawItem: { event_title: 'Package is in transit to local delivery hub', description: 'On track for delivery', created_at: '2026-08-20T12:30:00Z' },
        },
        {
          id: 's5-out-for-delivery',
          title: 'Out for Delivery',
          vendor: 'Walmart',
          threadKey: `transaction:walmart:${orderNumber}`,
          stage: 'out_for_delivery',
          cost: '$148.20',
          itemSummary: 'Walmart InHome Order (24 items)',
          occurredAt: '2026-08-20T13:30:00Z',
          rawItem: { event_title: 'Driver arriving soon', description: 'Arriving in 15 mins', created_at: '2026-08-20T13:30:00Z' },
        },
        {
          id: 's6-delivered',
          title: 'Delivered',
          vendor: 'Walmart',
          threadKey: `transaction:walmart:${orderNumber}`,
          stage: 'delivered',
          cost: '$148.20',
          itemSummary: 'Walmart InHome Order (24 items)',
          occurredAt: '2026-08-20T14:00:00Z',
          rawItem: { event_title: 'Delivered to kitchen refrigerator', description: 'Completed delivery', created_at: '2026-08-20T14:00:00Z' },
        },
      ]

      function generatePermutations(arr) {
        if (arr.length <= 1) return [arr]
        const perms = []
        for (let i = 0; i < arr.length; i++) {
          const current = arr[i]
          const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)]
          for (const p of generatePermutations(remaining)) {
            perms.push([current, ...p])
          }
        }
        return perms
      }

      const allPerms = generatePermutations(makeLifecycleStages())
      assert.equal(allPerms.length, 720, '6 stages must yield 720 permutations')

      for (let i = 0; i < allPerms.length; i++) {
        const sequence = allPerms[i]
        const consolidated = consolidateTransitItems(sequence)

        assert.equal(consolidated.length, 1, `Permutation #${i} failed: expected 1 consolidated item, got ${consolidated.length}`)
        const item = consolidated[0]
        assert.equal(item.stage, 'delivered', `Permutation #${i} failed: terminal stage must be 'delivered', got '${item.stage}'`)
        assert.equal(item.cost, '$148.20', `Permutation #${i} failed: cost must be $148.20`)
        assert.equal(item.updateHistory?.length, 6, `Permutation #${i} failed: must retain all 6 update history events`)
        assert.equal(item.threadKey, `transaction:walmart:${orderNumber}`)
      }
    })

    it('Stress 2.2: Delivery Exception Problem State Escalation Invariance', () => {
      // In Casa Tabor architecture, a problem / delivery exception stage is elevated so the household is alerted
      const normalItem = {
        id: 'fedex-normal-shipped',
        source_type: 'gmail',
        event_title: 'Nike Order #C0123456789 has shipped',
        description: 'Shipped via FedEx tracking 982736451029. Scheduled delivery: Aug 24.',
        attention_thread_key: 'transaction:nike:c0123456789',
        attention_vendor: 'Nike',
        attention_stage: 'shipped',
        created_at: '2026-08-22T10:00:00Z',
        dismissed: false,
      }

      const exceptionItem = {
        id: 'fedex-problem-delayed',
        source_type: 'gmail',
        event_title: 'FedEx Delivery Exception: Severe Weather Delay',
        description: 'Tracking 982736451029: Shipment delayed due to weather in Memphis hub.',
        attention_thread_key: 'transaction:nike:c0123456789',
        attention_vendor: 'Nike',
        attention_stage: 'problem',
        created_at: '2026-08-23T06:00:00Z',
        dismissed: false,
      }

      const t1 = buildDeliveryTransitItem(normalItem)
      const t2 = buildDeliveryTransitItem(exceptionItem)

      const mergedFwd = mergeDeliveryTransitItem(t1, t2)
      assert.equal(mergedFwd.stage, 'problem', 'Delivery exception must elevate merged stage to problem')

      const mergedRev = mergeDeliveryTransitItem(t2, t1)
      assert.equal(mergedRev.stage, 'problem', 'Delivery exception must maintain problem stage regardless of arrival sequence')
    })
  })

  // ==========================================================================
  // SECTION 3: CONCURRENT MULTI-MAILBOX INGESTION DEDUPLICATION
  // ==========================================================================
  describe('Probe 3: Concurrent Multi-Mailbox Ingestion Deduplication & Hashing Resiliency', () => {

    it('Stress 3.1: RFC Message-ID Canonicalization Edge Cases (Mixed Case, Punctuation, Angle Brackets)', async () => {
      const cases = [
        { raw: '<20260823.ABC123XYZ@MAIL.GOOGLE.COM>', expected: 'rfc:20260823.abc123xyz@mail.google.com' },
        { raw: '<<<20260823.abc123xyz@mail.google.com>>>', expected: 'rfc:<<20260823.abc123xyz@mail.google.com>>' },
        { raw: '  20260823.abc123xyz@mail.google.com  \r\n', expected: 'rfc:20260823.abc123xyz@mail.google.com' },
        { raw: '<msg-id-12345%2Btest@amazon.com>', expected: 'rfc:msg-id-12345%2btest@amazon.com' },
      ]

      for (const c of cases) {
        const key = await canonicalEmailKey({
          messageId: c.raw,
          from: 'orders@amazon.com',
          subject: 'Order Details',
          receivedAt: '2026-08-23T12:00:00Z',
          normalizedBody: 'Order confirmed.',
        })
        assert.equal(key, c.expected)
      }
    })

    it('Stress 3.2: Missing Message-ID Fallback Time-Bucket Boundary Precision', async () => {
      const emailA = {
        messageId: null,
        from: 'billing@fpl.com',
        subject: 'Monthly Electric Bill Ready',
        normalizedBody: 'Your bill is $214.50.',
      }

      // Same 10-minute window (14:00:00 to 14:09:59)
      const k1 = await canonicalEmailKey({ ...emailA, receivedAt: '2026-08-23T14:00:00Z' })
      const k2 = await canonicalEmailKey({ ...emailA, receivedAt: '2026-08-23T14:05:32Z' })
      const k3 = await canonicalEmailKey({ ...emailA, receivedAt: '2026-08-23T14:09:59Z' })

      assert.equal(k1, k2, 'Timestamps in same 10-minute window must match')
      assert.equal(k2, k3, 'Timestamps in same 10-minute window must match')

      // Next 10-minute window (14:10:00)
      const k4 = await canonicalEmailKey({ ...emailA, receivedAt: '2026-08-23T14:10:00Z' })
      assert.notEqual(k1, k4, 'Timestamps in distinct 10-minute windows must have different fallback keys')
    })

    it('Stress 3.3: Quoted Reply Stripping Across Email Clients (Apple Mail, Gmail, Outlook, Blockquotes)', () => {
      const appleMail = 'Thank you, we will be there!\n\nOn Aug 23, 2026, at 11:15 AM, Principal Davis <principal@palmbeachschools.org> wrote:\n> Please remember to bring signed forms.'
      assert.equal(stripQuotedReplyHistory(appleMail), 'Thank you, we will be there!')

      const outlook = 'Confirmed for dinner.\n\nFrom: Kelly Tabor <kelly@tabor.com>\nSent: Sunday, August 23, 2026 12:00 PM\nTo: Jake Tabor <jake@tabor.com>\nSubject: Dinner plans'
      assert.equal(stripQuotedReplyHistory(outlook), 'Confirmed for dinner.')

      const blockquote = 'Great update.\n> Earlier message content here\n> Another quote line'
      assert.equal(stripQuotedReplyHistory(blockquote), 'Great update.')
    })

    it('Stress 3.4: Concurrent 5-Mailbox Ingestion Stream Deduplication', async () => {
      // 5 Family members receive the same school blast with minor client formatting variations
      const schoolMsgId = '<DISTRICT-ANNOUNCE-2026-992@palmbeachschools.org>'
      const baseBody = 'School starts on August 10. Bus routes and supply lists are posted online.'

      const dadCopy = {
        messageId: schoolMsgId,
        from: 'Palm Beach County Schools <announcements@palmbeachschools.org>',
        subject: 'Welcome Back: 2026-2027 School Year Information',
        receivedAt: '2026-08-20T15:00:02Z',
        normalizedBody: baseBody,
      }

      const momCopy = {
        messageId: ` ${schoolMsgId} \n`,
        from: 'District Announcements <announcements@palmbeachschools.org>',
        subject: 'Welcome Back: 2026-2027 School Year Information',
        receivedAt: '2026-08-20T15:00:15Z',
        normalizedBody: baseBody + '\r\n',
      }

      const sharedCopy = {
        messageId: schoolMsgId.toLowerCase(),
        from: 'announcements@palmbeachschools.org',
        subject: 'Welcome Back: 2026-2027 School Year Information',
        receivedAt: '2026-08-20T15:00:44Z',
        normalizedBody: baseBody + '  ',
      }

      const [kDad, kMom, kShared] = await Promise.all([
        canonicalEmailKey(dadCopy),
        canonicalEmailKey(momCopy),
        canonicalEmailKey(sharedCopy),
      ])

      assert.equal(kDad, kMom, 'Dad and Mom copies must yield identical canonical key')
      assert.equal(kMom, kShared, 'Mom and Shared copies must yield identical canonical key')
      assert.equal(kDad, 'rfc:district-announce-2026-992@palmbeachschools.org')
    })
  })

  // ==========================================================================
  // SECTION 4: ACTIVE LEARNING FEEDBACK LOOP & DIRECTIVE PARSING PRECEDENCE
  // ==========================================================================
  describe('Probe 4: Active Learning Feedback Loop & Dynamic Few-Shot Exemplar Memory', () => {

    it('Stress 4.1: Natural Voice/Text Directives with Varied Phrasings and Contractions', () => {
      const testDirectives = [
        {
          input: 'tennis updates are informational',
          expectedDirective: 'route_archetype',
          expectedArchetype: 'estate_knowledge',
          expectedPattern: 'tennis updates',
        },
        {
          input: 'treat “swimming clinic schedules” as schedule',
          expectedDirective: 'route_archetype',
          expectedArchetype: 'temporal_appointments',
          expectedPattern: 'swimming clinic schedules',
        },
        {
          input: 'always track bakery receipts as logistics',
          expectedDirective: 'route_archetype',
          expectedArchetype: 'logistics_parcels',
          expectedPattern: 'bakery receipts',
        },
        {
          input: 'only alert on field trip waivers',
          expectedDirective: 'elevate_action',
          expectedArchetype: 'executive_actions',
          expectedPattern: 'field trip waivers',
        },
        {
          input: 'stop extracting flyers from jiffy.com',
          expectedDirective: 'suppress',
          expectedArchetype: 'promotional_noise',
          expectedPattern: 'jiffy.com',
        },
        {
          input: 'forget rule for tennis updates',
          expectedDirective: 'user_untrain',
          expectedActive: false,
          expectedPattern: 'tennis updates',
        },
      ]

      for (const d of testDirectives) {
        const parsed = parseVoiceDirective(d.input)
        assert.ok(parsed, `Failed to parse directive: "${d.input}"`)
        assert.equal(parsed.rule_directive, d.expectedDirective)
        if (d.expectedArchetype) {
          assert.equal(parsed.default_archetype, d.expectedArchetype)
        }
        if (d.expectedActive !== undefined) {
          assert.equal(parsed.active, d.expectedActive)
        }
        assert.equal(parsed.pattern_value, d.expectedPattern)
      }
    })

    it('Stress 4.2: Strict Precedence Enforcement: Sender > Domain > Subject > Phrase', () => {
      const candidateEmail = {
        from: 'headcoach@swimming-academy.com',
        subject: 'Fall Swim Team Practice Schedule & Meets',
        body: 'Please review the swim practice times and complete the waiver form.',
      }

      const activeRules = [
        {
          id: 'rule-phrase',
          pattern_type: 'phrase',
          pattern_value: 'waiver form',
          rule_directive: 'elevate_action',
          default_archetype: 'executive_actions',
          active: true,
        },
        {
          id: 'rule-subject',
          pattern_type: 'subject',
          pattern_value: 'fall swim team practice schedule',
          rule_directive: 'route_archetype',
          default_archetype: 'temporal_appointments',
          active: true,
        },
        {
          id: 'rule-domain',
          pattern_type: 'domain',
          pattern_value: 'swimming-academy.com',
          rule_directive: 'suppress',
          default_archetype: 'promotional_noise',
          active: true,
        },
        {
          id: 'rule-sender',
          pattern_type: 'sender',
          pattern_value: 'headcoach@swimming-academy.com',
          rule_directive: 'route_archetype',
          default_archetype: 'estate_knowledge',
          active: true,
        },
      ]

      const matches = matchCaptureRules(activeRules, candidateEmail)
      assert.equal(matches.length, 4, 'Candidate must match all 4 rules')

      // Precedence ordering verification
      assert.equal(matches[0].pattern_type, 'sender', '1st precedence must be SENDER')
      assert.equal(matches[0].default_archetype, 'estate_knowledge')

      assert.equal(matches[1].pattern_type, 'domain', '2nd precedence must be DOMAIN')
      assert.equal(matches[1].default_archetype, 'promotional_noise')

      assert.equal(matches[2].pattern_type, 'subject', '3rd precedence must be SUBJECT')
      assert.equal(matches[2].default_archetype, 'temporal_appointments')

      assert.equal(matches[3].pattern_type, 'phrase', '4th precedence must be PHRASE')
      assert.equal(matches[3].default_archetype, 'executive_actions')

      // Application test: Sender rule wins
      const { candidate: applied, appliedRule } = applyCaptureRules(candidateEmail, activeRules)
      assert.ok(appliedRule)
      assert.equal(appliedRule.pattern_type, 'sender')
      assert.equal(applied.archetype, 'estate_knowledge')
    })

    it('Stress 4.3: Inactive Rules & Fast Dismissal Synthesis', () => {
      // Inactive rule must be ignored
      const inactiveRule = [
        {
          pattern_type: 'domain',
          pattern_value: 'jiffy.com',
          rule_directive: 'suppress',
          default_archetype: 'promotional_noise',
          active: false,
        },
      ]

      const candidate = { from: 'orders@jiffy.com', subject: 'Your Order #2541442349' }
      const matches = matchCaptureRules(inactiveRule, candidate)
      assert.equal(matches.length, 0, 'Inactive rule must NOT match')

      // Fast dismissal synthesis
      const synthesized = synthesizeFeedbackRule({
        item: { domain: 'news.offers.com', from_email: 'sale@news.offers.com', subject: 'Big Labor Day Sale' },
        action: 'fast_dismissal',
      })

      assert.equal(synthesized.pattern_type, 'domain')
      assert.equal(synthesized.pattern_value, 'news.offers.com')
      assert.equal(synthesized.rule_directive, 'suppress')
      assert.equal(synthesized.default_archetype, 'promotional_noise')
      assert.equal(synthesized.origin, 'fast_dismissal')
      assert.equal(synthesized.active, true)
    })

    it('Stress 4.4: Dynamic Few-Shot Exemplar Store Resilience and Fallback Guarantees', async () => {
      clearExemplarCache()

      // When DB is null/offline, retrieveFewShotExemplars returns golden seeds
      const seedResults = await retrieveFewShotExemplars(null, {
        from: 'inhome@walmart.com',
        subject: 'Thanks for your InHome delivery order',
      })

      assert.ok(seedResults.length > 0, 'Must return golden seeds on DB offline')
      assert.equal(seedResults[0].domain, 'walmart.com')

      // Format prompt block with golden seeds
      const promptBlock = formatFewShotPromptBlock(seedResults)
      assert.ok(promptBlock.includes('### REFERENCE GOLDEN EXTRACTION EXEMPLARS:'))
      assert.ok(promptBlock.includes('walmart.com'))

      // Empty input handling
      const emptyPrompt = formatFewShotPromptBlock([])
      assert.equal(emptyPrompt, '')

      const jaccardZero = calculateJaccardSimilarity(new Set(), new Set(['apple']))
      assert.equal(jaccardZero, 0)
    })
  })
})
