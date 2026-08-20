import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, subMinutes } from 'date-fns'
import { supabase } from '../lib/supabase'

export interface RecipeMealPlanRow {
  id?: string
  recipe_id: string
  slot: 'tonight' | 'tomorrow' | 'this-week'
  planned_for?: string | null
  notes?: string | null
  created_at?: string | null
}

export interface RecipeRow {
  id: string
  name: string
  cook_time?: string | null
  servings?: string | null
  image_url?: string | null
  source_url?: string | null
  created_at?: string
  is_one_off?: boolean
}

export interface RecipeIngredientRow {
  id?: string
  recipe_id: string
  raw_text: string
  name?: string | null
  quantity?: string | null
  unit?: string | null
  sort_order?: number
}

export interface PantryItem {
  name: string
  category?: string
  on_hand_packages?: number
}

function parseCookMinutes(cookTime: string | null | undefined): number {
  if (!cookTime) return 30
  const match = cookTime.match(/(\d+)\s*m/i)
  if (match) return parseInt(match[1], 10)
  const num = parseInt(cookTime, 10)
  return Number.isFinite(num) && num > 0 ? num : 30
}

export function useTonightsKitchenMeal() {
  const queryClient = useQueryClient()
  const todayISO = format(new Date(), 'yyyy-MM-dd')

  const { data: queryData, isLoading, refetch } = useQuery({
    queryKey: ['tonights-kitchen-meal', todayISO],
    queryFn: async () => {
      // 1. Fetch today's meal plan for slot 'tonight' (or planned_for = todayISO)
      const { data: plans, error: planError } = await supabase
        .from('recipe_meal_plans')
        .select('*')
        .or(`slot.eq.tonight,planned_for.eq.${todayISO}`)
        .order('created_at', { ascending: false })
        .limit(1)

      if (planError && planError.code !== 'PGRST116') {
        console.error('Error fetching tonight meal plan:', planError)
      }

      const mealPlan: RecipeMealPlanRow | null = plans && plans.length > 0 ? plans[0] : null
      if (!mealPlan) {
        return { mealPlan: null, recipe: null, ingredients: [], pantryInventory: {} }
      }

      // 2. Fetch recipe record
      const { data: recipeData, error: recipeError } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', mealPlan.recipe_id)
        .maybeSingle()

      if (recipeError) {
        console.error('Error fetching recipe:', recipeError)
      }

      // 3. Fetch recipe ingredients
      const { data: ingredientsData } = await supabase
        .from('recipe_ingredients')
        .select('*')
        .eq('recipe_id', mealPlan.recipe_id)
        .order('sort_order', { ascending: true })

      // 4. Fetch pantry inventory from settings
      const { data: pantrySetting } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'meal_planner_pantry_inventory')
        .maybeSingle()

      const pantryInventory = (pantrySetting?.value ?? {}) as Record<string, PantryItem>

      return {
        mealPlan,
        recipe: (recipeData as RecipeRow) ?? null,
        ingredients: (ingredientsData as RecipeIngredientRow[]) ?? [],
        pantryInventory,
      }
    },
    staleTime: 30_000,
  })

  const mealPlan = queryData?.mealPlan ?? null
  const recipe = queryData?.recipe ?? null
  const ingredients = queryData?.ingredients ?? []
  const pantryInventory = queryData?.pantryInventory ?? {}

  const hasMeal = Boolean(mealPlan && recipe)

  // Compute Cook & Prep Times
  const cookMinutes = parseCookMinutes(recipe?.cook_time ?? null)
  // Target dinner time default 6:30 PM (18:30)
  const targetDate = new Date()
  targetDate.setHours(18, 30, 0, 0)
  const prepStartDate = subMinutes(targetDate, cookMinutes)

  const targetTime = '6:30 PM'
  const prepStartTime = format(prepStartDate, 'h:mm a')

  const now = new Date()
  const isPrepTimeNow = hasMeal && now >= prepStartDate && now <= targetDate
  const isDinnerPast = now.getHours() >= 20 || (now > targetDate && now.getMinutes() >= 30)

  // Compute Pantry Stock Readiness
  const missingItems: string[] = []
  if (ingredients.length > 0) {
    for (const item of ingredients) {
      const nameLower = (item.name || item.raw_text).toLowerCase().trim()
      const foundInPantry = Object.values(pantryInventory).some((p: any) => {
        const pName = (p.name || '').toLowerCase().trim()
        return pName && (nameLower.includes(pName) || pName.includes(nameLower))
      })
      if (!foundInPantry) {
        missingItems.push(item.name || item.raw_text)
      }
    }
  }

  const pantryStatus = {
    status: ingredients.length === 0 ? 'all_ready' : missingItems.length === 0 ? 'all_ready' : 'missing_items',
    missingCount: missingItems.length,
    missingItems,
  }

  // Set / Mutation Function
  const setTonightMeal = async (
    newRecipe: Partial<RecipeRow> & { name: string; ingredients?: string[]; steps?: string[] },
    saveToLibrary: boolean = false
  ) => {
    let recipeId = newRecipe.id

    // 1. If not saved or missing id, insert recipe row
    if (!recipeId) {
      const { data: createdRecipe, error: createError } = await supabase
        .from('recipes')
        .insert({
          name: newRecipe.name,
          source_type: 'manual',
          cook_time: newRecipe.cook_time || '30m',
          servings: newRecipe.servings || '4',
          image_url: newRecipe.image_url || null,
        })
        .select()
        .single()

      if (createError || !createdRecipe) {
        console.error('Failed to create recipe row:', createError)
        throw new Error(createError?.message || 'Failed to create recipe')
      }
      recipeId = createdRecipe.id

      // Insert ingredients
      if (newRecipe.ingredients && newRecipe.ingredients.length > 0) {
        const ingredientRows = newRecipe.ingredients.map((raw, idx) => ({
          recipe_id: recipeId,
          raw_text: raw,
          name: raw,
          sort_order: idx + 1,
        }))
        await supabase.from('recipe_ingredients').insert(ingredientRows)
      }

      // Insert steps
      if (newRecipe.steps && newRecipe.steps.length > 0) {
        const stepRows = newRecipe.steps.map((instruction, idx) => ({
          recipe_id: recipeId,
          step_number: idx + 1,
          instruction,
        }))
        await supabase.from('recipe_steps').insert(stepRows)
      }
    }

    // 2. Clear any existing 'tonight' slot meal plans so tonight is updated to the newly selected dinner
    await supabase.from('recipe_meal_plans').delete().eq('slot', 'tonight')

    // 3. Insert into recipe_meal_plans
    const { error: planError } = await supabase
      .from('recipe_meal_plans')
      .insert({
        recipe_id: recipeId,
        slot: 'tonight',
        planned_for: todayISO,
        notes: saveToLibrary ? 'saved_to_library' : 'ephemeral_one_off',
      })

    if (planError) {
      console.error('Error inserting recipe_meal_plans:', planError)
      throw planError
    }

    await queryClient.invalidateQueries({ queryKey: ['tonights-kitchen-meal'] })
    await queryClient.invalidateQueries({ queryKey: ['cook-page-meal-plans'] })
    await refetch()
  }

  const markCompleted = async () => {
    if (!mealPlan) return
    const { error } = await supabase
      .from('recipe_meal_plans')
      .update({ notes: 'completed' })
      .eq('slot', 'tonight')
    if (error) console.error('Error marking dinner completed:', error)
    await queryClient.invalidateQueries({ queryKey: ['tonights-kitchen-meal'] })
    await refetch()
  }

  const addMissingToGroceryList = async () => {
    if (missingItems.length === 0) return
    const { data: defaultList } = await supabase
      .from('grocery_lists')
      .select('id')
      .limit(1)
      .maybeSingle()

    const listId = defaultList?.id
    if (!listId) return

    const rows = missingItems.map((item) => ({
      list_id: listId,
      name: item,
      category: 'other',
      purchased: false,
    }))

    await supabase.from('grocery_items').insert(rows)
    await queryClient.invalidateQueries({ queryKey: ['grocery-list'] })
  }

  return {
    isLoading,
    hasMeal,
    mealPlan,
    recipe,
    ingredients,
    cookMinutes,
    targetTime,
    prepStartTime,
    isPrepTimeNow,
    isDinnerPast: isDinnerPast || mealPlan?.notes === 'completed',
    isCompleted: mealPlan?.notes === 'completed',
    pantryStatus,
    setTonightMeal,
    markCompleted,
    addMissingToGroceryList,
    refetch,
  }
}
