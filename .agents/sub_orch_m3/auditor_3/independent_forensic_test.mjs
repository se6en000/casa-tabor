import assert from 'node:assert/strict'
import {
  canonicalizeOrderId as serverCanonicalizeOrderId,
  canonicalizeTrackingNumber as serverCanonicalizeTrackingNumber,
  detectCarrierAndTracking as serverDetectCarrierAndTracking,
  detectVendorAndOrder as serverDetectVendorAndOrder,
  buildCompositeThreadKey as serverBuildCompositeThreadKey,
  resolveTransactionStage as serverResolveTransactionStage,
  resolveEffectiveStage as serverResolveEffectiveStage,
  formatDeliveryEta as serverFormatDeliveryEta,
  extractPolicyDisclaimer as serverExtractPolicyDisclaimer,
  isPerishableDelivery as serverIsPerishableDelivery,
  resolveCanonicalEntity as serverResolveCanonicalEntity,
} from '../../../supabase/functions/_shared/canonical-order-resolver.mjs'

import {
  canonicalizeOrderId as clientCanonicalizeOrderId,
  canonicalizeTrackingNumber as clientCanonicalizeTrackingNumber,
  detectCarrierAndTracking as clientDetectCarrierAndTracking,
  detectVendorAndOrder as clientDetectVendorAndOrder,
  buildCompositeThreadKey as clientBuildCompositeThreadKey,
  transactionStage as clientTransactionStage,
  resolveEffectiveStage as clientResolveEffectiveStage,
  formatDeliveryEta as clientFormatDeliveryEta,
  extractPolicyDisclaimer as clientExtractPolicyDisclaimer,
  isPerishableDelivery as clientIsPerishableDelivery,
  resolveCanonicalEntity as clientResolveCanonicalEntity,
  consolidateTransitItems,
  mergeDeliveryTransitItem,
} from '../../../src/utils/vendorTransactions.ts'

import { splitActionableAndTransitItems } from '../../../src/utils/needsYouFeed.ts'

console.log('--- STARTING INDEPENDENT FORENSIC VERIFICATION ---')

// 1. Novel Unseen Multi-Vendor IDs
console.log('1. Testing novel multi-vendor order canonicalization...')
const novelWalmart = 'WM 3000999 12345678'
assert.equal(serverCanonicalizeOrderId('Walmart', novelWalmart), '3000999-12345678')
assert.equal(clientCanonicalizeOrderId('Walmart', novelWalmart), '3000999-12345678')

const novelAmazon = 'Order ID: 99912345677654321'
assert.equal(serverCanonicalizeOrderId('Amazon', novelAmazon), '999-1234567-7654321')
assert.equal(clientCanonicalizeOrderId('Amazon', novelAmazon), '999-1234567-7654321')

const novelApple = 'apple order w998877665'
assert.equal(serverCanonicalizeOrderId('Apple', novelApple), 'W998877665')
assert.equal(clientCanonicalizeOrderId('Apple', novelApple), 'W998877665')

const novelNike = 'nike ref: c09876543210'
assert.equal(serverCanonicalizeOrderId('Nike', novelNike), 'C09876543210')
assert.equal(clientCanonicalizeOrderId('Nike', novelNike), 'C09876543210')

const novelMealKit = 'BA-99881122'
assert.equal(serverCanonicalizeOrderId('Blue Apron', novelMealKit), 'BA-99881122')
assert.equal(clientCanonicalizeOrderId('Blue Apron', novelMealKit), 'BA-99881122')

console.log('✔ Multi-vendor order normalization passed.')

// 2. Courier Tracking Edge Cases
console.log('2. Testing courier tracking normalization & detection...')
const novelUps = '1z 4a5 b6c 78 9012 345 6'
assert.equal(serverCanonicalizeTrackingNumber('ups', novelUps), '1Z4A5B6C7890123456')
assert.equal(clientCanonicalizeTrackingNumber('ups', novelUps), '1Z4A5B6C7890123456')

const novelUspsIntl = 'GB987654321US'
assert.equal(serverCanonicalizeTrackingNumber('usps', novelUspsIntl), 'GB987654321US')
assert.equal(clientCanonicalizeTrackingNumber('usps', novelUspsIntl), 'GB987654321US')

