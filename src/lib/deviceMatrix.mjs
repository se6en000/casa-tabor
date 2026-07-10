// Casa Tabor Phase 0 validation matrix — the required viewport/input surfaces
// this app must remain usable on, encoded as executable/static data (not a
// markdown plan) so it can be rendered by the design-system gallery AND
// consumed by future automated checks. Framework-free so it is unit-testable
// (see tests/device-matrix.test.mjs) and importable from both the gallery
// page and any future script, matching the src/lib/*.mjs pattern already
// used for heroFocus/scheduleFastPath/sttConfidence.

/**
 * @typedef {Object} DeviceProfile
 * @property {string} id
 * @property {string} label
 * @property {number} width
 * @property {number} height
 * @property {'touch' | 'fine-pointer'} input
 * @property {string} context
 * @property {string[]} acceptance
 */

/** @type {DeviceProfile[]} */
export const DEVICE_MATRIX = [
  {
    id: 'phone-se',
    label: 'Phone — small (iPhone SE class)',
    width: 375,
    height: 667,
    input: 'touch',
    context: 'Smallest supported phone viewport; worst case for cramped layouts.',
    acceptance: [
      'No horizontal scroll/overflow on any primary screen',
      'All interactive controls meet the 44px touch-target minimum',
      'Primary actions remain reachable without a modal blocking the whole viewport',
      'Text does not clip or overlap at the default OS font scale',
    ],
  },
  {
    id: 'phone-390',
    label: 'Phone — standard (iPhone 12–15 class, 390pt)',
    width: 390,
    height: 844,
    input: 'touch',
    context: 'Most common modern phone width; treat as the primary phone target.',
    acceptance: [
      'No horizontal scroll/overflow on any primary screen',
      'All interactive controls meet the 44px touch-target minimum',
      'Sheets/modals reach full usable height without covering safe-area controls',
      'Tap targets are not visually adjacent enough to cause accidental mis-taps',
    ],
  },
  {
    id: 'phone-428',
    label: 'Phone — large (Plus/Max class, 428pt)',
    width: 428,
    height: 926,
    input: 'touch',
    context: 'Largest common phone width; verify layouts do not look sparse/stretched.',
    acceptance: [
      'No horizontal scroll/overflow on any primary screen',
      'Content does not stretch awkwardly wide without a max-width constraint',
      'All interactive controls meet the 44px touch-target minimum',
    ],
  },
  {
    id: 'tablet-portrait',
    label: 'Tablet — portrait (768×1024)',
    width: 768,
    height: 1024,
    input: 'touch',
    context: 'iPad-class portrait; first breakpoint where multi-column layouts may appear.',
    acceptance: [
      'Two-pane / sidebar layouts (e.g. Settings) do not break or overlap',
      'All interactive controls meet the 44px touch-target minimum',
      'No orphaned single-column phone layout when tablet layout should apply',
    ],
  },
  {
    id: 'tablet-landscape',
    label: 'Tablet — landscape (1024×768)',
    width: 1024,
    height: 768,
    input: 'touch',
    context: 'Same device rotated; verify reduced vertical space does not clip content.',
    acceptance: [
      'Reduced viewport height does not clip primary content or force awkward scroll',
      'Nav/sidebar remain usable without covering active content',
      'All interactive controls meet the 44px touch-target minimum',
    ],
  },
  {
    id: 'pi-kiosk',
    label: 'Pi kiosk — touch (1920×1080)',
    width: 1920,
    height: 1080,
    input: 'touch',
    context: 'Raspberry Pi 5 touchscreen kiosk — the primary always-on production surface.',
    acceptance: [
      'Fluid type scale (html font-size clamp) renders legibly at arm\'s-length viewing distance',
      'All interactive controls meet the 44px touch-target minimum (kiosk fingers, no mouse precision)',
      'No hover-only affordances are required to operate any control (hover is touch-disabled by design)',
      'Ambient/idle states (screensaver, art mode) do not visually conflict with active-state UI',
    ],
  },
  {
    id: 'desktop-fine-pointer',
    label: 'Desktop — fine pointer (1440×900)',
    width: 1440,
    height: 900,
    input: 'fine-pointer',
    context: 'Mac desktop/laptop with mouse/trackpad — the only profile where hover states apply.',
    acceptance: [
      'Hover states are present and legible (only fires on hover:hover per index.css custom-variant)',
      'Density-tuned type scale (html.mac-desktop) does not undersize touch-adjacent controls below 44px',
      'Layout uses available width without stretching content unreadably wide',
    ],
  },
]

/**
 * Classifies an arbitrary width/height into the closest matrix entry by
 * matching input type (touch vs fine-pointer, inferred from pointer/hover
 * media features) and smallest total pixel-distance to a known profile.
 * Pure/deterministic — no DOM access — so it is unit-testable directly.
 * @param {number} width
 * @param {number} height
 * @param {'touch' | 'fine-pointer'} [input]
 * @returns {DeviceProfile}
 */
export function closestDeviceProfile(width, height, input) {
  const pool = input ? DEVICE_MATRIX.filter((d) => d.input === input) : DEVICE_MATRIX
  const candidates = pool.length > 0 ? pool : DEVICE_MATRIX
  let best = candidates[0]
  let bestDist = Infinity
  for (const d of candidates) {
    const dist = Math.abs(d.width - width) + Math.abs(d.height - height)
    if (dist < bestDist) {
      bestDist = dist
      best = d
    }
  }
  return best
}

/**
 * True when the given dimensions exactly match a matrix entry (order-agnostic
 * for width/height so a rotated device still counts as a match).
 * @param {number} width
 * @param {number} height
 * @returns {DeviceProfile | null}
 */
export function exactDeviceMatch(width, height) {
  const direct = DEVICE_MATRIX.find((d) => d.width === width && d.height === height)
  if (direct) return direct
  return DEVICE_MATRIX.find((d) => d.width === height && d.height === width) ?? null
}
