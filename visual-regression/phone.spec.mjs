import { expect, test } from '@playwright/test'

// The phone (Phase 4, board section 05) at 390x844, drawn from the Wall's fixed fixture
// (tests/fixtures/wall-day-2026-09-25.mjs) at ?at=, as ?viewer=. Runs with the Wall guard.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

const open = async (page, at = '2026-09-25T07:12:00', viewer = 'jake-id') => {
  await page.goto(`/__phone-fixture?at=${at}&viewer=${viewer}`)
  const phone = page.getByTestId('phone-fixture')
  await expect(phone).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  return phone
}

test('phone: Me — the next move first (leave by), what others have covered, just yours', async ({ page }) => {
  const phone = await open(page)
  const next = phone.getByRole('region', { name: 'Your next move' })
  await expect(next.getByText('LEAVE BY 7:25')).toBeVisible()
  await expect(next.getByText('Palm Beach Public')).toBeVisible()
  await expect(next.getByText('Drop off Emme & Owen')).toBeVisible()
  const covered = phone.getByRole('region', { name: 'Covered' })
  await expect(covered.getByText('Kelly · Drop off Liv')).toBeVisible()
  await expect(phone.getByRole('region', { name: 'Just yours' }).getByText('Pick up Photobook for Liv')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-me.png')
})

test('phone: Leaving now puts the move on the road (with undo); Hand off offers who is free', async ({ page }) => {
  const phone = await open(page)
  const next = phone.getByRole('region', { name: 'Your next move' })
  await next.getByRole('button', { name: 'Leaving now' }).click()
  await expect(next.getByText('ON THE ROAD')).toBeVisible()
  await next.getByRole('button', { name: 'Not yet (undo)' }).click()
  await expect(next.getByText('LEAVE BY 7:25')).toBeVisible()
  await next.getByRole('button', { name: 'Hand off' }).click()
  const sheet = phone.getByRole('region', { name: 'Hand off' })
  await expect(sheet.getByRole('button', { name: /Kelly/ })).toBeVisible()
  await sheet.getByRole('button', { name: /Giselle/ }).click()
  await expect(phone.getByText('Nothing for you to drive today.')).toBeVisible() // it's Giselle's now
})

test('phone: hidden from the honoree — on Jake\'s phone, not on Kelly\'s', async ({ page }) => {
  let phone = await open(page, '2026-09-26T07:30:00', 'jake-id')
  const kept = phone.getByRole('region', { name: 'Kept from someone' })
  await expect(kept.getByText(/HIDDEN FROM KELLY/)).toBeVisible()
  await expect(kept.getByRole('button', { name: 'Birthday card' })).toBeVisible()
  phone = await open(page, '2026-09-26T07:30:00', 'kelly')
  await expect(phone.getByRole('region', { name: 'Kept from someone' })).toHaveCount(0)
  await expect(phone.getByText('Birthday card')).toHaveCount(0)
})

test('phone: Family lists everyone\'s day and filters by person; Week opens a day', async ({ page }) => {
  const phone = await open(page)
  await phone.getByRole('button', { name: 'Family' }).click()
  await expect(phone.getByText('Bak Middle School')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-family.png')
  await phone.getByRole('button', { name: 'Emme', exact: true }).click()
  await expect(phone.getByText('Bak Middle School')).toHaveCount(0)
  await expect(phone.getByText('Emme Practice Violin with Meredith')).toBeVisible()
  await phone.getByRole('button', { name: 'Week' }).click()
  await expect(phone).toHaveScreenshot('phone-week.png')
  await phone.getByRole('button', { name: /TOMORROW/ }).click()
  await expect(phone.getByText('Saturday, September 26')).toBeVisible()
})

test('phone: More opens the rest of Casa', async ({ page }) => {
  const phone = await open(page)
  await phone.getByRole('button', { name: 'More' }).click()
  await expect(phone.getByRole('link', { name: /Grocery/ })).toBeVisible()
  await expect(phone.getByRole('link', { name: /See the Wall/ })).toBeVisible()
})

test('phone: after 7 PM, Me and Family look at tomorrow (like the wall\'s evening)', async ({ page }) => {
  const phone = await open(page, '2026-09-25T20:15:00', 'jake-id')
  await expect(phone.getByRole('heading', { name: "Jake's tomorrow" })).toBeVisible()
  const next = phone.getByRole('region', { name: 'Your next move' })
  await expect(next.getByText('LEAVE BY 11:56')).toBeVisible()
  await expect(phone.getByRole('region', { name: 'Kept from someone' }).getByRole('button', { name: 'Birthday card' })).toBeVisible()
  await phone.getByRole('button', { name: 'Family' }).click()
  await expect(phone.getByText('Saturday, September 26')).toBeVisible()
})
