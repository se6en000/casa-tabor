import { expect, test } from '@playwright/test'
import { serveFontsFromCache } from './fontCache.mjs'

serveFontsFromCache(test)

// The Family Wall at 1920x1080 in each posture, drawn from the fixed fixture
// (tests/fixtures/wall-day-2026-09-25.mjs). Run with `npm run test:visual:wall`.
const MOMENTS = [
  { name: 'launch-before-school', at: '2026-09-25T07:12:00' },
  { name: 'launch-needs-driver', at: '2026-09-26T12:00:00' },
  { name: 'calm-afternoon', at: '2026-09-25T11:40:00' },
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

test('wall: a touch on Calm wakes the full day; faces are previewed from the MT menu; the menu opens the rest of the app', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T11:40:00')
  const wall = page.getByTestId('wall-fixture')
  await expect(wall.getByText('A quiet stretch until 1:50.')).toBeVisible()

  await wall.click({ position: { x: 400, y: 600 } })
  await expect(wall.getByText("TODAY · WHO'S WHERE")).toBeVisible() // awake: the full day
  await expect(wall.getByText(/Previewing/)).toHaveCount(0)
  await wall.click({ position: { x: 1700, y: 1060 } }) // another tap on empty wall doesn't flip faces
  await expect(wall.getByText("TODAY · WHO'S WHERE")).toBeVisible()

  await wall.getByRole('button', { name: 'Open menu' }).click()
  await expect(wall.getByRole('link', { name: 'Calendar' })).toBeVisible()
  await wall.getByRole('button', { name: 'Evening' }).click()
  await expect(wall.getByText(/Previewing Evening · back to Full day on its own/)).toBeVisible()
  await expect(wall.getByRole('banner').getByText('TOMORROW', { exact: true })).toBeVisible()

  await wall.getByRole('button', { name: 'Open menu' }).click()
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
  await wall.getByLabel('Keyboard').getByRole('button', { name: 'Done' }).click()

  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet.getByRole('button', { name: 'Edit' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(wall.getByRole('region', { name: /details$/ })).toHaveCount(0)
})

test('wall: in the calm view, tapping a person opens what they are doing next', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T11:40:00')
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

test('wall: the week strip shows another day, in the day-ahead layout, and comes back to today', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  const wall = page.getByTestId('wall-fixture')
  const week = wall.getByRole('region', { name: 'Next seven days' })
  await expect(week.getByRole('button', { name: /^Today/ })).toHaveAttribute('aria-pressed', 'true')

  await week.getByRole('button', { name: /^Saturday, September 26/ }).click()
  await expect(wall.getByText("SATURDAY · WHO'S WHERE")).toBeVisible()
  await expect(wall.getByRole('banner').getByText('TOMORROW', { exact: true })).toBeVisible()
  await expect(wall.getByRole('region', { name: 'First departure' }).getByText('Jake → Ferrin Park Field 1')).toBeVisible()
  await expect(week.getByRole('button', { name: /^Saturday, September 26/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(wall).toHaveScreenshot('week-saturday.png')

  await wall.getByRole('button', { name: 'Back to today' }).click()
  await expect(wall.getByText("TODAY · WHO'S WHERE")).toBeVisible()

  await week.getByRole('button', { name: /^Sunday/ }).click()
  await expect(wall.getByText('LOOKING AHEAD · SUNDAY')).toBeVisible()
  await week.getByRole('button', { name: /^Today/ }).click()
  await expect(wall.getByText("TODAY · WHO'S WHERE")).toBeVisible()
})

test('wall: from 1 PM tomorrow speaks up on the full day, and a tap opens it', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00')
  const wall = page.getByTestId('wall-fixture')
  const note = wall.getByRole('button', { name: /^TOMORROW/ })
  await expect(note).toContainText('Baseball: Glove and Cleats still to do')
  await expect(note).not.toContainText('Birthday') // a celebration's prep never reaches the wall
  await expect(wall).toHaveScreenshot('tomorrow-note.png')
  await note.click()
  await expect(wall.getByText("SATURDAY · WHO'S WHERE")).toBeVisible()
})

test('wall: nothing runs off the stage, even late in the day, and the header keeps its weather line', async ({ page }) => {
  // 6:20: the full day, within the hour of the book club's 7:15 departure (calm until then).
  await page.goto('/__wall-fixture?at=2026-10-01T18:20:00')
  const wall = page.getByTestId('wall-fixture')
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
      .filter((el) => ['Pick up the costume for the school play', 'Book club at the Harrisons', 'Pick up Photobook for Liv'].includes(el.textContent.trim()))
      .filter((el) => {
        // Fractional text width against the box: scrollWidth rounds, and a 0.4px overflow still shows an ellipsis.
        const range = document.createRange()
        range.selectNodeContents(el)
        return range.getBoundingClientRect().width > el.getBoundingClientRect().width + 0.01
      })
      .map((el) => el.textContent.trim()),
  )
  expect(cut.filter((t) => t !== 'Pick up the costume for the school play')).toEqual([])
  // Labels start at their block; one moves left only as far as it must to stay on the stage,
  // and never into the label before it.
  const placement = await wall.evaluate((stage) => {
    const edge = stage.getBoundingClientRect().right
    const problems = []
    const labels = [...stage.querySelectorAll('[data-block-label]')].map((el) => {
      const bar = stage.querySelector(`[data-block-bar="${CSS.escape(el.dataset.blockLabel)}"]`)
      return { text: el.textContent.trim(), rect: el.getBoundingClientRect(), bar: bar?.getBoundingClientRect() }
    })
    for (const label of labels) {
      if (label.bar && label.rect.left < label.bar.left - 1 && label.rect.right < edge - 30) problems.push(`moved off its block: ${label.text}`)
      for (const other of labels) {
        if (other === label || Math.abs(other.rect.top - label.rect.top) > 2 || other.rect.left > label.rect.left) continue
        if (other.rect.right + 8 > label.rect.left) problems.push(`runs into ${other.text}: ${label.text}`)
      }
    }
    return problems
  })
  expect(placement).toEqual([])
  await expect(wall).toHaveScreenshot('late-thursday.png')
})

for (const moment of MOMENTS) {
  test(`wall: ${moment.name} — every bar, label and initial sits inside its own lane`, async ({ page }) => {
    await page.goto(`/__wall-fixture?at=${moment.at}`)
    const wall = page.getByTestId('wall-fixture')
    await expect(wall).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const outside = await wall.evaluate((stage) =>
      [...stage.querySelectorAll('[data-lane-track]')].flatMap((track) => {
        const lane = track.getBoundingClientRect()
        return [...track.querySelectorAll('[data-block-bar], [data-block-label], [data-monogram]')]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.top < lane.top - 0.5 || r.bottom > lane.bottom + 0.5 })
          .map((el) => `${track.dataset.laneTrack}: ${el.textContent.trim() || el.dataset.blockBar || 'initial'}`)
      }),
    )
    expect(outside).toEqual([])
  })
}

test('wall: an event or reminder can be deleted from its details, after a clear yes', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  const wall = page.getByTestId('wall-fixture')
  await wall.getByRole('button', { name: 'Open Pick up Photobook for Liv' }).first().click()
  const sheet = wall.getByRole('region', { name: 'Pick up Photobook for Liv details' })

  await sheet.getByRole('button', { name: 'Delete' }).click()
  await expect(sheet.getByText('Delete “Pick up Photobook for Liv”?')).toBeVisible()
  await expect(wall).toHaveScreenshot('delete-confirm.png')
  await sheet.getByRole('button', { name: 'Keep it' }).click()
  await expect(sheet.getByText(/Delete “/)).toHaveCount(0)

  await sheet.getByRole('button', { name: 'Delete' }).click()
  await sheet.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(wall.getByRole('region', { name: /details$/ })).toHaveCount(0)
  await expect(wall.getByText('Pick up Photobook for Liv')).toHaveCount(0)
  await expect(wall.getByText(/Previewing/)).toHaveCount(0)
})

