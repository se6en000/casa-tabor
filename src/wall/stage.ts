export const STAGE_WIDTH = 1920
export const STAGE_HEIGHT = 1080

export interface StageFit {
  scale: number
  offsetX: number
  offsetY: number
}

/** Scale the fixed 1920x1080 Wall uniformly into any screen, centered. */
export function computeStageFit(viewportWidth: number, viewportHeight: number): StageFit {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return { scale: 1, offsetX: 0, offsetY: 0 }
  const scale = Math.min(viewportWidth / STAGE_WIDTH, viewportHeight / STAGE_HEIGHT)
  return {
    scale,
    offsetX: (viewportWidth - STAGE_WIDTH * scale) / 2,
    offsetY: (viewportHeight - STAGE_HEIGHT * scale) / 2,
  }
}
