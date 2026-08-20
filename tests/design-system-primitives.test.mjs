import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  CARD_PADDINGS,
  CARD_TONES,
  CHIP_SIZES,
  CHIP_TONES,
  ICON_BUTTON_SIZES,
  ICON_BUTTON_VARIANTS,
  MODAL_SIZES,
  SHEET_SIDES,
  buttonClassName,
  cardClassName,
  chipClassName,
  fieldControlClassName,
  iconButtonClassName,
  modalPanelClassName,
  sheetPanelClassName,
  segmentedControlClassName,
  segmentedControlItemClassName,
  segmentedControlThumbClassName,
} from '../src/design-system/variants.mjs'
import { DEFAULT_THEME_COLORS, DESIGN_TOKENS, MIDNIGHT_THEME_COLORS, THEME_COLOR_KEYS } from '../src/design-system/tokens.mjs'
import { APPEARANCE_PRESETS } from '../src/design-system/themes.mjs'
import { getThemeContrastIssues } from '../src/design-system/themeContrast.mjs'

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9A-Fa-f]{2}/g).map((channel) => Number.parseInt(channel, 16) / 255)
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  )
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
}

function contrastRatio(first, second) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second))
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

function colorDistance(first, second) {
  const firstChannels = first.match(/[0-9A-Fa-f]{2}/g).map(channel => Number.parseInt(channel, 16))
  const secondChannels = second.match(/[0-9A-Fa-f]{2}/g).map(channel => Number.parseInt(channel, 16))
  return Math.hypot(...firstChannels.map((channel, index) => channel - secondChannels[index]))
}

test('buttonClassName covers every documented variant with a distinct class set', () => {
  const seen = new Set()
  for (const variant of BUTTON_VARIANTS) {
    const cls = buttonClassName({ variant })
    assert.ok(cls.length > 0, `variant ${variant} must produce classes`)
    seen.add(cls)
  }
  assert.equal(seen.size, BUTTON_VARIANTS.length, 'each variant should be visually distinct')
})

test('high-emphasis button variants own readable foreground contrast', () => {
  assert.match(buttonClassName({ variant: 'primary' }), /bg-casa-gold/)
  assert.match(buttonClassName({ variant: 'primary' }), /casa-action-primary/)
  assert.match(buttonClassName({ variant: 'strong' }), /bg-casa-navy/)
  assert.match(buttonClassName({ variant: 'strong' }), /casa-action-strong/)
  assert.match(iconButtonClassName({ variant: 'strong' }), /casa-action-strong/)
  assert.ok(
    contrastRatio(DEFAULT_THEME_COLORS['casa-gold'], DEFAULT_THEME_COLORS['casa-navy']) >= 4.5,
    'primary button colors must meet WCAG AA for normal text',
  )
  assert.ok(
    contrastRatio(DEFAULT_THEME_COLORS['casa-navy'], DESIGN_TOKENS.staticColor['casa-on-dark']) >= 4.5,
    'strong button colors must meet WCAG AA for normal text',
  )
  assert.ok(
    contrastRatio(MIDNIGHT_THEME_COLORS['casa-gold'], MIDNIGHT_THEME_COLORS['casa-navy']) >= 4.5,
    'primary button colors must remain readable in the midnight theme',
  )
  assert.ok(
    contrastRatio(MIDNIGHT_THEME_COLORS['casa-navy'], DESIGN_TOKENS.staticColor['casa-on-dark']) >= 4.5,
    'strong button colors must remain readable in the midnight theme',
  )
})

test('every curated appearance preset implements the complete theme contract with readable core text', () => {
  assert.deepEqual(
    APPEARANCE_PRESETS.map(preset => preset.id),
    ['default', 'espresso', 'liv-blush', 'kitchen-teal', 'belgian-linen', 'weathered-olive', 'slate-atelier'],
  )
  for (const preset of APPEARANCE_PRESETS) {
    assert.deepEqual(
      Object.keys(preset.colors).sort(),
      [...THEME_COLOR_KEYS].sort(),
      `${preset.label} must define every semantic theme color`,
    )
    assert.deepEqual(
      getThemeContrastIssues(preset.colors),
      [],
      `${preset.label} must pass the core WCAG AA contrast checks`,
    )
  }
})

test('heritage palettes keep visibly distinct primary and accent identities', () => {
  const heritageIds = ['espresso', 'belgian-linen', 'weathered-olive', 'slate-atelier']
  const heritagePresets = APPEARANCE_PRESETS.filter(preset => heritageIds.includes(preset.id))

  for (const [index, preset] of heritagePresets.entries()) {
    for (const comparison of heritagePresets.slice(index + 1)) {
      assert.ok(
        colorDistance(preset.colors['casa-navy'], comparison.colors['casa-navy']) >= 24,
        `${preset.label} and ${comparison.label} need more distinct primary colors`,
      )
      assert.ok(
        colorDistance(preset.colors['casa-gold'], comparison.colors['casa-gold']) >= 24,
        `${preset.label} and ${comparison.label} need more distinct accent colors`,
      )
    }
  }
})

