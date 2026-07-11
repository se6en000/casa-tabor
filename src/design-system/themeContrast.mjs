function relativeLuminance(hex) {
  const channels = hex.match(/[0-9A-Fa-f]{2}/g)
  if (!channels || channels.length !== 3) return null
  const [red, green, blue] = channels
    .map(channel => Number.parseInt(channel, 16) / 255)
    .map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
}

export function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first)
  const secondLuminance = relativeLuminance(second)
  if (firstLuminance == null || secondLuminance == null) return 0
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

export function getThemeContrastIssues(colors) {
  const checks = [
    ['Primary action text', colors['casa-gold'], colors['casa-navy']],
    ['Body text on cards', colors['casa-surface'], colors['casa-text']],
    ['Body text on pages', colors['casa-bg'], colors['casa-text']],
    ['Light text on strong actions', colors['casa-navy'], '#FFFFFF'],
  ]

  return checks
    .filter(([, background, foreground]) => contrastRatio(background, foreground) < 4.5)
    .map(([label]) => label)
}
