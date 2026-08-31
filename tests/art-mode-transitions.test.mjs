import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEFAULT_DOMINANT_COLOR,
  DEFAULT_MAT_COLOR,
  generateHarmonizedBevel,
  generateAdaptiveMatColor,
} from '../src/utils/colorUtils.ts'

const screensaverSource = readFileSync(
  new URL('../src/components/shared/ArtScreensaver.tsx', import.meta.url),
  'utf8',
)
const artworkHookSource = readFileSync(
  new URL('../src/hooks/useArtwork.ts', import.meta.url),
  'utf8',
)
const indexCssSource = readFileSync(
  new URL('../src/index.css', import.meta.url),
  'utf8',
)

test('useArtwork hook implements artworkMetadataCache and background prefetch', () => {
  assert.match(artworkHookSource, /export const artworkMetadataCache = new Map/)
  assert.match(artworkHookSource, /export async function prefetchAndDecodeArtwork/)
  assert.match(artworkHookSource, /img\.decode\(\)/)
  assert.match(artworkHookSource, /toPreload\.push/)
  assert.match(artworkHookSource, /void prefetchAndDecodeArtwork/)
})

test('useArtwork hook exports nextArtwork, prev, next, and bidirectional controls', () => {
  assert.match(artworkHookSource, /nextUnitId|nextArtworkId/)
  assert.match(artworkHookSource, /nextArtwork/)
  assert.match(artworkHookSource, /const prev = useCallback/)
  assert.match(artworkHookSource, /advance\('prev'\)/)
  assert.match(artworkHookSource, /advance\('next'\)/)
})

test('ArtScreensaver eliminates flashing pulse placeholder and implements dual-layer crossfade', () => {
  // Verifies the old unmounted blinking pulse box was removed
  assert.doesNotMatch(screensaverSource, /animation:\s*'pulse 2s ease-in-out infinite'/)
  
  // Verifies keyframe animations in index.css
  assert.match(indexCssSource, /@keyframes casa-art-dissolve-out/)

  // Verifies dual layer incoming/outgoing dissolve crossfade
  assert.match(screensaverSource, /outgoingUnit/)
  assert.match(screensaverSource, /leftArt|leftArtwork/)
  assert.match(screensaverSource, /casa-art-dissolve-out 1200ms/)
})

test('ArtScreensaver implements smooth full-frame dissolve and stable mat presets', () => {
  // Full-frame slide rendering
  assert.match(screensaverSource, /renderSlide/)
  assert.match(screensaverSource, /slideMatColor/)
})

test('artwork renders with rock-solid static stability without optical drift or breathing', () => {
  // Verifies drift/breathe motion is removed for true museum stability
  assert.doesNotMatch(indexCssSource, /@keyframes casa-art-drift/)
  assert.doesNotMatch(screensaverSource, /casa-art-drift/)
})

test('ArtScreensaver supports kiosk touch edge-taps, swipe gestures, and keyboard arrows', () => {
  // Edge tap navigation zones
  assert.match(screensaverSource, /title="Previous artwork"/)
  assert.match(screensaverSource, /title="Next artwork"/)
  assert.match(screensaverSource, /handlePrevPiece/)
  assert.match(screensaverSource, /handleNextPiece/)
  
  // Touch swipe handling
  assert.match(screensaverSource, /handleTouchStart/)
  assert.match(screensaverSource, /handleTouchEnd/)
  
  // Keyboard arrow keys
  assert.match(screensaverSource, /e\.key === 'ArrowRight'/)
  assert.match(screensaverSource, /e\.key === 'ArrowLeft'/)
})

test('colorUtils provides harmonized bevel palettes and default fallback constants', () => {
  assert.equal(typeof DEFAULT_DOMINANT_COLOR, 'string')
  assert.equal(typeof DEFAULT_MAT_COLOR, 'string')
  
  const bevels = generateHarmonizedBevel('#E8E3D7', '#2A4D69')
  assert.ok(bevels.top.startsWith('#'))
  assert.ok(bevels.left.startsWith('#'))
  assert.ok(bevels.right.startsWith('#'))
  assert.ok(bevels.bottom.startsWith('#'))
  assert.ok(bevels.radiosity.startsWith('rgba'))
})

test('useArtwork implements 1:1 square detection, pairing, and presentation units', () => {
  assert.match(artworkHookSource, /export function isSquareArtwork/)
  assert.match(artworkHookSource, /export function buildPresentationUnits/)
  assert.match(artworkHookSource, /type PresentationUnit/)
  assert.match(artworkHookSource, /aspectRatioMode/)
  assert.match(artworkHookSource, /diptychArtworks/)
})

test('ArtScreensaver supports dual 1:1 diptych layout, split plaques, and dual provenance tabs', () => {
  assert.match(screensaverSource, /isDiptych/)
  assert.match(screensaverSource, /squareApertureSize/)
  assert.match(screensaverSource, /diptychMullion/)
  assert.match(screensaverSource, /provenanceTab/)
  assert.match(screensaverSource, /leftArt|leftArtwork/)
  assert.match(screensaverSource, /rightArt|rightArtwork/)
  assert.match(screensaverSource, /title="Previous artwork"/)
  assert.match(screensaverSource, /title="Next artwork"/)
})

