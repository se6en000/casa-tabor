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

test('canonical-order-resolver: multi-vendor order canonicalization', () => {
  // 1. Walmart: 15-digit and 16-digit unhyphenated, prefixed, or already hyphenated
  assert.equal(canonicalizeOrderId('Walmart', '200015480824348'), '2000154-80824348')
  assert.equal(canonicalizeOrderId('Walmart', '2000154-80824348'), '2000154-80824348')
  assert.equal(canonicalizeOrderId('Walmart+ InHome', 'WM-2000154-80824348'), '2000154-80824348')
  assert.equal(canonicalizeOrderId('Walmart', 'Order #2000154-80824348'), '2000154-80824348')
  assert.equal(canonicalizeOrderId('Walmart Grocery', '100015480824348'), '1000154-80824348')

  // 2. Amazon: 17-digit unformatted, formatted 3-7-7, and digital D01 format
  assert.equal(canonicalizeOrderId('Amazon', '11284729104829103'), '112-8472910-4829103')
  assert.equal(canonicalizeOrderId('Amazon', '112-8472910-4829103'), '112-8472910-4829103')
  assert.equal(canonicalizeOrderId('Amazon.com', 'Order # 114-1234567-7654321'), '114-1234567-7654321')
  assert.equal(canonicalizeOrderId('Amazon', 'D01-1234567-7654321'), 'D01-1234567-7654321')

  // 3. Apple: Web Order uppercase normalization
  assert.equal(canonicalizeOrderId('Apple', 'w123456789'), 'W123456789')
  assert.equal(canonicalizeOrderId('Apple Store', 'W987654321'), 'W987654321')
  assert.equal(canonicalizeOrderId('Apple', 'Order Number: W112233445'), 'W112233445')

  // 4. Nike: C0 and C- prefix uppercase normalization
  assert.equal(canonicalizeOrderId('Nike', 'c0123456789'), 'C0123456789')
  assert.equal(canonicalizeOrderId('Nike', 'C0123456789'), 'C0123456789')
  assert.equal(canonicalizeOrderId('Nike', 'C-0123456789'), 'C-0123456789')
  assert.equal(canonicalizeOrderId('Nike', 'c-9876543210'), 'C-9876543210')

  // 5. Target: 10-14 digit extraction
  assert.equal(canonicalizeOrderId('Target', '987654321012'), '987654321012')
  assert.equal(canonicalizeOrderId('Target', 'Order #9876543210'), '9876543210')

  // 6. Jiffy: 10-digit extraction
  assert.equal(canonicalizeOrderId('Jiffy.com', '2541442349'), '2541442349')
  assert.equal(canonicalizeOrderId('Jiffy Shirts', 'Order # 2541442349'), '2541442349')

  // 7. HelloFresh and meal kit box IDs
  assert.equal(canonicalizeOrderId('HelloFresh', 'hf-12345678'), 'HF-12345678')
  assert.equal(canonicalizeOrderId('Green Chef', 'GC-98765432'), 'GC-98765432')
  assert.equal(canonicalizeOrderId('Blue Apron', 'ba-11223344'), 'BA-11223344')
  assert.equal(canonicalizeOrderId('Factor75', 'fact-55667788'), 'FACT-55667788')
})

