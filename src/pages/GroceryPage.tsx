import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShoppingCart, Trash2, CheckSquare, Square, X, Plus, RefreshCw, Mic, GripVertical, Link2, Upload, BookOpen, ChefHat, ChevronLeft, ChevronRight, Clock3, ExternalLink } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '../utils/cn'
import { useGroceryList, GROCERY_CATEGORIES, type GroceryItem } from '../hooks/useGroceryList'
import { inferCategoryFromName } from '../utils/groceryCategorization'
import { supabase } from '../lib/supabase'

const SYNC_CURSOR_KEY = 'grocery-sync-cursor-v1'
const SYNC_LAST_AT_KEY = 'grocery-sync-last-at-v1'
const SYNC_LAST_SUMMARY_KEY = 'grocery-sync-last-summary-v1'
const AUTO_SYNC_INTERVAL_MS = 45_000
const CLEAN_SYNC_BATCH_SIZE = 60
const QUICK_ADD_TOUCH_ITEMS = ['Milk', 'Eggs', 'Bread', 'Bananas', 'Chicken', 'Coffee']
const CHECKED_ITEM_DISMISS_MS = 1_500
const CHECKED_ITEM_EXIT_ANIMATION_MS = 320
const LOW_CONFIDENCE_REVIEW_THRESHOLD = 0.82
const SMART_BUNDLES: Array<{ name: string; items: string[] }> = [
  { name: 'Taco Night', items: ['Ground Beef', 'Tortillas', 'Cheddar Cheese', 'Salsa', 'Lettuce'] },
  { name: 'Breakfast Restock', items: ['Eggs', 'Milk', 'Bread', 'Bananas', 'Coffee'] },
  { name: 'Pasta Dinner', items: ['Pasta', 'Marinara Sauce', 'Parmesan', 'Garlic Bread'] },
]
const STORE_SECTION_ORDER: Record<string, number> = {
  'Produce': 10,
  'Bakery': 20,
  'Dairy': 30,
  'Meat & Seafood': 40,
  'Frozen': 50,
  'Pantry': 60,
  'Beverages': 70,
  'Snacks': 80,
  'Deli & Prepared': 90,
  'Household': 100,
  'Personal Care': 110,
  'Baby': 120,
  'Pet': 130,
  'Other': 140,
}
const CATEGORY_ACCENT_BY_KEY: Record<string, string> = {
  produce: 'var(--color-family-liv)',
  dairy: 'var(--color-family-emme)',
  meat: 'var(--color-family-kelly)',
  bakery: 'var(--color-family-owen)',
  frozen: 'var(--color-family-jake)',
  pantry: 'var(--color-family-kelly)',
  beverages: 'var(--color-family-jake)',
  snacks: 'var(--color-family-emme)',
  deli: 'var(--color-family-owen)',
  household: 'var(--color-family-jake)',
  'personal-care': 'var(--color-family-emme)',
  baby: 'var(--color-family-liv)',
  pet: 'var(--color-family-kelly)',
  other: 'var(--color-casa-gold)',
}
const RECIPE_MEAL_SLOTS: Array<{ slot: RecipeMealPlanSlot; label: string }> = [
  { slot: 'tonight', label: 'Tonight' },
  { slot: 'tomorrow', label: 'Tomorrow' },
  { slot: 'this-week', label: 'This week' },
]

type HistoricalGroceryEvent = {
  name: string
  category: string
  checked: boolean
  updated_at: string
  deleted_at: string | null
}

type RecipeDraftIngredient = {
  raw_text: string
  name: string | null
  quantity: string | null
  unit: string | null
  optional: boolean
}

type RecipeDraftStep = {
  step_number: number
  instruction: string
}

type RecipeDraft = {
  name: string
  servings: string | null
  cook_time: string | null
  confidence: number
  source_type: 'url' | 'image' | 'pdf'
  source_url: string | null
  ingredients: RecipeDraftIngredient[]
  steps: RecipeDraftStep[]
}

type RecipePreset = {
  id: string
  name: string
  source_type: 'url' | 'image' | 'pdf' | 'manual'
  source_url: string | null
  servings: string | null
  cook_time: string | null
  last_used_at: string | null
  created_at: string
  ingredients: RecipeDraftIngredient[]
  steps: RecipeDraftStep[]
}

type RecipeMealPlanSlot = 'tonight' | 'tomorrow' | 'this-week'

type RecipeMealPlan = {
  id: string
  recipe_id: string
  slot: RecipeMealPlanSlot
  planned_for: string | null
  notes: string | null
}

function detectCategory(name: string): string {
  return inferCategoryFromName(name)
}

function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function extractTimerOptions(instruction: string): Array<{ label: string; seconds: number }> {
  const options: Array<{ label: string; seconds: number }> = []
  const regex = /(\d+)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(instruction)) !== null) {
    const value = Number(match[1] ?? 0)
    const unit = String(match[2] ?? '').toLowerCase()
    if (!Number.isFinite(value) || value <= 0) continue
    let seconds = 0
    if (unit.startsWith('h')) seconds = value * 3600
    else if (unit.startsWith('m')) seconds = value * 60
    else seconds = value
    if (seconds <= 0) continue
    options.push({
      label: `${value} ${unit.startsWith('h') ? 'hr' : unit.startsWith('m') ? 'min' : 'sec'}`,
      seconds,
    })
  }
  return options.slice(0, 3)
}

