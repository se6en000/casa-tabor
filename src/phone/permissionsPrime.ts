/**
 * The mic and location asked for at launch (Jake, Oct 3: "when the mobile app loads can you prompt / get approval for
 * both microphone and gps(location) right off the bat? especially on reload from a closed app. i always get tripped up
 * on a fresh [try] to use ai with that approval prompt"). One after the other, the mic first; the mic is let go at once
 * (it's only the question); nothing already allowed is asked, and nothing turned down is asked again — iPhone's Settings
 * is the way back for that.
 */

type PermissionName = 'microphone' | 'geolocation'
interface Env {
  permissions?: { query: (d: { name: PermissionName }) => Promise<{ state: string }> }
  mediaDevices?: { getUserMedia?: (c: { audio: boolean }) => Promise<{ getTracks: () => Array<{ stop: () => void }> }> }
  geolocation?: { getCurrentPosition: (ok: (p: unknown) => void, fail?: (e: unknown) => void, o?: { maximumAge?: number; timeout?: number }) => void }
}

/** "granted", "denied", "prompt", or "unknown" where the browser can't say (older iOS asks anyway). */
async function stateOf(env: Env, name: PermissionName): Promise<string> {
  try {
    return (await env.permissions?.query({ name }))?.state ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function primePermissions(env: Env): Promise<void> {
  const mic = await stateOf(env, 'microphone')
  if (mic !== 'granted' && mic !== 'denied' && env.mediaDevices?.getUserMedia) {
    try {
      const stream = await env.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
    } catch { /* turned down or no mic: Casa still types */ }
  }
  const geo = await stateOf(env, 'geolocation')
  if (geo !== 'granted' && geo !== 'denied' && env.geolocation) {
    await new Promise<void>((done) => env.geolocation!.getCurrentPosition(() => done(), () => done(), { maximumAge: 10 * 60_000, timeout: 20_000 }))
  }
}

/** On the phone, once per launch (not in the screenshot tests). */
export function primePermissionsOnLaunch(): void {
  if (import.meta.env.VITE_VISUAL_TEST_MODE === 'true' || typeof navigator === 'undefined') return
  const w = window as unknown as { __casaPrimed?: boolean }
  if (w.__casaPrimed) return
  w.__casaPrimed = true
  void primePermissions({
    permissions: navigator.permissions as unknown as Env['permissions'],
    mediaDevices: navigator.mediaDevices as unknown as Env['mediaDevices'],
    geolocation: navigator.geolocation as unknown as Env['geolocation'],
  })
}
