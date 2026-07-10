import test from 'node:test'
import assert from 'node:assert/strict'

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
} from '../src/design-system/variants.mjs'
import { DEFAULT_THEME_COLORS, DESIGN_TOKENS, MIDNIGHT_THEME_COLORS } from '../src/design-system/tokens.mjs'

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
  assert.match(buttonClassName({ variant: 'primary' }), /text-casa-navy/)
  assert.match(buttonClassName({ variant: 'strong' }), /bg-casa-navy/)
  assert.match(buttonClassName({ variant: 'strong' }), /text-casa-on-dark/)
  assert.match(iconButtonClassName({ variant: 'strong' }), /text-casa-on-dark/)
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

test('interactive chips use the density-aware minimum target while static badges stay compact', () => {
  assert.doesNotMatch(chipClassName(), /min-h-control/)
  assert.match(chipClassName({ interactive: true }), /min-h-control/)
})

test('segmented control presents one track with a distinct selected segment', () => {
  const root = segmentedControlClassName()
  const inactive = segmentedControlItemClassName()
  const selected = segmentedControlItemClassName({ selected: true })
  assert.match(root, /bg-casa-toggle-track/)
  assert.match(root, /rounded-pill/)
  assert.match(inactive, /bg-transparent/)
  assert.match(selected, /bg-casa-surface/)
  assert.match(selected, /text-casa-text/)
  assert.match(selected, /shadow-card/)
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

test('cardClassName interactive state adds hover/focus affordances', () => {
  const base = cardClassName()
  const interactive = cardClassName({ interactive: true })
  assert.notEqual(base, interactive)
  assert.match(interactive, /cursor-pointer/)
  assert.match(interactive, /focus-visible:ring-2/)
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
