import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const migrationPath = new URL('../supabase/migrations/20260808112000_capture_command_phase1.sql', import.meta.url)
const functionPath = new URL('../supabase/functions/capture-command/index.ts', import.meta.url)
const settingsPath = new URL('../src/pages/AISettingsPage.tsx', import.meta.url)
const configPath = new URL('../supabase/config.toml', import.meta.url)

test('capture command migration creates device and request tables', () => {
  assert.equal(existsSync(migrationPath), true)
  const migration = readFileSync(migrationPath, 'utf8')
  assert.match(migration, /create table if not exists public\.capture_devices/i)
  assert.match(migration, /create table if not exists public\.capture_requests/i)
  assert.match(migration, /create policy "capture devices own rows"/i)
  assert.match(migration, /token_hash text not null unique/i)
  assert.match(migration, /client_request_id text not null/i)
  assert.match(migration, /unique \(capture_device_id, client_request_id\)/i)
})

test('capture command endpoint authenticates device tokens and reuses execute-ai-action', () => {
  assert.equal(existsSync(functionPath), true)
  const source = readFileSync(functionPath, 'utf8')
  assert.match(source, /x-casa-capture-token/i)
  assert.match(source, /capture_devices/)
  assert.match(source, /resolveCaptureCommand/)
  assert.match(source, /functions\.invoke\('execute-ai-action'/)
  assert.match(source, /capture_requests/)
  assert.match(source, /client_request_id/)
  assert.match(source, /existingRequest/)
})

test('capture command function is configured for shortcut calls without JWT auth', () => {
  const config = readFileSync(configPath, 'utf8')
  assert.match(config, /\[functions\.capture-command\]/)
  assert.match(config, /verify_jwt = false/)
})

test('AI settings page exposes shortcut token bootstrap controls', () => {
  const source = readFileSync(settingsPath, 'utf8')
  assert.match(source, /Shortcut \/ Action Button/i)
  assert.match(source, /Generate token/i)
  assert.match(source, /capture_devices/)
  assert.match(source, /navigator\.clipboard\.writeText/)
  assert.match(source, /Auth session missing!/i)
  assert.match(source, /You must be signed in to generate a shortcut token\./)
})
