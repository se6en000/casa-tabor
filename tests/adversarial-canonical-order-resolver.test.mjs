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

import { splitActionableAndTransitItems } from '../src/utils/needsYouFeed.ts'

// =========================================================================
// SECTION 1: OUT-OF-ORDER LIFECYCLE TRANSITIONS & PERMUTATION STRESS TEST
// =========================================================================

test('adversarial: lifecycle state transitions under out-of-order email arrivals', () => {
  // Scenario 1: Shipped email arrives at T=0, followed by late confirmation email arriving at T=1
  const stageShipped = resolveTransactionStage({
    title: 'Your order #2541442349 has shipped',
    description: 'UPS tracking # 1Z9999999999999999',
  })
  const stageConfirmed = resolveTransactionStage({
    title: 'Order confirmation #2541442349',
    description: 'Thank you for your order',
  })

  assert.equal(stageShipped, 'shipped')
  assert.equal(stageConfirmed, 'confirmed')

  const itemShipped = {
    id: 'item-shipped',
    title: 'Order Shipped',
    vendor: 'Jiffy.com',
    threadKey: 'transaction:jiffy-com:2541442349',
    stage: 'shipped',
    cost: '$13.71',
    itemSummary: 'Jacob Cart #50',
    occurredAt: '2026-08-22T10:00:00Z',
    rawItem: { event_title: 'Your order has shipped', description: 'UPS tracking 1Z9999999999999999', created_at: '2026-08-22T10:00:00Z' },
  }

  const itemConfirmedLate = {
    id: 'item-confirmed-late',
    title: 'Order Confirmation',
    vendor: 'Jiffy.com',
    threadKey: 'transaction:jiffy-com:2541442349',
    stage: 'confirmed',
    cost: '$13.71',
    itemSummary: 'Jacob Cart #50',
    occurredAt: '2026-08-22T11:00:00Z',
    rawItem: { event_title: 'Order Confirmation', description: 'Thanks for your order', created_at: '2026-08-22T11:00:00Z' },
  }

  // Merge Order 1: Shipped first, then Confirmed
  const merged1 = mergeDeliveryTransitItem(itemShipped, itemConfirmedLate)
  assert.equal(merged1.stage, 'shipped', 'Late confirmation must NOT downgrade stage from shipped to confirmed')

  // Merge Order 2: Confirmed first, then Shipped
  const merged2 = mergeDeliveryTransitItem(itemConfirmedLate, itemShipped)
  assert.equal(merged2.stage, 'shipped', 'Shipped must advance stage from confirmed to shipped')
})

test('adversarial: delivered email followed by late payment receipt preserves delivered stage', () => {
  const itemDelivered = {
    id: 'msg-delivered',
    title: 'Delivered',
    vendor: 'Walmart',
    threadKey: 'transaction:walmart:2000154-80824348',
    stage: 'delivered',
    cost: null,
    itemSummary: 'Delivery of InHome order (27 items)',
    occurredAt: '2026-08-19T16:00:00Z',
    rawItem: { event_title: 'Package Delivered', description: 'Delivered to front door', created_at: '2026-08-19T16:00:00Z' },
  }

  const itemLatePayment = {
    id: 'msg-payment',
    title: 'Payment Receipt',
    vendor: 'Walmart',
    threadKey: 'transaction:walmart:2000154-80824348',
    stage: 'payment',
    cost: '$138.65',
    itemSummary: 'Final charge for order',
    occurredAt: '2026-08-19T16:30:00Z',
    rawItem: { event_title: 'Receipt for payment', description: 'Final charge is $138.65', created_at: '2026-08-19T16:30:00Z', type: 'payment' },
  }

  const merged = mergeDeliveryTransitItem(itemDelivered, itemLatePayment)
  assert.equal(merged.stage, 'delivered', 'Late payment receipt arriving after delivery must preserve delivered stage')
  assert.equal(merged.cost, '$138.65', 'Late payment receipt must update the cost')
  assert.match(merged.itemSummary, /InHome/i, 'Descriptive summary must be preserved over generic receipt summary')
})

