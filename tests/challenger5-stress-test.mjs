import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCompositeThreadKey,
  canonicalizeOrderId,
  canonicalizeTrackingNumber,
  detectCarrierAndTracking,
  detectVendor,
  detectVendorAndOrder,
  extractPolicyDisclaimer,
  formatDeliveryEta,
  isPerishableDelivery as serverIsPerishableDelivery,
  normalizeKeyPart,
  resolveCanonicalEntity as serverResolveCanonicalEntity,
  resolveEffectiveStage as serverResolveEffectiveStage,
  resolveTransactionStage as serverResolveTransactionStage,
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
  isPerishableDelivery as clientIsPerishableDelivery,
  mergeDeliveryTransitItem,
  mergeEtaDisplay,
  mergeItemSummary,
  resolveCanonicalEntity as clientResolveCanonicalEntity,
  resolveEffectiveStage as clientResolveEffectiveStage,
  stageStepIndex,
  transactionStage as clientTransactionStage,
  vendorTransactionIdentity,
} from '../src/utils/vendorTransactions.ts'

import { splitActionableAndTransitItems } from '../src/utils/needsYouFeed.ts'

// Permutation generator helper
function permutations(arr) {
  if (arr.length <= 1) return [arr]
  const result = []
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const p of permutations(rest)) {
      result.push([arr[i], ...p])
    }
  }
  return result
}

// ============================================================================
// SUITE 1: COMPLEX MULTI-STAGE COMMUTATIVITY & IDEMPOTENCY
// ============================================================================

test('challenger5: 6-event timeline permutation commutativity with fluctuating prices, carrier pings, and policy shifts', () => {
  const make6Events = () => [
    {
      id: 'e1-cart-confirmed',
      title: 'Order Placed',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'confirmed',
      cost: '$150.00',
      policyDisclaimer: 'Standard Walmart 30-day return policy',
      itemSummary: 'Walmart InHome Order (15 items)',
      occurredAt: '2026-08-20T08:00:00Z',
      rawItem: {
        event_title: 'Order Confirmation',
        description: 'Order #200015480824348. Estimated total: $150.00.',
        created_at: '2026-08-20T08:00:00Z',
      },
    },
    {
      id: 'e2-item-added',
      title: 'Added Item During Prep Window',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'confirmed',
      cost: '$172.50',
      policyDisclaimer: null,
      itemSummary: 'Walmart InHome Order (18 items)',
      occurredAt: '2026-08-20T09:30:00Z',
      rawItem: {
        event_title: 'Order modified',
        description: 'You added 3 items. New total $172.50.',
        created_at: '2026-08-20T09:30:00Z',
      },
    },
    {
      id: 'e3-substitution-credit',
      title: 'Item Out of Stock Substituted',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'confirmed',
      cost: '$164.20',
      policyDisclaimer: 'Claims for missing items must be made within 48 hours',
      itemSummary: 'Walmart InHome Order (17 items)',
      occurredAt: '2026-08-20T11:00:00Z',
      rawItem: {
        event_title: 'Item substitution notice',
        description: 'Organic berries out of stock. Refunded $8.30. Adjusted total: $164.20.',
        created_at: '2026-08-20T11:00:00Z',
      },
    },
    {
      id: 'e4-shipped',
      title: 'Dispatched from Fulfillment Center',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'shipped',
      cost: '$164.20',
      policyDisclaimer: 'Claims for damaged goods within 48 hours',
      itemSummary: 'Walmart InHome Order (17 items)',
      occurredAt: '2026-08-20T12:30:00Z',
      rawItem: {
        event_title: 'Your order is on the way',
        description: 'Dispatched. Driver en route with 17 items.',
        created_at: '2026-08-20T12:30:00Z',
      },
    },
    {
      id: 'e5-out-for-delivery',
      title: 'Driver on the way',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'out_for_delivery',
      cost: null, // carrier message with null cost
      policyDisclaimer: null, // carrier message with null policy
      itemSummary: 'Walmart InHome Order (17 items)',
      occurredAt: '2026-08-20T14:15:00Z',
      rawItem: {
        event_title: 'Out for delivery',
        description: 'Driver will arrive at your front door by 2:45pm.',
        created_at: '2026-08-20T14:15:00Z',
      },
    },
    {
      id: 'e6-delivered-final',
      title: 'Delivered',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'delivered',
      cost: '$164.20',
      policyDisclaimer: 'Final receipt: Claims for missing or damaged items must be submitted within 3 days of delivery.',
      itemSummary: 'Walmart InHome Order (17 items including organic milk)',
      occurredAt: '2026-08-20T14:48:00Z',
      rawItem: {
        event_title: 'Delivered to front door',
        description: 'Package delivered at 2:48pm. Total charged: $164.20. Claims for missing or damaged items must be submitted within 3 days of delivery.',
        created_at: '2026-08-20T14:48:00Z',
      },
    },
  ]

  const allPerms = permutations(make6Events())
  assert.equal(allPerms.length, 720, '6! = 720 permutations')

  for (let i = 0; i < allPerms.length; i++) {
    const perm = allPerms[i]
    const consolidated = consolidateTransitItems(perm)

    assert.equal(consolidated.length, 1, `Permutation #${i} failed: must produce exactly 1 consolidated item`)
    const res = consolidated[0]

    // 1. Stage must be delivered
    assert.equal(res.stage, 'delivered', `Permutation #${i} stage mismatch`)

    // 2. Cost must be latest ($164.20)
    assert.equal(res.cost, '$164.20', `Permutation #${i} cost mismatch`)

    // 3. Policy disclaimer must be latest (3 days of delivery)
    assert.match(res.policyDisclaimer || '', /within 3 days of delivery/i, `Permutation #${i} policy mismatch`)

    // 4. Update history length and order
    assert.equal(res.updateHistory?.length, 6, `Permutation #${i} history count mismatch`)
    for (let k = 0; k < res.updateHistory.length - 1; k++) {
      const t1 = new Date(res.updateHistory[k].occurredAt).getTime()
      const t2 = new Date(res.updateHistory[k + 1].occurredAt).getTime()
      assert.ok(t1 <= t2, `Permutation #${i} history sorting inverted at ${k}`)
    }

    // 5. Idempotency test: consolidating an already consolidated array produces identical output
    const reConsolidated = consolidateTransitItems(consolidated)
    assert.equal(reConsolidated.length, 1)
    assert.equal(reConsolidated[0].stage, res.stage)
    assert.equal(reConsolidated[0].cost, res.cost)
    assert.equal(reConsolidated[0].policyDisclaimer, res.policyDisclaimer)
    assert.equal(reConsolidated[0].updateHistory?.length, 6)
  }
})

