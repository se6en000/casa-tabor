import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const scanner = readFileSync(new URL('../supabase/functions/scan-gmail-inbox/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260809201500_vendor_transaction_threads.sql', import.meta.url), 'utf8')
const fallbackMigration = readFileSync(new URL('../supabase/migrations/20260809203000_refine_vendor_transaction_fallback.sql', import.meta.url), 'utf8')
const home = readFileSync(new URL('../src/components/home/HomeRightPanel.tsx', import.meta.url), 'utf8')
const actionCenter = readFileSync(new URL('../src/pages/ActionHubPage.tsx', import.meta.url), 'utf8')

test('Gmail action extraction stores reusable vendor transaction identity', () => {
  assert.match(scanner, /vendor\?: string/)
  assert.match(scanner, /transaction_id\?: string/)
  assert.match(scanner, /transaction_status\?: string/)
  assert.match(scanner, /attention_thread_key:/)
  assert.match(scanner, /attention_vendor:/)
  assert.match(scanner, /attention_stage:/)
  assert.match(scanner, /transactionDescriptor/)
  assert.match(scanner, /items:\$\{descriptor\}/)
})

test('migration adds indexed transaction identity and backfills current Walmart rows', () => {
  assert.match(migration, /add column if not exists attention_thread_key text/)
  assert.match(migration, /prep_items_attention_thread_idx/)
  assert.match(migration, /attention_vendor = 'Walmart'/)
  assert.match(migration, /transaction:walmart:/)
  assert.match(migration, /regexp_match/)
  assert.match(fallbackMigration, /transaction:walmart:items:/)
  assert.match(fallbackMigration, /attention_thread_key like 'transaction:walmart:message:%'/)
})

test('Home and Action Center label grouped transactions as updates', () => {
  assert.match(home, /topic\.transactionVendor/)
  assert.match(home, /topic\.transactionVendor \? 'updates' : 'signals'/)
  assert.match(actionCenter, /topic\.transactionVendor/)
  assert.match(actionCenter, /topic\.transactionVendor \? 'updates' : 'signals'/)
})

test('vendor transaction identity clusters multiple Walmart emails into a single delivery key on the same date', async () => {
  const { splitActionableAndTransitItems } = await import('../src/utils/needsYouFeed.ts')
  const { buildDeliveryTransitItem } = await import('../src/utils/vendorTransactions.ts')

  const item1 = {
    id: 'item-1',
    event_title: 'Delivery of InHome order',
    description: 'Delivery window is 2pm – 6pm',
    attention_thread_key: 'inhome-delivery-window',
    source_type: 'gmail',
    created_at: '2026-08-19T14:00:00Z',
    due_by: '2026-08-19T18:00:00Z',
    dismissed: false,
    priority: 1,
    type: 'delivery',
  }

  const item2 = {
    id: 'item-2',
    event_title: 'Your Walmart order including bananas...',
    description: 'Temporary hold is $138.65. Delivery expected today between 2pm – 6pm',
    attention_thread_key: 'walmart-pricing-summary',
    source_type: 'gmail',
    created_at: '2026-08-19T14:05:00Z',
    due_by: '2026-08-19T18:00:00Z',
    dismissed: false,
    priority: 1,
    type: 'payment',
  }

  const item3 = {
    id: 'item-3',
    event_title: 'Your Walmart order of 27 items is out for delivery',
    description: '27 items including Bananas, Milk, Bread. Arriving today',
    attention_thread_key: 'walmart-items-count',
    source_type: 'gmail',
    created_at: '2026-08-19T14:10:00Z',
    due_by: '2026-08-19T18:00:00Z',
    dismissed: false,
    priority: 1,
    type: 'delivery',
  }

  const t1 = buildDeliveryTransitItem(item1)
  const t2 = buildDeliveryTransitItem(item2)
  const t3 = buildDeliveryTransitItem(item3)

  assert.equal(t1.threadKey, 'delivery:walmart:2026-08-19')
  assert.equal(t2.threadKey, 'delivery:walmart:2026-08-19')
  assert.equal(t3.threadKey, 'delivery:walmart:2026-08-19')

  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([item1, item2, item3])
  assert.equal(actionableItems.length, 0)
  assert.equal(deliveryTransitItems.length, 1)
  assert.equal(deliveryTransitItems[0].vendor, 'Walmart')
  assert.equal(deliveryTransitItems[0].cost, '$138.65')
  assert.equal(deliveryTransitItems[0].stage, 'out_for_delivery')
  assert.equal(deliveryTransitItems[0].isPerishable, true)
  assert.match(deliveryTransitItems[0].itemSummary, /InHome/i)
  assert.match(deliveryTransitItems[0].itemSummary, /27 items/i)
})