test('canonical-order-resolver: courier tracking normalization and URL generation', () => {
  // 1. UPS (1Z format and Mail Innovations)
  assert.equal(canonicalizeTrackingNumber('ups', '1z9999999999999999'), '1Z9999999999999999')
  assert.equal(canonicalizeTrackingNumber('ups', '1Z 999 999 99 9999 999 9'), '1Z9999999999999999')
  assert.equal(canonicalizeTrackingNumber('ups', '9274890123456789012345'), '9274890123456789012345')

  const upsDetected = detectCarrierAndTracking('Your package shipped via UPS tracking # 1Z9999999999999999')
  assert.equal(upsDetected.carrier, 'ups')
  assert.equal(upsDetected.trackingNumber, '1Z9999999999999999')
  assert.equal(upsDetected.trackingUrl, 'https://www.ups.com/track?tracknum=1Z9999999999999999')

  // 2. FedEx (12, 15, and 20-22 digits)
  assert.equal(canonicalizeTrackingNumber('fedex', '9876 5432 1012'), '987654321012')
  assert.equal(canonicalizeTrackingNumber('fedex', '123456789012345'), '123456789012345')
  assert.equal(canonicalizeTrackingNumber('fedex', '9611019012345678901234'), '9611019012345678901234')

  const fedexDetected = detectCarrierAndTracking('FedEx tracking 987654321012')
  assert.equal(fedexDetected.carrier, 'fedex')
  assert.equal(fedexDetected.trackingNumber, '987654321012')
  assert.equal(fedexDetected.trackingUrl, 'https://www.fedex.com/fedextrack/?trknbr=987654321012')

  // 3. USPS (20-24 digits and International UPU S10)
  assert.equal(canonicalizeTrackingNumber('usps', '9400 1000 0000 0000 0000 00'), '9400100000000000000000')
  assert.equal(canonicalizeTrackingNumber('usps', 'ea123456789us'), 'EA123456789US')

  const uspsDetected = detectCarrierAndTracking('USPS tracking 9400100000000000000000')
  assert.equal(uspsDetected.carrier, 'usps')
  assert.equal(uspsDetected.trackingNumber, '9400100000000000000000')
  assert.equal(uspsDetected.trackingUrl, 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400100000000000000000')

  const uspsIntlDetected = detectCarrierAndTracking('USPS Priority Mail EA123456789US')
  assert.equal(uspsIntlDetected.carrier, 'usps')
  assert.equal(uspsIntlDetected.trackingNumber, 'EA123456789US')

  // 4. DHL (10-11 digits and eCommerce GM format)
  assert.equal(canonicalizeTrackingNumber('dhl', '1234 567 890'), '1234567890')
  assert.equal(canonicalizeTrackingNumber('dhl', 'gm1234567890123456'), 'GM1234567890123456')

  const dhlDetected = detectCarrierAndTracking('DHL Express tracking 1234567890')
  assert.equal(dhlDetected.carrier, 'dhl')
  assert.equal(dhlDetected.trackingNumber, '1234567890')
  assert.equal(dhlDetected.trackingUrl, 'https://www.dhl.com/en/express/tracking.html?AWB=1234567890')
})

test('canonical-order-resolver: vendor and order detection from unstructured text', () => {
  // Walmart email detection
  const wm = detectVendorAndOrder('Thanks for your InHome delivery order #200015480824348')
  assert.equal(wm.vendor, 'Walmart')
  assert.equal(wm.vendorKey, 'walmart')
  assert.equal(wm.orderId, '200015480824348')
  assert.equal(wm.canonicalOrderId, '2000154-80824348')

  // Amazon email detection
  const amz = detectVendorAndOrder('Your Amazon.com order 11284729104829103 has shipped')
  assert.equal(amz.vendor, 'Amazon')
  assert.equal(amz.vendorKey, 'amazon')
  assert.equal(amz.canonicalOrderId, '112-8472910-4829103')

  // Jiffy compound subject with Cart ID and Order ID
  const jiffy = detectVendorAndOrder("Shipment for Jacob's Cart #50 (Order #2541442349)", 'Jiffy.com')
  assert.equal(jiffy.vendor, 'Jiffy.com')
  assert.equal(jiffy.vendorKey, 'jiffy-com')
  assert.equal(jiffy.canonicalOrderId, '2541442349')

  // Apple order
  const apple = detectVendorAndOrder('Your Apple Store order W987654321 is being prepared')
  assert.equal(apple.vendor, 'Apple')
  assert.equal(apple.canonicalOrderId, 'W987654321')

  // Nike order
  const nike = detectVendorAndOrder('Nike Order: C-0123456789 has shipped')
  assert.equal(nike.vendor, 'Nike')
  assert.equal(nike.canonicalOrderId, 'C-0123456789')

  // URL query parameter
  const urlOrder = detectVendorAndOrder('View your shipment at https://walmart.com/track?orderId=200015480824348')
  assert.equal(urlOrder.vendor, 'Walmart')
  assert.equal(urlOrder.canonicalOrderId, '2000154-80824348')
})

test('canonical-order-resolver: composite thread key generation', () => {
  // Merchant transaction thread keys
  assert.equal(
    buildCompositeThreadKey({ vendor: 'Walmart', orderId: '200015480824348' }),
    'transaction:walmart:2000154-80824348'
  )
  assert.equal(
    buildCompositeThreadKey({ vendor: 'Amazon', orderId: '11284729104829103' }),
    'transaction:amazon:112-8472910-4829103'
  )
  assert.equal(
    buildCompositeThreadKey({ vendor: 'Jiffy.com', orderId: '2541442349' }),
    'transaction:jiffy-com:2541442349'
  )
  assert.equal(
    buildCompositeThreadKey({ vendor: 'Apple', orderId: 'w123456789' }),
    'transaction:apple:w123456789'
  )
  assert.equal(
    buildCompositeThreadKey({ vendor: 'Nike', orderId: 'c-0123456789' }),
    'transaction:nike:c-0123456789'
  )

  // Standalone courier thread keys
  assert.equal(
    buildCompositeThreadKey({ carrier: 'ups', trackingNumber: '1Z9999999999999999' }),
    'courier:ups:1z9999999999999999'
  )
  assert.equal(
    buildCompositeThreadKey({ carrier: 'fedex', trackingNumber: '987654321012' }),
    'courier:fedex:987654321012'
  )
  assert.equal(
    buildCompositeThreadKey({ carrier: 'usps', trackingNumber: '9400100000000000000000' }),
    'courier:usps:9400100000000000000000'
  )
  assert.equal(
    buildCompositeThreadKey({ carrier: 'dhl', trackingNumber: '1234567890' }),
    'courier:dhl:1234567890'
  )

  // Fallback keys
  assert.equal(
    buildCompositeThreadKey({ vendor: 'Walmart', descriptor: '27 items including C2O' }),
    'transaction:walmart:items:27-items-including-c2o'
  )
  assert.equal(
    buildCompositeThreadKey({ vendor: 'Walmart', dateKey: '2026-08-19' }),
    'delivery:walmart:2026-08-19'
  )
  assert.equal(
    buildCompositeThreadKey({ vendor: 'Target', sourceRef: 'gmail:household:msg-1' }),
    'transaction:target:message:gmail:household:msg-1'
  )
})

test('canonical-order-resolver: lifecycle stage resolution and in-preparation lock', () => {
  // 1. Confirmed / Placed
  assert.equal(
    resolveTransactionStage({ title: 'Order Confirmation', description: 'Thank you for your order #2541442349' }),
    'confirmed'
  )

  // 2. In-Preparation Lock: "being prepared" / "last minute to add items"
  assert.equal(
    resolveTransactionStage({ title: 'Last minute to add more to your order', description: 'Your order is being prepared and will be delivered today' }),
    'confirmed'
  )
  assert.equal(
    resolveTransactionStage({ title: 'Order Update', description: 'We are preparing your items. Last call to edit your order.' }),
    'confirmed'
  )

  // 3. Payment notice
  assert.equal(
    resolveTransactionStage({ type: 'payment', title: 'Payment Receipt', description: 'Temporary hold is $138.65' }),
    'payment'
  )

  // 4. Shipped / In transit
  assert.equal(
    resolveTransactionStage({ title: 'Your order has shipped', description: 'UPS tracking # 1Z9999999999999999' }),
    'shipped'
  )
  assert.equal(
    resolveTransactionStage({ title: 'Package on the way', description: 'Dispatched from fulfillment center' }),
    'shipped'
  )

  // 5. Out for delivery
  assert.equal(
    resolveTransactionStage({ title: 'Out for Delivery', description: 'Your driver is on the way and should arrive by 3:44pm' }),
    'out_for_delivery'
  )

  // 6. Explicit delivered
  assert.equal(
    resolveTransactionStage({ title: 'Package Delivered', description: 'Your package has been delivered to the front porch' }),
    'delivered'
  )

  // 7. Problem / Exception
  assert.equal(
    resolveTransactionStage({ type: 'cancellation', title: 'Order Cancelled', description: 'Your order has been cancelled' }),
    'problem'
  )
  assert.equal(
    resolveTransactionStage({ title: 'Delivery Exception', description: 'Package was damaged in transit and delivery failed' }),
    'problem'
  )

  // 8. Passive policy disclaimer does NOT trigger problem
  assert.equal(
    resolveTransactionStage({ title: 'Shipment Update', description: 'Your order has shipped. Claims for missing, wrong, or damaged items must be made within 3 days.' }),
    'shipped'
  )
})

test('canonical-order-resolver: future arrival date guardrail', () => {
  const saturdayNow = new Date('2026-08-22T10:00:00-04:00')
  const mondayFuture = new Date('2026-08-24T18:00:00-04:00')
  const wednesdayFuture = new Date('2026-08-26T18:00:00-04:00')

  // Future delivery target date MUST NOT resolve to delivered
  assert.equal(resolveEffectiveStage('delivered', mondayFuture, saturdayNow), 'confirmed')
  assert.equal(resolveEffectiveStage('shipped', mondayFuture, saturdayNow), 'shipped')
  assert.equal(resolveEffectiveStage('confirmed', mondayFuture, saturdayNow), 'confirmed')
  assert.equal(resolveEffectiveStage('out_for_delivery', wednesdayFuture, saturdayNow), 'out_for_delivery')

  // Problem state remains problem even on future date
  assert.equal(resolveEffectiveStage('problem', mondayFuture, saturdayNow), 'problem')
})

test('canonical-order-resolver: past courier auto-resolution', () => {
  const today = new Date('2026-08-20T18:00:00-04:00')
  const yesterday = new Date('2026-08-19T18:00:00-04:00')
  const threeDaysAgo = new Date('2026-08-17T18:00:00-04:00')

  // Past same-day courier dispatch (out_for_delivery) auto-resolves to delivered
  assert.equal(resolveEffectiveStage('out_for_delivery', yesterday, today), 'delivered')
  assert.equal(resolveEffectiveStage('out_for_delivery', threeDaysAgo, today), 'delivered')

  // Same-day dispatch today remains out_for_delivery
  assert.equal(resolveEffectiveStage('out_for_delivery', today, today), 'out_for_delivery')

  // Multi-day freight / warehouse shipments (shipped) do NOT auto-resolve
  assert.equal(resolveEffectiveStage('shipped', yesterday, today), 'shipped')
  assert.equal(resolveEffectiveStage('confirmed', yesterday, today), 'confirmed')
  assert.equal(resolveEffectiveStage('payment', yesterday, today), 'payment')

  // Problem remains problem
  assert.equal(resolveEffectiveStage('problem', yesterday, today), 'problem')
})

test('canonical-order-resolver: dynamic ETA formatting', () => {
  const today = new Date('2026-08-20T12:00:00-04:00')
  const yesterday = new Date('2026-08-19T12:00:00-04:00')
  const threeDaysAgo = new Date('2026-08-17T12:00:00-04:00')
  const tomorrow = new Date('2026-08-21T12:00:00-04:00')
  const monday = new Date('2026-08-24T12:00:00-04:00')

  // Delivered stage ETAs
  assert.equal(formatDeliveryEta(null, today, 'delivered', today), 'Delivered today')
  assert.equal(formatDeliveryEta(null, yesterday, 'delivered', today), 'Delivered yesterday')
  assert.equal(formatDeliveryEta(null, threeDaysAgo, 'delivered', today), 'Delivered Aug 17')

  // In-transit / active ETAs
  assert.equal(formatDeliveryEta('by 3:44pm', today, 'out_for_delivery', today), 'by 3:44pm')
  assert.equal(formatDeliveryEta('by 2pm', tomorrow, 'confirmed', today), 'Tomorrow (by 2pm)')
  assert.equal(formatDeliveryEta(null, tomorrow, 'confirmed', today), 'Tomorrow')
  assert.equal(formatDeliveryEta(null, monday, 'shipped', today), 'Mon, Aug 24')
  assert.equal(formatDeliveryEta(null, null, 'problem', today), 'Delivery exception')
})

test('canonical-order-resolver: policy disclaimer extraction and 0 agency level', () => {
  const textWithClaim = 'Your Jiffy order #2541442349 has shipped. Claims for missing, wrong, or damaged items must be made within 3 days of final delivery (by Thursday, Aug 27).'
  const disclaimer = extractPolicyDisclaimer(textWithClaim)
  assert.match(disclaimer || '', /claims for missing, wrong, or damaged items must be made within 3 days/i)

  const textWithReturn = 'Bak MSOA Spirit Wear Order #9912. Return window is 14 days.'
  const returnDisclaimer = extractPolicyDisclaimer(textWithReturn)
  assert.match(returnDisclaimer || '', /return window is 14 days/i)

  assert.equal(extractPolicyDisclaimer('Thanks for your order! No issues reported.'), null)
})

test('canonical-order-resolver: perishable grocery and meal kit identification', () => {
  assert.equal(isPerishableDelivery('Walmart+ InHome delivery with 27 items'), true)
  assert.equal(isPerishableDelivery('HelloFresh box arriving Wednesday'), true)
  assert.equal(isPerishableDelivery('Green Chef meal kit dispatched'), true)
  assert.equal(isPerishableDelivery('Instacart grocery order from Publix'), true)
  assert.equal(isPerishableDelivery('Refrigerated medication parcel'), true)
  assert.equal(isPerishableDelivery('Jiffy shirts order #2541442349'), false)
  assert.equal(isPerishableDelivery('Apple Store MacBook Air shipment'), false)
})

test('canonical-order-resolver: full resolveCanonicalEntity contract conformance', () => {
  const saturdayNow = new Date('2026-08-22T10:00:00-04:00')

  // 1. Jiffy Order Shipped with UPS Tracking and Claims Disclaimer
  const jiffyInput = {
    title: "Shipment for Jacob's Cart #50 (Order #2541442349)",
    description: 'Your Jiffy order #2541442349 has shipped via UPS tracking # 1Z9999999999999999. Expected delivery: Monday, Aug 24. Claims for missing, wrong, or damaged items must be made within 3 days of final delivery (by Thursday, Aug 27). Total charged: $13.71.',
    vendor: 'Jiffy.com',
    source_ref: 'gmail:household:jiffy123',
    deliveryDate: '2026-08-24T18:00:00Z',
  }

  const jiffyResult = resolveCanonicalEntity(jiffyInput, { now: saturdayNow })

  assert.equal(jiffyResult.vendor, 'Jiffy.com')
  assert.equal(jiffyResult.vendorKey, 'jiffy-com')
  assert.equal(jiffyResult.orderId, '2541442349')
  assert.equal(jiffyResult.canonicalOrderId, '2541442349')
  assert.equal(jiffyResult.carrier, 'ups')
  assert.equal(jiffyResult.trackingNumber, '1Z9999999999999999')
  assert.equal(jiffyResult.compositeThreadKey, 'transaction:jiffy-com:2541442349')
  assert.equal(jiffyResult.effectiveStage, 'shipped')
  assert.equal(jiffyResult.isPerishable, false)
  assert.equal(jiffyResult.cost, '$13.71')
  assert.equal(jiffyResult.agencyLevel, 0)
  assert.match(jiffyResult.policyDisclaimer || '', /claims for missing/i)
  assert.match(jiffyResult.etaDisplay || '', /Mon, Aug 24/i)

  // 2. Standalone Courier Delivery (DHL) without Order ID
  const dhlInput = {
    title: 'DHL Express Delivery Notice',
    description: 'DHL tracking 1234567890 is out for delivery today by 2:00pm',
    deliveryDate: '2026-08-22T14:00:00Z',
  }

  const dhlResult = resolveCanonicalEntity(dhlInput, { now: saturdayNow })

  assert.equal(dhlResult.vendor, 'DHL')
  assert.equal(dhlResult.vendorKey, 'dhl')
  assert.equal(dhlResult.orderId, null)
  assert.equal(dhlResult.carrier, 'dhl')
  assert.equal(dhlResult.trackingNumber, '1234567890')
  assert.equal(dhlResult.compositeThreadKey, 'courier:dhl:1234567890')
  assert.equal(dhlResult.effectiveStage, 'out_for_delivery')
  assert.equal(dhlResult.agencyLevel, 0)

  // 3. Walmart InHome Order with Future Date Guardrail
  const walmartInput = {
    title: 'Thanks for your InHome delivery order, Jacob',
    description: 'Order #200015480824348. Delivered to front door. Total: $124.49.',
    attention_stage: 'delivered',
    vendor: 'Walmart',
    deliveryDate: '2026-08-24T18:00:00Z',
  }

  const wmResult = resolveCanonicalEntity(walmartInput, { now: saturdayNow })

  assert.equal(wmResult.vendor, 'Walmart')
  assert.equal(wmResult.canonicalOrderId, '2000154-80824348')
  assert.equal(wmResult.compositeThreadKey, 'transaction:walmart:2000154-80824348')
  assert.equal(wmResult.rawStage, 'delivered')
  assert.equal(wmResult.effectiveStage, 'confirmed', 'Future delivery date must override delivered to confirmed')
  assert.equal(wmResult.isPerishable, true)
  assert.equal(wmResult.cost, '$124.49')
  assert.equal(wmResult.agencyLevel, 0)
})
