const COMMON_SPEECH_FORMS = Object.freeze([
  [/\bwhats\b/g, "what's"],
  [/\bhows\b/g, 'how is'],
  [/\bdont\b/g, "don't"],
  [/\bim\b/g, "i'm"],
  [/\bcalender\b|\bcalandar\b/g, 'calendar'],
  [/\bbrthday\b/g, 'birthday'],
  [/\bu\b/g, 'you'],
  [/\btomoro\b|\btommorow\b/g, 'tomorrow'],
  [/\bthurs day\b/g, 'thursday'],
  [/\bfry day\b/g, 'friday'],
  [/\bgrosery\b|\bgrossery\b/g, 'grocery'],
  [/\bshoping\b/g, 'shopping'],
  [/\breceipe\b|\brecipie\b/g, 'recipe'],
  [/\bingredience\b/g, 'ingredients'],
  [/\bleft overs\b/g, 'leftovers'],
])

export function normalizeAssistantLanguage(value, options = {}) {
  let normalized = String(value ?? '')
    .toLowerCase()
    .replace(/^(?:alexa|casa)[,\s]+/, '')
    .replace(/[’']/g, "'")

  for (const [pattern, replacement] of COMMON_SPEECH_FORMS) {
    normalized = normalized.replace(pattern, replacement)
  }

  return normalized
    .replace(options.preserveCommas ? /[?!.\u2026]+/g : /[?!.,\u2026]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
