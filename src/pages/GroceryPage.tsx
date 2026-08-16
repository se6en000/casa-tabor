import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Link2,
  Upload,
  BookOpen,
  ChefHat,
  Camera,
  Leaf,
  Milk,
  Beef,
  Croissant,
  Snowflake,
  Package,
  Coffee,
  Popcorn,
  Sandwich,
  House,
  HeartPulse,
  Baby as BabyIcon,
  PawPrint,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../utils/cn'
import { useGroceryList, GROCERY_CATEGORIES, type GroceryItem } from '../hooks/useGroceryList'
import { inferCategoryFromName } from '../utils/groceryCategorization'
import GroceryCommandBar from '../components/grocery/GroceryCommandBar'
import GroceryAisleGrid from '../components/grocery/GroceryAisleGrid'
import MobileGroceryView from '../components/mobile/MobileGroceryView'
import { normalizeRecipeIngredientFields } from '../utils/recipeIngredientParsing'
import { supabase } from '../lib/supabase'
import { formatSupabaseError } from '../lib/formatSupabaseError'
import { usePageVisibility } from '../hooks/usePageVisibility'
import {
  Alert,
  Button,
  Checkbox,
  IconButton,
  Card,
  Chip,
  Input,
  Modal,
  PageShell,
  Sheet,
  Text,
  Toast,
  Textarea,
} from '../components/ui'
import {
  appendPantryInventoryAudit,
  normalizePackageUnit,
  normalizePantryKey,
  type PantryInventoryAuditEntry,
} from '../lib/pantryInventoryUtils'
import {
  normalizeGroceryNameKey,
} from '../utils/groceryPredictionDeferrals'
import recipeFallbackHero from '../assets/hero.png'

// Background dedupe is a full-table scan + write. It only needs to catch
// duplicates introduced by adds/imports/iOS merges, not run on every tick.
// Throttle background dedupe to at most once per this interval; the manual
// "Clean + Sync" button still forces a dedupe pass regardless.
const DEDUPE_MIN_INTERVAL_MS = 10 * 60_000
const SYNC_LAST_DEDUPE_AT_KEY = 'grocery-sync-last-dedupe-at-v1'
const QUICK_ADD_TOUCH_ITEMS = ['Milk', 'Eggs', 'Bread', 'Bananas', 'Chicken', 'Coffee']
const CHECKED_ITEM_DISMISS_MS = 3_000
const CHECKED_ITEM_EXIT_ANIMATION_MS = 320
const LOW_CONFIDENCE_REVIEW_THRESHOLD = 0.82
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
type CategoryVisual = {
  icon: typeof ShoppingCart
  subtitle: string
}

const DEFAULT_CATEGORY_VISUAL: CategoryVisual = {
  icon: ShoppingCart,
  subtitle: 'Auto-organized for faster list scanning',
}

// Icon + subtitle only — bg/fg colors come from categoryIconBadgeClassName()
// (src/utils/groceryVisuals.ts), a typed semantic tone map backed entirely by
// canonical casa-* tokens so category badges stay correct in both themes.
const CATEGORY_VISUAL_BY_KEY: Record<string, CategoryVisual> = {
  produce: { icon: Leaf, subtitle: 'Fresh items • entry side' },
  dairy: { icon: Milk, subtitle: 'Cold essentials • back wall' },
  meat: { icon: Beef, subtitle: 'Protein picks • butcher lane' },
  bakery: { icon: Croissant, subtitle: 'Bread & baked goods' },
  frozen: { icon: Snowflake, subtitle: 'Frozen staples' },
  pantry: { icon: Package, subtitle: 'Shelf staples • center aisles' },
  beverages: { icon: Coffee, subtitle: 'Drinks & hydration' },
  snacks: { icon: Popcorn, subtitle: 'Quick bites & treats' },
  deli: { icon: Sandwich, subtitle: 'Prepared foods' },
  household: { icon: House, subtitle: 'Home & cleaning' },
  'personal-care': { icon: HeartPulse, subtitle: 'Health & body' },
  baby: { icon: BabyIcon, subtitle: 'Baby essentials' },
  pet: { icon: PawPrint, subtitle: 'Pet supplies' },
  other: { icon: ShoppingCart, subtitle: 'Everything else' },
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
  image_url: string | null
  image_urls: string[]
  primary_image_index: number | null
  ingredients: RecipeDraftIngredient[]
  steps: RecipeDraftStep[]
}

type RecipeImportCaptureFile = {
  id: string
  name: string
  mimeType: string
  fileBase64: string
  previewUrl: string
}

