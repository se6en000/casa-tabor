import test from 'node:test'
import assert from 'node:assert/strict'
import {
  detectInboundCategory,
  resolveCanonicalEntity,
} from '../supabase/functions/_shared/canonical-order-resolver.mjs'

test('detectInboundCategory - identifies pre-orders and school items', () => {
  const yearbookItem = {
    title: 'Bak Eighth Grade Students - Purchase your 8th grade Bak Yearbook Ad',
    description: 'Purchase your yearbook at Walsworth Yearbooks portal by Sep 30',
    vendor: 'Walsworth',
  }
  assert.equal(detectInboundCategory(yearbookItem), 'preorder')

  const photoItem = {
    title: 'Strawbridge Studios - School Pictures & Portrait Packages',
    description: 'Fall pictures order form due next Friday',
    vendor: 'Strawbridge',
  }
  assert.equal(detectInboundCategory(photoItem), 'preorder')

  const uniformItem = {
    title: 'Soccer Team Uniform Pre-Order',
    description: 'CustomInk spirit pack and jersey pre-order',
  }
  assert.equal(detectInboundCategory(uniformItem), 'preorder')
})

test('detectInboundCategory - identifies digital subscriptions and services', () => {
  const arloItem = {
    title: 'Arlo Technologies, Inc.: $21.29 USD',
    description: 'Monthly cloud storage subscription payment receipt',
    vendor: 'Arlo',
  }
  assert.equal(detectInboundCategory(arloItem), 'digital')

  const ticketsItem = {
    title: 'Ticketmaster: Your digital tickets are ready',
    description: 'Concert e-tickets in your account',
  }
  assert.equal(detectInboundCategory(ticketsItem), 'digital')
})

test('detectInboundCategory - identifies in-store and school pickups', () => {
  const pickupItem = {
    title: 'Your order is ready for in-store pickup',
    description: 'Pick up at Target West Palm Beach customer service desk',
    vendor: 'Target',
  }
  assert.equal(detectInboundCategory(pickupItem), 'pickup')
})

test('detectInboundCategory - defaults standard couriers and groceries to physical', () => {
  const walmartItem = {
    title: 'Thanks for your InHome delivery order, Jacob',
    description: 'Walmart delivery arriving between 8:00am and 10:00am',
    vendor: 'Walmart',
  }
  assert.equal(detectInboundCategory(walmartItem), 'physical')

  const amazonItem = {
    title: 'Shipped: 1 Home item',
    description: 'Your package is on the way via UPS tracking 1Z9999999999999999',
    vendor: 'Amazon',
  }
  assert.equal(detectInboundCategory(amazonItem), 'physical')
})

test('resolveCanonicalEntity - attaches correct inboundCategory and zero agency level', () => {
  const result = resolveCanonicalEntity({
    title: 'Walsworth Yearbook Ad #2024-BAK-88',
    description: 'Your 8th grade Bak yearbook order is confirmed. Amount: $75.00',
    vendor: 'Walsworth',
  })
  assert.equal(result.inboundCategory, 'preorder')
  assert.equal(result.agencyLevel, 0)
  assert.equal(result.cost, '$75.00')
})