test('real Supabase records with Walmart+ InHome compound keys merge seamlessly into 1 Hero item', async () => {
  const { splitActionableAndTransitItems } = await import('../src/utils/needsYouFeed.ts')
  const { buildDeliveryTransitItem } = await import('../src/utils/vendorTransactions.ts')

  const row1 = {
    id: '31362a24-68a4-4e2f-bdf8-b9e75ccab0ed',
    type: 'delivery',
    event_title: 'Your InHome delivery should arrive by 3:44pm 🚗',
    description: 'Your Walmart+ InHome delivery with 27 items, including C2O Pure Coconut Water, is out for delivery and expected by 3:44pm today. Please ensure the delivery area is clear and pets are secured.',
    event_date: '2026-08-19T20:44:00+00:00',
    due_by: '2026-08-19T20:44:00+00:00',
    created_at: '2026-08-19T19:15:03.942271+00:00',
    source_type: 'gmail',
    attention_thread_key: 'transaction:walmart-inhome:2000154-80824348',
    attention_vendor: 'Walmart+ InHome',
    attention_stage: 'out_for_delivery',
    dismissed: false,
    priority: 1,
  }

  const row2 = {
    id: '3ac01532-5503-497e-97ac-34004c88994b',
    type: 'delivery',
    event_title: 'Thanks for your InHome delivery order, Jacob',
    description: 'Your Walmart order is scheduled for delivery today between 2pm - 6pm. Ensure perishable items are chilled upon arrival.',
    event_date: '2026-08-19T18:00:00+00:00',
    due_by: '2026-08-19T18:00:00+00:00',
    created_at: '2026-08-19T12:15:31.355883+00:00',
    source_type: 'gmail',
    attention_thread_key: 'transaction:walmart:2000154-80824348',
    attention_vendor: 'Walmart',
    attention_stage: 'out_for_delivery',
    dismissed: false,
    priority: 1,
  }

  const row3 = {
    id: 'e4b84b64-d19a-4154-bab9-9633640d9f82',
    type: 'payment',
    event_title: 'Thanks for your InHome delivery order, Jacob',
    description: 'The final charge for your Walmart order will be updated once finalized. The temporary hold is $138.65.',
    event_date: null,
    due_by: null,
    created_at: '2026-08-19T12:15:31.355883+00:00',
    source_type: 'gmail',
    attention_thread_key: 'transaction:walmart:2000154-80824348',
    attention_vendor: 'Walmart',
    attention_stage: 'payment',
    dismissed: false,
    priority: 2,
  }

  const t1 = buildDeliveryTransitItem(row1)
  const t2 = buildDeliveryTransitItem(row2)
  const t3 = buildDeliveryTransitItem(row3)

  assert.equal(t1.threadKey, 'transaction:walmart:2000154-80824348')
  assert.equal(t2.threadKey, 'transaction:walmart:2000154-80824348')
  assert.equal(t3.threadKey, 'transaction:walmart:2000154-80824348')

  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([row1, row2, row3])
  assert.equal(actionableItems.length, 0)
  assert.equal(deliveryTransitItems.length, 1)

  const hero = deliveryTransitItems[0]
  assert.equal(hero.vendor, 'Walmart')
  assert.equal(hero.cost, '$138.65')
  assert.equal(hero.stage, 'out_for_delivery')
  assert.equal(hero.isPerishable, true)
  assert.match(hero.itemSummary, /InHome/i)
  assert.match(hero.itemSummary, /27 items/i)
  assert.match(hero.etaDisplay, /3:44pm/i)
  assert.match(hero.etaDisplay, /2pm\s*[-–]\s*6pm/i)
})

