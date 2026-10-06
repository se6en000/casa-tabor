// Recipes V2 (canvas row 49; Jake, Oct 6: "look up meals/recipes easily, keep track of the ones I cook often (mark as
// favorites), ability to have a cooking experience on both the wall and more importantly my phone/tablet … the photo
// wall of recipes … updated to the V2 style"). Pure: amounts, servings, timers, search, the chips and the order.

const FRACTIONS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 }

/** A number written in a recipe: "2", "0.5", "1/2", "1 1/2", "½". */
function readNumber(text: string): number | null {
  const t = text.trim()
  if (FRACTIONS[t] != null) return FRACTIONS[t]
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = /^(\d+)\/(\d+)$/.exec(t)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** A number as a cook writes it: 1, 1 1/2, 1/3, 0.4. */
function writeNumber(n: number): string {
  const whole = Math.floor(n + 1e-9)
  const rest = n - whole
  const nice: Array<[number, string]> = [[0, ''], [0.25, '1/4'], [1 / 3, '1/3'], [0.5, '1/2'], [2 / 3, '2/3'], [0.75, '3/4'], [1, '']]
  const near = nice.find(([v]) => Math.abs(v - rest) < 0.02)
  if (near) {
    const w = near[0] === 1 ? whole + 1 : whole
    if (!near[1]) return String(w)
    return w ? `${w} ${near[1]}` : near[1]
  }
  return String(Math.round(n * 100) / 100)
}

const QTY = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[½⅓⅔¼¾⅛])`

/** Units as cooks write them (TBSP → tbsp), and "Clove(s)" as one clove or two cloves. */
function tidyAmount(text: string): string {
  const qty = readNumber(text.trim().split(/\s+/)[0] ?? '')
  return text
    .replace(/\b([A-Za-z]+)\(s\)/g, (_, word: string) => (qty != null && qty <= 1 ? word.toLowerCase() : `${word.toLowerCase()}s`))
    .replace(/\b(TBSP|Tbsp|TBS|tbsp\.?)\b/g, 'tbsp')
    .replace(/\b(TSP|Tsp|tsp\.?)\b/g, 'tsp')
    .replace(/\b(OZ|Oz)\b/g, 'oz')
    .replace(/\b(LBS?|Lbs?)\b/g, (u) => u.toLowerCase())
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * One amount from a recipe card that prints both ("10 oz | 20 oz Shrimp" — for 2 and for 4): `variant` 0 is the
 * first. A line with one amount is the same for both.
 */
export function amountFor(text: string, variant: number): string {
  const parts = text.split(/\s*\|\s*/)
  if (parts.length < 2) return tidyAmount(text)
  const k = parts[0].trim().split(/\s+/).length
  const lastWords = parts[parts.length - 1].trim().split(/\s+/)
  const name = lastWords.slice(k).join(' ')
  const amounts = parts.map((p, i) => (i === parts.length - 1 ? lastWords.slice(0, k).join(' ') : p.trim()))
  return tidyAmount(`${amounts[Math.min(Math.max(variant, 0), amounts.length - 1)]} ${name}`)
}

export interface ServingChoice { label: string; variant: number; factor: number }

const range = (a: number, b?: number) => (b != null ? `${a}–${b}` : String(a))

/** Who it serves: the card's own choices ("2 Person | 4 Person"), or as written and doubled. */
export function servingChoices(servings: string | null | undefined): ServingChoice[] {
  const text = (servings ?? '').trim()
  if (text.includes('|')) {
    return text.split(/\s*\|\s*/).map((part, i) => {
      const m = /(\d+)(?:\s*-\s*(\d+))?/.exec(part)
      return { label: m ? range(Number(m[1]), m[2] ? Number(m[2]) : undefined) : part, variant: i, factor: 1 }
    })
  }
  const m = /(\d+)(?:\s*-\s*(\d+))?/.exec(text)
  if (!m) return [{ label: 'As written', variant: 0, factor: 1 }, { label: 'Doubled', variant: 0, factor: 2 }]
  const a = Number(m[1])
  const b = m[2] ? Number(m[2]) : undefined
  return [{ label: range(a, b), variant: 0, factor: 1 }, { label: range(a * 2, b != null ? b * 2 : undefined), variant: 0, factor: 2 }]
}

/** An amount times `factor`: "1/2 cup" doubled is "1 cup"; "2-3 cloves" is "4–6 cloves"; words without a number stay. */
export function scaleAmount(text: string, factor: number): string {
  if (factor === 1) return text
  const m = new RegExp(`^${QTY}(\\s*(?:-|–|to)\\s*${QTY})?`).exec(text.trim())
  if (!m) return text
  const low = readNumber(m[1])
  if (low == null) return text
  const high = m[3] ? readNumber(m[3]) : null
  const scaled = high != null ? `${writeNumber(low * factor)}–${writeNumber(high * factor)}` : writeNumber(low * factor)
  return `${scaled}${text.trim().slice(m[0].length)}`
}

export interface StepTimer { label: string; seconds: number }
const UNIT: Array<[RegExp, string, number]> = [[/^h/i, 'hr', 3600], [/^m/i, 'min', 60], [/^s/i, 'sec', 1]]

/** The times a step names ("12- 15 minutes", "10 seconds"), as timers that start at the low end. */
export function stepTimers(instruction: string): StepTimer[] {
  const out: StepTimer[] = []
  const re = /(\d+)(?:\s*(?:-|–|to)\s*(\d+))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi
  for (const m of instruction.matchAll(re)) {
    const unit = UNIT.find(([u]) => u.test(m[3]))!
    const low = Number(m[1])
    const high = m[2] ? Number(m[2]) : undefined
    out.push({ label: `${range(low, high)} ${unit[1]}`, seconds: low * unit[2] })
  }
  return out
}

function timeParts(text: string): { hours: number; minLow: number | null; minHigh: number | null } {
  const hours = Number(/(\d+)\s*(?:hours?|hrs?)\b/i.exec(text)?.[1] ?? 0)
  const mins = /(\d+)(?:\s*-\s*(\d+))?\s*(?:minutes?|mins?)\b/i.exec(text)
  return { hours, minLow: mins ? Number(mins[1]) : null, minHigh: mins?.[2] ? Number(mins[2]) : null }
}

/** "30 Minutes" → "30 min", "20-25 minutes" → "20–25 min", "1 hour 15 minutes" → "1 hr 15 min". */
export function cookTime(text: string | null | undefined): string | null {
  if (!text?.trim()) return null
  const { hours, minLow, minHigh } = timeParts(text)
  const parts = [hours ? `${hours} hr` : '', minLow != null ? `${range(minLow, minHigh ?? undefined)} min` : ''].filter(Boolean)
  return parts.length ? parts.join(' ') : text.trim()
}

/** The longest it takes, in minutes (Quick is 30 or less). */
export function cookMinutes(text: string | null | undefined): number | null {
  if (!text?.trim()) return null
  const { hours, minLow, minHigh } = timeParts(text)
  if (!hours && minLow == null) return null
  return hours * 60 + (minHigh ?? minLow ?? 0)
}

export interface RecipeLike {
  id: string
  name: string
  cook_time: string | null
  last_used_at: string | null
  favorite: boolean
  cooked_count: number
  /** The ingredient lines, for search. */
  ingredients: string[]
}

/** Every word of the search in the recipe's name or its ingredients; an empty search keeps them all. */
export function searchRecipes<T extends RecipeLike>(recipes: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return recipes
  return recipes.filter((r) => {
    const hay = `${r.name} ${r.ingredients.join(' ')}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

