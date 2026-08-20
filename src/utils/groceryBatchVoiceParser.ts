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
  loaf: 'loaf',
  loaves: 'loaves',
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

/**
 * Phonetic / speech-to-text corrections for typical grocery dictation quirks.
 */
const SPEECH_CORRECTIONS: Record<string, string> = {
  hamberburger: 'hamburger',
  hamberburgers: 'hamburgers',
  hamberger: 'hamburger',
  hambergers: 'hamburgers',
  hotdog: 'hot dog',
  hotdogs: 'hot dogs',
  almondmilk: 'almond milk',
  oatmilk: 'oat milk',
  soymilk: 'soy milk',
  applesause: 'applesauce',
  cokezero: 'coke zero',
  dietcoke: 'diet coke',
}

/**
 * Known multi-word compound phrases that should remain atomic and not be split.
 * Order from longer (3-4 words) to shorter (2 words) for greedy matching.
 */
const KNOWN_COMPOUNDS: string[] = [
  // 3-word compounds
  'hot dog buns',
  'hamburger buns',
  'prosciutto di parma',
  'mac and cheese',
  'half and half',
  'ice cream bars',
  'cold brew coffee',
  'extra virgin olive oil',
  // 2-word bakery
  'sourdough bread',
  'garlic bread',
  'pita bread',
  'french bread',
  'english muffins',
  'bagel bites',
  // 2-word meat & seafood
  'hot dogs',
  'hot dog',
  'ground beef',
  'ground turkey',
  'ground chicken',
  'ground pork',
  'chicken breast',
  'chicken breasts',
  'chicken thighs',
  'chicken wings',
  'chicken tenders',
  'chicken nuggets',
  'salmon fillet',
  'salmon fillets',
  'pork chops',
  'ribeye steak',
  'strip steak',
  'flank steak',
  'breakfast sausage',
  'italian sausage',
  'deli turkey',
  'deli ham',
  'roast beef',
  'rotisserie chicken',
  // 2-word dairy
  'whole milk',
  'skim milk',
  'oat milk',
  'almond milk',
  'soy milk',
  'coconut milk',
  'heavy cream',
  'sour cream',
  'cottage cheese',
  'cream cheese',
  'string cheese',
  'shredded cheese',
  'ice cream',
  'greek yogurt',
  'butter milk',
  // 2-word produce
  'apple juice',
  'orange juice',
  'grapefruit juice',
  'lemon juice',
  'lime juice',
  'tomato juice',
  'cranberry juice',
  'grape juice',
  'sparkling water',
  'seltzer water',
  'coconut water',
  'cold brew',
  'iced coffee',
  'green tea',
  'black tea',
  'bell peppers',
  'bell pepper',
  'green onions',
  'green onion',
  'red onions',
  'red onion',
  'yellow onions',
  'sweet potatoes',
  'sweet potato',
  'russet potatoes',
  'cherry tomatoes',
  'roma tomatoes',
  'baby spinach',
  'romaine lettuce',
  'iceberg lettuce',
  'brussels sprouts',
  'green beans',
  'yellow squash',
  'butternut squash',
  'fresh basil',
  'fresh cilantro',
  'fresh parsley',
  'fresh dill',
  'fresh mint',
  'fresh rosemary',
  // 2-word pantry & snacks
  'olive oil',
  'vegetable oil',
  'canola oil',
  'avocado oil',
  'sesame oil',
  'peanut butter',
  'almond butter',
  'pasta sauce',
  'tomato sauce',
  'tomato paste',
  'marinara sauce',
  'soy sauce',
  'hot sauce',
  'bbq sauce',
  'barbecue sauce',
  'maple syrup',
  'salad dressing',
  'chicken broth',
  'beef broth',
  'vegetable broth',
  'black beans',
  'kidney beans',
  'pinto beans',
  'garbanzo beans',
  'potato chips',
  'tortilla chips',
  'corn chips',
  'pita chips',
  'granola bars',
  'protein bars',
  'fruit snacks',
  'trail mix',
  // 2-word household & care
  'paper towels',
  'toilet paper',
  'trash bags',
  'garbage bags',
  'dish soap',
  'dishwasher pods',
  'laundry detergent',
  'fabric softener',
  'aluminum foil',
  'plastic wrap',
  'body wash',
  'face wash',
  'shaving cream',
  'lip balm',
  'dog food',
  'cat food',
  'baby wipes',
  'baby formula',
  'baby food',
]

