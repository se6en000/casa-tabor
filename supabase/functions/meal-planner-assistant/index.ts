import { createClient } from 'npm:@supabase/supabase-js@2'
import { createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'
import { requireEnv } from '../_shared/env.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const providerFetch = createTrackedProviderFetch({
  functionName: 'meal-planner-assistant',
  capability: 'meal-planning',
  trafficClass: 'user',
})

type FoodProfile = {
  householdSize: number
  weeklyBudgetUsd: number
  defaultMealsPerWeek: number
  weeknightMaxMinutes: number
  dietaryRules: string
  allergies: string
  dislikedFoods: string
  preferredCuisines: string
  pantryStaples: string
  preferredProteins: string
}

type RecipeLite = {
  id: string
  name: string
  cook_time: string | null
  servings: string | null
  last_used_at: string | null
  created_at: string
  ingredients: Array<{ raw_text: string; name: string | null; quantity: string | null; unit: string | null }>
}

type PlannerMeal = {
  recipe_id: string
  recipe_name: string
  slot: 'tonight' | 'tomorrow' | 'this-week'
  planned_for: string | null
  overlap_score: number
  reason: string
}

type PlannerIngredient = {
  name: string
  quantity: string | null
  unit: string | null
  category: string
  source_recipe_ids: string[]
  required_quantity: number | null
  required_package_fraction: number | null
  suggested_purchase_quantity: number | null
  suggested_purchase_unit: string | null
  suggested_purchase_size: string | null
  suggested_purchase_display: string | null
  inventory_on_hand_packages: number | null
  projected_remaining_packages: number | null
  waste_ratio: number
  pantry_covered: boolean
  low_stock_prompt: boolean
}

type PlannerPlan = {
  summary: string
  proposed_meals: PlannerMeal[]
  overlap_ingredients: Array<{ name: string; recipe_count: number }>
  pantry_deductions: Array<{ name: string; reason: string }>
  grocery_additions: PlannerIngredient[]
  estimated_cost_range: { low: number; high: number; currency: 'USD' }
  budget_fit_score: number
  waste_score: number
  estimated_waste_value: number
  explainability: {
    meal_selection: string
    overlap_strategy: string
    budget_strategy: string
    waste_strategy: string
    pantry_strategy: string
  }
  suggested_recipe: { name: string; reason: string; core_ingredients: string[] } | null
  actions: Array<{ id: 'add_grocery' | 'queue_meals'; label: string }>
}

type PlannerLearningSignals = {
  preferred_ingredients: string[]
  avoided_ingredients: string[]
  successful_prompts: string[]
  template_names: string[]
}

type PlannerStrategy = 'balanced' | 'budget' | 'speed'

type PantryInventorySignal = {
  on_hand_packages: number
  low_stock_threshold: number
}

const DEFAULT_PROFILE: FoodProfile = {
  householdSize: 4,
  weeklyBudgetUsd: 140,
  defaultMealsPerWeek: 5,
  weeknightMaxMinutes: 35,
  dietaryRules: '',
  allergies: '',
  dislikedFoods: '',
  preferredCuisines: '',
  pantryStaples: '',
  preferredProteins: '',
}

function normalizePlannerStrategy(raw: unknown): PlannerStrategy {
  const value = cleanText(raw, 20).toLowerCase()
  if (value === 'budget') return 'budget'
  if (value === 'speed') return 'speed'
  return 'balanced'
}

function cleanText(value: unknown, maxLen = 500): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

function toInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.round(parsed)))
}

function normalizeFoodProfile(raw: unknown): FoodProfile {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    householdSize: toInt(row.householdSize, DEFAULT_PROFILE.householdSize, 1, 12),
    weeklyBudgetUsd: toInt(row.weeklyBudgetUsd, DEFAULT_PROFILE.weeklyBudgetUsd, 20, 3000),
    defaultMealsPerWeek: toInt(row.defaultMealsPerWeek, DEFAULT_PROFILE.defaultMealsPerWeek, 1, 14),
    weeknightMaxMinutes: toInt(row.weeknightMaxMinutes, DEFAULT_PROFILE.weeknightMaxMinutes, 10, 180),
    dietaryRules: cleanText(row.dietaryRules),
    allergies: cleanText(row.allergies),
    dislikedFoods: cleanText(row.dislikedFoods),
    preferredCuisines: cleanText(row.preferredCuisines),
    pantryStaples: cleanText(row.pantryStaples, 1000),
    preferredProteins: cleanText(row.preferredProteins),
  }
}

