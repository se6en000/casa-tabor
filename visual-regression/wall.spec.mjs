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
  // The face says it's tomorrow, so the decision doesn't repeat it (polish, 2026-10-01).
  await expect(wall.getByText('Baseball and Softball are both at Ferrin Park Field 1 at 12:30.', { exact: true })).toBeVisible()
  await expect(wall.getByRole('button', { name: 'Needs a decision' }).first()).toBeVisible()
  await expect(wall).toHaveScreenshot('evening-decisions.png')

  await wall.getByRole('button', { name: 'Keep two trips' }).click()
  await expect(wall.getByText('Baseball at 12:30 needs a driver.', { exact: true })).toBeVisible()
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

// Jake, 2026-09-29: "for pack and get lists, can you make it so I can manually add items to it … I should
// be able to add to any item on the cal or reminder." + Add on the details, for an event or a reminder.
test('wall: get & pack — add a line to any event or reminder from its details', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T20:15:00')
  const wall = page.getByTestId('wall-fixture')
  await wall.getByRole('button', { name: 'Open Softball: Huskies @ RPB Cascade' }).first().click()
  const sheet = wall.getByRole('region', { name: 'Softball: Huskies @ RPB Cascade details' })
  const header = sheet.getByText(/^GET & PACK · \d+ OF \d+$/)
  await expect(header).toBeVisible()
  const before = Number((await header.textContent()).match(/OF (\d+)$/)[1])
  await sheet.getByRole('button', { name: 'Add to get & pack' }).click()
  await typeOnWall(page, 'bug spray')
  await expect(sheet.getByRole('button', { name: 'Bug spray' })).toBeVisible()
  await expect(sheet.getByText(new RegExp(`OF ${before + 1}$`))).toBeVisible()
  await expect(wall).toHaveScreenshot('event-add-pack-item.png')
  await sheet.getByRole('button', { name: 'Close' }).click()

  // A reminder has no list yet: the section is there, empty, with its + Add.
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  await wall.getByRole('button', { name: 'Open Pick up Photobook for Liv' }).first().click()
  const reminder = wall.getByRole('region', { name: 'Pick up Photobook for Liv details' })
  await expect(reminder.getByText('GET & PACK', { exact: true })).toBeVisible()
  await reminder.getByRole('button', { name: 'Add to get & pack' }).click()
  await typeOnWall(page, 'receipt')
  await expect(reminder.getByRole('button', { name: 'Receipt' })).toBeVisible()
  await expect(reminder.getByText('GET & PACK · 0 OF 1')).toBeVisible()
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
  await expect(section.getByText(/Kelly · busy/)).toBeVisible()
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

// Jake, 2026-09-29, planning Emme's costume: "the ai dismisses like a second after it makes a statement.
// It's gotta stay open till we either agree or I dismiss it." Once there's a conversation, quiet, room
// noise and asides only turn the mic off; he carries on with the mic or the wake word, or closes it.
test('wall assistant: after an answer the mic opens again by itself; quiet or room noise only turns the mic off — the band stays', async ({ page }) => {
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
  await expect(section.getByText('You said: and what about sunday.')).toBeVisible()
  await expect(section.getByText(/Say the wake word/)).toBeVisible()
  // Sound the mic can't make words of (the room, the TV): the same — the mic goes off, the answer stays.
  await section.getByRole('button', { name: 'Talk', exact: true }).click()
  await mic(page, () => window.__mic.noise())
  await expect(section.getByText('You said: and what about sunday.')).toBeVisible()
})

test('wall assistant: woken with nothing said, the band still slips away', async ({ page }) => {
  await band(page, 'empty')
  const section = page.getByRole('region', { name: 'Assistant' })
  await expect(section).toBeVisible()
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

test('wall assistant: talk not meant for Casa gets no answer and leaves no trace; two in a row and the mic goes off, the band stays', async ({ page }) => {
  await band(page, 'answer')
  const section = page.getByRole('region', { name: 'Assistant' })
  await expect(section).toBeVisible()
  await mic(page, () => window.__mic.say('psst owen get your shoes on'))
  await expect(section.getByText('“Could Kelly take it instead?”')).toBeVisible()
  await expect(section.getByText(/owen get your shoes/)).toHaveCount(0)
  await mic(page, () => window.__mic.say('psst honey where are my keys'))
  await expect(section.getByText('“Could Kelly take it instead?”')).toBeVisible()
  await expect(section.getByText(/Say the wake word/)).toBeVisible()
})

// Plan it with Casa (P3.25 phase 3; boards 12b–12d, approved by Jake 2026-09-29).
test('wall assistant: a plan — the draft beside the conversation, one card with ticks, Agree, then each line opens where it lives, and Undo', async ({ page }) => {
  await band(page, 'plan')
  const section = page.getByRole('region', { name: 'Assistant' })
  await section.getByRole('button', { name: 'Stop listening' }).click()
  const draft = section.getByRole('region', { name: 'Emme — light-up jellyfish — the plan' })
  await expect(draft.getByText('PLAN · NOT SAVED YET')).toBeVisible()
  // What changed is the tan on its line, not a list on top (Jake, 2026-09-29).
  await expect(draft.getByText(/Just changed/)).toHaveCount(0)
  await expect(draft.getByText('A project inside Halloween costumes')).toBeVisible()
  await expect(section.getByText('THIS CONVERSATION')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('plan-draft.png')

  await draft.getByRole('button', { name: 'Set it up…' }).click()
  const agree = page.getByRole('region', { name: 'Set up Emme — light-up jellyfish' })
  await expect(agree.getByText('PROJECT · INSIDE HALLOWEEN COSTUMES')).toBeVisible()
  await expect(agree.getByRole('button', { name: 'Agree · set up 8 things' })).toBeVisible()
  await agree.getByRole('button', { name: /^Iridescent ribbon/ }).click()
  await expect(agree.getByRole('button', { name: 'Agree · set up 7 things' })).toBeVisible()
  // An event left out takes its pack lines with it (there'd be nothing to pack for).
  await agree.getByRole('button', { name: /^Trick-or-treat/ }).click()
  await expect(agree.getByRole('button', { name: /^Spare AA batteries/ })).toHaveAttribute('aria-pressed', 'false')
  await agree.getByRole('button', { name: /^Trick-or-treat/ }).click()
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('plan-agree.png')
  await agree.getByRole('button', { name: 'Agree · set up 7 things' }).click()

  const saved = page.getByRole('region', { name: 'Emme — light-up jellyfish — saved' })
  await expect(saved.getByText('Emme — light-up jellyfish is set up')).toBeVisible()
  await expect(saved.getByText('Left out: Iridescent ribbon.')).toBeVisible()
  await expect(saved.getByText('3 lines on the shopping list')).toBeVisible()
  await expect(saved.getByRole('button', { name: 'Open project' }).first()).toBeVisible()
  await expect(saved.getByText('Undo works until Thu 11:59 PM.')).toBeVisible()
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('plan-saved.png')
  await saved.getByRole('button', { name: 'Undo this plan' }).click()
  await expect(saved.getByText('Emme — light-up jellyfish is undone')).toBeVisible()
})

// Jake, 2026-09-29: "it stops listening after the plan is suggested, it should keep listening the whole
// time". While a plan is on screen, quiet or room noise reopen the mic rather than turning it off.
// Phase 4 (P3.25; Jake: "if Olive changes her costume from scuba diver to Chucky, it will need the
// ability to completely redo the plan" … "mark it … so we know it's closed/not active").
test('wall assistant: a plan that replaces a saved project and changes another — what closes first, then the changes', async ({ page }) => {
  await band(page, 'plan-change')
  const section = page.getByRole('region', { name: 'Assistant' })
  await section.getByRole('button', { name: 'Stop listening' }).click()
  const draft = section.getByRole('region', { name: 'Liv is Chucky now — the plan' })
  await expect(draft.getByText('CLOSING')).toBeVisible()
  await expect(draft.getByText('Changed to Chucky · 2 steps not done come off')).toBeVisible()
  await expect(draft.getByText('CHANGES TO EMME — JELLYFISH')).toBeVisible()
  await expect(draft.getByText('→ Sun, Oct 18 · Kelly')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('plan-change-draft.png')
  await draft.getByRole('button', { name: 'Set it up…' }).click()
  const agree = page.getByRole('region', { name: 'Set up Liv is Chucky now' })
  await expect(agree.getByText('TAKING OFF')).toBeVisible()
  await expect(agree.getByRole('button', { name: /^Close Liv — scuba diver/ })).toBeVisible()
  await expect(agree.getByRole('button', { name: 'Agree · set up 5 things' })).toBeVisible()
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('plan-change-agree.png')
})

test('wall assistant: while a plan is on screen, the mic keeps listening through quiet and noise', async ({ page }) => {
  await band(page, 'plan')
  const section = page.getByRole('region', { name: 'Assistant' })
  await expect(section).toBeVisible()
  await expect.poll(() => starts(page)).toBeGreaterThan(0)
  const before = await starts(page)
  await mic(page, () => window.__mic.quiet())
  await expect.poll(() => starts(page)).toBe(before + 1)
  await expect(section.getByRole('button', { name: 'Stop listening' })).toBeVisible()
  await mic(page, () => window.__mic.noise())
  await expect.poll(() => starts(page)).toBe(before + 2)
})

test('wall assistant: a plan by voice — "yes" opens the Agree card, a second "yes" saves what’s ticked', async ({ page }) => {
  await band(page, 'plan')
  const section = page.getByRole('region', { name: 'Assistant' })
  await expect(section).toBeVisible()
  await expect.poll(() => starts(page)).toBeGreaterThan(0)
  await mic(page, () => window.__mic.yes())
  const agree = page.getByRole('region', { name: 'Set up Emme — light-up jellyfish' })
  await expect(agree).toBeVisible()
  await expect(section.getByRole('region', { name: 'Emme — light-up jellyfish — saved' })).toHaveCount(0)
  await mic(page, () => window.__mic.yes())
  await expect(page.getByRole('region', { name: 'Emme — light-up jellyfish — saved' })).toBeVisible()
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

// Jake, 2026-09-29: "on gift ideas, allow me to edit them, some brands don't get translated well and I
// need to correct it, otherwise I will forget what I was talking about."
test('wall: a gift idea can be corrected on the keyboard, or removed', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  await page.getByRole('button', { name: /^Coming up: / }).click()
  await page.getByRole('button', { name: 'Gift ideas · 2' }).click()
  const sheet = page.getByRole('region', { name: 'Gift ideas' })
  await sheet.getByRole('button', { name: 'Change “A fly-fishing reel”' }).click()
  await typeOnWall(page, ' orvis')
  await expect(sheet.getByRole('button', { name: 'Change “A fly-fishing reel orvis”' })).toBeVisible()
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('wall-gift-idea-edit.png')
  await sheet.getByRole('button', { name: 'Remove “A soccer-team sweatshirt and T-shirt”' }).click()
  await sheet.getByRole('button', { name: 'Yes, remove it' }).click()
  await expect(sheet.getByText('A soccer-team sweatshirt and T-shirt')).toHaveCount(0)
})

// Overnight queue (2), Jake 2026-09-29: "on a desktop, I want to use the native keyboard … not the Casa
// version". Off the kiosk, a slim bar with a real field takes the typing; Enter is done.
test('wall: on a desktop, the computer’s keyboard types — a slim bar, not Casa’s keys', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00&keyboard=device')
  await page.getByRole('button', { name: /^Coming up: / }).click()
  await page.getByRole('button', { name: 'Gift ideas · 2' }).click()
  const sheet = page.getByRole('region', { name: 'Gift ideas' })
  await sheet.getByRole('button', { name: 'Change “A fly-fishing reel”' }).click()
  const keyboard = page.getByRole('region', { name: 'Keyboard' })
  await expect(keyboard.getByRole('button', { name: 'q', exact: true })).toHaveCount(0)
  await expect(keyboard.getByRole('textbox', { name: 'Type here' })).toBeFocused()
  await page.keyboard.press('End')
  await page.keyboard.type(' (Orvis)')
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('wall-device-keyboard.png')
  await page.keyboard.press('Enter')
  await expect(keyboard).toHaveCount(0)
  await expect(sheet.getByRole('button', { name: 'Change “A fly-fishing reel (Orvis)”' })).toBeVisible()
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

// P3.25 phase 1: while Casa looks things up for a longer think, the band says what it's doing
// instead of a tip (Jake: "extra time is fine when planning, as long as it does a good job").
test('wall assistant: while Casa looks something up, the band says what (the live line replaces the tip)', async ({ page }) => {
  await band(page, 'looking-up')
  const section = page.getByRole('region', { name: 'Assistant' })
  await section.getByRole('button', { name: 'Stop listening' }).click()
  await expect(section.getByText('THINKING', { exact: true })).toBeVisible()
  await expect(section.getByText('Searching the web: outdoor Halloween decorations Florida Reddit')).toBeVisible()
  await expect(section.getByText('One moment')).toHaveCount(0)
  await expect(section.getByText(/^Tip: /)).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('assistant-looking-up.png')
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

// Any day (Jake, 2026-09-29/30): "Show me the events on October 17th" → "Open Saturday, Oct 17", and the
// week around it comes onto the strip ("load the week so I can swipe before and after the day I asked about").
test('wall: Casa opens a far day; the week around it is on the strip to swipe through', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00&band=open-day&far=1')
  const band = page.getByRole('region', { name: 'Assistant' })
  await band.getByRole('button', { name: 'Stop listening' }).click()
  await band.getByRole('button', { name: 'Open Saturday, Oct 17' }).click()
  await expect(band).toBeHidden()
  await expect(page.getByText('LOOKING AHEAD · SATURDAY, OCT 17')).toBeVisible()
  await expect(page.getByText('Emme’s build night').first()).toBeVisible()
  await expect(shownTile(page)).toHaveAttribute('aria-label', /^Saturday, October 17/)
  const strip = page.getByRole('region', { name: 'Next seven days' })
  await expect(strip.locator('button[aria-label^="Today"]')).toHaveCount(1)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('far-day.png')
  await touchSwipe(page, [1500, 600], [1100, 610])
  await expect(shownTile(page)).toHaveAttribute('aria-label', /^Sunday, October 18/)
  await expect(page.getByText('Green Market').first()).toBeVisible()
  for (let i = 0; i < 3; i++) await touchSwipe(page, [1100, 600], [1500, 590])
  await expect(shownTile(page)).toHaveAttribute('aria-label', /^Thursday, October 15/)
  await expect(page.getByText('Owen dentist').first()).toBeVisible()
  // A swipe swallows the click it leaves behind for 450 ms (useDaySwipe); a real tap comes later.
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Back to today' }).click()
  await expect(shownTile(page)).toHaveAttribute('aria-label', /^Today/)
  await expect(strip.locator('button[aria-label^="Saturday, October 17"]')).toHaveCount(0)
})

test('wall: asked to open a day, Casa opens it straight away', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T10:08:00&band=open-day-now&far=1')
  await expect(page.getByText('LOOKING AHEAD · SATURDAY, OCT 17')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Assistant' })).toBeHidden()
})

// Directions to someone (canvas 13c, approved 2026-09-30; Jake: "Navigate to Alice's house" — it couldn't).
test('wall: "Navigate to Alice\'s house" — a QR code for the route; Call switches it to one that dials', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00&band=directions')
  const band = page.getByRole('region', { name: 'Assistant' })
  await band.getByRole('button', { name: 'Stop listening' }).click()
  await expect(band.getByRole('img', { name: 'QR code: directions to Alice in Google Maps' })).toBeVisible()
  await expect(band.getByText('8255 West Lake Drive, Lake Clark Shores, FL 33406')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('directions-qr.png')
  await band.getByRole('button', { name: 'Call Alice' }).click()
  await expect(band.getByRole('img', { name: 'QR code: call Alice' })).toBeVisible()
  await band.getByRole('button', { name: 'Directions instead' }).click()
  await expect(band.getByRole('img', { name: 'QR code: directions to Alice in Google Maps' })).toBeVisible()
})

test('wall on a computer: directions are a link that opens Google Maps, and Call dials', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00&band=directions&keyboard=device')
  const band = page.getByRole('region', { name: 'Assistant' })
  await expect(band.getByRole('link', { name: 'Open Google Maps' })).toHaveAttribute('href', /google\.com\/maps\/dir\/\?api=1&destination=8255%20West%20Lake%20Drive/)
  await expect(band.getByRole('link', { name: 'Call Alice' })).toHaveAttribute('href', 'tel:+15615550101')
  await expect(band.getByRole('img', { name: /QR code/ })).toHaveCount(0)
})

// Dismissing Casa without the small button (Jake, 2026-09-30: "I can't be forced to only click the small button
// to close, I need an easier way"): a tap outside, a swipe down, Esc; a card waiting asks once more first.
test('wall: before anything is said, a tap anywhere outside the band closes it', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00&band=wake')
  const band = page.getByRole('region', { name: 'Assistant' })
  await expect(band).toBeVisible()
  await page.mouse.click(960, 150)
  await expect(band).toBeHidden()
})

// Jake, 2026-09-30, talking over a project: "the project screen went away and the calm home screen came into
// view … when I touch the project the AI goes away". Once there's a conversation, a tap reaches the wall
// under Casa (Casa stays), and what's open stays up past the idle minutes until the conversation ends.
test('wall: in a conversation, a tap reaches the wall under Casa, and what it opens stays until Casa closes', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-25T13:10:00') })
  // To do open under a conversation (as a project page is when he talks about it).
  await page.goto('/__wall-fixture?at=2026-09-25T13:10:00&band=answer&open=todo')
  const band = page.getByRole('region', { name: 'Assistant' })
  await expect(band).toBeVisible()
  await expect(page.getByText('3 ready now')).toBeVisible()
  // A tap on the wall above the band no longer closes Casa.
  await page.mouse.click(960, 60)
  await expect(band).toBeVisible()
  await page.clock.fastForward('04:00')
  await expect(page.getByText('3 ready now')).toBeVisible()
  await expect(band).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(band).toBeHidden()
  await page.clock.fastForward('02:30')
  await expect(page.getByText('3 ready now')).toBeHidden()
})

// Jake, 2026-09-30: "swiping down on the AI drawer doesn't do anything" — on the touchscreen the browser cancels the
// pointer on a drag, so the swipe is read from touch events (useSwipeDown).
test('wall: a finger swiping down on the band closes it (touch events, the pointer cancelled as on the kiosk)', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00&band=answer')
  const band = page.getByRole('region', { name: 'Assistant' })
  await expect(band).toBeVisible()
  const touchSwipe = (from, to) => page.evaluate(([from, to]) => {
    const el = document.elementFromPoint(from[0], from[1])
    const touch = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: from[0], clientY: from[1], pointerId: 2, pointerType: 'touch' }))
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(from[0], from[1])], changedTouches: [touch(from[0], from[1])] }))
    el.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 2, pointerType: 'touch' }))
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [touch(to[0], to[1])] }))
  }, [from, to])
  await touchSwipe([1400, 700], [1405, 730])
  await expect(band).toBeVisible()
  await touchSwipe([1400, 700], [1410, 960])
  await expect(band).toBeHidden()
})

