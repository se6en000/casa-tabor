// The progress tracker's colours, the same on the shelf and the project page (canvas 10a / 10b; Jake,
// 2026-09-29: "gold for done, brown/black for the current step … and the diagonal line for in progress"):
// done is brass, Now is ink, a project inside (running on its own) is hatched, later is stone.
export const SEGMENT = {
  done: 'bg-wall-brass',
  now: 'bg-wall-ink',
  inside: 'bg-[repeating-linear-gradient(135deg,var(--color-wall-brass)_0_5px,var(--color-wall-stone)_5px_10px)]',
  later: 'bg-wall-stone',
} as const
export type SegmentKind = keyof typeof SEGMENT
