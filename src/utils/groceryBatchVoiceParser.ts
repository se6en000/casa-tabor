import { inferCategoryFromName, type GroceryCategoryKey } from './groceryCategorization.ts'

export interface ParsedVoiceGroceryItem {
  id: string
  name: string
  quantity: string | null
  unit: string | null
  category: GroceryCategoryKey
}

const NUMBER_WORDS: Record<string, string> = {
  a: '1',
  an: '1',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  dozen: '12',
}

const UNIT_NORMALIZATIONS: Record<string, string> = {
  bag: 'bag',
  bags: 'bags',
  bottle: 'bottle',
  bottles: 'bottles',
  box: 'box',
  boxes: 'boxes',
  bunch: 'bunch',
  bunches: 'bunches',
  can: 'can',
  cans: 'cans',
  carton: 'carton',
  cartons: 'cartons',
  container: 'container',
  containers: 'containers',
  cup: 'cups',
  cups: 'cups',
  dozen: 'dozen',
  dozens: 'dozen',
  gallon: 'gallon',
  gallons: 'gallons',
  gal: 'gallons',
  head: 'head',
  heads: 'heads',
  jar: 'jar',
  jars: 'jars',
  lb: 'lbs',
  lbs: 'lbs',
  pound: 'lbs',
  pounds: 'lbs',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  pack: 'pack',
  packs: 'packs',
  package: 'pack',
  packages: 'packs',
  piece: 'pieces',
  pieces: 'pieces',
  pint: 'pints',
  pints: 'pints',
  quart: 'quarts',
  quarts: 'quarts',
}

const OPENING_PATTERNS = [
  /^(?:hey\s+(?:casa|assistant|siri|google)\s*,?\s*)/i,
  /^(?:can\s+you\s+(?:please\s+)?(?:add|put|get|grab)\s+)/i,
  /^(?:please\s+(?:add|put|get|grab)\s+)/i,
  /^(?:we\s+(?:need|are\s+out\s+of|want)\s+(?:to\s+get\s+)?)/i,
  /^(?:i\s+(?:need|want)\s+(?:to\s+(?:get|buy|add)\s+)?)/i,
  /^(?:(?:let's|lets)\s+(?:add|get|grab|buy)\s+)/i,
  /^(?:(?:add|put|toss|throw|grab|buy|get)\s+)/i,
]

const TRAILING_PATTERNS = [
  /(?:\s+|^)(?:to|on|for)\s+(?:my|the|our)?\s*(?:grocery|shopping)?\s*list$/i,
  /(?:\s+|^)(?:to|on)\s+(?:the\s+cart|the\s+basket)$/i,
  /(?:\s+|^)please$/i,
]

function cleanPrefixAndSuffix(raw: string): string {
  let text = raw.trim()
  let prev = ''
  while (text !== prev) {
    prev = text
    for (const pattern of OPENING_PATTERNS) {
      text = text.replace(pattern, '').trim()
    }
    for (const pattern of TRAILING_PATTERNS) {
      text = text.replace(pattern, '').trim()
    }
  }
  return text
}

function capitalizeWords(str: string): string {
  return str
    .split(' ')
    .map((word) => {
      if (!word) return ''
      // Keep short prepositions lowercase unless first word
      const lower = word.toLowerCase()
      if (['of', 'in', 'and', 'with', 'for'].includes(lower)) {
        return lower
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Parses a single item segment (e.g. "2 gallons of whole milk" or "three organic avocados")
 */
export function parseSingleVoiceItem(segment: string): Omit<ParsedVoiceGroceryItem, 'id'> | null {
  let cleaned = segment.trim()
  if (!cleaned) return null

  // Strip leading "and", "plus", "also", "some", "a"
  cleaned = cleaned.replace(/^(?:and|plus|also|some)\s+/i, '').trim()
  if (!cleaned) return null

  // Check for leading number or number word + unit pattern:
  // e.g. "2 gallons of milk", "two cans tomato sauce", "3 avocados", "a bunch of cilantro", "1.5 lbs salmon"
  const unitKeys = Object.keys(UNIT_NORMALIZATIONS).join('|')
  const numWordKeys = Object.keys(NUMBER_WORDS).join('|')

  // Pattern 1: Number + Unit + "of"? + Name
  // e.g. "2 gallons of whole milk", "one carton of eggs"
  const numUnitPattern = new RegExp(
    `^(?:(\\d+(?:\\.\\d+)?)|(${numWordKeys}))\\s+(${unitKeys})\\s+(?:of\\s+)?(.+)$`,
    'i',
  )
  const numUnitMatch = cleaned.match(numUnitPattern)

  if (numUnitMatch) {
    const rawNum = (numUnitMatch[1] || numUnitMatch[2] || '1').toLowerCase()
    const quantity = NUMBER_WORDS[rawNum] ?? rawNum
    const rawUnit = numUnitMatch[3].toLowerCase()
    const unit = UNIT_NORMALIZATIONS[rawUnit] ?? rawUnit
    const rawName = numUnitMatch[4].trim()

    if (rawName) {
      const name = capitalizeWords(rawName)
      const category = inferCategoryFromName(name)
      return { name, quantity, unit, category }
    }
  }

  // Pattern 2: Number only + Name (e.g. "3 ripe avocados", "two lemons")
  const numOnlyPattern = new RegExp(
    `^(?:(\\d+(?:\\.\\d+)?)|(${numWordKeys}))\\s+(.+)$`,
    'i',
  )
  const numOnlyMatch = cleaned.match(numOnlyPattern)

  if (numOnlyMatch) {
    const rawNum = (numOnlyMatch[1] || numOnlyMatch[2] || '1').toLowerCase()
    const quantity = NUMBER_WORDS[rawNum] ?? rawNum
    const rawName = numOnlyMatch[3].trim()

    // Avoid treating "a" as a quantity if it's "a lot of" or non-numeric context
    if (rawName && !rawName.toLowerCase().startsWith('lot of')) {
      const name = capitalizeWords(rawName)
      const category = inferCategoryFromName(name)
      return { name, quantity, unit: null, category }
    }
  }

  // Pattern 3: Name only (e.g. "sourdough bread", "fresh basil")
  const name = capitalizeWords(cleaned)
  const category = inferCategoryFromName(name)
  return { name, quantity: null, unit: null, category }
}

/**
 * Splits a full voice transcript into individual parsed grocery items.
 * Handles Oxford commas, "and", "plus", "also", and line breaks.
 */
export function parseGroceryVoiceBatch(transcript: string): ParsedVoiceGroceryItem[] {
  const cleaned = cleanPrefixAndSuffix(transcript)
  if (!cleaned) return []

  // Split on commas, semicolons, or conjunctions: "and", "plus", "also"
  const rawSegments = cleaned
    .split(/\s*,\s*(?:and\s+)?|\s*;\s*|\s+(?:and|plus|also)\s+|\n+/i)
    .map((s) => s.trim())
    .filter(Boolean)

  const items: ParsedVoiceGroceryItem[] = []
  let counter = 1

  for (const segment of rawSegments) {
    const parsed = parseSingleVoiceItem(segment)
    if (parsed && parsed.name.length >= 2) {
      items.push({
        id: `staged-${Date.now()}-${counter++}`,
        ...parsed,
      })
    }
  }

  return items
}