test('wall: a swipe down on the band closes it; so does Esc on a computer', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00&band=answer')
  const band = page.getByRole('region', { name: 'Assistant' })
  const swipe = (from, to) => page.evaluate(([from, to]) => {
    const el = document.elementFromPoint(from[0], from[1])
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: from[0], clientY: from[1], pointerId: 1 }))
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: to[0], clientY: to[1], pointerId: 1 }))
  }, [from, to])
  await swipe([1400, 700], [1410, 720])
  await expect(band).toBeVisible()
  await swipe([1400, 700], [1410, 950])
  await expect(band).toBeHidden()
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00&band=answer')
  await expect(page.getByRole('region', { name: 'Assistant' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'Assistant' })).toBeHidden()
})

// Casa reads the email, phase 2 (canvas row 14, approved by Jake 2026-09-30): the count on the launch face,
// the review one email at a time, then "a few I skipped" — each answer kept as a label.
test('wall: "3 FROM EMAIL" opens the review; each answer moves on; then a few it skipped', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00&email=1')
  const count = page.getByRole('button', { name: '3 from email' })
  await expect(count).toBeVisible()
  // It stays clear of the divider and the ring beyond it (x 612): the first try ran into the countdown ring.
  const pill = await count.boundingBox()
  expect(pill.x + pill.width).toBeLessThanOrEqual(600)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('email-count.png')
  await count.click()
  const review = page.getByRole('region', { name: 'From email' })
  await expect(review.getByText('1 OF 3')).toBeVisible()
  await expect(review.getByText('Owen’s class needs permission slips signed.')).toBeVisible()
  await expect(review.getByText('“Please check your child’s communicator folder for permission slips to sign and return.”')).toBeVisible()
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('email-review.png')
  await review.getByRole('button', { name: 'Add it' }).click()
  await expect(review.getByText('2 OF 3')).toBeVisible()
  await review.getByRole('button', { name: 'Not needed' }).click()
  await expect(review.getByText('Towhid Nishat: Your thoughts on Owen’s progress at home')).toBeVisible()
  await review.getByRole('button', { name: 'Later' }).click()
  await expect(review.getByText('A FEW I SKIPPED THIS WEEK · TELL ME IF ONE MATTERED')).toBeVisible()
  await review.getByRole('button', { name: 'That one mattered' }).first().click()
  // One question first (canvas 15a): keep that sender posted, or just this one.
  await review.getByRole('button', { name: 'Just this one' }).click()
  await expect(review.getByText('Noted — it mattered')).toBeVisible()
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('email-skipped.png')
  await review.getByRole('button', { name: 'All fine' }).click()
  await expect(review).toBeHidden()
  expect(await page.evaluate(() => window.__emailAnswers)).toEqual(['em-slip:add', 'em-fee:not_needed', 'em-aba:later', 'sk-vet:mattered', 'sk-att:fine', 'sk-5k:fine'])
})