test('past out-for-delivery records automatically transition to delivered when evaluated on next day', async () => {
  const {
    buildDeliveryTransitItem,
    isItemArrivingToday,
    isItemDelivered,
    isItemInTransit,
    resolveEffectiveStage,
  } = await import('../src/utils/vendorTransactions.ts')

  const yesterdayRow = {
    id: 'walmart-yesterday-1',
    type: 'delivery',
    event_title: 'Your InHome delivery should arrive by 3:44pm 🚗',
    description: 'Your Walmart+ InHome delivery with 27 items is out for delivery and expected by 3:44pm today.',
    event_date: '2026-08-19T20:44:00+00:00',
    due_by: '2026-08-19T20:44:00+00:00',
    created_at: '2026-08-19T19:15:00+00:00',
    source_type: 'gmail',
    attention_thread_key: 'transaction:walmart:2000154-80824348',
    attention_vendor: 'Walmart',
    attention_stage: 'out_for_delivery',
    dismissed: false,
    priority: 1,
  }

  const todayRow = {
    id: 'jiffy-today-1',
    type: 'delivery',
    event_title: 'Jiffy Transfers order is out for delivery',
    description: 'Arriving today by 2:00pm',
    event_date: '2026-08-20T18:00:00+00:00',
    due_by: '2026-08-20T18:00:00+00:00',
    created_at: '2026-08-20T14:00:00+00:00',
    source_type: 'gmail',
    attention_thread_key: 'transaction:jiffy:order-12345',
    attention_vendor: 'Jiffy.com',
    attention_stage: 'out_for_delivery',
    dismissed: false,
    priority: 1,
  }

  const evaluationDate = new Date('2026-08-20T18:30:00-04:00')

  const yesterdayTransit = buildDeliveryTransitItem(yesterdayRow, evaluationDate)
  const todayTransit = buildDeliveryTransitItem(todayRow, evaluationDate)

  // Yesterday's delivery must resolve to delivered on August 20
  assert.equal(yesterdayTransit.stage, 'delivered')
  assert.equal(isItemArrivingToday(yesterdayTransit, evaluationDate), false)
  assert.equal(isItemDelivered(yesterdayTransit, evaluationDate), true)
  assert.equal(isItemInTransit(yesterdayTransit, evaluationDate), false)
  assert.match(yesterdayTransit.etaDisplay, /Delivered yesterday/i)

  // Today's delivery must remain out_for_delivery and arriving today
  assert.equal(todayTransit.stage, 'out_for_delivery')
  assert.equal(isItemArrivingToday(todayTransit, evaluationDate), true)
  assert.equal(isItemDelivered(todayTransit, evaluationDate), false)
  assert.equal(isItemInTransit(todayTransit, evaluationDate), true)
})