export type RecipeChip = 'favorites' | 'quick' | 'lately' | 'all'
export const NOT_LATELY_DAYS = 60

export function chipFilter<T extends RecipeLike>(recipes: T[], chip: RecipeChip, now: Date): T[] {
  if (chip === 'favorites') return recipes.filter((r) => r.favorite)
  if (chip === 'quick') return recipes.filter((r) => { const m = cookMinutes(r.cook_time); return m != null && m <= 30 })
  if (chip === 'lately') return recipes.filter((r) => !r.last_used_at || now.getTime() - new Date(r.last_used_at).getTime() > NOT_LATELY_DAYS * 86_400_000)
  return recipes
}

/** Favorites first, then the most recently made, then the never made, by name. */
export function sortRecipes<T extends RecipeLike>(recipes: T[]): T[] {
  return [...recipes].sort((a, b) =>
    Number(b.favorite) - Number(a.favorite)
    || (b.last_used_at ?? '').localeCompare(a.last_used_at ?? '')
    || a.name.localeCompare(b.name))
}

function dayWords(iso: string, now: Date): string {
  const d = new Date(iso)
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(now) - day(d)) / 86_400_000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}

/** Under each photo: "30 min · made 3 times · last Aug 14", "25 min · made Sep 7", "Not made yet". */
export function madeLine(r: RecipeLike, now: Date): string {
  const time = cookTime(r.cook_time)
  const made = !r.last_used_at
    ? (time ? 'not made yet' : 'Not made yet')
    : r.cooked_count > 1 ? `made ${r.cooked_count} times · last ${dayWords(r.last_used_at, now)}` : `made ${dayWords(r.last_used_at, now)}`
  return [time, made].filter(Boolean).join(' · ')
}