test('adversarial: 120-permutation lifecycle stage monotonic convergence', () => {
  const makeEmails = () => [
    {
      id: 'e1-confirmed',
      title: 'Order Confirmed',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'confirmed',
      cost: '$138.65',
      itemSummary: 'Walmart InHome Order',
      occurredAt: '2026-08-19T08:00:00Z',
      rawItem: { event_title: 'Order Confirmed', description: 'Order #200015480824348', created_at: '2026-08-19T08:00:00Z' },
    },
    {
      id: 'e2-preparing',
      title: 'Being Prepared',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'confirmed',
      cost: '$138.65',
      itemSummary: 'Walmart InHome Order (27 items)',
      occurredAt: '2026-08-19T10:00:00Z',
      rawItem: { event_title: 'Last minute to add more items', description: 'Your order is being prepared', created_at: '2026-08-19T10:00:00Z' },
    },
    {
      id: 'e3-shipped',
      title: 'Dispatched',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'shipped',
      cost: '$138.65',
      itemSummary: 'Walmart InHome Order (27 items)',
      occurredAt: '2026-08-19T12:00:00Z',
      rawItem: { event_title: 'Your order has shipped', description: 'Package is on the way', created_at: '2026-08-19T12:00:00Z' },
    },
    {
      id: 'e4-out-for-delivery',
      title: 'Out for Delivery',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'out_for_delivery',
      cost: '$138.65',
      itemSummary: 'Walmart InHome Order (27 items)',
      occurredAt: '2026-08-19T14:00:00Z',
      rawItem: { event_title: 'Out for delivery', description: 'Driver is on the way and should arrive by 3:44pm', created_at: '2026-08-19T14:00:00Z' },
    },
    {
      id: 'e5-delivered',
      title: 'Delivered',
      vendor: 'Walmart',
      threadKey: 'transaction:walmart:2000154-80824348',
      stage: 'delivered',
      cost: '$138.65',
      itemSummary: 'Walmart InHome Order (27 items including C2O)',
      occurredAt: '2026-08-19T15:45:00Z',
      rawItem: { event_title: 'Package Delivered', description: 'Delivered to front door. Final charge $138.65.', created_at: '2026-08-19T15:45:00Z' },
    },
  ]

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

  const allPerms = permutations(makeEmails())
  assert.equal(allPerms.length, 120, '5 items must have 120 permutations')

  for (let idx = 0; idx < allPerms.length; idx++) {
    const perm = allPerms[idx]
    const consolidated = consolidateTransitItems(perm)
    assert.equal(consolidated.length, 1, `Permutation #${idx} must consolidate to exactly 1 item`)
    const item = consolidated[0]
    assert.equal(item.stage, 'delivered', `Permutation #${idx} must resolve to stage 'delivered'`)
    assert.equal(item.cost, '$138.65', `Permutation #${idx} must preserve final cost $138.65`)
    assert.equal(item.updateHistory?.length, 5, `Permutation #${idx} must contain all 5 history records`)
    assert.equal(item.threadKey, 'transaction:walmart:2000154-80824348')
  }
})

// =========================================================================
// SECTION 2: MULTI-VENDOR & CARRIER KEY COLLISIONS AND KEY STABILITY
// =========================================================================

test('adversarial: multiple vendors with identical order IDs do not collide', () => {
  const commonId = '987654321'

  const walmartKey = buildCompositeThreadKey({ vendor: 'Walmart', orderId: commonId })
  const targetKey = buildCompositeThreadKey({ vendor: 'Target', orderId: commonId })
  const appleKey = buildCompositeThreadKey({ vendor: 'Apple', orderId: `W${commonId}` })
  const nikeKey = buildCompositeThreadKey({ vendor: 'Nike', orderId: `C0${commonId}` })
  const jiffyKey = buildCompositeThreadKey({ vendor: 'Jiffy.com', orderId: commonId })
  const amazonKey = buildCompositeThreadKey({ vendor: 'Amazon', orderId: `112-${commonId.slice(0, 7)}-${commonId.slice(0, 7)}` })

  const keys = [walmartKey, targetKey, appleKey, nikeKey, jiffyKey, amazonKey]
  const uniqueKeys = new Set(keys)

  assert.equal(uniqueKeys.size, keys.length, 'All vendors must have distinct composite thread keys')
  assert.equal(walmartKey, `transaction:walmart:${normalizeKeyPart(commonId)}`)
  assert.equal(targetKey, `transaction:target:${commonId}`)
  assert.equal(jiffyKey, `transaction:jiffy-com:${commonId}`)
})

