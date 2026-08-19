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
