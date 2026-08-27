/**
 * Color extraction and adaptive mat color utilities.
 * Used to extract dominant colors from artwork images and generate
 * aesthetically pleasing mat colors that complement the artwork.
 */

export interface ColorAnalysis {
  dominant: string
  complementary: string
  matColor: string
  isLight: boolean
}
export const MAT_PRESETS = {
  auto: 'auto',
  warm_linen: '#E8E3D7',     // Soft warm linen / oatmeal (RH & Aman benchmark)
  travertine: '#DCD5C6',     // Travertine sand / warm stone neutral
  coastal_mist: '#DCE0DB',   // Soft coastal sea-salt / sage alabaster
  french_ivory: '#F0ECE4',   // Luminous antique ivory without stark glare
  charcoal: '#1C1E24',       // Dramatic museum slate obsidian
} as const

export type MatPresetKey = keyof typeof MAT_PRESETS

/**
 * Curated museum-grade palette of archival cotton rag mat boards.
 * Warm, glare-free neutrals (85%–89% brightness) used by world-class galleries & framers.
 */
const MAT_PALETTE = [
  '#E8E3D7', // Warm Linen (The RH standard)
  '#ECE7DC', // Antique French Rag
  '#E5E0D4', // Warm Alabaster
  '#DCD5C6', // Travertine Sand
  '#DCE0DB', // Coastal Sage Mist
  '#EAE5DA', // Unbleached Cotton
  '#F0ECE4', // Classic French Ivory
]

/**
 * Extract dominant color from an image using canvas + pixel sampling.
 * Falls back gracefully if CORS blocks access.
 */
export async function extractDominantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    const timeout = setTimeout(() => {
      console.warn('[ColorUtils] Image load timeout, using palette fallback')
      resolve(getPaletteColorForKey(imageUrl))
    }, 5000)
    
    img.onload = () => {
      clearTimeout(timeout)
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 100
        canvas.height = 100
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          resolve(getPaletteColorForKey(imageUrl))
          return
        }
        ctx.drawImage(img, 0, 0, 100, 100)
        const imageData = ctx.getImageData(0, 0, 100, 100)
        const data = imageData.data

        let r = 0, g = 0, b = 0, count = 0
        for (let i = 0; i < data.length; i += 16) {
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          count++
        }

        const avgR = Math.round(r / count)
        const avgG = Math.round(g / count)
        const avgB = Math.round(b / count)

        if (!count) {
          resolve(getPaletteColorForKey(imageUrl))
          return
        }

        const hex = rgbToHex(avgR, avgG, avgB)
        console.log('[ColorUtils] Extracted color:', hex)
        resolve(hex)
      } catch (err) {
        console.warn('[ColorUtils] Canvas extraction failed:', err)
        resolve(getPaletteColorForKey(imageUrl))
      }
    }
    img.onerror = () => {
      clearTimeout(timeout)
      console.warn('[ColorUtils] Image load failed for CORS, using palette')
      resolve(getPaletteColorForKey(imageUrl))
    }
    img.src = imageUrl
  })
}

/**
 * Select a random mat color from the curated palette.
 * This ensures variety even when color extraction fails.
 */
function getPaletteColorForKey(key: string): string {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  const index = hash % MAT_PALETTE.length
  console.log(`[ColorUtils] Palette color selected: ${MAT_PALETTE[index]} (index ${index})`)
  return MAT_PALETTE[index]
}

/**
 * Convert RGB to hex color string.
 */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('').toUpperCase()
}

/**
 * Convert hex color to RGB.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 246, g: 243, b: 234 } // fallback Spanish White
}

/**
 * Calculate luminance of a color (for brightness detection).
 */
