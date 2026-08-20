import test from 'node:test'
import assert from 'node:assert/strict'
import { getMemberRoleLabel } from '../src/design-system/memberColors.mjs'

// Mock household roster representing Casa Tabor
const mockFamilyMembers = [
  { id: 'parent-jake-id', name: 'Jake', full_name: 'Jake Tabor', role: 'parent', can_drive: true, is_admin: true, show_on_home_sidebar: true },
  { id: 'parent-kelly-id', name: 'Kelly', full_name: 'Kelly Tabor', role: 'parent', can_drive: true, is_admin: false, show_on_home_sidebar: true },
  { id: 'child-liv-id', name: 'Liv', full_name: 'Liv Tabor', role: 'child', can_drive: false, is_admin: false, show_on_home_sidebar: true },
  { id: 'child-emme-id', name: 'Emme', full_name: 'Emme Tabor', role: 'child', can_drive: false, is_admin: false, show_on_home_sidebar: true },
  { id: 'child-owen-id', name: 'Owen', full_name: 'Owen Tabor', role: 'child', can_drive: false, is_admin: false, show_on_home_sidebar: true },
  { id: 'meta-tabor-family-id', name: 'Tabor Family', full_name: 'Tabor Family Feed', role: 'child', can_drive: false, is_admin: false, show_on_home_sidebar: false },
  { id: 'caregiver-giselle-id', name: 'Giselle', full_name: 'Giselle Caregiver', role: 'caregiver', can_drive: true, is_admin: false, show_on_home_sidebar: true },
  { id: 'pet-milo-id', name: 'Milo', full_name: 'Milo the Dog', role: 'child', can_drive: false, is_admin: false, show_on_home_sidebar: false },
]

/**
 * Replicates the server-side name matching logic implemented in enrich-event.
 */
function resolveServerDetectedPrimary(titleStr, descriptionStr, familyMembers, defaultOwnerName = 'Jake') {
  const activeMembers = familyMembers.filter((m) => (m.show_on_home_sidebar ?? true) && m.name.toLowerCase() !== 'tabor family')
  const titleSegments = (titleStr ?? '').split('|').map((s) => s.trim())
  let serverDetectedPrimary = null

  // 1. Prefix segment matching (e.g. "Jake | Clean house")
  for (const seg of titleSegments) {
    const matched = activeMembers.find(
      (m) => m.name.toLowerCase() === seg.toLowerCase() || m.full_name?.toLowerCase() === seg.toLowerCase()
    )
    if (matched && !serverDetectedPrimary) {
      serverDetectedPrimary = matched.name
      break
    }
  }

  // 2. Word boundary matching in title & description (e.g. "Owen Soccer", "Dinner with Kelly")
  if (!serverDetectedPrimary) {
    const combinedSearchText = `${titleStr ?? ''} ${descriptionStr ?? ''}`
    for (const m of activeMembers) {
      const escaped = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const wordRegex = new RegExp(`\\b${escaped}\\b`, 'i')
      if (wordRegex.test(combinedSearchText)) {
        serverDetectedPrimary = m.name
        break
      }
      if (m.full_name) {
        const escapedFull = m.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const fullRegex = new RegExp(`\\b${escapedFull}\\b`, 'i')
        if (fullRegex.test(combinedSearchText)) {
          serverDetectedPrimary = m.name
          break
        }
      }
    }
  }

  return serverDetectedPrimary || defaultOwnerName
}

/**
 * Replicates whoLine generation logic in enrich-event.
 */
function generateWhoLine(event, familyMembers, defaultOwner = 'Jake') {
  const activeMembers = familyMembers.filter((m) => (m.show_on_home_sidebar ?? true) && m.name.toLowerCase() !== 'tabor family')
  const titleAndDesc = `${event.title ?? ''} ${event.description ?? ''}`
  const mentionedMembers = []
  for (const m of activeMembers) {
    const escaped = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const wordRegex = new RegExp(`\\b${escaped}\\b`, 'i')
    if (wordRegex.test(titleAndDesc)) {
      mentionedMembers.push(m.name)
    }
  }
  const linkedMembers = (event.event_members ?? []).map((m) => m.family_members?.name).filter(Boolean)
  const allIdentified = [...new Set([...mentionedMembers, ...linkedMembers])]
  return allIdentified.length > 0 ? allIdentified.join(', ') : `${defaultOwner} (only)`
}

