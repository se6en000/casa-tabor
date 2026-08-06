import assert from 'node:assert/strict'
import test from 'node:test'

import { rankDirectorySuggestions } from '../src/utils/directorySuggestions.ts'
import { findSavedContactMatch } from '../src/utils/savedContactMatch.ts'

const candidates = [
  { id: '1', primary: 'Dr. Sarah Chen', aliases: ['Dr. Chen', 'pediatrician'], secondary: '(561) 555-0100' },
  { id: '2', primary: 'Springmeyer Family', aliases: ['the Springmeyers'], secondary: '' },
  { id: '3', primary: 'AC Repair Co.', aliases: [], secondary: '(561) 555-0199' },
]

test('rankDirectorySuggestions ranks an exact name match first', () => {
  const results = rankDirectorySuggestions(candidates, 'Dr. Sarah Chen')
  assert.equal(results[0]?.id, '1')
})

test('rankDirectorySuggestions matches on alias when the name differs', () => {
  const results = rankDirectorySuggestions(candidates, 'pediatrician')
  assert.equal(results[0]?.id, '1')
})

test('rankDirectorySuggestions matches on phone/secondary field', () => {
  const results = rankDirectorySuggestions(candidates, '555-0199')
  assert.equal(results[0]?.id, '3')
})

test('rankDirectorySuggestions excludes candidates that do not match any field', () => {
  const results = rankDirectorySuggestions(candidates, 'no such name or phone')
  assert.deepEqual(results, [])
})

test('rankDirectorySuggestions returns everything up to the limit for an empty query', () => {
  const results = rankDirectorySuggestions(candidates, '', 2)
  assert.equal(results.length, 2)
})

const savedContacts = [
  { id: 'c1', name: 'Coach Danny', aliases: ['Coach D'], phone: '(561) 555-0140', email: null },
  { id: 'c2', name: 'Dr. Sarah Chen', aliases: [], phone: '5615550100', email: 'schen@clinic.com' },
]

test('findSavedContactMatch matches an existing contact by exact phone regardless of formatting', () => {
  const match = findSavedContactMatch(savedContacts, 'Sarah Chen MD', '(561) 555-0100', null)
  assert.equal(match?.id, 'c2')
})

test('findSavedContactMatch matches an existing contact by exact email', () => {
  const match = findSavedContactMatch(savedContacts, 'S. Chen', null, 'schen@clinic.com')
  assert.equal(match?.id, 'c2')
})

test('findSavedContactMatch matches an existing contact by name or alias when no phone/email given', () => {
  const match = findSavedContactMatch(savedContacts, 'Coach D', null, null)
  assert.equal(match?.id, 'c1')
})

test('findSavedContactMatch returns null when nothing matches', () => {
  const match = findSavedContactMatch(savedContacts, 'Someone New', '555-9999', null)
  assert.equal(match, null)
})


// ── EventEditSheet wiring: contact_name uses SmartContactInput ──
import { readFileSync as readFileSyncEditSheet } from 'node:fs'
const eventEditSheetSource = readFileSyncEditSheet(
  new URL('../src/components/calendar/EventEditSheet.tsx', import.meta.url),
  'utf8',
)

test('EventEditSheet renders SmartContactInput for the contact_name field instead of a plain Input', () => {
  assert.match(eventEditSheetSource, /import SmartContactInput from '\.\/SmartContactInput'/)
  assert.match(eventEditSheetSource, /field === 'contact_name'/)
  assert.match(eventEditSheetSource, /<SmartContactInput/)
})