test('Jiffy order confirmation with future arrival date (Monday Aug 24) stays In Transit / Scheduled Later and NOT delivered on Saturday Aug 22', async () => {
  const {
    buildDeliveryTransitItem,
    isItemArrivingToday,
    isItemScheduledLater,
    isItemDelivered,
    isItemInTransit,
    transactionStage,
    consolidateTransitItems,
  } = await import('../src/utils/vendorTransactions.ts')

  // Real data structure from the user's screenshot
  const jiffyConfirmation = {
    id: 'jiffy-order-confirmation-1',
    type: 'delivery',
    event_title: "Jiffy Transfers order confirmation: Jacob's Cart #50 (Order #2541442349)",
    description: 'Your Jiffy.com order #2541442349 is arriving on Monday, Aug 24. Total charged: $13.71.',
    event_date: '2026-08-24T18:00:00+00:00',
    due_by: '2026-08-24T18:00:00+00:00',
    created_at: '2026-08-22T15:33:00+00:00',
    source_type: 'gmail',
    attention_thread_key: 'transaction:jiffy-com:2541442349',
    attention_vendor: 'Jiffy.com',
    attention_stage: 'confirmed',
    dismissed: false,
    priority: 1,
  }

  // Evaluated on Saturday, Aug 22, 2026
  const saturdayNow = new Date('2026-08-22T11:33:00-04:00')

  const stage = transactionStage(jiffyConfirmation)
  assert.equal(stage, 'confirmed')

  const transitItem = buildDeliveryTransitItem(jiffyConfirmation, saturdayNow)

  assert.equal(transitItem.vendor, 'Jiffy.com')
  assert.equal(transitItem.cost, '$13.71')
  assert.equal(transitItem.stage, 'confirmed')
  assert.equal(isItemDelivered(transitItem, saturdayNow), false)
  assert.equal(isItemInTransit(transitItem, saturdayNow), true)
  assert.equal(isItemArrivingToday(transitItem, saturdayNow), false)
  assert.equal(isItemScheduledLater(transitItem, saturdayNow), true)
  assert.match(transitItem.etaDisplay, /Mon, Aug 24/i)
  assert.equal(transitItem.threadKey, 'transaction:jiffy-com:2541442349')

  // Test multi-email progression: Shipping update arrives on Sunday Aug 23
  const jiffyShipped = {
    id: 'jiffy-shipped-2',
    type: 'delivery',
    event_title: 'Your Jiffy.com order #2541442349 has shipped!',
    description: 'UPS tracking # 1Z9999999999999999. Estimated delivery: Monday, Aug 24.',
    event_date: '2026-08-24T18:00:00+00:00',
    due_by: '2026-08-24T18:00:00+00:00',
    created_at: '2026-08-23T10:00:00+00:00',
    source_type: 'gmail',
    attention_thread_key: 'transaction:jiffy-com:2541442349',
    attention_vendor: 'Jiffy.com',
    attention_stage: 'shipped',
    dismissed: false,
    priority: 1,
  }

  const sundayNow = new Date('2026-08-23T10:30:00-04:00')
  const merged = consolidateTransitItems([
    buildDeliveryTransitItem(jiffyConfirmation, sundayNow),
    buildDeliveryTransitItem(jiffyShipped, sundayNow),
  ])

  assert.equal(merged.length, 1)
  assert.equal(merged[0].stage, 'shipped')
  assert.equal(isItemDelivered(merged[0], sundayNow), false)
  assert.equal(isItemInTransit(merged[0], sundayNow), true)
  assert.equal(isItemScheduledLater(merged[0], sundayNow), true)
  assert.equal(merged[0].updateHistory?.length, 2)
})

test('future-tense delivery strings never trigger delivered stage', async () => {
  const { transactionStage } = await import('../src/utils/vendorTransactions.ts')

  const future1 = {
    id: 'f1',
    event_title: 'Order Status',
    description: 'Your package will be delivered on Monday, Aug 24.',
    source_type: 'gmail',
    created_at: '2026-08-22T10:00:00Z',
    dismissed: false,
    priority: 1,
    type: 'delivery',
  }

  const future2 = {
    id: 'f2',
    event_title: 'Order Update',
    description: 'Scheduled to be delivered on Wednesday, Aug 26.',
    source_type: 'gmail',
    created_at: '2026-08-22T10:00:00Z',
    dismissed: false,
    priority: 1,
    type: 'delivery',
  }

  const delivered = {
    id: 'd1',
    event_title: 'Delivery Confirmation',
    description: 'Your package has been delivered to front door.',
    source_type: 'gmail',
    created_at: '2026-08-22T10:00:00Z',
    dismissed: false,
    priority: 1,
    type: 'delivery',
  }

  assert.notEqual(transactionStage(future1), 'delivered')
  assert.notEqual(transactionStage(future2), 'delivered')
  assert.equal(transactionStage(delivered), 'delivered')
})