test('primary attendee detection by pipe prefix', () => {
  const primary = resolveServerDetectedPrimary('Jake | Clean the house', '', mockFamilyMembers)
  assert.equal(primary, 'Jake')
})

test('primary attendee detection by natural title mention without delimiters', () => {
  assert.equal(resolveServerDetectedPrimary('Owen Soccer Practice', '', mockFamilyMembers), 'Owen')
  assert.equal(resolveServerDetectedPrimary('Jake doctor appointment', '', mockFamilyMembers), 'Jake')
  assert.equal(resolveServerDetectedPrimary('Dinner with Kelly', '', mockFamilyMembers), 'Kelly')
  assert.equal(resolveServerDetectedPrimary('Clean the house Jake', '', mockFamilyMembers), 'Jake')
  assert.equal(resolveServerDetectedPrimary('Emme violin lesson', '', mockFamilyMembers), 'Emme')
})

test('primary attendee falls back to default admin when no name matches', () => {
  const primary = resolveServerDetectedPrimary('Schedule me to clean the house', '', mockFamilyMembers, 'Jake')
  assert.equal(primary, 'Jake')
})

test('whoLine does not default to "whole family" on chores/general events', () => {
  const event = { title: 'Schedule me to clean the house', description: '' }
  const who = generateWhoLine(event, mockFamilyMembers, 'Jake')
  assert.equal(who, 'Jake (only)')
  assert.notEqual(who, 'whole family')
})

test('whoLine includes only mentioned members when explicitly named', () => {
  const event = { title: 'Owen and Liv karate class', description: '' }
  const who = generateWhoLine(event, mockFamilyMembers, 'Jake')
  assert.equal(who, 'Liv, Owen')
})

test('filtering family members by show_on_home_sidebar removes feed and non-sidebar members', () => {
  const visible = mockFamilyMembers.filter((m) => (m.show_on_home_sidebar ?? true))
  const names = visible.map((m) => m.name)

  assert.ok(names.includes('Jake'))
  assert.ok(names.includes('Kelly'))
  assert.ok(names.includes('Liv'))
  assert.ok(names.includes('Emme'))
  assert.ok(names.includes('Owen'))
  assert.ok(names.includes('Giselle'))
  assert.ok(!names.includes('Tabor Family'), 'Tabor Family feed should be excluded')
  assert.ok(!names.includes('Milo'), 'Milo (show_on_home_sidebar: false) should be excluded')
})

test('attendee popover preserves already selected member even if sidebar toggle is off', () => {
  const selectedMemberIds = ['pet-milo-id']
  const visible = mockFamilyMembers.filter((m) => (m.show_on_home_sidebar ?? true) || selectedMemberIds.includes(m.id))
  const names = visible.map((m) => m.name)

  assert.ok(names.includes('Milo'), 'Already selected Milo should remain visible')
  assert.ok(!names.includes('Tabor Family'), 'Unselected non-sidebar member should remain hidden')
})

test('getMemberRoleLabel correctly derives profile roles and driver capabilities', () => {
  const giselle = mockFamilyMembers.find((m) => m.name === 'Giselle')
  assert.equal(getMemberRoleLabel(giselle), 'Caregiver · Driver')

  const nonDriverCaregiver = { role: 'caregiver', can_drive: false }
  assert.equal(getMemberRoleLabel(nonDriverCaregiver), 'Caregiver')

  const jake = mockFamilyMembers.find((m) => m.name === 'Jake')
  assert.equal(getMemberRoleLabel(jake), 'Parent · Driver')

  const nonDriverParent = { role: 'parent', can_drive: false }
  assert.equal(getMemberRoleLabel(nonDriverParent), 'Parent')

  const liv = mockFamilyMembers.find((m) => m.name === 'Liv')
  assert.equal(getMemberRoleLabel(liv), 'Child')

  const teenDriver = { role: 'child', can_drive: true }
  assert.equal(getMemberRoleLabel(teenDriver), 'Child · Driver')
})
