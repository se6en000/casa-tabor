// send-push-notification
// Sends a web push to all subscribed devices
// Body: { title, body, url?, tag? }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ── VAPID signing helpers (no external npm needed in Deno) ───────────────────

async function importVapidKey(privateKeyB64u: string): Promise<CryptoKey> {
  const raw = base64urlToBytes(privateKeyB64u)
  return crypto.subtle.importKey(
    'raw', raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, ['deriveKey', 'deriveBits']
  )
}

function base64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}

function bytesToBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function buildVapidAuthHeader(endpoint: string): Promise<string> {
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@casa-tabor.app'

  const url = new URL(endpoint)
  const audience = `${url.protocol}//${url.host}`
  const now = Math.floor(Date.now() / 1000)

  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = { aud: audience, exp: now + 12 * 3600, sub: subject }

  const enc = new TextEncoder()
  const headerB64 = bytesToBase64url(enc.encode(JSON.stringify(header)))
  const payloadB64 = bytesToBase64url(enc.encode(JSON.stringify(payload)))
  const unsigned = `${headerB64}.${payloadB64}`

  // Import private key as PKCS8 (P-256)
  const pkcs8 = buildPkcs8(base64urlToBytes(vapidPrivate))
  const key = await crypto.subtle.importKey(
    'pkcs8', pkcs8,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(unsigned)
  )
  const jwt = `${unsigned}.${bytesToBase64url(new Uint8Array(sig))}`

  return `vapid t=${jwt},k=${vapidPublic}`
}

// Wrap raw 32-byte private key in PKCS8 DER for P-256
function buildPkcs8(rawKey: Uint8Array): ArrayBuffer {
  // PKCS8 wrapper for P-256 EC private key (RFC 5915 / RFC 5958)
  const oid = new Uint8Array([
    0x30, 0x41,                       // SEQUENCE
    0x02, 0x01, 0x00,                 // version = 0
    0x30, 0x13,                       // SEQUENCE (algorithm)
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID P-256
    0x04, 0x27,                       // OCTET STRING
    0x30, 0x25,                       // SEQUENCE (ECPrivateKey)
    0x02, 0x01, 0x01,                 // version = 1
    0x04, 0x20,                       // OCTET STRING (32 bytes)
    ...rawKey,
  ])
  return oid.buffer
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { title, body, url = '/', tag } = await req.json()

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')

    if (error) throw error
    if (!subs || subs.length === 0) {
      return json({ ok: true, sent: 0, message: 'no subscribers' })
    }

    const payload = JSON.stringify({ title, body, url, tag })
    const results = await Promise.allSettled(
      subs.map(sub => sendToDevice(sub, payload))
    )

    const sent = results.filter(r => r.status === 'fulfilled').length
    const failed = results.length - sent

    // Remove gone subscriptions (HTTP 410 = unsubscribed)
    const gone = results
      .map((r, i) => r.status === 'rejected' && (r as PromiseRejectedResult).reason?.status === 410 ? subs[i].endpoint : null)
      .filter(Boolean)

    if (gone.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', gone)
    }

    return json({ ok: true, sent, failed })
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500)
  }
})

async function sendToDevice(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string
) {
  const auth = await buildVapidAuthHeader(sub.endpoint)
  const encrypted = await encryptPayload(payload, sub.p256dh, sub.auth)

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body: encrypted,
  })

  if (!res.ok && res.status !== 201) {
    const err = new Error(`Push failed: ${res.status}`) as Error & { status: number }
    err.status = res.status
    throw err
  }
}

// ── Web Push payload encryption (RFC 8291 / aes128gcm) ──────────────────────

async function encryptPayload(plaintext: string, p256dhB64u: string, authB64u: string): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const plain = enc.encode(plaintext)

  const authSecret = base64urlToBytes(authB64u)
  const clientPublicKey = base64urlToBytes(p256dhB64u)

  // Generate server EC key pair
  const serverKey = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const serverPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKey.publicKey))

  // Import client public key
  const clientKey = await crypto.subtle.importKey(
    'raw', clientPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  )

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKey.privateKey, 256)
  const sharedSecret = new Uint8Array(sharedBits)

  // Salt
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // HKDF extract + expand (PRK)
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveBits'])

  // PRK
  const prkInfo = buildInfo('WebPush: info\x00', clientPublicKey, serverPublicRaw)
  const prk = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: prkInfo }, hkdfKey, 256
  ))

  // CEK + nonce
  const prkKey = await crypto.subtle.importKey('raw', prk, 'HKDF', false, ['deriveBits'])
  const cekInfo = buildInfo('Content-Encoding: aes128gcm\x00', new Uint8Array(0), new Uint8Array(0))
  const nonceInfo = buildInfo('Content-Encoding: nonce\x00', new Uint8Array(0), new Uint8Array(0))

  const cek = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: cekInfo }, prkKey, 128
  ))
  const nonce = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo }, prkKey, 96
  ))

  // Encrypt
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    aesKey,
    concat(plain, new Uint8Array([2])) // padding delimiter
  ))

  // Build aes128gcm content-encoding header
  const rs = ciphertext.length + 16
  const header = new Uint8Array(16 + 4 + 1 + serverPublicRaw.length)
  header.set(salt)
  header[16] = (rs >> 24) & 0xff
  header[17] = (rs >> 16) & 0xff
  header[18] = (rs >> 8) & 0xff
  header[19] = rs & 0xff
  header[20] = serverPublicRaw.length
  header.set(serverPublicRaw, 21)

  return concat(header, ciphertext)
}

function buildInfo(type: string, clientKey: Uint8Array, serverKey: Uint8Array): Uint8Array {
  const enc = new TextEncoder()
  const t = enc.encode(type)
  const len = 1 + clientKey.length + 1 + serverKey.length
  const result = new Uint8Array(t.length + 2 + len)
  result.set(t)
  result[t.length] = (clientKey.length >> 8) & 0xff
  result[t.length + 1] = clientKey.length & 0xff
  result.set(clientKey, t.length + 2)
  result[t.length + 2 + clientKey.length] = (serverKey.length >> 8) & 0xff
  result[t.length + 3 + clientKey.length] = serverKey.length & 0xff
  result.set(serverKey, t.length + 4 + clientKey.length)
  return result
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