test('wall: Edit with nothing changed shows Done, and one tap closes the whole sheet', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T20:15:00')
  const wall = page.getByTestId('wall-fixture')
  await wall.getByRole('button', { name: 'Open Softball: Huskies @ RPB Cascade' }).first().click()
  await wall.getByRole('button', { name: 'Edit' }).click()
  await expect(wall.getByRole('button', { name: 'Save' })).toHaveCount(0)
  await wall.getByRole('region', { name: /details$/ }).getByRole('button', { name: 'Done' }).click()
  await expect(wall.getByRole('region', { name: /details$/ })).toHaveCount(0)
  await expect(wall.getByText(/Previewing/)).toHaveCount(0)
})

test('wall: pack tonight — a tap checks a line off (it folds away), See all opens everything, a heading opens its event', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T20:15:00')
  const wall = page.getByTestId('wall-fixture')
  const pack = wall.getByRole('region', { name: 'Pack tonight' })
  await expect(pack.getByText('GET & PACK · 1 OF 5 DONE')).toBeVisible()

  await pack.getByRole('button', { name: 'Water bottle' }).click()
  await expect(pack.getByText('GET & PACK · 2 OF 5 DONE')).toBeVisible()
  await expect(pack.getByRole('button', { name: 'Water bottle' })).toHaveCount(0) // folded into "2 packed"
  await expect(wall.getByText(/Previewing/)).toHaveCount(0) // a tap on a line isn't a tap on the wall
  await expect(wall).toHaveScreenshot('pack-tonight.png')

  await pack.getByRole('button', { name: 'See all' }).click()
  const sheet = wall.getByRole('region', { name: 'Everything to pack' })
  await sheet.getByRole('button', { name: 'Water bottle' }).click() // untick it again
  await expect(sheet.getByText('GET & PACK · 1 OF 5 DONE')).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()

  await pack.getByRole('button', { name: /^Baseball/ }).click()
  await expect(wall.getByRole('region', { name: /^Baseball: Huskies @ RPB Cascade details/ })).toBeVisible()
})

