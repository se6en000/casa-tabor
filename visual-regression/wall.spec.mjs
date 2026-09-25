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
  await expect(wall.getByText('TOMORROW', { exact: true })).toBeVisible()

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

test('wall: tapping an item opens its details; Edit shows what changes before saving', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T20:15:00')
  const wall = page.getByTestId('wall-fixture')
  await wall.getByRole('button', { name: 'Open Softball: Huskies @ RPB Cascade' }).first().click()
  const sheet = wall.getByRole('region', { name: 'Softball: Huskies @ RPB Cascade details' })
  await expect(sheet.getByText('TOMORROW · 12:30 PM – 2:30 PM')).toBeVisible()
  await expect(sheet.getByText('11:56')).toBeVisible()
  await expect(sheet.getByText('Jake drives')).toBeVisible()
  await expect(wall.getByText(/Previewing/)).toHaveCount(0) // opening an item isn't a posture tap

  await sheet.getByRole('button', { name: 'Edit' }).click()
  await sheet.getByRole('button', { name: '15 minutes earlier' }).first().click()
  await expect(sheet.getByText('was 12:30 PM')).toBeVisible()
  await expect(sheet.getByText('Jake leaves at 11:41 instead of 11:56.')).toBeVisible()
  await expect(wall).toHaveScreenshot('edit-softball.png')

  await sheet.getByRole('button', { name: 'Softball: Huskies @ RPB Cascade', exact: true }).click()
  await wall.getByRole('button', { name: 'x', exact: true }).click()
  await expect(sheet.getByText('Softball: Huskies @ RPB Cascadex')).toBeVisible()
  // The end of a long title stays in view while typing (found on the kiosk: it was cut off).
  for (let i = 0; i < 24; i += 1) await wall.getByRole('button', { name: 'x', exact: true }).click()
  const field = sheet.getByRole('button', { name: /Cascadexxxxxxxxxxxxxxxxxxxxxxxxx$/ })
  expect(await field.evaluate((el) => { const text = el.firstElementChild; return text.scrollWidth <= text.clientWidth + 1 })).toBe(true)
  for (let i = 0; i < 24; i += 1) await wall.getByRole('button', { name: 'Delete' }).click()
  await expect(sheet.getByText('was Softball: Huskies @ RPB Cascade')).toBeVisible()
  await wall.getByRole('button', { name: 'Done' }).click()

  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet.getByRole('button', { name: 'Edit' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(wall.getByRole('region', { name: /details$/ })).toHaveCount(0)
})

test('wall: in the calm view, tapping a person opens what they are doing next', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00')
  const wall = page.getByTestId('wall-fixture')
  await wall.getByRole('button', { name: /^Emme/ }).click()
  await expect(wall.getByRole('region', { name: /SAVE the DATE.*details/ })).toBeVisible()
})

test('wall: choosing "It\'s at home" in the place picker takes the drive off the wall', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T20:15:00')
  const wall = page.getByTestId('wall-fixture')
  await wall.getByRole('button', { name: 'Open Softball: Huskies @ RPB Cascade' }).first().click()
  const sheet = wall.getByRole('region', { name: /details$/ })
  await sheet.getByRole('button', { name: 'Edit' }).click()
  await sheet.getByRole('button', { name: 'Change' }).click()
  await expect(sheet.getByText('PLACE FOR SOFTBALL')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'No place' })).toHaveCount(0) // softball has a saved trip plan
  await sheet.getByRole('button', { name: "It's at home" }).click()
  await expect(sheet.getByText(/^was Ferrin Park Field 1/)).toBeVisible()
  await expect(sheet.getByText('No drive any more: it drops off the road.')).toBeVisible()
})

test('wall: the Who tab adds a person and changes the driver, with the change spelled out', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T20:15:00')
  const wall = page.getByTestId('wall-fixture')
  await wall.getByRole('button', { name: 'Open Softball: Huskies @ RPB Cascade' }).first().click()
  const sheet = wall.getByRole('region', { name: /details$/ })
  await sheet.getByRole('button', { name: 'Edit' }).click()
  await sheet.getByRole('button', { name: /^Who/ }).click()
  await sheet.getByRole('button', { name: 'Owen', exact: true }).click()
  await sheet.getByRole('button', { name: /^Giselle free/ }).click()
  await expect(sheet.getByText('Owen goes too. Giselle drives instead of Jake, leaving at 11:56.')).toBeVisible()
  await expect(sheet.getByText('was Jake')).toHaveCount(2)
  await expect(wall).toHaveScreenshot('edit-who.png')
})

test('wall: "Leaving now" puts the trip on the road (with undo), and "Hand off" gives it to someone else', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  const wall = page.getByTestId('wall-fixture')
  const move = wall.getByRole('region', { name: 'Next move' })
  await expect(move.getByText('NEXT MOVE · LEAVE BY 7:25')).toBeVisible()
  await expect(wall).toHaveScreenshot('next-move-actions.png')

  await move.getByRole('button', { name: 'Leaving now' }).click()
  await expect(move.getByText('ON THE ROAD · THERE BY 7:35')).toBeVisible()
  await move.getByRole('button', { name: 'Not yet (undo)' }).click()
  await expect(move.getByText('NEXT MOVE · LEAVE BY 7:25')).toBeVisible()

  await move.getByRole('button', { name: 'Hand off' }).click()
  const sheet = wall.getByRole('region', { name: 'Hand off' })
  await expect(sheet.getByText('Drop off Emme & Owen')).toBeVisible()
  await sheet.getByRole('button', { name: /^Kelly/ }).click()
  await expect(move.getByText('Kelly → Palm Beach Public')).toBeVisible()
})

