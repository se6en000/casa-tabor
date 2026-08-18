import test from 'node:test'
import assert from 'node:assert/strict'
import { differenceInMinutes, parseISO } from 'date-fns'

function calculateJourneyPhaseAndProgress({
  now,
  startTime,
  endTime,
  leaveAt,
  driveTimeMins,
  isAllDay = false,
}) {
  const parsedStart = typeof startTime === 'string' ? parseISO(startTime) : startTime
  const parsedEnd = typeof endTime === 'string' ? parseISO(endTime) : endTime
  const parsedLeave = leaveAt
    ? typeof leaveAt === 'string'
      ? parseISO(leaveAt)
      : leaveAt
    : parsedStart && driveTimeMins && driveTimeMins > 0
    ? new Date(parsedStart.getTime() - driveTimeMins * 60 * 1000)
    : parsedStart

  if (isAllDay || !parsedStart) {
    return { phase: 'all-day', progressPercent: 100, isSessionOrConcluded: false }
  }

  const mLeave = parsedLeave ? differenceInMinutes(parsedLeave, now) : differenceInMinutes(parsedStart, now)
  const mStart = differenceInMinutes(parsedStart, now)
  const mEnd = parsedEnd ? differenceInMinutes(parsedEnd, now) : mStart + 60
  const totalDuration = parsedEnd ? Math.max(1, differenceInMinutes(parsedEnd, parsedStart)) : 60
  const drive = Boolean(driveTimeMins && driveTimeMins > 0)

  let currentPhase = 'prep'
  let progress = 0

  if (mEnd <= 0) {
    currentPhase = 'concluded'
    progress = 100
  } else if (mStart <= 0) {
    currentPhase = 'in-session'
    const elapsed = totalDuration - mEnd
    progress = Math.max(15, Math.min(100, Math.round((elapsed / totalDuration) * 100)))
  } else if (drive && mLeave <= 0) {
    currentPhase = mLeave >= -5 ? 'leave-now' : 'en-route'
    const transitDuration = driveTimeMins || 20
    const transitElapsed = transitDuration - mStart
    progress = Math.max(20, Math.min(95, Math.round((transitElapsed / transitDuration) * 100)))
  } else {
    currentPhase = 'prep'
    const prepWindowMins = 45
    if (mLeave !== null && mLeave < prepWindowMins) {
      progress = Math.max(15, Math.min(90, Math.round(100 - (mLeave / prepWindowMins) * 85)))
    } else {
      progress = 15
    }
  }

  const isSessionOrConcluded = currentPhase === 'in-session' || currentPhase === 'concluded'

  return {
    phase: currentPhase,
    progressPercent: progress,
    isSessionOrConcluded,
    minutesUntilEnd: mEnd,
    minutesUntilStart: mStart,
    minutesUntilLeave: mLeave,
  }
}

test('JourneyProgressBar lifecycle: prep phase at home 30m before departure', () => {
  const now = new Date(2026, 7, 17, 18, 20) // 6:20 PM
  const res = calculateJourneyPhaseAndProgress({
    now,
    startTime: '2026-08-17T19:00:00', // 7:00 PM
    endTime: '2026-08-17T20:00:00',   // 8:00 PM
    driveTimeMins: 20,                 // leave at 6:40 PM
  })
  assert.equal(res.phase, 'prep')
  assert.equal(res.isSessionOrConcluded, false)
  assert.equal(res.minutesUntilLeave, 20)
})

test('JourneyProgressBar lifecycle: leave-now phase at departure time', () => {
  const now = new Date(2026, 7, 17, 18, 40) // 6:40 PM
  const res = calculateJourneyPhaseAndProgress({
    now,
    startTime: '2026-08-17T19:00:00',
    endTime: '2026-08-17T20:00:00',
    driveTimeMins: 20,
  })
  assert.equal(res.phase, 'leave-now')
  assert.equal(res.isSessionOrConcluded, false)
})

test('JourneyProgressBar lifecycle: en-route phase 10m into a 20m drive', () => {
  const now = new Date(2026, 7, 17, 18, 50) // 6:50 PM
  const res = calculateJourneyPhaseAndProgress({
    now,
    startTime: '2026-08-17T19:00:00',
    endTime: '2026-08-17T20:00:00',
    driveTimeMins: 20,
  })
  assert.equal(res.phase, 'en-route')
  assert.equal(res.isSessionOrConcluded, false)
  assert.equal(res.progressPercent, 50)
})

test('JourneyProgressBar lifecycle: in-session phase at 7:30 PM (halfway)', () => {
  const now = new Date(2026, 7, 17, 19, 30) // 7:30 PM
  const res = calculateJourneyPhaseAndProgress({
    now,
    startTime: '2026-08-17T19:00:00',
    endTime: '2026-08-17T20:00:00',
    driveTimeMins: 20,
  })
  assert.equal(res.phase, 'in-session')
  assert.equal(res.isSessionOrConcluded, true)
  assert.equal(res.progressPercent, 50)
})

test('JourneyProgressBar lifecycle: concluding / ended at 8:00 PM (end of event fix)', () => {
  const now = new Date(2026, 7, 17, 20, 0) // 8:00 PM
  const res = calculateJourneyPhaseAndProgress({
    now,
    startTime: '2026-08-17T19:00:00',
    endTime: '2026-08-17T20:00:00',
    driveTimeMins: 20,
  })
  assert.equal(res.phase, 'concluded')
  assert.equal(res.isSessionOrConcluded, true)
  assert.equal(res.progressPercent, 100)
  assert.equal(res.minutesUntilEnd, 0)
})
