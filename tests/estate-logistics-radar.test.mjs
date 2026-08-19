import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  isDeliveryTransitItem,
  isPerishableDelivery,
  buildDeliveryTransitItem,
  stageStepIndex,
} from '../src/utils/vendorTransactions.ts'
import { splitActionableAndTransitItems } from '../src/utils/needsYouFeed.ts'

const turboCanvasView = readFileSync(
  new URL('../src/components/canvas/TurboCanvasView.tsx', import.meta.url),
  'utf8'
)
const estateLogisticsWidget = readFileSync(
  new URL('../src/components/canvas/widgets/EstateLogisticsWidget.tsx', import.meta.url),
  'utf8'
)

test('TurboCanvasView mounts EstateLogisticsWidget on the left pane and updates mobile tabs to Deliveries', () => {
  assert.match(turboCanvasView, /<EstateLogisticsWidget/)
  assert.match(turboCanvasView, /mobileTab === 'logistics'/)
  assert.match(turboCanvasView, /Deliveries \(\{totalDeliveries\}\)/)
  assert.doesNotMatch(turboCanvasView, /<NowAndNextWidget/)
})

test('EstateLogisticsWidget renders All, Arriving Today, In Transit, and Delivered filter tabs', () => {
  assert.match(estateLogisticsWidget, /setActiveTab\('all'\)/)
  assert.match(estateLogisticsWidget, /setActiveTab\('today'\)/)
  assert.match(estateLogisticsWidget, /setActiveTab\('in_transit'\)/)
  assert.match(estateLogisticsWidget, /setActiveTab\('delivered'\)/)
  assert.match(estateLogisticsWidget, /All \(\{allTransitItems\.length\}\)/)
  assert.match(estateLogisticsWidget, /Arriving Today \(\{todayItems\.length\}\)/)
  assert.match(estateLogisticsWidget, /In Transit \(\{inTransitItems\.length\}\)/)
  assert.match(estateLogisticsWidget, /Delivered \(\{deliveredItems\.length\}\)/)
})

test('EstateLogisticsWidget contains zero raw unicode emojis and uses clean Lucide SVG icons', () => {
  assert.doesNotMatch(estateLogisticsWidget, /[\u{1F300}-\u{1FAFF}]/u)
  assert.match(estateLogisticsWidget, /Truck/)
  assert.match(estateLogisticsWidget, /Package/)
  assert.match(estateLogisticsWidget, /ShoppingCart/)
})

test('splitActionableAndTransitItems cleanly separates actionable reminders from passive courier deliveries', () => {
  const items = [
    {
      id: 'item-1',
      type: 'forms',
      description: 'Sign Bak Middle School Yellow Sheet waiver',
      created_at: '2026-08-19T10:00:00Z',
    },
    {
      id: 'item-2',
      type: 'delivery',
      description: 'Your Amazon package with skate guards is out for delivery today',
      attention_vendor: 'Amazon',
      attention_stage: 'out_for_delivery',
      created_at: '2026-08-19T11:00:00Z',
    },
    {
      id: 'item-3',
      type: 'payment',
      description: 'InHome delivery of Whole Foods grocery order including organic strawberries',
      attention_vendor: 'Walmart',
      attention_stage: 'shipped',
      created_at: '2026-08-19T12:00:00Z',
    },
  ]

  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems(items)
  assert.equal(actionableItems.length, 1)
  assert.equal(actionableItems[0].id, 'item-1')

  assert.equal(deliveryTransitItems.length, 2)
  assert.equal(deliveryTransitItems[0].vendor, 'Walmart')
  assert.equal(deliveryTransitItems[1].vendor, 'Amazon')
})

test('isPerishableDelivery accurately detects grocery and cold storage shipments', () => {
  assert.equal(
    isPerishableDelivery({
      id: '1',
      type: 'delivery',
      description: 'InHome delivery of Whole Foods grocery order',
      created_at: '',
    }),
    true
  )
  assert.equal(
    isPerishableDelivery({
      id: '2',
      type: 'delivery',
      description: 'Amazon shipment: stainless steel screws',
      created_at: '',
    }),
    false
  )
})

test('stageStepIndex maps progression stages accurately', () => {
  assert.equal(stageStepIndex('confirmed'), 0)
  assert.equal(stageStepIndex('shipped'), 1)
  assert.equal(stageStepIndex('out_for_delivery'), 2)
  assert.equal(stageStepIndex('delivered'), 3)
})

test('EstateLogisticsWidget provides 1-tap single-instance dismissal with X button', () => {
  assert.match(estateLogisticsWidget, /onDismissDelivery\?: \(item: PrepItem\) => void/)
  assert.match(estateLogisticsWidget, /handleDismissItem/)
  assert.match(estateLogisticsWidget, /Dismiss this delivery/)
  assert.match(turboCanvasView, /onDismissDelivery=\{handleCompletePrep\}/)
})

