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

// Helper for permutations
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
// SUITE 1: 120-PERMUTATION LIFECYCLE, COST, AND POLICY CONVERGENCE
// ============================================================================

test('challenger4: 120-permutation convergence with dynamic price adjustments and evolving policies', () => {
  const make5Events = () => [
    {
      id: 'evt-1-placed',
      title: 'Order Placed',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'confirmed',
      cost: '$120.00',
      policyDisclaimer: 'Standard 30-day return window applies.',
      itemSummary: 'Walmart InHome Order',
      occurredAt: '2026-08-19T08:00:00Z',
      rawItem: {
        event_title: 'Order Confirmed',
        description: 'Order #200015480824348. Total: $120.00. Standard 30-day return window applies.',
        created_at: '2026-08-19T08:00:00Z',
      },
    },
    {
      id: 'evt-2-preparing',
      title: 'Order In Preparation',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'confirmed',
      cost: '$135.50', // user added items during prep window
      policyDisclaimer: null,
      itemSummary: 'Walmart InHome Order (28 items)',
      occurredAt: '2026-08-19T10:00:00Z',
      rawItem: {
        event_title: 'Last minute to add more items',
        description: 'Your order is being prepared. Updated total: $135.50.',
        created_at: '2026-08-19T10:00:00Z',
      },
    },
    {
      id: 'evt-3-shipped',
      title: 'Dispatched',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'shipped',
      cost: '$128.25', // one out-of-stock item removed
      policyDisclaimer: 'Claims for missing, wrong, or damaged items must be made within 48 hours.',
      itemSummary: 'Walmart InHome Order (27 items)',
      occurredAt: '2026-08-19T12:00:00Z',
      rawItem: {
        event_title: 'Your order has shipped',
        description: 'Package on the way. Adjusted total $128.25. Claims for missing, wrong, or damaged items must be made within 48 hours.',
        created_at: '2026-08-19T12:00:00Z',
      },
    },
    {
      id: 'evt-4-out-for-delivery',
      title: 'Out for Delivery',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'out_for_delivery',
      cost: null, // carrier dispatch doesn't mention cost
      policyDisclaimer: null,
      itemSummary: 'Walmart InHome Order (27 items)',
      occurredAt: '2026-08-19T14:00:00Z',
      rawItem: {
        event_title: 'Out for delivery',
        description: 'Driver is on the way and should arrive by 3:44pm.',
        created_at: '2026-08-19T14:00:00Z',
      },
    },
    {
      id: 'evt-5-delivered',
      title: 'Delivered',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'delivered',
      cost: '$128.25', // final receipt confirmed
      policyDisclaimer: 'Claims for missing, wrong, or damaged items must be made within 3 days of delivery.',
      itemSummary: 'Walmart InHome Order (27 items including C2O)',
      occurredAt: '2026-08-19T15:45:00Z',
      rawItem: {
        event_title: 'Package Delivered',
        description: 'Delivered to front door. Final charge is $128.25. Claims for missing, wrong, or damaged items must be made within 3 days of delivery.',
        created_at: '2026-08-19T15:45:00Z',
      },
    },
  ]

  const allPerms = permutations(make5Events())
  assert.equal(allPerms.length, 120, 'Must test exactly 120 permutations (5!)')

  for (let i = 0; i < allPerms.length; i++) {
    const perm = allPerms[i]
    const consolidated = consolidateTransitItems(perm)

    assert.equal(consolidated.length, 1, `Permutation #${i} failed: expected exactly 1 consolidated item`)
    const result = consolidated[0]

    // 1. Stage must monotonically converge to delivered
    assert.equal(result.stage, 'delivered', `Permutation #${i} failed stage: expected delivered, got ${result.stage}`)

    // 2. Final price must be preserved ($128.25)
    assert.equal(result.cost, '$128.25', `Permutation #${i} failed cost: expected $128.25, got ${result.cost}`)

    // 3. Latest policy disclaimer from T=15:45 must prevail
    assert.match(
      result.policyDisclaimer || '',
      /within 3 days of delivery/i,
      `Permutation #${i} failed policyDisclaimer: expected 3-day policy, got "${result.policyDisclaimer}"`
    )

    // 4. Update history must contain all 5 unique events sorted chronologically
    assert.equal(result.updateHistory?.length, 5, `Permutation #${i} failed history length`)
    const historyTimes = result.updateHistory.map((h) => new Date(h.occurredAt).getTime())
    for (let k = 0; k < historyTimes.length - 1; k++) {
      assert.ok(
        historyTimes[k] <= historyTimes[k + 1],
        `Permutation #${i} failed history chronological order at index ${k}`
      )
    }

    // 5. Composite thread key must match exactly
    assert.equal(result.threadKey, 'transaction:walmart:2000154-80824348')
  }
})