function normalizeIngredientName(value: string): string {
  return value.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseTargetMealCount(prompt: string, profile: FoodProfile): number {
  const explicit = prompt.match(/\b(\d{1,2})\s+(?:meals?|dinners?|recipes?)\b/i)
  if (explicit) return toInt(Number(explicit[1]), profile.defaultMealsPerWeek, 1, 14)
  return profile.defaultMealsPerWeek
}

function parsePreferOverlap(prompt: string): boolean {
  const lowered = prompt.toLowerCase()
  if (/\b(variety|different|diverse|mix it up)\b/.test(lowered)) return false
  return true
}

function parsePantryStaples(value: string): Set<string> {
  const tokens = value
    .split(/[\n,]/g)
    .map((item) => normalizeIngredientName(item))
    .filter(Boolean)
  return new Set(tokens)
}

function normalizeLearningSignals(raw: unknown): PlannerLearningSignals {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const toList = (value: unknown, max = 20): string[] => (
    Array.isArray(value)
      ? value.map((item) => normalizeIngredientName(String(item ?? ''))).filter(Boolean).slice(0, max)
      : []
  )
  const toPromptList = (value: unknown, max = 20): string[] => (
    Array.isArray(value)
      ? value.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, max)
      : []
  )
  return {
    preferred_ingredients: toList(row.preferred_ingredients),
    avoided_ingredients: toList(row.avoided_ingredients),
    successful_prompts: toPromptList(row.successful_prompts),
    template_names: toPromptList(row.template_names, 12),
  }
}

function normalizePantryInventory(raw: unknown): Record<string, PantryInventorySignal> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const inventory: Record<string, PantryInventorySignal> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const row = value as Record<string, unknown>
    const onHand = Number(row.on_hand_packages)
    const lowThreshold = Number(row.low_stock_threshold)
    if (!Number.isFinite(onHand) || onHand < 0) continue
    inventory[key] = {
      on_hand_packages: Number(onHand.toFixed(2)),
      low_stock_threshold: Number.isFinite(lowThreshold) && lowThreshold >= 0
        ? Number(lowThreshold.toFixed(2))
        : 0.5,
    }
  }
  return inventory
}

function inferCategory(name: string): string {
  const n = name.toLowerCase()
  if (/(chicken|beef|steak|pork|fish|salmon|shrimp|turkey|sausage|bacon)/.test(n)) return 'meat'
  if (/(milk|yogurt|butter|cheese|cream|egg)/.test(n)) return 'dairy'
  if (/(apple|banana|lemon|lime|lettuce|tomato|onion|garlic|pepper|cilantro|spinach|potato)/.test(n)) return 'produce'
  if (/(bread|bun|roll|tortilla)/.test(n)) return 'bakery'
  if (/(rice|pasta|oil|vinegar|flour|sugar|salt|pepper|beans|broth|stock|sauce)/.test(n)) return 'pantry'
  return 'other'
}

function parseCookMinutes(raw: string | null): number | null {
  if (!raw) return null
  const match = raw.match(/(\d{1,3})/)
  if (!match) return null
  const mins = Number(match[1])
  return Number.isFinite(mins) ? mins : null
}

function parseQuantityToNumber(raw: string | null): number | null {
  if (!raw) return null
  const value = raw.trim()
  if (!value) return null
  const mixed = value.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) {
    const whole = Number(mixed[1] ?? 0)
    const numerator = Number(mixed[2] ?? 0)
    const denominator = Number(mixed[3] ?? 1)
    if (denominator <= 0) return null
    return whole + (numerator / denominator)
  }
  const fraction = value.match(/^(\d+)\/(\d+)$/)
  if (fraction) {
    const numerator = Number(fraction[1] ?? 0)
    const denominator = Number(fraction[2] ?? 1)
    if (denominator <= 0) return null
    return numerator / denominator
  }
  const decimal = Number(value)
  return Number.isFinite(decimal) ? decimal : null
}

function normalizeUnit(raw: string | null): string {
  const unit = cleanText(raw, 20).toLowerCase()
  if (!unit) return ''
  if (['tsp', 'teaspoon', 'teaspoons'].includes(unit)) return 'tsp'
  if (['tbsp', 'tablespoon', 'tablespoons'].includes(unit)) return 'tbsp'
  if (['cup', 'cups'].includes(unit)) return 'cup'
  if (['ml', 'milliliter', 'milliliters'].includes(unit)) return 'ml'
  if (['l', 'liter', 'liters'].includes(unit)) return 'l'
  if (['oz', 'ounce', 'ounces', 'fl oz', 'floz'].includes(unit)) return 'oz'
  if (['lb', 'lbs', 'pound', 'pounds'].includes(unit)) return 'lb'
  if (['g', 'gram', 'grams'].includes(unit)) return 'g'
  if (['clove', 'cloves', 'piece', 'pieces', 'item', 'items', 'each'].includes(unit)) return 'item'
  return unit
}

