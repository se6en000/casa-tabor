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
  await page.getByRole('button', { name: /^To do: 3 ready now/ }).click()
  await expect(page.getByText('3 ready now')).toBeVisible()
  await expect(page.getByText('Replace the outside GFI outlet')).toBeVisible()
  // What it takes as pills (board 10a); late in rust.
  await expect(page.getByText('was due Aug 24', { exact: true })).toBeVisible()
  // Projects on their own shelf (P3.23, canvas 10a), not a folded group.
  const shelf = page.getByRole('region', { name: 'Projects' })
  await expect(shelf.getByText('PROJECTS · 3 GOING')).toBeVisible()
  await expect(shelf.getByText('next: Mario’s quote')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Projects/ })).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('wall-todo.png')

  // Done takes it off; the next one moves up beside the shelf.
  await page.getByRole('button', { name: 'Done' }).nth(2).click()
  await expect(page.getByText('Call Anthony about house insurance alternatives')).toBeVisible()
  await expect(page.getByText('3 ready now')).toBeVisible()
  // Not now: a quiet link that offers when; picking one takes it out of Next up.
  await page.getByRole('button', { name: 'Not now' }).first().click()
  await expect(page.getByText('Not now — back in')).toBeVisible()
  await page.getByRole('button', { name: '3 days' }).click()
  await expect(page.getByText('2 ready now')).toBeVisible()

  // One group open at a time; the shelf steps aside while one is open.
  await page.getByRole('button', { name: /^Fixes/ }).click()
  await expect(page.getByText('Troubleshoot the water heater E05 error').first()).toBeVisible()
  await expect(page.getByRole('region', { name: 'Projects' })).toHaveCount(0)
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

// Projects, your way (P3.23, canvas 10b–10d, approved by Jake 2026-09-29): the project page is where
// you work; a step's details open beside the list; Project settings is the same screen for every project.
const openPaint = async (page) => {
  await openTodo(page)
  await page.getByRole('region', { name: 'Projects' }).getByRole('button', { name: 'Open Paint the house' }).click()
  await expect(page.getByText('3 of 9 done')).toBeVisible()
}
const typeOnWall = async (page, text) => {
  const keyboard = page.getByRole('region', { name: 'Keyboard' })
  for (const key of text) await keyboard.getByRole('button', { name: key === ' ' ? 'space' : new RegExp(`^${key}$`, 'i') }).first().click()
  await keyboard.getByRole('button', { name: 'Done', exact: true }).click()
}
const plan = (page) => page.getByRole('region', { name: /— project$/ }).locator('button[aria-label^="Open "]').allInnerTexts()

test('wall: a project page — Now, Then lines, a project inside; drag a step beside another; add one on a Then line (canvas 10b)', async ({ page }) => {
  await openPaint(page)
  await expect(page.getByText('NOW · ON YOUR PHONE')).toBeVisible()
  await expect(page.getByText('A PROJECT INSIDE', { exact: true })).toBeVisible()
  await expect(page.getByText('At your pace: Oct 23')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('wall-project.png')

  // Drag "Take down shutters" by its handle onto "Choose the painter": side by side with it.
  const grip = await page.getByRole('button', { name: 'Hold and drag to move Take down shutters and house numbers' }).boundingBox()
  const onto = await page.getByRole('button', { name: 'Open Choose the painter and book dates' }).boundingBox()
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2, grip.y - 40, { steps: 4 })
  await page.mouse.move(grip.x + grip.width / 2, onto.y + onto.height * 0.8, { steps: 8 })
  await page.mouse.up()
  expect(await plan(page)).toEqual(['Pick colours: 3 sample pots', 'Choose the painter and book dates', 'Take down shutters and house numbers', 'Move patio furniture, cover plants', 'The painter: 5 days, a dry week', 'Touch-ups and the final walk-round'])
  await expect(page.getByText('SIDE BY SIDE · ANY ORDER').nth(1)).toBeVisible()

  // "+ Add here" on the Then line before the painter: a group of its own there.
  await page.getByRole('button', { name: '+ Add here' }).nth(2).click()
  await typeOnWall(page, 'tarps')
  expect((await plan(page)).slice(3, 6)).toEqual(['Move patio furniture, cover plants', 'Tarps', 'The painter: 5 days, a dry week'])

  // Done in Now: the colours go; the project inside is still Now.
  await page.getByRole('button', { name: 'Mark Pick colours: 3 sample pots done' }).click()
  await expect(page.getByText('4 of 10 done')).toBeVisible()

  // The project inside opens on its own page, and comes back.
  await page.getByRole('region', { name: /— project$/ }).getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.getByText('TO DO › PROJECTS › INSIDE PAINT THE HOUSE')).toBeVisible()
  await page.getByRole('button', { name: 'Back to Paint the house' }).click()
  await expect(page.getByText('4 of 10 done')).toBeVisible()
  await page.getByRole('button', { name: 'Back to the list' }).click()
  await expect(page.getByText('NEXT UP')).toBeVisible()
})

