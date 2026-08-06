---
name: design-system
description: "Enforce Casa Tabor design-system fidelity for any UI, UX, CSS, component, view, or page work — reuse existing primitives and tokens, forbid inline hex codes and ad-hoc styles, and require reading a comparable existing screen before drafting new interface. Use when building, changing, or reviewing screens, components, styling, layout, spacing, typography, density, or visual states."
argument-hint: "Optional: the screen, component, or visual behavior you're about to build or change"
user-invocable: true
---

# Design System Fidelity

This skill is the **enforcement pipeline** for Casa Tabor's design system. The
canonical rules already live in
[.github/instructions/design-system.instructions.md](/Users/taboj/Public/casa-tabor.worktrees/apt-link-event-details-navigation/.github/instructions/design-system.instructions.md),
which auto-applies to every edit under `src/**/*.{ts,tsx,css}` regardless of
this skill. **Do not duplicate or restate those rules from memory — open and
follow that file directly for every UI change.** This skill adds three things
the always-on instructions file does not: an explicit anti-inline-style/hex
gate, a mandatory "read an existing comparable screen first" pipeline step,
and a single reference block of exactly which files hold the live tokens and
component inventory, so you never guess at a color, spacing, or type value.

## Where the truth lives (read these, don't guess)

| What you need | File |
| --- | --- |
| Live CSS custom properties (colors, type scale, radius, control sizing) — generated, read-only | [src/generated/design-tokens.css](/Users/taboj/Public/casa-tabor.worktrees/apt-link-event-details-navigation/src/generated/design-tokens.css) |
| Source of truth for token values (edit here, never in the generated CSS) | [src/design-system/tokens.mjs](/Users/taboj/Public/casa-tabor.worktrees/apt-link-event-details-navigation/src/design-system/tokens.mjs) |
| Component inventory: purpose, variants, states, a11y, responsive rules, usage example per component | [src/design-system/documentation.mjs](/Users/taboj/Public/casa-tabor.worktrees/apt-link-event-details-navigation/src/design-system/documentation.mjs) |
| Pure class-name/variant logic behind each primitive | `src/design-system/variants.mjs` |
| Every shared primitive (Button, Card, Chip, Field, Modal, Sheet, Typography, SegmentedControl, SelectionControls, Combobox, Alert, Toast, Progress, Skeleton, EmptyState, DateTimeDial, DisclosureSection, FormSummaryCard, PersonAvatarStack, CalendarPill, PageShell, …) | [src/components/ui/index.ts](/Users/taboj/Public/casa-tabor.worktrees/apt-link-event-details-navigation/src/components/ui/index.ts) |
| Live rendering of every component/variant/state — check before assuming something doesn't exist | [src/pages/DesignSystemGalleryPage.tsx](/Users/taboj/Public/casa-tabor.worktrees/apt-link-event-details-navigation/src/pages/DesignSystemGalleryPage.tsx) |
| Global stylesheet, Tailwind v4 theme import, shared overlay/scrim/touch-variant rules | [src/index.css](/Users/taboj/Public/casa-tabor.worktrees/apt-link-event-details-navigation/src/index.css) |
| Token generator (run after editing `tokens.mjs`) | `scripts/generate-design-tokens.mjs` (`npm run tokens:generate`, checked in CI via `npm run tokens:check`) |

Import shared primitives the way the rest of the app does — a single named
import from the barrel, not deep paths:
```tsx
import { Button, Card, Chip, Field, Heading, Text } from '../components/ui'
```

## Hard rule: no inline styles, no ad-hoc hex codes

- Never write a raw hex/rgb/hsl color in `className`, a Tailwind arbitrary
  value (`bg-[#...]`, `border-[#...]`), or a `style={{ ... }}` prop unless it
  is one of the two narrow exceptions below. If the color you need isn't a
  token yet, that's a signal to add it to `THEME_COLOR_KEYS` in `tokens.mjs`
  (see "Extend centrally" in the instructions file), not to hardcode it.
