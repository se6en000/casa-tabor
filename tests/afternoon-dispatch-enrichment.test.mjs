import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('Afternoon Dispatch synthesis contract: useCalmKioskPresenter exports unclosed reminders, milestone radar, and refresh action', async () => {
  const presenterSource = await readFile(
    new URL('../src/hooks/useCalmKioskPresenter.ts', import.meta.url),
    'utf8'
  )

  // Verify exported state and methods
  assert.match(presenterSource, /openReminders:\s*EventWithDetails\[\]/)
  assert.match(presenterSource, /overdueReminders:\s*EventWithDetails\[\]/)
  assert.match(presenterSource, /activeReminders:\s*EventWithDetails\[\]/)
  assert.match(presenterSource, /completedItems:\s*Record<string,\s*boolean>/)
  assert.match(presenterSource, /setCompletedItems:\s*React\.Dispatch/)
  assert.match(presenterSource, /isRefreshing:\s*boolean/)
  assert.match(presenterSource, /refreshBriefing:\s*\(\)\s*=>\s*Promise<void>/)
  assert.match(presenterSource, /upcomingMilestonesAndPrep:\s*EventWithDetails\[\]/)
  assert.match(presenterSource, /milestonePhrases:\s*string\[\]/)

  // Verify dailyBriefing synthesis includes unclosed reminders and long-term milestone radar
  assert.match(presenterSource, /openReminders\.length === 1/)
  assert.match(presenterSource, /openReminders\.length === 2/)
  assert.match(presenterSource, /openReminders\.length > 2/)
  assert.match(presenterSource, /birthday|bday|anniversary|party|celebration|wedding/i)
  assert.match(presenterSource, /On the radar:\s*\$\{milestonePhrases\[0\]\}/)
  assert.match(presenterSource, /refreshBriefing = useCallback/)
  assert.match(presenterSource, /queryClient\.invalidateQueries/)
})

test('CalmKioskView binds Afternoon Dispatch header with touch-compliant refresh IconButton', async () => {
  const kioskSource = await readFile(
    new URL('../src/components/canvas/CalmKioskView.tsx', import.meta.url),
    'utf8'
  )

  // Verify refresh icon and button wiring
  assert.match(kioskSource, /RotateCw/)
  assert.match(kioskSource, /aria-label="Refresh daily brief"/)
  assert.match(kioskSource, /onClick=\{.*refreshBriefing\(.*?\)\}/)
  assert.match(kioskSource, /isRefreshing && 'animate-spin'/)
  assert.match(kioskSource, /min-h-\[44px\] min-w-\[44px\]/)
  assert.match(kioskSource, /dailyBriefing && \(/)
})
