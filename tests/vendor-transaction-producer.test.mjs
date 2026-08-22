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