// Keep me posted (canvas row 15, approved by Jake 2026-09-30): Sally Rozanski's emails, a line each, after the
// offers — Add it on the dated one, an ad is a line to glance past; Got it marks them read.
test('wall: "Keep me posted" — a line for each of Sally’s emails, Add it on the dated one, Got it', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00&email=posted')
  await page.getByRole('button', { name: '3 from email' }).click()
  const review = page.getByRole('region', { name: 'From email' })
  await expect(review.getByText('KEEP ME POSTED · SALLY ROZANSKI · 3 THIS WEEK')).toBeVisible()
  await expect(review.getByText('An ad')).toBeVisible()
  await expect(review.getByRole('button', { name: 'Add it' })).toHaveCount(1)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('email-posted.png')
  await review.getByRole('button', { name: 'Add it' }).click()
  await expect(review.getByText('Added', { exact: true })).toBeVisible()
  await review.getByRole('button', { name: 'Got it' }).click()
  await expect(review.getByText('That’s everything from email.')).toBeVisible()
  expect(await page.evaluate(() => window.__emailAnswers)).toEqual(['ps-show:add', 'ps-thriller:seen'])
})

test('wall: "That one mattered" asks to keep Sally posted; yes brings the Showcase back as an offer; a quiet one says why', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00&email=ask')
  await page.getByRole('button', { name: '2 from email' }).click()
  const review = page.getByRole('region', { name: 'From email' })
  await expect(review.getByText('Quiet: You said Not needed to one like it from Rosangela Paine on Sep 30')).toBeVisible()
  await review.getByRole('button', { name: 'That one mattered' }).first().click()
  await expect(review.getByText('Keep you posted on everything from Sally Rozanski?')).toBeVisible()
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('email-keep-posted-ask.png')
  await review.getByRole('button', { name: 'Yes, a line for each' }).click()
  await expect(review.getByText('I’ll keep you posted on Sally Rozanski. Here it is.')).toBeVisible()
  await expect(review.getByText('Showcase of Schools', { exact: true })).toBeVisible()
  await review.getByRole('button', { name: 'Add it' }).click()
  await expect(review.getByText('A FEW I SKIPPED THIS WEEK · TELL ME IF ONE MATTERED')).toBeVisible()
  expect(await page.evaluate(() => window.__emailAnswers)).toEqual(['sk-show:keep_posted', 'sk-show:add'])
})