test('adversarial: multiple carriers with identical tracking IDs do not collide', () => {
  const tracking = '987654321012'

  const upsKey = buildCompositeThreadKey({ carrier: 'ups', trackingNumber: tracking })
  const fedexKey = buildCompositeThreadKey({ carrier: 'fedex', trackingNumber: tracking })
  const uspsKey = buildCompositeThreadKey({ carrier: 'usps', trackingNumber: tracking })
  const dhlKey = buildCompositeThreadKey({ carrier: 'dhl', trackingNumber: tracking })

  const carrierKeys = [upsKey, fedexKey, uspsKey, dhlKey]
  const uniqueCarrierKeys = new Set(carrierKeys)

  assert.equal(uniqueCarrierKeys.size, 4, 'All courier keys must be namespace-isolated by carrier')
  assert.equal(upsKey, `courier:ups:${tracking}`)
  assert.equal(fedexKey, `courier:fedex:${tracking}`)
  assert.equal(uspsKey, `courier:usps:${tracking}`)
  assert.equal(dhlKey, `courier:dhl:${tracking}`)
})

test('adversarial: composite thread key stability under messy order ID formats', () => {
  const expectedWalmartKey = 'transaction:walmart:2000154-80824348'

  const walmartVariants = [
    '200015480824348',
    '2000154-80824348',
    'WM-2000154-80824348',
    'Order # 2000154-80824348',
    'Order no. 200015480824348',
    'Confirmation #: 2000154-80824348',
    'Invoice #2000154-80824348',
    'Receipt # 2000154-80824348',
    '  # 2000154-80824348  ',
    'orderId=200015480824348',
  ]

  for (const variant of walmartVariants) {
    const canonical = canonicalizeOrderId('Walmart', variant)
    const key = buildCompositeThreadKey({ vendor: 'Walmart', orderId: variant })
    assert.equal(canonical, '2000154-80824348', `Variant "${variant}" must canonicalize to 2000154-80824348`)
    assert.equal(key, expectedWalmartKey, `Variant "${variant}" must produce key ${expectedWalmartKey}`)
  }

  const expectedAmazonKey = 'transaction:amazon:112-8472910-4829103'
  const amazonVariants = [
    '112-8472910-4829103',
    '11284729104829103',
    'Order # 112-8472910-4829103',
    'order_id=112-8472910-4829103',
  ]

  for (const variant of amazonVariants) {
    const canonical = canonicalizeOrderId('Amazon', variant)
    const key = buildCompositeThreadKey({ vendor: 'Amazon', orderId: variant })
    assert.equal(canonical, '112-8472910-4829103', `Amazon variant "${variant}" must canonicalize to 112-8472910-4829103`)
    assert.equal(key, expectedAmazonKey, `Amazon variant "${variant}" must produce key ${expectedAmazonKey}`)
  }
})

// =========================================================================
// SECTION 3: PERISHABLE VS NON-PERISHABLE & POLICY EXTRACTION UNDER TRICKY PHRASING
// =========================================================================

test('adversarial: perishable vs non-perishable classification under tricky and deceptive phrasing', () => {
  // Positive perishable cases
  assert.equal(isPerishableDelivery('Walmart+ InHome delivery scheduled for 2pm'), true)
  assert.equal(isPerishableDelivery('HelloFresh box arriving Wednesday'), true)
  assert.equal(isPerishableDelivery('Green Chef organic meal kit'), true)
  assert.equal(isPerishableDelivery('Factor75 prepared meals shipped'), true)
  assert.equal(isPerishableDelivery('Blue Apron dinner box'), true)
  assert.equal(isPerishableDelivery('Instacart grocery order from Publix'), true)
  assert.equal(isPerishableDelivery('Keep refrigerated upon receipt'), true)
  assert.equal(isPerishableDelivery('Perishable food items enclosed'), true)
  assert.equal(isPerishableDelivery('Fresh organic produce box'), true)

  // Negative non-perishable cases (must NOT be falsely marked perishable)
  assert.equal(isPerishableDelivery('Jiffy Shirts Order #2541442349'), false)
  assert.equal(isPerishableDelivery('Apple Store MacBook Air shipment W123456789'), false)
  assert.equal(isPerishableDelivery('Nike Air Max sneakers C0123456789'), false)
  assert.equal(isPerishableDelivery('Bak MSOA Spirit Wear Emerald Green Shirt'), false)
  assert.equal(isPerishableDelivery('DHL Express document package 1234567890'), false)
  assert.equal(isPerishableDelivery('UPS delivery of hardware tools 1Z9999999999999999'), false)
})

