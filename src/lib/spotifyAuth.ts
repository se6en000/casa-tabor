/**
 * Spotify PKCE OAuth utilities
 * Handles auth flow, token storage, and refresh.
 * No client secret needed — PKCE is safe for SPAs.
 */

const CLIENT_ID_KEY    = 'spotify_client_id'
const ACCESS_TOKEN_KEY = 'spotify_access_token'
const REFRESH_TOKEN_KEY = 'spotify_refresh_token'
const EXPIRES_AT_KEY   = 'spotify_token_expires_at'
const CODE_VERIFIER_KEY = 'spotify_pkce_verifier'

export const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-library-read',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ')

// ── Storage helpers ──────────────────────────────────────────────

export function getClientId(): string {
  return localStorage.getItem(CLIENT_ID_KEY) ?? ''
}

export function setClientId(id: string): void {
  localStorage.setItem(CLIENT_ID_KEY, id.trim())
}

export function getTokens() {
  return {
    accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
    expiresAt: Number(localStorage.getItem(EXPIRES_AT_KEY) ?? 0),
  }
}

export function isAuthenticated(): boolean {
  const { accessToken } = getTokens()
  return !!accessToken && !!getClientId()
}

export function isTokenFresh(): boolean {
  const { accessToken, expiresAt } = getTokens()
  return !!accessToken && Date.now() < expiresAt - 60_000
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(EXPIRES_AT_KEY)
}

function storeTokens(data: { access_token: string; refresh_token?: string; expires_in: number }): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token)
  if (data.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token)
  localStorage.setItem(EXPIRES_AT_KEY, String(Date.now() + data.expires_in * 1000))
}

// ── PKCE helpers ─────────────────────────────────────────────────

function genVerifier(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/** Pure-JS SHA-256 — used when crypto.subtle unavailable (HTTP LAN access). */
function sha256Pure(message: string): Uint8Array {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ]
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]
  const bytes = new TextEncoder().encode(message)
  const bits = bytes.length * 8
  const padLen = bytes.length % 64 < 56 ? 56 - bytes.length % 64 : 120 - bytes.length % 64
  const buf = new Uint8Array(bytes.length + padLen + 8)
  buf.set(bytes)
  buf[bytes.length] = 0x80
  const view = new DataView(buf.buffer)
  view.setUint32(buf.length - 4, bits, false)
  for (let offset = 0; offset < buf.length; offset += 64) {
    const w = new Uint32Array(64)
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false)
    for (let i = 16; i < 64; i++) {
      const s0 = (w[i-15] >>> 7 | w[i-15] << 25) ^ (w[i-15] >>> 18 | w[i-15] << 14) ^ (w[i-15] >>> 3)
      const s1 = (w[i-2] >>> 17 | w[i-2] << 15) ^ (w[i-2] >>> 19 | w[i-2] << 13) ^ (w[i-2] >>> 10)
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0
    }
    let [a,b,c,d,e,f,g,h] = H
    for (let i = 0; i < 64; i++) {
      const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7)
      const ch = (e & f) ^ (~e & g)
      const tmp1 = (h + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const tmp2 = (S0 + maj) >>> 0
      h=g; g=f; f=e; e=(d+tmp1)>>>0; d=c; c=b; b=a; a=(tmp1+tmp2)>>>0
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0
    H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0
  }
  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  H.forEach((v, i) => outView.setUint32(i * 4, v, false))
  return out
}

async function genChallenge(verifier: string): Promise<string> {
  let hashBytes: Uint8Array
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(verifier)
    const digest = await crypto.subtle.digest('SHA-256', data)
    hashBytes = new Uint8Array(digest)
  } else {
    hashBytes = sha256Pure(verifier)
  }
  return btoa(String.fromCharCode(...hashBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── Auth flow ────────────────────────────────────────────────────

export async function startAuthFlow(clientId?: string): Promise<void> {
  const id = clientId ?? getClientId()
  if (!id) throw new Error('No Client ID set')
  if (clientId) setClientId(clientId)

  const verifier = genVerifier()
  const challenge = await genChallenge(verifier)
  sessionStorage.setItem(CODE_VERIFIER_KEY, verifier)

  const redirectUri = `${window.location.origin}/music`
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: id,
    scope: SCOPES,
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })
  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

export async function handleOAuthCallback(code: string): Promise<boolean> {
  const verifier = sessionStorage.getItem(CODE_VERIFIER_KEY)
  const clientId = getClientId()
  if (!verifier || !clientId) return false

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${window.location.origin}/music`,
      client_id: clientId,
      code_verifier: verifier,
    }),
  })

  if (!res.ok) return false
  storeTokens(await res.json())
  sessionStorage.removeItem(CODE_VERIFIER_KEY)
  return true
}

export async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = getTokens()
  const clientId = getClientId()
  if (!refreshToken || !clientId) return null

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  })

  if (!res.ok) { clearTokens(); return null }
  const data = await res.json()
  storeTokens(data)
  return data.access_token
}

// ── Spotify Web API helper ────────────────────────────────────────

export async function spotifyFetch(path: string, options?: RequestInit): Promise<Response> {
  if (!isTokenFresh()) {
    const token = await refreshAccessToken()
    if (!token) throw new Error('Not authenticated with Spotify')
  }
  const { accessToken } = getTokens()
  return fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
}
