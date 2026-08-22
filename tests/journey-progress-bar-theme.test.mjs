import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = process.cwd()

test('JourneyProgressBar supports theme prop ("navy" | "linen")', () => {
  const fileContent = readFileSync(
    join(REPO_ROOT, 'src/components/ui/JourneyProgressBar.tsx'),
    'utf8',
  )
  assert.match(
    fileContent,
    /theme\?:\s*['"]navy['"]\s*\|\s*['"]linen['"]/,
    'JourneyProgressBar must declare theme prop supporting navy and linen',
  )
})

test('JourneyProgressBar has dedicated Linen styling contracts for text, track, and labels', () => {
  const fileContent = readFileSync(
    join(REPO_ROOT, 'src/components/ui/JourneyProgressBar.tsx'),
    'utf8',
  )
  assert.match(
    fileContent,
    /isLinen/,
    'JourneyProgressBar must derive isLinen state from theme prop',
  )
  assert.match(
    fileContent,
    /text-casa-muted|text-casa-text-secondary|text-casa-navy/,
    'JourneyProgressBar must use Casa design token classes for Linen readability',
  )
})

test('ImminentTransitWidget passes heroTheme to JourneyProgressBar', () => {
  const fileContent = readFileSync(
    join(REPO_ROOT, 'src/components/canvas/widgets/ImminentTransitWidget.tsx'),
    'utf8',
  )
  assert.match(
    fileContent,
    /<JourneyProgressBar[^>]*theme=\{isHeroNavy\s*\?\s*['"]navy['"]\s*:\s*['"]linen['"]\}/s,
    'CalmKioskView must pass theme={isHeroNavy ? "navy" : "linen"} to JourneyProgressBar',
  )
})

test('HeroCard supports theme prop ("navy" | "linen")', () => {
  const fileContent = readFileSync(
    join(REPO_ROOT, 'src/components/ui/HeroCard.tsx'),
    'utf8',
  )
  assert.match(
    fileContent,
    /theme\?:\s*['"]navy['"]\s*\|\s*['"]linen['"]/,
    'HeroCard must declare theme prop supporting navy and linen',
  )
})