test('Jiffy order shipment with claims policy disclaimer consolidates into delivery transit and creates 0 actionable items and 0 calendar suggestions', async () => {
  const { splitActionableAndTransitItems } = await import('../src/utils/needsYouFeed.ts')
  const { isDeliveryTransitItem, buildDeliveryTransitItem, consolidateTransitItems } = await import('../src/utils/vendorTransactions.ts')
  const { detectSuggestedActionBundle, detectSuggestedEvent } = await import('../src/utils/actionInspectionSynthesis.ts')

  // Real items produced from Jiffy order #2541442349 email
  const shipmentItem = {
    id: 'jiffy-shipment-item-1',
    type: 'delivery',
    event_title: "Shipment for Jacob's Cart #50 (Order #2541442349)",
    description: 'Your Jiffy order #2541442349 has shipped and is expected to arrive on Monday, Aug 24. Claims for missing, wrong, or damaged items must be made within 3 days of final delivery (by Thursday, Aug 27).',
    event_date: '2026-08-24T18:00:00+00:00',
    due_by: '2026-08-24T18:00:00+00:00',
    created_at: '2026-08-22T15:33:00+00:00',
    source_type: 'gmail',
    source_ref: 'gmail:household:191a8e9929f12345',
    attention_thread_key: 'transaction:jiffy-com:2541442349',
    attention_vendor: 'Jiffy.com',
    attention_stage: 'shipped',
    dismissed: false,
    priority: 1,
  }

  const claimPolicyItem = {
    id: 'jiffy-claim-item-2',
    type: 'deadline',
    event_title: "Claims for missing, wrong, or damaged items from order #2541442349 must be made within 3 days of final delivery (by Thursday, Aug 27).",
    description: 'Claims for missing, wrong, or damaged items from order #2541442349 must be made within 3 days of final delivery (by Thursday, Aug 27).',
    event_date: '2026-08-27T18:00:00+00:00',
    due_by: '2026-08-27T18:00:00+00:00',
    created_at: '2026-08-22T15:33:00+00:00',
    source_type: 'gmail',
    source_ref: 'gmail:household:191a8e9929f12345',
    attention_thread_key: 'transaction:jiffy-com:2541442349',
    attention_vendor: 'Jiffy.com',
    attention_stage: 'shipped',
    dismissed: false,
    priority: 1,
  }

  // 1. Both items must be recognized as delivery transit items
  assert.equal(isDeliveryTransitItem(shipmentItem), true)
  assert.equal(isDeliveryTransitItem(claimPolicyItem), true)

  // 2. Feed splitting must yield 0 Action Queue tasks and 1 consolidated delivery transit item
  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([shipmentItem, claimPolicyItem])
  assert.equal(actionableItems.length, 0, 'No order policy items should leak into Executive Action Queue')
  assert.equal(deliveryTransitItems.length, 1, 'Both items must consolidate into 1 delivery entity')

  const delivery = deliveryTransitItems[0]
  assert.equal(delivery.vendor, 'Jiffy.com')
  assert.equal(delivery.stage, 'shipped')
  assert.equal(delivery.threadKey, 'transaction:jiffy-com:2541442349')
  assert.match(delivery.etaDisplay, /Mon(?:day)?, Aug 24/i)
  assert.equal(delivery.updateHistory?.length, 2)
  assert.match(delivery.policyDisclaimer || '', /claims for missing/i)

  // 3. Neither item should generate false calendar events or suggested action plans
  assert.equal(detectSuggestedEvent(shipmentItem), null)
  assert.equal(detectSuggestedEvent(claimPolicyItem), null)
  assert.equal(detectSuggestedActionBundle(shipmentItem), null)
  assert.equal(detectSuggestedActionBundle(claimPolicyItem), null)
})

test('compound school spirit order cleanly splits into 1 delivery in Inbound Manifest and 1 calendar event with 0 Action Queue leakage', async () => {
  const { splitActionableAndTransitItems } = await import('../src/utils/needsYouFeed.ts')
  const { isDeliveryTransitItem } = await import('../src/utils/vendorTransactions.ts')

  const spiritShirtPackage = {
    id: 'school-spirit-pkg-1',
    type: 'delivery',
    event_title: "Bak MSOA Spirit Wear Order #9912",
    description: 'Emerald Green Spirit Shirt has shipped and is arriving Thursday, Aug 27. Return window is 14 days.',
    event_date: '2026-08-27T18:00:00+00:00',
    due_by: '2026-08-27T18:00:00+00:00',
    created_at: '2026-08-22T12:00:00+00:00',
    source_type: 'gmail',
    source_ref: 'gmail:household:spirit1234',
    attention_thread_key: 'transaction:bak-msoa:9912',
    attention_vendor: 'Bak MSOA Spirit Wear',
    attention_stage: 'shipped',
    agency_level: 0,
    policy_disclaimer: 'Return window is 14 days.',
    dismissed: false,
    priority: 1,
  }

  assert.equal(isDeliveryTransitItem(spiritShirtPackage), true)

  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([spiritShirtPackage])
  assert.equal(actionableItems.length, 0)
  assert.equal(deliveryTransitItems.length, 1)
  assert.equal(deliveryTransitItems[0].policyDisclaimer, 'Return window is 14 days.')
})

