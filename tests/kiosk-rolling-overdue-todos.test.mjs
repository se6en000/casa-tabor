import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('useCalmKioskPresenter derives todayReminders and overdueReminders from 7-day rollingEvents', () => {
  const presenterFilePath = path.resolve('src/hooks/useCalmKioskPresenter.ts')
  const presenterContent = fs.readFileSync(presenterFilePath, 'utf8')

  // Verify todayReminders filters from rollingEvents
  assert.match(
    presenterContent,
    /const todayReminders = useMemo\(\(\) => \{[\s\S]*?return rollingEvents[\s\S]*?\.filter\(/m,
    'todayReminders must filter across rollingEvents (past 7 days through end of today)'
  )

  // Verify overdueReminders captures past-day missed items and earlier-today timed items
  assert.match(
    presenterContent,
    /const isPastDay = startMs < startOfTodayMs/,
    'overdueReminders must recognize past days as missed'
  )
  assert.match(
    presenterContent,
    /const isEarlierToday = !evt\.all_day && startMs < nowMs/,
    'overdueReminders must recognize earlier-today timed items as overdue'
  )
  assert.match(
    presenterContent,
    /return isPastDay \|\| isEarlierToday/,
    'overdueReminders must return past days or earlier today'
  )
})

test('CalmKioskView renders dynamic overdue banner and distinguishes Missed vs Overdue items', () => {
  const kioskFilePath = path.resolve('src/components/canvas/CalmKioskView.tsx')
  const kioskContent = fs.readFileSync(kioskFilePath, 'utf8')

  // Verify hasPastDayOverdue detection
  assert.match(
    kioskContent,
    /const hasPastDayOverdue = overdueReminders\.some\(/,
    'CalmKioskView must detect if overdueReminders includes items from past days'
  )

  // Verify banner label accounts for missed items
  assert.match(
    kioskContent,
    /\$\{overdueReminders\.length\} overdue \$\{overdueReminders\.length === 1 \? 'item' : 'items'\} pending/,
    'Banner label must indicate overdue items pending'
  )

  // Verify Missed vs Overdue badge rendering
  assert.match(
    kioskContent,
    /isPastDay \? 'Missed' : 'Overdue'/,
    'Must label past-day items as Missed and today items as Overdue'
  )
})