test('challenger4: out-of-order delivery where final message has null cost and null policy preserves latest available non-null values', () => {
  const events = [
    {
      id: 'e1',
      title: 'Order Placed',
      vendor: 'Jiffy.com',
      threadKey: 'transaction:jiffy-com:2541442349',
      stage: 'confirmed',
      cost: '$45.00',
      policyDisclaimer: 'Claims for missing items must be made within 3 days',
      itemSummary: 'Custom T-Shirts',
      occurredAt: '2026-08-20T10:00:00Z',
      rawItem: { event_title: 'Order Placed', created_at: '2026-08-20T10:00:00Z' },
    },
    {
      id: 'e2',
      title: 'Order Shipped',
      vendor: 'Jiffy.com',
      threadKey: 'transaction:jiffy-com:2541442349',
      stage: 'shipped',
      cost: '$45.00',
      policyDisclaimer: 'Claims for missing, wrong, or damaged items must be made within 72 hours',
      itemSummary: 'Custom T-Shirts (10 items)',
      occurredAt: '2026-08-21T12:00:00Z',
      rawItem: { event_title: 'Shipped', created_at: '2026-08-21T12:00:00Z' },
    },
    {
      id: 'e3',
      title: 'Package Delivered',
      vendor: 'Jiffy.com',
      threadKey: 'transaction:jiffy-com:2541442349',
      stage: 'delivered',
      cost: null, // carrier dropoff ping has no cost
      policyDisclaimer: null, // carrier dropoff has no policy text
      itemSummary: 'Custom T-Shirts (10 items)',
      occurredAt: '2026-08-22T16:00:00Z',
      rawItem: { event_title: 'Delivered', created_at: '2026-08-22T16:00:00Z' },
    },
  ]

  const perms = permutations(events)
  assert.equal(perms.length, 6)

  for (let i = 0; i < perms.length; i++) {
    const res = consolidateTransitItems(perms[i])
    assert.equal(res.length, 1)
    const item = res[0]
    assert.equal(item.stage, 'delivered')
    assert.equal(item.cost, '$45.00', `Permutation #${i} failed: must preserve cost $45.00 even if delivered msg has null cost`)
    assert.match(item.policyDisclaimer || '', /72 hours/i, `Permutation #${i} failed: must preserve latest policy (72 hours)`)
  }
})

// ============================================================================
// SUITE 2: PERISHABLE CLASSIFICATION ON ARBITRARY OBJECT AND STRING SHAPES
// ============================================================================