test('wall: with "Email text on the wall" off, the card keeps its words to itself', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00&email=textoff')
  await page.getByRole('button', { name: '3 from email' }).click()
  const review = page.getByRole('region', { name: 'From email' })
  await expect(review.getByText('Owen’s class needs permission slips signed.')).toBeVisible()
  await expect(review.getByText(/communicator folder for permission slips to sign/)).toHaveCount(0)
  await expect(review.getByText('The email’s own words are hidden on the wall · Open it on your phone')).toBeVisible()
})

test('wall: the email review closes with a tap outside; Open email is a link on a computer', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00&email=1&keyboard=device')
  await page.getByRole('button', { name: '3 from email' }).click()
  const review = page.getByRole('region', { name: 'From email' })
  await expect(review.getByRole('link', { name: 'Open email' })).toHaveAttribute('href', 'https://mail.google.com/mail/#all/em-slip')
  await page.mouse.click(960, 150)
  await expect(review).toBeHidden()
})

// A questionable trigger barely touches the screen (Jake, 2026-09-30): a wake-word open is the small pill.
test('wall: a wake-word open is the small "Listening…" pill; Open grows it to the band; a tap outside closes it', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00&band=wake&wake=1')
  const band = page.getByRole('region', { name: 'Assistant' })
  await expect(band.getByText('Listening…')).toBeVisible()
  await expect(band.getByRole('button', { name: 'What can I say?' })).toHaveCount(0)
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('wake-pill.png')
  await band.getByRole('button', { name: 'Open' }).click()
  await expect(band.getByRole('button', { name: 'What can I say?' })).toBeVisible()
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00&band=wake&wake=1')
  await expect(page.getByRole('region', { name: 'Assistant' }).getByText('Listening…')).toBeVisible()
  await page.mouse.click(960, 150)
  await expect(page.getByRole('region', { name: 'Assistant' })).toBeHidden()
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

// Jake, 2026-09-29: Owen's ghost sat inside Halloween costumes beside Emme's jellyfish, and only hers
// showed — "maybe the child case cards can be a swipe through the active child cases … its tight".
test('wall: a project card swipes through the projects inside it; a tap opens the one showing', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:10:00&twoInside=1')
  await page.getByRole('button', { name: /^To do:/ }).click()
  const shelf = page.getByRole('region', { name: 'Projects' })
  const inside = shelf.getByRole('button', { name: /^Inside Paint the house/ })
  await expect(inside).toHaveAccessibleName('Inside Paint the house, 1 of 2: Stucco cracks: seal and patch')
  await expect(inside.getByText('1 of 4')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('wall-shelf-inside-swipe.png')
  const box = await inside.boundingBox()
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(inside).toHaveAccessibleName('Inside Paint the house, 2 of 2: Redo floorboards on the roof patio')
  await expect(inside.getByText('0 of 3')).toBeVisible()
  await inside.click()
  await expect(page.getByRole('region', { name: 'Redo floorboards on the roof patio — project' })).toBeVisible()
})

// Jake, 2026-09-29: "where is the button to invoke AI on the project screen?" — Talk to Casa about it.
test('wall: a project page opens Casa talking about that project', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:10:00')
  await page.getByRole('button', { name: /^To do:/ }).click()
  await page.getByRole('region', { name: 'Projects' }).getByRole('button', { name: 'Open Paint the house' }).click()
  const paint = page.getByRole('region', { name: 'Paint the house — project' })
  await paint.getByRole('button', { name: 'Talk to Casa about it' }).click()
  await expect.poll(() => page.evaluate(() => window.__asked)).toBe('Let’s work on the Paint the house project.')
})