test('adversarial: policy disclaimer extraction under complex phrasing', () => {
  const claim1 = 'Your Jiffy order #2541442349 has shipped. Claims for missing, wrong, or damaged items must be made within 3 days of final delivery (by Thursday, Aug 27).'
  const extracted1 = extractPolicyDisclaimer(claim1)
  assert.match(extracted1 || '', /claims for missing, wrong, or damaged items must be made within 3 days/i)

  const claim2 = 'Important: Claims must be made within 48 hours of package dropoff.'
  const extracted2 = extractPolicyDisclaimer(claim2)
  assert.match(extracted2 || '', /claims must be made within 48 hours/i)

  const return1 = 'Bak MSOA Spirit Wear Order #9912. Return window is 14 days from delivery.'
  const extractedReturn1 = extractPolicyDisclaimer(return1)
  assert.match(extractedReturn1 || '', /return window is 14 days/i)

  const return2 = 'Items in this shipment are return eligible until October 15, 2026.'
  const extractedReturn2 = extractPolicyDisclaimer(return2)
  assert.match(extractedReturn2 || '', /return eligible until/i)

  const return3 = 'Please note: Return by Oct 1 for a full refund.'
  const extractedReturn3 = extractPolicyDisclaimer(return3)
  assert.match(extractedReturn3 || '', /return by oct 1/i)

  // Clean non-policy texts must return null
  assert.equal(extractPolicyDisclaimer('Your package has been delivered to your front porch.'), null)
  assert.equal(extractPolicyDisclaimer('Order confirmed. Thank you for shopping with us!'), null)
})

test('adversarial: policy disclaimers do not trigger problem state or leak to Action Queue', () => {
  // A shipped email with a missing/damaged claim policy footnote
  const emailText = 'Your order #2541442349 has shipped via UPS tracking # 1Z9999999999999999. Claims for missing, wrong, or damaged items must be made within 3 days.'

  const stage = resolveTransactionStage(emailText)
  assert.equal(stage, 'shipped', 'Policy text mentioning "missing" or "damaged" must NOT trigger problem stage')

  const entity = resolveCanonicalEntity({
    title: 'Order Shipped',
    description: emailText,
    vendor: 'Jiffy.com',
  })
  assert.equal(entity.effectiveStage, 'shipped')
  assert.equal(entity.agencyLevel, 0, 'Logistics notifications must have agencyLevel: 0')
  assert.ok(entity.policyDisclaimer)

  // Feed partitioning check
  const prepItem = {
    id: 'test-jiffy-policy',
    event_title: 'Order Shipped',
    description: emailText,
    source_type: 'gmail',
    attention_vendor: 'Jiffy.com',
    attention_thread_key: 'transaction:jiffy-com:2541442349',
    type: 'delivery',
    dismissed: false,
    priority: 1,
  }
  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([prepItem])
  assert.equal(actionableItems.length, 0, 'Must not leak into Executive Action Queue')
  assert.equal(deliveryTransitItems.length, 1)
})

// =========================================================================
// SECTION 4: CLIENT & SERVER RESOLVER CONSISTENCY WITH PREPITEM FORMAT
// =========================================================================

