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

test('high-frequency polling hooks gate background refetching on page visibility', () => {
  assert.match(notifications, /const isPageVisible = usePageVisibility\(\)/)
  assert.match(notifications, /refetchInterval: isPageVisible \? 60_000 : false/)

  assert.match(prepItems, /if \(!isPageVisible\) return/)
  assert.match(prepItems, /refetchInterval: isPageVisible \? 120_000 : false/)

  assert.match(conflicts, /if \(!isPageVisible\) return/)
  assert.match(conflicts, /refetchInterval: isPageVisible \? 120_000 : false/)

  assert.match(roomTone, /refetchInterval: isPageVisible \? 60_000 : false/)
  assert.match(roomTone, /refetchInterval: isPageVisible \? SENSOR_POLL_MS : false/)

  assert.match(recurrenceOps, /refetchInterval: isPageVisible \? 30_000 : false/)
})

test('main surfaced pollers also stop when hidden', () => {
  assert.match(actionHub, /refetchInterval: isPageVisible \? 5 \* 60_000 : false/)
  assert.match(homeRightPanel, /refetchInterval: isPageVisible \? 5 \* 60_000 : false/)
  assert.match(groceryPage, /refetchInterval: isPageVisible \? 10 \* 60_000 : false/)
  assert.match(groceryPage, /refetchInterval: isPageVisible \? 2 \* 60_000 : false/)
})