test('wall: + adds an event by touch — blank on the day on show, the Score previews it, "Add it" puts it on the wall', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  const wall = page.getByTestId('wall-fixture')
  await wall.getByRole('region', { name: 'Next seven days' }).getByRole('button', { name: /^Saturday, September 26/ }).click()
  await wall.getByRole('button', { name: 'Add something' }).click()
  const sheet = wall.getByRole('region', { name: 'Adding something' })
  await expect(sheet.getByRole('button', { name: 'Event' })).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByRole('button', { name: 'Add it' })).toBeDisabled() // no title yet

  const keyboard = wall.getByRole('region', { name: 'Keyboard' })
  for (const key of 'jaida') await keyboard.getByRole('button', { name: new RegExp(`^${key}$`, 'i') }).click()
  await keyboard.getByRole('button', { name: 'Done', exact: true }).click()
  await sheet.getByRole('button', { name: 'Who' }).click()
  await sheet.getByRole('button', { name: /^Owen/ }).click()
  await expect(wall).toHaveScreenshot('add-event.png')

  await sheet.getByRole('button', { name: 'Add it' }).click()
  await expect(wall.getByRole('region', { name: 'Adding something' })).toHaveCount(0)
  await expect(wall.getByText(/^jaida$/i).first()).toBeVisible() // on Owen's lane, Saturday 9 AM
})

test('wall: the brand row (MT, mic, +, name, to decide) stays on one line', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  const wall = page.getByTestId('wall-fixture')
  await page.evaluate(() => document.fonts.ready)
  const wrapped = await wall.getByRole('banner').evaluate((header) => {
    const row = header.querySelector('button[aria-label="Open menu"]').parentElement
    // Count the lines each piece of text is laid out on.
    const lines = (el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      // Boxes that overlap vertically share a line (a badge and its text sit at different heights).
      let count = 0
      let bottom = -Infinity
      for (const r of [...range.getClientRects()].filter((r) => r.width > 0).sort((a, b) => a.top - b.top)) {
        if (r.top >= bottom - 2) count += 1
        bottom = Math.max(bottom, r.bottom)
      }
      return count
    }
    return [...row.children].filter((el) => el.textContent.trim() && lines(el) > 1).map((el) => el.textContent.trim())
  })
  expect(wrapped).toEqual([])
})

