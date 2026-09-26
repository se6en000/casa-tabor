import test from 'node:test'
import assert from 'node:assert/strict'
import { scannedItemsFrom } from '../src/utils/documentScanner.ts'

const family = [{ id: 'emme', name: 'Emme', full_name: 'Emme Tabor' }, { id: 'owen', name: 'Owen', full_name: null }]

test('a flyer becomes ticked drafts: kind, title, day, times as printed, place, and who it is for', () => {
  const items = scannedItemsFrom({
    success: true,
    items: [
      { type: 'event', title: 'PTO Fall Festival', date: '2026-10-10', start_time_local: '11:00', end_time_local: '15:00', start_time: '2026-10-10T15:00:00Z', end_time: '2026-10-10T19:00:00Z', all_day: false, location_name: 'Palm Beach Public', suggested_member_name: 'Emme', confidence: 0.92 },
      { type: 'event', title: 'Picture Day', start_time: '2026-10-06T04:00:00Z', end_time: '2026-10-07T04:00:00Z', all_day: true, confidence: 0.8 },
    ],
  }, family, '2026-09-26')
  assert.deepEqual(items.map((i) => [i.title, i.date, i.start_time_local, i.all_day, i.selected]), [
    ['PTO Fall Festival', '2026-10-10', '11:00', false, true],
    ['Picture Day', '2026-10-06', null, true, true],
  ])
  assert.deepEqual(items[0].selectedMemberIds, ['emme'])
  assert.equal(items[0].location_name, 'Palm Beach Public')
  assert.deepEqual(items[1].selectedMemberIds, [])
})

test('a failed or empty scan says so rather than inventing anything', () => {
  assert.throws(() => scannedItemsFrom({ success: false, error: 'blurry' }, family, '2026-09-26'), /blurry/)
  assert.throws(() => scannedItemsFrom({ success: true, items: [] }, family, '2026-09-26'), /No upcoming dates/)
})

import { scanArgs, scanWhen } from '../src/phone/scan.ts'

const people = [{ id: 'emme', name: 'Emme' }, { id: 'owen', name: 'Owen' }]
const base = { id: 's1', type: 'event', title: ' PTO Fall Festival ', date: '2026-10-10', start_time_local: '11:00', end_time_local: '15:00', start_time: '', end_time: '', all_day: false, location_name: 'Palm Beach Public', address: '239 Cocoanut Row, Palm Beach, FL', notes: 'Bring a dish', selectedMemberIds: ['owen', 'emme'], confidence: 0.9, selected: true }

test('a ticked scan is added through the calendar create call, times as printed, in local time', () => {
  const args = scanArgs(base, people)
  assert.equal(args.title, 'PTO Fall Festival')
  assert.equal(new Date(args.start).getHours(), 11)
  assert.equal(new Date(args.end).getHours(), 15)
  assert.equal(new Date(args.start).getDate(), 10)
  assert.equal(args.event_type, 'event')
  assert.equal(args.location, '239 Cocoanut Row, Palm Beach, FL')
  assert.equal(args.notes, 'Bring a dish')
  assert.deepEqual(args.members, ['Owen', 'Emme'])
  assert.equal(args.all_day, undefined)
})

test('an all-day scan covers its day; one without an end gets an hour (a reminder, 15 minutes)', () => {
  const allDay = scanArgs({ ...base, all_day: true, start_time_local: null, end_time_local: null, address: null, notes: null, selectedMemberIds: [] }, people)
  assert.equal(allDay.all_day, true)
  assert.equal(new Date(allDay.start).getHours(), 0)
  assert.equal(new Date(allDay.end).getTime() - new Date(allDay.start).getTime(), 24 * 3600e3)
  assert.equal(allDay.location, 'Palm Beach Public')
  assert.equal('notes' in allDay, false)
  const open = scanArgs({ ...base, end_time_local: null }, people)
  assert.equal(new Date(open.end).getHours(), 12)
  const reminder = scanArgs({ ...base, type: 'reminder', end_time_local: null }, people)
  assert.equal(new Date(reminder.end).getMinutes(), 15)
})

test('a scan with no printed time falls back to what the scanner read (never a made-up hour)', () => {
  const args = scanArgs({ ...base, start_time_local: null, end_time_local: null, start_time: '2026-10-10T15:30:00.000Z', end_time: '2026-10-10T16:30:00.000Z' }, people)
  assert.equal(args.start, '2026-10-10T15:30:00.000Z')
  assert.equal(args.end, '2026-10-10T16:30:00.000Z')
})

test('the review line says the day and time as printed', () => {
  assert.equal(scanWhen(base), 'Sat, Oct 10 · 11:00 AM – 3:00 PM')
  assert.equal(scanWhen({ ...base, all_day: true }), 'Sat, Oct 10 · All day')
  assert.equal(scanWhen({ ...base, end_time_local: null, start_time_local: '09:30' }), 'Sat, Oct 10 · 9:30 AM')
})
