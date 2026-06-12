/**
 * Texture generation utilities for realistic paper/canvas grain effect.
 * Creates SVG-based noise patterns for seamless tiling without performance impact.
 */

/**
 * Generate an SVG-based canvas/linen texture.
 * Returns a data URL that can be used as a background image.
 * More performant than raster textures and maintains sharpness.
 */
export function generateCanvasTexture(opacity: number = 0.015): string {
  // SVG with Perlin-like noise using feTurbulence for organic grain
  const svg = `
    <svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="grain">
          <!-- Organic noise pattern -->
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" result="noise" />
          <!-- Sharpen the grain slightly -->
          <feComponentTransfer in="noise">
            <feFuncA type="linear" slope="${opacity}" />
          </feComponentTransfer>
          <!-- Overlay on background -->
          <feComposite in="SourceGraphic" in2="noise" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
        </filter>
      </defs>
      <!-- White rectangle with grain applied -->
      <rect width="256" height="256" fill="white" filter="url(#grain)" />
    </svg>
  `
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * Generate a subtle vignette gradient (darkens edges).
 * Returns CSS radial-gradient string.
 */
export function generateVignetteGradient(strength: number = 0.15): string {
  // Radial gradient from transparent center to dark edges
  return `radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, ${strength}) 100%)`
}

/**
 * Generate realistic lighting simulation overlay.
 * Simulates light coming from top-left with subtle falloff.
 */
export function generateLightingOverlay(strength: number = 0.08): string {
  return `
    linear-gradient(135deg, 
      rgba(255, 255, 255, ${strength * 0.5}) 0%, 
      transparent 30%,
      transparent 70%,
      rgba(0, 0, 0, ${strength * 0.4}) 100%)
  `
}

/**
 * Generate a paper-like texture using CSS background patterns.
 * Combines multiple layers for depth.
 */
export function getTextureStyle() {
  const vignette = generateVignetteGradient(0.1)
  const lighting = generateLightingOverlay(0.06)
  const texture = generateCanvasTexture(0.012)
  
  return {
    backgroundImage: `${vignette}, ${lighting}, url('${texture}')`,
    backgroundSize: '100% 100%, 100% 100%, 256px 256px',
    backgroundPosition: '0 0, 0 0, 0 0',
    backgroundAttachment: 'scroll, scroll, fixed',
    backgroundBlendMode: 'normal',
  }
}
