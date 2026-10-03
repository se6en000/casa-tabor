import { inferCategoryFromName, type GroceryCategoryKey } from './groceryCategorization.ts'
import { AND_ITEMS, DESCRIBING_WORDS, FLAVORS, FLAVOR_PHRASES, FRONT_FOODS, HEAD_WORDS, PLURAL_WRITTEN, STANDALONE, VOCABULARY, foldWord, isFoodWord } from './groceryVocabulary.ts'

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
    // Commas separate items; "2%" stays one word.
    .replace(/[^a-z0-9%,\s]/g, ' ')
    .replace(/,/g, ' , ')
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

/** Words that open an item but aren't part of it: "and", "add", "some", "also". */
const LEAD_FILLER = new Set(['and', 'add', 'also', 'plus', 'some', 'then', 'oh', 'um', 'uh', 'like', 'maybe', 'get', 'grab', 'buy', 'more', 'another', 'the', 'please', 'okay', 'ok'])
const TAIL_FILLER = new Set(['please', 'too', 'thanks', 'also'])
const DELIMITERS = new Set(['and', 'plus', 'also', 'then', ','])
const UNIT_OR_COUNT = (w: string) => w in UNIT_NORMALIZATIONS
const isNumber = (w: string) => /^\d+(?:\.\d+)?$/.test(w) || (w in NUMBER_WORDS && w !== 'a' && w !== 'an')

/** "2 gallons of", "a dozen", "three", "a box of": how many words at `i` say an amount (0 when none). */
function amountLength(words: string[], i: number): number {
  const w = words[i]
  if (!w) return 0
  const article = w === 'a' || w === 'an'
  if (!isNumber(w) && !article) return 0
  let n = 1
  if (words[i + 1] === 'couple' || words[i + 1] === 'few') n = 2
  if (UNIT_OR_COUNT(words[i + n] ?? '')) n += 1
  else if (article && n === 1) return 0 // "a" alone: "an apple" is just the apple
  if (words[i + n] === 'of') n += 1
  return n
}

const FOOD_AISLES = new Set(['produce', 'dairy', 'meat', 'deli', 'bakery', 'frozen', 'pantry', 'beverages', 'snacks'])
/** A word as the vocabulary knows it ("mac_and_cheese", kept whole before splitting, is "mac and cheese"). */
const keyOf = (w: string) => w.split('_').map(foldWord).join(' ')
const unknownWord = (w: string) => !VOCABULARY.has(keyOf(w)) && !HEAD_WORDS.has(w) && !HEAD_WORDS.has(foldWord(w)) && !DESCRIBING_WORDS.has(w) && !FLAVORS.has(w)

/**
 * How good a reading of these words is as one item (lower is better; Infinity: not an item). The item is what it ends
 * in — a known item ("ice cream", "sandwich meat"), a word that takes a food ("chips", "bars"), or a word it doesn't
 * know — and what's in front: describing words and names ("organic", "kerrygold"), flavours ("mint chocolate chip"),
 * foods that make it a kind of thing ("turkey bacon", "pickle chips", "bagel thins"). Plain produce and meat take only
 * describing words and names ("red grapes", "heirloom tomatoes"), so "chicken salmon" is two; a staple ("milk",
 * "cheese") takes no other food; another known item of two words inside it means it's a list ("steak chicken broth").
 */
