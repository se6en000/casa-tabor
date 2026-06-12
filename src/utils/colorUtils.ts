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

/**
 * Extract dominant color from an image using canvas + pixel sampling.
 * Faster than full quantization; good enough for mat color selection.
 */
export async function extractDominantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'Anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const width = 150
        const height = Math.round((width / img.naturalWidth) * img.naturalHeight)
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve('#D4C5B9') // fallback
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        const imageData = ctx.getImageData(0, 0, width, height)
        const data = imageData.data

        // Sample every 4th pixel to speed up
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

        resolve(rgbToHex(avgR, avgG, avgB))
      } catch {
        resolve('#D4C5B9') // fallback
      }
    }
    img.onerror = () => resolve('#D4C5B9') // fallback
    img.src = imageUrl
  })
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
    : { r: 212, g: 197, b: 185 } // fallback
}

/**
 * Calculate luminance of a color (for brightness detection).
 */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(x => {
    x /= 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/**
 * Generate a harmonious mat color based on the artwork's dominant color.
 * Uses color theory to create mats that complement without competing.
 */
export async function generateAdaptiveMatColor(imageUrl: string): Promise<ColorAnalysis> {
  try {
    const dominantHex = await extractDominantColor(imageUrl)
    const { r, g, b } = hexToRgb(dominantHex)

    const luminance = getLuminance(r, g, b)
    const isLight = luminance > 0.5

    // Desaturate the dominant color and push it toward neutral beige
    // This creates a mat that harmonizes without competing with the art
    const desaturated = desaturateColor(r, g, b, 0.4) // 60% desaturation

    // Shift toward warm neutrals (beige/linen family)
    const matRgb = shiftTowardWarmNeutral(desaturated.r, desaturated.g, desaturated.b, isLight)

    // Complementary color for optional accent (not used yet, but useful for future)
    const complementaryRgb = getComplementary(r, g, b)

    return {
      dominant: dominantHex,
      complementary: rgbToHex(complementaryRgb.r, complementaryRgb.g, complementaryRgb.b),
      matColor: rgbToHex(matRgb.r, matRgb.g, matRgb.b),
      isLight,
    }
  } catch {
    // Safe fallback
    return {
      dominant: '#808080',
      complementary: '#808080',
      matColor: '#D4C5B9',
      isLight: true,
    }
  }
}

/**
 * Desaturate a color by moving it toward gray.
 */
function desaturateColor(
  r: number,
  g: number,
  b: number,
  factor: number // 0–1, where 1 = fully gray
): { r: number; g: number; b: number } {
  const gray = (r + g + b) / 3
  return {
    r: Math.round(r + (gray - r) * factor),
    g: Math.round(g + (gray - g) * factor),
    b: Math.round(b + (gray - b) * factor),
  }
}

/**
 * Shift a color toward warm neutral (beige/linen) tones.
 * Light images get warmer (more yellow), dark images stay cooler.
 */
function shiftTowardWarmNeutral(
  r: number,
  g: number,
  b: number,
  isLight: boolean
): { r: number; g: number; b: number } {
  // Light images: shift toward warm beige (#E8DDD0)
  // Dark images: shift toward cooler linen (#D0CCBF)

  const warmTarget = isLight ? { r: 232, g: 221, b: 208 } : { r: 208, g: 204, b: 191 }
  const blendFactor = 0.65 // 65% toward warm neutral, 35% retain original

  return {
    r: Math.round(r * (1 - blendFactor) + warmTarget.r * blendFactor),
    g: Math.round(g * (1 - blendFactor) + warmTarget.g * blendFactor),
    b: Math.round(b * (1 - blendFactor) + warmTarget.b * blendFactor),
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
  // Convert RGB to HSL, rotate hue by 180°, convert back
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
