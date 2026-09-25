// Where each label above a Score block sits, once its real text width is known.
// A label starts at its block. Only when the stage edge is what would cut it, it
// moves left just enough to end at the edge, but never into the label before it
// in the lane; if there isn't room for that, it stays put and is cut at the edge.

export interface LabelToFit {
  key: string
  /** Where its block starts. */
  x: number
  /** Its full text width. */
  width: number
  /** How far it may run before the next label in the lane (null = no next label). */
  maxWidth: number | null
}

const GAP = 16

/** `labels` for one lane; `limit` is the right edge labels may reach. */
export function fitLabels(labels: LabelToFit[], limit: number): Record<string, { left: number; maxWidth: number }> {
  const fit: Record<string, { left: number; maxWidth: number }> = {}
  let previousRight = -Infinity
  for (const label of [...labels].sort((a, b) => a.x - b.x)) {
    const edgeRoom = limit - label.x
    const edgeBinds = label.maxWidth == null || edgeRoom < label.maxWidth
    let left = label.x
    if (edgeBinds && label.width > edgeRoom) left = Math.min(label.x, Math.max(limit - label.width, previousRight + GAP))
    const maxWidth = Math.min(label.maxWidth ?? Infinity, limit - left)
    fit[label.key] = { left, maxWidth }
    previousRight = left + Math.min(label.width, maxWidth)
  }
  return fit
}
