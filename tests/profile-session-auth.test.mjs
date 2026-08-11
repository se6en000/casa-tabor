import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createProfileSessionToken,
  verifyProfileSessionToken,
} from '../supabase/functions/_shared/profile-session.mjs'

test('profile identity is derived from a signed token and current credential version', async () => {
  const token = await createProfileSessionToken({
    session: {
      role: 'family_member',
      member_id: 'member-1',
      credential_version: 4,
    },
    secret: 'test-secret',
  })

  const claims = await verifyProfileSessionToken({
    token,
    secret: 'test-secret',
    loadCredentialVersion: async () => 4,
  })

  assert.equal(claims.member_id, 'member-1')
})

test('profile sessions reject forged tokens and revoked credential versions', async () => {
  const token = await createProfileSessionToken({
    session: {
      role: 'family_member',
      member_id: 'member-1',
      credential_version: 4,
    },
    secret: 'test-secret',
  })

  await assert.rejects(
    verifyProfileSessionToken({
      token: `${token}tampered`,
      secret: 'test-secret',
      loadCredentialVersion: async () => 4,
    }),
    /invalid/i,
  )
  await assert.rejects(
    verifyProfileSessionToken({
      token,
      secret: 'test-secret',
      loadCredentialVersion: async () => 5,
    }),
    /no longer valid/i,
  )
})
