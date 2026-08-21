import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('CalmKioskView defaults overdue todos to expanded when present', () => {
  const kioskFilePath = path.resolve('src/components/canvas/CalmKioskView.tsx')
  const kioskContent = fs.readFileSync(kioskFilePath, 'utf8')

  // Verify showOverdueTodos defaults to true (expanded)
  assert.match(
    kioskContent,
    /const \[showOverdueTodos,\s*setShowOverdueTodos\]\s*=\s*useState<boolean>\(\(\)\s*=>\s*\{[\s\S]*?return stored === null \? true : stored !== 'true'/m,
    'showOverdueTodos must default to true (expanded) so expired todos are front and center'
  )

  // Verify overdue items render highlighted amber styling with Overdue badge
  assert.match(kioskContent, /Overdue/, 'Must render Overdue badge')
  assert.match(kioskContent, /border-amber-500/, 'Must use highlighted amber styling')
})