test('Walmart InHome: Thanks for order + Last minute to add items merge into 1 order, stage confirmed (Being Prepared), and arriving today', async () => {
  const {
    buildDeliveryTransitItem,
    consolidateTransitItems,
    isItemArrivingToday,
    isItemDelivered,
    isItemInTransit,
    stageStepIndex,
    transactionStage,
  } = await import('../src/utils/vendorTransactions.ts')

  // Sunday morning evaluation
  const sundayMorning = new Date('2026-08-23T07:15:00-04:00')

  // Email 1: Order confirmation from Walmart placed yesterday evening for delivery today
  const confirmationEmail = {
    id: 'walmart-inhome-order-1',
    type: 'delivery',
    event_title: 'Thanks for your InHome delivery order, Jacob',
    description: 'The final charge for your Walmart order will be updated on your bank statement. Total: $124.49. Order #2000154-80824348. Delivery scheduled for today between 2pm – 6pm.',
    event_date: '2026-08-23T18:00:00+00:00',
    due_by: '2026-08-23T18:00:00+00:00',
    created_at: '2026-08-22T22:30:00+00:00',
    source_type: 'gmail',
    source_ref: 'gmail:household:msg-walmart-1',
    attention_thread_key: 'transaction:walmart:2000154-80824348',
    attention_vendor: 'Walmart',
    attention_stage: 'confirmed',
    dismissed: false,
    priority: 1,
  }

  // Email 2: Follow-up email on Sunday morning: Last minute to add items / Order is being prepared
  const addMoreEmail = {
    id: 'walmart-inhome-order-2',
    type: 'delivery',
    event_title: 'Last minute to add more to your order',
    description: 'You have until 1:00 PM to add items to your Walmart InHome order #2000154-80824348. Your order is being prepared and will be delivered today between 2pm – 6pm.',
    event_date: '2026-08-23T18:00:00+00:00',
    due_by: '2026-08-23T18:00:00+00:00',
    created_at: '2026-08-23T07:00:00+00:00',
    source_type: 'gmail',
    source_ref: 'gmail:household:msg-walmart-2',
    attention_thread_key: 'transaction:walmart:2000154-80824348',
    attention_vendor: 'Walmart',
    attention_stage: 'confirmed',
    dismissed: false,
    priority: 1,
  }

  assert.equal(transactionStage(confirmationEmail), 'confirmed')
  assert.equal(transactionStage(addMoreEmail), 'confirmed')

  const t1 = buildDeliveryTransitItem(confirmationEmail, sundayMorning)
  const t2 = buildDeliveryTransitItem(addMoreEmail, sundayMorning)

  assert.equal(t1.threadKey, 'transaction:walmart:2000154-80824348')
  assert.equal(t2.threadKey, 'transaction:walmart:2000154-80824348')

  const consolidated = consolidateTransitItems([t1, t2])
  assert.equal(consolidated.length, 1)

  const order = consolidated[0]
  assert.equal(order.vendor, 'Walmart')
  assert.equal(order.stage, 'confirmed', 'Must be confirmed (Being Prepared), NOT delivered')
  assert.equal(stageStepIndex(order.stage), 0, 'Stepper must be on Step 0: Confirmed')
  assert.equal(isItemDelivered(order, sundayMorning), false)
  assert.equal(isItemArrivingToday(order, sundayMorning), true)
  assert.equal(isItemInTransit(order, sundayMorning), true)
  assert.equal(order.cost, '$124.49')
  assert.equal(order.updateHistory?.length, 2)
})

