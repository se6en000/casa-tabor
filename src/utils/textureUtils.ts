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
 * Organic archival cotton rag paper pulp texture (data URI).
 * High-octave multi-frequency turbulence with diffuse lighting,
 * mimicking authentic, non-repeating unpressed cotton fibers and hot-press museum board tooth.
 */
export const COTTON_RAG_TEXTURE = `data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='cottonPulp'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.45' numOctaves='5' stitchTiles='stitch' result='noise'/%3E%3CfeDiffuseLighting in='noise' lighting-color='%23fff' surfaceScale='1.1' result='light'%3E%3CfeDistantLight azimuth='60' elevation='55'/%3E%3C/feDiffuseLighting%3E%3CfeColorMatrix type='matrix' values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.12 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23cottonPulp)'/%3E%3C/svg%3E`

export const MAT_LINEN_TEXTURE = COTTON_RAG_TEXTURE

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
  return `radial-gradient(ellipse at center, transparent 65%, rgba(0, 0, 0, ${strength}) 100%)`
}

/**
 * Generate realistic lighting simulation overlay.
 * Simulates gentle directional ambient lighting from top-left.
 */
export function generateLightingOverlay(strength: number = 0.03): string {
  return `
    linear-gradient(180deg, 
      rgba(255, 255, 255, ${strength * 0.8}) 0%, 
      rgba(255, 255, 255, ${strength * 0.2}) 35%,
      transparent 70%,
      rgba(0, 0, 0, ${strength * 0.5}) 100%)
  `
}

/**
 * Generate an organic paper-like texture for the outer mat board.
 * Completely eliminates repeating grid lines in favor of natural cotton rag tooth.
 */
export function getTextureStyle() {
  const vignette = generateVignetteGradient(0.025)
  const lighting = generateLightingOverlay(0.025)
  
  return {
    backgroundImage: `url("${COTTON_RAG_TEXTURE}"), ${lighting}, ${vignette}`,
    backgroundSize: '512px 512px, 100% 100%, 100% 100%',
    backgroundPosition: '0 0, 0 0, 0 0',
    backgroundAttachment: 'fixed, scroll, scroll',
    backgroundBlendMode: 'multiply, normal, normal',
  }
}