// Phase 4 (P3.25; Jake: "lets at least make it … so we know its closed/not active"): a project replaced
// stays in its parent as a closed row, and its own page says so, with Reopen.
test('wall: a closed project — CLOSED in its parent with the reason, and a banner with Reopen on its page', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:10:00&closedInside=1')
  await page.getByRole('button', { name: /^To do:/ }).click()
  const shelf = page.getByRole('region', { name: 'Projects' })
  await expect(shelf.getByRole('button', { name: /^Inside Paint the house/ })).toHaveCount(0)
  await shelf.getByRole('button', { name: 'Open Paint the house' }).click()
  const paint = page.getByRole('region', { name: 'Paint the house — project' })
  await paint.getByRole('button', { name: /done · show them/ }).click()
  await expect(paint.getByText('CLOSED · MARIO’S DOING IT WITH THE PAINTING')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('project-closed-row.png')
  await paint.getByRole('button', { name: 'Open', exact: true }).first().click()
  const stucco = page.getByRole('region', { name: 'Stucco cracks: seal and patch — project' })
  await expect(stucco.getByText('CLOSED', { exact: true })).toBeVisible()
  await expect(stucco.getByText(/Mario’s doing it with the painting/)).toBeVisible()
  await expect(stucco.getByRole('button', { name: 'Reopen' })).toBeVisible()
  await expect(page.getByTestId('wall-fixture')).toHaveScreenshot('project-closed-page.png')
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

test('wall: Hide routines takes school, work and the runs off the lanes until Show, remembered on the wall (canvas 16a/b)', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  const wall = page.getByTestId('wall-fixture')
  await page.evaluate(() => document.fonts.ready)
  await expect(wall.getByText('Bak Middle School', { exact: true })).toBeVisible()
  await expect(wall.getByText('Work', { exact: true }).first()).toBeVisible()
  const todayDots = () => wall.getByRole('region', { name: 'Next seven days' }).getByRole('button').first().locator('span.h-\\[18px\\].rounded-full').count()
  const dotsShown = await todayDots()
  await wall.getByRole('button', { name: 'Hide routines' }).click()
  await expect(wall.getByRole('button', { name: 'Routines hidden · Show' })).toBeVisible()
  // The tiles follow: fewer dots on Today with school, work and the runs hidden (Jake, 2026-10-01).
  expect(await todayDots()).toBeLessThan(dotsShown)
  await expect(wall.getByText('Bak Middle School', { exact: true })).toHaveCount(0)
  await expect(wall.getByText('Work', { exact: true })).toHaveCount(0)
  // Where they are still reads on the lane.
  await expect(wall.getByText('Leaves at 7:42 with Kelly')).toBeVisible()
  await expect(wall).toHaveScreenshot('routines-hidden.png')
  await page.reload()
  await expect(page.getByTestId('wall-fixture').getByRole('button', { name: 'Routines hidden · Show' })).toBeVisible()
  await page.getByTestId('wall-fixture').getByRole('button', { name: 'Routines hidden · Show' }).click()
  await expect(page.getByTestId('wall-fixture').getByText('Bak Middle School', { exact: true })).toBeVisible()
})

test('wall: tapping a name opens their page beside the day — routines, what Casa knows — and Edit opens the routine editor (canvas 16e/16d)', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  const wall = page.getByTestId('wall-fixture')
  await page.evaluate(() => document.fonts.ready)
  await wall.getByRole('button', { name: 'Owen’s page' }).click()
  const sheet = wall.getByRole('region', { name: 'Owen’s page' })
  await expect(sheet.getByText('School · Palm Beach Public')).toBeVisible()
  await expect(sheet.getByText('Weekdays 7:35–2:00 · Jake drops off, Giselle picks up')).toBeVisible()
  await expect(sheet.getByText('In kindergarten at Palm Beach Public')).toBeVisible()
  await expect(sheet.getByText('NOT SURE YET')).toBeVisible()
  await expect(wall).toHaveScreenshot('person-wall.png')

  await sheet.getByRole('button', { name: 'Edit School · Palm Beach Public' }).click()
  await expect(sheet.getByText('School routine')).toBeVisible()
  await sheet.getByRole('button', { name: 'Ends 5 minutes later' }).click()
  await expect(sheet.getByText('2:05 PM')).toBeVisible()
  await sheet.getByRole('group', { name: /Days:/ }).getByRole('button', { name: 'Wednesday' }).click()
  await expect(sheet.getByRole('group', { name: 'Days: Mon, Tue, Thu, Fri' })).toBeVisible()
  await expect(wall).toHaveScreenshot('routine-edit-wall.png')
  // Cancel drops the changes; the page is as it was.
  await sheet.getByRole('button', { name: 'Cancel' }).click()
  await expect(sheet.getByText('Weekdays 7:35–2:00 · Jake drops off, Giselle picks up')).toBeVisible()
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(wall.getByRole('region', { name: 'Owen’s page' })).toHaveCount(0)
})