function itemCost(words: string[]): number {
  const n = words.length
  if (n === 0) return Infinity
  const keys = words.map(keyOf)
  const knownSpan = (a: number, b: number) => VOCABULARY.has(keys.slice(a, b).join(' '))
  if (knownSpan(0, n)) return 1
  const head = words[n - 1]
  const headUnknown = unknownWord(head)
  if (n === 1) return headUnknown ? 1.8 : Infinity
  // What it ends in: the longest known item at the end, else the last word.
  let t = 1
  for (let k = n - 1; k >= 1; k--) if (knownSpan(n - k, n)) { t = k; break }
  const front = words.slice(0, n - t)
  const tailKey = keys.slice(n - t).join(' ')
  const tailAisle = VOCABULARY.get(tailKey)
  const headWord = HEAD_WORDS.has(head) || HEAD_WORDS.has(foldWord(head))
  const foodTail = headUnknown || (tailAisle ? FOOD_AISLES.has(tailAisle) : headWord)
  const plainTail = (tailAisle === 'produce' || tailAisle === 'meat') && !headWord
  const staple = t === 1 && (STANDALONE.has(head) || STANDALONE.has(foldWord(head)))
  // Another known item of two words or more inside it: a list, not one item.
  for (let a = 0; a < n - t; a++) {
    for (let b = a + 2; b <= n - t; b++) {
      if (knownSpan(a, b) && !(a === 0 && b === n - t && wholeFrontFits())) return Infinity
    }
  }
  function wholeFrontFits(): boolean {
    if (!foodTail || front.length < 2) return false
    if (flavorsOnly(front)) return true
    const frontKey = keys.slice(0, n - t).join(' ')
    const saidSingular = foldWord(front[front.length - 1]) === front[front.length - 1]
    const frontAisle = VOCABULARY.get(frontKey)
    // A known item said in the singular ("chocolate chip" muffins), or produce before a word that takes it ("sweet potato fries").
    return saidSingular && Boolean(frontAisle) && (PLURAL_WRITTEN.has(frontKey) || (frontAisle === 'produce' && headWord && tailAisle !== 'produce'))
  }
  if (wholeFrontFits()) return 1.55
  let cost = 1.45
  let foods = 0
  for (const w of front) {
    if (DESCRIBING_WORDS.has(w)) { cost += 0.1; continue }
    foods += 1
    if (unknownWord(w)) cost += 0.35 // a name or a variety: "kerrygold butter", "rainbow sprinkles"
    else if (plainTail) return Infinity
    else if (FLAVORS.has(w) && foodTail) cost += 0.2
    // A known item of two words takes only describing words, names and flavours ("celery sparkling water" is two).
    else if (t >= 2) return Infinity
    else if (staple) return Infinity
    else if (FRONT_FOODS.has(w) && foodTail) cost += 0.4
    else if (isFoodWord(w) && foldWord(w) === w && !STANDALONE.has(w) && foodTail) {
      // Said in the singular when it's usually plural ("pickle" chips) — it's describing.
      if (PLURAL_WRITTEN.has(keyOf(w))) cost += 0.3
      else if ((VOCABULARY.get(keyOf(w)) === 'produce' && headWord && tailAisle !== 'produce') || headUnknown) cost += 0.4
      else cost += 0.6
    } else return Infinity
  }
  // Plain produce and meat take one name at most ("heirloom tomatoes"); longer fronts of foods are less likely one item.
  if (plainTail && foods > 1) return Infinity
  return cost + 0.7 * Math.max(0, foods - 1)
}

/** Every word a flavour or a describing word, or a run of them ("mint chocolate chip", "peanut butter"). */
function flavorsOnly(ws: string[]): boolean {
  const ok: boolean[] = [true]
  for (let i = 1; i <= ws.length; i++) {
    ok[i] = false
    for (let j = 0; j < i && !ok[i]; j++) {
      if (!ok[j]) continue
      const span = ws.slice(j, i)
      if (span.length === 1 ? FLAVORS.has(span[0]) || DESCRIBING_WORDS.has(span[0]) : FLAVOR_PHRASES.has(span.map(foldWord).join(' '))) ok[i] = true
    }
  }
  return ok[ws.length]
}