test('wall: needs a decision — the count opens the questions, and answers settle them', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T20:15:00')
  const wall = page.getByTestId('wall-fixture')
  // Evening: tomorrow's questions are listed with their answers, and marked on the Score.
  await expect(wall.getByText('NEEDS A DECISION · 1')).toBeVisible()
  await expect(wall.getByText('Tomorrow · Baseball and Softball are both at Ferrin Park Field 1 at 12:30.')).toBeVisible()
  await expect(wall.getByRole('button', { name: 'Needs a decision' }).first()).toBeVisible()
  await expect(wall).toHaveScreenshot('evening-decisions.png')

  await wall.getByRole('button', { name: 'Keep two trips' }).click()
  await expect(wall.getByText('Tomorrow · Baseball at 12:30 needs a driver.')).toBeVisible()
  await wall.getByRole('button', { name: 'Kelly', exact: true }).click()
  await expect(wall.getByText('NOTHING TO DECIDE')).toBeVisible()
})

test('wall: "One trip" gives both games to one driver', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T20:15:00')
  const wall = page.getByTestId('wall-fixture')
  await wall.getByRole('button', { name: 'One trip · Jake' }).click()
  await expect(wall.getByText('NOTHING TO DECIDE')).toBeVisible()
  await expect(wall.getByText('Leaves at 11:56').first()).toBeVisible()
})

test('wall: the week strip shows another day\'s Score, and comes back to today', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  const wall = page.getByTestId('wall-fixture')
  const week = wall.getByRole('region', { name: 'Next seven days' })
  await expect(week.getByRole('button', { name: /^Today/ })).toHaveAttribute('aria-pressed', 'true')

  await week.getByRole('button', { name: /^Saturday, September 26/ }).click()
  await expect(wall.getByText("SATURDAY · WHO'S WHERE")).toBeVisible()
  await expect(wall.getByText('LOOKING AHEAD')).toBeVisible()
  await expect(wall.getByText(/First out: Jake → Ferrin Park Field 1 · leave 11:56/)).toBeVisible()
  await expect(wall.getByText(/Previewing/)).toHaveCount(0)
  await expect(wall).toHaveScreenshot('week-saturday.png')

  await wall.getByRole('button', { name: 'Back to today' }).click()
  await expect(wall.getByText("TODAY · WHO'S WHERE")).toBeVisible()

  // A tap anywhere else on the wall also comes back to today (not on to the next face).
  await week.getByRole('button', { name: /^Sunday/ }).click()
  await expect(wall.getByText("SUNDAY · WHO'S WHERE")).toBeVisible()
  await wall.getByText('LOOKING AHEAD').click()
  await expect(wall.getByText("TODAY · WHO'S WHERE")).toBeVisible()
  await expect(wall.getByText(/Previewing/)).toHaveCount(0)
})

test('wall: nothing runs off the stage, even late in the day, and the header keeps its weather line', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-10-01T18:00:00')
  const wall = page.getByTestId('wall-fixture')
  await wall.click({ position: { x: 400, y: 1000 } }) // calm → full day
  await expect(wall.getByText("TODAY · WHO'S WHERE")).toBeVisible()
  await expect(wall.getByText(/Pick up the costume/).first()).toBeVisible()
  await expect(wall.getByText(/Everyone home by/)).toBeVisible()
  await page.evaluate(() => document.fonts.ready) // measure with the real faces, not the fallback
  const outside = await wall.evaluate((stage) => {
    const edge = stage.getBoundingClientRect().right
    return [...stage.querySelectorAll('*')]
      .filter((el) => el.children.length === 0 && el.textContent.trim() && el.getBoundingClientRect().right > edge + 0.5)
      .map((el) => el.textContent.trim())
  })
  expect(outside).toEqual([])
  // The header column is a fixed height: nothing in it may be squeezed so its text gets cut.
  const squeezed = await wall.locator('header').first().evaluate((header) =>
    [...header.querySelectorAll('*')]
      .filter((el) => {
        const style = getComputedStyle(el)
        // Squeezed = a clipping box shorter than one line of its own text (font-metric overhang alone doesn't count).
        return el.children.length === 0 && el.textContent.trim() && style.overflowY !== 'visible' && el.clientHeight < parseFloat(style.lineHeight) - 1
      })
      .map((el) => el.textContent.trim()),
  )
  expect(squeezed).toEqual([])
  // Late labels read in full, from the right edge, not cut to a few letters.
  const cut = await wall.evaluate((stage) =>
    [...stage.querySelectorAll('[data-block-label]')]
      .filter((el) => ['Pick up the costume for the school play', 'Book club at the Harrisons'].includes(el.textContent.trim()))
      .filter((el) => el.scrollWidth > el.clientWidth)
      .map((el) => el.textContent.trim()),
  )
  expect(cut).toEqual([])
  await expect(wall).toHaveScreenshot('late-thursday.png')
})