const novelDhlEcom = 'LX9988776655443322'
assert.equal(serverCanonicalizeTrackingNumber('dhl', novelDhlEcom), 'LX9988776655443322')
assert.equal(clientCanonicalizeTrackingNumber('dhl', novelDhlEcom), 'LX9988776655443322')

console.log('✔ Courier tracking normalization passed.')

// 3. Future Arrival Date Guardrail & Past Courier Resolution
console.log('3. Testing date guardrails and auto-resolution...')
const now = new Date('2026-08-23T12:00:00Z')
const futureDate = new Date('2026-08-25T12:00:00Z')
const pastDate = new Date('2026-08-21T12:00:00Z')

// Future delivery with raw stage 'delivered' -> MUST downgrade to 'confirmed'
assert.equal(serverResolveEffectiveStage('delivered', futureDate, now), 'confirmed')
assert.equal(clientResolveEffectiveStage('delivered', futureDate, now), 'confirmed')

// Past courier with raw stage 'out_for_delivery' -> MUST auto-resolve to 'delivered'
assert.equal(serverResolveEffectiveStage('out_for_delivery', pastDate, now), 'delivered')
assert.equal(clientResolveEffectiveStage('out_for_delivery', pastDate, now), 'delivered')

// Past warehouse shipment with raw stage 'shipped' -> MUST STAY 'shipped'
assert.equal(serverResolveEffectiveStage('shipped', pastDate, now), 'shipped')
assert.equal(clientResolveEffectiveStage('shipped', pastDate, now), 'shipped')

console.log('✔ Date safety guardrails passed.')

// 4. Out-of-Order Timeline Consolidation Stress Test
console.log('4. Testing out-of-order timeline aggregation...')
const event1 = {
  id: 'ev-1',
  title: 'Order Confirmed',
  vendor: 'Amazon',
  threadKey: 'transaction:amazon:112-8472910-4829103',
  stage: 'confirmed',
  cost: '$89.99',
  itemSummary: 'Kindle Device',
  occurredAt: '2026-08-20T10:00:00Z',
  rawItem: { created_at: '2026-08-20T10:00:00Z' },
}
const event2 = {
  id: 'ev-2',
  title: 'Order Shipped',
  vendor: 'Amazon',
  threadKey: 'transaction:amazon:112-8472910-4829103',
  stage: 'shipped',
  cost: '$89.99',
  itemSummary: 'Kindle Device + Case',
  occurredAt: '2026-08-21T14:00:00Z',
  rawItem: { created_at: '2026-08-21T14:00:00Z' },
}
const event3 = {
  id: 'ev-3',
  title: 'Out for Delivery',
  vendor: 'Amazon',
  threadKey: 'transaction:amazon:112-8472910-4829103',
  stage: 'out_for_delivery',
  cost: null,
  itemSummary: 'Kindle Device + Case',
  occurredAt: '2026-08-22T08:00:00Z',
  rawItem: { created_at: '2026-08-22T08:00:00Z' },
}

// Consolidate arriving in reverse order [3, 2, 1]
const consolidatedRev = consolidateTransitItems([event3, event2, event1])
assert.equal(consolidatedRev.length, 1)
assert.equal(consolidatedRev[0].stage, 'out_for_delivery')
assert.equal(consolidatedRev[0].cost, '$89.99')
assert.equal(consolidatedRev[0].updateHistory.length, 3)

console.log('✔ Timeline consolidation passed.')

// 5. 0% Leakage into Action Queue
console.log('5. Testing 0% Action Queue leakage for passive items...')
const passiveItem = {
  id: 'passive-1',
  event_title: 'Your Nike order has shipped!',
  description: 'Nike order C0123456789 is on the way. Return eligible within 30 days.',
  source_type: 'gmail',
  attention_vendor: 'Nike',
  agency_level: 0,
  type: 'delivery',
  dismissed: false,
  priority: 1,
  created_at: '2026-08-23T10:00:00Z',
}

const split = splitActionableAndTransitItems([passiveItem])
assert.equal(split.actionableItems.length, 0, 'Passive item leaked into action queue!')
assert.equal(split.deliveryTransitItems.length, 1)
assert.equal(split.deliveryTransitItems[0].stage, 'shipped')

console.log('✔ 0% Action Queue leakage verified.')
console.log('--- ALL INDEPENDENT FORENSIC VERIFICATIONS PASSED CLEAN ---')
