import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildArtworkFeed,
  getPersonalArtworkValidationError,
  normalizeArtSourceConfig,
} from '../src/lib/artModeLibrary.ts'

const casaArtwork = [{ id: 1, title: 'Casa', artist: 'Museum', imageUrl: 'https://example.com/casa.jpg' }]
const personalArtwork = [{ id: 'personal-1', title: 'Family art', artist: 'Personal collection', imageUrl: 'https://example.com/personal.jpg' }]
const settingsSource = readFileSync(
  new URL('../src/pages/ArtModeSettingsPage.tsx', import.meta.url),
  'utf8',
)
const artworkHookSource = readFileSync(
  new URL('../src/hooks/useArtwork.ts', import.meta.url),
  'utf8',
)
const personalHookSource = readFileSync(
  new URL('../src/hooks/usePersonalArtMode.ts', import.meta.url),
  'utf8',
)

test('personal-only Art Mode excludes Casa gallery artwork', () => {
  assert.deepEqual(buildArtworkFeed('personal', casaArtwork, personalArtwork), personalArtwork)
})

test('mixed Art Mode includes personal and Casa artwork', () => {
  assert.deepEqual(buildArtworkFeed('mixed', casaArtwork, personalArtwork), [
    personalArtwork[0],
    casaArtwork[0],
  ])
})

test('Art Mode source config defaults safely to Casa gallery', () => {
  assert.deepEqual(normalizeArtSourceConfig(null), { sourceMode: 'casa' })
  assert.deepEqual(normalizeArtSourceConfig({ sourceMode: 'personal' }), { sourceMode: 'personal' })
  assert.deepEqual(normalizeArtSourceConfig({ sourceMode: 'unexpected' }), { sourceMode: 'casa' })
})

test('personal artwork accepts display-safe images up to 20 MB', () => {
  assert.equal(getPersonalArtworkValidationError({
    name: 'Watercolor RedBull.png',
    type: 'image/png',
    size: 5_000_000,
  }), null)
})

test('personal artwork rejects unsupported formats and oversized files', () => {
  assert.match(getPersonalArtworkValidationError({
    name: 'art.svg',
    type: 'image/svg+xml',
    size: 100,
  }), /JPG, PNG, or WebP/)
  assert.match(getPersonalArtworkValidationError({
    name: 'art.png',
    type: 'image/png',
    size: 20 * 1024 * 1024 + 1,
  }), /20 MB/)
})

test('Art Mode settings expose Casa, personal-only, and mixed sources with managed uploads', () => {
  assert.match(settingsSource, /Casa Gallery/)
  assert.match(settingsSource, /Personal only/)
  assert.match(settingsSource, /Mix both/)
  assert.match(settingsSource, /accept="image\/jpeg,image\/png,image\/webp"/)
  assert.match(settingsSource, /deleteArtwork/)
})

test('the slideshow consumes the shared source mode and personal artwork query', () => {
  assert.match(artworkHookSource, /usePersonalArtModeData\(\)/)
  assert.match(artworkHookSource, /buildArtworkFeed\(\s*sourceMode[\s\S]*?personal/)
})

test('failed metadata inserts clean up uploaded storage objects', () => {
  assert.match(personalHookSource, /if \(insertError\)[\s\S]*\.remove\(\[storagePath\]\)/)
})

test('personal Art Mode provides 16:9 image cropping with old storage cleanup and UI integration', () => {
  assert.match(personalHookSource, /cropArtwork/)
  assert.match(personalHookSource, /cropMutation/)
  assert.match(personalHookSource, /if \(oldStoragePath && oldStoragePath !== newStoragePath\)[\s\S]*\.remove\(\[oldStoragePath\]\)/)
  assert.match(settingsSource, /ArtworkCropModal/)
  assert.match(settingsSource, /handleOpenCrop/)
  assert.match(settingsSource, /handleSaveCrop/)
  assert.match(settingsSource, /Crop to 16:9/)
})

test('personal Art Mode schema and hooks support full archival provenance fields', () => {
  assert.match(personalHookSource, /location\?: string/)
  assert.match(personalHookSource, /dateTaken\?: string/)
  assert.match(personalHookSource, /description\?: string/)
  assert.match(personalHookSource, /subjects\?: string/)
  assert.match(personalHookSource, /medium\?: string/)
  assert.match(personalHookSource, /funFact\?: string/)
  assert.match(personalHookSource, /updatePayload\.location = location\.trim\(\)/)
  assert.match(personalHookSource, /updatePayload\.date_taken = dateTaken\.trim\(\)/)
  assert.match(personalHookSource, /updatePayload\.description = description\.trim\(\)/)
  assert.match(artworkHookSource, /location:\s*item\.location/)
  assert.match(artworkHookSource, /dateTaken:\s*item\.dateTaken/)
  assert.match(artworkHookSource, /funFact:\s*item\.funFact/)
})

test('screensaver exposes interactive provenance plaque with touch guard and 8s auto-fade', () => {
  const screensaverSource = readFileSync(
    new URL('../src/components/shared/ArtScreensaver.tsx', import.meta.url),
    'utf8',
  )
  assert.match(screensaverSource, /ArtworkProvenanceCard/)
  assert.match(screensaverSource, /handleToggleInfo/)
  assert.match(screensaverSource, /infoTimerRef\.current = setTimeout\([\s\S]*8000\)/)
  assert.match(screensaverSource, /e\.key === 'i' \|\| e\.key === 'I'/)
  assert.match(screensaverSource, /setInfoOpen\(false\)/)
})

test('Art Mode settings features 2-tab provenance and signature studio', () => {
  assert.match(settingsSource, /Story & Provenance/)
  assert.match(settingsSource, /Signature Studio/)
  assert.match(settingsSource, /Historical Background & Story/)
  assert.match(settingsSource, /Insider Trivia \/ Fun Facts/)
  assert.match(settingsSource, /Key Figures & Subjects/)
  assert.match(settingsSource, /onViewProvenance=\{setProvenancePreviewArtwork\}/)
})
