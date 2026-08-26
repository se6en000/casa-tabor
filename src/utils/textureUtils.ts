/**
 * Texture generation utilities for realistic paper/canvas grain effect.
 * Creates SVG-based noise patterns and lighting overlays for seamless physical art simulation.
 */

/**
 * Organic cold-press paper grain SVG texture (data URI).
 * Uses fractalNoise to mimic authentic 300gsm watercolor paper tooth and fiber.
 */
export const PAPER_GRAIN_TEXTURE = `data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paperTooth'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.18 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paperTooth)'/%3E%3C/svg%3E`

/**
 * Archival mat board micro-weave linen texture.
 */
export const MAT_LINEN_TEXTURE = `data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='matWeave'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.08 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23matWeave)'/%3E%3C/svg%3E`

/**
 * Generate an SVG-based canvas/linen texture.
 * Returns a data URL that can be used as a background image.
 */
export function generateCanvasTexture(opacity: number = 0.015): string {
  const svg = `
    <svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" result="noise" />
          <feComponentTransfer in="noise">
            <feFuncA type="linear" slope="${opacity}" />
          </feComponentTransfer>
          <feComposite in="SourceGraphic" in2="noise" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
        </filter>
      </defs>
      <rect width="256" height="256" fill="white" filter="url(#grain)" />
    </svg>
  `
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * Generate a subtle vignette gradient (darkens edges).
 * Returns CSS radial-gradient string.
 */
export function generateVignetteGradient(strength: number = 0.03): string {
  return `radial-gradient(ellipse at center, transparent 60%, rgba(0, 0, 0, ${strength}) 100%)`
}

/**
 * Generate realistic lighting simulation overlay.
 * Simulates gentle directional ambient lighting from top-left.
 */
export function generateLightingOverlay(strength: number = 0.03): string {
  return `
    linear-gradient(145deg, 
      rgba(255, 255, 255, ${strength * 0.7}) 0%, 
      transparent 40%,
      transparent 70%,
      rgba(0, 0, 0, ${strength * 0.4}) 100%)
  `
}

/**
 * Generate a paper-like texture using CSS background patterns for the outer mat board.
 * Combines multiple layers for physical archival board depth.
 */
export function getTextureStyle() {
  const vignette = generateVignetteGradient(0.02)
  const lighting = generateLightingOverlay(0.02)
  
  // Archival mat board fiber grain
  const fiberGrain = `
    repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,.008) 3px, rgba(0,0,0,.008) 6px),
    repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(0,0,0,.005) 3px, rgba(0,0,0,.005) 6px),
    repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,.004) 2px, rgba(0,0,0,.004) 4px)
  `
  
  return {
    backgroundImage: `url("${MAT_LINEN_TEXTURE}"), ${vignette}, ${lighting}, ${fiberGrain}`,
    backgroundSize: '256px 256px, 100% 100%, 100% 100%, 256px 256px',
    backgroundPosition: '0 0, 0 0, 0 0, 0 0',
    backgroundAttachment: 'fixed, scroll, scroll, fixed',
    backgroundBlendMode: 'multiply, normal, normal, normal',
  }
}