// ============================================================================
// SUITE 2: CARRIER DROPOFF WITH MISSING FIELDS & TERMINAL NULL VALUES
// ============================================================================

test('challenger5: out-of-order dropoff where terminal carrier message has null cost, null policy, and minimal description', () => {
  const events = [
    {
      id: 'e1',
      title: 'Order Confirmed',
      vendor: 'Amazon',
      threadKey: 'transaction:amazon:112-8472910-4829103',
      stage: 'confirmed',
      cost: '$89.99',
      policyDisclaimer: 'Return eligible through September 20, 2026',
      itemSummary: 'Kindle Paperwhite',
      occurredAt: '2026-08-20T10:00:00Z',
      rawItem: { event_title: 'Order Confirmed', description: 'Order #112-8472910-4829103. Total $89.99.', created_at: '2026-08-20T10:00:00Z' },
    },
    {
      id: 'e2',
      title: 'Carrier Dropoff Notice',
      vendor: 'Amazon',
      threadKey: 'transaction:amazon:112-8472910-4829103',
      stage: 'delivered',
      cost: null, // Carrier dropoff notification has NO price
      policyDisclaimer: null, // Carrier dropoff notification has NO return policy text
      itemSummary: null,
      occurredAt: '2026-08-21T15:00:00Z',
      rawItem: { event_title: 'Delivered', description: 'Package was left near the front door.', created_at: '2026-08-21T15:00:00Z' },
    },
  ]

  const forward = consolidateTransitItems(events)
  const reversed = consolidateTransitItems([...events].reverse())

  for (const res of [forward, reversed]) {
    assert.equal(res.length, 1)
    const item = res[0]
    assert.equal(item.stage, 'delivered')
    assert.equal(item.cost, '$89.99', 'Must preserve $89.99 from confirmed order')
    assert.match(item.policyDisclaimer || '', /Return eligible through September 20, 2026/i)
    assert.equal(item.itemSummary, 'Kindle Paperwhite')
    assert.equal(item.threadKey, 'transaction:amazon:112-8472910-4829103')
  }
})

// ============================================================================
// SUITE 3: PERISHABLE GOODS EXTREME CASING, UNICODE, AND SHAPE STRESS
// ============================================================================