const NOT_A_NAME = new Set(['fresh', 'large', 'small', 'medium', 'chopped', 'minced', 'diced', 'sliced', 'ground', 'whole', 'dried', 'cups', 'cup', 'tbsp', 'tsp', 'ounces', 'pound', 'pounds', 'cloves', 'clove', 'pinch', 'package', 'can', 'cans', 'jar', 'optional', 'divided', 'taste', 'with', 'from', 'into', 'plus', 'more', 'about'])

/** The words that name an ingredient ("10 oz Shrimp" → shrimp), for finding it in a step. */
function nameWords(line: string): string[] {
  return amountFor(line, 0).toLowerCase()
    .replace(/[^a-zà-ÿ\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length >= 4 && !NOT_A_NAME.has(w))
}

/** The ingredient lines (their index) a step names: "add spaghetti to pot" uses the spaghetti. */
export function stepUses(step: string, lines: string[]): number[] {
  const text = step.toLowerCase()
  return lines.flatMap((line, i) => (nameWords(line).some((w) => new RegExp(`\\b${w.replace(/s$/, '')}s?\\b`).test(text)) ? [i] : []))
}

/** Probably in the pantry already: salt, black pepper, oil, water, cooking spray (they start unticked for Groceries). */
export function likelyHave(line: string): boolean {
  const l = line.toLowerCase()
  if (/\b(water|ice|salt|cooking spray|olive oil|vegetable oil|canola oil|avocado oil)\b/.test(l)) return true
  return /\bpepper\b/.test(l) && !/(bell|jalape\S*|chili|chile|poblano|serrano|red|green|yellow|orange|banana|sweet) peppers?/.test(l)
}

/** A recipe's ingredient lines for one of its serving choices (the card's amount, or doubled). */
export function linesFor(recipe: { ingredients: string[]; servings: string | null }, servingsIndex: number): string[] {
  const choices = servingChoices(recipe.servings)
  const choice = choices[servingsIndex] ?? choices[0]
  return recipe.ingredients.map((line) => scaleAmount(amountFor(line, choice.variant), choice.factor))
}

const UNITS = String.raw`cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|liters?|cloves?|cans?|packets?|packages?|small|medium|large|pinch(?:es)?|slices?|heads?|bunch(?:es)?|sticks?|jars?|pieces?|sprigs?|stalks?|dash(?:es)?|quarts?|pints?`
const AMOUNT = new RegExp(String.raw`^(${QTY}(?:\s*(?:-|–|to)\s*${QTY})?(?:\s*\([^)]*\))?(?:\s+(?:${UNITS})\b\.?)?)\s+(.+)$`, 'i')

/** "10 oz Shrimp" → ["10 oz", "Shrimp"]; a line with no amount → ["", the line]. */
export function splitAmount(line: string): [string, string] {
  const m = AMOUNT.exec(line.trim())
  return m ? [m[1].trim(), m[m.length - 1].trim()] : ['', line.trim()]
}
