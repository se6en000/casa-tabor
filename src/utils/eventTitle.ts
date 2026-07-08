export function normalizePossessiveSuffixCasing(title: string): string {
  return title.replace(/([a-z])(['’])S\b/g, '$1$2s')
}

export function cleanEventTitle(title: string): string {
  const normalized = normalizePossessiveSuffixCasing(title)
  const pipeIdx = normalized.indexOf(' | ')
  return pipeIdx !== -1 ? normalized.slice(pipeIdx + 3) : normalized
}