- Never use `style={{ ... }}` for layout, spacing, color, typography, radius,
  or shadow that a Tailwind utility or design token already expresses. Reach
  for `style` only for a value that is inherently computed/dynamic at
  runtime and cannot be a static class (e.g. a `transform` driven by drag
  position, a `width` percentage from live data).
- **Narrow exceptions** (must still prefer a token first):
  - Official third-party brand marks that must render exact brand colors
    (e.g. the multi-color Google "G" logo SVG paths) — these are legally/
    visually fixed, not part of Casa's palette.
  - A literal, user-authored data value being *previewed as itself* (e.g. a
    live color-picker swatch showing the hex the user just typed, or a
    per-family-member calendar color already stored as a hex string in the
    database) — bind it from the data/token (`--color-family-jake`, etc.),
    don't invent a new one.
  - Both exceptions still forbid introducing a **new, undocumented** color —
    they only cover displaying a value that is externally fixed or
    already a token.
- If you find yourself typing a `#`, stop and check `tokens.mjs` /
  `design-tokens.css` for the semantic name first.

## Pipeline: look before you draft

Before writing or changing any screen, component, or style:

1. **Find a comparable existing surface first.** Open at least one real page
   or component that solves a structurally similar problem (a settings page
   if you're building a settings page, a sheet if you're building a sheet, a
   list+detail pattern if you're building list+detail). Read its actual
   spacing (gap/padding scale), typography roles (`Heading`/`Text` variants,
   not raw font-size classes), and control density before drafting anything
   new. Do not invent spacing/type/density from general web conventions when
   an established local pattern already exists.
2. **Check the component inventory before hand-rolling.** Search
   `documentation.mjs` and `components/ui/index.ts` for a primitive that
   already covers the need (button, chip, toggle, dialog, empty/error state,
   loading state). Only build new markup for something genuinely novel.
3. **Match, don't approximate.** Reuse the same gap/padding scale, the same
   `Heading`/`Text` role names, the same control size tokens, and the same
   overlay/scrim pattern (`.casa-scrim` in `index.css`) as the reference
   surface you found in step 1 — do not eyeball a "close enough" spacing
   value.
4. **Extend centrally, not locally**, per the instructions file's "Extend
   centrally for new UX" section, when no existing primitive/token covers a
   genuinely new requirement.
5. **Verify the rendered result**, not just the diff — this is a touch/kiosk
   display viewed from a distance; confirm density, contrast, and tap targets
   in the actual running app before calling UI work done.

## Relationship to other skills

- [.github/instructions/design-system.instructions.md](/Users/taboj/Public/casa-tabor.worktrees/apt-link-event-details-navigation/.github/instructions/design-system.instructions.md) —
  the canonical, always-on rulebook (auto-applies to `src/**/*.{ts,tsx,css}`
  with no invocation needed). This skill does not replace it; this skill adds
  an explicit inline-style/hex gate and a "read a comparable surface first"
  pipeline step that the instructions file implies but doesn't spell out as a
  checklist, plus a single reference table so you don't have to search for
  the token/component files every time.
- `ui-ux-pro-max` (user-level skill) — general, cross-project UI/UX design
  intelligence (style libraries, palettes, font pairings, chart types, motion
  presets across many stacks/frameworks). Use it for outside-in inspiration
  or when working in a *different* repo. In Casa Tabor, this skill and the
  instructions file take precedence over generic pattern suggestions from
  `ui-ux-pro-max` — Casa's own tokens and components are always the source of
  truth here, not a generic palette or component idea from that database.
- [pro-fix-playbook](/Users/taboj/Public/casa-tabor.worktrees/apt-link-event-details-navigation/.github/skills/pro-fix-playbook/SKILL.md) —
  governs risk-tiering and validation depth for the change as a whole; this
  skill governs *how* the UI itself is built once you're implementing.
- [test-driven-development](/Users/taboj/Public/casa-tabor.worktrees/apt-link-event-details-navigation/.github/skills/test-driven-development/SKILL.md) —
  still applies for any testable behavior introduced alongside the UI change
  (hooks, formatters, state logic); this skill only covers visual/structural
  fidelity, not the test-first loop.