test('EventEditSheet auto-fills contact_phone when a saved contact is selected', () => {
  assert.match(eventEditSheetSource, /onSelect=\{[\s\S]{0,200}contact_phone/)
})

// ── SavedPlacesSettingsPage wiring: PlaceForm/ContactForm warn before creating a duplicate ──
import { readFileSync as readFileSyncSettingsPage } from 'node:fs'
const savedPlacesSettingsSource = readFileSyncSettingsPage(
  new URL('../src/pages/SavedPlacesSettingsPage.tsx', import.meta.url),
  'utf8',
)

test('SavedPlacesSettingsPage imports rankDirectorySuggestions for duplicate lookup', () => {
  assert.match(savedPlacesSettingsSource, /import \{ rankDirectorySuggestions, resolveDirectoryPlaceSave, type DirectoryPlaceSelection \} from '\.\.\/utils\/directorySuggestions'/)
})

test('PlaceForm warns about possible existing matches before creating a new place', () => {
  assert.match(savedPlacesSettingsSource, /function PlaceForm\(\{ initial, places, onSave, onCancel, onEditExisting, saving \}: PlaceFormProps\)/)
  assert.match(savedPlacesSettingsSource, /rankDirectorySuggestions\(places\.map/)
})

test('ContactForm warns about possible existing matches before creating a new contact', () => {
  assert.match(savedPlacesSettingsSource, /function ContactForm\(\{ initial, places, contacts, onSave, onCancel, onEditExisting, onCreatePlace, saving \}: ContactFormProps\)/)
  assert.match(savedPlacesSettingsSource, /rankDirectorySuggestions\(contacts\.map/)
})

// ── Bug fix: PlaceForm/ContactForm remount on record switch so "Use existing" syncs ──
test('PlaceForm is keyed by the editing record id so switching records remounts its local state', () => {
  assert.match(savedPlacesSettingsSource, /<PlaceForm\s*\n\s*key=\{placeMode\.type === 'edit' \? placeMode\.place\.id : 'new'\}/)
})

test('ContactForm is keyed by the editing record id so switching records remounts its local state', () => {
  assert.match(savedPlacesSettingsSource, /<ContactForm\s*\n\s*key=\{contactMode\.type === 'edit' \? contactMode\.contact\.id : 'new'\}/)
})

// ── findExactDirectoryMatch: catches exact-name dupes even from the "add new" path ──
import { findExactDirectoryMatch, resolveDirectoryPlaceSave } from '../src/utils/directorySuggestions.ts'

const placeCandidates = [
  { id: 'p1', primary: "Alice's House", aliases: ['Alice'], secondary: '8255 West Lake Drive' },
  { id: 'p2', primary: 'Lake Charleston Park', aliases: [], secondary: '7001 Charleston Shores Blvd' },
]

test('findExactDirectoryMatch returns the candidate whose name or alias exactly equals the query', () => {
  assert.equal(findExactDirectoryMatch(placeCandidates, 'alice')?.id, 'p1')
  assert.equal(findExactDirectoryMatch(placeCandidates, "Alice's House")?.id, 'p1')
})

test('findExactDirectoryMatch returns null when nothing matches exactly', () => {
  assert.equal(findExactDirectoryMatch(placeCandidates, 'Alice Cooper'), null)
  assert.equal(findExactDirectoryMatch(placeCandidates, ''), null)
})

test('resolveDirectoryPlaceSave links to the selected existing place as-is', () => {
  const result = resolveDirectoryPlaceSave({ mode: 'existing', placeId: 'p2' }, placeCandidates)
  assert.deepEqual(result, { action: 'link', placeId: 'p2' })
})

test('resolveDirectoryPlaceSave creates and links a genuinely new place', () => {
  const result = resolveDirectoryPlaceSave(
    { mode: 'new', input: { name: 'Cooper House', address: '178 Greenwood Ave' } },
    placeCandidates,
  )
  assert.deepEqual(result, { action: 'create-and-link', createInput: { name: 'Cooper House', address: '178 Greenwood Ave' } })
})

test('resolveDirectoryPlaceSave links instead of creating when the typed new-place name exactly matches an existing one', () => {
  const result = resolveDirectoryPlaceSave(
    { mode: 'new', input: { name: "Alice's House", address: '' } },
    placeCandidates,
  )
  assert.deepEqual(result, { action: 'link', placeId: 'p1' })
})

test('resolveDirectoryPlaceSave does nothing when no selection was made', () => {
  assert.deepEqual(resolveDirectoryPlaceSave(null, placeCandidates), { action: 'none' })
})

// ── DirectoryPlaceInput: shared search-or-create combobox ──
import { readFileSync as readFileSyncDPI } from 'node:fs'
const directoryPlaceInputSource = readFileSyncDPI(
  new URL('../src/components/shared/DirectoryPlaceInput.tsx', import.meta.url),
  'utf8',
)

test('DirectoryPlaceInput offers to add the typed query as a new place when nothing matches', () => {
  assert.match(directoryPlaceInputSource, /Add &quot;.*as a new place/)
})

test('DirectoryPlaceInput uses rankDirectorySuggestions to search saved places', () => {
  assert.match(directoryPlaceInputSource, /rankDirectorySuggestions/)
})

test('DirectoryPlaceInput emits a DirectoryPlaceSelection on choose/create', () => {
  assert.match(directoryPlaceInputSource, /onChange\(\{ mode: 'existing'/)
  assert.match(directoryPlaceInputSource, /onChange\(\{ mode: 'new'/)
})

// ── ContactForm wired to DirectoryPlaceInput (Phase 2) ──
test('ContactForm uses DirectoryPlaceInput for the primary place field and resolves the save via resolveDirectoryPlaceSave', () => {
  assert.match(savedPlacesSettingsSource, /<DirectoryPlaceInput/)
  assert.match(savedPlacesSettingsSource, /resolveDirectoryPlaceSave\(/)
  assert.match(savedPlacesSettingsSource, /onCreatePlace/)
})

// ── DirectoryPlaceInput: Google-verified addresses, not manual entry (dupe root cause) ──
test('DirectoryPlaceInput searches Google Places directly on the main typed query (not a separate manual step)', () => {
  assert.match(directoryPlaceInputSource, /shouldSearchGoogle = focused && normalizedQuery\.length >= 3/)
})

test('DirectoryPlaceInput surfaces Google-verified address suggestions inline, tagged as verified', () => {
  assert.match(directoryPlaceInputSource, /source: 'google'/)
  assert.match(directoryPlaceInputSource, /Verified address/)
})

test('DirectoryPlaceInput only allows unverified manual entry as an explicit, clearly-labeled fallback', () => {
  assert.match(directoryPlaceInputSource, /without a verified address/)
})

// ── DirectoryPlaceInput: split Google-verified address into street/city/state/zip ──
test('DirectoryPlaceInput carries Google-parsed street/city/state/zip through to the new-place selection instead of dumping the full formatted address into one field', () => {
  assert.match(directoryPlaceInputSource, /street\?: string \| null/)
  assert.match(directoryPlaceInputSource, /city\?: string \| null/)
  assert.match(directoryPlaceInputSource, /state\?: string \| null/)
  assert.match(directoryPlaceInputSource, /zip\?: string \| null/)
  assert.match(directoryPlaceInputSource, /address: pendingNew\.street/)
  assert.match(directoryPlaceInputSource, /city: pendingNew\.city/)
  assert.match(directoryPlaceInputSource, /state: pendingNew\.state/)
  assert.match(directoryPlaceInputSource, /zip: pendingNew\.zip/)
})