// Jake, 2026-09-29, on the wall: "the drag does not work on the touch screen … it seems to let go of
// the drag once I try to move it". A finger, not a mouse: the browser took the touch for a scroll.
test.describe('touchscreen', () => {
  test.use({ hasTouch: true })
  test('wall: a project step drags with a finger — the touch isn’t taken for a scroll', async ({ page }) => {
    await openPaint(page)
    const cdp = await page.context().newCDPSession(page)
    const grip = await page.getByRole('button', { name: 'Hold and drag to move Take down shutters and house numbers' }).boundingBox()
    const onto = await page.getByRole('button', { name: 'Open Choose the painter and book dates' }).boundingBox()
    const x = grip.x + grip.width / 2
    const to = onto.y + onto.height * 0.8
    let y = grip.y + grip.height / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    while (y > to) {
      y = Math.max(to, y - 12)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    expect(await plan(page)).toEqual(['Pick colours: 3 sample pots', 'Choose the painter and book dates', 'Take down shutters and house numbers', 'Move patio furniture, cover plants', 'The painter: 5 days, a dry week', 'Touch-ups and the final walk-round'])
  })
})

// Jake, 2026-09-29: "on the pop up keyboard, can you add a 'mic' option so I can do speech to text" —
// "the screen should show the text in realtime like the way the AI works".
test('wall: the keyboard’s Say it — words show as they’re heard, and land when he pauses', async ({ page }) => {
  await openPaint(page)
  await page.getByRole('button', { name: '+ Add a step' }).click()
  await page.getByRole('button', { name: 'Say it' }).click()
  await expect(page.getByRole('button', { name: 'Stop listening' })).toBeVisible()
  await page.evaluate(() => window.__mic.hear('buy drop'))
  await expect(page.getByText(/^Buy drop\|$/)).toBeVisible()
  await page.evaluate(() => window.__mic.say('buy drop cloths'))
  await expect(page.getByText(/^Buy drop cloths\|$/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Say it' })).toBeVisible()
  await page.getByRole('region', { name: 'Keyboard' }).getByRole('button', { name: 'Done', exact: true }).click()
  expect(await plan(page)).toContain('Buy drop cloths')
})

// A project's dated step on Coming up opens its project (P3.23 step 2, canvas 10e).
test('wall: Coming up — a project’s dated step, named for its project, opens the project', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:10:00&comingUp=projects')
  await page.getByRole('button', { name: /^Coming up:/ }).click()
  await expect(page.getByText('Choose the painter and book dates')).toBeVisible()
  await expect(page.getByText('Paint the house', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open project' }).click()
  await expect(page.getByRole('region', { name: 'Paint the house — project' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to the list' }).click()
  await expect(page.getByText('TO DO · WHAT NEEDS DOING')).toBeVisible()
})

// The seasons arrive as projects (P3.23, canvas 11c): Start it opens this year's, from the plan.
test('wall: Coming up — a season starts as this year’s project, in Jake’s order, and opens', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:10:00&comingUp=projects')
  await page.getByRole('button', { name: /^Coming up:/ }).click()
  await page.getByRole('button', { name: 'Start it' }).click()
  const lights = page.getByRole('region', { name: 'Christmas lights — project' })
  await expect(lights).toBeVisible()
  await expect(lights.getByText('NOW · ON YOUR PHONE')).toBeVisible()
  expect(await plan(page)).toEqual(['Storage unit run: the lights and wreaths', 'Plug everything in, list what’s dead', 'Buy new lights', 'Indoor window trim lights', 'Outdoor wreaths and bush lights', 'Palm tree lights', 'Set the timers, a night walk-round'])
  await expect(lights.getByText('SIDE BY SIDE · ANY ORDER')).toBeVisible()
  await lights.getByRole('button', { name: 'Open Indoor window trim lights' }).click()
  await expect(page.getByRole('switch', { name: 'The same job, many times' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'Back to the list' }).click()
  await expect(page.getByRole('region', { name: 'Projects' }).getByText('Christmas lights')).toBeVisible()
})

// Board 10a (Jake: "gold for done, brown/black for the current step … the diagonal line for in progress"
// and "the seasonal prep with that dotted line"): the full shelf, and a season starting from its card.
test('wall: the projects shelf — progress by colour, a project inside hatched, a season coming up dashed and started from its card (canvas 10a)', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:10:00&comingUp=projects')
  await page.getByRole('button', { name: /^To do:/ }).click()
  const shelf = page.getByRole('region', { name: 'Projects' })
  await expect(shelf.getByText('SEASONAL · STARTS NOV 5')).toBeVisible()
  await expect(shelf.getByText('7 steps · ~11 hr · a plan ready')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('wall-todo-shelf.png')
  await shelf.getByRole('button', { name: 'Christmas lights: coming up' }).click()
  await page.getByRole('button', { name: 'Start it now' }).click()
  await expect(page.getByRole('region', { name: 'Christmas lights — project' })).toBeVisible()
})

// A project step on the calendar (P3.23; Jake: "I should be able to click on it and have some UX that
// says done … or just let the day pass?"): the event knows its step; a passed day is asked about.
test('wall: a project step’s calendar event — Done ticks the step, Open project opens it', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:10:00&stepEvent=1')
  await page.getByText('Paint the house: Pick colours: 3 sample pots').click()
  const sheet = page.getByRole('region', { name: /Pick colours: 3 sample pots details/ })
  await expect(sheet.getByText('A PROJECT STEP')).toBeVisible()
  // An all-day event's day is its UTC date (it once said Thu for a Fri event).
  await expect(sheet.getByText('TODAY · ALL DAY')).toBeVisible()
  await expect(sheet.getByText(/Step 4 of 9 in/)).toBeVisible()
  await expect(sheet.getByText(/change them on the project page/)).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('wall-step-event.png')
  await sheet.getByRole('button', { name: 'Done — tick the step' }).click()
  await expect(sheet.getByText('Done', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Open project' }).click()
  await expect(page.getByRole('region', { name: 'Paint the house — project' })).toBeVisible()
})

test('wall: a dated step whose day has passed is asked about — Not yet moves it', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:10:00&stepEvent=1')
  await page.getByRole('button', { name: /^To do:/ }).click()
  await expect(page.getByText('It was yesterday. Done?')).toBeVisible()
  await page.getByRole('button', { name: 'Not yet' }).click()
  await page.getByRole('button', { name: 'Tomorrow', exact: true }).click()
  await expect(page.getByText('It was yesterday. Done?')).toHaveCount(0)
})

test('wall: a step’s details — the same controls for every step: who, time (same job ×10), cost on the number pad, when, calendar (canvas 10c)', async ({ page }) => {
  await openPaint(page)
  await page.getByRole('button', { name: 'Open The painter: 5 days, a dry week' }).click()
  const panel = page.getByRole('region', { name: 'The painter: 5 days, a dry week — details' })
  await expect(panel.getByText('STEP 8 OF 9 · PAINT THE HOUSE')).toBeVisible()
  await expect(panel.getByText('theirs (painter)')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Change the dates' })).toHaveText('Nov 9 – Nov 13')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('wall-project-step.png')

  // A cost typed on the number pad, not picked from chips.
  await panel.getByRole('button', { name: 'Change the cost' }).click()
  const pad = page.getByRole('region', { name: /number pad/ })
  for (let i = 0; i < 4; i++) await pad.getByRole('button', { name: 'Delete a digit' }).click()
  for (const d of '6800') await pad.getByRole('button', { name: d, exact: true }).click()
  await pad.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Change the cost' })).toHaveText('$6,800')

  // Another step: the very same controls. The same job, many times.
  await page.getByRole('button', { name: 'Open Take down shutters and house numbers' }).click()
  const shutters = page.getByRole('region', { name: 'Take down shutters and house numbers — details' })
  for (const label of ['WHO', 'EFFORT', 'COST', 'WHEN IT FITS', 'ON THE CALENDAR', 'NOTES']) await expect(shutters.getByText(label, { exact: true })).toBeVisible()
  await shutters.getByRole('switch', { name: 'The same job, many times' }).click()
  for (let i = 0; i < 4; i++) await shutters.getByRole('button', { name: 'More', exact: true }).click()
  await expect(shutters.getByRole('button', { name: 'Change the effort' })).toHaveText('2 hr')
  // A quick change from the row itself.
  await page.getByRole('button', { name: 'Change who does Take down shutters and house numbers' }).click()
  await page.getByRole('button', { name: 'Kelly', exact: true }).last().click()
  await expect(page.getByRole('button', { name: 'Change who does Take down shutters and house numbers' })).toHaveText('Kelly')
  // ↑ Earlier: out of its shared group, just above.
  await shutters.getByRole('button', { name: 'Move it earlier' }).click()
  expect((await plan(page)).slice(2, 4)).toEqual(['Take down shutters and house numbers', 'Move patio furniture, cover plants'])
})

test('wall: Project settings — the goal, who does what, the phone, every year, status (canvas 10d)', async ({ page }) => {
  await openPaint(page)
  await page.getByRole('button', { name: 'Project settings' }).click()
  await expect(page.getByText('PAINT THE HOUSE › SETTINGS')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('wall-project-settings.png')
  await page.getByRole('button', { name: 'Everything in “Now”' }).click()
  await expect(page.getByText(/Every step in Now is on your Reminders list/)).toBeVisible()
  await page.getByRole('switch', { name: 'Comes back every year' }).click()
  await expect(page.getByText(/Next year starts from this year’s steps/)).toBeVisible()
  await page.getByRole('button', { name: '+ Add someone' }).click()
  await typeOnWall(page, 'brush bros')
  await typeOnWall(page, 'painter')
  await expect(page.getByText('Brush bros')).toBeVisible()
  await page.getByRole('button', { name: 'Back to the plan' }).click()
  await expect(page.getByText('NOW · ON YOUR PHONE')).toBeVisible()
})

test('wall: a to-do — tap it to add a date and time, then delete it', async ({ page }) => {
  await openTodo(page)
  await page.getByRole('button', { name: /^Quick ones/ }).click()
  await page.getByRole('button', { name: 'Edit Look for a cable to fix the pool' }).click()
  const sheet = page.getByRole('region', { name: /Look for a cable to fix the pool — edit/ })
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