test('InHome grocery delivery windows are classified as delivery transit items and never calendar appointments', async () => {
  const { detectSuggestedActionBundle, detectSuggestedEvent } = await import('../src/utils/actionInspectionSynthesis.ts')

  const inHomeDeliveryItem = {
    id: 'prep-walmart-inhome-1',
    type: 'appointment',
    source_type: 'gmail',
    source_pattern_key: 'event_suggestion',
    description: 'Suggested Appointment: InHome delivery at 3209 Washington Rd West Palm Beach, FL 33405 — Delivery of InHome order including C2O Pure Coconut Water and 22 other items. Delivery window is 2pm – 6pm.',
    event_title: 'InHome delivery',
    event_date: '2026-08-19T19:00:00.000Z',
    created_at: '2026-08-19T14:00:00Z',
  }

  // 1. Must be recognized as a delivery transit item
  assert.equal(isDeliveryTransitItem(inHomeDeliveryItem), true)
  assert.equal(isPerishableDelivery(inHomeDeliveryItem), true)

  // 2. Must NOT produce suggested action bundles or calendar appointments
  assert.equal(detectSuggestedActionBundle(inHomeDeliveryItem), null)
  assert.equal(detectSuggestedEvent(inHomeDeliveryItem), null)

  // 3. Must be routed to deliveryTransitItems by splitActionableAndTransitItems
  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([inHomeDeliveryItem])
  assert.equal(actionableItems.length, 0)
  assert.equal(deliveryTransitItems.length, 1)
  assert.equal(deliveryTransitItems[0].vendor, 'Walmart')
  assert.equal(deliveryTransitItems[0].isPerishable, true)
})

test('Vendor order pricing/hold confirmation is routed to delivery transit items with cost attached and excluded from action queue', () => {
  const pricingItem = {
    id: 'prep-walmart-hold-1',
    type: 'payment',
    source_type: 'gmail',
    description: 'The final charge for your Walmart order will be updated once finalized. The temporary hold is $138.65.',
    event_title: 'The final charge for your Walmart order',
    created_at: '2026-08-19T14:30:00Z',
  }

  // 1. Must be recognized as a delivery transit item
  assert.equal(isDeliveryTransitItem(pricingItem), true)

  const deliveryTransit = buildDeliveryTransitItem(pricingItem)
  assert.equal(deliveryTransit.vendor, 'Walmart')
  assert.equal(deliveryTransit.cost, '$138.65')

  // 2. Must be routed to deliveryTransitItems, NOT actionableItems
  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([pricingItem])
  assert.equal(actionableItems.length, 0)
  assert.equal(deliveryTransitItems.length, 1)
  assert.equal(deliveryTransitItems[0].cost, '$138.65')
})

test('Multiple delivery emails for the same vendor order (tracking notice + pricing hold) are combined into a single delivery card', () => {
  const deliveryNoticeItem = {
    id: 'prep-walmart-inhome-1',
    type: 'appointment',
    source_type: 'gmail',
    source_pattern_key: 'event_suggestion',
    description: 'Suggested Appointment: InHome delivery at 3209 Washington Rd West Palm Beach, FL 33405 — Delivery of InHome order including C2O Pure Coconut Water and 22 other items. Delivery window is 2pm – 6pm.',
    event_title: 'Delivery of InHome order',
    attention_vendor: '3209 Washington Rd West Palm Beach, FL 33405',
    attention_stage: 'out_for_delivery',
    event_date: '2026-08-19T19:00:00.000Z',
    created_at: '2026-08-19T14:00:00Z',
  }

  const pricingHoldItem = {
    id: 'prep-walmart-hold-1',
    type: 'payment',
    source_type: 'gmail',
    description: 'The final charge for your Walmart order will be updated once finalized. The temporary hold is $138.65.',
    event_title: 'The final charge for your Walmart order',
    attention_vendor: 'Walmart',
    created_at: '2026-08-19T14:30:00Z',
  }

  // Both items passed to splitActionableAndTransitItems
  const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([
    deliveryNoticeItem,
    pricingHoldItem,
  ])

  // 1. Both routed away from Action Queue
  assert.equal(actionableItems.length, 0)

  // 2. Must be combined into exactly ONE unified Delivery card
  assert.equal(deliveryTransitItems.length, 1)

  const combined = deliveryTransitItems[0]
  assert.equal(combined.vendor, 'Walmart')
  assert.equal(combined.stage, 'out_for_delivery')
  assert.equal(combined.cost, '$138.65')
  assert.equal(combined.isPerishable, true)
  assert.match(combined.etaDisplay || '', /2pm [–-] 6pm/)
})