function formatTimer(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const h = Math.floor(safeSeconds / 3600)
  const m = Math.floor((safeSeconds % 3600) / 60)
  const s = safeSeconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
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
  const numeric = replacedFractions.match(/^\s*(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?\s*$/)
  if (!numeric) return trimmed
  const whole = Number(numeric[1] ?? 0)
  const fracNum = Number(numeric[2] ?? 0)
  const fracDen = Number(numeric[3] ?? 1)
  const base = whole + (fracDen > 0 ? fracNum / fracDen : 0)
  if (!Number.isFinite(base)) return trimmed
  const scaled = base * scale
  if (scaled === 0) return '0'
  if (scaled >= 1 && Math.abs(Math.round(scaled) - scaled) < 0.05) {
    return String(Math.max(1, Math.round(scaled)))
  }
  return Number(scaled.toFixed(scaled < 1 ? 2 : 1)).toString()
}

function compareNullableText(a: string | null, b: string | null): number {
  const left = (a ?? '').trim().toLowerCase()
  const right = (b ?? '').trim().toLowerCase()
  return left.localeCompare(right)
}

function getStoreSectionRank(storeSection: string | null): number {
  if (!storeSection) return 999
  return STORE_SECTION_ORDER[storeSection] ?? 999
}

function sortItemsForShopping(items: GroceryItem[]): GroceryItem[] {
  return [...items].sort((a, b) => {
    const sectionDelta = getStoreSectionRank(a.store_section) - getStoreSectionRank(b.store_section)
    if (sectionDelta !== 0) return sectionDelta

    const subcategoryDelta = compareNullableText(a.subcategory, b.subcategory)
    if (subcategoryDelta !== 0) return subcategoryDelta

    const brandDelta = compareNullableText(a.brand, b.brand)
    if (brandDelta !== 0) return brandDelta

    return a.name.localeCompare(b.name)
  })
}

function ItemRow({ item, onToggle, onDelete, dismissPhase = 'none', isDragging = false, isSpotlighted = false, isReviewing = false, onRequestReview, onChooseReviewCategory, onDismissReview, onMovePointerDown, onMovePointerMove, onMovePointerUp, onMovePointerCancel }: {
  item: GroceryItem
  onToggle: (id: string, checked: boolean) => void
  onDelete: (id: string) => void
  dismissPhase?: 'none' | 'queued' | 'exiting'
  isDragging?: boolean
  isSpotlighted?: boolean
  isReviewing?: boolean
  onRequestReview?: (id: string) => void
  onChooseReviewCategory?: (id: string, category: string) => void
  onDismissReview?: () => void
  onMovePointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void
  onMovePointerMove?: (e: React.PointerEvent<HTMLButtonElement>) => void
  onMovePointerUp?: (e: React.PointerEvent<HTMLButtonElement>) => void
  onMovePointerCancel?: (e: React.PointerEvent<HTMLButtonElement>) => void
}) {
  const visualChecked = item.checked || dismissPhase !== 'none'
  const needsConfidenceReview =
    !item.checked &&
    typeof item.enhancement_confidence === 'number' &&
    item.enhancement_confidence < LOW_CONFIDENCE_REVIEW_THRESHOLD

  return (
    <div className={cn(
      'flex items-center gap-3 px-4 py-3 hover:bg-casa-bg/50 transition-all duration-300 ease-out group will-change-transform',
      visualChecked && 'opacity-50',
      dismissPhase === 'queued' && 'bg-casa-gold/5',
      dismissPhase === 'exiting' && 'opacity-0 translate-y-1 scale-[0.985] max-h-0 py-0',
      isDragging && 'opacity-30',
      isSpotlighted && 'ring-2 ring-casa-gold/60 bg-casa-gold/10',
    )}>
      {onMovePointerDown && (
        <button
          type="button"
          onPointerDown={onMovePointerDown}
          onPointerMove={onMovePointerMove}
          onPointerUp={onMovePointerUp}
          onPointerCancel={onMovePointerCancel}
          className="flex-shrink-0 text-casa-muted hover:text-casa-navy transition-colors touch-none"
          aria-label={`Move ${item.name}`}
        >
          <GripVertical size={18} />
        </button>
      )}
      <button
        type="button"
        onClick={() => onToggle(item.id, !visualChecked)}
        className="flex-shrink-0 text-casa-navy/60 hover:text-casa-gold transition-colors"
      >
        {visualChecked
          ? <CheckSquare size={20} className="text-emerald-500" />
          : <Square size={20} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className={cn(
              'text-body font-medium text-casa-text',
              visualChecked && 'line-through text-casa-muted'
            )}>
              {item.name}
            </span>
            {(item.quantity || item.unit) && (
              <span className="ml-2 text-caption text-casa-muted">
                {item.quantity}{item.unit ? ' ' + item.unit : ''}
              </span>
            )}
          </div>
          {needsConfidenceReview && (
            <button
              type="button"
              onClick={() => onRequestReview?.(item.id)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 transition-colors"
            >
              Review match ({Math.round((item.enhancement_confidence ?? 0) * 100)}%)
            </button>
          )}
        </div>
        {(item.store_section || item.subcategory || item.brand) && (
          <p className="text-[11px] text-casa-muted mt-0.5">
            {[item.store_section, item.subcategory, item.brand].filter(Boolean).join(' · ')}
          </p>
        )}
        {isReviewing && (
          <div className="mt-2 rounded-xl border border-casa-border bg-casa-bg px-2.5 py-2">
            <p className="text-[11px] text-casa-muted mb-1">Quick recategorize</p>
            <div className="flex flex-wrap gap-1.5">
              {GROCERY_CATEGORIES.map((category) => (
                <button
                  key={`${item.id}-${category.key}`}
                  type="button"
                  onClick={() => onChooseReviewCategory?.(item.id, category.key)}
                  className={cn(
                    'px-2 py-1 rounded-full border text-[11px] transition-colors',
                    item.category === category.key
                      ? 'border-casa-gold bg-casa-gold/15 text-casa-navy'
                      : 'border-casa-border bg-casa-surface text-casa-muted hover:bg-casa-main'
                  )}
                >
                  {category.label}
                </button>
              ))}
              <button
                type="button"
                onClick={onDismissReview}
                className="px-2 py-1 rounded-full border border-casa-border text-[11px] text-casa-muted hover:bg-casa-main transition-colors"
              >
                Looks right
              </button>
            </div>
          </div>
        )}
        {item.notes && (
          <p className="text-caption text-casa-muted truncate mt-0.5">{item.notes}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className="opacity-70 lg:opacity-0 lg:group-hover:opacity-100 flex-shrink-0 text-casa-muted hover:text-red-500 transition-all"
      >
        <X size={15} />
      </button>
    </div>
  )
}

export default function GroceryPage() {
  const {
    items,
    defaultListId,
    uncheckedCount,
    checkedCount,
    isLoading,
    addItem,
    toggleItem,
    deleteItem,
    updateItemCategory,
    clearChecked,
  } = useGroceryList()

  const { data: historyRows = [] } = useQuery({
    queryKey: ['grocery-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grocery_items')
        .select('name, category, checked, updated_at, deleted_at')
        .gte('updated_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
        .order('updated_at', { ascending: false })
        .limit(4000)
      if (error) throw error
      return (data ?? []) as HistoricalGroceryEvent[]
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  })

  const { data: recipeLibrary = [], refetch: refetchRecipeLibrary } = useQuery({
    queryKey: ['recipe-library'],
    queryFn: async () => {
      const { data: recipes, error: recipesError } = await supabase
        .from('recipes')
        .select('id,name,source_type,source_url,servings,cook_time,last_used_at,created_at')
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(100)
      if (recipesError) throw recipesError
      const recipeRows = (recipes ?? []) as Array<{
        id: string
        name: string
        source_type: 'url' | 'image' | 'pdf' | 'manual'
        source_url: string | null
        servings: string | null
        cook_time: string | null
        last_used_at: string | null
        created_at: string
      }>
      if (recipeRows.length === 0) return [] as RecipePreset[]

      const ids = recipeRows.map((row) => row.id)
      const [{ data: ingredientRows, error: ingredientsError }, { data: stepRows, error: stepsError }] = await Promise.all([
        supabase
          .from('recipe_ingredients')
          .select('recipe_id,raw_text,name,quantity,unit,optional,sort_order')
          .in('recipe_id', ids)
          .order('sort_order', { ascending: true }),
        supabase
          .from('recipe_steps')
          .select('recipe_id,step_number,instruction')
          .in('recipe_id', ids)
          .order('step_number', { ascending: true }),
      ])
      if (ingredientsError) throw ingredientsError
      if (stepsError) throw stepsError

      const ingredientsByRecipe = new Map<string, RecipeDraftIngredient[]>()
      for (const row of (ingredientRows ?? []) as Array<{
        recipe_id: string
        raw_text: string
        name: string | null
        quantity: string | null
        unit: string | null
        optional: boolean
        sort_order: number
      }>) {
        const bucket = ingredientsByRecipe.get(row.recipe_id) ?? []
        bucket.push({
          raw_text: row.raw_text,
          name: row.name,
          quantity: row.quantity,
          unit: row.unit,
          optional: Boolean(row.optional),
        })
        ingredientsByRecipe.set(row.recipe_id, bucket)
      }

      const stepsByRecipe = new Map<string, RecipeDraftStep[]>()
      for (const row of (stepRows ?? []) as Array<{
        recipe_id: string
        step_number: number
        instruction: string
      }>) {
        const bucket = stepsByRecipe.get(row.recipe_id) ?? []
        bucket.push({
          step_number: Number(row.step_number ?? bucket.length + 1),
          instruction: String(row.instruction ?? '').trim(),
        })
        stepsByRecipe.set(row.recipe_id, bucket)
      }

      return recipeRows.map((row) => ({
        ...row,
        ingredients: ingredientsByRecipe.get(row.id) ?? [],
        steps: stepsByRecipe.get(row.id) ?? [],
      }))
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  })

  const { data: recipeMealPlans = [], refetch: refetchMealPlans } = useQuery({
    queryKey: ['recipe-meal-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_meal_plans')
        .select('id,recipe_id,slot,planned_for,notes')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as RecipeMealPlan[]
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  })

  const [inputValue, setInputValue] = useState('')
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false)
  const [addPanelMode, setAddPanelMode] = useState<'quick' | 'recipe' | 'library'>('quick')
  const [recipeUrlInput, setRecipeUrlInput] = useState('')
  const [recipeImporting, setRecipeImporting] = useState(false)
  const [recipeImportError, setRecipeImportError] = useState<string | null>(null)
  const [parsedRecipe, setParsedRecipe] = useState<RecipeDraft | null>(null)
  const [selectedRecipeIngredientIndexes, setSelectedRecipeIngredientIndexes] = useState<Set<number>>(new Set())
  const [savingRecipe, setSavingRecipe] = useState(false)
  const [recipeScale, setRecipeScale] = useState(1)
  const [cookView, setCookView] = useState<{ recipe: RecipePreset; stepIndex: number } | null>(null)
  const [cookTimer, setCookTimer] = useState<{ totalSeconds: number; remainingSeconds: number; label: string } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => localStorage.getItem(SYNC_LAST_AT_KEY))
  const [lastSyncSummary, setLastSyncSummary] = useState<string>(() => localStorage.getItem(SYNC_LAST_SUMMARY_KEY) ?? 'Not synced yet')
  const [showCompletedArchive, setShowCompletedArchive] = useState(false)
  const [dragState, setDragState] = useState<{
    itemId: string
    itemName: string
    fromCategory: string
    pointerId: number
    x: number
    y: number
  } | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  const [reviewingItemId, setReviewingItemId] = useState<string | null>(null)
  const [spotlightedItemId, setSpotlightedItemId] = useState<string | null>(null)
  const [analysisNow, setAnalysisNow] = useState(() => Date.now())
  const inputRef = useRef<HTMLInputElement>(null)
  const recipeFileInputRef = useRef<HTMLInputElement>(null)
  const syncInFlightRef = useRef(false)
  const dismissBatchTimerRef = useRef<number | null>(null)
  const dismissExitTimerRef = useRef<number | null>(null)
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set())
  const [dismissingExitingIds, setDismissingExitingIds] = useState<Set<string>>(new Set())
  const dismissingIdsRef = useRef<Set<string>>(new Set())

  const activeItems = items.filter((item) => !item.checked)

  const findMergeSuggestion = useCallback((name: string) => {
    const normalized = normalizeItemName(name)
    if (!normalized) return null
    const exact = activeItems.find((item) => normalizeItemName(item.name) === normalized)
    if (exact) return exact
    const fuzzy = activeItems.find((item) => {
      const existing = normalizeItemName(item.name)
      return existing.includes(normalized) || normalized.includes(existing)
    })
    return fuzzy ?? null
  }, [activeItems])

  const mergeSuggestion = findMergeSuggestion(inputValue)
  const activeNameSet = useMemo(
    () => new Set(activeItems.map((item) => normalizeItemName(item.name))),
    [activeItems]
  )

  const predictiveMap = useMemo(() => {
    const map = new Map<string, { name: string; category: string; count: number; lastAt: number }>()
    for (const row of historyRows) {
      if (!row.checked) continue
      const normalized = normalizeItemName(row.name)
      if (!normalized || activeNameSet.has(normalized)) continue
      const parsedAt = Date.parse(row.updated_at)
      const updatedAt = Number.isNaN(parsedAt) ? 0 : parsedAt
      const seen = map.get(normalized)
      if (!seen) {
        map.set(normalized, {
          name: row.name,
          category: row.category,
          count: 1,
          lastAt: updatedAt,
        })
        continue
      }
      seen.count += 1
      if (updatedAt > seen.lastAt) {
        seen.lastAt = updatedAt
        seen.name = row.name
        seen.category = row.category
      }
    }
    return map
  }, [activeNameSet, historyRows])

  const pantryLikelyOwnedNames = useMemo(() => {
    const recentWindowMs = 21 * 24 * 60 * 60 * 1000
    const now = Date.now()
    const names = new Set<string>()
    for (const row of historyRows) {
      if (!row.checked) continue
      const normalized = normalizeItemName(row.name)
      if (!normalized || activeNameSet.has(normalized)) continue
      const updatedAt = Date.parse(row.updated_at)
      if (Number.isNaN(updatedAt)) continue
      if (now - updatedAt > recentWindowMs) continue
      names.add(normalized)
    }
    return names
  }, [activeNameSet, historyRows])

  const defaultSelectedRecipeIndexes = useCallback((recipe: RecipeDraft) => {
    const selected = new Set<number>()
    recipe.ingredients.forEach((ingredient, index) => {
      const normalized = normalizeItemName(ingredient.name || ingredient.raw_text)
      if (!normalized) return
      if (activeNameSet.has(normalized)) return
      if (pantryLikelyOwnedNames.has(normalized)) return
      selected.add(index)
    })
    return selected
  }, [activeNameSet, pantryLikelyOwnedNames])

  const predictiveSuggestions = Array.from(predictiveMap.values())
    .filter((entry) => entry.count >= 2)
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, 6)

  const smartRebuySuggestions = Array.from(predictiveMap.values())
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, 6)

  const pantryDepletionPredictions = useMemo(() => {
    const dayMs = 24 * 60 * 60 * 1000
    const byName = new Map<string, { name: string; timestamps: number[] }>()
    for (const row of historyRows) {
      if (!row.checked || row.category !== 'pantry') continue
      const normalized = normalizeItemName(row.name)
      if (!normalized || activeNameSet.has(normalized)) continue
      const ts = Date.parse(row.updated_at)
      if (Number.isNaN(ts)) continue
      const existing = byName.get(normalized)
      if (!existing) {
        byName.set(normalized, { name: row.name, timestamps: [ts] })
      } else {
        existing.timestamps.push(ts)
      }
    }

    const results: Array<{ name: string; daysUntil: number; cadenceDays: number; dueAt: number; confidence: 'high' | 'medium' }> = []
    byName.forEach((value) => {
      const uniqueTs = Array.from(new Set(value.timestamps.map((ts) => Math.floor(ts / dayMs) * dayMs))).sort((a, b) => a - b)
      if (uniqueTs.length < 2) return
      const deltas: number[] = []
      for (let i = 1; i < uniqueTs.length; i += 1) {
        deltas.push((uniqueTs[i] - uniqueTs[i - 1]) / dayMs)
      }
      if (deltas.length === 0) return
      const cadenceDays = deltas.reduce((sum, d) => sum + d, 0) / deltas.length
      const lastAt = uniqueTs[uniqueTs.length - 1]
      const dueAt = lastAt + cadenceDays * dayMs
      const daysUntil = Math.round((dueAt - analysisNow) / dayMs)
      if (daysUntil > 7) return
      results.push({
        name: value.name,
        daysUntil,
        cadenceDays: Math.max(1, Math.round(cadenceDays)),
        dueAt,
        confidence: uniqueTs.length >= 4 ? 'high' : 'medium',
      })
    })

    return results
      .sort((a, b) => a.daysUntil - b.daysUntil || b.dueAt - a.dueAt)
      .slice(0, 8)
  }, [activeNameSet, analysisNow, historyRows])

  const cookStepTimerOptions = useMemo(() => {
    if (!cookView) return []
    const instruction = cookView.recipe.steps[cookView.stepIndex]?.instruction ?? ''
    return extractTimerOptions(instruction)
  }, [cookView])

  const weeklyAutoListCandidates = useMemo(() => {
    const thirtyDaysAgo = analysisNow - 30 * 24 * 60 * 60 * 1000
    return Array.from(predictiveMap.values())
      .filter((entry) => entry.count >= 2 && entry.lastAt >= thirtyDaysAgo)
      .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
      .slice(0, 10)
  }, [analysisNow, predictiveMap])

  const mealPlanSlotsByRecipe = useMemo(() => {
    const byRecipe = new Map<string, Set<RecipeMealPlanSlot>>()
    for (const plan of recipeMealPlans) {
      const bucket = byRecipe.get(plan.recipe_id) ?? new Set<RecipeMealPlanSlot>()
      bucket.add(plan.slot)
      byRecipe.set(plan.recipe_id, bucket)
    }
    return byRecipe
  }, [recipeMealPlans])

  const spotlightItem = useCallback((itemId: string) => {
    setSpotlightedItemId(itemId)
    const node = document.getElementById(`grocery-item-${itemId}`)
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => setSpotlightedItemId((current) => (current === itemId ? null : current)), 1600)
  }, [])

  const addItemByName = useCallback((name: string, options?: { allowDuplicate?: boolean; spotlightOnDuplicate?: boolean; clearInput?: boolean }) => {
    const trimmedName = name.trim()
    if (!trimmedName || !defaultListId) return
    const suggestion = findMergeSuggestion(trimmedName)
    if (suggestion && !options?.allowDuplicate) {
      if (options?.spotlightOnDuplicate !== false) {
        spotlightItem(suggestion.id)
      }
      return
    }
    const category = detectCategory(trimmedName)
    addItem.mutate({ list_id: defaultListId, name: trimmedName, quantity: null, unit: null, category, checked: false, notes: null })
    if (options?.clearInput !== false) {
      setInputValue('')
      inputRef.current?.focus()
    }
  }, [addItem, defaultListId, findMergeSuggestion, spotlightItem])

  const handleAddItem = () => {
    addItemByName(inputValue, { spotlightOnDuplicate: true, clearInput: true })
  }

  const handleQuickAdd = (name: string) => {
    addItemByName(name, { spotlightOnDuplicate: true, clearInput: true })
  }

  const handleAddBundle = useCallback((bundleItems: string[]) => {
    let addedAny = false
    for (const bundleItem of bundleItems) {
      const trimmed = bundleItem.trim()
      if (!trimmed) continue
      const existing = findMergeSuggestion(trimmed)
      if (existing) continue
      addItemByName(trimmed, { spotlightOnDuplicate: false, clearInput: false })
      addedAny = true
    }
    if (!addedAny) {
      const firstExisting = bundleItems
        .map((bundleItem) => findMergeSuggestion(bundleItem))
        .find((value): value is GroceryItem => Boolean(value))
      if (firstExisting) spotlightItem(firstExisting.id)
    }
  }, [addItemByName, findMergeSuggestion, spotlightItem])

  const handleGenerateWeeklyList = useCallback(() => {
    for (const candidate of weeklyAutoListCandidates) {
      addItemByName(candidate.name, { spotlightOnDuplicate: false, clearInput: false })
    }
  }, [addItemByName, weeklyAutoListCandidates])

  const handleVoiceAdd = () => {
    const prompt = inputValue.trim()
      ? `Add these grocery items to the shopping list: ${inputValue.trim()}`
      : 'Add items to the grocery list.'
    document.dispatchEvent(new CustomEvent('open-ai-chat', {
      detail: {
        prompt,
        autoSend: false,
        source: 'grocery-voice-add',
      },
    }))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddItem()
    }
  }

  const importRecipeFromSource = useCallback(async (payload: {
    sourceType: 'url' | 'image' | 'pdf'
    sourceUrl?: string
    fileBase64?: string
    mimeType?: string
    fallbackName?: string
  }) => {
    setRecipeImportError(null)
    setRecipeImporting(true)
    try {
      const { data, error } = await supabase.functions.invoke('extract-recipe-content', {
        body: {
          source_type: payload.sourceType,
          source_url: payload.sourceUrl ?? null,
          file_base64: payload.fileBase64 ?? null,
          mime_type: payload.mimeType ?? null,
          fallback_name: payload.fallbackName ?? 'Imported recipe',
        },
      })
      if (error) throw error

      const recipeRaw = data?.recipe as Record<string, unknown> | undefined
      if (!recipeRaw) throw new Error('No recipe extracted')

      const ingredientsRaw = Array.isArray(recipeRaw.ingredients) ? recipeRaw.ingredients : []
      const stepsRaw = Array.isArray(recipeRaw.steps) ? recipeRaw.steps : []
      const recipe: RecipeDraft = {
        name: String(recipeRaw.name ?? 'Imported recipe').trim() || 'Imported recipe',
        servings: typeof recipeRaw.servings === 'string' ? recipeRaw.servings : null,
        cook_time: typeof recipeRaw.cook_time === 'string' ? recipeRaw.cook_time : null,
        confidence: Math.max(0, Math.min(1, Number(recipeRaw.confidence ?? 0.7) || 0.7)),
        source_type: payload.sourceType,
        source_url: payload.sourceType === 'url' ? (payload.sourceUrl ?? null) : null,
        ingredients: ingredientsRaw
          .map((row) => {
            if (!row || typeof row !== 'object') return null
            const item = row as Record<string, unknown>
            const rawText = String(item.raw_text ?? '').trim()
            if (!rawText) return null
            return {
              raw_text: rawText,
              name: typeof item.name === 'string' ? item.name : null,
              quantity: typeof item.quantity === 'string' ? item.quantity : null,
              unit: typeof item.unit === 'string' ? item.unit : null,
              optional: Boolean(item.optional),
            } as RecipeDraftIngredient
          })
          .filter((row): row is RecipeDraftIngredient => row !== null),
        steps: stepsRaw
          .map((row, index) => {
            if (!row || typeof row !== 'object') return null
            const item = row as Record<string, unknown>
            const instruction = String(item.instruction ?? '').trim()
            if (!instruction) return null
            return {
              step_number: Number(item.step_number ?? index + 1),
              instruction,
            } as RecipeDraftStep
          })
          .filter((row): row is RecipeDraftStep => row !== null)
          .sort((a, b) => a.step_number - b.step_number)
          .map((step, index) => ({ ...step, step_number: index + 1 })),
      }

      if (recipe.ingredients.length === 0) {
        throw new Error('No ingredients found in this recipe')
      }
      setParsedRecipe(recipe)
      setSelectedRecipeIngredientIndexes(defaultSelectedRecipeIndexes(recipe))
      setRecipeScale(1)
      setAddPanelMode('recipe')
      setIsAddPanelOpen(true)
    } catch (err) {
      setRecipeImportError(err instanceof Error ? err.message : 'Recipe import failed')
    } finally {
      setRecipeImporting(false)
    }
  }, [defaultSelectedRecipeIndexes])

  const handleRecipeUrlImport = useCallback(async () => {
    const url = recipeUrlInput.trim()
    if (!url) {
      setRecipeImportError('Paste a recipe URL first')
      return
    }
    await importRecipeFromSource({ sourceType: 'url', sourceUrl: url, fallbackName: 'Web recipe' })
  }, [importRecipeFromSource, recipeUrlInput])

  const handleRecipeFilePick = useCallback(async (file: File | null) => {
    if (!file) return
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isImage = file.type.startsWith('image/')
    if (!isPdf && !isImage) {
      setRecipeImportError('Please upload a recipe photo or PDF')
      return
    }
    const buffer = await file.arrayBuffer()
    const base64 = arrayBufferToBase64(buffer)
    await importRecipeFromSource({
      sourceType: isPdf ? 'pdf' : 'image',
      fileBase64: base64,
      mimeType: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
      fallbackName: file.name.replace(/\.[^.]+$/, ''),
    })
  }, [importRecipeFromSource])

  const addSelectedRecipeIngredientsToCart = useCallback((recipe: RecipeDraft) => {
    if (!defaultListId) return
    recipe.ingredients.forEach((ingredient, index) => {
      if (!selectedRecipeIngredientIndexes.has(index)) return
      const name = (ingredient.name || ingredient.raw_text).trim()
      if (!name) return
      if (findMergeSuggestion(name)) return
      const category = detectCategory(name)
      addItem.mutate({
        list_id: defaultListId,
        name,
        quantity: scaleQuantityValue(ingredient.quantity, recipeScale),
        unit: ingredient.unit,
        category,
        checked: false,
        notes: null,
      })
    })
  }, [addItem, defaultListId, findMergeSuggestion, recipeScale, selectedRecipeIngredientIndexes])

  const updateParsedIngredient = useCallback((index: number, patch: Partial<RecipeDraftIngredient>) => {
    setParsedRecipe((current) => {
      if (!current) return current
      const nextIngredients = current.ingredients.map((ingredient, ingredientIndex) =>
        ingredientIndex === index ? { ...ingredient, ...patch } : ingredient)
      return { ...current, ingredients: nextIngredients }
    })
  }, [])

  const saveRecipePreset = useCallback(async (options: { addSelectedToCart: boolean }) => {
    if (!parsedRecipe) return
    setSavingRecipe(true)
    setRecipeImportError(null)
    try {
      const { data: recipeRow, error: recipeError } = await supabase
        .from('recipes')
        .insert({
          name: parsedRecipe.name,
          source_type: parsedRecipe.source_type,
          source_url: parsedRecipe.source_url,
          servings: parsedRecipe.servings,
          cook_time: parsedRecipe.cook_time,
          instructions_text: parsedRecipe.steps.map((step) => `${step.step_number}. ${step.instruction}`).join('\n'),
          last_used_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (recipeError) throw recipeError

      const recipeId = String(recipeRow.id)
      const ingredientRows = parsedRecipe.ingredients.map((ingredient, index) => ({
        recipe_id: recipeId,
        raw_text: ingredient.raw_text,
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        optional: ingredient.optional,
        sort_order: index,
      }))
      if (ingredientRows.length > 0) {
        const { error: ingredientError } = await supabase.from('recipe_ingredients').insert(ingredientRows)
        if (ingredientError) throw ingredientError
      }

      const stepRows = parsedRecipe.steps.map((step, index) => ({
        recipe_id: recipeId,
        step_number: index + 1,
        instruction: step.instruction,
      }))
      if (stepRows.length > 0) {
        const { error: stepError } = await supabase.from('recipe_steps').insert(stepRows)
        if (stepError) throw stepError
      }

      if (options.addSelectedToCart) {
        addSelectedRecipeIngredientsToCart(parsedRecipe)
      }

      await refetchRecipeLibrary()
      setParsedRecipe(null)
      setSelectedRecipeIngredientIndexes(new Set())
      setRecipeScale(1)
      setAddPanelMode('library')
    } catch (err) {
      setRecipeImportError(err instanceof Error ? err.message : 'Could not save recipe')
    } finally {
      setSavingRecipe(false)
    }
  }, [addSelectedRecipeIngredientsToCart, parsedRecipe, refetchRecipeLibrary])

  const openRecipeForCookMode = useCallback(async (recipe: RecipePreset) => {
    setCookView({ recipe, stepIndex: 0 })
    setCookTimer(null)
    await supabase
      .from('recipes')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', recipe.id)
    void refetchRecipeLibrary()
  }, [refetchRecipeLibrary])

  const planRecipeForSlot = useCallback(async (recipeId: string, slot: RecipeMealPlanSlot) => {
    const today = new Date()
    const planned = new Date(today)
    if (slot === 'tomorrow') planned.setDate(today.getDate() + 1)
    if (slot === 'this-week') planned.setDate(today.getDate() + 4)
    const { error } = await supabase
      .from('recipe_meal_plans')
      .upsert({
        recipe_id: recipeId,
        slot,
        planned_for: planned.toISOString().slice(0, 10),
      }, { onConflict: 'recipe_id,slot' })
    if (error) {
      setRecipeImportError(error.message)
      return
    }
    await refetchMealPlans()
  }, [refetchMealPlans])

  const loadRecipeIntoChecklist = useCallback((recipe: RecipePreset) => {
    const draft: RecipeDraft = {
      name: recipe.name,
      servings: recipe.servings,
      cook_time: recipe.cook_time,
      confidence: 0.95,
      source_type: recipe.source_type === 'manual' ? 'url' : recipe.source_type,
      source_url: recipe.source_url,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
    }
    setParsedRecipe(draft)
    setSelectedRecipeIngredientIndexes(defaultSelectedRecipeIndexes(draft))
    setRecipeScale(1)
    setAddPanelMode('recipe')
    setIsAddPanelOpen(true)
  }, [defaultSelectedRecipeIndexes])

  useEffect(() => {
    return () => {
      if (dismissBatchTimerRef.current) {
        window.clearTimeout(dismissBatchTimerRef.current)
      }
      if (dismissExitTimerRef.current) {
        window.clearTimeout(dismissExitTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    dismissingIdsRef.current = dismissingIds
  }, [dismissingIds])

  useEffect(() => {
    return () => {
      document.body.style.userSelect = ''
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setAnalysisNow(Date.now()), 15 * 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!cookTimer) return
    if (cookTimer.remainingSeconds <= 0) return
    const tick = window.setInterval(() => {
      setCookTimer((current) => {
        if (!current) return current
        const next = Math.max(0, current.remainingSeconds - 1)
        return { ...current, remainingSeconds: next }
      })
    }, 1000)
    return () => window.clearInterval(tick)
  }, [cookTimer])

  const handleToggle = (id: string, checked: boolean) => {
    if (!checked) {
      setDismissingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setDismissingExitingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      toggleItem.mutate({ id, checked: false })
      return
    }

    toggleItem.mutate({ id, checked: true })
    setDismissingIds(prev => new Set(prev).add(id))
    setDismissingExitingIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    if (dismissBatchTimerRef.current) {
      window.clearTimeout(dismissBatchTimerRef.current)
    }
    dismissBatchTimerRef.current = window.setTimeout(() => {
      const batchIds = Array.from(dismissingIdsRef.current)
      dismissBatchTimerRef.current = null
      if (batchIds.length === 0) return
      setDismissingExitingIds(new Set(batchIds))
      if (dismissExitTimerRef.current) {
        window.clearTimeout(dismissExitTimerRef.current)
      }
      dismissExitTimerRef.current = window.setTimeout(() => {
        setDismissingIds((prev) => {
          const next = new Set(prev)
          batchIds.forEach((batchId) => next.delete(batchId))
          return next
        })
        setDismissingExitingIds((prev) => {
          const next = new Set(prev)
          batchIds.forEach((batchId) => next.delete(batchId))
          return next
        })
        dismissExitTimerRef.current = null
      }, CHECKED_ITEM_EXIT_ANIMATION_MS)
    }, CHECKED_ITEM_DISMISS_MS)
  }

  const handleSyncNow = useCallback(async (options?: { cleanBeforeSync?: boolean }) => {
    if (syncInFlightRef.current) return
    syncInFlightRef.current = true
    setSyncing(true)
    setSyncError(null)
    try {
      let cleanSummary = ''
      if (options?.cleanBeforeSync) {
        const activeItemIds = items
          .filter((item) => !item.checked && !item.deleted_at)
          .map((item) => item.id)
        const batches = chunkArray(activeItemIds, CLEAN_SYNC_BATCH_SIZE)

        let totalScanned = 0
        let totalCorrected = 0
        let totalEnhanced = 0

        for (const batchIds of batches) {
          const [{ data: normalizeData, error: normalizeError }, { data: enhanceData, error: enhanceError }] = await Promise.all([
            supabase.functions.invoke('normalize-grocery-items', {
              body: { item_ids: batchIds },
            }),
            supabase.functions.invoke('enhance-grocery-items', {
              body: { item_ids: batchIds, limit: batchIds.length },
            }),
          ])

          if (normalizeError) throw normalizeError
          if (enhanceError) throw enhanceError

          totalScanned += Number(normalizeData?.scanned_count ?? 0)
          totalCorrected += Number(normalizeData?.corrected_count ?? 0)
          totalEnhanced += Number(enhanceData?.enhanced_count ?? 0)
        }

        if (totalCorrected === 0) {
          cleanSummary = totalScanned > 0
            ? 'Clean pass: names already looked good (no spelling/case fixes needed)'
            : 'Clean pass: no suspicious names'
        } else {
          cleanSummary = `Cleaned ${totalCorrected} name${totalCorrected === 1 ? '' : 's'} · Enhanced ${totalEnhanced} item${totalEnhanced === 1 ? '' : 's'}`
        }

        const { data: learningData, error: learningError } = await supabase.functions.invoke('learn-grocery-corrections', {
          body: { dry_run: false, limit: 400, min_votes: 1, lookback_days: 90 },
        })
        if (learningError) throw learningError
        const learnedCount = Number(learningData?.applied_count ?? 0)
        if (learnedCount > 0) {
          cleanSummary = cleanSummary
            ? `${cleanSummary} · Learned ${learnedCount} new match${learnedCount === 1 ? '' : 'es'}`
            : `Learned ${learnedCount} new match${learnedCount === 1 ? '' : 'es'}`
        }
      }

      const { data: dedupeData, error: dedupeError } = await supabase.functions.invoke('dedupe-grocery-items', {
        body: { dry_run: false },
      })
      if (dedupeError) throw dedupeError
      const dedupedRows = Number(dedupeData?.duplicate_rows ?? 0)

      const since = localStorage.getItem(SYNC_CURSOR_KEY)
      const { data, error } = await supabase.functions.invoke('sync-casa-to-ios', {
        body: { since, limit: 300 },
      })
      if (error) throw error

      const deltas = Array.isArray(data?.deltas) ? data.deltas : []
      const deleted = deltas.filter((d: { deleted?: boolean }) => d.deleted).length
      const changed = deltas.length - deleted
      const syncSummary = deltas.length === 0
        ? 'No new changes to sync'
        : `${changed} update${changed === 1 ? '' : 's'} and ${deleted} delete${deleted === 1 ? '' : 's'} ready`
      const dedupeSummary = dedupedRows > 0
        ? `Deduped ${dedupedRows} duplicate item${dedupedRows === 1 ? '' : 's'}`
        : ''
      const summary = [cleanSummary, dedupeSummary, syncSummary].filter(Boolean).join(' · ')

      const nextCursor = typeof data?.next_cursor === 'string' ? data.next_cursor : null
      if (nextCursor) localStorage.setItem(SYNC_CURSOR_KEY, nextCursor)

      const nowIso = new Date().toISOString()
      localStorage.setItem(SYNC_LAST_AT_KEY, nowIso)
      localStorage.setItem(SYNC_LAST_SUMMARY_KEY, summary)
      setLastSyncAt(nowIso)
      setLastSyncSummary(summary)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed'
      setSyncError(message)
    } finally {
      syncInFlightRef.current = false
      setSyncing(false)
    }
  }, [items])

  const detectDropCategory = useCallback((x: number, y: number) => {
    const target = document.elementFromPoint(x, y) as HTMLElement | null
    const dropZone = target?.closest<HTMLElement>('[data-drop-category]')
    return dropZone?.dataset.dropCategory ?? null
  }, [])

  const finishDrag = useCallback((dropCategory: string | null) => {
    setDragState((current) => {
      if (current && dropCategory && dropCategory !== current.fromCategory) {
        updateItemCategory.mutate({
          id: current.itemId,
          category: dropCategory,
          fromCategory: current.fromCategory,
          itemName: current.itemName,
        })
      }
      return null
    })
    setDragOverCategory(null)
    document.body.style.userSelect = ''
  }, [updateItemCategory])

  const handleMovePointerDown = useCallback((
    item: GroceryItem,
    fromCategory: string,
    e: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.userSelect = 'none'
    setDragState({
      itemId: item.id,
      itemName: item.name,
      fromCategory,
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
    })
    setDragOverCategory(fromCategory)
  }, [])

  const handleMovePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    setDragState((current) => {
      if (!current || current.pointerId !== e.pointerId) return current
      return {
        ...current,
        x: e.clientX,
        y: e.clientY,
      }
    })
    const overCategory = detectDropCategory(e.clientX, e.clientY)
    setDragOverCategory(overCategory)
  }, [detectDropCategory])

  const handleMovePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore capture release failures
    }
    const overCategory = detectDropCategory(e.clientX, e.clientY)
    finishDrag(overCategory)
  }, [detectDropCategory, finishDrag])

  const handleMovePointerCancel = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    finishDrag(null)
  }, [finishDrag])

  useEffect(() => {
    if (!isAddPanelOpen) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80)
    return () => window.clearTimeout(timer)
  }, [isAddPanelOpen])

  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      void handleSyncNow()
    }, 1_500)

    const intervalId = window.setInterval(() => {
      void handleSyncNow()
    }, AUTO_SYNC_INTERVAL_MS)

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        void handleSyncNow()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleFocus)

    return () => {
      window.clearTimeout(kickoff)
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleFocus)
    }
  }, [handleSyncNow])

  const visibleDismissIds = new Set([...dismissingIds, ...dismissingExitingIds])

  const activeItemsByCategory = GROCERY_CATEGORIES.map(cat => ({
    ...cat,
    items: sortItemsForShopping(items.filter(i => i.category === cat.key && (!i.checked || visibleDismissIds.has(i.id)))),
  })).filter(cat => cat.items.length > 0)

  const completedItemsByCategory = GROCERY_CATEGORIES.map(cat => ({
    ...cat,
    items: sortItemsForShopping(items.filter(i => i.category === cat.key && i.checked && !visibleDismissIds.has(i.id))),
  })).filter(cat => cat.items.length > 0)

  return (
    <div className="h-full min-h-0 bg-casa-bg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-casa-surface border-b border-casa-border px-4 pt-safe-t">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-casa-gold/10 flex items-center justify-center">
              <ShoppingCart size={20} className="text-casa-gold" />
            </div>
            <div>
              <h1 className="font-display text-heading text-casa-text">Grocery List</h1>
              <p className="text-caption text-casa-muted">
                {uncheckedCount} item{uncheckedCount !== 1 ? 's' : ''} remaining
                {checkedCount > 0 && ` · ${checkedCount} done`}
              </p>
              <p className="text-[11px] text-casa-muted">
                {lastSyncSummary}
                {lastSyncAt ? ` · ${new Date(lastSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleVoiceAdd}
              className="flex items-center gap-2 min-h-11 px-4 rounded-full bg-casa-gold text-white text-body-sm font-semibold shadow-sm hover:brightness-110 transition-all"
            >
              <Mic size={16} />
              Voice add
            </button>
            <button
              type="button"
              onClick={() => void handleSyncNow({ cleanBeforeSync: true })}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-button text-caption font-medium text-casa-muted border border-casa-border hover:bg-casa-bg transition-colors disabled:opacity-60"
            >
              <RefreshCw size={13} className={cn(syncing && 'animate-spin')} />
              {syncing ? 'Syncing…' : 'Clean + Sync'}
            </button>
            {checkedCount > 0 && (
              <button
                type="button"
                onClick={() => clearChecked.mutate()}
                disabled={clearChecked.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-button text-caption font-medium text-casa-muted border border-casa-border hover:bg-casa-bg hover:text-red-500 hover:border-red-300 transition-colors"
              >
                <Trash2 size={13} />
                Clear done
              </button>
            )}
          </div>
        </div>
        {syncError && (
          <p className="pb-3 text-[11px] text-red-600">Sync error: {syncError}</p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto touch-pan-y">
        <div className="max-w-6xl mx-auto px-4">
        {isLoading ? (
            <div className="pt-6 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-casa-divider rounded w-24 mb-3" />
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="h-12 bg-casa-surface rounded-xl mb-1" />
                ))}
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center px-8">
            <ShoppingCart size={40} className="text-casa-gold opacity-40" />
            <p className="text-body font-semibold text-casa-text">Your list is empty</p>
            <p className="text-body-sm text-casa-muted">Add items below or ask the AI.</p>
          </div>
        ) : (
            <div className="pt-3 pb-6">
              {dragState && (
                <div className="mb-3 rounded-2xl border border-casa-border bg-casa-surface p-3">
                  <p className="text-[11px] font-semibold text-casa-muted uppercase tracking-wider mb-2">
                    Drop into category
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {GROCERY_CATEGORIES.map((cat) => (
                      <div
                        key={`drop-target-${cat.key}`}
                        data-drop-category={cat.key}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-caption border transition-colors',
                          dragOverCategory === cat.key
                            ? 'border-casa-gold bg-casa-gold/15 text-casa-navy'
                            : 'border-casa-border text-casa-muted bg-casa-bg'
                        )}
                      >
                        {cat.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeItemsByCategory.length === 0 ? (
                <div className="mb-4 rounded-2xl border border-casa-border bg-casa-surface p-4 text-sm text-casa-muted">
                  Active list is clear. Completed items are hidden in the archive.
                </div>
              ) : (
              <div className="columns-1 lg:columns-2 2xl:columns-3 gap-3">
                {activeItemsByCategory.map((cat) => ({
                    key: cat.key,
                    label: cat.label,
                    items: cat.items,
                    dropKey: cat.key,
                    accentColor: CATEGORY_ACCENT_BY_KEY[cat.key] ?? 'var(--color-casa-gold)',
                    reviewCount: cat.items.filter((item) =>
                      typeof item.enhancement_confidence === 'number' &&
                      item.enhancement_confidence < LOW_CONFIDENCE_REVIEW_THRESHOLD
                    ).length,
                  })).map((section) => (
                  <div
                    key={section.key}
                    data-drop-category={section.dropKey ?? undefined}
                    className={cn(
                      'rounded-2xl break-inside-avoid mb-3',
                      section.dropKey && dragState && dragOverCategory === section.dropKey && 'ring-2 ring-casa-gold/60 bg-casa-gold/5'
                    )}
                  >
                    <div
                      className="bg-casa-surface rounded-2xl border border-casa-border overflow-hidden"
                    >
                      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-casa-divider">
                        <p className="text-body font-semibold text-casa-navy">
                          {section.label}
                        </p>
                        <div className="flex items-center gap-2 text-caption text-casa-muted">
                          <span>
                            {section.items.length} item{section.items.length === 1 ? '' : 's'}
                          </span>
                          {section.reviewCount > 0 && (
                            <span>
                              {section.reviewCount} review
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5" style={{ backgroundColor: section.accentColor }} />
                      <div className="divide-y divide-casa-divider">
                      {section.items.map((item) => (
                        <div key={item.id} id={`grocery-item-${item.id}`}>
                          <ItemRow
                            item={item}
                            dismissPhase={dismissingExitingIds.has(item.id) ? 'exiting' : dismissingIds.has(item.id) ? 'queued' : 'none'}
                            isDragging={dragState?.itemId === item.id}
                            isSpotlighted={spotlightedItemId === item.id}
                            isReviewing={reviewingItemId === item.id}
                            onRequestReview={setReviewingItemId}
                            onChooseReviewCategory={(id, category) => {
                              updateItemCategory.mutate({
                                id,
                                category,
                                fromCategory: item.category,
                                itemName: item.name,
                                reviewedByUser: true,
                              })
                              setReviewingItemId(null)
                            }}
                            onDismissReview={() => setReviewingItemId(null)}
                            onToggle={handleToggle}
                            onDelete={(id) => deleteItem.mutate(id)}
                            onMovePointerDown={(e) => handleMovePointerDown(item, item.category, e)}
                            onMovePointerMove={handleMovePointerMove}
                            onMovePointerUp={handleMovePointerUp}
                            onMovePointerCancel={handleMovePointerCancel}
                          />
                        </div>
                      ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              )}

              {completedItemsByCategory.length > 0 && (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setShowCompletedArchive(prev => !prev)}
                    className="px-1 pb-2 text-caption font-semibold text-casa-muted hover:text-casa-text transition-colors"
                  >
                    {showCompletedArchive ? 'Hide completed archive' : `Show completed archive (${checkedCount})`}
                  </button>
                  {showCompletedArchive && (
                    <div className="space-y-3">
                      {completedItemsByCategory.map(cat => (
                      <div key={`completed-${cat.key}`}>
                        <div className="px-1 pb-1">
                          <p className="text-body-sm font-semibold text-casa-muted">
                            {cat.label}
                          </p>
                        </div>
                        <div className="bg-casa-surface rounded-2xl border border-casa-border divide-y divide-casa-divider overflow-hidden">
                          {cat.items.map(item => (
                            <div key={item.id} id={`grocery-item-${item.id}`}>
                              <ItemRow
                                item={item}
                                isSpotlighted={spotlightedItemId === item.id}
                                onToggle={handleToggle}
                                onDelete={(id) => deleteItem.mutate(id)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(predictiveSuggestions.length > 0 || smartRebuySuggestions.length > 0 || SMART_BUNDLES.length > 0 || weeklyAutoListCandidates.length > 0 || pantryDepletionPredictions.length > 0) && (
                <div className="mt-5 rounded-2xl border border-casa-border bg-casa-surface p-3">
                  <p className="text-caption font-semibold text-casa-muted uppercase tracking-wider mb-2">
                    Smart picks
                  </p>
                  {weeklyAutoListCandidates.length > 0 && (
                    <div className="mb-2 rounded-xl border border-casa-gold/30 bg-casa-gold/10 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[11px] font-semibold text-casa-navy">Auto weekly list</p>
                          <p className="text-[11px] text-casa-muted">Based on your last 30 days of repeat buys</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleGenerateWeeklyList}
                          className="px-3 py-1.5 rounded-full bg-casa-gold text-white text-[11px] font-semibold hover:brightness-110 transition-all"
                        >
                          Add {weeklyAutoListCandidates.length}
                        </button>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {weeklyAutoListCandidates.slice(0, 6).map((item) => (
                          <span key={`weekly-${item.name}`} className="px-2 py-0.5 rounded-full bg-casa-surface border border-casa-border text-[11px] text-casa-muted">
                            {item.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {pantryDepletionPredictions.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[11px] text-casa-muted mb-1">Pantry depletion predictions</p>
                      <div className="space-y-1.5">
                        {pantryDepletionPredictions.slice(0, 4).map((prediction) => (
                          <div key={`depletion-${prediction.name}`} className="rounded-lg border border-casa-border bg-casa-bg px-2.5 py-2 flex items-center justify-between gap-2">
                            <div>
                              <p className="text-[11px] text-casa-navy font-medium">{prediction.name}</p>
                              <p className="text-[11px] text-casa-muted">
                                {prediction.daysUntil <= 0
                                  ? 'Likely due now'
                                  : `Likely due in ${prediction.daysUntil} day${prediction.daysUntil === 1 ? '' : 's'}`}
                                {` · cadence ~${prediction.cadenceDays}d`}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => addItemByName(prediction.name, { spotlightOnDuplicate: true, clearInput: true })}
                              className="px-2.5 py-1 rounded-full border border-casa-border text-[11px] text-casa-muted hover:bg-casa-main transition-colors"
                            >
                              Add
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {predictiveSuggestions.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[11px] text-casa-muted mb-1">Likely next adds</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {predictiveSuggestions.map((item) => (
                          <button
                            key={`predictive-${item.name}`}
                            type="button"
                            onClick={() => addItemByName(item.name, { spotlightOnDuplicate: true, clearInput: true })}
                            className="flex-shrink-0 min-h-8 px-3 rounded-full border border-casa-border bg-casa-bg text-[11px] text-casa-text hover:bg-casa-main transition-colors"
                          >
                            + {item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {smartRebuySuggestions.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[11px] text-casa-muted mb-1">Rebuy from your history</p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {smartRebuySuggestions.map((item) => (
                          <button
                            key={`rebuy-${item.name}`}
                            type="button"
                            onClick={() => addItemByName(item.name, { spotlightOnDuplicate: true, clearInput: true })}
                            className="flex-shrink-0 min-h-8 px-3 rounded-full border border-casa-border bg-casa-bg text-[11px] text-casa-text hover:bg-casa-main transition-colors"
                          >
                            + {item.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {SMART_BUNDLES.length > 0 && (
                    <div>
                      <p className="text-[11px] text-casa-muted mb-1">1-tap bundles</p>
                      <div className="flex flex-wrap gap-2">
                        {SMART_BUNDLES.map((bundle) => (
                          <button
                            key={bundle.name}
                            type="button"
                            onClick={() => handleAddBundle(bundle.items)}
                            className="min-h-8 px-3 rounded-full border border-casa-gold/50 bg-casa-gold/10 text-[11px] font-medium text-casa-navy hover:bg-casa-gold/15 transition-colors"
                          >
                            + {bundle.name} ({bundle.items.length})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="h-24" />
          </div>
        )}
        </div>
      </div>
      {isAddPanelOpen && (
        <div className="fixed right-24 bottom-[calc(var(--spacing-nav-height)+1rem+var(--vk-height,0px)+var(--vk-gap,0px))] lg:bottom-[calc(1.5rem+var(--vk-height,0px)+var(--vk-gap,0px))] z-[55] w-[min(42rem,calc(100vw-7rem))] max-h-[min(36rem,74vh)] overflow-y-auto rounded-2xl border border-casa-border bg-casa-surface shadow-modal p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-body-sm font-semibold text-casa-navy">Add grocery items</p>
            <button
              type="button"
              onClick={() => setIsAddPanelOpen(false)}
              className="h-8 w-8 rounded-full border border-casa-border bg-casa-bg text-casa-muted hover:bg-casa-main transition-colors flex items-center justify-center"
              aria-label="Close add panel"
            >
              <X size={14} />
            </button>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAddPanelMode('quick')}
              className={cn(
                'px-2.5 py-1 rounded-pill border text-[11px] transition-colors',
                addPanelMode === 'quick'
                  ? 'border-casa-gold bg-casa-gold/15 text-casa-navy'
                  : 'border-casa-border bg-casa-bg text-casa-muted hover:bg-casa-main',
              )}
            >
              Quick add
            </button>
            <button
              type="button"
              onClick={() => setAddPanelMode('recipe')}
              className={cn(
                'px-2.5 py-1 rounded-pill border text-[11px] transition-colors inline-flex items-center gap-1',
                addPanelMode === 'recipe'
                  ? 'border-casa-gold bg-casa-gold/15 text-casa-navy'
                  : 'border-casa-border bg-casa-bg text-casa-muted hover:bg-casa-main',
              )}
            >
              <Upload size={12} />
              Recipe import
            </button>
            <button
              type="button"
              onClick={() => setAddPanelMode('library')}
              className={cn(
                'px-2.5 py-1 rounded-pill border text-[11px] transition-colors inline-flex items-center gap-1',
                addPanelMode === 'library'
                  ? 'border-casa-gold bg-casa-gold/15 text-casa-navy'
                  : 'border-casa-border bg-casa-bg text-casa-muted hover:bg-casa-main',
              )}
            >
              <BookOpen size={12} />
              Saved recipes
            </button>
          </div>

          {addPanelMode === 'quick' && (
            <>
          <div className="flex items-center gap-2 bg-casa-bg rounded-2xl border border-casa-border px-4 py-3 min-h-14 shadow-sm">
            <Plus size={18} className="text-casa-muted flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add an item…"
              className="flex-1 bg-transparent text-body text-casa-text placeholder:text-casa-muted outline-none"
            />
            <button
              type="button"
              onClick={handleAddItem}
              disabled={!inputValue.trim() || !defaultListId}
              className={cn(
                'flex-shrink-0 min-h-10 px-4 rounded-button text-body-sm font-semibold transition-all',
                inputValue.trim()
                  ? 'bg-casa-gold text-white hover:brightness-110'
                  : 'text-casa-muted'
              )}
            >
              Add
            </button>
          </div>
          {mergeSuggestion && (
            <div className="mt-2 rounded-2xl border border-casa-gold/40 bg-casa-gold/10 px-3 py-2">
              <p className="text-[11px] text-casa-navy">
                Similar item already on your list: <span className="font-semibold">{mergeSuggestion.name}</span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => spotlightItem(mergeSuggestion.id)}
                  className="px-2.5 py-1 rounded-full border border-casa-gold/60 bg-casa-surface text-[11px] font-medium text-casa-navy hover:bg-casa-bg transition-colors"
                >
                  Use existing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextName = inputValue.trim()
                    if (!nextName || !defaultListId) return
                    const category = detectCategory(nextName)
                    addItem.mutate({ list_id: defaultListId, name: nextName, quantity: null, unit: null, category, checked: false, notes: null })
                    setInputValue('')
                    inputRef.current?.focus()
                  }}
                  className="px-2.5 py-1 rounded-full border border-casa-border text-[11px] text-casa-muted hover:bg-casa-bg transition-colors"
                >
                  Add anyway
                </button>
              </div>
            </div>
          )}
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {QUICK_ADD_TOUCH_ITEMS.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => handleQuickAdd(item)}
                className="flex-shrink-0 min-h-9 px-3 rounded-full border border-casa-border bg-casa-bg text-body-sm text-casa-text hover:bg-casa-main transition-colors"
              >
                + {item}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-casa-muted">
            Tip: use the Voice add button at the top, then say “add milk, eggs, and bananas.”
          </p>
            </>
          )}

          {addPanelMode === 'recipe' && (
            <div>
              <div className="rounded-2xl border border-casa-border bg-casa-bg p-3">
                <p className="text-[11px] text-casa-muted mb-1">Paste a public recipe URL</p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-1 bg-casa-surface rounded-button border border-casa-border px-3 py-2">
                    <Link2 size={14} className="text-casa-muted" />
                    <input
                      type="url"
                      value={recipeUrlInput}
                      onChange={(event) => setRecipeUrlInput(event.target.value)}
                      placeholder="https://..."
                      className="flex-1 bg-transparent text-body-sm text-casa-text placeholder:text-casa-muted outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRecipeUrlImport()}
                    disabled={recipeImporting}
                    className="px-3 py-2 rounded-button border border-casa-border text-body-sm font-semibold text-casa-navy hover:bg-casa-main transition-colors disabled:opacity-60"
                  >
                    Import URL
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => recipeFileInputRef.current?.click()}
                    disabled={recipeImporting}
                    className="px-3 py-1.5 rounded-pill border border-casa-border text-[11px] text-casa-muted hover:bg-casa-surface transition-colors disabled:opacity-60 inline-flex items-center gap-1"
                  >
                    <Upload size={12} />
                    Upload photo or PDF
                  </button>
                  <input
                    ref={recipeFileInputRef}
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      event.currentTarget.value = ''
                      void handleRecipeFilePick(file)
                    }}
                  />
                </div>
              </div>

              {recipeImporting && (
                <p className="mt-2 text-[11px] text-casa-muted animate-breathe">Extracting recipe…</p>
              )}
              {recipeImportError && (
                <p className="mt-2 text-[11px] text-casa-error">{recipeImportError}</p>
              )}

              {parsedRecipe && (
                <div className="mt-2 rounded-2xl border border-casa-border bg-casa-surface p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-body-sm font-semibold text-casa-navy">{parsedRecipe.name}</p>
                      <p className="text-[11px] text-casa-muted">
                        {parsedRecipe.ingredients.length} ingredients · {parsedRecipe.steps.length} steps · {Math.round(parsedRecipe.confidence * 100)}% confidence
                        {parsedRecipe.servings ? ` · ${parsedRecipe.servings}` : ''}
                        {parsedRecipe.cook_time ? ` · ${parsedRecipe.cook_time}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <div className="rounded-xl border border-casa-border bg-casa-bg p-2">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-casa-muted">Ingredients (auto-hides likely pantry staples)</p>
                        <div className="flex items-center gap-1">
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
                      <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                        {parsedRecipe.ingredients.map((ingredient, index) => {
                          const checked = selectedRecipeIngredientIndexes.has(index)
                          const displayName = ingredient.name || ingredient.raw_text
                          const scaledQuantity = scaleQuantityValue(ingredient.quantity, recipeScale)
                          return (
                            <div key={`${ingredient.raw_text}-${index}`} className="rounded-lg border border-casa-border bg-casa-surface px-2 py-1.5">
                              <label className="flex items-start gap-2 text-body-sm text-casa-text">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setSelectedRecipeIngredientIndexes((current) => {
                                    const next = new Set(current)
                                    if (next.has(index)) next.delete(index)
                                    else next.add(index)
                                    return next
                                  })
                                }}
                              />
                                <span>{displayName}</span>
                                {(scaledQuantity || ingredient.unit) && (
                                  <span className="text-[10px] text-casa-muted">
                                    {scaledQuantity ? `${scaledQuantity} ` : ''}{ingredient.unit ?? ''}
                                  </span>
                                )}
                              </label>
                              <div className="mt-1 flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={ingredient.quantity ?? ''}
                                  onChange={(event) => updateParsedIngredient(index, { quantity: event.target.value || null })}
                                  placeholder="Qty"
                                  className="w-16 rounded-button border border-casa-border bg-casa-bg px-2 py-1 text-[11px] text-casa-text outline-none"
                                />
                                <input
                                  type="text"
                                  value={ingredient.unit ?? ''}
                                  onChange={(event) => updateParsedIngredient(index, { unit: event.target.value || null })}
                                  placeholder="Unit"
                                  className="w-16 rounded-button border border-casa-border bg-casa-bg px-2 py-1 text-[11px] text-casa-text outline-none"
                                />
                                <input
                                  type="text"
                                  value={ingredient.name ?? ingredient.raw_text}
                                  onChange={(event) => updateParsedIngredient(index, { name: event.target.value || null })}
                                  placeholder="Ingredient"
                                  className="flex-1 rounded-button border border-casa-border bg-casa-bg px-2 py-1 text-[11px] text-casa-text outline-none"
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="rounded-xl border border-casa-border bg-casa-bg p-2">
                      <p className="text-[11px] text-casa-muted mb-1">Directions</p>
                      <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                        {parsedRecipe.steps.map((step) => (
                          <p key={`${step.step_number}-${step.instruction}`} className="text-[11px] text-casa-text">
                            <span className="font-semibold mr-1">{step.step_number}.</span>
                            {step.instruction}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => addSelectedRecipeIngredientsToCart(parsedRecipe)}
                      className="px-3 py-1.5 rounded-button border border-casa-border text-body-sm font-semibold text-casa-navy hover:bg-casa-main transition-colors"
                    >
                      Add selected ingredients ({selectedRecipeIngredientIndexes.size})
                    </button>
                    <button
                      type="button"
                      disabled={savingRecipe}
                      onClick={() => void saveRecipePreset({ addSelectedToCart: false })}
                      className="px-3 py-1.5 rounded-button border border-casa-border text-body-sm font-semibold text-casa-navy hover:bg-casa-main transition-colors disabled:opacity-60"
                    >
                      Save recipe
                    </button>
                    <button
                      type="button"
                      disabled={savingRecipe}
                      onClick={() => void saveRecipePreset({ addSelectedToCart: true })}
                      className="px-3 py-1.5 rounded-button bg-casa-gold text-white text-body-sm font-semibold hover:brightness-110 transition-colors disabled:opacity-60"
                    >
                      Save + Add selected
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {addPanelMode === 'library' && (
            <div className="space-y-2">
              {recipeMealPlans.length > 0 && (
                <div className="rounded-xl border border-casa-border bg-casa-surface px-3 py-2">
                  <p className="text-[11px] font-semibold text-casa-navy">Planned meals</p>
                  <p className="text-[11px] text-casa-muted mt-1">
                    {recipeMealPlans.slice(0, 3).map((plan) => {
                      const recipe = recipeLibrary.find((row) => row.id === plan.recipe_id)
                      const slotLabel = RECIPE_MEAL_SLOTS.find((entry) => entry.slot === plan.slot)?.label ?? plan.slot
                      return `${slotLabel}: ${recipe?.name ?? 'Recipe'}`
                    }).join(' · ')}
                  </p>
                </div>
              )}
              {recipeLibrary.length === 0 ? (
                <p className="text-[11px] text-casa-muted">No saved recipes yet. Import one from URL, photo, or PDF.</p>
              ) : (
                recipeLibrary.slice(0, 24).map((recipe) => (
                  <div key={recipe.id} className="rounded-2xl border border-casa-border bg-casa-bg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-body-sm font-semibold text-casa-navy">{recipe.name}</p>
                        <p className="text-[11px] text-casa-muted">
                          {recipe.ingredients.length} ingredients · {recipe.steps.length} steps
                          {recipe.cook_time ? ` · ${recipe.cook_time}` : ''}
                          {recipe.last_used_at ? ` · used ${new Date(recipe.last_used_at).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {RECIPE_MEAL_SLOTS.map(({ slot, label }) => {
                          const planned = mealPlanSlotsByRecipe.get(recipe.id)?.has(slot) ?? false
                          return (
                            <button
                              key={`${recipe.id}-${slot}`}
                              type="button"
                              onClick={() => void planRecipeForSlot(recipe.id, slot)}
                              className={cn(
                                'px-2.5 py-1 rounded-pill border text-[11px] transition-colors',
                                planned
                                  ? 'border-casa-gold/40 bg-casa-gold/10 text-casa-navy'
                                  : 'border-casa-border text-casa-muted hover:bg-casa-surface'
                              )}
                            >
                              {planned ? `Planned: ${label}` : label}
                            </button>
                          )
                        })}
                        <button
                          type="button"
                          onClick={() => loadRecipeIntoChecklist(recipe)}
                          className="px-2.5 py-1 rounded-pill border border-casa-border text-[11px] text-casa-muted hover:bg-casa-surface transition-colors"
                        >
                          Add again
                        </button>
                        <button
                          type="button"
                          onClick={() => void openRecipeForCookMode(recipe)}
                          className="px-2.5 py-1 rounded-pill border border-casa-gold/40 bg-casa-gold/10 text-[11px] font-medium text-casa-navy hover:bg-casa-gold/15 transition-colors inline-flex items-center gap-1"
                        >
                          <ChefHat size={12} />
                          Cook mode
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setIsAddPanelOpen((current) => !current)}
        className="fixed right-5 bottom-[calc(var(--spacing-nav-height)+1rem+var(--vk-height,0px)+var(--vk-gap,0px))] lg:bottom-[calc(1.5rem+var(--vk-height,0px)+var(--vk-gap,0px))] z-[60] w-14 h-14 rounded-full bg-casa-gold text-casa-navy font-semibold border border-casa-gold/50 shadow-[0_1px_0_rgba(255,255,255,0.25)_inset] flex items-center justify-center hover:brightness-110 transition-all"
        aria-label={isAddPanelOpen ? 'Close add panel' : 'Open add panel'}
        title={isAddPanelOpen ? 'Close add panel' : 'Add items'}
      >
        {isAddPanelOpen ? <X size={22} /> : <Plus size={24} />}
      </button>
      {cookView && (
        <div className="fixed inset-0 z-[70] bg-casa-navy/30">
          <div className="absolute right-4 top-4 bottom-4 w-[min(38rem,calc(100vw-2rem))] rounded-2xl border border-casa-border bg-casa-surface shadow-modal flex flex-col">
            <div className="px-4 py-3 border-b border-casa-divider flex items-center justify-between gap-2">
              <div>
                <p className="text-body font-semibold text-casa-navy">{cookView.recipe.name}</p>
                <p className="text-[11px] text-casa-muted">
                  Step {cookView.stepIndex + 1} of {Math.max(1, cookView.recipe.steps.length)}
                  {cookView.recipe.cook_time ? ` · ${cookView.recipe.cook_time}` : ''}
                  {cookView.recipe.servings ? ` · ${cookView.recipe.servings}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {cookView.recipe.source_url && (
                  <a
                    href={cookView.recipe.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1.5 rounded-button border border-casa-border bg-casa-bg text-[11px] text-casa-muted hover:bg-casa-main transition-colors inline-flex items-center gap-1"
                  >
                    <ExternalLink size={12} />
                    Original
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCookView(null)
                    setCookTimer(null)
                  }}
                  className="h-9 w-9 rounded-full border border-casa-border bg-casa-bg text-casa-muted hover:bg-casa-main transition-colors flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              <div className="rounded-2xl border border-casa-border bg-casa-bg p-4">
                <p className="text-body-sm text-casa-navy leading-relaxed">
                  {cookView.recipe.steps[cookView.stepIndex]?.instruction ?? 'No instruction available.'}
                </p>
                {cookStepTimerOptions.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {cookStepTimerOptions.map((timer, index) => (
                      <button
                        key={`${timer.label}-${index}`}
                        type="button"
                        onClick={() => setCookTimer({
                          totalSeconds: timer.seconds,
                          remainingSeconds: timer.seconds,
                          label: timer.label,
                        })}
                        className="px-2 py-1 rounded-pill border border-casa-border bg-casa-surface text-[11px] text-casa-muted hover:bg-casa-main transition-colors inline-flex items-center gap-1"
                      >
                        <Clock3 size={11} />
                        {timer.label}
                      </button>
                    ))}
                  </div>
                )}
                {cookTimer && (
                  <div className="mt-2 rounded-xl border border-casa-gold/40 bg-casa-gold/10 px-2.5 py-1.5 flex items-center justify-between gap-2">
                    <p className="text-[11px] text-casa-navy">
                      Timer ({cookTimer.label}): <span className="font-semibold">{formatTimer(cookTimer.remainingSeconds)}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setCookTimer(null)}
                      className="text-[11px] text-casa-muted hover:text-casa-text"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {cookView.recipe.ingredients.map((ingredient, index) => (
                  <div key={`${cookView.recipe.id}-${index}`} className="rounded-xl border border-casa-border bg-casa-bg px-2 py-1.5">
                    <p className="text-[11px] text-casa-text">
                      {[ingredient.quantity, ingredient.unit].filter(Boolean).join(' ')} {(ingredient.name || ingredient.raw_text).trim()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-casa-divider flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setCookTimer(null)
                  setCookView((current) => current
                    ? { ...current, stepIndex: Math.max(0, current.stepIndex - 1) }
                    : current)
                }}
                disabled={cookView.stepIndex <= 0}
                className="px-3 py-2 rounded-button border border-casa-border text-body-sm font-semibold text-casa-navy hover:bg-casa-main transition-colors disabled:opacity-50 inline-flex items-center gap-1"
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <button
                type="button"
                onClick={() => {
                  setCookTimer(null)
                  setCookView((current) => current
                    ? { ...current, stepIndex: Math.min(current.recipe.steps.length - 1, current.stepIndex + 1) }
                    : current)
                }}
                disabled={cookView.stepIndex >= cookView.recipe.steps.length - 1}
                className="px-3 py-2 rounded-button bg-casa-gold text-white text-body-sm font-semibold hover:brightness-110 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
      {dragState && (
        <div
          className="fixed z-[90] pointer-events-none px-3 py-2 rounded-xl bg-casa-navy text-white text-body-sm shadow-modal"
          style={{ left: dragState.x + 14, top: dragState.y + 14 }}
        >
          Move “{dragState.itemName}”
        </div>
      )}
    </div>
  )
}