test('wall: with the afternoon\'s TOMORROW note up, "Hide routines" sits at the end of its row, never over it', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00')
  const wall = page.getByTestId('wall-fixture')
  const note = wall.getByRole('button', { name: /TOMORROW/ })
  const pill = wall.getByRole('button', { name: 'Hide routines' })
  await expect(note).toBeVisible()
  await expect(pill).toBeVisible()
  const a = await note.boundingBox()
  const b = await pill.boundingBox()
  const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  expect(overlap).toBe(false)
})

// Canvas row 17 (Jake, 2026-09-30: "ok do this switch thing so I can test it"): the new listener behind a switch.
// Take two (Jake: "too busy for our design … something smaller, like the mic"): a halo behind the mic.
test('wall: the new listener — the mic\'s halo: it swells the moment you\'re louder than the room, settles a moment after, a held sentence fills an arc and a tap on the mic sends it', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00&band=listen&listener=2')
  const section = page.getByRole('region', { name: 'Assistant' })
  await expect.poll(() => starts(page)).toBeGreaterThan(0)
  // No rings, no LISTENING word, nothing under the words: the mic says it.
  await expect(section.getByText('LISTENING', { exact: true })).toHaveCount(0)
  await mic(page, () => window.__mic.level(34))
  await expect(section.locator('[data-listener="quiet"]')).toBeVisible()
  // Louder than the room: your voice at once (Deepgram confirms a voice within ~0.5 s in life).
  await mic(page, () => window.__mic.speak(52))
  await expect(section.locator('[data-listener="voice"]')).toBeVisible({ timeout: 1000 })
  await mic(page, () => window.__mic.hear('Alexa, tell me what is on the', [{ word: 'the', confidence: 0.3 }]))
  await expect(section.locator('span.opacity-40', { hasText: 'the' })).toBeVisible()
  await expect(section.getByText('Alexa', { exact: false })).toHaveCount(0)
  // You stop: settled within a moment.
  await mic(page, () => window.__mic.level(34))
  await expect(section.locator('[data-listener="heard"]')).toBeVisible({ timeout: 1000 })
  // A sentence that sounds unfinished is held for the rest: the arc, a note under the mic, and the mic sends it.
  await mic(page, () => window.__mic.hold())
  await expect(section.locator('[data-listener="fuse"]')).toBeVisible()
  await expect(section.getByText(/tap the mic to send/)).toBeVisible()
  await section.getByRole('button', { name: 'Stop listening' }).click()
  expect(await page.evaluate(() => window.__mic.finished)).toBe(1)
})