type RecipePreset = {
  id: string
  name: string
  source_type: 'url' | 'image' | 'pdf' | 'manual'
  source_url: string | null
  image_url: string | null
  image_urls: string[]
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

type PantryInventoryEntry = {
  name: string
  category: string
  package_unit: string | null
  package_size: string | null
  on_hand_packages: number
  low_stock_threshold: number
  updated_at: string
}

type ReconciledCheckedItems = Record<string, string>
type PantryReconcileMode = 'planner-only' | 'all-done'
type PantryDepletionStatus = 'low' | 'out'
type PantryReviewStatus = 'ok' | PantryDepletionStatus
type PantryReconcileDraftRow = {
  item_id: string
  name: string
  category: string
  package_unit: string | null
  package_size: string | null
  package_count: number
  source: 'checked-item' | 'manual-depletion'
  review_status: PantryReviewStatus
}

type PantryReconcileDraft = {
  mode: PantryReconcileMode
  rows: PantryReconcileDraftRow[]
  skipped_already_reconciled: number
  pantry_inventory: Record<string, PantryInventoryEntry>
  reconciled_items: ReconciledCheckedItems
  audit_log: PantryInventoryAuditEntry[]
}

function defaultLowStockThreshold(category: string): number {
  if (category === 'pantry') return 0.5
  if (category === 'other') return 0.35
  return 0.25
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

function splitCategoryLabel(raw: string): string {
  const trimmed = raw.trim()
  const match = trimmed.match(/^(\S+)\s+(.*)$/u)
  if (!match) return trimmed
  const firstToken = match[1] ?? ''
  if (/^[^\p{L}\p{N}]+$/u.test(firstToken)) {
    return String(match[2] ?? '').trim()
  }
  return trimmed
}

// getDepletionVisual now lives in src/utils/groceryVisuals.ts (pure, token-backed, unit-tested).

function getRecipeDraftImage(recipe: { id?: string; name: string; image_url: string | null; image_urls?: string[]; primary_image_index?: number | null }): string {
  const gallery = Array.isArray(recipe.image_urls) ? recipe.image_urls : []
  const preferred = typeof recipe.primary_image_index === 'number'
    ? (gallery[Math.max(0, recipe.primary_image_index)] ?? null)
    : null
  const fallbackGallery = gallery[0] ?? null
  const imageChoice = preferred ?? fallbackGallery
  if (imageChoice) return imageChoice
  if (recipe.image_url) return recipe.image_url
  const seed = recipe.id ?? recipe.name
  return `https://loremflickr.com/1200/900/food?lock=${encodeURIComponent(seed)}`
}

function normalizeRecipeImageUrls(imageUrlsRaw: unknown, imageUrlRaw: unknown): { imageUrls: string[]; primaryIndex: number | null } {
  const urls = new Set<string>()
  if (Array.isArray(imageUrlsRaw)) {
    for (const row of imageUrlsRaw) {
      if (typeof row !== 'string') continue
      const trimmed = row.trim()
      if (!trimmed) continue
      urls.add(trimmed)
    }
  }
  const imageUrl = typeof imageUrlRaw === 'string' ? imageUrlRaw.trim() : ''
  if (imageUrl) urls.add(imageUrl)
  const imageUrls = Array.from(urls)
  const primaryIndex = imageUrl
    ? Math.max(0, imageUrls.findIndex((row) => row === imageUrl))
    : (imageUrls.length > 0 ? 0 : null)
  return { imageUrls, primaryIndex }
}

function isPersistableImageUrl(url: string): boolean {
  const candidate = url.trim()
  if (!candidate || candidate.length > 2048) return false
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isLikelyImageFile(file: File): boolean {
  if ((file.type ?? '').toLowerCase().startsWith('image/')) return true
  return /\.(png|jpe?g|webp|gif|heic|heif|bmp|avif)$/i.test(file.name)
}

function shouldAcceptImportFile(file: File, source: 'upload' | 'camera'): { isPdf: boolean; isImage: boolean } {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const isImage = isLikelyImageFile(file) || (source === 'camera' && file.size > 0 && !isPdf)
  return { isPdf, isImage }
}

function triggerFileInput(ref: { current: HTMLInputElement | null }) {
  const node = ref.current
  if (!node) return
  node.value = ''
  node.click()
}

function renumberDraftSteps(steps: RecipeDraftStep[]): RecipeDraftStep[] {
  return steps.map((step, index) => ({
    ...step,
    step_number: index + 1,
  }))
}

export default function GroceryPage() {
  const isPageVisible = usePageVisibility()
  const location = useLocation()
  const navigate = useNavigate()
  const {
    items,
    defaultListId,
    uncheckedCount,
    checkedCount,
    isLoading,
    error: listError,
    dataUpdatedAt,
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
    refetchInterval: isPageVisible ? 10 * 60_000 : false,
  })

  const { data: recipeLibrary = [], refetch: refetchRecipeLibrary } = useQuery({
    queryKey: ['recipe-library'],
    queryFn: async () => {
      const { data: recipes, error: recipesError } = await supabase
        .from('recipes')
        .select('id,name,source_type,source_url,image_url,servings,cook_time,last_used_at,created_at')
        .order('last_used_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(100)
      if (recipesError) throw recipesError
      const recipeRows = (recipes ?? []) as Array<{
        id: string
        name: string
        source_type: 'url' | 'image' | 'pdf' | 'manual'
        source_url: string | null
        image_url: string | null
        servings: string | null
        cook_time: string | null
        last_used_at: string | null
        created_at: string
      }>
      if (recipeRows.length === 0) return [] as RecipePreset[]

      const ids = recipeRows.map((row) => row.id)
      const [{ data: ingredientRows, error: ingredientsError }, { data: stepRows, error: stepsError }, { data: imageRows, error: imageRowsError }] = await Promise.all([
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
        supabase
          .from('recipe_images')
          .select('recipe_id,image_url,is_primary,sort_order')
          .in('recipe_id', ids)
          .order('sort_order', { ascending: true }),
      ])
      if (ingredientsError) throw ingredientsError
      if (stepsError) throw stepsError
      if (imageRowsError && imageRowsError.code !== '42P01') throw imageRowsError

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

      const imagesByRecipe = new Map<string, Array<{ image_url: string; is_primary: boolean; sort_order: number }>>()
      for (const row of (imageRows ?? []) as Array<{
        recipe_id: string
        image_url: string
        is_primary: boolean
        sort_order: number
      }>) {
        const imageUrl = String(row.image_url ?? '').trim()
        if (!imageUrl) continue
        const bucket = imagesByRecipe.get(row.recipe_id) ?? []
        bucket.push({
          image_url: imageUrl,
          is_primary: Boolean(row.is_primary),
          sort_order: Number(row.sort_order ?? bucket.length),
        })
        imagesByRecipe.set(row.recipe_id, bucket)
      }

      return recipeRows.map((row) => ({
        ...row,
        image_urls: (() => {
          const fromTable = imagesByRecipe.get(row.id) ?? []
          const ordered = [...fromTable].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order)
          const urls = ordered.map((entry) => entry.image_url)
          if (row.image_url && !urls.includes(row.image_url)) urls.unshift(row.image_url)
          return urls
        })(),
        ingredients: ingredientsByRecipe.get(row.id) ?? [],
        steps: stepsByRecipe.get(row.id) ?? [],
      }))
    },
    staleTime: 60_000,
    refetchInterval: isPageVisible ? 2 * 60_000 : false,
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
    refetchInterval: isPageVisible ? 2 * 60_000 : false,
  })

  const [inputValue, setInputValue] = useState('')
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false)
  const [addPanelMode, setAddPanelMode] = useState<'quick' | 'recipe' | 'library'>('quick')
  const [recipeImportStep, setRecipeImportStep] = useState<1 | 2 | 3>(1)
  const [recipeUrlInput, setRecipeUrlInput] = useState('')
  const [recipeImporting, setRecipeImporting] = useState(false)
  const [recipeImportError, setRecipeImportError] = useState<string | null>(null)
  const [parsedRecipe, setParsedRecipe] = useState<RecipeDraft | null>(null)
  const [recipeExtraImageUrl, setRecipeExtraImageUrl] = useState('')
  const [recipeImportFiles, setRecipeImportFiles] = useState<RecipeImportCaptureFile[]>([])
  const [recipeMealPhotoIndex, setRecipeMealPhotoIndex] = useState<number | null>(null)
  const [selectedRecipeIngredientIndexes, setSelectedRecipeIngredientIndexes] = useState<Set<number>>(new Set())
  const [savingRecipe, setSavingRecipe] = useState(false)
  const [recipeScale, setRecipeScale] = useState(1)
  const syncError = listError ? (listError instanceof Error ? listError.message : 'Sync failed') : null
  const [reconcilingPantry, setReconcilingPantry] = useState(false)
  const [pantryReconcileDraft, setPantryReconcileDraft] = useState<PantryReconcileDraft | null>(null)
  const [pantryReconcileMessage, setPantryReconcileMessage] = useState<string | null>(null)
  const [pantryReconcileError, setPantryReconcileError] = useState<string | null>(null)
  const [groceryToastMessage, setGroceryToastMessage] = useState<string | null>(null)
  const [expandedReconcileQtyIds, setExpandedReconcileQtyIds] = useState<Set<string>>(new Set())
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
  const inputRef = useRef<HTMLInputElement>(null)
  const recipeFileInputRef = useRef<HTMLInputElement>(null)
  const recipeCameraInputRef = useRef<HTMLInputElement>(null)
  const syncInFlightRef = useRef(false)
  const dismissBatchTimerRef = useRef<number | null>(null)
  const dismissExitTimerRef = useRef<number | null>(null)
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set())
  const [dismissingExitingIds, setDismissingExitingIds] = useState<Set<string>>(new Set())
  const dismissingIdsRef = useRef<Set<string>>(new Set())
  const dismissingExitingIdsRef = useRef<Set<string>>(new Set())
  const hasRecipeImportSource = recipeUrlInput.trim().length > 0 || recipeImportFiles.length > 0

  const activeItems = items.filter((item) => !item.checked)
  const pantryReconcileRowsByCategory = useMemo(() => {
    if (!pantryReconcileDraft) return [] as Array<{ category: string; rows: PantryReconcileDraftRow[] }>
    const grouped = new Map<string, PantryReconcileDraftRow[]>()
    for (const row of pantryReconcileDraft.rows) {
      const bucket = grouped.get(row.category)
      if (bucket) bucket.push(row)
      else grouped.set(row.category, [row])
    }
    return Array.from(grouped.entries())
      .map(([category, rows]) => ({
        category,
        rows: [...rows].sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category))
  }, [pantryReconcileDraft])

  const findMergeSuggestion = useCallback((name: string) => {
    const normalized = normalizeGroceryNameKey(name)
    if (!normalized) return null
    const exact = activeItems.find((item) => normalizeGroceryNameKey(item.name) === normalized)
    if (exact) return exact
    const fuzzy = activeItems.find((item) => {
      const existing = normalizeGroceryNameKey(item.name)
      return existing.includes(normalized) || normalized.includes(existing)
    })
    return fuzzy ?? null
  }, [activeItems])

  const mergeSuggestion = findMergeSuggestion(inputValue)
  const activeNameSet = useMemo(
    () => new Set(activeItems.map((item) => normalizeGroceryNameKey(item.name))),
    [activeItems]
  )

  const pantryLikelyOwnedNames = useMemo(() => {
    const recentWindowMs = 21 * 24 * 60 * 60 * 1000
    const now = Date.now()
    const names = new Set<string>()
    for (const row of historyRows) {
      if (!row.checked) continue
      const normalized = normalizeGroceryNameKey(row.name)
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
      const normalized = normalizeGroceryNameKey(ingredient.name || ingredient.raw_text)
      if (!normalized) return
      if (activeNameSet.has(normalized)) return
      if (pantryLikelyOwnedNames.has(normalized)) return
      selected.add(index)
    })
    return selected
  }, [activeNameSet, pantryLikelyOwnedNames])

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
      setGroceryToastMessage(`“${suggestion.name}” is already on your list`)
      return
    }
    const category = inferCategoryFromName(trimmedName)
    addItem.mutate({ list_id: defaultListId, name: trimmedName, quantity: null, unit: null, category, checked: false, notes: null })
    if (options?.clearInput !== false) {
      setInputValue('')
      inputRef.current?.focus()
    }
    setGroceryToastMessage(`Added “${trimmedName}” to ${category}`)
  }, [addItem, defaultListId, findMergeSuggestion, spotlightItem])

  const handleAddItem = () => {
    addItemByName(inputValue, { spotlightOnDuplicate: true, clearInput: true })
  }

  const handleQuickAdd = (name: string) => {
    addItemByName(name, { spotlightOnDuplicate: true, clearInput: true })
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
    files?: Array<{ fileBase64: string; mimeType: string }>
    mealPhotoIndex?: number | null
    mimeType?: string
    fallbackName?: string
  }): Promise<boolean> => {
    setRecipeImportError(null)
    setRecipeImporting(true)
    try {
      const { data, error } = await supabase.functions.invoke('extract-recipe-content', {
        body: {
          source_type: payload.sourceType,
          source_url: payload.sourceUrl ?? null,
          file_base64: payload.fileBase64 ?? null,
          files: (payload.files ?? []).map((file) => ({
            file_base64: file.fileBase64,
            mime_type: file.mimeType,
          })),
          meal_photo_index: payload.mealPhotoIndex ?? null,
          mime_type: payload.mimeType ?? null,
          fallback_name: payload.fallbackName ?? 'Imported recipe',
        },
      })
      if (error) throw error

      const recipeRaw = data?.recipe as Record<string, unknown> | undefined
      if (!recipeRaw) throw new Error('No recipe extracted')

      const ingredientsRaw = Array.isArray(recipeRaw.ingredients) ? recipeRaw.ingredients : []
      const stepsRaw = Array.isArray(recipeRaw.steps) ? recipeRaw.steps : []
      const { imageUrls, primaryIndex } = normalizeRecipeImageUrls(recipeRaw.image_urls, recipeRaw.image_url)
      const recipe: RecipeDraft = {
        name: String(recipeRaw.name ?? 'Imported recipe').trim() || 'Imported recipe',
        servings: typeof recipeRaw.servings === 'string' ? recipeRaw.servings : null,
        cook_time: typeof recipeRaw.cook_time === 'string' ? recipeRaw.cook_time : null,
        confidence: Math.max(0, Math.min(1, Number(recipeRaw.confidence ?? 0.7) || 0.7)),
        source_type: payload.sourceType,
        source_url: payload.sourceType === 'url' ? (payload.sourceUrl ?? null) : null,
        image_url: primaryIndex === null ? null : (imageUrls[primaryIndex] ?? null),
        image_urls: imageUrls,
        primary_image_index: primaryIndex,
        ingredients: ingredientsRaw
          .map((row) => {
            if (!row || typeof row !== 'object') return null
            const item = row as Record<string, unknown>
            const rawText = String(item.raw_text ?? '').trim()
            if (!rawText) return null
            const normalized = normalizeRecipeIngredientFields({
              rawText,
              name: typeof item.name === 'string' ? item.name : null,
              quantity: typeof item.quantity === 'string' ? item.quantity : null,
              unit: typeof item.unit === 'string' ? item.unit : null,
            })
            return {
              raw_text: rawText,
              name: normalized.name,
              quantity: normalized.quantity,
              unit: normalized.unit,
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
          .map((step, index) => ({ ...step, step_number: index + 1 })),
      }

      if (recipe.ingredients.length === 0) {
        throw new Error('No ingredients found in this recipe')
      }
      const hasChosenMealPhoto = Array.isArray(payload.files) && payload.files.length > 0 && payload.mealPhotoIndex !== null && payload.mealPhotoIndex !== undefined
      if (!hasChosenMealPhoto) {
        const { data: imageSearchData, error: imageSearchError } = await supabase.functions.invoke('recipe-image-search', {
          body: { query: recipe.name, limit: 8 },
        })
        if (!imageSearchError && Array.isArray(imageSearchData?.results)) {
          const extraUrls = (imageSearchData.results as unknown[])
            .map((row: unknown) => {
              if (!row || typeof row !== 'object') return null
              const candidate = (row as { url?: unknown }).url
              const url = typeof candidate === 'string'
                ? candidate.trim()
                : ''
              return url || null
            })
            .filter((url: string | null): url is string => Boolean(url))
          if (extraUrls.length > 0) {
            const merged = Array.from(new Set([...recipe.image_urls, ...extraUrls]))
            recipe.image_urls = merged
            if (!recipe.image_url && merged[0]) {
              recipe.image_url = merged[0]
              if (recipe.primary_image_index === null) {
                recipe.primary_image_index = 0
              }
            }
          }
        }
      }
      setParsedRecipe(recipe)
      setRecipeExtraImageUrl('')
      setSelectedRecipeIngredientIndexes(defaultSelectedRecipeIndexes(recipe))
      setRecipeScale(1)
      setAddPanelMode('recipe')
      setIsAddPanelOpen(true)
      setRecipeImportStep(3)
      return true
    } catch (err) {
      setRecipeImportError(err instanceof Error ? err.message : 'Recipe import failed')
      return false
    } finally {
      setRecipeImporting(false)
    }
  }, [defaultSelectedRecipeIndexes])

  const addRecipeImportFiles = useCallback(async (files: File[], source: 'upload' | 'camera') => {
    if (files.length === 0) {
      if (source === 'camera') {
        setRecipeImportError('No photo was captured. Please try again.')
      }
      return
    }
    setRecipeImportError(null)
    const nextFiles: RecipeImportCaptureFile[] = []
    for (const file of files) {
      const { isPdf, isImage } = shouldAcceptImportFile(file, source)
      if (!isPdf && !isImage) continue
      const buffer = await file.arrayBuffer()
      const base64 = arrayBufferToBase64(buffer)
      const mimeType = file.type || (isPdf ? 'application/pdf' : 'image/jpeg')
      const previewUrl = isImage ? `data:${mimeType};base64,${base64}` : recipeFallbackHero
      nextFiles.push({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mimeType,
        fileBase64: base64,
        previewUrl,
      })
    }
    if (nextFiles.length === 0) {
      setRecipeImportError(source === 'camera' ? 'Could not read that photo. Please try another shot.' : 'Please upload recipe photos or a PDF')
      return
    }
    setRecipeImportFiles((current) => [...current, ...nextFiles])
    setRecipeImportStep((current) => (current < 2 ? 2 : current))
  }, [])

  const removeRecipeImportFile = useCallback((fileId: string) => {
    setRecipeImportFiles((current) => {
      const next = current.filter((file) => file.id !== fileId)
      setRecipeMealPhotoIndex((existing) => {
        if (next.length === 0 || existing === null) return null
        return Math.max(0, Math.min(existing, next.length - 1))
      })
      return next
    })
  }, [])

  const runRecipeImportFromCurrentSources = useCallback(async () => {
    const url = recipeUrlInput.trim()
    if (!url && recipeImportFiles.length === 0) {
      setRecipeImportError('Add a URL or one or more photos first.')
      return
    }
    if (recipeImportFiles.length > 0) {
      const hasPdf = recipeImportFiles.some((file) => file.mimeType === 'application/pdf')
      const sourceType: 'image' | 'pdf' = hasPdf ? 'pdf' : 'image'
      await importRecipeFromSource({
        sourceType,
        files: recipeImportFiles.map((file) => ({ fileBase64: file.fileBase64, mimeType: file.mimeType })),
        mealPhotoIndex: recipeMealPhotoIndex,
        fallbackName: 'Captured recipe',
      })
      return
    }
    await importRecipeFromSource({ sourceType: 'url', sourceUrl: url, fallbackName: 'Web recipe' })
  }, [importRecipeFromSource, recipeImportFiles, recipeMealPhotoIndex, recipeUrlInput])

  const addSelectedRecipeIngredientsToCart = useCallback((recipe: RecipeDraft) => {
    if (!defaultListId) return
    recipe.ingredients.forEach((ingredient, index) => {
      if (!selectedRecipeIngredientIndexes.has(index)) return
      const name = (ingredient.name || ingredient.raw_text).trim()
      if (!name) return
      if (findMergeSuggestion(name)) return
      const category = inferCategoryFromName(name)
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

  const updateParsedStep = useCallback((index: number, instruction: string) => {
    setParsedRecipe((current) => {
      if (!current) return current
      const nextSteps = current.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, instruction } : step)
      return { ...current, steps: renumberDraftSteps(nextSteps) }
    })
  }, [])

  const moveParsedStep = useCallback((index: number, direction: -1 | 1) => {
    setParsedRecipe((current) => {
      if (!current) return current
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= current.steps.length) return current
      const nextSteps = [...current.steps]
      const [moved] = nextSteps.splice(index, 1)
      nextSteps.splice(targetIndex, 0, moved)
      return { ...current, steps: renumberDraftSteps(nextSteps) }
    })
  }, [])

  const addParsedStepAfter = useCallback((index: number) => {
    setParsedRecipe((current) => {
      if (!current) return current
      const nextSteps = [...current.steps]
      nextSteps.splice(index + 1, 0, { step_number: index + 2, instruction: '' })
      return { ...current, steps: renumberDraftSteps(nextSteps) }
    })
  }, [])

  const removeParsedStep = useCallback((index: number) => {
    setParsedRecipe((current) => {
      if (!current) return current
      if (current.steps.length <= 1) return current
      const nextSteps = current.steps.filter((_, stepIndex) => stepIndex !== index)
      return { ...current, steps: renumberDraftSteps(nextSteps) }
    })
  }, [])

  const choosePrimaryRecipeImage = useCallback((index: number) => {
    setParsedRecipe((current) => {
      if (!current) return current
      const boundedIndex = Math.max(0, Math.min(index, current.image_urls.length - 1))
      if (current.primary_image_index === boundedIndex) {
        return {
          ...current,
          primary_image_index: null,
          image_url: null,
        }
      }
      return {
        ...current,
        primary_image_index: boundedIndex,
        image_url: current.image_urls[boundedIndex] ?? null,
      }
    })
  }, [])

  const addRecipeImageUrl = useCallback(() => {
    const candidate = recipeExtraImageUrl.trim()
    if (!candidate) return
    try {
      const parsed = new URL(candidate)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid protocol')
      }
    } catch {
      setRecipeImportError('Please add a valid image URL (http/https).')
      return
    }
    setRecipeImportError(null)
    setParsedRecipe((current) => {
      if (!current) return current
      if (current.image_urls.includes(candidate)) return current
      const nextImageUrls = [...current.image_urls, candidate]
      const nextPrimaryIndex = current.primary_image_index === null
        ? null
        : (current.image_urls.length === 0 ? 0 : current.primary_image_index)
      return {
        ...current,
        image_urls: nextImageUrls,
        primary_image_index: nextPrimaryIndex,
        image_url: nextPrimaryIndex === null ? null : (nextImageUrls[nextPrimaryIndex] ?? null),
      }
    })
    setRecipeExtraImageUrl('')
  }, [recipeExtraImageUrl])

  const saveRecipePreset = useCallback(async (options: { addSelectedToCart: boolean }) => {
    if (!parsedRecipe) return
    setSavingRecipe(true)
    setRecipeImportError(null)
    try {
      const cleanedSteps = renumberDraftSteps(
        parsedRecipe.steps
          .map((step) => ({ ...step, instruction: step.instruction.trim() }))
          .filter((step) => step.instruction.length > 0),
      )
      if (cleanedSteps.length === 0) {
        throw new Error('Add at least one direction step before saving.')
      }
      const normalizedImageUrls = Array.from(new Set(parsedRecipe.image_urls.map((url) => url.trim()).filter(Boolean)))
      const selectedPrimaryImageCandidate = parsedRecipe.primary_image_index === null
        ? null
        : (normalizedImageUrls[parsedRecipe.primary_image_index] ?? parsedRecipe.image_url ?? null)
      const persistableImageUrls = Array.from(new Set(normalizedImageUrls.filter((url) => isPersistableImageUrl(url))))
      const selectedPrimaryImage = selectedPrimaryImageCandidate && isPersistableImageUrl(selectedPrimaryImageCandidate)
        ? selectedPrimaryImageCandidate
        : (persistableImageUrls[0] ?? null)
      const { data: recipeRow, error: recipeError } = await supabase
        .from('recipes')
        .insert({
          name: parsedRecipe.name,
          source_type: parsedRecipe.source_type,
          source_url: parsedRecipe.source_url,
          image_url: selectedPrimaryImage,
          servings: parsedRecipe.servings,
          cook_time: parsedRecipe.cook_time,
          instructions_text: cleanedSteps.map((step) => `${step.step_number}. ${step.instruction}`).join('\n'),
          last_used_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (recipeError) throw new Error(`Saving recipe header failed: ${formatSupabaseError(recipeError, 'Unable to create recipe')}`)

      const recipeId = String(recipeRow.id)
      const ingredientRows = parsedRecipe.ingredients.map((ingredient, index) => {
        const normalized = normalizeRecipeIngredientFields({
          rawText: ingredient.raw_text,
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
        })
        return {
          recipe_id: recipeId,
          raw_text: ingredient.raw_text,
          name: normalized.name,
          quantity: normalized.quantity,
          unit: normalized.unit,
          optional: ingredient.optional,
          sort_order: index,
        }
      })
      if (ingredientRows.length > 0) {
        const { error: ingredientError } = await supabase.from('recipe_ingredients').insert(ingredientRows)
        if (ingredientError) throw new Error(`Saving ingredients failed: ${formatSupabaseError(ingredientError, 'Unable to save ingredients')}`)
      }

      const stepRows = cleanedSteps.map((step, index) => ({
        recipe_id: recipeId,
        step_number: index + 1,
        instruction: step.instruction,
      }))
      if (stepRows.length > 0) {
        const { error: stepError } = await supabase.from('recipe_steps').insert(stepRows)
        if (stepError) throw new Error(`Saving directions failed: ${formatSupabaseError(stepError, 'Unable to save directions')}`)
      }

      if (persistableImageUrls.length > 0) {
        const imageRows = persistableImageUrls.map((imageUrl, index) => ({
          recipe_id: recipeId,
          image_url: imageUrl,
          is_primary: imageUrl === selectedPrimaryImage,
          sort_order: index,
        }))
        const { error: imageError } = await supabase.from('recipe_images').insert(imageRows)
        const missingRecipeImagesTable = imageError?.code === '42P01' || imageError?.code === 'PGRST205'
        if (imageError && !missingRecipeImagesTable) {
          throw new Error(`Saving recipe photos failed: ${formatSupabaseError(imageError, 'Unable to save recipe photos')}`)
        }
      }

      if (options.addSelectedToCart) {
        addSelectedRecipeIngredientsToCart(parsedRecipe)
      }

      await refetchRecipeLibrary()
      setParsedRecipe(null)
      setRecipeExtraImageUrl('')
      setRecipeImportFiles([])
      setRecipeMealPhotoIndex(null)
      setRecipeUrlInput('')
      setRecipeImportStep(1)
      setSelectedRecipeIngredientIndexes(new Set())
      setRecipeScale(1)
      setAddPanelMode('library')
    } catch (err) {
      console.error('[GroceryPage] saveRecipePreset failed', err)
      setRecipeImportError(formatSupabaseError(err, 'Could not save recipe'))
    } finally {
      setSavingRecipe(false)
    }
  }, [addSelectedRecipeIngredientsToCart, parsedRecipe, refetchRecipeLibrary])

  const openRecipeForCookMode = useCallback(async (recipe: RecipePreset) => {
    await supabase
      .from('recipes')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', recipe.id)
    void refetchRecipeLibrary()
    navigate(`/cook?recipeId=${recipe.id}`)
  }, [navigate, refetchRecipeLibrary])

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
    const imageUrls = recipe.image_urls.length > 0
      ? recipe.image_urls
      : recipe.image_url
        ? [recipe.image_url]
        : []
    const primaryImageIndex = recipe.image_url
      ? Math.max(0, imageUrls.findIndex((url) => url === recipe.image_url))
      : null
    const draft: RecipeDraft = {
      name: recipe.name,
      servings: recipe.servings,
      cook_time: recipe.cook_time,
      confidence: 0.95,
      source_type: recipe.source_type === 'manual' ? 'url' : recipe.source_type,
      source_url: recipe.source_url,
      image_url: primaryImageIndex === null ? null : (imageUrls[primaryImageIndex] ?? recipe.image_url),
      image_urls: imageUrls,
      primary_image_index: primaryImageIndex,
      ingredients: recipe.ingredients.map((ingredient) => {
        const normalized = normalizeRecipeIngredientFields({
          rawText: ingredient.raw_text,
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
        })
        return {
          ...ingredient,
          name: normalized.name,
          quantity: normalized.quantity,
          unit: normalized.unit,
        }
      }),
      steps: recipe.steps,
    }
    setParsedRecipe(draft)
    setRecipeExtraImageUrl('')
    setSelectedRecipeIngredientIndexes(defaultSelectedRecipeIndexes(draft))
    setRecipeScale(1)
    setRecipeImportStep(3)
    setAddPanelMode('recipe')
    setIsAddPanelOpen(true)
  }, [defaultSelectedRecipeIndexes])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('add') !== 'recipe') return
    setIsAddPanelOpen(true)
    setAddPanelMode('recipe')
    setRecipeImportStep(1)
    params.delete('add')
    const nextSearch = params.toString()
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true })
  }, [location.pathname, location.search, navigate])

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
    dismissingExitingIdsRef.current = dismissingExitingIds
  }, [dismissingExitingIds])

  useEffect(() => {
    return () => {
      document.body.style.userSelect = ''
    }
  }, [])

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
    setDismissingIds((prev) => {
      const next = new Set(prev)
      dismissingExitingIdsRef.current.forEach((exitingId) => next.add(exitingId))
      next.add(id)
      return next
    })
    setDismissingExitingIds(new Set())
    if (dismissBatchTimerRef.current) {
      window.clearTimeout(dismissBatchTimerRef.current)
    }
    if (dismissExitTimerRef.current) {
      window.clearTimeout(dismissExitTimerRef.current)
      dismissExitTimerRef.current = null
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

  // Silent background maintenance: throttled dedupe only.
  const runBackgroundDedupe = useCallback(async () => {
    if (syncInFlightRef.current) return
    const lastDedupeAtRaw = Number(localStorage.getItem(SYNC_LAST_DEDUPE_AT_KEY) ?? 0)
    const due = !Number.isFinite(lastDedupeAtRaw) || Date.now() - lastDedupeAtRaw >= DEDUPE_MIN_INTERVAL_MS
    if (!due) return
    syncInFlightRef.current = true
    try {
      const { error } = await supabase.functions.invoke('dedupe-grocery-items', {
        body: { dry_run: false },
      })
      if (!error) localStorage.setItem(SYNC_LAST_DEDUPE_AT_KEY, String(Date.now()))
    } catch {
      // Silent — background maintenance failures self-heal on the next tick.
    } finally {
      syncInFlightRef.current = false
    }
  }, [])

  const updatePantryReconcileDraftRow = useCallback((itemId: string, packageCount: number) => {
    setPantryReconcileDraft((current) => {
      if (!current) return current
      return {
        ...current,
        rows: current.rows.map((row) => row.item_id === itemId
          ? { ...row, package_count: Number(Math.max(0, packageCount).toFixed(2)) }
          : row),
      }
    })
  }, [])

  const updatePantryReconcileRowStatus = useCallback((itemId: string, status: PantryReviewStatus) => {
    setPantryReconcileDraft((current) => {
      if (!current) return current
      return {
        ...current,
        rows: current.rows.map((row) => row.item_id === itemId
          ? {
            ...row,
            review_status: status,
            package_count: status === 'ok' ? Math.max(0.25, row.package_count || 1) : 0,
          }
          : row),
      }
    })
  }, [])

  const toggleReconcileQtyEditor = useCallback((itemId: string) => {
    setExpandedReconcileQtyIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }, [])

  const removePantryReconcileDraftRow = useCallback((itemId: string) => {
    setPantryReconcileDraft((current) => {
      if (!current) return current
      return {
        ...current,
        rows: current.rows.filter((row) => row.item_id !== itemId),
      }
    })
  }, [])

  const handleReconcilePantryFromDone = useCallback(async () => {
    if (!pantryReconcileDraft || reconcilingPantry) return
    setReconcilingPantry(true)
    setPantryReconcileMessage(null)
    setPantryReconcileError(null)
    try {
      const nowIso = new Date().toISOString()
      const pantryInventory = { ...pantryReconcileDraft.pantry_inventory }
      const reconciledItems = { ...pantryReconcileDraft.reconciled_items }
      const auditEntries: PantryInventoryAuditEntry[] = []
      let addedCount = 0
      let depletionFlaggedCount = 0
      const skippedCount = pantryReconcileDraft.skipped_already_reconciled

      for (const row of pantryReconcileDraft.rows) {
        const key = normalizePantryKey(row.name, row.category)
        const existing = pantryInventory[key]
        const packageUnit = normalizePackageUnit(existing?.package_unit ?? row.package_unit)
        const packageSize = existing?.package_size ?? row.package_size
        const lowStockThreshold = existing?.low_stock_threshold ?? defaultLowStockThreshold(row.category)

        if (row.review_status !== 'ok') {
          const lowTarget = Number(Math.max(0.1, lowStockThreshold * 0.5).toFixed(2))
          const before = existing?.on_hand_packages ?? (row.review_status === 'out' ? 0 : lowTarget)
          const after = row.review_status === 'out'
            ? 0
            : Number(Math.min(before, lowTarget).toFixed(2))
          pantryInventory[key] = {
            name: row.name,
            category: row.category,
            package_unit: packageUnit,
            package_size: packageSize,
            on_hand_packages: after,
            low_stock_threshold: lowStockThreshold,
            updated_at: nowIso,
          }
          auditEntries.push({
            id: crypto.randomUUID(),
            created_at: nowIso,
            source: 'manual',
            reason: row.review_status === 'out'
              ? 'Marked manually as out during quick pantry check'
              : 'Marked manually as low during quick pantry check',
            item_key: key,
            name: row.name,
            category: row.category,
            package_unit: packageUnit,
            package_size: packageSize,
            before_packages: Number(before.toFixed(2)),
            delta_packages: Number((after - before).toFixed(2)),
            after_packages: after,
          })
          if (row.source === 'checked-item') {
            reconciledItems[row.item_id] = nowIso
          }
          depletionFlaggedCount += 1
          continue
        }

        if (row.package_count <= 0) continue

        const before = existing?.on_hand_packages ?? 0
        const after = Number((before + row.package_count).toFixed(2))
        pantryInventory[key] = {
          name: row.name,
          category: row.category,
          package_unit: packageUnit,
          package_size: packageSize,
          on_hand_packages: after,
          low_stock_threshold: lowStockThreshold,
          updated_at: nowIso,
        }
        auditEntries.push({
          id: crypto.randomUUID(),
          created_at: nowIso,
          source: 'reconcile',
          reason: pantryReconcileDraft.mode === 'all-done' ? 'Reconciled from all done groceries' : 'Reconciled from planner done groceries',
          item_key: key,
          name: row.name,
          category: row.category,
          package_unit: packageUnit,
          package_size: packageSize,
          before_packages: Number(before.toFixed(2)),
          delta_packages: Number(row.package_count.toFixed(2)),
          after_packages: after,
        })
        if (row.source === 'checked-item') {
          reconciledItems[row.item_id] = nowIso
        }
        addedCount += 1
      }

      if (addedCount === 0 && depletionFlaggedCount === 0) {
        setPantryReconcileDraft(null)
        setExpandedReconcileQtyIds(new Set())
        setPantryReconcileMessage('Review complete, but no restock quantities or low/out flags were set.')
        return
      }

      const nextAuditLog = appendPantryInventoryAudit(pantryReconcileDraft.audit_log, auditEntries)
      const { error: saveError } = await supabase.from('settings').upsert([
        { key: 'meal_planner_pantry_inventory', value: pantryInventory, updated_at: nowIso },
        { key: 'meal_planner_reconciled_checked_items', value: reconciledItems, updated_at: nowIso },
        { key: 'meal_planner_pantry_audit_log', value: nextAuditLog, updated_at: nowIso },
      ], { onConflict: 'key' })
      if (saveError) throw saveError

      setPantryReconcileDraft(null)
      setExpandedReconcileQtyIds(new Set())
      setPantryReconcileMessage(
        [
          addedCount > 0
            ? `Restocked ${addedCount} ${pantryReconcileDraft.mode === 'all-done' ? 'done' : 'planner'} item${addedCount === 1 ? '' : 's'}`
            : '',
          depletionFlaggedCount > 0
            ? `flagged ${depletionFlaggedCount} item${depletionFlaggedCount === 1 ? '' : 's'} as low/out`
            : '',
          skippedCount > 0 ? `${skippedCount} already reconciled` : '',
        ].filter(Boolean).join(' · '),
      )
    } catch (error) {
      setPantryReconcileError(formatSupabaseError(error, 'Could not restock pantry from done items'))
    } finally {
      setReconcilingPantry(false)
    }
  }, [pantryReconcileDraft, reconcilingPantry])

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
      void runBackgroundDedupe()
    }, 5_000)

    // Background dedupe runs on the throttle cadence, not every 45s. Casa↔iOS
    // reconciliation is handled by the Mac launchd jobs; list data freshness is
    // handled by react-query (realtime + refetchInterval + refetchOnWindowFocus).
    const intervalId = window.setInterval(() => {
      void runBackgroundDedupe()
    }, DEDUPE_MIN_INTERVAL_MS)

    return () => {
      window.clearTimeout(kickoff)
      window.clearInterval(intervalId)
    }
  }, [runBackgroundDedupe])

  const visibleDismissIds = new Set([...dismissingIds, ...dismissingExitingIds])

  const activeItemsByCategory = GROCERY_CATEGORIES.map(cat => ({
    ...cat,
    items: sortItemsForShopping(items.filter(i => i.category === cat.key && (!i.checked || visibleDismissIds.has(i.id)))),
  })).filter(cat => cat.items.length > 0)

  const completedItemsByCategory = GROCERY_CATEGORIES.map(cat => ({
    ...cat,
    items: sortItemsForShopping(items.filter(i => i.category === cat.key && i.checked && !visibleDismissIds.has(i.id))),
  })).filter(cat => cat.items.length > 0)
  const lastSyncTimeLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null
  const syncStatusLabel = syncError
    ? 'Sync failed'
    : lastSyncTimeLabel
      ? `Updated ${lastSyncTimeLabel}`
      : 'Loading…'
  const reviewingItem = reviewingItemId
    ? items.find((item) => item.id === reviewingItemId) ?? null
    : null

  return (
    <div className="h-full min-h-0 flex-1 overflow-hidden bg-casa-bg">
      {/* ── Mobile-Specific Simplified Shopping Checklist (< lg) ── */}
      <div className="block lg:hidden h-full min-h-0 overflow-y-auto overscroll-contain touch-pan-y">
        <MobileGroceryView
          items={items}
          activeCategories={activeItemsByCategory.map((cat) => ({
            key: cat.key,
            label: splitCategoryLabel(cat.label),
            items: cat.items,
            visual: CATEGORY_VISUAL_BY_KEY[cat.key] ?? DEFAULT_CATEGORY_VISUAL,
          }))}
          completedItems={items.filter((i) => i.checked && !visibleDismissIds.has(i.id))}
          uncheckedCount={uncheckedCount}
          checkedCount={checkedCount}
          syncStatusLabel={syncStatusLabel}
          dismissingIds={dismissingIds}
          dismissingExitingIds={dismissingExitingIds}
          spotlightedItemId={spotlightedItemId}
          onToggleItem={handleToggle}
          onDeleteItem={(id) => deleteItem.mutate(id)}
          onClearCompleted={() => void clearChecked.mutate()}
          onAddItem={(name, options) =>
            addItemByName(name, {
              allowDuplicate: options?.allowDuplicate,
              spotlightOnDuplicate: !options?.allowDuplicate,
              clearInput: true,
            })
          }
        />
      </div>

      {/* ── Desktop & Touch Kiosk Multi-Column View (>= lg) ── */}
      <div className="hidden lg:block h-full min-h-0 overflow-y-auto overscroll-contain touch-pan-y">
        <PageShell width="full" className="space-y-4 p-3 sm:p-4 lg:p-6 pb-36 lg:pb-16 text-casa-text">
          <GroceryCommandBar
            uncheckedCount={uncheckedCount}
            checkedCount={checkedCount}
            syncStatusLabel={syncStatusLabel}
            inputValue={inputValue}
            inputRef={inputRef}
            mergeSuggestion={mergeSuggestion}
            onInputChange={setInputValue}
            onInputKeyDown={handleKeyDown}
            onAddItem={handleAddItem}
            onQuickAdd={handleQuickAdd}
            onSpotlightItem={(id) => window.setTimeout(() => spotlightItem(id), 120)}
            onForceAddSuggestion={() => {
              const nextName = inputValue.trim()
              if (!nextName || !defaultListId) return
              const category = inferCategoryFromName(nextName)
              addItem.mutate({ list_id: defaultListId, name: nextName, quantity: null, unit: null, category, checked: false, notes: null })
              setInputValue('')
              inputRef.current?.focus()
            }}
            onClearChecked={() => void clearChecked.mutate()}
          />

          {syncError && <Alert tone="danger" title="Grocery sync failed" className="mb-3">{syncError}</Alert>}
          {pantryReconcileError && <Alert tone="danger" title="Pantry restock failed" className="mb-3">{pantryReconcileError}</Alert>}
          {!pantryReconcileError && pantryReconcileMessage && (
            <Alert tone="success" title="Pantry restock updated" className="mb-3">{pantryReconcileMessage}</Alert>
          )}

          {/* Pantry Restock Review Draft */}
          {pantryReconcileDraft && (
            <div className="pb-3">
              <Card padding="md" tone="surface" className="rounded-3xl border-casa-border shadow-widget">
                <Text role="body-sm" className="font-display font-bold text-casa-navy">
                  Review pantry restock ({pantryReconcileDraft.rows.length} items)
                </Text>
                <Text role="caption" muted className="mt-0.5">
                  Adjust package counts before committing to pantry inventory.
                </Text>
                <div className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
                  {pantryReconcileRowsByCategory.map((group) => (
                    <div key={`reconcile-group-${group.category}`} className="rounded-2xl border border-casa-border bg-casa-bg/60 p-3">
                      <Text role="caption" muted className="font-mono font-bold uppercase tracking-wider text-2xs text-casa-navy">
                        {GROCERY_CATEGORIES.find((category) => category.key === group.category)?.label ?? group.category}
                      </Text>
                      <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-4">
                        {group.rows.map((row) => (
                          <div key={`reconcile-draft-${row.item_id}`} className="rounded-xl border border-casa-border bg-casa-surface p-2.5 shadow-2xs">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <Text role="caption" className="truncate font-semibold text-casa-navy">{row.name}</Text>
                                <Text role="caption" muted className="text-2xs">
                                  {row.package_unit || 'pack'}{row.package_size ? ` · ${row.package_size}` : ''}
                                </Text>
                              </div>
                              <IconButton
                                icon={<Trash2 size={13} />}
                                variant="ghost"
                                size="sm"
                                onClick={() => removePantryReconcileDraftRow(row.item_id)}
                                aria-label={`Remove ${row.name} from pantry restock review`}
                                className="text-casa-muted hover:text-casa-error hover:bg-casa-error/10 -mr-1 -mt-1"
                                title="Remove from review"
                              />
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-1">
                              <Chip
                                tone={row.review_status === 'out' ? 'danger' : 'neutral'}
                                selected={row.review_status === 'out'}
                                onClick={() => updatePantryReconcileRowStatus(row.item_id, 'out')}
                                size="sm"
                                className="justify-center"
                              >
                                Out
                              </Chip>
                              <Chip
                                tone={row.review_status === 'low' ? 'warning' : 'neutral'}
                                selected={row.review_status === 'low'}
                                onClick={() => updatePantryReconcileRowStatus(row.item_id, 'low')}
                                size="sm"
                                className="justify-center"
                              >
                                Low
                              </Chip>
                              <Chip
                                tone={row.review_status === 'ok' ? 'success' : 'neutral'}
                                selected={row.review_status === 'ok'}
                                onClick={() => updatePantryReconcileRowStatus(row.item_id, 'ok')}
                                size="sm"
                                className="justify-center"
                              >
                                OK
                              </Chip>
                            </div>
                            {row.review_status === 'ok' && (
                              <div className="mt-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleReconcileQtyEditor(row.item_id)}
                                  className="text-2xs text-casa-muted hover:text-casa-navy px-1 py-0 min-h-0"
                                >
                                  Qty: {row.package_count} {expandedReconcileQtyIds.has(row.item_id) ? '▲' : '▼'}
                                </Button>
                                {expandedReconcileQtyIds.has(row.item_id) && (
                                  <div className="mt-1.5 flex items-center gap-1">
                                    <IconButton
                                      icon={<Minus size={13} />}
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => updatePantryReconcileDraftRow(row.item_id, Math.max(0, row.package_count - 0.25))}
                                      aria-label={`Decrease ${row.name} restock quantity`}
                                    />
                                    <Input
                                      type="number"
                                      min={0}
                                      step={0.25}
                                      value={row.package_count}
                                      onChange={(event) => updatePantryReconcileDraftRow(row.item_id, Number(event.target.value))}
                                      className="w-16 text-center text-caption py-1"
                                      aria-label={`${row.name} restock quantity`}
                                    />
                                    <IconButton
                                      icon={<Plus size={13} />}
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => updatePantryReconcileDraftRow(row.item_id, row.package_count + 0.25)}
                                      aria-label={`Increase ${row.name} restock quantity`}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant="champagne"
                    size="sm"
                    onClick={() => void handleReconcilePantryFromDone()}
                    disabled={reconcilingPantry}
                    loading={reconcilingPantry}
                    className="font-bold"
                  >
                    Confirm restock
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setPantryReconcileDraft(null)
                      setExpandedReconcileQtyIds(new Set())
                    }}
                    disabled={reconcilingPantry}
                  >
                    Cancel
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Content Body */}
          {isLoading ? (
            <div className="pt-4 space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse space-y-2">
                  <div className="h-4 bg-casa-divider rounded w-32 mb-2" />
                  <div className="h-28 bg-casa-surface rounded-2xl border border-casa-border" />
                </div>
              ))}
            </div>
          ) : (
            <GroceryAisleGrid
              sections={activeItemsByCategory.map((cat) => ({
                key: cat.key,
                label: splitCategoryLabel(cat.label),
                items: cat.items,
                dropKey: cat.key,
                visual: CATEGORY_VISUAL_BY_KEY[cat.key] ?? DEFAULT_CATEGORY_VISUAL,
                reviewCount: cat.items.filter((item) =>
                  typeof item.enhancement_confidence === 'number' &&
                  item.enhancement_confidence < LOW_CONFIDENCE_REVIEW_THRESHOLD
                ).length,
              }))}
              completedSections={completedItemsByCategory.map((cat) => ({
                key: cat.key,
                label: splitCategoryLabel(cat.label),
                items: cat.items,
              }))}
              showCompletedArchive={showCompletedArchive}
              onToggleCompletedArchive={() => setShowCompletedArchive((prev) => !prev)}
              onClearCompleted={() => void clearChecked.mutate()}
              dragState={dragState}
              dragOverCategory={dragOverCategory}
              spotlightedItemId={spotlightedItemId}
              dismissingIds={dismissingIds}
              dismissingExitingIds={dismissingExitingIds}
              onToggleItem={handleToggle}
              onDeleteItem={(id) => deleteItem.mutate(id)}
              onRequestReview={setReviewingItemId}
              onMovePointerDown={handleMovePointerDown}
              onMovePointerMove={handleMovePointerMove}
              onMovePointerUp={handleMovePointerUp}
              onMovePointerCancel={handleMovePointerCancel}
            />
          )}
        </PageShell>
      </div>
      <Modal
        open={reviewingItem !== null}
        onClose={() => setReviewingItemId(null)}
        title={reviewingItem ? `Recategorize ${reviewingItem.name}` : 'Recategorize item'}
        size="lg"
        panelClassName="max-w-2xl"
      >
        {reviewingItem && (
          <>
            <Text role="body-sm" muted>
              Choose the store section. The grocery list stays fixed behind this overlay.
            </Text>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {GROCERY_CATEGORIES.map((category) => (
                <Chip
                  key={`${reviewingItem.id}-${category.key}`}
                  tone="neutral"
                  selected={reviewingItem.category === category.key}
                  onClick={() => {
                    updateItemCategory.mutate({
                      id: reviewingItem.id,
                      category: category.key,
                      fromCategory: reviewingItem.category,
                      itemName: reviewingItem.name,
                      reviewedByUser: true,
                    })
                    setReviewingItemId(null)
                  }}
                  className="w-full"
                >
                  {splitCategoryLabel(category.label)}
                </Chip>
              ))}
            </div>
            <Button variant="secondary" className="mt-4" onClick={() => setReviewingItemId(null)}>
              Looks right
            </Button>
          </>
        )}
      </Modal>
      {isAddPanelOpen && (
        <Sheet
          open
          onClose={() => setIsAddPanelOpen(false)}
          title="Add grocery items"
          showHandle
          panelClassName="max-h-[74vh]"
          contentClassName="p-3"
        >
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <Chip
              onClick={() => setAddPanelMode('quick')}
              size="sm"
              selected={addPanelMode === 'quick'}
            >
              Quick add
            </Chip>
            <Chip
              onClick={() => {
                setAddPanelMode('recipe')
                if (!parsedRecipe) setRecipeImportStep(1)
              }}
              size="sm"
              selected={addPanelMode === 'recipe'}
            >
              <Upload size={12} />
              Recipe import
            </Chip>
            <Chip
              onClick={() => setAddPanelMode('library')}
              size="sm"
              selected={addPanelMode === 'library'}
            >
              <BookOpen size={12} />
              Saved recipes
            </Chip>
          </div>

          {addPanelMode === 'quick' && (
            <>
          <div className="flex items-center gap-2 bg-casa-bg rounded-2xl border border-casa-border px-4 py-3 min-h-14 shadow-sm">
            <Plus size={18} className="text-casa-muted flex-shrink-0" />
            <Input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add an item…"
              className="flex-1 border-0 bg-transparent shadow-none"
            />
            <Button
              onClick={handleAddItem}
              disabled={!inputValue.trim() || !defaultListId}
              size="sm"
              className="flex-shrink-0"
            >
              Add
            </Button>
          </div>
          {mergeSuggestion && (
            <div className="mt-2 rounded-2xl border border-casa-gold/40 bg-casa-gold/10 px-3 py-2">
              <p className="text-caption text-casa-navy">
                Similar item already on your list: <span className="font-semibold">{mergeSuggestion.name}</span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Chip
                  tone="accent"
                  size="sm"
                  onClick={() => {
                    setIsAddPanelOpen(false)
                    window.setTimeout(() => spotlightItem(mergeSuggestion.id), 280)
                  }}
                >
                  Use existing
                </Chip>
                <Chip
                  tone="neutral"
                  size="sm"
                  onClick={() => {
                    const nextName = inputValue.trim()
                    if (!nextName || !defaultListId) return
                    const category = inferCategoryFromName(nextName)
                    addItem.mutate({ list_id: defaultListId, name: nextName, quantity: null, unit: null, category, checked: false, notes: null })
                    setInputValue('')
                    inputRef.current?.focus()
                  }}
                >
                  Add anyway
                </Chip>
              </div>
            </div>
          )}
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {QUICK_ADD_TOUCH_ITEMS.map(item => (
              <Chip
                key={item}
                onClick={() => handleQuickAdd(item)}
                tone="neutral"
                className="flex-shrink-0"
              >
                + {item}
              </Chip>
            ))}
          </div>
          <p className="mt-1 text-caption text-casa-muted">
            Tip: tap the sparkle in the top bar to ask Casa AI, then say “add milk, eggs, and bananas.”
          </p>
            </>
          )}

          {addPanelMode === 'recipe' && (
            <div>
              <div className="rounded-2xl border border-casa-border bg-casa-bg p-3">
                <p className="text-caption text-casa-muted mb-2">
                  {recipeImportStep === 1 ? 'Step 1 of 3 · Add sources' : recipeImportStep === 2 ? 'Step 2 of 3 · Confirm sources' : 'Step 3 of 3 · Review + save'}
                </p>
                <p className="text-caption text-casa-muted mb-1">Paste a public recipe URL</p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-casa-muted z-10" />
                    <Input
                      type="url"
                      value={recipeUrlInput}
                      onChange={(event) => setRecipeUrlInput(event.target.value)}
                      placeholder="https://..."
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Chip
                    tone="neutral"
                    size="sm"
                    onClick={() => triggerFileInput(recipeFileInputRef)}
                    disabled={recipeImporting}
                  >
                    <Upload size={12} />
                    Upload file(s)
                  </Chip>
                  <Chip
                    tone="neutral"
                    size="sm"
                    onClick={() => triggerFileInput(recipeCameraInputRef)}
                    disabled={recipeImporting}
                  >
                    <Camera size={12} />
                    Take photo(s)
                  </Chip>
                  <input
                    id="grocery-import-file-input"
                    ref={recipeFileInputRef}
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    multiple
                    className="absolute left-[-9999px] h-px w-px opacity-0 pointer-events-none"
                    onChange={(event) => {
                      const files = event.target.files ? Array.from(event.target.files) : []
                      event.currentTarget.value = ''
                      void addRecipeImportFiles(files, 'upload')
                    }}
                  />
                  <input
                    id="grocery-import-camera-input"
                    ref={recipeCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="absolute left-[-9999px] h-px w-px opacity-0 pointer-events-none"
                    onChange={(event) => {
                      const files = event.target.files ? Array.from(event.target.files) : []
                      event.currentTarget.value = ''
                      void addRecipeImportFiles(files, 'camera')
                    }}
                  />
                </div>
                {recipeImportFiles.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {recipeImportFiles.map((file, index) => {
                      const selected = recipeMealPhotoIndex !== null && index === recipeMealPhotoIndex
                      return (
                        <div key={file.id} className={cn('rounded-lg border overflow-hidden', selected ? 'border-casa-gold' : 'border-casa-border')}>
                          <Button
                            variant="ghost"
                            onClick={() => setRecipeMealPhotoIndex((current) => (current === index ? null : index))}
                            className="block h-auto min-h-0 w-full rounded-none p-0"
                            contentClassName="block w-full"
                          >
                            <img src={file.previewUrl} alt={file.name} className="h-16 w-full object-cover bg-casa-surface" loading="lazy" />
                            <span className={cn('block px-1 py-1 text-caption truncate text-left', selected ? 'text-casa-navy font-semibold' : 'text-casa-muted')}>
                              {selected ? 'Meal photo' : 'Mark meal'}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRecipeImportFile(file.id)}
                            fullWidth
                            className="min-h-0 rounded-none border-t border-casa-divider px-1 py-1 text-caption text-casa-muted"
                          >
                            Remove
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
                {recipeImportFiles.length > 0 && (
                  <Chip
                    size="sm"
                    selected={recipeMealPhotoIndex === null}
                    onClick={() => setRecipeMealPhotoIndex(null)}
                    className="mt-2"
                  >
                    No meal photo
                  </Chip>
                )}
                <div className="mt-2 flex items-center justify-end gap-2">
                  {recipeImportStep > 1 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setRecipeImportStep((current) => (current === 3 ? 2 : 1))}
                    >
                      Back
                    </Button>
                  )}
                  {recipeImportStep < 2 && (
                    <Button
                      variant="strong"
                      size="sm"
                      disabled={!hasRecipeImportSource}
                      onClick={() => setRecipeImportStep(2)}
                    >
                      Next
                    </Button>
                  )}
                  {recipeImportStep === 2 && (
                    <Button
                      variant="strong"
                      size="sm"
                      disabled={recipeImporting || !hasRecipeImportSource}
                      onClick={() => void runRecipeImportFromCurrentSources()}
                      loading={recipeImporting}
                    >
                      Import
                    </Button>
                  )}
                </div>
              </div>

              {recipeImporting && (
                <p className="mt-2 text-caption text-casa-muted animate-breathe">Extracting recipe…</p>
              )}
              {recipeImportError && <Alert tone="danger" title="Recipe import failed" className="mt-2">{recipeImportError}</Alert>}

              {recipeImportStep === 3 && parsedRecipe && (
                <div className="mt-2 rounded-2xl border border-casa-border bg-casa-surface p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <img
                        src={getRecipeDraftImage(parsedRecipe)}
                        alt={parsedRecipe.name}
                        className="h-16 w-16 rounded-xl border border-casa-border object-cover bg-casa-bg flex-shrink-0"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          const target = event.currentTarget
                          if (target.src !== recipeFallbackHero) {
                            target.src = recipeFallbackHero
                          }
                        }}
                      />
                      <div className="min-w-0">
                      <p className="text-body-sm font-semibold text-casa-navy">{parsedRecipe.name}</p>
                      <p className="text-caption text-casa-muted">
                        {parsedRecipe.ingredients.length} ingredients · {parsedRecipe.steps.length} steps · {Math.round(parsedRecipe.confidence * 100)}% confidence
                        {parsedRecipe.servings ? ` · ${parsedRecipe.servings}` : ''}
                        {parsedRecipe.cook_time ? ` · ${parsedRecipe.cook_time}` : ''}
                      </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-casa-border bg-casa-bg p-2">
                    <p className="text-caption text-casa-muted mb-2">Recipe photos (cover image optional)</p>
                    <div className="flex items-center gap-2 mb-2">
                      <Input
                        type="url"
                        value={recipeExtraImageUrl}
                        onChange={(event) => setRecipeExtraImageUrl(event.target.value)}
                        placeholder="https://.../another-photo.jpg"
                        className="flex-1 text-caption"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={addRecipeImageUrl}
                      >
                        Add image
                      </Button>
                    </div>
                    {parsedRecipe.image_urls.length === 0 ? (
                      <p className="text-caption text-casa-muted">No images yet. Add one above.</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {parsedRecipe.image_urls.map((imageUrl, imageIndex) => {
                          const selected = parsedRecipe.primary_image_index !== null && imageIndex === parsedRecipe.primary_image_index
                          return (
                            <Button
                              key={`${imageUrl}-${imageIndex}`}
                              variant="ghost"
                              onClick={() => choosePrimaryRecipeImage(imageIndex)}
                              className={cn(
                                'h-auto min-h-0 overflow-hidden rounded-lg border p-0 text-left',
                                selected ? 'border-casa-gold' : 'border-casa-border hover:border-casa-gold/40',
                              )}
                              contentClassName="block w-full"
                            >
                              <img
                                src={imageUrl}
                                alt={`${parsedRecipe.name} image ${imageIndex + 1}`}
                                className="h-20 w-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={(event) => {
                                  const target = event.currentTarget
                                  if (target.src !== recipeFallbackHero) target.src = recipeFallbackHero
                                }}
                              />
                              <span className="block px-1.5 py-1 text-caption text-casa-muted">
                                {selected ? 'Meal cover' : 'Set as cover'}
                              </span>
                            </Button>
                          )
                        })}
                      </div>
                    )}
                    <Chip
                      size="sm"
                      selected={parsedRecipe.primary_image_index === null}
                      onClick={() => {
                        setParsedRecipe((current) => current ? { ...current, primary_image_index: null, image_url: null } : current)
                      }}
                      className="mt-2"
                    >
                      No meal photo
                    </Chip>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <div className="rounded-xl border border-casa-border bg-casa-bg p-2">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-caption text-casa-muted">Ingredients (auto-hides likely pantry staples)</p>
                        <div className="flex items-center gap-1">
                          {[0.5, 1, 2].map((scale) => (
                            <Chip
                              key={scale}
                              onClick={() => setRecipeScale(scale)}
                              size="sm"
                              selected={Math.abs(recipeScale - scale) < 0.001}
                            >
                              {scale}x
                            </Chip>
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
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 text-body-sm text-casa-text">
                                  <Checkbox
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedRecipeIngredientIndexes((current) => {
                                        const next = new Set(current)
                                        if (next.has(index)) next.delete(index)
                                        else next.add(index)
                                        return next
                                      })
                                    }}
                                    label={
                                      <div className="flex items-center gap-1.5">
                                        <span>{displayName}</span>
                                        {(scaledQuantity || ingredient.unit) && (
                                          <span className="text-caption text-casa-muted">
                                            {scaledQuantity ? `${scaledQuantity} ` : ''}{ingredient.unit ?? ''}
                                          </span>
                                        )}
                                      </div>
                                    }
                                  />
                                </div>
                              </div>
                              <div className="mt-1 flex items-center gap-1.5">
                                <Input
                                  type="text"
                                  value={ingredient.quantity ?? ''}
                                  onChange={(event) => updateParsedIngredient(index, { quantity: event.target.value || null })}
                                  placeholder="Qty"
                                  className="w-16 text-caption"
                                />
                                <Input
                                  type="text"
                                  value={ingredient.unit ?? ''}
                                  onChange={(event) => updateParsedIngredient(index, { unit: event.target.value || null })}
                                  placeholder="Unit"
                                  className="w-16 text-caption"
                                />
                                <Input
                                  type="text"
                                  value={ingredient.name ?? ingredient.raw_text}
                                  onChange={(event) => updateParsedIngredient(index, { name: event.target.value || null })}
                                  placeholder="Ingredient"
                                  className="flex-1 text-caption"
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="rounded-xl border border-casa-border bg-casa-bg p-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-caption text-casa-muted">Directions (literal text, ordered)</p>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void runRecipeImportFromCurrentSources()}
                          disabled={recipeImporting}
                          loading={recipeImporting}
                        >
                          Re-extract
                        </Button>
                      </div>
                      <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                        {parsedRecipe.steps.map((step, stepIndex) => (
                          <div key={`${step.step_number}-${stepIndex}`} className="rounded-lg border border-casa-border bg-casa-surface px-2 py-1.5">
                            <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                              <p className="text-caption font-semibold text-casa-muted">Step {stepIndex + 1}</p>
                              <div className="flex items-center gap-1">
                                <Chip
                                  tone="neutral"
                                  size="sm"
                                  onClick={() => moveParsedStep(stepIndex, -1)}
                                  disabled={stepIndex === 0}
                                >
                                  Up
                                </Chip>
                                <Chip
                                  tone="neutral"
                                  size="sm"
                                  onClick={() => moveParsedStep(stepIndex, 1)}
                                  disabled={stepIndex >= parsedRecipe.steps.length - 1}
                                >
                                  Down
                                </Chip>
                                <Chip
                                  tone="accent"
                                  size="sm"
                                  onClick={() => addParsedStepAfter(stepIndex)}
                                >
                                  Add
                                </Chip>
                                <Chip
                                  tone="danger"
                                  size="sm"
                                  onClick={() => removeParsedStep(stepIndex)}
                                  disabled={parsedRecipe.steps.length <= 1}
                                >
                                  Remove
                                </Chip>
                              </div>
                            </div>
                            <Textarea
                              value={step.instruction}
                              onChange={(event) => updateParsedStep(stepIndex, event.target.value)}
                              rows={3}
                              className="resize-y text-caption"
                            />
                          </div>
                        ))}
                        {parsedRecipe.steps.length === 0 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            fullWidth
                            onClick={() => addParsedStepAfter(-1)}
                          >
                            Add first step
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => addSelectedRecipeIngredientsToCart(parsedRecipe)}
                    >
                      Add selected ingredients ({selectedRecipeIngredientIndexes.size})
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={savingRecipe}
                      onClick={() => void saveRecipePreset({ addSelectedToCart: false })}
                      loading={savingRecipe}
                    >
                      Save recipe
                    </Button>
                    <Button
                      size="sm"
                      disabled={savingRecipe}
                      onClick={() => void saveRecipePreset({ addSelectedToCart: true })}
                      loading={savingRecipe}
                    >
                      Save + Add selected
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {addPanelMode === 'library' && (
            <div className="space-y-2">
              {recipeMealPlans.length > 0 && (
                <div className="rounded-xl border border-casa-border bg-casa-surface px-3 py-2">
                  <p className="text-caption font-semibold text-casa-navy">Planned meals</p>
                  <p className="text-caption text-casa-muted mt-1">
                    {recipeMealPlans.slice(0, 3).map((plan) => {
                      const recipe = recipeLibrary.find((row) => row.id === plan.recipe_id)
                      const slotLabel = RECIPE_MEAL_SLOTS.find((entry) => entry.slot === plan.slot)?.label ?? plan.slot
                      return `${slotLabel}: ${recipe?.name ?? 'Recipe'}`
                    }).join(' · ')}
                  </p>
                </div>
              )}
              {recipeLibrary.length === 0 ? (
                <p className="text-caption text-casa-muted">No saved recipes yet. Import one from URL, photo, or PDF.</p>
              ) : (
                recipeLibrary.slice(0, 24).map((recipe) => (
                  <div key={recipe.id} className="rounded-2xl border border-casa-border bg-casa-bg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-body-sm font-semibold text-casa-navy">{recipe.name}</p>
                        <p className="text-caption text-casa-muted">
                          {recipe.ingredients.length} ingredients · {recipe.steps.length} steps
                          {recipe.cook_time ? ` · ${recipe.cook_time}` : ''}
                          {recipe.last_used_at ? ` · used ${new Date(recipe.last_used_at).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {RECIPE_MEAL_SLOTS.map(({ slot, label }) => {
                          const planned = mealPlanSlotsByRecipe.get(recipe.id)?.has(slot) ?? false
                          return (
                            <Chip
                              key={`${recipe.id}-${slot}`}
                              onClick={() => void planRecipeForSlot(recipe.id, slot)}
                              size="sm"
                              selected={planned}
                            >
                              {planned ? `Planned: ${label}` : label}
                            </Chip>
                          )
                        })}
                        <Chip
                          tone="neutral"
                          size="sm"
                          onClick={() => loadRecipeIntoChecklist(recipe)}
                        >
                          Add again
                        </Chip>
                        <Chip
                          tone="accent"
                          size="sm"
                          onClick={() => void openRecipeForCookMode(recipe)}
                        >
                          <ChefHat size={12} />
                          Cook mode
                        </Chip>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </Sheet>
      )}
      {dragState && (
        <div
          className="fixed z-debug pointer-events-none px-3 py-2 rounded-xl bg-casa-navy text-white text-body-sm shadow-modal"
          style={{ left: dragState.x + 14, top: dragState.y + 14 }}
        >
          Move “{dragState.itemName}”
        </div>
      )}
      <Toast
        open={Boolean(groceryToastMessage)}
        tone="success"
        message={groceryToastMessage ?? ''}
        onClose={() => setGroceryToastMessage(null)}
      />
    </div>
  )
}
