// Face ID sign-in (canvas 40c): passkeys for family members, behind the assistant-history function. A passkey only ever
// stands in for the person's PIN: the session it gets is the same one a right PIN gets (same credential version, so a
// PIN change signs it out too). Challenges are one-time and live five minutes.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from 'npm:@simplewebauthn/server@13.1.1'
import { isoBase64URL } from 'npm:@simplewebauthn/server@13.1.1/helpers'

export const RP_ID = 'casa-tabor.vercel.app'
export const RP_ORIGIN = 'https://casa-tabor.vercel.app'
const CHALLENGE_MS = 5 * 60 * 1000

// deno-lint-ignore no-explicit-any
type Db = any

async function keepChallenge(sb: Db, challenge: string, purpose: 'register' | 'login', memberId: string | null) {
  await sb.from('member_passkey_challenges').delete().lt('expires_at', new Date().toISOString())
  const { error } = await sb.from('member_passkey_challenges').insert({
    challenge, purpose, member_id: memberId, expires_at: new Date(Date.now() + CHALLENGE_MS).toISOString(),
  })
  if (error) throw error
}

/** The challenge the browser signed, taken once: it must be ours, for this purpose (and person), and not stale. */
async function takeChallenge(sb: Db, clientDataJSON: unknown, purpose: 'register' | 'login', memberId: string | null) {
  if (typeof clientDataJSON !== 'string') throw new Error('Face ID didn’t answer.')
  const signed = JSON.parse(new TextDecoder().decode(isoBase64URL.toBuffer(clientDataJSON)))?.challenge
  if (typeof signed !== 'string') throw new Error('Face ID didn’t answer.')
  const { data, error } = await sb.from('member_passkey_challenges').delete().eq('challenge', signed).eq('purpose', purpose).select('member_id,expires_at').maybeSingle()
  if (error) throw error
  if (!data || new Date(data.expires_at).getTime() < Date.now()) throw new Error('That took too long. Try Face ID again.')
  if (purpose === 'register' && data.member_id !== memberId) throw new Error('That Face ID was for someone else.')
  return signed as string
}

export async function registrationOptions(sb: Db, member: { id: string; name: string }) {
  const { data: existing, error } = await sb.from('member_passkeys').select('credential_id,transports').eq('member_id', member.id)
  if (error) throw error
  const options = await generateRegistrationOptions({
    rpName: 'Tabor House',
    rpID: RP_ID,
    userName: member.name,
    userDisplayName: member.name,
    userID: new TextEncoder().encode(member.id),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required', authenticatorAttachment: 'platform' },
    excludeCredentials: (existing ?? []).map((c: { credential_id: string; transports: string[] }) => ({ id: c.credential_id, transports: c.transports as never })),
  })
  await keepChallenge(sb, options.challenge, 'register', member.id)
  return options
}

// deno-lint-ignore no-explicit-any
export async function register(sb: Db, memberId: string, response: any) {
  const expectedChallenge = await takeChallenge(sb, response?.response?.clientDataJSON, 'register', memberId)
  const result = await verifyRegistrationResponse({
    response, expectedChallenge, expectedOrigin: RP_ORIGIN, expectedRPID: RP_ID, requireUserVerification: true,
  })
  if (!result.verified || !result.registrationInfo) throw new Error('Face ID couldn’t be set up.')
  const { credential } = result.registrationInfo
  const { error } = await sb.from('member_passkeys').upsert({
    member_id: memberId,
    credential_id: credential.id,
    public_key: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
  }, { onConflict: 'credential_id' })
  if (error) throw error
}

export async function loginOptions(sb: Db, memberId: string | null) {
  let allow: { id: string; transports?: never }[] = []
  if (memberId) {
    const { data, error } = await sb.from('member_passkeys').select('credential_id,transports').eq('member_id', memberId)
    if (error) throw error
    allow = (data ?? []).map((c: { credential_id: string; transports: string[] }) => ({ id: c.credential_id, transports: c.transports as never }))
  }
  const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'required', allowCredentials: allow })
  await keepChallenge(sb, options.challenge, 'login', memberId)
  return options
}

/** The person whose passkey signed, once it checks out. */
// deno-lint-ignore no-explicit-any
export async function login(sb: Db, response: any): Promise<string> {
  const expectedChallenge = await takeChallenge(sb, response?.response?.clientDataJSON, 'login', null)
  const { data: key, error } = await sb.from('member_passkeys').select('id,member_id,credential_id,public_key,counter,transports').eq('credential_id', String(response?.id ?? '')).maybeSingle()
  if (error) throw error
  if (!key) throw new Error('This Face ID isn’t set up for Tabor House. Use your PIN.')
  const result = await verifyAuthenticationResponse({
    response, expectedChallenge, expectedOrigin: RP_ORIGIN, expectedRPID: RP_ID, requireUserVerification: true,
    credential: { id: key.credential_id, publicKey: isoBase64URL.toBuffer(key.public_key), counter: Number(key.counter), transports: key.transports },
  })
  if (!result.verified) throw new Error('Face ID didn’t match. Use your PIN.')
  await sb.from('member_passkeys').update({ counter: result.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq('id', key.id)
  return key.member_id as string
}