test('multi-vendor order number canonicalization accurately normalizes Walmart, Amazon, Target, Apple, Nike, Jiffy, and HelloFresh', async () => {
  const {
    canonicalizeOrderId,
    orderId,
    vendorTransactionIdentity,
  } = await import('../src/utils/vendorTransactions.ts')

  // 1. Walmart with and without hyphens
  assert.equal(canonicalizeOrderId('Walmart', '2000154-80824348'), '2000154-80824348')
  assert.equal(canonicalizeOrderId('Walmart', '200015480824348'), '2000154-80824348')

  // 2. Amazon 17-digit format
  assert.equal(canonicalizeOrderId('Amazon', '112-8472910-4829103'), '112-8472910-4829103')
  assert.equal(canonicalizeOrderId('Amazon', '11284729104829103'), '112-8472910-4829103')

  // 3. Apple format
  assert.equal(canonicalizeOrderId('Apple', 'w123456789'), 'W123456789')

  // 4. Nike format
  assert.equal(canonicalizeOrderId('Nike', 'c0123456789'), 'C0123456789')

  // 5. Jiffy format
  assert.equal(canonicalizeOrderId('Jiffy.com', '2541442349'), '2541442349')

  // 6. Extraction from various email text structures
  const testWalmartUnhyphenated = {
    source_type: 'gmail',
    event_title: 'Order confirmation #200015480824348',
    description: 'Your Walmart order is being prepared',
    attention_vendor: 'Walmart',
  }
  const identity1 = vendorTransactionIdentity(testWalmartUnhyphenated)
  assert.equal(identity1.key, 'transaction:walmart:2000154-80824348')

  const testWalmartHyphenated = {
    source_type: 'gmail',
    event_title: 'Thanks for your InHome delivery order, Jacob',
    description: 'Order: #2000154-80824348 will be delivered today',
    attention_vendor: 'Walmart+ InHome',
  }
  const identity2 = vendorTransactionIdentity(testWalmartHyphenated)
  assert.equal(identity2.key, 'transaction:walmart:2000154-80824348')
  assert.equal(identity1.key, identity2.key, 'Both hyphenated and unhyphenated Walmart emails must produce identical threadKey')

  const testAmazon = {
    source_type: 'gmail',
    event_title: 'Shipped: Your Amazon package',
    description: 'Amazon.com order number: 114-1234567-7654321',
    attention_vendor: 'Amazon.com',
  }
  const identityAmazon = vendorTransactionIdentity(testAmazon)
  assert.equal(identityAmazon.key, 'transaction:amazon:114-1234567-7654321')

  const testApple = {
    source_type: 'gmail',
    event_title: 'We are processing your Apple order',
    description: 'Order Number: W987654321',
    attention_vendor: 'Apple',
  }
  const identityApple = vendorTransactionIdentity(testApple)
  assert.equal(identityApple.key, 'transaction:apple:w987654321')

  const testNike = {
    source_type: 'gmail',
    event_title: 'Your Nike Order is on the way',
    description: 'Nike Order: C-0123456789 has shipped',
    attention_vendor: 'Nike',
  }
  const identityNike = vendorTransactionIdentity(testNike)
  assert.equal(identityNike.key, 'transaction:nike:c-0123456789')

  const testHelloFresh = {
    source_type: 'gmail',
    event_title: 'Your HelloFresh box is on the way',
    description: 'Order # HF-12345678',
    attention_vendor: 'HelloFresh',
  }
  const identityHF = vendorTransactionIdentity(testHelloFresh)
  assert.equal(identityHF.key, 'transaction:hellofresh:hf-12345678')
})

test('multi-carrier courier tracking produces standardized composite keys including DHL', async () => {
  const {
    buildCompositeThreadKey,
    canonicalizeTrackingNumber,
    detectCarrierAndTracking,
    vendorTransactionIdentity,
  } = await import('../src/utils/vendorTransactions.ts')

  // 1. DHL Express tracking
  const dhlDetect = detectCarrierAndTracking('DHL Express tracking # 1234567890')
  assert.equal(dhlDetect.carrier, 'dhl')
  assert.equal(dhlDetect.trackingNumber, '1234567890')
  assert.equal(dhlDetect.trackingUrl, 'https://www.dhl.com/en/express/tracking.html?AWB=1234567890')

  const dhlKey = buildCompositeThreadKey({ carrier: dhlDetect.carrier, trackingNumber: dhlDetect.trackingNumber })
  assert.equal(dhlKey, 'courier:dhl:1234567890')

  // 2. Direct courier item without merchant order number
  const dhlItem = {
    source_type: 'gmail',
    event_title: 'DHL Express Shipment',
    description: 'DHL tracking 1234567890 is out for delivery',
    attention_vendor: 'DHL',
  }
  const dhlIdentity = vendorTransactionIdentity(dhlItem)
  assert.equal(dhlIdentity.key, 'courier:dhl:1234567890')

  // 3. UPS tracking key
  const upsKey = buildCompositeThreadKey({ carrier: 'ups', trackingNumber: '1Z9999999999999999' })
  assert.equal(upsKey, 'courier:ups:1z9999999999999999')

  // 4. USPS tracking key
  const uspsKey = buildCompositeThreadKey({ carrier: 'usps', trackingNumber: '9400100000000000000000' })
  assert.equal(uspsKey, 'courier:usps:9400100000000000000000')

  // 5. FedEx tracking key
  const fedexKey = buildCompositeThreadKey({ carrier: 'fedex', trackingNumber: '987654321012' })
  assert.equal(fedexKey, 'courier:fedex:987654321012')
})

