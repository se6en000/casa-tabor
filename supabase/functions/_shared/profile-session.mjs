const encoder = new TextEncoder()
const decoder = new TextDecoder()

function base64url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64url(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index]
  return result === 0
}

async function hmac(secret, content) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(content)))
}

export async function createProfileSessionToken({ session, secret }) {
  const payload = base64url(encoder.encode(JSON.stringify(session)))
  const signature = base64url(await hmac(secret, payload))
  return `${payload}.${signature}`
}

export async function verifyProfileSessionToken({
  token,
  secret,
  loadCredentialVersion,
}) {
  if (!token) throw new Error('Profile session is required.')
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) throw new Error('Profile session is invalid.')

  const expected = await hmac(secret, payload)
  if (!constantTimeEqual(expected, fromBase64url(signature))) {
    throw new Error('Profile session is invalid.')
  }

  let session
  try {
    session = JSON.parse(decoder.decode(fromBase64url(payload)))
  } catch {
    throw new Error('Profile session is invalid.')
  }
  if (
    (session.role !== 'household_admin' && session.role !== 'family_member') ||
    !Number.isFinite(session.credential_version) ||
    (session.expires_at !== undefined && (
      !Number.isFinite(session.expires_at) ||
      session.expires_at <= Date.now()
    ))
  ) {
    throw new Error('Profile session has expired.')
  }
  if (session.role === 'family_member' && !session.member_id) {
    throw new Error('Profile session is invalid.')
  }

  const credentialVersion = await loadCredentialVersion(session)
  if (credentialVersion === null || credentialVersion !== session.credential_version) {
    throw new Error('Profile session is no longer valid.')
  }
  return session
}
