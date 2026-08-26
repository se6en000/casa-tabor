import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const notifications = readFileSync(new URL('../src/hooks/useNotifications.ts', import.meta.url), 'utf8')
const prepItems = readFileSync(new URL('../src/hooks/usePrepItems.ts', import.meta.url), 'utf8')
const conflicts = readFileSync(new URL('../src/hooks/useConflicts.ts', import.meta.url), 'utf8')
const roomTone = readFileSync(new URL('../src/hooks/useRoomTone.ts', import.meta.url), 'utf8')
const recurrenceOps = readFileSync(new URL('../src/hooks/useRecurrenceOperations.ts', import.meta.url), 'utf8')
const actionHub = readFileSync(new URL('../src/pages/ActionHubPage.tsx', import.meta.url), 'utf8')
const homeRightPanel = readFileSync(new URL('../src/components/home/HomeRightPanel.tsx', import.meta.url), 'utf8')
const groceryPage = readFileSync(new URL('../src/pages/GroceryPage.tsx', import.meta.url), 'utf8')

test('high-frequency hooks gate background work and eliminate periodic polling in favor of Realtime push', () => {
  assert.match(notifications, /const isPageVisible = usePageVisibility\(\)/)
  assert.match(notifications, /refetchInterval: false/)

  assert.match(prepItems, /if \(!isPageVisible\) return/)
  assert.match(prepItems, /refetchInterval: false/)

  assert.match(conflicts, /if \(!isPageVisible\) return/)
  assert.match(conflicts, /refetchInterval: false/)

  assert.match(roomTone, /refetchInterval: false/)
  assert.match(roomTone, /refetchInterval: isPageVisible \? SENSOR_POLL_MS : false/)

  assert.match(recurrenceOps, /refetchInterval: false/)
})

test('main surfaced views also disable periodic background polling', () => {
  assert.match(actionHub, /refetchInterval: false/)
  assert.match(homeRightPanel, /refetchInterval: false/)
  assert.match(groceryPage, /refetchInterval: false/)
})