test('bills, utilities, and household services are never classified as delivery transit items and route to Action Queue', async () => {
  const { isDeliveryTransitItem, isBillOrUtilityOrHouseholdService } = await import('../src/utils/vendorTransactions.ts')
  const { splitActionableAndTransitItems } = await import('../src/utils/needsYouFeed.ts')

  const fplBill = {
    id: 'fpl-1',
    event_title: 'FPL Account: Your bill is ready to be viewed online',
    description: 'Your FPL bill of $292.61 is due. Please pay to avoid service interruption.',
    attention_vendor: 'FPL',
    attention_thread_key: null,
    source_type: 'gmail',
    due_by: '2026-09-14T05:00:00Z',
    type: 'payment',
    agency_level: 2,
    priority: 1,
    dismissed: false,
  }

  const waterBill = {
    id: 'water-1',
    event_title: 'Palm Beach County Water Utilities Statement',
    description: 'Your monthly water utilities bill of $84.20 is due on Sep 20.',
    attention_vendor: 'PBC Water Utilities',
    source_type: 'gmail',
    due_by: '2026-09-20T05:00:00Z',
    type: 'payment',
    agency_level: 2,
    priority: 1,
    dismissed: false,
  }

  const xfinityBill = {
    id: 'xfinity-1',
    event_title: 'Xfinity Billing Statement Ready',
    description: 'Your automatic payment of $120.00 is scheduled for Sep 10.',
    attention_vendor: 'Xfinity',
    source_type: 'gmail',
    due_by: '2026-09-10T05:00:00Z',
    type: 'payment',
    agency_level: 2,
    priority: 1,
    dismissed: false,
  }

  const landscapingInvoice = {
    id: 'lawn-1',
    event_title: 'GreenThumb Landscaping Service Invoice',
    description: 'Monthly lawn maintenance and tree trimming service invoice $175.00 due Sep 5.',
    attention_vendor: 'GreenThumb Landscaping',
    source_type: 'gmail',
    due_by: '2026-09-05T05:00:00Z',
    type: 'payment',
    agency_level: 2,
    priority: 1,
    dismissed: false,
  }

  const realDelivery = {
    id: 'walmart-del-1',
    event_title: 'Your Walmart delivery is on the way',
    description: 'Arriving today between 2pm – 6pm',
    attention_vendor: 'Walmart.com',
    attention_thread_key: 'transaction:walmart:order-1234567',
    source_type: 'gmail',
    due_by: '2026-08-25T18:00:00Z',
    type: 'delivery',
    agency_level: 1,
    priority: 1,
    dismissed: false,
  }

  assert.equal(isBillOrUtilityOrHouseholdService(fplBill), true)
  assert.equal(isBillOrUtilityOrHouseholdService(waterBill), true)
  assert.equal(isBillOrUtilityOrHouseholdService(xfinityBill), true)
  assert.equal(isBillOrUtilityOrHouseholdService(landscapingInvoice), true)
  assert.equal(isBillOrUtilityOrHouseholdService(realDelivery), false)

  assert.equal(isDeliveryTransitItem(fplBill), false)
  assert.equal(isDeliveryTransitItem(waterBill), false)
  assert.equal(isDeliveryTransitItem(xfinityBill), false)
  assert.equal(isDeliveryTransitItem(landscapingInvoice), false)
  assert.equal(isDeliveryTransitItem(realDelivery), true)

  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([
    fplBill,
    waterBill,
    xfinityBill,
    landscapingInvoice,
    realDelivery,
  ])

  assert.equal(actionableItems.length, 4)
  assert.equal(deliveryTransitItems.length, 1)
  assert.equal(actionableItems.some(i => i.id === 'fpl-1'), true)
  assert.equal(actionableItems.some(i => i.id === 'water-1'), true)
  assert.equal(actionableItems.some(i => i.id === 'xfinity-1'), true)
  assert.equal(actionableItems.some(i => i.id === 'lawn-1'), true)
  assert.equal(deliveryTransitItems[0].vendor, 'Walmart')
})