test('wall: the new listener — loud with no voice detected is the room, not you', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00&band=listen&listener=2')
  const section = page.getByRole('region', { name: 'Assistant' })
  await expect.poll(() => starts(page)).toBeGreaterThan(0)
  // On the bridge's decibel scale: the room ~34, then something loud (60) with no voice detected.
  await mic(page, () => window.__mic.level(34))
  await page.waitForTimeout(600)
  await mic(page, () => window.__mic.level(60))
  await expect(section.locator('[data-listener="noise"]')).toBeVisible({ timeout: 4000 })
  await expect(section.getByText('It’s loud in here')).toBeVisible()
})

test('wall: the new listener is a switch in the MT menu, remembered on the wall; off, the band is as before', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  const wall = page.getByTestId('wall-fixture')
  await wall.getByRole('button', { name: 'Open menu' }).click()
  const toggle = wall.getByRole('switch', { name: 'Try the new listener' })
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  expect(await page.evaluate(() => localStorage.getItem('casa-wall-listener-v2'))).toBe('1')
  // Beside it, Flux for the speech to text (remembered the same way).
  const flux = wall.getByRole('switch', { name: 'Try Flux' })
  await expect(flux).toHaveAttribute('aria-checked', 'false')
  await flux.click()
  expect(await page.evaluate(() => localStorage.getItem('casa-wall-stt-flux'))).toBe('1')
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00&band=listen')
  await expect(page.getByRole('region', { name: 'Assistant' }).locator('[data-listener]')).toBeVisible()
  await page.evaluate(() => localStorage.removeItem('casa-wall-listener-v2'))
  await page.goto('/__wall-fixture?at=2026-09-25T13:40:00&band=listen')
  await expect(page.getByRole('region', { name: 'Assistant' }).getByText('LISTENING', { exact: true }).first()).toBeVisible()
  await expect(page.locator('[data-listener]')).toHaveCount(0)
})

