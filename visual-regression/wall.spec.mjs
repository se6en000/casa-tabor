import { expect, test } from '@playwright/test'

// The Family Wall at 1920x1080 in each posture, drawn from the fixed fixture
// (tests/fixtures/wall-day-2026-09-25.mjs). Run with `npm run test:visual:wall`.
const MOMENTS = [
  { name: 'launch-before-school', at: '2026-09-25T07:12:00' },
  { name: 'launch-needs-driver', at: '2026-09-26T12:00:00' },
  { name: 'calm-afternoon', at: '2026-09-25T13:40:00' },
  { name: 'evening-before-games', at: '2026-09-25T20:15:00' },
]

for (const moment of MOMENTS) {
  test(`wall: ${moment.name}`, async ({ page }) => {
    await page.goto(`/__wall-fixture?at=${moment.at}`)
    await expect(page.getByTestId('wall-fixture')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expect(page.getByTestId('wall-fixture')).toHaveScreenshot(`${moment.name}.png`)
  })
}

test('wall: a tap previews the next face, and the MT menu opens the rest of the app', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00')
  const wall = page.getByTestId('wall-fixture')
  await expect(wall.getByText('A quiet stretch until 1:50.')).toBeVisible()

  await wall.click({ position: { x: 400, y: 600 } })
  await expect(wall.getByText(/Previewing Full day/)).toBeVisible()
  await expect(wall.getByText("TODAY · WHO'S WHERE")).toBeVisible()

  await wall.click({ position: { x: 400, y: 600 } })
  await expect(wall.getByText(/Previewing Evening/)).toBeVisible()
  await expect(wall.getByText('TOMORROW')).toBeVisible()

  await wall.click({ position: { x: 400, y: 600 } })
  await expect(wall.getByText(/Previewing/)).toHaveCount(0)
  await expect(wall.getByText('A quiet stretch until 1:50.')).toBeVisible()

  await wall.getByRole('button', { name: 'Open menu' }).click()
  await expect(wall.getByRole('link', { name: 'Calendar' })).toBeVisible()
  await expect(wall.getByText(/Previewing/)).toHaveCount(0) // opening the menu isn't a tap on the wall
  await wall.getByRole('button', { name: 'Back to the Wall' }).click()
  await expect(wall.getByRole('link', { name: 'Calendar' })).toHaveCount(0)
})

test('wall: a menu item opens that part of the app', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00')
  const wall = page.getByTestId('wall-fixture')
  await wall.getByRole('button', { name: 'Open menu' }).click()
  await wall.getByRole('link', { name: 'Calendar' }).click()
  await expect(page.getByTestId('fixture-calendar')).toBeVisible()
})