test('challenger5: perishable detection across diacritics, unicode trademarks, unusual structures, and edge cases', () => {
  const edgeCases = [
    { input: 'HelloFresh™ Meal Delivery Box', expected: true },
    { input: 'Walmart+® InHome™ Grocery Delivery', expected: true },
    { input: 'GREEN CHEF® ORGANIC MEAL KIT', expected: true },
    { input: 'factor 75 chef prepared meal kits', expected: true },
    { input: 'Blue Apron Culinary Box #BA-994821', expected: true },
    { input: 'Instacart order from Whole Foods Market', expected: true },
    { input: 'REFRIGERATE UPON ARRIVAL - PERISHABLE', expected: true },
    { input: 'Fresh Farm Produce Crate', expected: true },
    { input: { event_title: 'HELLOFRESH_ORDER_123', attention_vendor: 'HelloFresh' }, expected: true },
    { input: { title: 'Factor75 Weekly Delivery', description: 'Ready to heat meals' }, expected: true },
    { input: { vendor: 'Blue Apron', description: 'Weekly meal delivery' }, expected: true },
    { input: { description: 'Perishable ingredients inside, keep cold' }, expected: true },
    // Negative test cases
    { input: 'Fresh paint odor removal kit', expected: true }, // 'fresh' keyword matches perishable intentionally
    { input: 'Apple iPad Pro 11-inch M4', expected: false },
    { input: 'Nike Air Zoom Pegasus Running Shoes', expected: false },
    { input: 'Jiffy Custom Screenprinted T-Shirts', expected: false },
    { input: 'Pottery Barn Belgian Linen Duvet Cover', expected: false },
    { input: 'UPS Tracking Number 1Z9999999999999999', expected: false },
    { input: 'FedEx Express Document Envelope 794829104829', expected: false },
    { input: { title: 'Nike Order #C0123456789', vendor: 'Nike', description: 'Footwear package' }, expected: false },
    { input: { title: 'Apple Store Receipt', vendor: 'Apple', description: 'MacBook Pro W123456789' }, expected: false },
  ]

  for (const { input, expected } of edgeCases) {
    const serverRes = serverIsPerishableDelivery(input)
    const clientRes = clientIsPerishableDelivery(input)
    assert.equal(serverRes, expected, `Server perishable mismatch for ${JSON.stringify(input)}`)
    assert.equal(clientRes, expected, `Client perishable mismatch for ${JSON.stringify(input)}`)
  }
})

// ============================================================================
// SUITE 4: MULTI-VENDOR IDENTICAL ORDER NUMBER NON-COLLISION & CANONICAL KEYS
// ============================================================================

test('challenger5: multi-vendor identical order ID and unhyphenated variant collision resistance', () => {
  // Test Walmart unhyphenated vs hyphenated canonicalization
  const wmHyphen = canonicalizeOrderId('Walmart', '2000154-80824348')
  const wmNoHyphen = canonicalizeOrderId('Walmart', '200015480824348')
  const wmWithPrefix = canonicalizeOrderId('Walmart', 'WM-200015480824348')
  assert.equal(wmHyphen, '2000154-80824348')
  assert.equal(wmNoHyphen, '2000154-80824348')
  assert.equal(wmWithPrefix, '2000154-80824348')

  // Test Amazon 17-digit canonicalization
  const amzClean = canonicalizeOrderId('Amazon', '112-8472910-4829103')
  const amzNoHyphen = canonicalizeOrderId('Amazon', '11284729104829103')
  assert.equal(amzClean, '112-8472910-4829103')
  assert.equal(amzNoHyphen, '112-8472910-4829103')

  // Test that Walmart and Target with the SAME raw order number have distinct thread keys
  const wmKey = buildCompositeThreadKey({ vendor: 'Walmart', orderId: '200015480824348' })
  const targetKey = buildCompositeThreadKey({ vendor: 'Target', orderId: '200015480824348' })
  const amazonKey = buildCompositeThreadKey({ vendor: 'Amazon', orderId: '200015480824348' })

  assert.notEqual(wmKey, targetKey, 'Walmart and Target must not share composite thread key')
  assert.notEqual(wmKey, amazonKey, 'Walmart and Amazon must not share composite thread key')
  assert.equal(wmKey, 'transaction:walmart:2000154-80824348')
  assert.equal(targetKey, 'transaction:target:200015480824348')

  // Test consolidateTransitItems with two different vendors on the same day
  const itemWm = {
    id: 'wm-1',
    title: 'Walmart Delivery',
    vendor: 'Walmart',
    threadKey: wmKey,
    stage: 'shipped',
    occurredAt: '2026-08-20T10:00:00Z',
    rawItem: { event_title: 'Walmart Order', created_at: '2026-08-20T10:00:00Z' },
  }

  const itemTarget = {
    id: 'tgt-1',
    title: 'Target Delivery',
    vendor: 'Target',
    threadKey: targetKey,
    stage: 'shipped',
    occurredAt: '2026-08-20T10:00:00Z',
    rawItem: { event_title: 'Target Order', created_at: '2026-08-20T10:00:00Z' },
  }

  const multiVendorConsolidated = consolidateTransitItems([itemWm, itemTarget])
  assert.equal(multiVendorConsolidated.length, 2, 'Distinct vendors must NOT merge into a single item')
})

