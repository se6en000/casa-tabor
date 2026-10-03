import test from 'node:test'
import assert from 'node:assert/strict'
import { primePermissions } from '../src/phone/permissionsPrime.ts'

// Jake, Oct 3: "when the mobile app loads can you prompt / get approval for both microphone and gps(location) right off
// the bat? especially on reload from a closed app. i always get tripped up on a fresh [try] to use ai with that approval
// prompt." Asked at launch, one after the other; the mic is let go at once; nothing asked that's already allowed.
function env({ mic = 'prompt', geo = 'prompt', micFails = false } = {}) {
  const calls = []
  return {
    calls,
    permissions: { query: async ({ name }) => ({ state: name === 'microphone' ? mic : geo }) },
    mediaDevices: {
      getUserMedia: async () => {
        calls.push('mic')
        if (micFails) throw new Error('NotAllowedError')
        return { getTracks: () => [{ stop: () => calls.push('mic-off') }] }
      },
    },
    geolocation: { getCurrentPosition: (ok) => { calls.push('location'); ok({ coords: { latitude: 26.7, longitude: -80.1 } }) } },
  }
}

test('both asked at launch, mic first, the mic let go at once', async () => {
  const e = env()
  await primePermissions(e)
  assert.deepEqual(e.calls, ['mic', 'mic-off', 'location'])
})

test('already allowed: nothing asked', async () => {
  const e = env({ mic: 'granted', geo: 'granted' })
  await primePermissions(e)
  assert.deepEqual(e.calls, [])
})

test('turned down before: not asked again on every launch (Settings is the way back)', async () => {
  const e = env({ mic: 'denied', geo: 'denied' })
  await primePermissions(e)
  assert.deepEqual(e.calls, [])
})

test('a mic that says no still lets the location be asked', async () => {
  const e = env({ micFails: true })
  await primePermissions(e)
  assert.deepEqual(e.calls, ['mic', 'location'])
})

test('no Permissions API (older iOS): asks anyway', async () => {
  const e = env()
  delete e.permissions
  await primePermissions(e)
  assert.deepEqual(e.calls, ['mic', 'mic-off', 'location'])
})