function toBaseQuantity(quantity: number | null, unit: string | null): { kind: 'volume' | 'weight' | 'count'; value: number } | null {
  if (typeof quantity !== 'number' || quantity <= 0) return null
  const normalized = normalizeUnit(unit)
  if (normalized === 'tsp') return { kind: 'volume', value: quantity }
  if (normalized === 'tbsp') return { kind: 'volume', value: quantity * 3 }
  if (normalized === 'cup') return { kind: 'volume', value: quantity * 48 }
  if (normalized === 'ml') return { kind: 'volume', value: quantity * 0.202884 }
  if (normalized === 'l') return { kind: 'volume', value: quantity * 202.884 }
  if (normalized === 'oz') return { kind: 'weight', value: quantity }
  if (normalized === 'lb') return { kind: 'weight', value: quantity * 16 }
  if (normalized === 'g') return { kind: 'weight', value: quantity * 0.035274 }
  if (!normalized || normalized === 'item') return { kind: 'count', value: quantity }
  return null
}

type StorePackSuggestion = {
  package_count: number
  package_unit: string
  package_size_label: string
  purchased_base_quantity: number | null
  low_stock_prompt: boolean
}

function suggestStorePack(name: string, category: string, requiredBase: { kind: 'volume' | 'weight' | 'count'; value: number } | null): StorePackSuggestion {
  const normalized = normalizeIngredientName(name)
  const spicesOrSeasonings = /(salt|pepper|paprika|cumin|oregano|thyme|turmeric|cinnamon|chili powder|seasoning|spice|garlic powder|onion powder)/
  const oilsAndCondiments = /(oil|vinegar|soy sauce|sriracha|hot sauce|fish sauce|worcestershire|sesame oil|mustard|ketchup|mayo|mayonnaise)/
  const cannedGoods = /(corn|beans|chickpeas|tomato|coconut milk|pumpkin|tuna|salmon|sardine)/
  const broths = /(broth|stock)/
  const dryGoods = /(rice|pasta|flour|sugar|oats|quinoa|panko|breadcrumbs)/

  if (cannedGoods.test(normalized)) {
    const canSizeOz = 15
    const neededOz = requiredBase?.kind === 'weight' ? requiredBase.value : null
    const packageCount = neededOz ? Math.max(1, Math.ceil(neededOz / canSizeOz)) : 1
    return {
      package_count: packageCount,
      package_unit: 'can',
      package_size_label: `${canSizeOz} oz can`,
      purchased_base_quantity: packageCount * canSizeOz,
      low_stock_prompt: false,
    }
  }

  if (spicesOrSeasonings.test(normalized)) {
    const jarSizeOz = 2
    const neededOz = requiredBase?.kind === 'weight' ? requiredBase.value : null
    const packageCount = neededOz ? Math.max(1, Math.ceil(neededOz / jarSizeOz)) : 1
    return {
      package_count: packageCount,
      package_unit: 'jar',
      package_size_label: `${jarSizeOz} oz jar`,
      purchased_base_quantity: neededOz ? packageCount * jarSizeOz : null,
      low_stock_prompt: true,
    }
  }

  if (oilsAndCondiments.test(normalized)) {
    const bottleSizeFlOz = normalized.includes('sesame oil') ? 5 : 16
    const bottleSizeTsp = bottleSizeFlOz * 6
    const neededTsp = requiredBase?.kind === 'volume' ? requiredBase.value : null
    const packageCount = neededTsp ? Math.max(1, Math.ceil(neededTsp / bottleSizeTsp)) : 1
    return {
      package_count: packageCount,
      package_unit: 'bottle',
      package_size_label: `${bottleSizeFlOz} fl oz bottle`,
      purchased_base_quantity: packageCount * bottleSizeTsp,
      low_stock_prompt: true,
    }
  }

  if (broths.test(normalized)) {
    const cartonFlOz = 32
    const cartonTsp = cartonFlOz * 6
    const neededTsp = requiredBase?.kind === 'volume' ? requiredBase.value : null
    const packageCount = neededTsp ? Math.max(1, Math.ceil(neededTsp / cartonTsp)) : 1
    return {
      package_count: packageCount,
      package_unit: 'carton',
      package_size_label: `${cartonFlOz} fl oz carton`,
      purchased_base_quantity: packageCount * cartonTsp,
      low_stock_prompt: false,
    }
  }

  if (dryGoods.test(normalized)) {
    const bagOz = 16
    const neededOz = requiredBase?.kind === 'weight' ? requiredBase.value : null
    const packageCount = neededOz ? Math.max(1, Math.ceil(neededOz / bagOz)) : 1
    return {
      package_count: packageCount,
      package_unit: 'bag',
      package_size_label: `${bagOz} oz bag`,
      purchased_base_quantity: neededOz ? packageCount * bagOz : null,
      low_stock_prompt: false,
    }
  }

  if (requiredBase?.kind === 'count') {
    return {
      package_count: Math.max(1, Math.ceil(requiredBase.value)),
      package_unit: category === 'produce' ? 'item' : 'pkg',
      package_size_label: category === 'produce' ? 'individual item' : 'package',
      purchased_base_quantity: Math.max(1, Math.ceil(requiredBase.value)),
      low_stock_prompt: false,
    }
  }

  if (requiredBase?.kind === 'weight') {
    const fallbackOz = 16
    const packageCount = Math.max(1, Math.ceil(requiredBase.value / fallbackOz))
    return {
      package_count: packageCount,
      package_unit: 'pkg',
      package_size_label: `${fallbackOz} oz package`,
      purchased_base_quantity: packageCount * fallbackOz,
      low_stock_prompt: false,
    }
  }

  if (requiredBase?.kind === 'volume') {
    const fallbackFlOz = 16
    const fallbackTsp = fallbackFlOz * 6
    const packageCount = Math.max(1, Math.ceil(requiredBase.value / fallbackTsp))
    return {
      package_count: packageCount,
      package_unit: 'bottle',
      package_size_label: `${fallbackFlOz} fl oz bottle`,
      purchased_base_quantity: packageCount * fallbackTsp,
      low_stock_prompt: false,
    }
  }

  return {
    package_count: 1,
    package_unit: category === 'produce' ? 'item' : 'pkg',
    package_size_label: category === 'produce' ? 'individual item' : 'package',
    purchased_base_quantity: null,
    low_stock_prompt: false,
  }
}