/** The best split of words said with no "and" between them into items ("milk eggs bread", "canned salmon eggs"). */
function bestSplit(words: string[]): string[][] {
  const n = words.length
  const best: Array<{ cost: number; from: number }> = [{ cost: 0, from: -1 }]
  for (let i = 1; i <= n; i++) {
    best[i] = { cost: Infinity, from: -1 }
    for (let j = Math.max(0, i - 7); j < i; j++) {
      if (best[j].cost === Infinity) continue
      const amount = amountLength(words, j)
      if (amount >= i - j) continue
      // A number inside an item starts the next one: "chips 2 pounds of beef".
      const body = words.slice(j + amount, i)
      if (body.some((w, k) => k > 0 && amountLength(body, k) > 0 && isNumber(w))) continue
      const cost = best[j].cost + itemCost(body) + 0.001
      if (cost < best[i].cost) best[i] = { cost, from: j }
    }
  }
  if (best[n].cost === Infinity) return [words]
  const pieces: string[][] = []
  for (let i = n; i > 0; i = best[i].from) pieces.unshift(words.slice(best[i].from, i))
  return pieces
}

/**
 * Splits a full voice transcript into individual parsed grocery items (Jake, Oct 2: "canned tuna fish and canned
 * salmon"; "it messes up on a lot"). "and", "plus" and commas separate items; between them, the words are split into
 * the best reading as items — known ones (groceryVocabulary.ts), described ones ("frozen corn"), a food in front of a
 * word that takes one ("turkey bacon"), and anything unknown kept whole. Amounts stay with their item.
 * Scored by scripts/grocery-voice-eval.mjs.
 */
export function parseGroceryVoiceBatch(transcript: string): ParsedVoiceGroceryItem[] {
  const cleaned = cleanPrefixAndSuffix(transcript)
  if (!cleaned) return []
  const words = normalizeSpeechTokens(cleaned.replace(/[,;\n]+/g, ' , ').replace(/&/g, ' and '))
  // "mac and cheese", "half and half" keep their "and".
  const joined: string[] = []
  for (let i = 0; i < words.length; i++) {
    const hit = AND_ITEMS.find((item) => {
      const parts = item.split(' ')
      return parts.every((p, k) => foldWord(words[i + k] ?? '') === p)
    })
    if (hit) {
      const len = hit.split(' ').length
      joined.push(words.slice(i, i + len).join('_'))
      i += len - 1
    } else joined.push(words[i])
  }
  // Pieces between "and"s and commas, each split into its items.
  const chunks: string[][] = [[]]
  for (const w of joined) {
    if (DELIMITERS.has(w)) chunks.push([])
    else chunks[chunks.length - 1].push(w)
  }
  const items: ParsedVoiceGroceryItem[] = []
  let counter = 1
  // How people list: "milk eggs and bread" — what's after the last "and" is one item; "milk and eggs and bread" or
  // "milk, eggs, and bread" — every piece is one. Only words with no "and" between them are split.
  const pieces = chunks.filter((c) => c.some((w) => !LEAD_FILLER.has(w)))
  const everyPieceOne = pieces.length >= 3
  for (const chunk of chunks) {
    let ws = chunk
    while (ws.length && LEAD_FILLER.has(ws[0]) && !(ws[0] === 'more' && ws.length === 1)) ws = ws.slice(1)
    while (ws.length && TAIL_FILLER.has(ws[ws.length - 1])) ws = ws.slice(0, -1)
    if (!ws.length) continue
    const unjoin = (piece: string[]) => piece.map((w) => w.replace(/_/g, ' '))
    const onePiece = pieces.length >= 2 && (everyPieceOne || chunk === pieces[pieces.length - 1])
    const split = onePiece && itemCost(ws.slice(amountLength(ws, 0))) < Infinity ? [ws] : bestSplit(ws)
    for (const piece of split) {
      const parsed = parseSingleVoiceItem(unjoin(piece).join(' '))
      if (parsed && parsed.name.replace(/[^a-z]/gi, '').length >= 2) items.push({ id: `staged-${Date.now()}-${counter++}`, ...parsed })
    }
  }
  return items
}
