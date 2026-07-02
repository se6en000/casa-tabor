export type FoodProfile = {
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

export const DEFAULT_FOOD_PROFILE: FoodProfile = {
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

function toFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function toCleanText(value: unknown, maxLen = 500): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

export function normalizeFoodProfile(raw: unknown): FoodProfile {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    householdSize: toFiniteNumber(row.householdSize, DEFAULT_FOOD_PROFILE.householdSize, 1, 12),
    weeklyBudgetUsd: toFiniteNumber(row.weeklyBudgetUsd, DEFAULT_FOOD_PROFILE.weeklyBudgetUsd, 20, 2000),
    defaultMealsPerWeek: toFiniteNumber(row.defaultMealsPerWeek, DEFAULT_FOOD_PROFILE.defaultMealsPerWeek, 1, 14),
    weeknightMaxMinutes: toFiniteNumber(row.weeknightMaxMinutes, DEFAULT_FOOD_PROFILE.weeknightMaxMinutes, 10, 180),
    dietaryRules: toCleanText(row.dietaryRules),
    allergies: toCleanText(row.allergies),
    dislikedFoods: toCleanText(row.dislikedFoods),
    preferredCuisines: toCleanText(row.preferredCuisines),
    pantryStaples: toCleanText(row.pantryStaples, 1000),
    preferredProteins: toCleanText(row.preferredProteins),
  }
}