export function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(x => {
    x /= 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * Generate a glare-free, museum cotton rag mat color based on the artwork's temperature.
 * Maintains 85%–89% luminance (warm, tactile, non-glaring) while harmonizing undertones.
 */
export async function generateAdaptiveMatColor(imageUrl: string): Promise<ColorAnalysis> {
  try {
    const dominantHex = await extractDominantColor(imageUrl)
    if (MAT_PALETTE.includes(dominantHex)) {
      return {
        dominant: dominantHex,
        complementary: dominantHex,
        matColor: dominantHex,
        isLight: true,
      }
    }
    const { r, g, b } = hexToRgb(dominantHex)

    // Determine artwork temperature: warm (red/amber/earth) vs cool (ocean/sky/greens)
    const warmth = (r - b) / 255 // >0 warm, <0 cool

    // Base museum archival cotton rag (luminance ~87-89%, soft warm linen)
    let baseRag = { r: 232, g: 227, b: 216 } // #E8E3D8 Warm French Linen
    if (warmth > 0.12) {
      // Warm paintings (watercolors, sunsets, earth tones): Warm Alabaster
      baseRag = { r: 235, g: 228, b: 215 } // #EBE4D7
    } else if (warmth < -0.08) {
      // Cool paintings (ocean, seascapes, blues): Coastal Sage Mist
      baseRag = { r: 224, g: 227, b: 224 } // #E0E3E0
    }

    // Subtle 8% temperature tint from dominant color to harmonize without losing calm tone
    const matR = Math.min(242, Math.max(215, Math.round(baseRag.r * 0.92 + r * 0.08)))
    const matG = Math.min(238, Math.max(212, Math.round(baseRag.g * 0.92 + g * 0.08)))
    const matB = Math.min(232, Math.max(205, Math.round(baseRag.b * 0.92 + b * 0.08)))

    const complementaryRgb = getComplementary(r, g, b)

    const result = {
      dominant: dominantHex,
      complementary: rgbToHex(complementaryRgb.r, complementaryRgb.g, complementaryRgb.b),
      matColor: rgbToHex(matR, matG, matB),
      isLight: true,
    }
    console.log(`[ColorUtils] Generated glare-free museum mat color: ${result.matColor}`)
    return result
  } catch (err) {
    console.error('[ColorUtils] Color generation failed:', err)
    return {
      dominant: '#808080',
      complementary: '#808080',
      matColor: '#E8E3D7',
      isLight: true,
    }
  }
}

/**
 * Calculate complementary color (opposite on color wheel).
 */
function getComplementary(
  r: number,
  g: number,
  b: number
): { r: number; g: number; b: number } {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const l = (max + min) / 2

  let h: number
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)

  if (max === min) {
    h = 0
  } else if (max === r / 255) {
    h = (((g - b) / 255) / (max - min) + (g < b ? 6 : 0)) / 6
  } else if (max === g / 255) {
    h = (((b - r) / 255) / (max - min) + 2) / 6
  } else {
    h = (((r - g) / 255) / (max - min) + 4) / 6
  }

  h = (h + 0.5) % 1 // rotate 180°
  const hslToRgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return {
    r: Math.round(hslToRgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hslToRgb(p, q, h) * 255),
    b: Math.round(hslToRgb(p, q, h - 1 / 3) * 255),
  }
}

export interface BevelPalette {
  top: string
  left: string
  right: string
  bottom: string
  radiosity: string
}

/**
 * Generate physical, dimmed 45-degree bevel facets that color-harmonize with
 * both the luminous museum mat board and the adjacent artwork pigments.
 */
export function generateHarmonizedBevel(matColorHex: string, dominantHex: string = '#808080'): BevelPalette {
  const mat = hexToRgb(matColorHex)
  const dom = hexToRgb(dominantHex)

  // 1. Archival Cotton Rag Core Base (Natural unbleached cotton core pulp, ~92% luminance)
  const coreR = Math.round(242 * 0.75 + mat.r * 0.25)
  const coreG = Math.round(238 * 0.75 + mat.g * 0.25)
  const coreB = Math.round(230 * 0.75 + mat.b * 0.25)

  // 2. Top Bevel: Downward-facing facet in soft shadow of the mat overhang (~86% luminance)
  const topR = Math.round(coreR * 0.88)
  const topG = Math.round(coreG * 0.88)
  const topB = Math.round(coreB * 0.88)

  // 3. Left Bevel: Soft side shade + delicate pigment bounce from painting (~90% luminance)
  const leftR = Math.min(245, Math.round(coreR * 0.88 + dom.r * 0.12))
  const leftG = Math.min(242, Math.round(coreG * 0.88 + dom.g * 0.12))
  const leftB = Math.min(235, Math.round(coreB * 0.88 + dom.b * 0.12))

  // 4. Right Bevel: Ambient illuminated facet (~94% luminance)
  const rightR = Math.min(248, Math.round(coreR * 0.95))
  const rightG = Math.min(245, Math.round(coreG * 0.95))
  const rightB = Math.min(238, Math.round(coreB * 0.95))

  // 5. Bottom Bevel: Upward-facing facet catching ceiling/room illumination (~98% luminance / luminous ivory)
  const botR = Math.min(253, Math.round(coreR * 1.04))
  const botG = Math.min(250, Math.round(coreG * 1.04))
  const botB = Math.min(244, Math.round(coreB * 1.04))

  // 6. Subtle edge radiosity color
  const radiosity = `rgba(${dom.r}, ${dom.g}, ${dom.b}, 0.06)`

  return {
    top: rgbToHex(topR, topG, topB),
    left: rgbToHex(leftR, leftG, leftB),
    right: rgbToHex(rightR, rightG, rightB),
    bottom: rgbToHex(botR, botG, botB),
    radiosity,
  }
}