test('wall: surprise-safe — the wall shows "Kelly\'s Birthday" and nothing more (no card, no gift, not even a count)', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T20:15:00')
  const wall = page.getByTestId('wall-fixture')
  await expect(wall.getByText("Kelly's Birthday").first()).toBeVisible()
  await expect(wall.getByText('Birthday card')).toHaveCount(0)
  await expect(wall.getByRole('region', { name: 'Pack tonight' }).getByText(/Kelly's Birthday/)).toHaveCount(0)
  await wall.getByRole('button', { name: "Open Kelly's Birthday" }).first().click()
  await expect(wall.getByRole('region', { name: /^Kelly's Birthday details/ }).getByText('Birthday card')).toHaveCount(0)
})

// The assistant's cards and thread (design section 06), from canned conversations (`?band=`).
const band = (page, scene) => page.goto(`/__wall-fixture?at=2026-09-25T13:40:00&band=${scene}`)

test('wall assistant: a draft shows the thread, what just changed, where it lands, leave by and who is free to drive', async ({ page }) => {
  await band(page, 'add')
  const section = page.getByRole('region', { name: 'Assistant' })
  await expect(section.getByText('THIS CONVERSATION')).toBeVisible()
  await expect(section.getByText('It’s at Palm Beach Pediatric Dentistry')).toBeVisible()
  await expect(section.getByText('“Actually make it 4”')).toBeVisible()
  await expect(section.getByText('Just changed: 3:30 → 4:00')).toBeVisible()
  await expect(section.getByText('Dentist · Liv')).toBeVisible()
  await expect(section.getByText('3:31')).toBeVisible()
  await expect(section.getByText('Kelly · free')).toBeVisible()
  await expect(section.getByText('Nothing else then for Liv')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('assistant-draft.png')
  await section.getByRole('button', { name: 'Yes, add it' }).click()
  await expect(section.getByText('DRAFT · NOT SAVED YET')).toHaveCount(0)
})

test('wall assistant: a change shows before → after, previews its own day on the Score, and a driver can be picked on the card', async ({ page }) => {
  await band(page, 'change')
  const section = page.getByRole('region', { name: 'Assistant' })
  await expect(section.getByText('12:30 – 2:30 PM')).toBeVisible()
  await expect(section.getByText('1:00 – 3:00 PM').first()).toBeVisible()
  await expect(section.getByText('12:26')).toBeVisible()
  // The Score behind shows Saturday, with the moved game.
  await expect(page.getByText('Saturday, September 26')).toBeVisible()
  await expect(page.getByText('Leaves at 12:26')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('assistant-change.png')
  await section.getByRole('button', { name: 'Kelly · free' }).click()
  await expect(section.getByRole('button', { name: 'Kelly · free' })).toHaveAttribute('aria-pressed', 'true')
  await expect(section.getByRole('button', { name: 'Jake · free' })).toHaveAttribute('aria-pressed', 'false')
})

test('wall assistant: "which one?" offers tiles and keeps the change; a tap answers with the name', async ({ page }) => {
  await band(page, 'which')
  const section = page.getByRole('region', { name: 'Assistant' })
  await expect(section.getByText('Your change is kept: → 5:00 PM')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('assistant-which.png')
  await section.getByRole('button', { name: /Baseball: Huskies/ }).click()
  await expect(section.getByText('“Baseball: Huskies @ RPB Cascade”')).toBeVisible()
})

test('wall assistant: an answer that offers something gets a one-tap yes, and opens what it is about', async ({ page }) => {
  await band(page, 'answer')
  const section = page.getByRole('region', { name: 'Assistant' })
  await expect(section.getByRole('button', { name: 'Yes, do that' })).toBeVisible()
  await expect(section.getByRole('button', { name: 'Open Softball' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('assistant-answer.png')
  await section.getByRole('button', { name: 'Yes, do that' }).click()
  await expect(section.getByText('“Yes, do that”')).toBeVisible()
})

// The band keeps listening (P3.13), through the fixture's stand-in microphone (window.__mic).
const mic = (page, call) => page.evaluate(call)
const starts = (page) => page.evaluate(() => window.__mic?.starts ?? 0)

test('wall assistant: after an answer the mic opens again by itself; quiet after a plain answer, the band slips away', async ({ page }) => {
  await band(page, 'answer')
  const section = page.getByRole('region', { name: 'Assistant' })
  await expect(section).toBeVisible()
  await expect.poll(() => starts(page)).toBeGreaterThan(0)
  const opened = await starts(page)
  await mic(page, () => window.__mic.say('and what about sunday'))
  await expect(section.getByText('“and what about sunday”')).toBeVisible()
  await expect(section.getByText('You said: and what about sunday.')).toBeVisible()
  await expect.poll(() => starts(page)).toBe(opened + 1)
  await expect(section.getByText('Keep talking, or')).toBeVisible()
  await mic(page, () => window.__mic.quiet())
  await expect(section).toHaveCount(0)
})

test('wall assistant: a card waiting for a yes outlasts the quiet; a spoken no cancels it and the conversation goes on', async ({ page }) => {
  await band(page, 'add')
  const section = page.getByRole('region', { name: 'Assistant' })
  await expect(section.getByText('DRAFT · NOT SAVED YET')).toBeVisible()
  await expect(section.getByText('NEEDS A YES')).toBeVisible()
  await mic(page, () => window.__mic.quiet())
  await expect(section.getByText('DRAFT · NOT SAVED YET')).toBeVisible()
  const before = await starts(page)
  await mic(page, () => window.__mic.no())
  await expect(section.getByText('DRAFT · NOT SAVED YET')).toHaveCount(0)
  await expect.poll(() => starts(page)).toBe(before + 1)
})

test('wall assistant: a spoken yes saves the card and the mic opens again; "that\'s all" closes the band', async ({ page }) => {
  await band(page, 'change')
  const section = page.getByRole('region', { name: 'Assistant' })
  await expect(section.getByText('CHANGE · NOT SAVED YET')).toBeVisible()
  const before = await starts(page)
  await mic(page, () => window.__mic.yes())
  await expect(section.getByText('CHANGE · NOT SAVED YET')).toHaveCount(0)
  await expect.poll(() => starts(page)).toBe(before + 1)
  await mic(page, () => window.__mic.bye())
  await expect(section).toHaveCount(0)
})

test('wall assistant: talk not meant for Casa gets no answer and leaves no trace; two in a row and the band slips away', async ({ page }) => {
  await band(page, 'answer')
  const section = page.getByRole('region', { name: 'Assistant' })
  await expect(section).toBeVisible()
  await mic(page, () => window.__mic.say('psst owen get your shoes on'))
  await expect(section.getByText('“Could Kelly take it instead?”')).toBeVisible()
  await expect(section.getByText(/owen get your shoes/)).toHaveCount(0)
  await mic(page, () => window.__mic.say('psst honey where are my keys'))
  await expect(section).toHaveCount(0)
})

// The LED strip follows the band (P3.14), as the fixture records it (window.__led).
const led = (page) => page.evaluate(() => window.__led)

test('wall assistant: the strip shows listening, then waiting for a yes, and a spoken no swells rust', async ({ page }) => {
  await band(page, 'answer')
  await expect(page.getByRole('region', { name: 'Assistant' })).toBeVisible()
  await expect.poll(async () => (await led(page)).mode).toBe('listening')
  await band(page, 'add')
  await expect(page.getByRole('region', { name: 'Assistant' }).getByText('NEEDS A YES')).toBeVisible()
  await expect.poll(async () => (await led(page)).mode).toBe('waiting')
  await mic(page, () => window.__mic.no())
  await expect.poll(async () => (await led(page)).outcomes).toEqual(['cancel'])
})

test('wall assistant: a spoken yes swells warm gold on the strip', async ({ page }) => {
  await band(page, 'change')
  await expect(page.getByRole('region', { name: 'Assistant' }).getByText('CHANGE · NOT SAVED YET')).toBeVisible()
  await mic(page, () => window.__mic.yes())
  await expect.poll(async () => (await led(page)).outcomes).toEqual(['confirm'])
})

test('wall: Coming up — the eighth tile opens it; an answer takes an item off; gift ideas; back to today (board 07a)', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  const tile = page.getByRole('button', { name: /^Coming up: 6 to plan, 2 to start now/ })
  await expect(tile).toBeVisible()
  await tile.click()
  await expect(page.getByText('6 things to plan')).toBeVisible()
  await expect(page.getByText('START NOW', { exact: true })).toBeVisible()
  await expect(page.getByText('Plan by Sep 21 · late · in 3 days')).toBeVisible()
  await expect(page.getByText('Gift ideas: A fly-fishing reel')).toBeVisible()
  await expect(page).toHaveScreenshot('wall-coming-up.png')
  // Done on the AC appointment: it leaves the list, and the tile counts down.
  const ac = page.locator('div').filter({ hasText: /^.*EDS Air Conditioning appointment/ }).getByRole('button', { name: 'Done' }).first()
  await ac.click()
  await expect(page.getByText('EDS Air Conditioning appointment')).toHaveCount(0)
  await expect(page.getByText('5 things to plan')).toBeVisible()
  await page.getByRole('button', { name: 'Gift ideas · 2' }).click()
  await expect(page.getByRole('region', { name: 'Gift ideas' }).getByText('A soccer-team sweatshirt and T-shirt')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Back to today' }).click()
  await expect(page.getByText('5 things to plan')).toHaveCount(0)
})

// Live on the kiosk 2026-09-27: nine items split by count ran the left column under the week strip.
test('wall: Coming up with a long list — nothing runs under the week strip; "N more" shows the rest (board 07a)', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00&comingUp=live')
  await page.getByRole('button', { name: /^Coming up: 9 to plan/ }).click()
  await expect(page.getByText('9 things to plan')).toBeVisible()
  const fits = () => page.evaluate(() => {
    const strip = document.querySelector('section[aria-label="Next seven days"]').getBoundingClientRect().top
    return [...document.querySelectorAll('button')].filter((b) => b.textContent === 'Not needed').every((b) => b.getBoundingClientRect().bottom <= strip - 8)
  })
  expect(await fits()).toBe(true)
  await expect(page).toHaveScreenshot('wall-coming-up-long.png')
  const more = page.getByRole('button', { name: /^\d+ more$/ })
  const left = Number((await more.textContent()).split(' ')[0])
  await more.click()
  await expect(page.getByText('Veterans Day')).toBeVisible()
  expect(await page.getByRole('button', { name: 'Not needed' }).count()).toBe(left)
  expect(await fits()).toBe(true)
  await page.getByRole('button', { name: 'First page' }).click()
  await expect(page.getByText('EDS Air Conditioning Appointment')).toBeVisible()
})

// Tips while Casa thinks (board 07e): one fitting tip under THINKING; "What can I say?" lists them by topic.
test('wall assistant: while Casa thinks, a tip that fits the question; "What can I say?" lists the rest (board 07e)', async ({ page }) => {
  await band(page, 'thinking')
  const section = page.getByRole('region', { name: 'Assistant' })
  // Live, the mic pauses once a question is sent; the fixture opens listening, so pause it.
  await section.getByRole('button', { name: 'Stop listening' }).click()
  await expect(section.getByText('THINKING', { exact: true })).toBeVisible()
  await expect(section.getByText(/^Tip: /)).toBeVisible()
  await expect(section.getByText(/gift idea/i).first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('assistant-thinking-tip.png')
  await section.getByRole('button', { name: 'What can I say?' }).click()
  for (const topic of ['CALENDAR', 'COMING UP', 'GIFT IDEAS', 'GROCERIES & RECIPES', 'TALKING TO CASA']) await expect(section.getByText(topic, { exact: true })).toBeVisible()
  await expect(section.getByText(/Any spirit day, give me 5 days/)).toBeVisible()
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('assistant-what-can-i-say.png')
  await section.getByRole('button', { name: 'Close the list' }).click()
  await expect(section.getByText(/^Tip: /)).toBeVisible()
})

test('wall assistant: a tip retires once its ability has been used twice', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00')
  await page.evaluate(() => localStorage.setItem('casa-tip-usage', JSON.stringify({ 'gift-save': 2, 'gift-list': 2 })))
  await band(page, 'thinking')
  const section = page.getByRole('region', { name: 'Assistant' })
  // Live, the mic pauses once a question is sent; the fixture opens listening, so pause it.
  await section.getByRole('button', { name: 'Stop listening' }).click()
  await expect(section.getByText(/^Tip: /)).toBeVisible()
  await expect(section.getByText(/gift idea/i)).toHaveCount(0)
})

// Jake, 2026-09-27: "when the AI is open in dark mode … very little differentiation between the AI
// and the calendar". Over the evening face the band is raised and warmer, with a brass edge, and
// the calendar behind steps back.
test('wall assistant: over the evening face the band is a raised layer with a brass edge', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T20:15:00&band=answer')
  const section = page.getByRole('region', { name: 'Assistant' })
  await section.getByRole('button', { name: 'Stop listening' }).click()
  const bg = await section.evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(bg).toBe('rgb(58, 49, 40)')
  await expect(section.getByText('Is anyone driving to softball tomorrow?')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('assistant-over-evening.png')
})

// Swipe between days (2026-09-28): touch on the Pi, two-finger trackpad on the desktop.
const touchSwipe = (page, from, to) => page.evaluate(([from, to]) => {
  const el = document.elementFromPoint(from[0], from[1])
  const at = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [at(...from)], changedTouches: [at(...from)] }))
  el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [at(...to)] }))
}, [from, to])
const shownTile = (page) => page.getByRole('region', { name: 'Next seven days' }).locator('button[aria-pressed="true"]')

test('wall: swiping moves across the days and on to Coming up; a nudge or a tap does not; off while the band is open', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  await expect(shownTile(page)).toHaveAttribute('aria-label', /^Today/)
  await touchSwipe(page, [1500, 600], [1100, 610])
  await expect(shownTile(page)).toHaveAttribute('aria-label', /^Saturday, September 26/)
  await touchSwipe(page, [1100, 600], [1500, 590])
  await expect(shownTile(page)).toHaveAttribute('aria-label', /^Today/)
  // A nudge is nothing; the right end stops at today.
  await touchSwipe(page, [1500, 600], [1420, 600])
  await touchSwipe(page, [1100, 600], [1500, 600])
  await expect(shownTile(page)).toHaveAttribute('aria-label', /^Today/)
  // Seven swipes left: through Thursday, then Coming up; the eighth, To do; one more does nothing.
  for (let i = 0; i < 7; i++) await touchSwipe(page, [1500, 600], [1100, 600])
  await expect(page.getByText('6 things to plan')).toBeVisible()
  await touchSwipe(page, [1500, 600], [1100, 600])
  await touchSwipe(page, [1500, 600], [1100, 600])
  await expect(page.getByText('TO DO · WHAT NEEDS DOING')).toBeVisible()
  await touchSwipe(page, [1100, 600], [1500, 600])
  await touchSwipe(page, [1100, 600], [1500, 600])
  await expect(shownTile(page)).toHaveAttribute('aria-label', /^Thursday, October 1/)
})

test('wall: a two-finger trackpad swipe moves one day; scrolling does not', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  await page.mouse.move(1000, 600)
  await page.mouse.wheel(0, 400)
  await expect(shownTile(page)).toHaveAttribute('aria-label', /^Today/)
  await page.mouse.wheel(200, 0)
  await expect(shownTile(page)).toHaveAttribute('aria-label', /^Saturday, September 26/)
})

test('wall: a swipe is ignored while the assistant band is open', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00&band=answer')
  await expect(page.getByRole('region', { name: 'Assistant' })).toBeVisible()
  await touchSwipe(page, [1500, 400], [1100, 400])
  await expect(shownTile(page)).toHaveAttribute('aria-label', /^Today/)
  await expect(page.getByRole('region', { name: 'Assistant' })).toBeVisible()
})

