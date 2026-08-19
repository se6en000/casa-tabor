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