test('challenger4: perishable classification exhaustive shape, property, and casing stress test', () => {
  const positiveStrings = [
    'Walmart+ InHome delivery scheduled for 2pm',
    'HelloFresh box arriving Wednesday',
    'Green Chef organic meal kit',
    'Factor75 prepared meals shipped',
    'Blue Apron dinner box',
    'Instacart grocery order from Publix',
    'Keep refrigerated upon receipt',
    'Perishable food items enclosed',
    'Fresh organic produce box',
    'HELLOFRESH BOX ARRIVING',
    'walmart+ inhome grocery',
    'fACTOR 75 weekly meals',
    'bLuE aPrOn meal kit',
    'refrigerate immediately',
    'fresh grocery items inside',
  ]

  const negativeStrings = [
    'Jiffy Shirts Order #2541442349',
    'Apple Store MacBook Air shipment W123456789',
    'Nike Air Max sneakers C0123456789',
    'Bak MSOA Spirit Wear Emerald Green Shirt',
    'DHL Express document package 1234567890',
    'UPS delivery of hardware tools 1Z9999999999999999',
    'Pottery Barn sofa delivery',
    'Target circle home decor',
    'Sephora beauty cosmetics order',
    'Amazon Kindle Paperwhite',
  ]

  // Test String Inputs
  for (const s of positiveStrings) {
    assert.equal(serverIsPerishableDelivery(s), true, `Server failed positive string: "${s}"`)
    assert.equal(clientIsPerishableDelivery(s), true, `Client failed positive string: "${s}"`)
  }

  for (const s of negativeStrings) {
    assert.equal(serverIsPerishableDelivery(s), false, `Server failed negative string: "${s}"`)
    assert.equal(clientIsPerishableDelivery(s), false, `Client failed negative string: "${s}"`)
  }

  // Test Object Shapes (Client & Server Parity)
  const positiveObjects = [
    // Standard UI Shape
    { title: 'InHome Delivery', vendor: 'Walmart', description: '27 items' },
    { title: 'Factor75 Meal Kit', vendor: 'Factor75', description: 'Prepared dinner' },
    { title: 'Produce Box', vendor: 'Instacart', description: 'Fresh vegetables' },
    // DB PrepItem Shape (event_title, attention_vendor)
    { event_title: 'Thanks for your InHome order', attention_vendor: 'Walmart', description: 'Groceries' },
    { event_title: 'HelloFresh Order Shipped', attention_vendor: 'HelloFresh', description: 'Meal box' },
    { event_title: 'Green Chef Delivery', attention_vendor: 'Green Chef', description: 'Organic ingredients' },
    // Partial Shapes
    { title: 'Blue Apron' },
    { vendor: 'Factor 75' },
    { attention_vendor: 'Hello Fresh' },
    { description: 'Package contains perishable items, keep refrigerated.' },
    { title: 'Grocery delivery arriving today' },
  ]

  const negativeObjects = [
    { title: 'MacBook Air M3', vendor: 'Apple', description: 'Laptop computer' },
    { title: 'Nike Air Jordan', vendor: 'Nike', description: 'Footwear' },
    { title: 'Bak MSOA Spirit Wear', vendor: 'Bak MSOA', description: 'T-Shirts' },
    { title: 'Hardware Tools', vendor: 'UPS', description: 'Tools package' },
    { event_title: 'Jiffy Custom Shirts', attention_vendor: 'Jiffy.com', description: 'Shirts' },
  ]

  for (const obj of positiveObjects) {
    assert.equal(serverIsPerishableDelivery(obj), true, `Server failed positive object: ${JSON.stringify(obj)}`)
    assert.equal(clientIsPerishableDelivery(obj), true, `Client failed positive object: ${JSON.stringify(obj)}`)
  }

  for (const obj of negativeObjects) {
    assert.equal(serverIsPerishableDelivery(obj), false, `Server failed negative object: ${JSON.stringify(obj)}`)
    assert.equal(clientIsPerishableDelivery(obj), false, `Client failed negative object: ${JSON.stringify(obj)}`)
  }

  // Malformed / Falsy Inputs
  const malformedInputs = [null, undefined, '', {}, 12345, true, false, [], { title: null, vendor: undefined, description: null }]
  for (const input of malformedInputs) {
    assert.doesNotThrow(() => serverIsPerishableDelivery(input))
    assert.doesNotThrow(() => clientIsPerishableDelivery(input))
    assert.equal(serverIsPerishableDelivery(input), false)
    assert.equal(clientIsPerishableDelivery(input), false)
  }
})

// ============================================================================
// SUITE 3: PROMOTIONAL NOISE SEGREGATION & 0% LEAKAGE STRESS TEST
// ============================================================================

