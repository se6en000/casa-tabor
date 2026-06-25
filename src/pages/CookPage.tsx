import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChefHat, ChevronLeft, ChevronRight, ExternalLink, ShoppingCart } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'

type Recipe = {
  id: string
  name: string
  source_url: string | null
  image_url: string | null
  servings: string | null
  cook_time: string | null
  last_used_at: string | null
  created_at: string
}

type RecipeStep = {
  recipe_id: string
  step_number: number
  instruction: string
}

type RecipeIngredient = {
  recipe_id: string
  raw_text: string
  name: string | null
  quantity: string | null
  unit: string | null
  sort_order: number
}

type RecipeMealPlan = {
  recipe_id: string
  slot: 'tonight' | 'tomorrow' | 'this-week'
}

const SLOT_LABELS: Record<RecipeMealPlan['slot'], string> = {
  tonight: 'Tonight',
  tomorrow: 'Tomorrow',
  'this-week': 'This week',
}

function scaleQuantityValue(value: string | null, scale: number): string | null {
  if (!value) return value
  const trimmed = value.trim()
  if (!trimmed) return value
  if (Math.abs(scale - 1) < 0.0001) return trimmed
  const replacedFractions = trimmed
    .replace(/\b½\b/g, ' 1/2 ')
    .replace(/\b¼\b/g, ' 1/4 ')
    .replace(/\b¾\b/g, ' 3/4 ')
  const mixed = replacedFractions.match(/^\s*(\d+)\s+(\d+)\/(\d+)\s*$/)
  const fractionOnly = replacedFractions.match(/^\s*(\d+)\/(\d+)\s*$/)
  const decimalOrInt = replacedFractions.match(/^\s*(\d+(?:\.\d+)?)\s*$/)
  let base = Number.NaN
  if (mixed) {
    const whole = Number(mixed[1] ?? 0)
    const fracNum = Number(mixed[2] ?? 0)
    const fracDen = Number(mixed[3] ?? 1)
    base = whole + (fracDen > 0 ? fracNum / fracDen : 0)
  } else if (fractionOnly) {
    const fracNum = Number(fractionOnly[1] ?? 0)
    const fracDen = Number(fractionOnly[2] ?? 1)
    base = fracDen > 0 ? fracNum / fracDen : Number.NaN
  } else if (decimalOrInt) {
    base = Number(decimalOrInt[1] ?? Number.NaN)
  }
  if (!Number.isFinite(base)) return trimmed
  const scaled = base * scale
  if (scaled === 0) return '0'
  if (scaled >= 1 && Math.abs(Math.round(scaled) - scaled) < 0.05) {
    return String(Math.max(1, Math.round(scaled)))
  }
  return Number(scaled.toFixed(scaled < 1 ? 2 : 1)).toString()
}

function pickRecipeThumb(recipe: Recipe): string | null {
  if (recipe.image_url) return recipe.image_url
  const source = recipe.source_url?.trim()
  if (!source) return null
  if (/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(source)) return source
  return null
}