/**
 * Fast lookup set of compound phrases normalized to lowercase.
 */
const COMPOUND_SET = new Set(KNOWN_COMPOUNDS.map((c) => c.toLowerCase()))

/**
 * Single-word known grocery items / staples.
 */
const SINGLE_GROCERY_ITEMS = new Set([
  'hamburgers', 'hamburger', 'hotdogs', 'hotdog',
  'milk', 'eggs', 'egg', 'bread', 'butter', 'cheese',
  'apples', 'apple', 'bananas', 'banana', 'oranges', 'orange', 'grapes', 'grape',
  'avocados', 'avocado', 'lemons', 'lemon', 'limes', 'lime', 'onions', 'onion',
  'garlic', 'potatoes', 'potato', 'tomatoes', 'tomato', 'carrots', 'carrot',
  'cucumbers', 'cucumber', 'celery', 'broccoli', 'spinach', 'kale', 'lettuce',
  'mushrooms', 'mushroom', 'zucchini', 'squash', 'asparagus', 'cauliflower',
  'cabbage', 'peaches', 'peach', 'pears', 'pear', 'plums', 'plum', 'berries',
  'blueberries', 'strawberries', 'raspberries', 'blackberries',
  'chicken', 'beef', 'steak', 'pork', 'salmon', 'tuna', 'shrimp', 'turkey',
  'bacon', 'sausage', 'ham', 'salami', 'prosciutto',
  'rice', 'pasta', 'spaghetti', 'cereal', 'oats', 'flour', 'sugar', 'salt', 'pepper',
  'oil', 'vinegar', 'sauce', 'soup', 'broth', 'beans', 'lentils',
  'coffee', 'tea', 'water', 'juice', 'soda', 'beer', 'wine',
  'chips', 'crackers', 'pretzels', 'popcorn', 'nuts', 'hummus', 'salsa', 'guacamole',
  'shampoo', 'conditioner', 'soap', 'deodorant', 'toothpaste', 'toothbrush',
  'diapers', 'wipes', 'bagels', 'bagel', 'croissants', 'croissant', 'muffins', 'muffin',
  'tortillas', 'tortilla', 'pitas', 'pita', 'rolls', 'roll', 'buns', 'bun', 'cookies', 'cookie', 'sourdough',
  'tofu', 'ketchup', 'mustard', 'mayo', 'mayonnaise', 'honey', 'jam', 'jelly',
])

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
      const lower = word.toLowerCase()
      if (['of', 'in', 'and', 'with', 'for', 'di'].includes(lower)) {
        return lower
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Normalizes speech tokens and applies speech recognizer phonetic fixes.
 */
function normalizeSpeechTokens(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  const correctedWords: string[] = []
  for (const word of words) {
    const corrected = SPEECH_CORRECTIONS[word] ?? word
    // May have expanded to multiple words (e.g. "hotdog" -> "hot dog")
    const parts = corrected.split(/\s+/)
    for (const part of parts) {
      correctedWords.push(part)
    }
  }
  return correctedWords
}

/**
 * Greedily segments continuous, unpunctuated spoken words into distinct grocery items.
 * e.g. "hamburgers hamburger buns hot dogs hot dog buns"
 *   -> ["hamburgers", "hamburger buns", "hot dogs", "hot dog buns"]
 * e.g. "apple juice"
 *   -> ["apple juice"] (kept intact)
 * e.g. "apple juice sourdough bread cold brew"
 *   -> ["apple juice", "sourdough bread", "cold brew"]
 */
function segmentContinuousPhrase(words: string[]): string[] {
  if (words.length <= 1) return [words.join(' ')]
  const phrase = words.join(' ')

  // If the entire phrase is already a known compound, keep it intact
  if (COMPOUND_SET.has(phrase)) {
    return [phrase]
  }

  const segments: string[] = []
  let i = 0

  while (i < words.length) {
    // Check for quantity/unit prefix at current position (e.g. "2 gallons of whole milk")
    const currentWord = words[i]
    const isNum = /^\d+(?:\.\d+)?$/.test(currentWord) || currentWord in NUMBER_WORDS
    let numPrefix = ''

    if (isNum && i + 1 < words.length) {
      const nextWord = words[i + 1]
      const isUnit = nextWord in UNIT_NORMALIZATIONS
      if (isUnit) {
        // e.g. "2 gallons" or "two cans"
        const hasOf = i + 2 < words.length && words[i + 2] === 'of'
        const unitOffset = hasOf ? 3 : 2
        numPrefix = words.slice(i, i + unitOffset).join(' ') + ' '
        i += unitOffset
      } else {
        // e.g. "3 avocados"
        numPrefix = currentWord + ' '
        i += 1
      }
    }

    if (i >= words.length) {
      if (numPrefix.trim()) segments.push(numPrefix.trim())
      break
    }

    // Try 4-word compound match
    if (i + 4 <= words.length) {
      const quad = words.slice(i, i + 4).join(' ')
      if (COMPOUND_SET.has(quad)) {
        segments.push(numPrefix + quad)
        i += 4
        continue
      }
    }

    // Try 3-word compound match
    if (i + 3 <= words.length) {
      const tri = words.slice(i, i + 3).join(' ')
      if (COMPOUND_SET.has(tri)) {
        segments.push(numPrefix + tri)
        i += 3
        continue
      }
    }

    // Try 2-word compound match
    if (i + 2 <= words.length) {
      const pair = words.slice(i, i + 2).join(' ')
      if (COMPOUND_SET.has(pair)) {
        segments.push(numPrefix + pair)
        i += 2
        continue
      }
    }

    // Check 1-word single grocery item match
    const single = words[i]
    if (SINGLE_GROCERY_ITEMS.has(single)) {
      segments.push(numPrefix + single)
      i += 1
      continue
    }

    // If word is not explicitly in dictionary, look ahead to see where the next known item starts
    let j = i + 1
    while (j < words.length) {
      const lookahead = words[j]
      const isLookaheadNum = /^\d+(?:\.\d+)?$/.test(lookahead) || lookahead in NUMBER_WORDS
      if (isLookaheadNum) break

      const lookaheadPair = j + 2 <= words.length ? words.slice(j, j + 2).join(' ') : ''
      if (lookaheadPair && COMPOUND_SET.has(lookaheadPair)) break

      if (SINGLE_GROCERY_ITEMS.has(lookahead)) break
      j++
    }

    const unmappedSlice = words.slice(i, j).join(' ')
    if (unmappedSlice) {
      segments.push(numPrefix + unmappedSlice)
    }
    i = j
  }

  return segments.filter(Boolean)
}

/**
 * Parses a single item segment (e.g. "2 gallons of whole milk" or "three organic avocados")
 */
export function parseSingleVoiceItem(segment: string): Omit<ParsedVoiceGroceryItem, 'id'> | null {
  let cleaned = segment.trim()
  if (!cleaned) return null

  // Strip leading "and", "plus", "also", "some"
  cleaned = cleaned.replace(/^(?:and|plus|also|some)\s+/i, '').trim()
  if (!cleaned) return null

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
 * Handles:
 * 1. Oxford commas, semicolons, line breaks
 * 2. Conjunctions: "and", "plus", "also"
 * 3. Continuous unpunctuated lists: "hamburgers hamburger buns hot dogs hot dog buns"
 * 4. Preserving compound nouns: "apple juice", "olive oil", "sourdough bread"
 */
export function parseGroceryVoiceBatch(transcript: string): ParsedVoiceGroceryItem[] {
  const cleaned = cleanPrefixAndSuffix(transcript)
  if (!cleaned) return []

  // Step 1: Split on explicit punctuation / conjunction delimiters
  const rawSegments = cleaned
    .split(/\s*,\s*(?:and\s+)?|\s*;\s*|\s+(?:and|plus|also)\s+|\n+/i)
    .map((s) => s.trim())
    .filter(Boolean)

  const items: ParsedVoiceGroceryItem[] = []
  let counter = 1

  for (const rawSeg of rawSegments) {
    // Step 2: For each segment, tokenize and segment continuous speech if multiple items are present
    const tokens = normalizeSpeechTokens(rawSeg)
    const refinedSubSegments = segmentContinuousPhrase(tokens)

    for (const subSeg of refinedSubSegments) {
      const parsed = parseSingleVoiceItem(subSeg)
      if (parsed && parsed.name.length >= 2) {
        items.push({
          id: `staged-${Date.now()}-${counter++}`,
          ...parsed,
        })
      }
    }
  }

  return items
}

