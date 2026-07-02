type ParsedFields = {
  name: string | null
  quantity: string | null
  unit: string | null
}

type InputFields = {
  rawText: string
  name?: string | null
  quantity?: string | null
  unit?: string | null
}

const FRACTION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/½/g, '1/2'],
  [/¼/g, '1/4'],
  [/¾/g, '3/4'],
  [/⅓/g, '1/3'],
  [/⅔/g, '2/3'],
  [/⅛/g, '1/8'],
  [/⅜/g, '3/8'],
  [/⅝/g, '5/8'],
  [/⅞/g, '7/8'],
]

const UNIT_ALIASES: Array<{ phrase: string; canonical: string }> = [
  { phrase: 'fluid ounces', canonical: 'oz' },
  { phrase: 'fl oz', canonical: 'oz' },
  { phrase: 'ounces', canonical: 'oz' },
  { phrase: 'ounce', canonical: 'oz' },
  { phrase: 'oz', canonical: 'oz' },
  { phrase: 'grams', canonical: 'g' },
  { phrase: 'gram', canonical: 'g' },
  { phrase: 'g', canonical: 'g' },
  { phrase: 'kilograms', canonical: 'kg' },
  { phrase: 'kilogram', canonical: 'kg' },
  { phrase: 'kg', canonical: 'kg' },
  { phrase: 'pounds', canonical: 'lb' },
  { phrase: 'pound', canonical: 'lb' },
  { phrase: 'lbs', canonical: 'lb' },
  { phrase: 'lb', canonical: 'lb' },
  { phrase: 'tablespoons', canonical: 'tbsp' },
  { phrase: 'tablespoon', canonical: 'tbsp' },
  { phrase: 'tbsp', canonical: 'tbsp' },
  { phrase: 'teaspoons', canonical: 'tsp' },
  { phrase: 'teaspoon', canonical: 'tsp' },
  { phrase: 'tsp', canonical: 'tsp' },
  { phrase: 'cups', canonical: 'cup' },
  { phrase: 'cup', canonical: 'cup' },
  { phrase: 'milliliters', canonical: 'ml' },
  { phrase: 'milliliter', canonical: 'ml' },
  { phrase: 'ml', canonical: 'ml' },
  { phrase: 'liters', canonical: 'l' },
  { phrase: 'liter', canonical: 'l' },
  { phrase: 'l', canonical: 'l' },
  { phrase: 'fillets', canonical: 'fillet' },
  { phrase: 'fillet', canonical: 'fillet' },
  { phrase: 'cloves', canonical: 'clove' },
  { phrase: 'clove', canonical: 'clove' },
  { phrase: 'cans', canonical: 'can' },
  { phrase: 'can', canonical: 'can' },
  { phrase: 'packages', canonical: 'package' },
  { phrase: 'package', canonical: 'package' },
  { phrase: 'slices', canonical: 'slice' },
  { phrase: 'slice', canonical: 'slice' },
  { phrase: 'pieces', canonical: 'piece' },
  { phrase: 'piece', canonical: 'piece' },
  { phrase: 'pinches', canonical: 'pinch' },
  { phrase: 'pinch', canonical: 'pinch' },
  { phrase: 'dashes', canonical: 'dash' },
  { phrase: 'dash', canonical: 'dash' },
  { phrase: 'bunches', canonical: 'bunch' },
  { phrase: 'bunch', canonical: 'bunch' },
]

function normalizeText(text: string): string {
  let normalized = text.trim()
  for (const [pattern, replacement] of FRACTION_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement)
  }
  return normalized.replace(/[(),]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeQuantity(quantity: string | null): string | null {
  if (!quantity) return null
  const cleaned = normalizeText(quantity).replace(/\s*-\s*/g, '-').trim()
  return cleaned || null
}

function normalizeUnit(unit: string | null): string | null {
  if (!unit) return null
  const cleaned = normalizeText(unit).toLowerCase()
  if (!cleaned) return null
  const match = UNIT_ALIASES.find((entry) => entry.phrase === cleaned)
  return match?.canonical ?? cleaned
}

function parseLeadingQuantity(text: string): { quantity: string | null; rest: string } {
  const mixed = text.match(/^(\d+\s+\d+\/\d+)\s+(.*)$/)
  if (mixed) return { quantity: normalizeQuantity(mixed[1] ?? null), rest: (mixed[2] ?? '').trim() }

  const quantity = text.match(/^(\d+(?:\.\d+)?(?:\/\d+)?|\d+\/\d+|\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?)\s+(.*)$/)
  if (quantity) return { quantity: normalizeQuantity(quantity[1] ?? null), rest: (quantity[2] ?? '').trim() }

  const multiplier = text.match(/^(\d+(?:\.\d+)?)x\s+(.*)$/i)
  if (multiplier) return { quantity: normalizeQuantity(multiplier[1] ?? null), rest: (multiplier[2] ?? '').trim() }

  return { quantity: null, rest: text }
}

function parseQuantityUnitName(rawText: string): ParsedFields {
  const normalized = normalizeText(rawText)
  if (!normalized) return { name: null, quantity: null, unit: null }

  const { quantity, rest } = parseLeadingQuantity(normalized)
  if (!quantity) return { name: normalized || null, quantity: null, unit: null }

  const restLower = rest.toLowerCase()
  const sortedUnits = [...UNIT_ALIASES].sort((a, b) => b.phrase.length - a.phrase.length)
  for (const unitOption of sortedUnits) {
    if (restLower === unitOption.phrase || restLower.startsWith(`${unitOption.phrase} `)) {
      const remainder = rest.slice(unitOption.phrase.length).trim().replace(/^of\s+/i, '')
      return {
        name: remainder || null,
        quantity,
        unit: unitOption.canonical,
      }
    }
  }

  return {
    name: rest.replace(/^of\s+/i, '').trim() || null,
    quantity,
    unit: null,
  }
}

export function normalizeRecipeIngredientFields(input: InputFields): ParsedFields {
  const rawText = normalizeText(input.rawText)
  const existingName = normalizeText(input.name ?? '')
  const existingQuantity = normalizeQuantity(input.quantity ?? null)
  const existingUnit = normalizeUnit(input.unit ?? null)
  const parsed = parseQuantityUnitName(rawText || existingName)

  const quantity = existingQuantity ?? parsed.quantity
  const unit = existingUnit ?? parsed.unit
  const shouldUseParsedName =
    !existingName ||
    ((existingName === rawText || existingName === `${existingQuantity ?? ''} ${existingUnit ?? ''}`.trim()) && Boolean(parsed.name))

  const preferredName = (shouldUseParsedName ? parsed.name : existingName) ?? existingName ?? parsed.name ?? rawText
  const name = preferredName || null

  return {
    name: name ? name.trim() : null,
    quantity,
    unit,
  }
}
