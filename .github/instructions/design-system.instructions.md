---
description: "Use when building or changing any Casa Tabor UX, screen, component, interaction, loading state, feedback state, or visual styling."
applyTo: "src/**/*.{ts,tsx,css}"
---

# Casa Tabor Design System (Always-On for UX)

Treat the current design system as the required source of truth for every user-facing change.

## Reuse before creating

- Search `src/components/ui/`, `src/design-system/`, and the Design System gallery before writing UI.
- Use shared semantic typography, color, spacing, control, radius, shadow, motion, and z-index tokens.
- Use existing primitives and their documented variants instead of reproducing them with local Tailwind class combinations.
- Do not hand-roll buttons, pills, toggles, fields, dialogs, alerts, progress bars, loading states, or empty/error states when a shared component exists.
- Preserve the semantic distinction between components:
  - static `Chip` for status or metadata,
  - interactive `Chip` for compact actions or filters,
  - `Switch` for binary on/off,
  - `SegmentedControl` for choosing one of two or more labeled views,
  - `Checkbox` for independent selections,
  - `Radio` for one choice in a group.

## Extend centrally for new UX

When the existing system cannot express a genuinely new requirement:

1. Explain the missing design-system contract and propose the reusable addition.
2. Add or extend the primitive in `src/components/ui/` and its semantic tokens or variants in `src/design-system/`.
3. Include all relevant states: default, pressed/selected, focus, disabled, loading, empty, success, warning, and error as applicable.
4. Add the component and usage guidance to `src/pages/DesignSystemGalleryPage.tsx`.
5. Add focused regression tests for geometry, semantics, accessibility, and the original consuming surface.
6. Migrate all in-scope duplicate implementations to the shared contract.

Never solve a new UX need with a page-local one-off if it is likely to recur.

## Touch and distance requirements

- Design for a wall-mounted touch display viewed from several feet away.
- Use semantic typography roles; do not introduce arbitrary or legacy font-size utilities.
- Use density-aware control tokens and meet the shared touch-target minimum.
- Keep tap targets spatially stable. Prefer overlays, modals, sheets, popovers, or toasts when inline expansion would shift nearby controls during rapid interaction.
- Do not rely on hover, tiny icons, color alone, or subtle state changes.
- Keep labels concrete, readable, and operationally truthful.

## Completeness standard

Before considering UX work complete:

- Audit the full affected surface and parallel implementations, not only the reported element.
- Cover responsive touch, kiosk, and fine-pointer density behavior.
- Cover interaction, keyboard/accessibility, loading, success, empty, disabled, and failure states where relevant.
- Verify the real rendered path in addition to tests/build.
- For frontend changes, deploy through the repository workflow, refresh the Pi kiosk, and verify Chromium is running.