function estimatedUnitCost(category: string): number {
  if (category === 'meat') return 4.5
  if (category === 'dairy') return 2.8
  if (category === 'produce') return 2.2
  if (category === 'bakery') return 2.4
  if (category === 'pantry') return 2.6
  return 2
}

function computeJaccard(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b])
  if (union.size === 0) return 0
  let shared = 0
  for (const item of a) {
    if (b.has(item)) shared += 1
  }
  return shared / union.size
}

function recipeIngredientSet(recipe: RecipeLite): Set<string> {
  const set = new Set<string>()
  for (const ingredient of recipe.ingredients) {
    const raw = normalizeIngredientName(ingredient.name || ingredient.raw_text || '')
    if (raw.length < 2) continue
    set.add(raw)
  }
  return set
}

function estimateRecipeCost(recipe: RecipeLite): number {
  let total = 0
  for (const ingredient of recipe.ingredients) {
    const name = cleanText(ingredient.name || ingredient.raw_text, 120)
    if (!name) continue
    const category = inferCategory(name)
    const numericRequired = parseQuantityToNumber(cleanText(ingredient.quantity, 40) || null)
    const baseRequired = toBaseQuantity(numericRequired, ingredient.unit)
    const packSuggestion = suggestStorePack(name, category, baseRequired)
    total += Math.max(1, packSuggestion.package_count * estimatedUnitCost(category))
  }
  return Math.max(1, Number(total.toFixed(2)))
}

function strategyWeights(strategy: PlannerStrategy): { overlap: number; cost: number; speed: number; recency: number } {
  if (strategy === 'budget') return { overlap: 1.4, cost: 2.2, speed: 0.8, recency: 0.5 }
  if (strategy === 'speed') return { overlap: 1.2, cost: 0.9, speed: 2.3, recency: 0.5 }
  return { overlap: 1.8, cost: 1.3, speed: 1.1, recency: 0.5 }
}

function dateAtOffset(days: number): string {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  return next.toISOString().slice(0, 10)
}