// Jake, 2026-10-01: "today should show the get and pack section … able to see what was checked off" — the evening's
// layout with the Next Move kept up top — and "like the strip to be in the same place across all dates".
test('wall: today with a list to get ready: Next Move up top, compact lanes, decisions and get & pack; "N packed" opens every tick', async ({ page }) => {
  await page.goto('/__wall-fixture?at=2026-09-26T11:30:00')
  const wall = page.getByTestId('wall-fixture')
  await page.evaluate(() => document.fonts.ready)
  await expect(wall.getByRole('region', { name: 'Next move' })).toBeVisible()
  const pack = wall.getByRole('region', { name: 'Get & pack today' })
  await expect(pack.getByText('GET & PACK · 1 OF 5 DONE')).toBeVisible()
  await expect(pack.getByRole('button', { name: 'Water bottle' })).toBeVisible()
  // Three columns across with a decision beside it (Jake: "can't you fit 3 or 4 columns instead of 2?").
  await expect(pack.locator('.grid-cols-3')).toHaveCount(1)
  await expect(wall.getByRole('region', { name: 'Needs a decision today' })).toBeVisible()
  await expect(wall.getByRole('region', { name: 'Next seven days' })).toBeVisible()
  await expect(wall).toHaveScreenshot('today-get-and-pack.png')
  await pack.getByRole('button', { name: 'See all' }).click()
  const all = wall.getByRole('region', { name: 'Everything to pack' })
  await expect(all.getByRole('button', { name: 'Glove' }).last()).toHaveAttribute('aria-pressed', 'true')
})

test('wall: the week strip sits in the same place on every face — today, today with a list, the evening, another day', async ({ page }) => {
  const stripTop = async (url) => {
    await page.goto(url)
    await page.evaluate(() => document.fonts.ready)
    const box = await page.getByTestId('wall-fixture').getByRole('region', { name: 'Next seven days' }).boundingBox()
    return Math.round(box.y)
  }
  const today = await stripTop('/__wall-fixture?at=2026-09-25T07:12:00')
  expect(await stripTop('/__wall-fixture?at=2026-09-26T11:30:00')).toBe(today)
  expect(await stripTop('/__wall-fixture?at=2026-09-25T20:15:00')).toBe(today)
  await page.goto('/__wall-fixture?at=2026-09-25T07:12:00')
  await page.getByTestId('wall-fixture').getByRole('region', { name: 'Next seven days' }).getByRole('button', { name: /mon/i }).first().click()
  const other = await page.getByTestId('wall-fixture').getByRole('region', { name: 'Next seven days' }).boundingBox()
  expect(Math.round(other.y)).toBe(today)
})

// Jake, 2026-10-01: "you are usually a lot more detail oriented than this. can you please align the thin bars for
// Needs a decision and Get & Pack?" — measured, then held here: on today's face and the evening's, the sections under
// the lanes share their heading height, their rule and their first line; the lists start flush with their headings.
for (const [name, at] of [['today', '2026-09-26T11:30:00'], ['the evening', '2026-09-25T20:15:00']]) {
  test(`wall: ${name} — the sections under the lanes line up: headings, rules, first lines; lists flush; room above the week`, async ({ page }) => {
    await page.goto(`/__wall-fixture?at=${at}`)
    await page.getByRole('region', { name: 'Next seven days' }).waitFor()
    await page.evaluate(() => document.fonts.ready)
    const m = await page.evaluate(() => {
      const r = (el) => el.getBoundingClientRect()
      const sections = [...document.querySelectorAll('section[aria-label^="Needs a decision"], section[aria-label="Get & pack today"], section[aria-label="Pack tonight"], section[aria-label="First departure"]')]
      return {
        headings: sections.map((s) => Math.round(r(s.firstElementChild.firstElementChild).top)),
        rules: sections.map((s) => Math.round(r(s.children[1]?.querySelector?.('button') && s.getAttribute('aria-label').match(/pack/i) ? s.querySelector('.grid > div > div > button') : s.children[1]).top)),
        firstLines: sections.map((s) => {
          const el = s.getAttribute('aria-label').match(/pack/i) ? s.querySelector('.grid > div > div > button') : s.children[1].firstElementChild
          const range = document.createRange(); range.selectNodeContents(el); return Math.round(range.getBoundingClientRect().top)
        }),
        headX: Math.round(r(document.querySelector('.grid > div > div > button')).left),
        boxX: Math.round(r(document.querySelector('.grid button[aria-pressed] > span')).left),
        lowest: Math.max(...sections.map((s) => Math.round(r(s).bottom)), ...[...document.querySelectorAll('section[aria-label^="Needs a decision"] button')].map((b) => Math.round(r(b).bottom))),
        week: Math.round(r(document.querySelector('[aria-label="Next seven days"]')).top),
      }
    })
    expect(new Set(m.headings).size, `headings ${m.headings}`).toBe(1)
    expect(new Set(m.rules).size, `rules ${m.rules}`).toBe(1)
    expect(Math.max(...m.firstLines) - Math.min(...m.firstLines), `first lines ${m.firstLines}`).toBeLessThanOrEqual(2)
    expect(m.boxX).toBe(m.headX)
    expect(m.week - m.lowest, `room above the week: ${m.week - m.lowest}`).toBeGreaterThanOrEqual(16)
  })
}
