import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChefHat, ChevronLeft, ChevronRight, ExternalLink, ShoppingCart } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Recipe = {
  id: string
  name: string
  source_url: string | null
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

type RecipeMealPlan = {
  recipe_id: string
  slot: 'tonight' | 'tomorrow' | 'this-week'
}

const SLOT_LABELS: Record<RecipeMealPlan['slot'], string> = {
  tonight: 'Tonight',
  tomorrow: 'Tomorrow',
  'this-week': 'This week',
}

export default function CookPage() {
  const navigate = useNavigate()
  const [cookRecipeId, setCookRecipeId] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)

  const { data: recipes = [] } = useQuery({
    queryKey: ['cook-page-recipes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id,name,source_url,servings,cook_time,last_used_at,created_at')
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as Recipe[]
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
  const plannedRecipes = mealPlans
    .map((plan) => ({ plan, recipe: recipeById.get(plan.recipe_id) }))
    .filter((row): row is { plan: RecipeMealPlan; recipe: Recipe } => Boolean(row.recipe))

  const cookRecipe = cookRecipeId ? recipeById.get(cookRecipeId) ?? null : null
  const cookSteps = cookRecipeId ? stepsByRecipe.get(cookRecipeId) ?? [] : []
  const currentStep = cookSteps[stepIndex] ?? null

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
              <div>
                <p className="text-body-sm font-semibold text-casa-navy">{recipe.name}</p>
                <p className="text-[11px] text-casa-muted">
                  {recipe.cook_time ? `${recipe.cook_time} · ` : ''}
                  {recipe.servings ?? 'servings n/a'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCookRecipeId(recipe.id)
                  setStepIndex(0)
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
              <div>
                <p className="text-body font-semibold text-casa-navy">{cookRecipe.name}</p>
                <p className="text-[11px] text-casa-muted">Step {stepIndex + 1} of {Math.max(1, cookSteps.length)}</p>
              </div>
              {cookRecipe.source_url && (
                <a href={cookRecipe.source_url} target="_blank" rel="noreferrer" className="px-2 py-1 rounded-button border border-casa-border text-[11px] text-casa-muted hover:bg-casa-main inline-flex items-center gap-1">
                  <ExternalLink size={12} />
                  Original
                </a>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-body text-casa-text">{currentStep?.instruction ?? 'No directions saved for this recipe yet.'}</p>
            </div>
            <div className="px-4 py-3 border-t border-casa-divider flex items-center justify-between">
              <button type="button" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={stepIndex <= 0} className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted disabled:opacity-50 inline-flex items-center gap-1">
                <ChevronLeft size={14} />
                Prev
              </button>
              <button type="button" onClick={() => setCookRecipeId(null)} className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted hover:bg-casa-main">Close</button>
              <button type="button" onClick={() => setStepIndex((current) => Math.min(Math.max(0, cookSteps.length - 1), current + 1))} disabled={stepIndex >= cookSteps.length - 1} className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted disabled:opacity-50 inline-flex items-center gap-1">
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