// ============================================================================
// SUITE 5: LIFECYCLE STAGE RESOLUTION & GUARDRAILS
// ============================================================================

test('challenger5: future arrival date guardrails and past courier auto-resolution exact semantics', () => {
  const saturdayNow = new Date('2026-08-22T10:00:00Z')
  const mondayFuture = new Date('2026-08-24T14:00:00Z')
  const fridayPast = new Date('2026-08-21T16:00:00Z')
  const saturdayToday = new Date('2026-08-22T14:00:00Z')

  // 1. Future delivery target date with rawStage = 'delivered' MUST downgrade to 'confirmed'
  const futureDelivered = serverResolveEffectiveStage('delivered', mondayFuture, saturdayNow)
  const clientFutureDelivered = clientResolveEffectiveStage('delivered', mondayFuture, saturdayNow)
  assert.equal(futureDelivered, 'confirmed')
  assert.equal(clientFutureDelivered, 'confirmed')

  // 2. Future delivery target date with rawStage = 'shipped' stays 'shipped'
  assert.equal(serverResolveEffectiveStage('shipped', mondayFuture, saturdayNow), 'shipped')
  assert.equal(clientResolveEffectiveStage('shipped', mondayFuture, saturdayNow), 'shipped')

  // 3. Past same-day courier with rawStage = 'out_for_delivery' MUST auto-resolve to 'delivered'
  assert.equal(serverResolveEffectiveStage('out_for_delivery', fridayPast, saturdayNow), 'delivered')
  assert.equal(clientResolveEffectiveStage('out_for_delivery', fridayPast, saturdayNow), 'delivered')

  // 4. Past multi-day transit with rawStage = 'shipped' MUST STAY 'shipped' (NEVER auto-resolve)
  assert.equal(serverResolveEffectiveStage('shipped', fridayPast, saturdayNow), 'shipped')
  assert.equal(clientResolveEffectiveStage('shipped', fridayPast, saturdayNow), 'shipped')

  // 5. Past order with rawStage = 'confirmed' MUST STAY 'confirmed' (NEVER auto-resolve)
  assert.equal(serverResolveEffectiveStage('confirmed', fridayPast, saturdayNow), 'confirmed')
  assert.equal(clientResolveEffectiveStage('confirmed', fridayPast, saturdayNow), 'confirmed')

  // 6. Past order with rawStage = 'problem' MUST STAY 'problem' (NEVER auto-resolve)
  assert.equal(serverResolveEffectiveStage('problem', fridayPast, saturdayNow), 'problem')
  assert.equal(clientResolveEffectiveStage('problem', fridayPast, saturdayNow), 'problem')

  // 7. Today courier with rawStage = 'out_for_delivery' stays 'out_for_delivery'
  assert.equal(serverResolveEffectiveStage('out_for_delivery', saturdayToday, saturdayNow), 'out_for_delivery')
  assert.equal(clientResolveEffectiveStage('out_for_delivery', saturdayToday, saturdayNow), 'out_for_delivery')
})

// ============================================================================
// SUITE 6: POLICY DISCLAIMERS & 0% ACTION QUEUE LEAKAGE
// ============================================================================

test('challenger5: complex claims and return policies extract cleanly and never leak into Action Queue', () => {
  const policySamples = [
    {
      text: 'Your order has shipped. Claims for missing, wrong, or damaged items must be made within 3 days of delivery.',
      expectedDisclaimer: 'Claims for missing, wrong, or damaged items must be made within 3 days of delivery',
      expectedStage: 'shipped',
    },
    {
      text: 'Order confirmed. Return window closes after 30 days of receipt.',
      expectedDisclaimer: 'Return window closes after 30 days of receipt',
      expectedStage: 'confirmed',
    },
    {
      text: 'Delivered to porch. In case of missing items, claims must be made within 24 hours.',
      expectedDisclaimer: 'claims must be made within 24 hours',
      expectedStage: 'delivered',
    },
  ]

  for (const sample of policySamples) {
    const disclaimer = extractPolicyDisclaimer(sample.text)
    assert.match(disclaimer || '', new RegExp(sample.expectedDisclaimer.slice(0, 20), 'i'))

    const stage = serverResolveTransactionStage(sample.text)
    assert.equal(stage, sample.expectedStage, `Stage for "${sample.text}" should be ${sample.expectedStage}`)

    const entity = serverResolveCanonicalEntity({
      event_title: 'Shipping update',
      description: sample.text,
      agency_level: 0,
    })
    assert.equal(entity.agencyLevel, 0)
    assert.notEqual(entity.effectiveStage, 'problem', 'Policy disclaimer must not trigger problem state')
  }
})
