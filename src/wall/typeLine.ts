// Typing and pasting into Casa on a computer (canvas row 22; Jake, 2026-09-30: "I get a lot of text msgs on my mac
// that I like to copy and paste into the casa desktop app … and also able to copy/paste images into that chat area").
// Pure helpers for the line in the band (WallTypeLine) and the quick line anywhere on the wall (WallQuickAsk).

export interface TypedImage {
  dataUrl: string
  mimeType: string
  name: string
}

/** Pictures in one turn, at most. */
export const MAX_IMAGES = 6

/** What a send carries: the words (or, with only pictures, a plain question about them), and the pictures. */
export function typedTurn(text: string, images: TypedImage[]): { text: string; images: TypedImage[] } | null {
  const words = text.trim()
  if (!words && images.length === 0) return null
  return { text: words || (images.length > 1 ? 'What’s in these?' : 'What’s in this?'), images: images.slice(0, MAX_IMAGES) }
}

/** The pictures (and PDFs) among pasted or dropped files. */
export function readableFiles<T extends { type: string }>(files: T[]): T[] {
  return files.filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf').slice(0, MAX_IMAGES)
}

/** Typing somewhere that already takes words (a field, a text box), so the wall shouldn't take the keys. */
export function typingInAField(target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!target) return false
  const tag = (target.tagName ?? '').toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true
}

/** A key that starts a quick line (22c): a letter, digit or mark, with no ⌘/Ctrl/Alt. */
export function startsQuickAsk(key: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean }): boolean {
  return key.key.length === 1 && key.key !== ' ' && !key.metaKey && !key.ctrlKey && !key.altKey
}
