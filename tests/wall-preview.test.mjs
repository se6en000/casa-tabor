import test from 'node:test'
import assert from 'node:assert/strict'
import { nextPreview, shownPosture, PREVIEW_MS } from '../src/wall/preview.ts'
import { shouldSendHomeToWall, wallHomeFlagFromUrl } from '../src/wall/kioskHome.ts'

const t0 = 1_000_000

test('each tap shows the next face, and the third tap is back to the automatic one', () => {
  const a = nextPreview('calm', null, t0)
  assert.equal(a.posture, 'launch')
  const b = nextPreview('calm', a, t0 + 1000)
  assert.equal(b.posture, 'evening')
  assert.equal(nextPreview('calm', b, t0 + 2000), null)
})

test('the cycle starts from whatever the wall is showing on its own', () => {
  assert.equal(nextPreview('evening', null, t0).posture, 'calm')
  assert.equal(nextPreview('launch', null, t0).posture, 'evening')
})

test('a preview goes back to the automatic face after 2 minutes without a touch', () => {
  const p = nextPreview('calm', null, t0)
  assert.deepEqual(shownPosture('calm', p, t0 + PREVIEW_MS - 1), { posture: 'launch', preview: true })
  assert.deepEqual(shownPosture('calm', p, t0 + PREVIEW_MS), { posture: 'calm', preview: false })
  // An expired preview doesn't affect the next tap either.
  assert.equal(nextPreview('calm', p, t0 + PREVIEW_MS + 5).posture, 'launch')
})

test('on the kiosk, "Home" in the rest of the app leads back to the Wall', () => {
  assert.equal(shouldSendHomeToWall('/', '', '1'), true)
  assert.equal(shouldSendHomeToWall('/', '?density=kiosk', '1'), true)
  assert.equal(shouldSendHomeToWall('/', '?classic=1', '1'), false)
  assert.equal(shouldSendHomeToWall('/calendar', '', '1'), false)
  // Phones and other browsers never opened the Wall as the kiosk: unchanged.
  assert.equal(shouldSendHomeToWall('/', '', null), false)
})

test('the kiosk URL sets or clears the wall-home flag', () => {
  assert.equal(wallHomeFlagFromUrl('/wall', '?kiosk=1'), '1')
  assert.equal(wallHomeFlagFromUrl('/', '?density=kiosk&wallHome=0'), '0')
  assert.equal(wallHomeFlagFromUrl('/wall', ''), null)
})

test('a preview of the face the wall would show anyway is no preview', () => {
  const p = nextPreview('calm', null, t0) // previewing "launch"
  assert.deepEqual(shownPosture('launch', p, t0 + 1000), { posture: 'launch', preview: false })
})
