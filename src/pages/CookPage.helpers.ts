export function formatRecipeTitle(raw: string | null | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''

  const upperAcronyms = new Set(['GLP-1', 'AI', 'BBQ', 'BLT', 'BLTS', 'PB&J', 'USA', 'IP', 'NY', 'NYC'])
  const lowerMinorWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet', 'with', 'la', 'alla', 'de', 'du'])

  const isAllUpper = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)
  const isAllLower = trimmed === trimmed.toLowerCase()

  const words = trimmed.split(/(\s+|-|\/)/)
  let isFirstWord = true
  return words
    .map((w) => {
      if (/^\s+$/.test(w) || w === '-' || w === '/') return w
      const lower = w.toLowerCase()
      if (upperAcronyms.has(w.toUpperCase()) || /^glp-1$/i.test(w)) {
        isFirstWord = false
        return w.toUpperCase() === 'GLP-1' || /^glp-1$/i.test(w) ? 'GLP-1' : w.toUpperCase()
      }
      if (!isFirstWord && lowerMinorWords.has(lower) && (isAllUpper || isAllLower)) {
        isFirstWord = false
        return lower
      }
      if (isAllUpper || isAllLower || (w === w.toLowerCase() && !lowerMinorWords.has(lower))) {
        isFirstWord = false
        return lower.charAt(0).toUpperCase() + lower.slice(1)
      }
      isFirstWord = false
      return w
    })
    .join('')
}
