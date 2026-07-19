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

export function normalizeAssistantSpeechPunctuation(value, options = {}) {
  const protectedColon = '\uE000'
  const protectedSlash = '\uE001'
  const protectedApostrophe = '\uE002'
  const protectedComma = '\uE003'

  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\b([ap])\s*\.\s*m\s*\.?\b/gi, '$1m')
    .replace(/(\d)\s*[–—−-]\s*(\d)/g, '$1 to $2')
    .replace(/(\d):(?=\d)/g, `$1${protectedColon}`)
    .replace(/(\d)\/(?=\d)/g, `$1${protectedSlash}`)
    .replace(/([a-z])['’](?=[a-z])/gi, `$1${protectedApostrophe}`)
    .replace(options.preserveCommas ? /,/g : /$^/g, protectedComma)
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replaceAll(protectedColon, ':')
    .replaceAll(protectedSlash, '/')
    .replaceAll(protectedApostrophe, "'")
    .replaceAll(protectedComma, ',')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeAssistantLanguage(value, options = {}) {
  let normalized = normalizeAssistantSpeechPunctuation(value, options)
    .toLowerCase()
    .replace(/^(?:alexa|casa)[,\s]+/, '')

  for (const [pattern, replacement] of COMMON_SPEECH_FORMS) {
    normalized = normalized.replace(pattern, replacement)
  }

  return normalized.replace(/\s+/g, ' ').trim()
}