// Board 08a (approved 2026-09-28): an event with nobody on it waits on a "No one yet" row.
test('wall: an event with nobody on it waits on the "No one yet" row; a tap opens it on Who', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T08:09:00&nobody=1')
  const score = page.getByRole('region', { name: "TODAY · WHO'S WHERE" })
  await expect(score.getByText('No one yet')).toBeVisible()
  await expect(score.getByText('Portfolio trigger review')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('no-one-yet.png')
  await score.getByRole('button', { name: /Portfolio trigger review: no one on it yet/ }).click()
  const sheet = page.getByRole('region', { name: /Portfolio trigger review/ })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: /^Who/ })).toHaveAttribute('aria-pressed', 'true')
})

test('wall: no "No one yet" row when everything has someone', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T08:09:00')
  await expect(page.getByText('No one yet')).toHaveCount(0)
})

// To do (P3.22, board 09b, approved 2026-09-28).
test('wall: To do — the tile opens Next up; Done and "Not now" answer an item; groups open one at a time; Casa noticed waits for a yes (board 09b)', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:10:00')
  await page.getByRole('button', { name: /^To do: 4 ready now/ }).click()
  await expect(page.getByText('4 ready now')).toBeVisible()
  await expect(page.getByText('Replace the outside GFI outlet')).toBeVisible()
  await expect(page.getByText('Quick one · was due Aug 24 · 15 min · Call')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('wall-todo.png')

  // Done takes it off.
  const anthony = page.locator('div').filter({ hasText: /^Call Anthony about house insurance alternatives/ }).first()
  await page.getByRole('button', { name: 'Done' }).nth(3).click()
  await expect(page.getByText('3 ready now')).toBeVisible()
  // Not now: a quiet link that offers when; picking one takes it out of Next up.
  await page.getByRole('button', { name: 'Not now' }).first().click()
  await expect(page.getByText('Not now — back in')).toBeVisible()
  await page.getByRole('button', { name: '3 days' }).click()
  await expect(page.getByText('2 ready now')).toBeVisible()

  // One group open at a time.
  await page.getByRole('button', { name: /^Fixes/ }).click()
  await expect(page.getByText('Troubleshoot the water heater E05 error').first()).toBeVisible()
  await page.getByRole('button', { name: /^Quick ones/ }).click()
  await expect(page.getByRole('button', { name: /^Fixes/ })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('Look for a cable to fix the pool')).toBeVisible()

  // Casa noticed: each waits for a yes.
  await page.getByRole('button', { name: /^Casa noticed/ }).click()
  await expect(page.getByText('Looks over — close it?')).toBeVisible()
  await page.getByRole('button', { name: 'Yes' }).first().click()
  await expect(page.getByText('Pick up Owen’s birthday cupcakes')).toHaveCount(0)

  await page.getByRole('button', { name: 'Back to today' }).click()
  await expect(page.getByText('TODAY · WHO\'S WHERE')).toBeVisible()
})