export default function CookPage() {
  const navigate = useNavigate()
  const [cookRecipeId, setCookRecipeId] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [recipeScale, setRecipeScale] = useState(1)
  const [showCupsConversion, setShowCupsConversion] = useState(false)
  const [directionsViewMode, setDirectionsViewMode] = useState<'step' | 'all'>('step')

  const { data: recipes = [] } = useQuery({
    queryKey: ['cook-page-recipes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id,name,source_url,image_url,servings,cook_time,last_used_at,created_at')
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as Recipe[]
    },
    staleTime: 60_000,
  })

  const { data: ingredients = [] } = useQuery({
    queryKey: ['cook-page-recipe-ingredients', recipes.map((r) => r.id).join(',')],
    enabled: recipes.length > 0,
    queryFn: async () => {
      const ids = recipes.map((row) => row.id)
      const { data, error } = await supabase
        .from('recipe_ingredients')
        .select('recipe_id,raw_text,name,quantity,unit,sort_order')
        .in('recipe_id', ids)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as RecipeIngredient[]
    },
    staleTime: 60_000,
  })

  const { data: steps = [] } = useQuery({
    queryKey: ['cook-page-recipe-steps', recipes.map((r) => r.id).join(',')],
    enabled: recipes.length > 0,
    queryFn: async () => {
      const ids = recipes.map((row) => row.id)
      const { data, error } = await supabase
        .from('recipe_steps')
        .select('recipe_id,step_number,instruction')
        .in('recipe_id', ids)
        .order('step_number', { ascending: true })
      if (error) throw error
      return (data ?? []) as RecipeStep[]
    },
    staleTime: 60_000,
  })

  const { data: mealPlans = [] } = useQuery({
    queryKey: ['cook-page-meal-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_meal_plans')
        .select('recipe_id,slot')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as RecipeMealPlan[]
    },
    staleTime: 60_000,
  })

  const recipeById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes])
  const stepsByRecipe = useMemo(() => {
    const map = new Map<string, RecipeStep[]>()
    for (const step of steps) {
      const bucket = map.get(step.recipe_id) ?? []
      bucket.push(step)
      map.set(step.recipe_id, bucket)
    }
    return map
  }, [steps])
  const ingredientsByRecipe = useMemo(() => {
    const map = new Map<string, RecipeIngredient[]>()
    for (const ingredient of ingredients) {
      const bucket = map.get(ingredient.recipe_id) ?? []
      bucket.push(ingredient)
      map.set(ingredient.recipe_id, bucket)
    }
    return map
  }, [ingredients])
  const plannedRecipes = mealPlans
    .map((plan) => ({ plan, recipe: recipeById.get(plan.recipe_id) }))
    .filter((row): row is { plan: RecipeMealPlan; recipe: Recipe } => Boolean(row.recipe))

  const cookRecipe = cookRecipeId ? recipeById.get(cookRecipeId) ?? null : null
  const cookSteps = cookRecipeId ? stepsByRecipe.get(cookRecipeId) ?? [] : []
  const cookIngredients = cookRecipeId ? ingredientsByRecipe.get(cookRecipeId) ?? [] : []
  const currentStep = cookSteps[stepIndex] ?? null

  const densityForIngredient = (ingredientName: string): number => {
    const name = ingredientName.toLowerCase()
    if (name.includes('rice')) return 195
    if (name.includes('corn')) return 165
    if (name.includes('pea')) return 145
    if (name.includes('carrot')) return 128
    if (name.includes('shrimp')) return 145
    if (name.includes('soy sauce')) return 255
    return 236.588
  }

  const gramsToCupsLabel = (grams: number, ingredientName: string): string => {
    const cups = grams / densityForIngredient(ingredientName)
    const rounded = cups < 1 ? Number(cups.toFixed(2)) : Number(cups.toFixed(1))
    return `${rounded} cup${rounded === 1 ? '' : 's'}`
  }

  const quantityLabel = (ingredient: RecipeIngredient): string => {
    const scaledQuantity = scaleQuantityValue(ingredient.quantity, recipeScale)
    const unit = (ingredient.unit ?? '').toLowerCase().trim()
    if (!scaledQuantity) return ingredient.unit ?? ''
    if (!showCupsConversion) {
      return `${scaledQuantity}${ingredient.unit ? ` ${ingredient.unit}` : ''}`.trim()
    }
    if (unit === 'g' || unit === 'gram' || unit === 'grams') {
      const numeric = Number(scaledQuantity)
      if (Number.isFinite(numeric)) {
        return gramsToCupsLabel(numeric, ingredient.name || ingredient.raw_text)
      }
    }
    return `${scaledQuantity}${ingredient.unit ? ` ${ingredient.unit}` : ''}`.trim()
  }

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6 space-y-4">
      <div className="rounded-2xl border border-casa-border bg-casa-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-title font-semibold text-casa-navy">Cooking</p>
            <p className="text-body-sm text-casa-muted">Plan meals, open recipes, and jump to grocery prep.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/grocery')}
            className="px-3 py-2 rounded-button border border-casa-border text-body-sm font-semibold text-casa-navy hover:bg-casa-main transition-colors inline-flex items-center gap-2"
          >
            <ShoppingCart size={14} />
            Grocery planner
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-casa-border bg-casa-surface p-4">
        <p className="text-body-sm font-semibold text-casa-navy mb-2">Planned meals</p>
        {plannedRecipes.length === 0 ? (
          <p className="text-body-sm text-casa-muted">No meal slots yet. Plan recipes from Grocery → Saved recipes.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {plannedRecipes.slice(0, 8).map(({ plan, recipe }) => (
              <div key={`${plan.slot}-${recipe.id}`} className="rounded-xl border border-casa-border bg-casa-bg px-3 py-2">
                <p className="text-[11px] text-casa-muted">{SLOT_LABELS[plan.slot]}</p>
                <p className="text-body-sm font-semibold text-casa-navy">{recipe.name}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-casa-border bg-casa-surface p-4">
        <p className="text-body-sm font-semibold text-casa-navy mb-2">Recipe library</p>
        <div className="space-y-2">
          {recipes.slice(0, 24).map((recipe) => (
            <div key={recipe.id} className="rounded-xl border border-casa-border bg-casa-bg px-3 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {pickRecipeThumb(recipe) && (
                  <img
                    src={pickRecipeThumb(recipe) ?? ''}
                    alt={recipe.name}
                    className="w-10 h-10 rounded-lg object-cover border border-casa-border bg-casa-surface flex-shrink-0"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0">
                <p className="text-body-sm font-semibold text-casa-navy">{recipe.name}</p>
                <p className="text-[11px] text-casa-muted">
                  {recipe.cook_time ? `${recipe.cook_time} · ` : ''}
                  {recipe.servings ?? 'servings n/a'}
                </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCookRecipeId(recipe.id)
                  setStepIndex(0)
                  setRecipeScale(1)
                  setDirectionsViewMode('step')
                }}
                className="px-2.5 py-1 rounded-pill border border-casa-gold/40 bg-casa-gold/10 text-[11px] font-medium text-casa-navy hover:bg-casa-gold/15 transition-colors inline-flex items-center gap-1"
              >
                <ChefHat size={12} />
                Cook
              </button>
            </div>
          ))}
        </div>
      </div>

      {cookRecipe && (
        <div className="fixed inset-0 z-[70] bg-casa-navy/30">
          <div className="absolute right-4 top-4 bottom-4 w-[min(38rem,calc(100vw-2rem))] rounded-2xl border border-casa-border bg-casa-surface shadow-modal flex flex-col">
            <div className="px-4 py-3 border-b border-casa-divider flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                {pickRecipeThumb(cookRecipe) && (
                  <img
                    src={pickRecipeThumb(cookRecipe) ?? ''}
                    alt={cookRecipe.name}
                    className="w-12 h-12 rounded-lg object-cover border border-casa-border bg-casa-bg flex-shrink-0"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-body font-semibold text-casa-navy truncate">{cookRecipe.name}</p>
                  <p className="text-[11px] text-casa-muted">Step {stepIndex + 1} of {Math.max(1, cookSteps.length)}</p>
                </div>
              </div>
              {cookRecipe.source_url && (
                <a href={cookRecipe.source_url} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-button border border-casa-border text-[11px] text-casa-muted hover:bg-casa-main inline-flex items-center gap-1">
                  <ExternalLink size={12} />
                  Original
                </a>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="rounded-xl border border-casa-border bg-casa-bg overflow-hidden">
                <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-body font-semibold text-casa-navy">Ingredients</p>
                    <p className="text-[11px] text-casa-muted">{cookIngredients.length} items</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowCupsConversion((current) => !current)}
                      className={cn(
                        'px-2 py-1 rounded-pill border text-[10px] transition-colors',
                        showCupsConversion
                          ? 'border-casa-gold/50 bg-casa-gold/10 text-casa-navy'
                          : 'border-casa-border text-casa-muted hover:bg-casa-surface'
                      )}
                    >
                      {showCupsConversion ? 'Show grams' : 'g → cups'}
                    </button>
                    {[0.5, 1, 2].map((scale) => (
                      <button
                        key={scale}
                        type="button"
                        onClick={() => setRecipeScale(scale)}
                        className={cn(
                          'px-2 py-1 rounded-pill border text-[10px] transition-colors',
                          Math.abs(recipeScale - scale) < 0.001
                            ? 'border-casa-gold/50 bg-casa-gold/10 text-casa-navy'
                            : 'border-casa-border text-casa-muted hover:bg-casa-surface'
                        )}
                      >
                        {scale}x
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  className="h-2.5 w-full"
                  style={{ backgroundColor: 'var(--color-family-liv)' }}
                  aria-hidden
                />
                <div className="p-4">
                {cookIngredients.length === 0 ? (
                  <p className="text-body-sm text-casa-muted">No ingredient breakdown saved for this recipe.</p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {cookIngredients.map((ingredient, index) => {
                      const name = ingredient.name || ingredient.raw_text
                      const qty = quantityLabel(ingredient)
                      return (
                        <div key={`${ingredient.recipe_id}-${index}`} className="flex items-center justify-between gap-3 text-body">
                          <span className="text-casa-text font-medium">{name}</span>
                          <span className="text-casa-muted whitespace-nowrap">
                            {qty}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
                </div>
              </div>

              <div className="rounded-xl border border-casa-border bg-casa-bg overflow-hidden">
                <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-body font-semibold text-casa-navy">Directions</p>
                    <p className="text-[11px] text-casa-muted">
                      {directionsViewMode === 'step'
                        ? `Step ${stepIndex + 1} of ${Math.max(1, cookSteps.length)}`
                        : `${cookSteps.length} steps`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setDirectionsViewMode('step')}
                      className={cn(
                        'px-2 py-1 rounded-pill border text-[10px] transition-colors',
                        directionsViewMode === 'step'
                          ? 'border-casa-gold/50 bg-casa-gold/10 text-casa-navy'
                          : 'border-casa-border text-casa-muted hover:bg-casa-surface'
                      )}
                    >
                      Step-by-step
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirectionsViewMode('all')}
                      className={cn(
                        'px-2 py-1 rounded-pill border text-[10px] transition-colors',
                        directionsViewMode === 'all'
                          ? 'border-casa-gold/50 bg-casa-gold/10 text-casa-navy'
                          : 'border-casa-border text-casa-muted hover:bg-casa-surface'
                      )}
                    >
                      All steps
                    </button>
                  </div>
                </div>
                <div
                  className="h-2.5 w-full"
                  style={{ backgroundColor: 'var(--color-casa-gold)' }}
                  aria-hidden
                />
                <div className="p-4">
                  {directionsViewMode === 'step' ? (
                    <p className="text-body text-casa-text leading-relaxed">{currentStep?.instruction ?? 'No directions saved for this recipe yet.'}</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {(cookSteps.length > 0 ? cookSteps : [{ step_number: 1, instruction: 'No directions saved for this recipe yet.' }]).map((step, index) => {
                        const headerColors = [
                          'var(--color-family-liv)',
                          'var(--color-family-emme)',
                          'var(--color-family-jake)',
                          'var(--color-family-kelly)',
                          'var(--color-family-owen)',
                          'var(--color-casa-gold)',
                        ]
                        return (
                          <div key={`${step.step_number}-${index}`} className="rounded-lg border border-casa-border bg-casa-surface overflow-hidden">
                            <div className="px-3 py-2 flex items-center justify-between" style={{ backgroundColor: `${headerColors[index % headerColors.length]}22` }}>
                              <p className="text-[11px] font-semibold text-casa-navy">Step {step.step_number}</p>
                            </div>
                            <div
                              className="h-1.5 w-full"
                              style={{ backgroundColor: headerColors[index % headerColors.length] }}
                              aria-hidden
                            />
                            <p className="p-3 text-body-sm text-casa-text leading-relaxed">{step.instruction}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-casa-divider flex items-center justify-between">
              <button type="button" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={directionsViewMode === 'all' || stepIndex <= 0} className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted disabled:opacity-50 inline-flex items-center gap-1">
                <ChevronLeft size={14} />
                Prev
              </button>
              <button type="button" onClick={() => setCookRecipeId(null)} className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted hover:bg-casa-main">Close</button>
              <button type="button" onClick={() => setStepIndex((current) => Math.min(Math.max(0, cookSteps.length - 1), current + 1))} disabled={directionsViewMode === 'all' || stepIndex >= cookSteps.length - 1} className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted disabled:opacity-50 inline-flex items-center gap-1">
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
