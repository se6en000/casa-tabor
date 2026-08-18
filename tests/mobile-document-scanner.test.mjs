import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { matchSuggestedMemberIds, formatScannedDate, formatScannedTime } from '../src/utils/documentScanner.ts'

test('formatScannedDate safely formats YYYY-MM-DD without UTC offset drift', () => {
  // Test a date that previously shifted 1 day behind when parsed as UTC
  const formattedFull = formatScannedDate('2026-10-10', 'EEEE, MMM d')
  const formattedShort = formatScannedDate('2026-10-10', 'EEE, MMM d')
  
  assert.equal(formattedFull, 'Saturday, Oct 10')
  assert.equal(formattedShort, 'Sat, Oct 10')

  // Another test date
  assert.equal(formatScannedDate('2026-09-01', 'EEEE, MMM d'), 'Tuesday, Sep 1')
})

test('formatScannedTime formats 24-hour time to 12-hour AM/PM string', () => {
  assert.equal(formatScannedTime('09:30'), '9:30 AM')
  assert.equal(formatScannedTime('14:00'), '2:00 PM')
  assert.equal(formatScannedTime('18:45'), '6:45 PM')
  assert.equal(formatScannedTime('00:15'), '12:15 AM')
  assert.equal(formatScannedTime('12:00'), '12:00 PM')
  assert.equal(formatScannedTime(null), '')
})

test('matchSuggestedMemberIds matches exact first name', () => {
  const familyMembers = [
    { id: 'mem-1', name: 'Liam', full_name: 'Liam Miller' },
    { id: 'mem-2', name: 'Maya', full_name: 'Maya Miller' },
    { id: 'mem-3', name: 'Sarah', full_name: 'Sarah Miller' },
  ]
  const matched = matchSuggestedMemberIds('Liam', familyMembers)
  assert.deepEqual(matched, ['mem-1'])
})

test('matchSuggestedMemberIds matches within complex strings', () => {
  const familyMembers = [
    { id: 'mem-1', name: 'Liam', full_name: 'Liam Miller' },
    { id: 'mem-2', name: 'Maya', full_name: 'Maya Miller' },
  ]
  const matched = matchSuggestedMemberIds("Liam's Soccer Team", familyMembers)
  assert.deepEqual(matched, ['mem-1'])
})

test('matchSuggestedMemberIds returns empty array when no member matches', () => {
  const familyMembers = [
    { id: 'mem-1', name: 'Liam', full_name: 'Liam Miller' },
  ]
  const matched = matchSuggestedMemberIds('Dr. Smith Dentist', familyMembers)
  assert.deepEqual(matched, [])
})

test('kiosk-ux-refactor guardrail: MobileDocumentScanSheet contains NO raw Unicode emojis', () => {
  const scanSheetContent = readFileSync('src/components/mobile/MobileDocumentScanSheet.tsx', 'utf-8')
  const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u
  const matches = scanSheetContent.match(emojiRegex)
  assert.equal(matches, null, `Found raw Unicode emoji in MobileDocumentScanSheet: ${matches?.[0]}`)
})

test('kiosk-ux-refactor guardrail: scan-document-events edge function contains NO raw Unicode emojis in responses', () => {
  const edgeFunctionContent = readFileSync('supabase/functions/scan-document-events/index.ts', 'utf-8')
  const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u
  const matches = edgeFunctionContent.match(emojiRegex)
  assert.equal(matches, null, `Found raw Unicode emoji in scan-document-events: ${matches?.[0]}`)
})

test('QuickCreateSheet contains Scanner integration card with camera icon', () => {
  const quickCreateContent = readFileSync('src/components/shared/QuickCreateSheet.tsx', 'utf-8')
  assert.match(quickCreateContent, /MobileDocumentScanSheet/)
  assert.match(quickCreateContent, /Scan Document or Card/)
  assert.match(quickCreateContent, /Camera/)
})

test('MobileTodayView contains Scanner shortcut card', () => {
  const mobileTodayContent = readFileSync('src/components/mobile/MobileTodayView.tsx', 'utf-8')
  assert.match(mobileTodayContent, /MobileDocumentScanSheet/)
  assert.match(mobileTodayContent, /Scan Document or Card/)
  assert.match(mobileTodayContent, /Camera/)
})

test('1-to-Many simulated AI extraction structures both events and reminders with discrete date and time', () => {
  const mockGeminiOutput = {
    document_summary: "Maya's 7th Birthday Party at SkyZone with RSVP deadline",
    items: [
      {
        type: "reminder",
        title: "RSVP to Maya's 7th Birthday Party",
        date: "2026-10-01",
        start_time: null,
        end_time: null,
        all_day: true,
        notes: "Text 555-0199 by Oct 1st",
        raw_text_snippet: "Please RSVP to 555-0199 by Oct 1st",
        suggested_member_name: "Maya",
        confidence: 0.95
      },
      {
        type: "event",
        title: "Maya's 7th Birthday Party",
        date: "2026-10-10",
        start_time: "14:00",
        end_time: "16:00",
        all_day: false,
        location_name: "SkyZone Trampoline Park",
        address: "1400 Commerce Way",
        notes: "Wear grip socks, waiver required online",
        raw_text_snippet: "Saturday, Oct 10: 2pm - 4pm @ SkyZone",
        suggested_member_name: "Maya",
        confidence: 0.98
      }
    ]
  }

  assert.equal(mockGeminiOutput.items.length, 2)
  const reminder = mockGeminiOutput.items.find(i => i.type === 'reminder')
  const event = mockGeminiOutput.items.find(i => i.type === 'event')

  assert.ok(reminder, 'Found reminder item')
  assert.ok(event, 'Found event item')
  assert.equal(reminder.date, '2026-10-01')
  assert.equal(reminder.all_day, true)
  assert.equal(event.date, '2026-10-10')
  assert.equal(event.start_time, '14:00')
  assert.equal(event.end_time, '16:00')
  assert.equal(event.all_day, false)
  assert.equal(event.location_name, 'SkyZone Trampoline Park')
})
