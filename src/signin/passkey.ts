import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { invokeAssistantHistory } from '../lib/assistantConversationHistoryClient'
import { supabase } from '../lib/supabase'

/**
 * Face ID (canvas 40c): a passkey on this phone stands in for the PIN. Offered once after a right PIN; after that the
 * keypad's empty corner is a Face ID key. The PIN always still works.
 */
const hasKey = (memberId: string) => `casa.signin.faceid.${memberId}`
const askedKey = (memberId: string) => `casa.signin.faceidAsked.${memberId}`

function read(key: string): string | null { try { return localStorage.getItem(key) } catch { return null } }
function write(key: string, value: string): void { try { localStorage.setItem(key, value) } catch { /* private mode */ } }

export async function faceIdAvailable(): Promise<boolean> {
  try {
    if (!browserSupportsWebAuthn()) return false
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export const hasFaceId = (memberId: string) => read(hasKey(memberId)) === '1'
export const wasOfferedFaceId = (memberId: string) => read(askedKey(memberId)) === '1'
export const markOfferedFaceId = (memberId: string) => write(askedKey(memberId), '1')

/** Sets Face ID up for the person now signed in (their session token). True when this phone has it. */
export async function setUpFaceId(memberId: string, token: string): Promise<boolean> {
  const { options } = await invokeAssistantHistory<{ options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>(token, { action: 'passkey_register_options' })
  try {
    const response = await startRegistration({ optionsJSON: options })
    await invokeAssistantHistory(token, { action: 'passkey_register', response })
  } catch (e) {
    // Already set up on this phone (iCloud Keychain kept it): that's a yes.
    if (e instanceof Error && e.name === 'InvalidStateError') { write(hasKey(memberId), '1'); return true }
    if (e instanceof Error && e.name === 'NotAllowedError') return false
    throw e
  }
  write(hasKey(memberId), '1')
  return true
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('assistant-history', { body })
  if (error) {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
    const message = ctx?.json ? (await ctx.json().catch(() => ({} as { error?: string }))).error : null
    throw new Error(message || 'Face ID didn’t work. Use your PIN.')
  }
  return data as T
}

/** Face ID for this person: their session token, or null when they cancelled. */
export async function signInWithFaceId(memberId: string): Promise<string | null> {
  const { options } = await call<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>({ action: 'passkey_login_options', member_id: memberId })
  let response
  try {
    response = await startAuthentication({ optionsJSON: options })
  } catch (e) {
    if (e instanceof Error && e.name === 'NotAllowedError') return null
    throw e
  }
  const result = await call<{ member_id: string; history_session_token: string }>({ action: 'passkey_login', response })
  if (result.member_id !== memberId) throw new Error('That Face ID is someone else’s. Use your PIN.')
  return result.history_session_token
}
