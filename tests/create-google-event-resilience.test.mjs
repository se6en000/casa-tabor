import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('Google Calendar Edge Function Resilience Verification', async (t) => {
  const createGoogleEventSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/functions/create-google-event/index.ts'),
    'utf8'
  )
  const googleConnectionSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/functions/_shared/google-connection.ts'),
    'utf8'
  )

  await t.test('create-google-event wraps handler execution in try/catch block', () => {
    assert.match(
      createGoogleEventSrc,
      /try\s*\{[\s\S]*loadWritableGoogleConnection[\s\S]*\}\s*catch/,
      'create-google-event must wrap connection loading and event creation in try/catch block'
    )
  })

  await t.test('loadWritableGoogleConnection uses resilient limit(1) instead of maybeSingle()', () => {
    assert.match(
      googleConnectionSrc,
      /loadWritableGoogleConnection[\s\S]*?\.limit\(1\)/,
      'loadWritableGoogleConnection must use limit(1) to avoid PGRST116 errors'
    )
  })
})