test('subtle button is a neutral low-emphasis utility surface', () => {
  const classes = buttonClassName({ variant: 'subtle' })
  assert.match(classes, /bg-surface-inset/)
  assert.match(classes, /text-content-primary/)
  assert.doesNotMatch(classes, /bg-casa-gold|bg-casa-navy/)
})

test('neutral controls use theme-aware semantic foregrounds', () => {
  assert.match(buttonClassName({ variant: 'secondary' }), /text-content-heading/)
  assert.match(buttonClassName({ variant: 'ghost' }), /text-content-heading/)
  assert.match(iconButtonClassName({ variant: 'secondary' }), /text-content-heading/)
  assert.match(chipClassName({ tone: 'accent' }), /text-content-heading/)
  assert.match(fieldControlClassName(), /text-content-primary/)
})

test('Heading exposes a dedicated on-dark contrast contract', () => {
  const typography = readFileSync(resolve('src/components/ui/Typography.tsx'), 'utf8')
  const styles = readFileSync(resolve('src/index.css'), 'utf8')

  assert.match(typography, /export type HeadingTone = 'default' \| 'on-dark'/)
  assert.match(typography, /tone === 'on-dark' \? 'casa-heading-on-dark'/)
  assert.match(styles, /\.casa-heading-on-dark\s*\{[\s\S]*?color: var\(--color-casa-on-dark\)/)
})

test('buttonClassName covers every documented size with a touch-target min-h utility', () => {
  for (const size of BUTTON_SIZES) {
    const cls = buttonClassName({ size })
    assert.match(cls, /min-h-control(?:-lg)?(?:\s|$)/, `size ${size} must meet or exceed the density-aware minimum target`)
  }
})

test('buttonClassName defaults to primary/md for unknown or omitted options', () => {
  assert.equal(buttonClassName(), buttonClassName({ variant: 'primary', size: 'md' }))
  assert.equal(buttonClassName({ variant: 'not-a-variant' }), buttonClassName({ variant: 'primary' }))
  assert.equal(buttonClassName({ size: 'not-a-size' }), buttonClassName({ size: 'md' }))
})

test('buttonClassName fullWidth appends w-full without dropping base classes', () => {
  const base = buttonClassName({ variant: 'secondary' })
  const full = buttonClassName({ variant: 'secondary', fullWidth: true })
  assert.ok(full.includes('w-full'))
  assert.ok(full.startsWith(base) || full.includes(base.split(' ')[0]))
})

test('buttonClassName loading state positions the component spinner without hiding descendant icons', () => {
  const cls = buttonClassName({ loading: true })
  assert.match(cls, /relative/)
  assert.doesNotMatch(cls, /\[&_svg\]:opacity-0/)
  assert.match(cls, /min-h-control/)
})

test('buttonClassName always includes focus-visible accessibility ring classes', () => {
  for (const variant of BUTTON_VARIANTS) {
    const cls = buttonClassName({ variant })
    assert.match(cls, /focus-visible:ring-2/)
  }
})

test('buttonClassName always includes disabled-state classes', () => {
  assert.match(buttonClassName(), /disabled:opacity-40/)
  assert.match(buttonClassName(), /disabled:cursor-not-allowed/)
})

test('iconButtonClassName covers every documented size with the square size-control token', () => {
  for (const size of ICON_BUTTON_SIZES) {
    const cls = iconButtonClassName({ size })
    assert.match(cls, /size-control(?:-lg)?(?:\s|$)/, `size ${size} must meet or exceed the density-aware minimum target`)
  }
})

test('iconButtonClassName covers every documented variant distinctly and defaults to ghost', () => {
  const seen = new Set()
  for (const variant of ICON_BUTTON_VARIANTS) {
    seen.add(iconButtonClassName({ variant }))
  }
  assert.equal(seen.size, ICON_BUTTON_VARIANTS.length)
  assert.equal(iconButtonClassName(), iconButtonClassName({ variant: 'ghost' }))
})

test('chipClassName covers every tone and size combination without throwing', () => {
  for (const tone of CHIP_TONES) {
    for (const size of CHIP_SIZES) {
      const cls = chipClassName({ tone, size })
      assert.ok(cls.length > 0)
      assert.match(cls, /rounded-pill/)
    }
  }
})

test('chipClassName selected state adds a visible ring without losing the tone classes', () => {
  const base = chipClassName({ tone: 'info' })
  const selected = chipClassName({ tone: 'info', selected: true })
  assert.notEqual(base, selected)
  assert.match(selected, /ring-2/)
})

test('chips keep identical geometry whether static or interactive', () => {
  const staticChip = chipClassName({ size: 'md' })
  const interactiveChip = chipClassName({ size: 'md', interactive: true })
  assert.match(staticChip, /min-h-control/)
  assert.match(interactiveChip, /min-h-control/)
  assert.match(staticChip, /px-4/)
  assert.match(interactiveChip, /px-4/)
})

test('chip sizes use density-aware control tokens instead of fixed pixel heights', () => {
  assert.match(chipClassName({ size: 'sm' }), /min-h-control-sm/)
  assert.match(chipClassName({ size: 'md' }), /min-h-control/)
  assert.doesNotMatch(chipClassName({ size: 'sm' }), /min-h-\[/)
  assert.doesNotMatch(chipClassName({ size: 'md' }), /min-h-\[/)
})

test('segmented control presents one track with a sliding selection thumb', () => {
  const root = segmentedControlClassName()
  const inactive = segmentedControlItemClassName()
  const selected = segmentedControlItemClassName({ selected: true })
  const thumb = segmentedControlThumbClassName()
  const draggedThumb = segmentedControlThumbClassName({ dragging: true })
  assert.match(root, /bg-casa-toggle-track/)
  assert.match(root, /rounded-pill/)
  assert.match(root, /relative/)
  assert.match(root, /touch-pan-y/)
  assert.match(thumb, /bg-casa-surface/)
  assert.match(thumb, /shadow-card/)
  assert.match(thumb, /transition-transform/)
  assert.doesNotMatch(draggedThumb, /transition-transform/)
  assert.match(selected, /text-casa-text/)
  assert.doesNotMatch(selected, /bg-casa-surface/)
  assert.doesNotMatch(inactive, /bg-casa-surface/)
  assert.match(selected, /min-h-control/)
  for (const palette of [DEFAULT_THEME_COLORS, MIDNIGHT_THEME_COLORS]) {
    assert.ok(
      contrastRatio(palette['casa-surface'], palette['casa-text']) >= 4.5,
      'selected segment text must meet WCAG AA in every built-in theme',
    )
  }
})

test('cardClassName covers every padding and tone combination', () => {
  for (const padding of CARD_PADDINGS) {
    for (const tone of CARD_TONES) {
      const cls = cardClassName({ padding, tone })
      assert.match(cls, /rounded-card/)
      assert.match(cls, /shadow-card/)
    }
  }
})

test('cardClassName interactive state adds hover/focus affordances and tactile press physics', () => {
  const base = cardClassName()
  const interactive = cardClassName({ interactive: true })
  assert.notEqual(base, interactive)
  assert.match(interactive, /cursor-pointer/)
  assert.match(interactive, /focus-visible:ring-2/)
  assert.match(interactive, /active:scale-\[0\.97\]/)
  assert.match(interactive, /active:opacity-75/)
})

test('fieldControlClassName swaps border/ring tokens for the invalid state', () => {
  const valid = fieldControlClassName()
  const invalid = fieldControlClassName({ invalid: true })
  assert.match(valid, /border-casa-border/)
  assert.match(invalid, /border-casa-error/)
  assert.notEqual(valid, invalid)
})

test('modalPanelClassName covers every documented size and always owns the semantic z-index token', () => {
  for (const size of MODAL_SIZES) {
    const cls = modalPanelClassName({ size })
    assert.match(cls, /z-modal/)
    assert.match(cls, /rounded-modal/)
  }
})

test('sheetPanelClassName covers every documented side and always owns the semantic z-index token', () => {
  for (const side of SHEET_SIDES) {
    const cls = sheetPanelClassName({ side })
    assert.match(cls, /z-modal/)
  }
  assert.notEqual(sheetPanelClassName({ side: 'bottom' }), sheetPanelClassName({ side: 'right' }))
})

test('none of the variant builders ever emit an arbitrary Tailwind z-[N] literal (semantic z-index only)', () => {
  const samples = [
    ...BUTTON_VARIANTS.map((variant) => buttonClassName({ variant })),
    ...ICON_BUTTON_VARIANTS.map((variant) => iconButtonClassName({ variant })),
    ...CHIP_TONES.map((tone) => chipClassName({ tone })),
    cardClassName({ interactive: true }),
    fieldControlClassName({ invalid: true }),
    ...MODAL_SIZES.map((size) => modalPanelClassName({ size })),
    ...SHEET_SIDES.map((side) => sheetPanelClassName({ side })),
  ]
  for (const cls of samples) {
    assert.doesNotMatch(cls, /z-\[\d+\]/)
  }
})