test('wall: swiping past Coming up reaches To do', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  await page.getByRole('button', { name: /^Coming up:/ }).click()
  await expect(page.getByText('6 things to plan')).toBeVisible()
  await touchSwipe(page, [1500, 600], [1100, 600])
  await expect(page.getByText('TO DO · WHAT NEEDS DOING')).toBeVisible()
  await touchSwipe(page, [1500, 600], [1100, 600])
  await expect(page.getByText('TO DO · WHAT NEEDS DOING')).toBeVisible()
  await touchSwipe(page, [1100, 600], [1500, 600])
  await expect(page.getByText('6 things to plan')).toBeVisible()
})

// The surface of To do (board 09a): tonight's nudge on the evening face; one small job in a quiet stretch.
test('wall: tonight\'s nudge leads the evening face with Done; a quiet stretch offers one small job (board 09a)', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T20:15:00')
  const tonight = page.getByRole('region', { name: 'Tonight’s reminder', exact: true })
  await expect(tonight.getByText('TONIGHT · 8:00')).toBeVisible()
  await expect(tonight.getByText('Trash out to the street')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('evening-nudge.png')
  await tonight.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('region', { name: 'Tonight’s reminder', exact: true })).toHaveCount(0)
  await expect(page.getByText('TOMORROW', { exact: true }).first()).toBeVisible()

  // Not before two hours ahead.
  await page.goto('/__wall-fixture?at=2026-09-25T17:30:00')
  await expect(page.getByRole('region', { name: 'Tonight’s reminder', exact: true })).toHaveCount(0)
})