async function callGeminiSuggestion(apiKey: string, prompt: string, profile: FoodProfile, recipes: RecipeLite[]): Promise<{ notes?: string; suggested_recipe?: { name: string; reason: string; core_ingredients: string[] } } | null> {
  const recipeSummaries = recipes.slice(0, 14).map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    cook_time: recipe.cook_time,
    ingredients: recipe.ingredients
      .map((row) => normalizeIngredientName(row.name || row.raw_text || ''))
      .filter(Boolean)
      .slice(0, 8),
  }))
  const llmPrompt = [
    'You are helping with a weekly meal planning chat.',
    'Use only the provided recipe summaries and profile.',
    'Do not invent recipe IDs.',
    'Return strict JSON only as {"notes":"...","suggested_recipe":{"name":"...","reason":"...","core_ingredients":["..."]}|null}.',
    `User request: ${prompt}`,
    `Food profile: ${JSON.stringify(profile)}`,
    `Recipes: ${JSON.stringify(recipeSummaries)}`,
  ].join('\n')
  const response = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: llmPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 320,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  })
  if (!response.ok) return null
  const json = await response.json()
  const parts = (json?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>
  const text = parts.filter((part) => !part.thought).map((part) => part.text ?? '').join('').trim()
  if (!text) return null
  try {
    const parsed = JSON.parse(text) as { notes?: unknown; suggested_recipe?: unknown }
    const suggestedRaw = parsed.suggested_recipe
    const suggested = suggestedRaw && typeof suggestedRaw === 'object'
      ? {
        name: cleanText((suggestedRaw as Record<string, unknown>).name, 120),
        reason: cleanText((suggestedRaw as Record<string, unknown>).reason, 280),
        core_ingredients: Array.isArray((suggestedRaw as Record<string, unknown>).core_ingredients)
          ? ((suggestedRaw as Record<string, unknown>).core_ingredients as unknown[]).map((row) => cleanText(row, 80)).filter(Boolean).slice(0, 6)
          : [],
      }
      : null
    return {
      notes: cleanText(parsed.notes, 500),
      suggested_recipe: suggested && suggested.name ? suggested : null,
    }
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const startedAt = Date.now()
  try {
    const payload = await req.json().catch(() => ({})) as Record<string, unknown>
    const prompt = cleanText(payload.prompt, 400)
    if (!prompt) throw new Error('prompt is required')
    const requestProfile = normalizeFoodProfile(payload.food_profile)
    const debugRequested = payload.debug === true
    const requestLearning = normalizeLearningSignals(payload.learning_signals)
    const pantryInventory = normalizePantryInventory(payload.pantry_inventory)
    const plannerStrategy = normalizePlannerStrategy(payload.planner_strategy)
    const traceId = cleanText(payload.trace_id, 80) || crypto.randomUUID()

    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const [{ data: settingRow }, { data: recipeRows, error: recipeError }, { data: ingredientRows, error: ingredientError }] = await Promise.all([
      sb.from('settings').select('value').eq('key', 'food_profile').maybeSingle(),
      sb.from('recipes').select('id,name,cook_time,servings,last_used_at,created_at').order('last_used_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(120),
      sb.from('recipe_ingredients').select('recipe_id,raw_text,name,quantity,unit').order('sort_order', { ascending: true }),
    ])
    if (recipeError) throw new Error(recipeError.message)
    if (ingredientError) throw new Error(ingredientError.message)

    const savedProfile = normalizeFoodProfile(settingRow?.value)
    const foodProfile = normalizeFoodProfile({ ...savedProfile, ...requestProfile })

    const ingredientMap = new Map<string, RecipeLite['ingredients']>()
    for (const row of ingredientRows ?? []) {
      const recipeId = String((row as { recipe_id?: unknown }).recipe_id ?? '')
      if (!recipeId) continue
      const bucket = ingredientMap.get(recipeId) ?? []
      bucket.push({
        raw_text: String((row as { raw_text?: unknown }).raw_text ?? ''),
        name: typeof (row as { name?: unknown }).name === 'string' ? String((row as { name?: unknown }).name) : null,
        quantity: typeof (row as { quantity?: unknown }).quantity === 'string' ? String((row as { quantity?: unknown }).quantity) : null,
        unit: typeof (row as { unit?: unknown }).unit === 'string' ? String((row as { unit?: unknown }).unit) : null,
      })
      ingredientMap.set(recipeId, bucket)
    }

    const recipes: RecipeLite[] = (recipeRows ?? [])
      .map((row) => ({
        id: String((row as { id?: unknown }).id ?? ''),
        name: String((row as { name?: unknown }).name ?? '').trim(),
        cook_time: typeof (row as { cook_time?: unknown }).cook_time === 'string' ? String((row as { cook_time?: unknown }).cook_time) : null,
        servings: typeof (row as { servings?: unknown }).servings === 'string' ? String((row as { servings?: unknown }).servings) : null,
        last_used_at: typeof (row as { last_used_at?: unknown }).last_used_at === 'string' ? String((row as { last_used_at?: unknown }).last_used_at) : null,
        created_at: String((row as { created_at?: unknown }).created_at ?? ''),
        ingredients: ingredientMap.get(String((row as { id?: unknown }).id ?? '')) ?? [],
      }))
      .filter((recipe) => recipe.id && recipe.name && recipe.ingredients.length > 0)

    if (recipes.length === 0) {
      throw new Error('No recipes found. Import a few recipes first.')
    }

    const targetMeals = Math.min(parseTargetMealCount(prompt, foodProfile), recipes.length)
    const preferOverlap = parsePreferOverlap(prompt)
    const dislikedTokens = new Set(foodProfile.dislikedFoods.toLowerCase().split(',').map((item) => item.trim()).filter(Boolean))
    const allergyTokens = new Set(foodProfile.allergies.toLowerCase().split(',').map((item) => item.trim()).filter(Boolean))
    const pantryStaples = parsePantryStaples(foodProfile.pantryStaples)
    const maxMinutes = foodProfile.weeknightMaxMinutes
    const preferredIngredientTokens = new Set(requestLearning.preferred_ingredients)
    const avoidedIngredientTokens = new Set(requestLearning.avoided_ingredients)

    const candidateRecipes = recipes.filter((recipe) => {
      const ingredientsText = recipe.ingredients.map((item) => `${item.name ?? ''} ${item.raw_text}`).join(' ').toLowerCase()
      for (const token of dislikedTokens) {
        if (token && ingredientsText.includes(token)) return false
      }
      for (const token of allergyTokens) {
        if (token && ingredientsText.includes(token)) return false
      }
      const cookMins = parseCookMinutes(recipe.cook_time)
      if (cookMins && cookMins > maxMinutes + 25) return false
      return true
    })
    const usableRecipes = candidateRecipes.length > 0 ? candidateRecipes : recipes

    const selected: RecipeLite[] = []
    const selectedSets: Array<Set<string>> = []
    const available = [...usableRecipes]
    const costByRecipe = new Map<string, number>()
    const cookMinsByRecipe = new Map<string, number>()
    let maxRecipeCost = 1
    for (const recipe of available) {
      const cost = estimateRecipeCost(recipe)
      costByRecipe.set(recipe.id, cost)
      maxRecipeCost = Math.max(maxRecipeCost, cost)
      cookMinsByRecipe.set(recipe.id, parseCookMinutes(recipe.cook_time) ?? maxMinutes)
    }
    const weight = strategyWeights(plannerStrategy)
    available.sort((a, b) => {
      const aTime = new Date(a.last_used_at ?? a.created_at).getTime()
      const bTime = new Date(b.last_used_at ?? b.created_at).getTime()
      const aCostNorm = 1 - ((costByRecipe.get(a.id) ?? 1) / maxRecipeCost)
      const bCostNorm = 1 - ((costByRecipe.get(b.id) ?? 1) / maxRecipeCost)
      const aSpeedNorm = 1 - Math.min(1, (cookMinsByRecipe.get(a.id) ?? maxMinutes) / Math.max(15, maxMinutes + 30))
      const bSpeedNorm = 1 - Math.min(1, (cookMinsByRecipe.get(b.id) ?? maxMinutes) / Math.max(15, maxMinutes + 30))
      const aRecency = aTime / 1_000_000_000_000
      const bRecency = bTime / 1_000_000_000_000
      const aScore = aCostNorm * weight.cost + aSpeedNorm * weight.speed + aRecency * weight.recency
      const bScore = bCostNorm * weight.cost + bSpeedNorm * weight.speed + bRecency * weight.recency
      return bScore - aScore
    })
    selected.push(available[0])
    selectedSets.push(recipeIngredientSet(available[0]))
    const selectedIds = new Set([available[0].id])

    while (selected.length < targetMeals) {
      let best: RecipeLite | null = null
      let bestScore = -Infinity
      const unionIngredients = new Set<string>()
      for (const set of selectedSets) {
        for (const item of set) unionIngredients.add(item)
      }
      for (const recipe of available) {
        if (selectedIds.has(recipe.id)) continue
        const set = recipeIngredientSet(recipe)
        const overlap = computeJaccard(set, unionIngredients)
        const recency = new Date(recipe.last_used_at ?? recipe.created_at).getTime() / 1_000_000_000_000
        const costNorm = 1 - ((costByRecipe.get(recipe.id) ?? 1) / maxRecipeCost)
        const cookMins = cookMinsByRecipe.get(recipe.id) ?? maxMinutes
        const speedNorm = 1 - Math.min(1, cookMins / Math.max(15, maxMinutes + 30))
        let learnedBoost = 0
        for (const token of set) {
          if (preferredIngredientTokens.has(token)) learnedBoost += 0.24
          if (avoidedIngredientTokens.has(token)) learnedBoost -= 0.35
        }
        const overlapScore = preferOverlap ? overlap : (1 - overlap)
        const score = (
          overlapScore * weight.overlap +
          costNorm * weight.cost +
          speedNorm * weight.speed +
          recency * weight.recency
        ) + learnedBoost
        if (score > bestScore) {
          best = recipe
          bestScore = score
        }
      }
      if (!best) break
      selected.push(best)
      selectedSets.push(recipeIngredientSet(best))
      selectedIds.add(best.id)
    }

    const overlapCounter = new Map<string, number>()
    for (const set of selectedSets) {
      for (const ingredient of set) {
        overlapCounter.set(ingredient, (overlapCounter.get(ingredient) ?? 0) + 1)
      }
    }
    const overlapIngredients = Array.from(overlapCounter.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, recipe_count]) => ({ name, recipe_count }))

    const pantryDeductions: Array<{ name: string; reason: string }> = []
    const groceryMap = new Map<string, PlannerIngredient & { sourceSet: Set<string>; numericRequired: number | null }>()
    for (const recipe of selected) {
      for (const ingredient of recipe.ingredients) {
        const displayName = cleanText(ingredient.name || ingredient.raw_text, 120)
        if (!displayName) continue
        const key = normalizeIngredientName(displayName)
        if (!key) continue
        const isPantryCovered = pantryStaples.has(key) || Array.from(pantryStaples).some((token) => token.length >= 3 && key.includes(token))
        if (isPantryCovered) {
        pantryDeductions.push({ name: displayName, reason: 'Pantry staple from food profile' })
        continue
        }
        const category = inferCategory(displayName)
        const numericRequired = parseQuantityToNumber(cleanText(ingredient.quantity, 40) || null)
        const existing = groceryMap.get(key)
        if (!existing) {
        groceryMap.set(key, {
          name: displayName,
          quantity: cleanText(ingredient.quantity, 40) || null,
          unit: cleanText(ingredient.unit, 24) || null,
          category,
          source_recipe_ids: [recipe.id],
          sourceSet: new Set([recipe.id]),
          required_quantity: numericRequired,
          required_package_fraction: null,
          suggested_purchase_quantity: numericRequired,
          suggested_purchase_unit: null,
          suggested_purchase_size: null,
          suggested_purchase_display: null,
          inventory_on_hand_packages: null,
          projected_remaining_packages: null,
          waste_ratio: 0,
          pantry_covered: false,
          low_stock_prompt: false,
          numericRequired,
        })
        continue
        }
        existing.sourceSet.add(recipe.id)
        existing.source_recipe_ids = Array.from(existing.sourceSet)
        if (!existing.quantity && ingredient.quantity) existing.quantity = cleanText(ingredient.quantity, 40)
        if (!existing.unit && ingredient.unit) existing.unit = cleanText(ingredient.unit, 24)
        if (typeof numericRequired === 'number') {
        existing.numericRequired = typeof existing.numericRequired === 'number'
          ? existing.numericRequired + numericRequired
          : numericRequired
        }
      }
    }
    let totalEstimatedCost = 0
    let totalEstimatedWasteValue = 0
    const groceryAdditions: PlannerIngredient[] = Array.from(groceryMap.values())
      .map((row) => {
        const requiredQty = row.numericRequired
        const baseRequired = toBaseQuantity(requiredQty, row.unit)
        const packSuggestion = suggestStorePack(row.name, row.category, baseRequired)
        const suggestedQty = packSuggestion.package_count
        const packageBasePerPack = (typeof packSuggestion.purchased_base_quantity === 'number' && suggestedQty > 0)
          ? packSuggestion.purchased_base_quantity / suggestedQty
          : null
        const requiredPackageFraction = (baseRequired && typeof packageBasePerPack === 'number' && packageBasePerPack > 0)
          ? Number((baseRequired.value / packageBasePerPack).toFixed(2))
          : null
        const inventoryKey = `${row.name.toLowerCase().trim()}::${row.category}`
        const inventorySignal = pantryInventory[inventoryKey]
        const inventoryOnHand = inventorySignal ? inventorySignal.on_hand_packages : null
        const projectedRemaining = (inventorySignal && typeof requiredPackageFraction === 'number')
          ? Number(Math.max(0, inventorySignal.on_hand_packages - requiredPackageFraction).toFixed(2))
          : null
        const wasteRatio = (baseRequired && typeof packSuggestion.purchased_base_quantity === 'number' && packSuggestion.purchased_base_quantity > 0)
          ? Math.max(0, Math.min(1, (packSuggestion.purchased_base_quantity - baseRequired.value) / packSuggestion.purchased_base_quantity))
          : 0
        const unitCost = estimatedUnitCost(row.category)
        const purchaseCost = Math.max(1, Math.round(suggestedQty * unitCost * 100) / 100)
        const wasteValue = Math.round((purchaseCost * wasteRatio) * 100) / 100
        totalEstimatedCost += purchaseCost
        totalEstimatedWasteValue += wasteValue
        return {
        name: row.name,
        quantity: row.quantity,
        unit: row.unit,
        category: row.category,
        source_recipe_ids: row.source_recipe_ids,
        required_quantity: typeof requiredQty === 'number' ? Number(requiredQty.toFixed(2)) : null,
        required_package_fraction: requiredPackageFraction,
        suggested_purchase_quantity: Number(suggestedQty.toFixed(2)),
        suggested_purchase_unit: packSuggestion.package_unit,
        suggested_purchase_size: packSuggestion.package_size_label,
        suggested_purchase_display: `${suggestedQty} ${packSuggestion.package_unit}${suggestedQty === 1 ? '' : 's'} (${packSuggestion.package_size_label})`,
        inventory_on_hand_packages: inventoryOnHand,
        projected_remaining_packages: projectedRemaining,
        waste_ratio: Number(wasteRatio.toFixed(2)),
        pantry_covered: false,
        low_stock_prompt: inventorySignal
          ? (typeof projectedRemaining === 'number' ? projectedRemaining <= inventorySignal.low_stock_threshold : inventorySignal.on_hand_packages <= inventorySignal.low_stock_threshold)
          : packSuggestion.low_stock_prompt,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    const proposedMeals: PlannerMeal[] = selected.map((recipe, index) => {
      const ingredientSet = recipeIngredientSet(recipe)
      const overlapCount = Array.from(ingredientSet).filter((ingredient) => (overlapCounter.get(ingredient) ?? 0) > 1).length
      const overlapScore = ingredientSet.size === 0 ? 0 : overlapCount / ingredientSet.size
      return {
        recipe_id: recipe.id,
        recipe_name: recipe.name,
        slot: index === 0 ? 'tonight' : (index === 1 ? 'tomorrow' : 'this-week'),
        planned_for: index <= 6 ? dateAtOffset(index) : null,
        overlap_score: Number(overlapScore.toFixed(2)),
        reason: overlapScore >= 0.45
          ? 'Shares core ingredients with other meals'
          : 'Adds variety while fitting constraints',
      }
    })

    const estimatedBase = Math.max(20, Math.round(totalEstimatedCost))
    const estLow = Math.max(20, Math.round(estimatedBase * 0.9))
    const estHigh = Math.max(estLow + 10, Math.round(estimatedBase * 1.12))
    const budgetRatio = estHigh / Math.max(1, foodProfile.weeklyBudgetUsd)
    const budgetFitScore = Number(Math.max(0, Math.min(1, 1 - Math.max(0, budgetRatio - 1))).toFixed(2))
    const avgWasteRatio = groceryAdditions.length > 0
      ? groceryAdditions.reduce((sum, item) => sum + item.waste_ratio, 0) / groceryAdditions.length
      : 0
    const wasteScore = Number(Math.max(0, Math.min(1, 1 - avgWasteRatio)).toFixed(2))

    let llmSuggestion: { notes?: string; suggested_recipe?: { name: string; reason: string; core_ingredients: string[] } } | null = null
    let llmUsed = false
    const { data: llmRow } = await sb.from('settings').select('value').eq('key', 'llm_config').maybeSingle()
    const llmConfig = llmRow?.value as { provider?: string; api_key?: string } | undefined
    if (llmConfig?.provider === 'gemini' && typeof llmConfig.api_key === 'string' && llmConfig.api_key.trim().length > 0) {
      llmSuggestion = await callGeminiSuggestion(llmConfig.api_key.trim(), prompt, foodProfile, selected)
      llmUsed = Boolean(llmSuggestion)
    }

    const summary = llmSuggestion?.notes?.trim()
      || `Planned ${proposedMeals.length} meals with ${overlapIngredients.length} shared core ingredients, ${pantryDeductions.length} pantry deductions, and an estimated grocery range of $${estLow}-$${estHigh}.`

    const plan: PlannerPlan = {
      summary,
      proposed_meals: proposedMeals,
      overlap_ingredients: overlapIngredients,
      pantry_deductions: pantryDeductions.slice(0, 24),
      grocery_additions: groceryAdditions,
      estimated_cost_range: { low: estLow, high: estHigh, currency: 'USD' },
      budget_fit_score: budgetFitScore,
      waste_score: wasteScore,
      estimated_waste_value: Number(totalEstimatedWasteValue.toFixed(2)),
      explainability: {
        meal_selection: 'Ranked recent recipes by overlap fit, cook-time limits, and learned likes/dislikes.',
        overlap_strategy: preferOverlap
          ? 'Prioritized recipes sharing core ingredients to reduce duplicates.'
          : 'Allowed more variety while still preserving practical overlaps.',
        budget_strategy: plannerStrategy === 'budget'
          ? 'Budget-first mode increased low-cost recipe weighting against weekly budget fit.'
          : 'Estimated cost from category pack heuristics and scored fit against weekly budget.',
        waste_strategy: 'Rounded purchases to pack sizes and penalized high leftover ratios.',
        pantry_strategy: `Skipped ${pantryDeductions.length} pantry staple items from your profile.`,
      },
      suggested_recipe: llmSuggestion?.suggested_recipe ?? null,
      actions: [
        { id: 'add_grocery', label: 'Add groceries to shopping list' },
        { id: 'queue_meals', label: 'Queue meals for the week' },
      ],
    }

    return new Response(JSON.stringify({
      success: true,
      plan,
      trace_id: traceId,
      debug: debugRequested ? {
        trace_id: traceId,
        recipe_count: recipes.length,
        candidate_count: usableRecipes.length,
        selected_count: selected.length,
        pantry_deductions: pantryDeductions.length,
        budget_fit_score: budgetFitScore,
        waste_score: wasteScore,
        learning_preferred_count: preferredIngredientTokens.size,
        learning_avoided_count: avoidedIngredientTokens.size,
        planner_strategy: plannerStrategy,
        llm_used: llmUsed,
        elapsed_ms: Date.now() - startedAt,
      } : null,
      schema_version: 'meal_planner_v1',
    }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: (error as Error).message ?? 'meal planner failed',
      trace_id: null,
      schema_version: 'meal_planner_v1',
    }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
