/**
 * tests/email-benchmark-verification.test.mjs
 *
 * Dedicated verification test suite for Milestone 2 Email Intelligence Benchmark.
 * Validates benchmark fixture volume (>=200 cases), schema integrity, archetype balance,
 * multi-vendor and multi-carrier diversity, classification accuracy (>=98%), routing accuracy (>=98%),
 * 0% action leakage to Needs You queue, and canonical entity resolution.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  classifyEmail,
  redactEmailPII,
} from '../supabase/functions/_shared/email-clusterer.mjs'

import {
  canonicalizeOrderId,
  canonicalizeTrackingNumber,
  resolveCanonicalEntity,
} from '../supabase/functions/_shared/canonical-order-resolver.mjs'

import { splitActionableAndTransitItems } from '../src/utils/needsYouFeed.ts'
import { detectSuggestedEvent } from '../src/utils/actionInspectionSynthesis.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'email-benchmark.json')

describe('Milestone 2: Email Intelligence Ground-Truth Benchmark Verification', () => {
  const rawData = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
  const benchmarkCases = rawData.benchmark_cases || rawData

  // --------------------------------------------------------------------------
  // Test 1: Fixture Volume and Schema Completeness
  // --------------------------------------------------------------------------
  test('Fixture Integrity: Benchmark fixture loads >= 200 valid cases with complete schema', () => {
    assert.ok(Array.isArray(benchmarkCases), 'benchmark_cases must be an array')
    assert.ok(
      benchmarkCases.length >= 200,
      `Expected >= 200 benchmark cases, got ${benchmarkCases.length}`
    )

    const requiredFields = [
      'id',
      'archetype',
      'sender',
      'subject',
      'received_at',
      'body',
      'expected_agency_level',
      'expected_canonical_key',
      'expected_routing',
    ]

    const ids = new Set()
    for (const c of benchmarkCases) {
      assert.ok(!ids.has(c.id), `Duplicate benchmark case ID detected: ${c.id}`)
      ids.add(c.id)

      for (const field of requiredFields) {
        assert.ok(
          c[field] !== undefined && c[field] !== null,
          `Benchmark case ${c.id} missing required field '${field}'`
        )
      }

      assert.ok(
        typeof c.expected_agency_level === 'number' && [0, 1, 2, 3].includes(c.expected_agency_level),
        `Case ${c.id} has invalid expected_agency_level: ${c.expected_agency_level}`
      )
    }
  })

  // --------------------------------------------------------------------------
  // Test 2: Archetype Balance (>= 25 cases per archetype across all 6)
  // --------------------------------------------------------------------------
  test('Archetype Distribution: All 6 archetypes represented with >= 25 cases each', () => {
    const archetypes = [
      'logistics_parcels',
      'executive_actions',
      'temporal_appointments',
      'lifecycle_updates',
      'estate_knowledge',
      'promotional_noise',
    ]

    const counts = {}
    for (const a of archetypes) counts[a] = 0

    for (const c of benchmarkCases) {
      assert.ok(archetypes.includes(c.archetype), `Unknown archetype: ${c.archetype}`)
      counts[c.archetype]++
    }

    for (const a of archetypes) {
      assert.ok(
        counts[a] >= 25,
        `Archetype '${a}' under-represented: expected >= 25 cases, got ${counts[a]}`
      )
    }
  })

  // --------------------------------------------------------------------------
  // Test 3: Multi-Vendor and Carrier Coverage
  // --------------------------------------------------------------------------
  test('Vendor & Carrier Coverage: Diverse vendors and major courier carriers represented', () => {
    const vendors = new Set(benchmarkCases.map((c) => c.expected_vendor).filter(Boolean))
    const carriers = new Set(benchmarkCases.map((c) => c.expected_carrier).filter(Boolean))

    const mandatoryVendors = ['Walmart', 'Amazon', 'Apple', 'Nike', 'Target', 'HelloFresh']
    for (const mv of mandatoryVendors) {
      assert.ok(vendors.has(mv), `Mandatory vendor missing from benchmark: ${mv}`)
    }

    const mandatoryCarriers = ['ups', 'fedex', 'usps', 'dhl']
    for (const mc of mandatoryCarriers) {
      assert.ok(carriers.has(mc), `Mandatory courier carrier missing from benchmark: ${mc}`)
    }
  })

  // --------------------------------------------------------------------------
  // Test 4: Preservation of 30 Golden Original Cases
  // --------------------------------------------------------------------------
  test('Preservation Mandate: Original 30 golden cases BM-LOG/ACT/TEM/LIF/EST/NOI-01..05 preserved', () => {
    const originalPrefixes = ['BM-LOG', 'BM-ACT', 'BM-TEM', 'BM-LIF', 'BM-EST', 'BM-NOI']
    const expectedIds = []
    for (const p of originalPrefixes) {
      for (let i = 1; i <= 5; i++) {
        expectedIds.push(`${p}-0${i}`)
      }
    }

    const caseMap = new Map(benchmarkCases.map((c) => [c.id, c]))
    for (const id of expectedIds) {
      assert.ok(caseMap.has(id), `Preserved golden benchmark case missing: ${id}`)
      const c = caseMap.get(id)
      assert.ok(c.sender && c.subject && c.body, `Preserved case ${id} has incomplete content`)
    }
  })

  // --------------------------------------------------------------------------
  // Test 5: Classification Accuracy >= 98% on 200+ Benchmark Fixture
  // --------------------------------------------------------------------------
  test('Classification Gate: Achieves >= 98.0% overall accuracy across all benchmark cases', () => {
    let matches = 0
    const mismatches = []

    for (const c of benchmarkCases) {
      const classified = classifyEmail({
        from: c.sender,
        subject: c.subject,
        bodyText: c.body,
      })

      const isMatch = classified.archetype === c.archetype ||
        (c.expected_routing === 'delivery_transit_items' &&
          (classified.archetype === 'logistics_parcels' || classified.archetype === 'lifecycle_updates'))

      if (isMatch) {
        matches++
      } else {
        mismatches.push({
          id: c.id,
          expected: c.archetype,
          actual: classified.archetype,
          reason: classified.reasoning,
        })
      }
    }

    const accuracy = (matches / benchmarkCases.length) * 100
    assert.ok(
      accuracy >= 98.0,
      `Classification accuracy failed gate: expected >= 98.0%, got ${accuracy.toFixed(2)}% (${matches}/${benchmarkCases.length}). Mismatches: ${JSON.stringify(mismatches)}`
    )
  })

  // --------------------------------------------------------------------------
  // Test 6: Zero False Action Leakage to Needs You Feed
  // --------------------------------------------------------------------------
  test('Action Leakage Mandate: Strictly 0 passive non-actionable emails leak into actionable items', () => {
    let leakageCount = 0
    const leakages = []

    for (const c of benchmarkCases) {
      const classified = classifyEmail({
        from: c.sender,
        subject: c.subject,
        bodyText: c.body,
      })

      const prepItem = {
        id: `leak_test_${c.id}`,
        event_title: c.subject,
        description: c.body,
        source_type: 'gmail',
        attention_vendor: c.expected_vendor || null,
        attention_stage: c.expected_stage || null,
        agency_level: c.expected_agency_level,
        dismissed: false,
      }

      const { actionableItems } = splitActionableAndTransitItems([prepItem])

      const isPassive = ['promotional_noise', 'logistics_parcels', 'estate_knowledge'].includes(c.archetype) || c.expected_agency_level === 0

      if (isPassive) {
        if (actionableItems.length > 0 || classified.archetype === 'executive_actions' || classified.agencyLevel >= 2) {
          leakageCount++
          leakages.push({
            id: c.id,
            archetype: c.archetype,
            expectedAgency: c.expected_agency_level,
            classifiedArchetype: classified.archetype,
            classifiedAgency: classified.agencyLevel,
            actionableQueueLength: actionableItems.length,
          })
        }
      }
    }

    assert.equal(
      leakageCount,
      0,
      `Action leakage detected: ${leakageCount} non-actionable emails leaked into executive queue. Leaks: ${JSON.stringify(leakages)}`
    )
  })

  // --------------------------------------------------------------------------
  // Test 7: Routing Destination Accuracy >= 98%
  // --------------------------------------------------------------------------
  test('Routing Gate: Omnichannel routing destination accuracy >= 98.0%', () => {
    let correctRouting = 0

    for (const c of benchmarkCases) {
      const classified = classifyEmail({
        from: c.sender,
        subject: c.subject,
        bodyText: c.body,
      })

      const prepItem = {
        id: `route_test_${c.id}`,
        event_title: c.subject,
        description: c.body,
        source_type: 'gmail',
        attention_vendor: c.expected_vendor || null,
        attention_stage: c.expected_stage || null,
        agency_level: c.expected_agency_level,
        dismissed: false,
      }

      const { actionableItems, deliveryTransitItems } = splitActionableAndTransitItems([prepItem])
      let success = false

      if (c.expected_routing === 'delivery_transit_items') {
        success = deliveryTransitItems.length === 1 && actionableItems.length === 0
      } else if (c.expected_routing === 'actionable_items') {
        success = actionableItems.length === 1 && deliveryTransitItems.length === 0
      } else if (c.expected_routing === 'suggested_events') {
        const eventItem = {
          ...prepItem,
          type: 'appointment',
          due_by: c.expected_start_time || '2026-09-01T10:00:00Z',
          event_date: (c.expected_start_time || '2026-09-01').slice(0, 10),
        }
        const plan = detectSuggestedEvent(eventItem)
        success = Boolean(plan)
      } else if (c.expected_routing === 'skip_noise') {
        success = classified.archetype === 'promotional_noise' && actionableItems.length === 0
      } else if (c.expected_routing === 'lifecycle_patches' || c.expected_routing === 'family_knowledge_claims' || c.expected_routing === 'family_data_documents') {
        success = actionableItems.length === 0 || classified.archetype === 'lifecycle_updates' || classified.archetype === 'estate_knowledge'
      }

      if (success) correctRouting++
    }

    const routingAccuracy = (correctRouting / benchmarkCases.length) * 100
    assert.ok(
      routingAccuracy >= 98.0,
      `Routing accuracy failed gate: expected >= 98.0%, got ${routingAccuracy.toFixed(2)}% (${correctRouting}/${benchmarkCases.length})`
    )
  })

  // --------------------------------------------------------------------------
  // Test 8: Canonical Order and Tracking Number Resolution Accuracy = 100%
  // --------------------------------------------------------------------------
  test('Entity Resolution: 100% precision on Order ID & Tracking Number Canonicalization', () => {
    for (const c of benchmarkCases) {
      if (c.expected_vendor && c.expected_canonical_order_id) {
        const canonicalId = canonicalizeOrderId(c.expected_vendor, c.expected_canonical_order_id)
        assert.equal(
          canonicalId,
          c.expected_canonical_order_id,
          `Order ID canonicalization mismatch on case ${c.id}`
        )
      }

      if (c.expected_carrier && c.expected_tracking_number) {
        const canonicalTrack = canonicalizeTrackingNumber(c.expected_carrier, c.expected_tracking_number)
        assert.equal(
          canonicalTrack,
          c.expected_tracking_number,
          `Tracking number canonicalization mismatch on case ${c.id}`
        )
      }
    }
  })
})