test('challenger4: promotional marketing emails do not pollute delivery transit radar or leak into action queue', () => {
  const promoTestCases = [
    {
      id: 'promo-1',
      title: 'We delivered 50% savings to your inbox!',
      description: 'Check out our summer apparel sale. Free shipping on orders over $50.',
      source_type: 'gmail',
      vendor: 'Nike',
      attention_vendor: 'Nike',
      agency_level: 0,
      type: 'marketing',
    },
    {
      id: 'promo-2',
      title: 'Target Circle 360: Order today and save $20',
      description: 'Exclusive deals for Target circle members on patio furniture. Shop online now.',
      source_type: 'gmail',
      vendor: 'Target',
      attention_vendor: 'Target',
      agency_level: 0,
      type: 'marketing',
    },
    {
      id: 'promo-3',
      title: 'Walmart Rollback Deals: Summer Savings',
      description: 'Huge discounts on backyard grills and outdoor games. Order online for pickup.',
      source_type: 'gmail',
      vendor: 'Walmart',
      attention_vendor: 'Walmart',
      agency_level: 0,
      type: 'marketing',
    },
    {
      id: 'promo-4',
      title: 'Pottery Barn Fall Preview Catalog',
      description: 'Discover new living room styles. Order our printed lookbook or browse online.',
      source_type: 'gmail',
      vendor: 'Pottery Barn',
      attention_vendor: 'Pottery Barn',
      agency_level: 0,
      type: 'marketing',
    },
    {
      id: 'promo-5',
      title: 'The Daily Brew: Markets Rally',
      description: 'Your morning financial summary. Plus: tech stocks break records.',
      source_type: 'gmail',
      agency_level: 0,
      type: 'newsletter',
    },
  ]

  for (const promo of promoTestCases) {
    // 1. Transaction stage resolver must NOT mark marketing emails as delivered or shipped
    const stage = serverResolveTransactionStage(promo)
    assert.notEqual(stage, 'delivered', `Promo "${promo.title}" must not resolve to delivered`)
    assert.notEqual(stage, 'shipped', `Promo "${promo.title}" must not resolve to shipped`)

    // 2. Canonical entity resolver should not invent fake order tracking
    const entity = serverResolveCanonicalEntity(promo)
    assert.equal(entity.trackingNumber, null, `Promo "${promo.title}" must not produce trackingNumber`)
    assert.equal(entity.agencyLevel, 0, `Promo "${promo.title}" must have agencyLevel 0`)

    // 3. Client resolver parity
    const clientEntity = clientResolveCanonicalEntity(promo)
    assert.equal(clientEntity.trackingNumber, null)
    assert.equal(clientEntity.agencyLevel, 0)
  }

  // 4. Action Queue Leakage Test:
  // Split test cases using splitActionableAndTransitItems:
  // None of these promotional items have high agency (>0), so actionableItems must be 0!
  const prepPromos = promoTestCases.map((p) => ({
    id: p.id,
    event_title: p.title,
    description: p.description,
    source_type: 'gmail',
    attention_vendor: p.attention_vendor,
    agency_level: 0,
    type: p.type,
    dismissed: false,
    priority: 1,
    created_at: '2026-08-23T10:00:00Z',
  }))

  const { actionableItems } = splitActionableAndTransitItems(prepPromos)
  assert.equal(actionableItems.length, 0, 'Promotional marketing items with agency_level 0 must NEVER leak into Action Queue')
})

// ============================================================================
// SUITE 4: REAL DELIVERY WITH INCIDENTAL MARKETING FOOTNOTES
// ============================================================================

test('challenger4: authentic delivery emails containing incidental marketing footnotes resolve stage accurately', () => {
  const deliveryWithPromoFootnote = {
    event_title: 'Your Walmart order #2000154-80824348 has been delivered',
    description: 'Delivered to front door at 3:15pm. Check out our rollback sale on electronics! Shop more savings.',
    attention_vendor: 'Walmart',
    source_type: 'gmail',
    created_at: '2026-08-23T15:15:00Z',
  }

  const stage = serverResolveTransactionStage(deliveryWithPromoFootnote)
  assert.equal(stage, 'delivered', 'Authentic delivery with promotional footer must still resolve to delivered')

  const entity = serverResolveCanonicalEntity(deliveryWithPromoFootnote)
  assert.equal(entity.effectiveStage, 'delivered')
  assert.equal(entity.canonicalOrderId, '2000154-80824348')
  assert.equal(entity.compositeThreadKey, 'transaction:walmart:2000154-80824348')
})