test('adversarial: client and server canonical resolvers produce identical outputs for standard records', () => {
  const now = new Date('2026-08-23T12:00:00-04:00')

  const testInputs = [
    {
      event_title: 'Thanks for your InHome delivery order, Jacob',
      description: 'Order #200015480824348. Delivered to front door. Total: $124.49.',
      attention_vendor: 'Walmart',
      vendor: 'Walmart',
      deliveryDate: '2026-08-23T18:00:00Z',
    },
    {
      event_title: 'Shipment for Jacob Cart #50 (Order #2541442349)',
      description: 'Your Jiffy order #2541442349 has shipped via UPS tracking # 1Z9999999999999999. Expected delivery: Monday, Aug 24. Claims for missing items must be made within 3 days.',
      attention_vendor: 'Jiffy.com',
      vendor: 'Jiffy.com',
      deliveryDate: '2026-08-24T18:00:00Z',
    },
    {
      event_title: 'DHL Express Delivery Notice',
      description: 'DHL tracking 1234567890 is out for delivery today',
      deliveryDate: '2026-08-23T14:00:00Z',
    },
    {
      event_title: 'Apple Order Update',
      description: 'Your Apple Store order W987654321 has shipped',
      attention_vendor: 'Apple',
      vendor: 'Apple',
      deliveryDate: '2026-08-25T18:00:00Z',
    },
    {
      event_title: 'Nike Order Confirmation',
      description: 'Nike order C-0123456789 confirmed',
      attention_vendor: 'Nike',
      vendor: 'Nike',
      deliveryDate: '2026-08-26T18:00:00Z',
    },
  ]

  for (const input of testInputs) {
    const serverResult = resolveCanonicalEntity(input, { now })
    const clientResult = clientResolveCanonicalEntity(input, { now })

    assert.equal(serverResult.vendor, clientResult.vendor, `Vendor mismatch for ${input.event_title}`)
    assert.equal(serverResult.vendorKey, clientResult.vendorKey, `VendorKey mismatch for ${input.event_title}`)
    assert.equal(serverResult.canonicalOrderId, clientResult.canonicalOrderId, `CanonicalOrderId mismatch for ${input.event_title}`)
    assert.equal(serverResult.compositeThreadKey, clientResult.compositeThreadKey, `CompositeThreadKey mismatch for ${input.event_title}`)
    assert.equal(serverResult.effectiveStage, clientResult.effectiveStage, `EffectiveStage mismatch for ${input.event_title}`)
    assert.equal(serverResult.isPerishable, clientResult.isPerishable, `IsPerishable mismatch for ${input.event_title}`)
    assert.equal(serverResult.carrier, clientResult.carrier, `Carrier mismatch for ${input.event_title}`)
    assert.equal(serverResult.trackingNumber, clientResult.trackingNumber, `TrackingNumber mismatch for ${input.event_title}`)
    assert.equal(serverResult.agencyLevel, clientResult.agencyLevel, `AgencyLevel mismatch for ${input.event_title}`)
  }
})

// =========================================================================
// SECTION 5: ADVERSARIAL PAYLOAD ROBUSTNESS & MALFORMED INPUT RESILIENCE
// =========================================================================

test('adversarial: malformed, empty, and null payloads do not crash resolvers', () => {
  // Empty inputs
  assert.doesNotThrow(() => resolveCanonicalEntity({}))
  assert.doesNotThrow(() => resolveCanonicalEntity(null))
  assert.doesNotThrow(() => resolveCanonicalEntity(undefined))
  assert.doesNotThrow(() => clientResolveCanonicalEntity({}))
  assert.doesNotThrow(() => clientResolveCanonicalEntity(null))

  const emptyServer = resolveCanonicalEntity({})
  assert.equal(emptyServer.vendor, 'Parcel')
  assert.equal(emptyServer.agencyLevel, 0)
  assert.equal(emptyServer.compositeThreadKey, 'transaction:parcel:unknown')

  // Completely non-date strings
  const badDateResult = resolveCanonicalEntity({
    title: 'Order Confirmed',
    deliveryDate: 'not-a-valid-date',
  })
  assert.equal(badDateResult.deliveryDate, null)
  assert.equal(badDateResult.effectiveStage, 'confirmed')

  // Messy vendor hints
  assert.equal(detectVendor('Something else', '123 Main St, Apt 4B'), null, 'Address string must not be mistaken for vendor')
  assert.equal(detectVendor('Something else', '456 Ocean Boulevard, FL 33480'), null)
})

test('adversarial: deceptive promotional and marketing phrasing does not hijack delivery state', () => {
  // Marketing text using past tense verbs
  const promo1 = {
    title: 'We delivered savings to your inbox!',
    description: 'Check out our 50% off summer sale on summer shirts. Order online today.',
  }
  assert.notEqual(resolveTransactionStage(promo1), 'delivered', 'Marketing promo must not resolve to delivered')

  // Real delivery confirmation with marketing footnote
  const deliveryWithPromo = {
    title: 'Package Delivered',
    description: 'Your package was delivered to the front porch. We are preparing our fall catalog, order soon!',
  }
  assert.equal(resolveTransactionStage(deliveryWithPromo), 'delivered', 'Real delivery must resolve to delivered despite preparing keyword in footnote')
})