test('wall: in a quiet stretch, one small job with Done', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T10:30:00')
  await expect(page.getByText(/A quiet stretch/)).toBeVisible()
  const meanwhile = page.getByRole('region', { name: 'Meanwhile' })
  await expect(meanwhile.getByText(/MEANWHILE · \d+ MIN/)).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('calm-meanwhile.png')
  await meanwhile.getByRole('button', { name: 'Done' }).click()
  await expect(meanwhile.getByText(/MEANWHILE/)).toBeVisible() // the next one that fits takes its place
})

// Step 5 (Jake 2026-09-28): tap into a project to change its steps and target date; tap a to-do to edit it.
const openTodo = async (page) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:10:00')
  await page.getByRole('button', { name: /^To do:/ }).click()
  await expect(page.getByText('TO DO · WHAT NEEDS DOING')).toBeVisible()
}

test('wall: a project in full — the next step, done, reorder, delete a step, target date (board 09c)', async ({ page }) => {
  await openTodo(page)
  await page.getByRole('button', { name: /^Projects/ }).click()
  await page.getByRole('button', { name: 'Open Paint the house' }).click()
  await expect(page.getByText('1 of 5 steps done')).toBeVisible()
  await expect(page.getByText('NEXT STEP · ON YOUR PHONE')).toBeVisible()
  await expect(page.getByText('in 62 days')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('wall-project.png')

  // Reorder: "Move patio furniture" up one.
  await page.getByRole('button', { name: 'Move Move patio furniture, cover plants up' }).click()
  const later = await page.locator('span.truncate.text-wall-body').allInnerTexts()
  expect(later).toEqual(['Pick colours — buy 3 sample pots', 'Move patio furniture, cover plants', 'Choose the painter and book dates'])
  // Delete one.
  await page.getByRole('button', { name: 'Delete Choose the painter and book dates' }).click()
  await expect(page.getByText('1 of 4 steps done')).toBeVisible()
  // Done on the next step: the one after takes its place.
  await page.getByRole('button', { name: 'Done', exact: true }).first().click()
  await expect(page.getByText('2 of 4 steps done')).toBeVisible()
  await expect(page.locator('div.bg-wall-ink').getByText('Pick colours — buy 3 sample pots')).toBeVisible()
  // Target date: a month ahead.
  await page.getByRole('button', { name: 'Change', exact: true }).click()
  await page.getByRole('button', { name: 'Month after' }).click()
  await page.getByRole('button', { name: 'Tuesday, December 15' }).click()
  await expect(page.getByText(/Tue, December 15/)).toBeVisible()
  await page.getByRole('button', { name: 'Back to the list' }).click()
  await expect(page.getByText('NEXT UP')).toBeVisible()
})

test('wall: a to-do — tap it to add a date and time, then delete it', async ({ page }) => {
  await openTodo(page)
  await page.getByRole('button', { name: 'Edit Call Anthony about house insurance alternatives' }).click()
  const sheet = page.getByRole('region', { name: /Call Anthony about house insurance alternatives — edit/ })
  await expect(sheet.getByText('No date', { exact: true }).first()).toBeVisible()
  await sheet.getByRole('button', { name: 'Add a date' }).click()
  await sheet.getByRole('button', { name: 'Wednesday, September 30' }).click()
  await sheet.getByRole('button', { name: '8p' }).click()
  await sheet.getByRole('button', { name: ':30' }).click()
  await expect(sheet.getByText('Wednesday, September 30 · 8:30 PM')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('wall-todo-sheet.png')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByText(/Quick one · Sep 30/)).toBeVisible()

  await page.getByRole('button', { name: 'Edit Call Anthony about house insurance alternatives' }).click()
  await page.getByRole('button', { name: 'Delete…' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('Call Anthony about house insurance alternatives')).toHaveCount(0)
})
