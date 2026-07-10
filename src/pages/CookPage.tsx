import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Camera, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, ExternalLink, Search, ShoppingCart, Sparkles, Trash2, Upload, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatSupabaseError } from '../lib/formatSupabaseError'
import { inferCategoryFromName } from '../utils/groceryCategorization'
import { normalizeRecipeIngredientFields } from '../utils/recipeIngredientParsing'
import { DEFAULT_FOOD_PROFILE, normalizeFoodProfile, type FoodProfile } from '../lib/foodProfile'
import { appendPantryInventoryAudit, normalizePackageUnit, normalizePantryKey, sanitizePantryInventoryAudit, type PantryInventoryAuditEntry } from '../lib/pantryInventoryUtils'
import { cn } from '../utils/cn'
import recipeFallbackHero from '../assets/hero.png'
import { Button, Card, Chip, Heading, SegmentedControl, Text, Textarea } from '../components/ui'

type RecipeScale = '0.5' | '1' | '2'

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

type ImportedRecipeDraft = {
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

type ImportCaptureFile = {
  id: string
  name: string
  mimeType: string
  fileBase64: string
  previewUrl: string
}

type RecipeMealPlan = {
  recipe_id: string
  slot: 'tonight' | 'tomorrow' | 'this-week'
  planned_for?: string | null
  notes?: string | null
}

type WebImageOption = {
  id: string
  url: string
  title: string
  source?: string
}

type RecipeEditorDraft = {
  name: string
  ingredients: RecipeDraftIngredient[]
  steps: RecipeDraftStep[]
}

type RecipeRegexQuickAction = {
  id: string
  name: string
  description?: string | null
  field: 'quantity' | 'unit' | 'name' | 'raw_text'
  pattern: string
  replacement: string
  flags?: string | null
}

type CookLandingMode = 'cook-now' | 'plan-week'
type RecipeBrowseFilter = 'all' | 'quick' | 'planned'
type CookMood = 'quick' | 'family' | 'new' | 'fancy' | 'pantry'

type RecipeMoodInsight = {
  recipe: Recipe
  minutes: number | null
  ingredientsCount: number
  planned: boolean
  usedAtMs: number | null
  createdAtMs: number
  nameLower: string
  scoreByMood: Record<CookMood, number>
}

type MealPlannerMeal = {
  recipe_id: string
  recipe_name: string
  slot: RecipeMealPlan['slot']
  planned_for: string | null
  overlap_score: number
  reason: string
}

type MealPlannerIngredient = {
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

type PantryInventoryEntry = {
  name: string
  category: string
  package_unit: string | null
  package_size: string | null
  on_hand_packages: number
  low_stock_threshold: number
  updated_at: string
}

type MealPlannerPlan = {
  summary: string
  proposed_meals: MealPlannerMeal[]
  overlap_ingredients: Array<{ name: string; recipe_count: number }>
  pantry_deductions: Array<{ name: string; reason: string }>
  grocery_additions: MealPlannerIngredient[]
  estimated_cost_range: { low: number; high: number; currency: string }
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
}

type ConfiguredMealPlannerMeal = MealPlannerMeal & {
  key: string
  enabled: boolean
}

type MealPlannerTemplate = {
  id: string
  name: string
  prompt: string
  created_at: string
}

type MealPlannerLearning = {
  preferred_ingredients: string[]
  avoided_ingredients: string[]
  successful_prompts: string[]
  template_names: string[]
}

type MealPlannerStrategy = 'balanced' | 'budget' | 'speed'
type MealPlannerActionLogEntry = {
  id: string
  created_at: string
  action: 'generate_plan' | 'apply_groceries' | 'queue_meals' | 'optimize_budget' | 'cook_complete'
  status: 'success' | 'error'
  detail: string
  trace_id?: string | null
}

const DEFAULT_MEAL_PLANNER_LEARNING: MealPlannerLearning = {
  preferred_ingredients: [],
  avoided_ingredients: [],
  successful_prompts: [],
  template_names: [],
}

const RECIPE_QUICK_ACTIONS_STORAGE_KEY = 'casa-recipe-quick-actions-v1'
const COOK_LANDING_MODE_STORAGE_KEY = 'casa-cook-landing-mode-v2'
const COOK_MOOD_STORAGE_KEY = 'casa-cook-mood-v2'
const COOK_PROGRESS_STORAGE_KEY = 'casa-cook-progress-v2'

const COOK_MOOD_OPTIONS: Array<{ id: CookMood; label: string; shortlistLabel: string }> = [
  { id: 'quick', label: 'Something quick', shortlistLabel: 'quick' },
  { id: 'family', label: 'Family favorite', shortlistLabel: 'family favorite' },
  { id: 'new', label: 'Something new', shortlistLabel: 'new' },
  { id: 'fancy', label: 'A little fancy', shortlistLabel: 'fancy' },
  { id: 'pantry', label: 'Use up the pantry', shortlistLabel: 'pantry' },
]

const SLOT_LABELS: Record<RecipeMealPlan['slot'], string> = {
  tonight: 'Tonight',
  tomorrow: 'Tomorrow',
  'this-week': 'This week',
}

const SLOT_ORDER: RecipeMealPlan['slot'][] = ['tonight', 'tomorrow', 'this-week']

function parseCookMinutes(value: string | null): number | null {
  if (!value) return null
  const raw = value.trim().toLowerCase()
  if (!raw) return null
  let total = 0
  let matched = false
  const hourMatch = raw.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/)
  if (hourMatch) {
    total += Number(hourMatch[1] ?? 0) * 60
    matched = true
  }
  const minMatch = raw.match(/(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)\b/)
  if (minMatch) {
    total += Number(minMatch[1] ?? 0)
    matched = true
  }
  if (matched && Number.isFinite(total) && total > 0) return Math.round(total)
  const firstNumber = raw.match(/(\d+(?:\.\d+)?)/)
  if (!firstNumber) return null
  const fallback = Number(firstNumber[1] ?? Number.NaN)
  return Number.isFinite(fallback) && fallback > 0 ? Math.round(fallback) : null
}

function isCookLandingMode(value: string | null): value is CookLandingMode {
  return value === 'cook-now' || value === 'plan-week'
}

function isCookMood(value: string | null): value is CookMood {
  return value === 'quick' || value === 'family' || value === 'new' || value === 'fancy' || value === 'pantry'
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
  if (recipe.image_url) return recipe.image_url.split('#')[0] ?? recipe.image_url
  const source = recipe.source_url?.trim()
  if (!source) return null
  if (/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(source)) return source
  return null
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function parseRecipeImageFocus(imageUrl: string | null): { focalX: number; focalY: number } {
  if (!imageUrl) return { focalX: 50, focalY: 50 }
  const hash = imageUrl.split('#')[1] ?? ''
  const match = hash.match(/fp=(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/i)
  if (!match) return { focalX: 50, focalY: 50 }
  return {
    focalX: clampPercent(Number(match[1] ?? 50)),
    focalY: clampPercent(Number(match[2] ?? 50)),
  }
}

function encodeRecipeImageUrl(rawUrl: string, focalX: number, focalY: number): string {
  const [base] = rawUrl.trim().split('#')
  return `${base}#fp=${Math.round(clampPercent(focalX))},${Math.round(clampPercent(focalY))}`
}

function buildFallbackRecipeImage(recipe: Recipe): string {
  const lock = encodeURIComponent(recipe.id)
  return `https://loremflickr.com/1200/900/food?lock=${lock}`
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

function getRecipeImage(recipe: Recipe): string {
  return pickRecipeThumb(recipe) ?? buildFallbackRecipeImage(recipe)
}

function renumberDraftSteps(steps: RecipeDraftStep[]): RecipeDraftStep[] {
  return steps.map((step, index) => ({
    ...step,
    step_number: index + 1,
  }))
}

function buildIngredientRawText(name: string | null, quantity: string | null, unit: string | null): string {
  return [quantity, unit, name].filter((part) => Boolean(part && part.trim())).join(' ').trim()
}

function RecipeImage({
  src,
  alt,
  className,
  focalX = 50,
  focalY = 50,
  loading = 'lazy',
}: {
  src: string
  alt: string
  className: string
  focalX?: number
  focalY?: number
  loading?: 'eager' | 'lazy'
}) {
  const [currentSrc, setCurrentSrc] = useState(src)
  useEffect(() => {
    setCurrentSrc(src)
  }, [src])

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      loading={loading}
      style={{ objectPosition: `${focalX}% ${focalY}%` }}
      referrerPolicy="no-referrer"
      onError={() => {
        if (currentSrc !== recipeFallbackHero) {
          setCurrentSrc(recipeFallbackHero)
        }
      }}
    />
  )
}

function InfoHint({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        aria-label={label}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((current) => !current)}
        className="text-casa-muted hover:text-casa-navy inline-flex"
      >
        <CircleHelp size={13} />
      </button>
      {open && (
        <span className="absolute z-20 top-full mt-1 right-0 w-56 rounded-lg border border-casa-border bg-casa-surface px-2.5 py-2 text-caption text-casa-navy shadow-card">
          {text}
        </span>
      )}
    </span>
  )
}

export default function CookPage() {
  const navigate = useNavigate()
  const [cookRecipeId, setCookRecipeId] = useState<string | null>(null)
  const [recipeSearch, setRecipeSearch] = useState('')
  const [cookLandingMode, setCookLandingMode] = useState<CookLandingMode>(() => {
    try {
      const raw = localStorage.getItem(COOK_LANDING_MODE_STORAGE_KEY)
      return isCookLandingMode(raw) ? raw : 'cook-now'
    } catch {
      return 'cook-now'
    }
  })
  const [cookMood, setCookMood] = useState<CookMood>(() => {
    try {
      const raw = localStorage.getItem(COOK_MOOD_STORAGE_KEY)
      return isCookMood(raw) ? raw : 'quick'
    } catch {
      return 'quick'
    }
  })
  const [shortlistOffsets, setShortlistOffsets] = useState<Record<CookMood, number>>({
    quick: 0,
    family: 0,
    new: 0,
    fancy: 0,
    pantry: 0,
  })
  const [recipeProgress, setRecipeProgress] = useState<Record<string, { stepIndex: number; totalSteps: number; updatedAt: string }>>(() => {
    try {
      const raw = localStorage.getItem(COOK_PROGRESS_STORAGE_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      const normalized: Record<string, { stepIndex: number; totalSteps: number; updatedAt: string }> = {}
      for (const [recipeId, value] of Object.entries(parsed)) {
        if (!recipeId || !value || typeof value !== 'object' || Array.isArray(value)) continue
        const row = value as Record<string, unknown>
        const stepIndex = Number(row.stepIndex)
        const totalSteps = Number(row.totalSteps)
        if (!Number.isFinite(stepIndex) || !Number.isFinite(totalSteps)) continue
        if (stepIndex <= 0 || totalSteps <= 0 || stepIndex >= totalSteps) continue
        normalized[recipeId] = {
          stepIndex: Math.round(stepIndex),
          totalSteps: Math.round(totalSteps),
          updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : new Date().toISOString(),
        }
      }
      return normalized
    } catch {
      return {}
    }
  })
  const [recipeBrowseFilter, setRecipeBrowseFilter] = useState<RecipeBrowseFilter>('all')
  const [stepIndex, setStepIndex] = useState(0)
  const [recipeScale, setRecipeScale] = useState<RecipeScale>('1')
  const [showCupsConversion, setShowCupsConversion] = useState(false)
  const [directionsViewMode, setDirectionsViewMode] = useState<'step' | 'all'>('step')
  // Session-local mise-en-place check-off (keyed by cookIngredientRows id).
  // Does NOT mutate the recipe or grocery list — cleared when the recipe changes.
  const [checkedCookIngredients, setCheckedCookIngredients] = useState<Set<string>>(new Set())
  // Auto-scroll target for the currently-active direction step.
  const currentStepRef = useRef<HTMLElement | null>(null)
  const [photoEditorRecipeId, setPhotoEditorRecipeId] = useState<string | null>(null)
  const [photoEditorName, setPhotoEditorName] = useState('')
  const [photoEditorUrl, setPhotoEditorUrl] = useState('')
  const [photoEditorFocalX, setPhotoEditorFocalX] = useState(50)
  const [photoEditorFocalY, setPhotoEditorFocalY] = useState(50)
  const [photoEditorSaving, setPhotoEditorSaving] = useState(false)
  const [photoEditorUploading, setPhotoEditorUploading] = useState(false)
  const [photoEditorError, setPhotoEditorError] = useState<string | null>(null)
  const [photoSearchQuery, setPhotoSearchQuery] = useState('')
  const [photoSearchLoading, setPhotoSearchLoading] = useState(false)
  const [photoSearchError, setPhotoSearchError] = useState<string | null>(null)
  const [photoSearchResults, setPhotoSearchResults] = useState<WebImageOption[]>([])
  const [deleteConfirmRecipe, setDeleteConfirmRecipe] = useState<Recipe | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1)
  const [importUrlInput, setImportUrlInput] = useState('')
  const [importingRecipe, setImportingRecipe] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importDraft, setImportDraft] = useState<ImportedRecipeDraft | null>(null)
  const [importSaving, setImportSaving] = useState(false)
  const [importExtraImageUrl, setImportExtraImageUrl] = useState('')
  const [importCaptureFiles, setImportCaptureFiles] = useState<ImportCaptureFile[]>([])
  const [importMealPhotoIndex, setImportMealPhotoIndex] = useState<number | null>(null)
  const [smartAddingRecipeId, setSmartAddingRecipeId] = useState<string | null>(null)
  const [deletingRecipeId, setDeletingRecipeId] = useState<string | null>(null)
  const [isRecipeEditMode, setIsRecipeEditMode] = useState(false)
  const [recipeEditorDraft, setRecipeEditorDraft] = useState<RecipeEditorDraft | null>(null)
  const [recipeEditorSaving, setRecipeEditorSaving] = useState(false)
  const [recipeEditorError, setRecipeEditorError] = useState<string | null>(null)
  const [recipeEditorStatus, setRecipeEditorStatus] = useState<string | null>(null)
  const [recipeAiInstruction, setRecipeAiInstruction] = useState('')
  const [recipeAiEditing, setRecipeAiEditing] = useState(false)
  const [recipeAiError, setRecipeAiError] = useState<string | null>(null)
  const [recipeQuickActions, setRecipeQuickActions] = useState<RecipeRegexQuickAction[]>([])
  const [recipeSuggestedQuickAction, setRecipeSuggestedQuickAction] = useState<RecipeRegexQuickAction | null>(null)
  const [libraryActionError, setLibraryActionError] = useState<string | null>(null)
  const [libraryActionStatus, setLibraryActionStatus] = useState<string | null>(null)
  const [mealPlannerPrompt, setMealPlannerPrompt] = useState('Plan 5 dinners this week with overlapping ingredients under budget.')
  const [mealPlannerStrategy, setMealPlannerStrategy] = useState<MealPlannerStrategy>('balanced')
  const [mealPlannerLoading, setMealPlannerLoading] = useState(false)
  const [mealPlannerError, setMealPlannerError] = useState<string | null>(null)
  const [mealPlannerStatus, setMealPlannerStatus] = useState<string | null>(null)
  const [mealPlannerAddingGroceries, setMealPlannerAddingGroceries] = useState(false)
  const [mealPlannerAddResult, setMealPlannerAddResult] = useState<{ attempted: number; inserted: number; at: string } | null>(null)
  const [mealPlannerPlan, setMealPlannerPlan] = useState<MealPlannerPlan | null>(null)
  const [mealPlannerDebug, setMealPlannerDebug] = useState<Record<string, unknown> | null>(null)
  const [mealPlannerLastTraceId, setMealPlannerLastTraceId] = useState<string | null>(null)
  const [mealPlannerActionLog, setMealPlannerActionLog] = useState<MealPlannerActionLogEntry[]>([])
  const [mealPlannerMealConfig, setMealPlannerMealConfig] = useState<Record<string, { enabled: boolean; deleted: boolean }>>({})
  const [mealPlannerPantryConfig, setMealPlannerPantryConfig] = useState<Record<string, boolean>>({})
  const [mealPlannerPantryInventory, setMealPlannerPantryInventory] = useState<Record<string, PantryInventoryEntry>>({})
  const [plannedMealActionId, setPlannedMealActionId] = useState<string | null>(null)
  const [plannedMealStatus, setPlannedMealStatus] = useState<string | null>(null)
  const [plannedMealError, setPlannedMealError] = useState<string | null>(null)
  const [mealPlannerTemplates, setMealPlannerTemplates] = useState<MealPlannerTemplate[]>([])
  const [mealPlannerTemplateName, setMealPlannerTemplateName] = useState('')
  const [mealPlannerLearning, setMealPlannerLearning] = useState<MealPlannerLearning>(DEFAULT_MEAL_PLANNER_LEARNING)
  const [foodProfile, setFoodProfile] = useState<FoodProfile>(DEFAULT_FOOD_PROFILE)
  const [plannerAdvancedOpen, setPlannerAdvancedOpen] = useState(false)
  const [plannerLogOpen, setPlannerLogOpen] = useState(false)
  const importFileInputRef = useRef<HTMLInputElement>(null)
  const importCameraInputRef = useRef<HTMLInputElement>(null)
  const photoEditorUploadInputRef = useRef<HTMLInputElement>(null)
  const photoEditorCameraInputRef = useRef<HTMLInputElement>(null)
  const hasImportSource = importUrlInput.trim().length > 0 || importCaptureFiles.length > 0

  function plannerMealKey(meal: MealPlannerMeal): string {
    return `${meal.slot}:${meal.recipe_id}:${meal.planned_for ?? 'none'}`
  }

  function plannerGroceryKey(item: MealPlannerIngredient): string {
    return `${item.name.toLowerCase().trim()}::${item.category}`
  }

  function defaultPantryLowStockThreshold(item: MealPlannerIngredient): number {
    if (item.category === 'pantry') return 0.5
    if (item.category === 'other') return 0.35
    return 0.25
  }

  function strategyInstruction(strategy: MealPlannerStrategy): string {
    if (strategy === 'budget') return 'Prioritize lowest total spend while keeping overlap high and prep practical.'
    if (strategy === 'speed') return 'Prioritize fastest prep/cook times while still reusing ingredients across meals.'
    return 'Balance cost, prep time, overlap, and pantry utilization.'
  }

  function estimatedPlannerCategoryCost(category: string): number {
    if (category === 'meat') return 4.5
    if (category === 'dairy') return 2.8
    if (category === 'produce') return 2.2
    if (category === 'bakery') return 2.4
    if (category === 'pantry') return 2.6
    return 2
  }

  async function appendMealPlannerActionLog(entry: Omit<MealPlannerActionLogEntry, 'id' | 'created_at'>) {
    const nextRow: MealPlannerActionLogEntry = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...entry,
    }
    const nextLog = [nextRow, ...mealPlannerActionLog].slice(0, 200)
    const { error } = await supabase.from('settings').upsert(
      {
        key: 'meal_planner_action_log',
        value: nextLog,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
    if (error) throw error
    setMealPlannerActionLog(nextLog)
  }

  function sanitizePantryInventory(raw: unknown): Record<string, PantryInventoryEntry> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const parsed: Record<string, PantryInventoryEntry> = {}
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const row = value as Record<string, unknown>
      const onHand = Number(row.on_hand_packages)
      if (!Number.isFinite(onHand) || onHand < 0) continue
      const lowThreshold = Number(row.low_stock_threshold)
      parsed[key] = {
        name: String(row.name ?? '').trim(),
        category: String(row.category ?? 'other').trim() || 'other',
        package_unit: typeof row.package_unit === 'string' ? row.package_unit : null,
        package_size: typeof row.package_size === 'string' ? row.package_size : null,
        on_hand_packages: Number(onHand.toFixed(2)),
        low_stock_threshold: Number.isFinite(lowThreshold) && lowThreshold >= 0 ? Number(lowThreshold.toFixed(2)) : 0.5,
        updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
      }
    }
    return parsed
  }

  const { data: recipes = [], refetch: refetchRecipes } = useQuery({
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

  const { data: ingredients = [], refetch: refetchIngredients } = useQuery({
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

  const { data: steps = [], refetch: refetchSteps } = useQuery({
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

  const { data: mealPlans = [], refetch: refetchMealPlans } = useQuery({
    queryKey: ['cook-page-meal-plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_meal_plans')
        .select('recipe_id,slot,planned_for,notes')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as RecipeMealPlan[]
    },
    staleTime: 60_000,
  })

  const { data: foodProfileData } = useQuery({
    queryKey: ['cook-page-food-profile'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'food_profile').maybeSingle()
      if (error) throw error
      return normalizeFoodProfile(data?.value)
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!foodProfileData) return
    setFoodProfile(foodProfileData)
  }, [foodProfileData])

  const { data: plannerTemplatesData } = useQuery({
    queryKey: ['cook-page-meal-planner-templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'meal_planner_templates').maybeSingle()
      if (error) throw error
      const rows = Array.isArray(data?.value) ? data.value : []
      return rows
        .map((row: unknown) => {
          if (!row || typeof row !== 'object') return null
          const item = row as Record<string, unknown>
          const prompt = String(item.prompt ?? '').trim()
          if (!prompt) return null
          return {
            id: String(item.id ?? crypto.randomUUID()),
            name: String(item.name ?? 'Saved template').trim() || 'Saved template',
            prompt,
            created_at: String(item.created_at ?? new Date().toISOString()),
          } as MealPlannerTemplate
        })
        .filter((row: MealPlannerTemplate | null): row is MealPlannerTemplate => row !== null)
        .slice(0, 12)
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!plannerTemplatesData) return
    setMealPlannerTemplates(plannerTemplatesData)
  }, [plannerTemplatesData])

  const { data: plannerLearningData } = useQuery({
    queryKey: ['cook-page-meal-planner-learning'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'meal_planner_learning').maybeSingle()
      if (error) throw error
      const value = data?.value as Record<string, unknown> | undefined
      const normalizeList = (input: unknown, max = 20) => Array.isArray(input)
        ? input.map((row) => String(row ?? '').trim().toLowerCase()).filter(Boolean).slice(0, max)
        : []
      return {
        preferred_ingredients: normalizeList(value?.preferred_ingredients),
        avoided_ingredients: normalizeList(value?.avoided_ingredients),
        successful_prompts: Array.isArray(value?.successful_prompts)
          ? value!.successful_prompts.map((row) => String(row ?? '').trim()).filter(Boolean).slice(0, 20)
          : [],
        template_names: Array.isArray(value?.template_names)
          ? value!.template_names.map((row) => String(row ?? '').trim()).filter(Boolean).slice(0, 12)
          : [],
      } as MealPlannerLearning
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!plannerLearningData) return
    setMealPlannerLearning(plannerLearningData)
  }, [plannerLearningData])

  useEffect(() => {
    let active = true
    void (async () => {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'meal_planner_action_log').maybeSingle()
      if (error || !active) return
      const rows = Array.isArray(data?.value) ? data.value : []
      const parsed = rows
        .map((row) => {
          if (!row || typeof row !== 'object') return null
          const item = row as Record<string, unknown>
          const action = String(item.action ?? '') as MealPlannerActionLogEntry['action']
          const status = String(item.status ?? '') as MealPlannerActionLogEntry['status']
          if (!['generate_plan', 'apply_groceries', 'queue_meals', 'optimize_budget', 'cook_complete'].includes(action)) return null
          if (!['success', 'error'].includes(status)) return null
          return {
            id: String(item.id ?? crypto.randomUUID()),
            created_at: typeof item.created_at === 'string' ? item.created_at : new Date().toISOString(),
            action,
            status,
            detail: String(item.detail ?? '').trim(),
            trace_id: typeof item.trace_id === 'string' ? item.trace_id : null,
          } as MealPlannerActionLogEntry
        })
        .filter((row): row is MealPlannerActionLogEntry => row !== null)
        .slice(0, 200)
      setMealPlannerActionLog(parsed)
    })()
    return () => { active = false }
  }, [])

  const { data: pantryInventoryData } = useQuery({
    queryKey: ['cook-page-meal-planner-pantry-inventory'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'meal_planner_pantry_inventory').maybeSingle()
      if (error) throw error
      return sanitizePantryInventory(data?.value)
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!pantryInventoryData) return
    setMealPlannerPantryInventory(pantryInventoryData)
  }, [pantryInventoryData])

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
  const quickTonightCount = useMemo(
    () => recipes.filter((recipe) => {
      const minutes = parseCookMinutes(recipe.cook_time)
      return typeof minutes === 'number' && minutes <= 30
    }).length,
    [recipes],
  )
  const plannedRecipeIds = useMemo(
    () => new Set(plannedRecipes.map(({ recipe }) => recipe.id)),
    [plannedRecipes],
  )
  const recipesWithMoodInsights = useMemo<RecipeMoodInsight[]>(() => {
    const nowMs = Date.now()
    const isFancyRecipe = (nameLower: string) => /salmon|cod|barramundi|dijon|creamy|scampi|caesar|salsa/i.test(nameLower)
    const isFamilyRecipe = (nameLower: string) => /family|favorite|kid|kids|taco|alfredo|pasta|playtime/i.test(nameLower)
    const isPantryRecipe = (nameLower: string) => /pantry|leftover|leftovers|rice|noodles|fried|cottage|garlic/i.test(nameLower)
    return recipes.map((recipe) => {
      const minutes = parseCookMinutes(recipe.cook_time)
      const ingredientsCount = ingredientsByRecipe.get(recipe.id)?.length ?? 0
      const planned = plannedRecipeIds.has(recipe.id)
      const usedAtMs = recipe.last_used_at ? new Date(recipe.last_used_at).getTime() : null
      const createdAtMs = new Date(recipe.created_at).getTime()
      const ageDays = Number.isFinite(createdAtMs) ? Math.max(0, (nowMs - createdAtMs) / 86_400_000) : 30
      const nameLower = recipe.name.toLowerCase()
      const quickScore = (minutes ? Math.max(0, 40 - minutes) : 6) + (minutes && minutes <= 30 ? 48 : -12) + (planned ? 8 : 0)
      const familyScore = (planned ? 36 : 0) + (usedAtMs ? 20 : 0) + (isFamilyRecipe(nameLower) ? 12 : 0) + (minutes && minutes <= 35 ? 8 : 0)
      const newScore = (!usedAtMs ? 45 : 0) + Math.max(0, 25 - ageDays) + (planned ? -12 : 0)
      const fancyScore = (minutes && minutes >= 30 ? 30 : 8) + (isFancyRecipe(nameLower) ? 18 : 0) + (planned ? 6 : 0)
      const pantryScore = (ingredientsCount > 0 ? Math.max(0, 18 - ingredientsCount) * 2 : 4) + (minutes && minutes <= 30 ? 12 : 0) + (isPantryRecipe(nameLower) ? 14 : 0)
      return {
        recipe,
        minutes,
        ingredientsCount,
        planned,
        usedAtMs,
        createdAtMs,
        nameLower,
        scoreByMood: {
          quick: quickScore,
          family: familyScore,
          new: newScore,
          fancy: fancyScore,
          pantry: pantryScore,
        },
      }
    })
  }, [ingredientsByRecipe, plannedRecipeIds, recipes])
  const moodRankedRecipes = useMemo<Record<CookMood, RecipeMoodInsight[]>>(() => {
    const sortByMood = (mood: CookMood) => [...recipesWithMoodInsights].sort((a, b) => {
      const byScore = b.scoreByMood[mood] - a.scoreByMood[mood]
      if (Math.abs(byScore) > 0.001) return byScore
      const aMinutes = a.minutes ?? Number.MAX_SAFE_INTEGER
      const bMinutes = b.minutes ?? Number.MAX_SAFE_INTEGER
      if (aMinutes !== bMinutes) return aMinutes - bMinutes
      return b.createdAtMs - a.createdAtMs
    })
    return {
      quick: sortByMood('quick'),
      family: sortByMood('family'),
      new: sortByMood('new'),
      fancy: sortByMood('fancy'),
      pantry: sortByMood('pantry'),
    }
  }, [recipesWithMoodInsights])
  const moodShortlistRecipes = useMemo(() => {
    const ranked = moodRankedRecipes[cookMood] ?? []
    if (ranked.length === 0) return []
    const rotation = (shortlistOffsets[cookMood] ?? 0) % ranked.length
    const rotated = [...ranked.slice(rotation), ...ranked.slice(0, rotation)]
    return rotated.slice(0, 3)
  }, [cookMood, moodRankedRecipes, shortlistOffsets])
  const shortlistHeadingLabel = COOK_MOOD_OPTIONS.find((option) => option.id === cookMood)?.shortlistLabel ?? 'quick'
  const resumeRecipeCandidates = useMemo(() => {
    return Object.entries(recipeProgress)
      .map(([recipeId, progress]) => {
        const recipe = recipeById.get(recipeId)
        if (!recipe) return null
        if (progress.stepIndex <= 0 || progress.stepIndex >= progress.totalSteps) return null
        const updatedAtMs = new Date(progress.updatedAt).getTime()
        return {
          recipe,
          progress,
          updatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
        }
      })
      .filter((row): row is { recipe: Recipe; progress: { stepIndex: number; totalSteps: number; updatedAt: string }; updatedAtMs: number } => row !== null)
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
  }, [recipeById, recipeProgress])
  const resumeRecipe = resumeRecipeCandidates[0] ?? null
  const resumeRecentLabel = useMemo(() => {
    const names = recipes
      .filter((recipe) => recipe.id !== resumeRecipe?.recipe.id)
      .slice(0, 2)
      .map((recipe) => recipe.name)
    return names.join(' · ')
  }, [recipes, resumeRecipe?.recipe.id])
  const filteredRecipes = useMemo(() => {
    const query = recipeSearch.trim().toLowerCase()
    return recipes.filter((recipe) => {
      const haystack = `${recipe.name} ${recipe.cook_time ?? ''} ${recipe.servings ?? ''}`.toLowerCase()
      if (query && !haystack.includes(query)) return false
      if (recipeBrowseFilter === 'quick') {
        const minutes = parseCookMinutes(recipe.cook_time)
        return typeof minutes === 'number' && minutes <= 30
      }
      if (recipeBrowseFilter === 'planned') return plannedRecipeIds.has(recipe.id)
      return true
    })
  }, [recipes, recipeSearch, recipeBrowseFilter, plannedRecipeIds])

  const cookRecipe = cookRecipeId ? recipeById.get(cookRecipeId) ?? null : null
  const photoEditorOpen = Boolean(photoEditorRecipeId)
  const cookSteps = cookRecipeId ? stepsByRecipe.get(cookRecipeId) ?? [] : []
  const cookIngredients = cookRecipeId ? ingredientsByRecipe.get(cookRecipeId) ?? [] : []
  const currentStep = cookSteps[stepIndex] ?? null

  useEffect(() => {
    localStorage.setItem(COOK_LANDING_MODE_STORAGE_KEY, cookLandingMode)
  }, [cookLandingMode])

  useEffect(() => {
    localStorage.setItem(COOK_MOOD_STORAGE_KEY, cookMood)
  }, [cookMood])

  useEffect(() => {
    localStorage.setItem(COOK_PROGRESS_STORAGE_KEY, JSON.stringify(recipeProgress))
  }, [recipeProgress])

  useEffect(() => {
    if (!cookRecipeId) return
    const totalSteps = cookSteps.length
    if (totalSteps <= 1) return
    setRecipeProgress((current) => {
      const existing = current[cookRecipeId]
      if (stepIndex > 0 && stepIndex < totalSteps) {
        const nextProgress = {
          stepIndex,
          totalSteps,
          updatedAt: new Date().toISOString(),
        }
        if (
          existing
          && existing.stepIndex === nextProgress.stepIndex
          && existing.totalSteps === nextProgress.totalSteps
        ) {
          return current
        }
        return {
          ...current,
          [cookRecipeId]: nextProgress,
        }
      }
      if (!existing) return current
      const next = { ...current }
      delete next[cookRecipeId]
      return next
    })
  }, [cookRecipeId, cookSteps.length, stepIndex])

  // Clear the session check-off whenever the open recipe changes.
  useEffect(() => {
    setCheckedCookIngredients(new Set())
  }, [cookRecipeId])

  // Keyboard nav for the Cook panel: ← / → move steps, Esc closes.
  // Only active while cooking (not editing) and no nested dialog is open.
  useEffect(() => {
    if (!cookRecipeId || isRecipeEditMode) return
    if (importDialogOpen || photoEditorRecipeId || deleteConfirmRecipe) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setCookRecipeId(null)
        return
      }
      if (event.key === 'ArrowLeft') {
        setStepIndex((current) => Math.max(0, current - 1))
      } else if (event.key === 'ArrowRight') {
        setStepIndex((current) => Math.min(Math.max(0, cookSteps.length - 1), current + 1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cookRecipeId, isRecipeEditMode, importDialogOpen, photoEditorRecipeId, deleteConfirmRecipe, directionsViewMode, cookSteps.length])

  // Keep the active step in view as it changes (esp. in the all-steps list).
  useEffect(() => {
    if (!cookRecipeId || isRecipeEditMode) return
    const el = currentStepRef.current
    if (!el) return
    const id = window.setTimeout(() => {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 0)
    return () => window.clearTimeout(id)
  }, [cookRecipeId, isRecipeEditMode, directionsViewMode, stepIndex])

  useEffect(() => {
    if (!mealPlannerPlan) {
      setMealPlannerMealConfig({})
      setMealPlannerPantryConfig({})
      return
    }
    const nextConfig: Record<string, { enabled: boolean; deleted: boolean }> = {}
    for (const meal of mealPlannerPlan.proposed_meals) {
      nextConfig[plannerMealKey(meal)] = { enabled: true, deleted: false }
    }
    setMealPlannerMealConfig(nextConfig)
    setMealPlannerPantryConfig({})
  }, [mealPlannerPlan])

  const configuredPlannerMeals = useMemo<ConfiguredMealPlannerMeal[]>(() => {
    if (!mealPlannerPlan) return []
    return mealPlannerPlan.proposed_meals
      .map((meal) => {
        const key = plannerMealKey(meal)
        const config = mealPlannerMealConfig[key] ?? { enabled: true, deleted: false }
        if (config.deleted) return null
        return {
          ...meal,
          key,
          enabled: config.enabled,
        }
      })
      .filter((meal): meal is ConfiguredMealPlannerMeal => meal !== null)
  }, [mealPlannerPlan, mealPlannerMealConfig])

  const activePlannerRecipeIds = useMemo(() => {
    return new Set(configuredPlannerMeals.filter((meal) => meal.enabled).map((meal) => meal.recipe_id))
  }, [configuredPlannerMeals])

  const configuredPlannerGroceries = useMemo(() => {
    if (!mealPlannerPlan) return []
    if (activePlannerRecipeIds.size === 0) return []
    return mealPlannerPlan.grocery_additions.filter((item) =>
      item.source_recipe_ids.some((recipeId) => activePlannerRecipeIds.has(recipeId)),
    )
  }, [mealPlannerPlan, activePlannerRecipeIds])

  const pendingPlannerGroceries = useMemo(() => {
    return configuredPlannerGroceries.filter((item) => !mealPlannerPantryConfig[plannerGroceryKey(item)])
  }, [configuredPlannerGroceries, mealPlannerPantryConfig])

  const lowStockPlannerItems = useMemo(() => {
    return configuredPlannerGroceries.filter((item) => {
      const tracker = projectedPantryForItem(item)
      return Boolean(item.low_stock_prompt || tracker.lowStock)
    })
  }, [configuredPlannerGroceries, mealPlannerPantryConfig, mealPlannerPantryInventory])

  const configuredPlannerMetrics = useMemo(() => {
    if (!mealPlannerPlan) {
      return {
        estimatedLow: 0,
        estimatedHigh: 0,
        wasteScore: 0,
        wasteValue: 0,
        budgetFit: 0,
      }
    }
    const totalBase = Math.max(1, mealPlannerPlan.grocery_additions.length)
    const ratio = pendingPlannerGroceries.length / totalBase
    const estimatedLow = Math.round(mealPlannerPlan.estimated_cost_range.low * ratio)
    const estimatedHigh = Math.round(mealPlannerPlan.estimated_cost_range.high * ratio)
    const wasteScore = pendingPlannerGroceries.length > 0
      ? pendingPlannerGroceries.reduce((sum, row) => sum + (1 - row.waste_ratio), 0) / pendingPlannerGroceries.length
      : 1
    const wasteValue = Number((mealPlannerPlan.estimated_waste_value * ratio).toFixed(2))
    const budgetFit = Math.max(
      0,
      Math.min(1, 1 - Math.max(0, (estimatedHigh / Math.max(1, foodProfile.weeklyBudgetUsd)) - 1)),
    )
    return {
      estimatedLow,
      estimatedHigh,
      wasteScore,
      wasteValue,
      budgetFit,
    }
  }, [mealPlannerPlan, pendingPlannerGroceries, foodProfile.weeklyBudgetUsd])

  const overBudgetSwapHints = useMemo(() => {
    if (!mealPlannerPlan) return []
    if (configuredPlannerMetrics.budgetFit >= 0.8) return []
    return configuredPlannerGroceries
      .map((item) => ({
        name: item.name,
        category: item.category,
        estimatedCost: estimatedPlannerCategoryCost(item.category) * Math.max(1, item.suggested_purchase_quantity ?? 1),
      }))
      .sort((a, b) => b.estimatedCost - a.estimatedCost)
      .slice(0, 4)
      .map((item) => {
        if (item.category === 'meat') return `${item.name} → consider chicken thighs, ground turkey, or beans`
        if (item.category === 'dairy') return `${item.name} → consider store brand or smaller pack`
        if (item.category === 'produce') return `${item.name} → swap to in-season alternatives`
        return `${item.name} → use pantry equivalent first`
      })
  }, [configuredPlannerGroceries, configuredPlannerMetrics.budgetFit, mealPlannerPlan])

  function togglePlannerPantryItem(item: MealPlannerIngredient) {
    const key = plannerGroceryKey(item)
    setMealPlannerPantryConfig((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  function projectedPantryForItem(item: MealPlannerIngredient): { onHand: number | null; remaining: number | null; lowStock: boolean } {
    const key = plannerGroceryKey(item)
    const inventory = mealPlannerPantryInventory[key]
    const checkedAsPantry = Boolean(mealPlannerPantryConfig[key])
    const required = typeof item.required_package_fraction === 'number' ? item.required_package_fraction : 0
    const purchased = checkedAsPantry ? 0 : (typeof item.suggested_purchase_quantity === 'number' ? item.suggested_purchase_quantity : 0)
    let onHand = typeof inventory?.on_hand_packages === 'number' ? inventory.on_hand_packages : (item.inventory_on_hand_packages ?? 0)
    if (checkedAsPantry && onHand <= 0 && required > 0) onHand = required
    const remaining = Number(Math.max(0, onHand + purchased - required).toFixed(2))
    const threshold = inventory?.low_stock_threshold ?? defaultPantryLowStockThreshold(item)
    return {
      onHand: Number.isFinite(onHand) ? Number(onHand.toFixed(2)) : null,
      remaining,
      lowStock: remaining <= threshold,
    }
  }

  async function persistMealPlannerPantryInventory(nextInventory: Record<string, PantryInventoryEntry>) {
    const { error } = await supabase.from('settings').upsert(
      {
        key: 'meal_planner_pantry_inventory',
        value: nextInventory,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
    if (error) throw error
    setMealPlannerPantryInventory(nextInventory)
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECIPE_QUICK_ACTIONS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const actions = parsed
        .map((row: unknown) => {
          if (!row || typeof row !== 'object') return null
          const entry = row as Record<string, unknown>
          const field = String(entry.field ?? '')
          if (!['quantity', 'unit', 'name', 'raw_text'].includes(field)) return null
          const pattern = String(entry.pattern ?? '').trim()
          if (!pattern) return null
          return {
            id: String(entry.id ?? crypto.randomUUID()),
            name: String(entry.name ?? 'Saved quick action'),
            description: typeof entry.description === 'string' ? entry.description : null,
            field: field as RecipeRegexQuickAction['field'],
            pattern,
            replacement: String(entry.replacement ?? ''),
            flags: typeof entry.flags === 'string' ? entry.flags : null,
          } as RecipeRegexQuickAction
        })
        .filter((action: RecipeRegexQuickAction | null): action is RecipeRegexQuickAction => action !== null)
      setRecipeQuickActions(actions)
    } catch {
      setRecipeQuickActions([])
    }
  }, [])

  useEffect(() => {
    if (!cookRecipe) {
      setIsRecipeEditMode(false)
      setRecipeEditorDraft(null)
      setRecipeEditorError(null)
      setRecipeEditorStatus(null)
      setRecipeAiInstruction('')
      setRecipeAiError(null)
      setRecipeSuggestedQuickAction(null)
      return
    }
    setRecipeEditorStatus(null)
    setRecipeEditorError(null)
  }, [cookRecipe])

  function openRecipeForCookMode(recipeId: string) {
    setCookRecipeId(recipeId)
    setStepIndex(0)
    setRecipeScale('1')
    setDirectionsViewMode('step')
    setLibraryActionError(null)
  }

  function startRecipeEditing() {
    if (!cookRecipe) return
    const nextDraft: RecipeEditorDraft = {
      name: cookRecipe.name,
      ingredients: cookIngredients.map((ingredient) => {
        const normalized = normalizeRecipeIngredientFields({
          rawText: ingredient.raw_text,
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
        })
        return {
          raw_text: ingredient.raw_text,
          name: normalized.name,
          quantity: normalized.quantity,
          unit: normalized.unit,
          optional: false,
        }
      }),
      steps: renumberDraftSteps(cookSteps.map((step) => ({
        step_number: step.step_number,
        instruction: step.instruction,
      }))),
    }
    setRecipeEditorDraft(nextDraft)
    setRecipeEditorError(null)
    setRecipeEditorStatus(null)
    setRecipeAiInstruction('')
    setRecipeAiError(null)
    setRecipeSuggestedQuickAction(null)
    setIsRecipeEditMode(true)
  }

  function cancelRecipeEditing() {
    setIsRecipeEditMode(false)
    setRecipeEditorDraft(null)
    setRecipeEditorError(null)
    setRecipeEditorStatus(null)
    setRecipeAiInstruction('')
    setRecipeAiError(null)
    setRecipeSuggestedQuickAction(null)
  }

  function applyPipeChoiceToRecipeDraft(side: 'left' | 'right') {
    setRecipeEditorDraft((current) => {
      if (!current) return current
      const pickSide = (value: string | null): string | null => {
        if (!value) return value
        if (!value.includes('|')) return value
        const [left, right] = value.split('|')
        const choice = side === 'left' ? left : right
        return choice?.trim() || null
      }
      const nextIngredients = current.ingredients.map((ingredient) => {
        const next = {
          ...ingredient,
          raw_text: pickSide(ingredient.raw_text) ?? ingredient.raw_text,
          quantity: pickSide(ingredient.quantity),
          unit: pickSide(ingredient.unit),
          name: pickSide(ingredient.name),
        }
        const normalized = normalizeRecipeIngredientFields({
          rawText: next.raw_text,
          name: next.name,
          quantity: next.quantity,
          unit: next.unit,
        })
        return {
          ...next,
          name: normalized.name,
          quantity: normalized.quantity,
          unit: normalized.unit,
          raw_text: next.raw_text || buildIngredientRawText(normalized.name, normalized.quantity, normalized.unit) || ingredient.raw_text,
        }
      })
      return { ...current, ingredients: nextIngredients }
    })
  }

  function applyRegexQuickAction(action: RecipeRegexQuickAction) {
    setRecipeEditorError(null)
    setRecipeEditorDraft((current) => {
      if (!current) return current
      let regex: RegExp
      try {
        regex = new RegExp(action.pattern, action.flags ?? '')
      } catch {
        setRecipeEditorError(`Invalid quick action regex: ${action.name}`)
        return current
      }
      const nextIngredients = current.ingredients.map((ingredient) => {
        const next = { ...ingredient }
        const value = String(next[action.field] ?? '')
        const replaced = value.replace(regex, action.replacement).trim()
        if (action.field === 'raw_text') {
          next.raw_text = replaced
        } else if (action.field === 'name') {
          next.name = replaced || null
        } else if (action.field === 'quantity') {
          next.quantity = replaced || null
        } else {
          next.unit = replaced || null
        }
        const normalized = normalizeRecipeIngredientFields({
          rawText: next.raw_text,
          name: next.name,
          quantity: next.quantity,
          unit: next.unit,
        })
        return {
          ...next,
          name: normalized.name,
          quantity: normalized.quantity,
          unit: normalized.unit,
          raw_text: next.raw_text || buildIngredientRawText(normalized.name, normalized.quantity, normalized.unit) || ingredient.raw_text,
        }
      })
      return { ...current, ingredients: nextIngredients }
    })
  }

  function saveSuggestedQuickAction() {
    if (!recipeSuggestedQuickAction) return
    const nextActions = [...recipeQuickActions, recipeSuggestedQuickAction]
    setRecipeQuickActions(nextActions)
    localStorage.setItem(RECIPE_QUICK_ACTIONS_STORAGE_KEY, JSON.stringify(nextActions))
    setRecipeSuggestedQuickAction(null)
    setRecipeEditorStatus('Saved new quick action for future recipe edits.')
  }

  async function applyAiRecipeEdit() {
    if (!recipeEditorDraft) return
    const instruction = recipeAiInstruction.trim()
    if (!instruction) {
      setRecipeAiError('Enter an instruction for AI edit.')
      return
    }
    setRecipeAiEditing(true)
    setRecipeAiError(null)
    setRecipeEditorError(null)
    try {
      const { data, error } = await supabase.functions.invoke('recipe-edit-assistant', {
        body: {
          instruction,
          recipe: recipeEditorDraft,
        },
      })
      if (error) throw error
      const recipeRaw = data?.recipe as Record<string, unknown> | undefined
      if (!recipeRaw) throw new Error('AI did not return an updated recipe')
      const ingredientsRaw = Array.isArray(recipeRaw.ingredients) ? recipeRaw.ingredients : []
      const stepsRaw = Array.isArray(recipeRaw.steps) ? recipeRaw.steps : []
      const nextDraft: RecipeEditorDraft = {
        name: String(recipeRaw.name ?? recipeEditorDraft.name).trim() || recipeEditorDraft.name,
        ingredients: ingredientsRaw
          .map((row) => {
            if (!row || typeof row !== 'object') return null
            const item = row as Record<string, unknown>
            const rawText = String(item.raw_text ?? '').trim()
            const normalized = normalizeRecipeIngredientFields({
              rawText: rawText || `${String(item.quantity ?? '')} ${String(item.unit ?? '')} ${String(item.name ?? '')}`.trim(),
              name: typeof item.name === 'string' ? item.name : null,
              quantity: typeof item.quantity === 'string' ? item.quantity : null,
              unit: typeof item.unit === 'string' ? item.unit : null,
            })
            const mergedRawText = rawText || buildIngredientRawText(normalized.name, normalized.quantity, normalized.unit)
            if (!mergedRawText && !normalized.name) return null
            return {
              raw_text: mergedRawText || normalized.name || '',
              name: normalized.name,
              quantity: normalized.quantity,
              unit: normalized.unit,
              optional: Boolean(item.optional),
            } as RecipeDraftIngredient
          })
          .filter((row): row is RecipeDraftIngredient => row !== null),
        steps: renumberDraftSteps(
          stepsRaw
            .map((row) => {
              if (!row || typeof row !== 'object') return null
              const item = row as Record<string, unknown>
              const instructionText = String(item.instruction ?? '').trim()
              if (!instructionText) return null
              return { step_number: 0, instruction: instructionText } as RecipeDraftStep
            })
            .filter((row): row is RecipeDraftStep => row !== null),
        ),
      }
      setRecipeEditorDraft(nextDraft)
      const suggestedRaw = data?.suggested_quick_action as Record<string, unknown> | undefined
      if (suggestedRaw) {
        const field = String(suggestedRaw.field ?? '')
        const pattern = String(suggestedRaw.pattern ?? '').trim()
        if (['quantity', 'unit', 'name', 'raw_text'].includes(field) && pattern) {
          setRecipeSuggestedQuickAction({
            id: crypto.randomUUID(),
            name: String(suggestedRaw.name ?? 'AI quick action'),
            description: typeof suggestedRaw.description === 'string' ? suggestedRaw.description : null,
            field: field as RecipeRegexQuickAction['field'],
            pattern,
            replacement: String(suggestedRaw.replacement ?? ''),
            flags: typeof suggestedRaw.flags === 'string' ? suggestedRaw.flags : null,
          })
        } else {
          setRecipeSuggestedQuickAction(null)
        }
      } else {
        setRecipeSuggestedQuickAction(null)
      }
      setRecipeEditorStatus('AI edit applied. Review before saving.')
    } catch (error) {
      setRecipeAiError(formatSupabaseError(error, 'AI edit failed'))
    } finally {
      setRecipeAiEditing(false)
    }
  }

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
    const normalized = normalizeRecipeIngredientFields({
      rawText: ingredient.raw_text,
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
    })
    const scaledQuantity = scaleQuantityValue(normalized.quantity, Number(recipeScale))
    const unit = (normalized.unit ?? '').toLowerCase().trim()
    if (!scaledQuantity) return normalized.unit ?? ''
    if (!showCupsConversion) {
      return `${scaledQuantity}${normalized.unit ? ` ${normalized.unit}` : ''}`.trim()
    }
    if (unit === 'g' || unit === 'gram' || unit === 'grams') {
      const numeric = Number(scaledQuantity)
      if (Number.isFinite(numeric)) {
        return gramsToCupsLabel(numeric, normalized.name || ingredient.raw_text)
      }
    }
    if (unit === 'oz' || unit === 'ounce' || unit === 'ounces') {
      const numeric = Number(scaledQuantity)
      if (Number.isFinite(numeric)) {
        const grams = Math.round(numeric * 28.35)
        return `${grams} g`
      }
    }
    return `${scaledQuantity}${normalized.unit ? ` ${normalized.unit}` : ''}`.trim()
  }

  async function getOrCreateShoppingListId(): Promise<string> {
    const { data: listRows, error: listError } = await supabase
      .from('grocery_lists')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
    if (listError) throw listError
    const existingId = listRows?.[0]?.id
    if (existingId) return String(existingId)
    const { data: newList, error: newListError } = await supabase
      .from('grocery_lists')
      .insert({ name: 'Shopping' })
      .select('id')
      .single()
    if (newListError) throw newListError
    return String(newList.id)
  }

  async function insertUniqueGroceryItems(listId: string, items: Array<{ name: string; quantity: string | null; unit: string | null; notes: string }>): Promise<number> {
    const { data: existingItems, error: existingError } = await supabase
      .from('grocery_items')
      .select('name')
      .eq('list_id', listId)
      .is('deleted_at', null)
    if (existingError) throw existingError

    const existingNames = new Set(
      (existingItems ?? [])
        .map((row) => String((row as { name?: unknown }).name ?? '').trim().toLowerCase())
        .filter(Boolean),
    )

    const rowsToInsert = items.flatMap((item) => {
      const name = item.name.trim().replace(/\s+/g, ' ')
      if (!name) return []
      const key = name.toLowerCase()
      if (existingNames.has(key)) return []
      existingNames.add(key)
      return [{
        list_id: listId,
        name,
        quantity: item.quantity,
        unit: item.unit,
        category: inferCategoryFromName(name),
        checked: false,
        notes: item.notes,
        last_modified_source: 'casa' as const,
      }]
    })

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase.from('grocery_items').insert(rowsToInsert)
      if (insertError && insertError.code !== '23505') throw insertError
    }
    return rowsToInsert.length
  }

  async function smartAddIngredientsToShoppingList(recipe: Recipe) {
    setLibraryActionError(null)
    setLibraryActionStatus(null)
    setSmartAddingRecipeId(recipe.id)
    try {
      const recipeIngredients = ingredientsByRecipe.get(recipe.id) ?? []
      if (recipeIngredients.length === 0) {
        throw new Error('This recipe has no ingredients to add.')
      }

      const listId = await getOrCreateShoppingListId()
      const items = recipeIngredients.map((ingredient) => {
        const normalized = normalizeRecipeIngredientFields({
          rawText: ingredient.raw_text,
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
        })
        return {
          name: (normalized.name || ingredient.raw_text).trim().replace(/\s+/g, ' '),
          quantity: normalized.quantity,
          unit: normalized.unit,
          notes: `From recipe: ${recipe.name}`,
        }
      })
      const insertedCount = await insertUniqueGroceryItems(listId, items)

      setLibraryActionStatus(
        insertedCount > 0
          ? `Added ${insertedCount} ingredient${insertedCount === 1 ? '' : 's'} from "${recipe.name}" to shopping list.`
          : `All ingredients from "${recipe.name}" are already on your shopping list.`,
      )
    } catch (error) {
      setLibraryActionError(formatSupabaseError(error, 'Could not add ingredients to shopping list'))
    } finally {
      setSmartAddingRecipeId(null)
    }
  }

  function toggleConfiguredMeal(mealKey: string) {
    setMealPlannerMealConfig((current) => {
      const entry = current[mealKey] ?? { enabled: true, deleted: false }
      return {
        ...current,
        [mealKey]: { ...entry, enabled: !entry.enabled },
      }
    })
  }

  function deleteConfiguredMeal(mealKey: string) {
    setMealPlannerMealConfig((current) => {
      const entry = current[mealKey] ?? { enabled: true, deleted: false }
      return {
        ...current,
        [mealKey]: { ...entry, deleted: true, enabled: false },
      }
    })
  }

  async function persistMealPlannerTemplates(nextTemplates: MealPlannerTemplate[]) {
    const { error } = await supabase.from('settings').upsert(
      {
        key: 'meal_planner_templates',
        value: nextTemplates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
    if (error) throw error
    setMealPlannerTemplates(nextTemplates)
  }

  async function persistMealPlannerLearning(nextLearning: MealPlannerLearning) {
    const { error } = await supabase.from('settings').upsert(
      {
        key: 'meal_planner_learning',
        value: nextLearning,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )
    if (error) throw error
    setMealPlannerLearning(nextLearning)
  }

  function collectPlanIngredientSignals(plan: MealPlannerPlan): { preferred: string[]; avoided: string[] } {
    const preferred = plan.overlap_ingredients
      .slice(0, 8)
      .map((row) => row.name.trim().toLowerCase())
      .filter(Boolean)
    const avoided = plan.grocery_additions
      .filter((row) => row.waste_ratio >= 0.45)
      .slice(0, 8)
      .map((row) => row.name.trim().toLowerCase())
      .filter(Boolean)
    return { preferred, avoided }
  }

  async function recordPlannerAcceptance(plan: MealPlannerPlan, prompt: string) {
    const signals = collectPlanIngredientSignals(plan)
    const nextLearning: MealPlannerLearning = {
      preferred_ingredients: Array.from(new Set([...mealPlannerLearning.preferred_ingredients, ...signals.preferred])).slice(0, 30),
      avoided_ingredients: Array.from(new Set([...mealPlannerLearning.avoided_ingredients, ...signals.avoided])).slice(0, 30),
      successful_prompts: Array.from(new Set([prompt.trim(), ...mealPlannerLearning.successful_prompts].filter(Boolean))).slice(0, 20),
      template_names: mealPlannerLearning.template_names.slice(0, 12),
    }
    await persistMealPlannerLearning(nextLearning)
  }

  async function recordPlannerRejection(plan: MealPlannerPlan) {
    const signals = collectPlanIngredientSignals(plan)
    if (signals.preferred.length === 0 && signals.avoided.length === 0) return
    const nextLearning: MealPlannerLearning = {
      ...mealPlannerLearning,
      avoided_ingredients: Array.from(new Set([...mealPlannerLearning.avoided_ingredients, ...signals.preferred])).slice(0, 30),
    }
    await persistMealPlannerLearning(nextLearning)
  }

  async function saveCurrentPromptTemplate() {
    const prompt = mealPlannerPrompt.trim()
    if (!prompt) {
      setMealPlannerError('Enter a planner prompt before saving a template.')
      return
    }
    const name = mealPlannerTemplateName.trim() || `Template ${mealPlannerTemplates.length + 1}`
    const template: MealPlannerTemplate = {
      id: crypto.randomUUID(),
      name,
      prompt,
      created_at: new Date().toISOString(),
    }
    try {
      const nextTemplates = [template, ...mealPlannerTemplates].slice(0, 12)
      await persistMealPlannerTemplates(nextTemplates)
      const nextLearning: MealPlannerLearning = {
        ...mealPlannerLearning,
        template_names: Array.from(new Set([name, ...mealPlannerLearning.template_names])).slice(0, 12),
      }
      await persistMealPlannerLearning(nextLearning)
      setMealPlannerTemplateName('')
      setMealPlannerStatus(`Saved template "${name}".`)
    } catch (error) {
      setMealPlannerError(formatSupabaseError(error, 'Could not save planner template'))
    }
  }

  async function runWeeklyAutoDraft() {
    const baseTemplate = mealPlannerTemplates[0]
    const learnedPrompt = mealPlannerLearning.successful_prompts[0]
    const autoPromptBase = learnedPrompt
      ? `${learnedPrompt} Keep overlap high, reduce waste, and stay near budget.`
      : baseTemplate?.prompt
      ? `${baseTemplate.prompt} Keep overlap high and stay close to budget.`
      : `Plan ${foodProfile.defaultMealsPerWeek} dinners this week with overlapping ingredients under $${foodProfile.weeklyBudgetUsd}.`
    const autoPrompt = `${autoPromptBase} Strategy: ${strategyInstruction(mealPlannerStrategy)}`
    setMealPlannerPrompt(autoPrompt)
    await generateMealPlan(autoPrompt)
  }

  async function optimizeCurrentPlanForBudget() {
    const nextPrompt = `${mealPlannerPrompt.trim()} Keep total basket under $${Math.max(20, Math.round(foodProfile.weeklyBudgetUsd * 0.9))} and swap expensive proteins for lower-cost alternatives where possible.`
    setMealPlannerStrategy('budget')
    setMealPlannerPrompt(nextPrompt)
    try {
      await generateMealPlan(nextPrompt)
      await appendMealPlannerActionLog({
        action: 'optimize_budget',
        status: 'success',
        detail: 'Regenerated plan in budget-first mode with tighter spend target.',
        trace_id: mealPlannerLastTraceId,
      })
    } catch (error) {
      await appendMealPlannerActionLog({
        action: 'optimize_budget',
        status: 'error',
        detail: formatSupabaseError(error, 'Could not optimize budget plan'),
        trace_id: mealPlannerLastTraceId,
      })
    }
  }

  async function generateMealPlan(promptOverride?: string) {
    const promptCore = (promptOverride ?? mealPlannerPrompt).trim()
    const prompt = `${promptCore} Strategy: ${strategyInstruction(mealPlannerStrategy)}`.trim()
    if (!prompt) {
      setMealPlannerError('Enter your meal planning request first.')
      return
    }
    setMealPlannerLoading(true)
    setMealPlannerError(null)
    setMealPlannerStatus(null)
    setMealPlannerAddResult(null)
    const traceId = crypto.randomUUID()
    setMealPlannerLastTraceId(traceId)
    try {
      const { data, error } = await supabase.functions.invoke('meal-planner-assistant', {
        body: {
          prompt,
          food_profile: foodProfile,
          learning_signals: mealPlannerLearning,
          pantry_inventory: mealPlannerPantryInventory,
          planner_strategy: mealPlannerStrategy,
          trace_id: traceId,
          debug: true,
        },
      })
      if (error) throw error
      if (!data?.success || !data?.plan) {
        throw new Error(String(data?.error ?? 'Planner response was empty'))
      }
      setMealPlannerPlan(data.plan as MealPlannerPlan)
      setMealPlannerDebug((data.debug && typeof data.debug === 'object') ? data.debug as Record<string, unknown> : null)
      setMealPlannerStatus('Plan ready. Review then apply actions.')
      await appendMealPlannerActionLog({
        action: 'generate_plan',
        status: 'success',
        detail: `Generated ${Array.isArray((data.plan as MealPlannerPlan)?.proposed_meals) ? (data.plan as MealPlannerPlan).proposed_meals.length : 0} meals with ${mealPlannerStrategy} strategy.`,
        trace_id: traceId,
      })
    } catch (error) {
      setMealPlannerError(formatSupabaseError(error, 'Could not generate meal plan'))
      await appendMealPlannerActionLog({
        action: 'generate_plan',
        status: 'error',
        detail: formatSupabaseError(error, 'Could not generate meal plan'),
        trace_id: traceId,
      })
    } finally {
      setMealPlannerLoading(false)
    }
  }

  async function applyPlannerGroceries() {
    if (!mealPlannerPlan) return
    setMealPlannerError(null)
    setMealPlannerStatus(null)
    setMealPlannerAddResult(null)
    setMealPlannerAddingGroceries(true)
    try {
      const attempted = pendingPlannerGroceries.length
      if (attempted === 0) {
        throw new Error('No active grocery items to add.')
      }
      const listId = await getOrCreateShoppingListId()
      const inserted = await insertUniqueGroceryItems(
        listId,
        pendingPlannerGroceries.map((item) => {
          const tracker = projectedPantryForItem(item)
          return {
            name: item.name,
            quantity: typeof item.suggested_purchase_quantity === 'number'
              ? String(item.suggested_purchase_quantity)
              : item.quantity,
            unit: item.suggested_purchase_unit || item.unit,
            notes: [
              'Meal Planner AI week plan',
              item.quantity ? `Need ${item.quantity}${item.unit ? ` ${item.unit}` : ''}.` : null,
              item.suggested_purchase_display ? `Buy ${item.suggested_purchase_display}.` : null,
              tracker.lowStock ? 'Any chance you are low on this pantry staple?' : null,
            ].filter(Boolean).join(' '),
          }
        }),
      )
      const nextInventory = { ...mealPlannerPantryInventory }
      const auditEntries: PantryInventoryAuditEntry[] = []
      const nowIso = new Date().toISOString()
      for (const item of configuredPlannerGroceries) {
        const key = plannerGroceryKey(item)
        const existing = nextInventory[key]
        const checkedAsPantry = Boolean(mealPlannerPantryConfig[key])
        const required = typeof item.required_package_fraction === 'number' ? item.required_package_fraction : 0
        const purchased = checkedAsPantry ? 0 : (typeof item.suggested_purchase_quantity === 'number' ? item.suggested_purchase_quantity : 0)
        let onHand = typeof existing?.on_hand_packages === 'number' ? existing.on_hand_packages : (item.inventory_on_hand_packages ?? 0)
        if (checkedAsPantry && onHand <= 0 && required > 0) onHand = required
        const before = Number(onHand.toFixed(2))
        const remaining = Number(Math.max(0, onHand + purchased - required).toFixed(2))
        nextInventory[key] = {
          name: item.name,
          category: item.category,
          package_unit: normalizePackageUnit(item.suggested_purchase_unit || item.unit),
          package_size: item.suggested_purchase_size,
          on_hand_packages: remaining,
          low_stock_threshold: existing?.low_stock_threshold ?? defaultPantryLowStockThreshold(item),
          updated_at: nowIso,
        }
        const delta = Number((remaining - before).toFixed(2))
        if (Math.abs(delta) > 0.001) {
          auditEntries.push({
            id: crypto.randomUUID(),
            created_at: nowIso,
            source: 'planner',
            reason: checkedAsPantry ? 'Used pantry stock for planned meals' : 'Purchased packs from planner groceries',
            item_key: normalizePantryKey(item.name, item.category),
            name: item.name,
            category: item.category,
            package_unit: normalizePackageUnit(item.suggested_purchase_unit || item.unit),
            package_size: item.suggested_purchase_size,
            before_packages: before,
            delta_packages: delta,
            after_packages: remaining,
          })
        }
      }
      await persistMealPlannerPantryInventory(nextInventory)
      if (auditEntries.length > 0) {
        const { data: auditSettingsRow, error: auditLoadError } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'meal_planner_pantry_audit_log')
          .maybeSingle()
        if (auditLoadError) throw auditLoadError
        const existingAudit = sanitizePantryInventoryAudit(auditSettingsRow?.value)
        const nextAudit = appendPantryInventoryAudit(existingAudit, auditEntries)
        const { error: auditSaveError } = await supabase.from('settings').upsert(
          {
            key: 'meal_planner_pantry_audit_log',
            value: nextAudit,
            updated_at: nowIso,
          },
          { onConflict: 'key' },
        )
        if (auditSaveError) throw auditSaveError
      }
      setMealPlannerAddResult({ attempted, inserted, at: new Date().toISOString() })
      setMealPlannerStatus(
        inserted > 0
          ? `Added ${inserted} planner ingredient${inserted === 1 ? '' : 's'} to shopping list and updated pantry tracker.`
          : 'Planner ingredients were already on your shopping list. Pantry tracker updated.',
      )
      await appendMealPlannerActionLog({
        action: 'apply_groceries',
        status: 'success',
        detail: `Attempted ${attempted}; added ${inserted}; strategy ${mealPlannerStrategy}.`,
        trace_id: mealPlannerLastTraceId,
      })
      await recordPlannerAcceptance(mealPlannerPlan, mealPlannerPrompt)
    } catch (error) {
      setMealPlannerError(formatSupabaseError(error, 'Could not add planner groceries'))
      await appendMealPlannerActionLog({
        action: 'apply_groceries',
        status: 'error',
        detail: formatSupabaseError(error, 'Could not add planner groceries'),
        trace_id: mealPlannerLastTraceId,
      })
    } finally {
      setMealPlannerAddingGroceries(false)
    }
  }

  async function applyPlannerMealQueue() {
    if (!mealPlannerPlan) return
    setMealPlannerError(null)
    setMealPlannerStatus(null)
    try {
      const rows = configuredPlannerMeals
        .filter((meal) => meal.enabled)
        .map((meal) => ({
        recipe_id: meal.recipe_id,
        slot: meal.slot,
        planned_for: meal.planned_for,
        notes: `Meal Planner AI · overlap ${(meal.overlap_score * 100).toFixed(0)}%`,
      }))
      if (rows.length === 0) {
        throw new Error('No active meals selected to queue.')
      }

      const { error } = await supabase
        .from('recipe_meal_plans')
        .upsert(rows, { onConflict: 'recipe_id,slot' })
      if (error) throw error
      await refetchMealPlans()
      setMealPlannerStatus('Queued planner meals in your meal slots.')
      await appendMealPlannerActionLog({
        action: 'queue_meals',
        status: 'success',
        detail: `Queued ${rows.length} meals to slots.`,
        trace_id: mealPlannerLastTraceId,
      })
      await recordPlannerAcceptance(mealPlannerPlan, mealPlannerPrompt)
    } catch (error) {
      setMealPlannerError(formatSupabaseError(error, 'Could not queue planner meals'))
      await appendMealPlannerActionLog({
        action: 'queue_meals',
        status: 'error',
        detail: formatSupabaseError(error, 'Could not queue planner meals'),
        trace_id: mealPlannerLastTraceId,
      })
    }
  }

  async function reinforceCurrentPlanPreferences() {
    if (!mealPlannerPlan) return
    setMealPlannerError(null)
    setMealPlannerStatus(null)
    try {
      const overlapNames = mealPlannerPlan.overlap_ingredients
        .slice(0, 10)
        .map((row) => row.name.toLowerCase())
        .filter(Boolean)
      const nextLearning: MealPlannerLearning = {
        ...mealPlannerLearning,
        preferred_ingredients: Array.from(new Set([
          ...mealPlannerLearning.preferred_ingredients,
          ...overlapNames,
        ])).slice(0, 30),
      }
      await persistMealPlannerLearning(nextLearning)
      setMealPlannerStatus('Captured this plan pattern as a preference for future drafts.')
    } catch (error) {
      setMealPlannerError(formatSupabaseError(error, 'Could not save plan preference'))
    }
  }

  async function removePlannedMeal(plan: RecipeMealPlan, recipe: Recipe) {
    const actionId = `${plan.slot}:${recipe.id}`
    setPlannedMealActionId(actionId)
    setPlannedMealError(null)
    setPlannedMealStatus(null)
    try {
      const { error } = await supabase
        .from('recipe_meal_plans')
        .delete()
        .eq('recipe_id', recipe.id)
        .eq('slot', plan.slot)
      if (error) throw error
      await refetchMealPlans()
      setPlannedMealStatus(`Removed "${recipe.name}" from ${SLOT_LABELS[plan.slot]}.`)
    } catch (error) {
      setPlannedMealError(formatSupabaseError(error, 'Could not remove planned meal'))
    } finally {
      setPlannedMealActionId(null)
    }
  }

  async function markPlannedMealCooked(plan: RecipeMealPlan, recipe: Recipe) {
    const actionId = `${plan.slot}:${recipe.id}:cooked`
    setPlannedMealActionId(actionId)
    setPlannedMealError(null)
    setPlannedMealStatus(null)
    try {
      const { error } = await supabase
        .from('recipe_meal_plans')
        .delete()
        .eq('recipe_id', recipe.id)
        .eq('slot', plan.slot)
      if (error) throw error
      await refetchMealPlans()
      setPlannedMealStatus(`Marked "${recipe.name}" cooked from ${SLOT_LABELS[plan.slot]}.`)
      await appendMealPlannerActionLog({
        action: 'cook_complete',
        status: 'success',
        detail: `Completed ${recipe.name} (${SLOT_LABELS[plan.slot]}).`,
        trace_id: mealPlannerLastTraceId,
      })
    } catch (error) {
      setPlannedMealError(formatSupabaseError(error, 'Could not mark meal cooked'))
      await appendMealPlannerActionLog({
        action: 'cook_complete',
        status: 'error',
        detail: formatSupabaseError(error, 'Could not mark meal cooked'),
        trace_id: mealPlannerLastTraceId,
      })
    } finally {
      setPlannedMealActionId(null)
    }
  }

  async function shiftPlannedMealSlot(plan: RecipeMealPlan, recipe: Recipe, direction: -1 | 1) {
    const currentIndex = SLOT_ORDER.indexOf(plan.slot)
    if (currentIndex < 0) return
    const targetIndex = currentIndex + direction
    if (targetIndex < 0 || targetIndex >= SLOT_ORDER.length) return
    const targetSlot = SLOT_ORDER[targetIndex]
    const actionId = `${plan.slot}:${recipe.id}:shift:${targetSlot}`
    setPlannedMealActionId(actionId)
    setPlannedMealError(null)
    setPlannedMealStatus(null)
    try {
      const { error } = await supabase.from('recipe_meal_plans').upsert(
        [{
          recipe_id: recipe.id,
          slot: targetSlot,
          planned_for: plan.planned_for ?? null,
          notes: plan.notes ?? null,
        }],
        { onConflict: 'recipe_id,slot' },
      )
      if (error) throw error
      const { error: deleteError } = await supabase
        .from('recipe_meal_plans')
        .delete()
        .eq('recipe_id', recipe.id)
        .eq('slot', plan.slot)
      if (deleteError) throw deleteError
      await refetchMealPlans()
      setPlannedMealStatus(`Moved "${recipe.name}" to ${SLOT_LABELS[targetSlot]}.`)
    } catch (error) {
      setPlannedMealError(formatSupabaseError(error, 'Could not move planned meal'))
    } finally {
      setPlannedMealActionId(null)
    }
  }

  async function deleteRecipe(recipe: Recipe) {
    setLibraryActionError(null)
    setLibraryActionStatus(null)
    setDeletingRecipeId(recipe.id)
    try {
      const [
        { error: ingredientError },
        { error: stepError },
        { error: mealPlanError },
        { error: imageError },
      ] = await Promise.all([
        supabase.from('recipe_ingredients').delete().eq('recipe_id', recipe.id),
        supabase.from('recipe_steps').delete().eq('recipe_id', recipe.id),
        supabase.from('recipe_meal_plans').delete().eq('recipe_id', recipe.id),
        supabase.from('recipe_images').delete().eq('recipe_id', recipe.id),
      ])

      if (ingredientError) throw new Error(`Deleting recipe ingredients failed: ${formatSupabaseError(ingredientError, 'Could not delete ingredients')}`)
      if (stepError) throw new Error(`Deleting recipe steps failed: ${formatSupabaseError(stepError, 'Could not delete steps')}`)
      if (mealPlanError) throw new Error(`Deleting meal plans failed: ${formatSupabaseError(mealPlanError, 'Could not delete meal plans')}`)
      const missingRecipeImagesTable = imageError?.code === '42P01' || imageError?.code === 'PGRST205'
      if (imageError && !missingRecipeImagesTable) {
        throw new Error(`Deleting recipe photos failed: ${formatSupabaseError(imageError, 'Could not delete recipe photos')}`)
      }

      const { error: recipeError } = await supabase.from('recipes').delete().eq('id', recipe.id)
      if (recipeError) throw new Error(`Deleting recipe failed: ${formatSupabaseError(recipeError, 'Could not delete recipe')}`)

      await refetchRecipes()
      setCookRecipeId((current) => (current === recipe.id ? null : current))
      setPhotoEditorRecipeId((current) => (current === recipe.id ? null : current))
      setLibraryActionStatus(`Deleted "${recipe.name}".`)
    } catch (error) {
      setLibraryActionError(formatSupabaseError(error, 'Could not delete recipe'))
    } finally {
      setDeletingRecipeId(null)
    }
  }

  function requestDeleteRecipe(recipe: Recipe) {
    setDeleteConfirmRecipe(recipe)
  }

  async function confirmDeleteRecipe() {
    if (!deleteConfirmRecipe) return
    const recipe = deleteConfirmRecipe
    await deleteRecipe(recipe)
    setDeleteConfirmRecipe(null)
  }

  function updateRecipeDraftIngredient(index: number, patch: Partial<RecipeDraftIngredient>) {
    setRecipeEditorDraft((current) => {
      if (!current) return current
      const nextIngredients = current.ingredients.map((ingredient, ingredientIndex) => {
        if (ingredientIndex !== index) return ingredient
        const next = { ...ingredient, ...patch }
        const normalized = normalizeRecipeIngredientFields({
          rawText: next.raw_text,
          name: next.name,
          quantity: next.quantity,
          unit: next.unit,
        })
        return {
          ...next,
          name: normalized.name,
          quantity: normalized.quantity,
          unit: normalized.unit,
        }
      })
      return { ...current, ingredients: nextIngredients }
    })
  }

  function addRecipeDraftIngredient() {
    setRecipeEditorDraft((current) => {
      if (!current) return current
      return {
        ...current,
        ingredients: [...current.ingredients, { raw_text: '', name: null, quantity: null, unit: null, optional: false }],
      }
    })
  }

  function removeRecipeDraftIngredient(index: number) {
    setRecipeEditorDraft((current) => {
      if (!current) return current
      return {
        ...current,
        ingredients: current.ingredients.filter((_, ingredientIndex) => ingredientIndex !== index),
      }
    })
  }

  function updateRecipeDraftStep(index: number, instruction: string) {
    setRecipeEditorDraft((current) => {
      if (!current) return current
      const nextSteps = current.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, instruction } : step)
      return { ...current, steps: renumberDraftSteps(nextSteps) }
    })
  }

  function moveRecipeDraftStep(index: number, direction: -1 | 1) {
    setRecipeEditorDraft((current) => {
      if (!current) return current
      const target = index + direction
      if (target < 0 || target >= current.steps.length) return current
      const nextSteps = [...current.steps]
      const [moved] = nextSteps.splice(index, 1)
      nextSteps.splice(target, 0, moved)
      return { ...current, steps: renumberDraftSteps(nextSteps) }
    })
  }

  function addRecipeDraftStepAfter(index: number) {
    setRecipeEditorDraft((current) => {
      if (!current) return current
      const nextSteps = [...current.steps]
      nextSteps.splice(index + 1, 0, { step_number: index + 2, instruction: '' })
      return { ...current, steps: renumberDraftSteps(nextSteps) }
    })
  }

  function removeRecipeDraftStep(index: number) {
    setRecipeEditorDraft((current) => {
      if (!current) return current
      if (current.steps.length <= 1) return current
      const nextSteps = current.steps.filter((_, stepIndex) => stepIndex !== index)
      return { ...current, steps: renumberDraftSteps(nextSteps) }
    })
  }

  async function saveRecipeEdits() {
    if (!cookRecipe || !recipeEditorDraft) return
    setRecipeEditorSaving(true)
    setRecipeEditorError(null)
    setRecipeEditorStatus(null)
    try {
      const cleanedName = recipeEditorDraft.name.trim()
      if (!cleanedName) throw new Error('Recipe name is required.')

      const cleanedSteps = renumberDraftSteps(
        recipeEditorDraft.steps
          .map((step) => ({ ...step, instruction: step.instruction.trim() }))
          .filter((step) => step.instruction.length > 0),
      )
      if (cleanedSteps.length === 0) throw new Error('Add at least one direction step.')

      const ingredientRows = recipeEditorDraft.ingredients
        .map((ingredient) => {
          const normalized = normalizeRecipeIngredientFields({
            rawText: ingredient.raw_text,
            name: ingredient.name,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
          })
          const rawText = ingredient.raw_text.trim() || buildIngredientRawText(normalized.name, normalized.quantity, normalized.unit)
          const name = normalized.name?.trim() ?? null
          if (!rawText && !name) return null
          return {
            raw_text: rawText || name || '',
            name,
            quantity: normalized.quantity,
            unit: normalized.unit,
            optional: ingredient.optional,
          }
        })
        .filter((row): row is { raw_text: string; name: string | null; quantity: string | null; unit: string | null; optional: boolean } => row !== null)

      const { error: recipeError } = await supabase
        .from('recipes')
        .update({
          name: cleanedName,
          instructions_text: cleanedSteps.map((step) => `${step.step_number}. ${step.instruction}`).join('\n'),
          last_used_at: new Date().toISOString(),
        })
        .eq('id', cookRecipe.id)
      if (recipeError) throw new Error(`Updating recipe failed: ${formatSupabaseError(recipeError, 'Could not update recipe')}`)

      const [{ error: deleteIngredientsError }, { error: deleteStepsError }] = await Promise.all([
        supabase.from('recipe_ingredients').delete().eq('recipe_id', cookRecipe.id),
        supabase.from('recipe_steps').delete().eq('recipe_id', cookRecipe.id),
      ])
      if (deleteIngredientsError) throw new Error(`Clearing old ingredients failed: ${formatSupabaseError(deleteIngredientsError, 'Could not update ingredients')}`)
      if (deleteStepsError) throw new Error(`Clearing old directions failed: ${formatSupabaseError(deleteStepsError, 'Could not update directions')}`)

      if (ingredientRows.length > 0) {
        const { error: insertIngredientsError } = await supabase
          .from('recipe_ingredients')
          .insert(ingredientRows.map((row, index) => ({
            recipe_id: cookRecipe.id,
            raw_text: row.raw_text,
            name: row.name,
            quantity: row.quantity,
            unit: row.unit,
            optional: row.optional,
            sort_order: index,
          })))
        if (insertIngredientsError) throw new Error(`Saving ingredients failed: ${formatSupabaseError(insertIngredientsError, 'Could not save ingredients')}`)
      }

      const { error: insertStepsError } = await supabase
        .from('recipe_steps')
        .insert(cleanedSteps.map((step, index) => ({
          recipe_id: cookRecipe.id,
          step_number: index + 1,
          instruction: step.instruction,
        })))
      if (insertStepsError) throw new Error(`Saving directions failed: ${formatSupabaseError(insertStepsError, 'Could not save directions')}`)

      await Promise.all([refetchRecipes(), refetchIngredients(), refetchSteps()])
      setIsRecipeEditMode(false)
      setRecipeEditorDraft(null)
      setRecipeEditorStatus('Recipe updated.')
      setRecipeSuggestedQuickAction(null)
      setRecipeAiInstruction('')
    } catch (error) {
      setRecipeEditorError(formatSupabaseError(error, 'Could not save recipe edits'))
    } finally {
      setRecipeEditorSaving(false)
    }
  }

  async function searchWebImages(query: string) {
    const cleaned = query.trim()
    if (!cleaned) {
      setPhotoSearchResults([])
      setPhotoSearchError('Enter a search term')
      return
    }
    setPhotoSearchLoading(true)
    setPhotoSearchError(null)
    try {
      const { data, error } = await supabase.functions.invoke('recipe-image-search', {
        body: { query: cleaned, limit: 12 },
      })
      if (error) throw error
      const optionsRaw: unknown[] = Array.isArray(data?.results) ? data.results : []
      const options: WebImageOption[] = optionsRaw
        .map((row: unknown, index: number) => {
          if (!row || typeof row !== 'object') return null
          const entry = row as Record<string, unknown>
          const url = typeof entry.url === 'string' ? entry.url.trim() : ''
          if (!url) return null
          return {
            id: `${index}-${url}`,
            url,
            title: typeof entry.title === 'string' ? entry.title : '',
            source: typeof entry.source === 'string' ? entry.source : undefined,
          } as WebImageOption
        })
        .filter((row: WebImageOption | null): row is WebImageOption => row !== null)
        .slice(0, 6)

      if (options.length === 0) {
        setPhotoSearchResults([])
        setPhotoSearchError('No image results found. Try another phrase.')
        return
      }
      setPhotoSearchResults(options)
    } catch (error) {
      setPhotoSearchError(error instanceof Error ? error.message : 'Could not search images')
    } finally {
      setPhotoSearchLoading(false)
    }
  }

  function openPhotoEditor(recipe: Recipe) {
    const focus = parseRecipeImageFocus(recipe.image_url)
    setPhotoEditorRecipeId(recipe.id)
    setPhotoEditorName(recipe.name)
    setPhotoEditorUrl(pickRecipeThumb(recipe) ?? '')
    setPhotoSearchQuery(recipe.name)
    setPhotoEditorFocalX(focus.focalX)
    setPhotoEditorFocalY(focus.focalY)
    setPhotoEditorUploading(false)
    setPhotoEditorError(null)
    setPhotoSearchResults([])
    setPhotoSearchError(null)
    void searchWebImages(recipe.name)
  }

  async function uploadPhotoEditorImage(file: File) {
    if (!photoEditorRecipeId) return
    if (!isLikelyImageFile(file)) {
      setPhotoEditorError('Please choose an image file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoEditorError('Photo is too large. Please use an image under 10MB.')
      return
    }
    setPhotoEditorUploading(true)
    setPhotoEditorError(null)
    try {
      const buffer = await file.arrayBuffer()
      const base64 = arrayBufferToBase64(buffer)
      const mimeType = file.type || 'image/jpeg'
      const { data, error } = await supabase.functions.invoke('recipe-photo-upload', {
        body: {
          recipe_id: photoEditorRecipeId,
          file_name: file.name,
          file_base64: base64,
          mime_type: mimeType,
        },
      })
      if (error) throw error
      const uploadedUrl = String(data?.url ?? '').trim()
      if (!uploadedUrl) throw new Error('Uploaded photo URL missing')
      setPhotoEditorUrl(uploadedUrl)
      setPhotoEditorFocalX(50)
      setPhotoEditorFocalY(42)
    } catch (error) {
      setPhotoEditorError(formatSupabaseError(error, 'Could not upload photo'))
    } finally {
      setPhotoEditorUploading(false)
    }
  }

  async function handlePhotoEditorFileSelection(files: File[], source: 'upload' | 'camera') {
    const first = files[0]
    if (!first) {
      if (source === 'camera') setPhotoEditorError('No photo captured. Please try again.')
      return
    }
    await uploadPhotoEditorImage(first)
  }

  async function savePhotoEditor() {
    if (!photoEditorRecipeId) return
    const candidate = photoEditorUrl.trim()
    try {
      const parsed = new URL(candidate)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Use an http(s) image URL')
      }
    } catch {
      setPhotoEditorError('Please paste a valid image URL')
      return
    }
    setPhotoEditorSaving(true)
    setPhotoEditorError(null)
    try {
      const nextUrl = encodeRecipeImageUrl(candidate, photoEditorFocalX, photoEditorFocalY)
      const { error } = await supabase
        .from('recipes')
        .update({ image_url: nextUrl })
        .eq('id', photoEditorRecipeId)
      if (error) throw error
      await refetchRecipes()
      setPhotoEditorRecipeId(null)
    } catch (error) {
      setPhotoEditorError(error instanceof Error ? error.message : 'Could not save photo')
    } finally {
      setPhotoEditorSaving(false)
    }
  }

  async function importRecipeFromSource(payload: {
    sourceType: 'url' | 'image' | 'pdf'
    sourceUrl?: string
    fileBase64?: string
    files?: Array<{ fileBase64: string; mimeType: string }>
    mealPhotoIndex?: number | null
    mimeType?: string
    fallbackName?: string
  }): Promise<boolean> {
    setImportError(null)
    setImportingRecipe(true)
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
      const draft: ImportedRecipeDraft = {
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

      if (draft.ingredients.length === 0) {
        throw new Error('No ingredients found in this recipe')
      }

      const hasChosenMealPhoto = Array.isArray(payload.files) && payload.files.length > 0 && payload.mealPhotoIndex !== null && payload.mealPhotoIndex !== undefined
      if (!hasChosenMealPhoto) {
        const { data: imageSearchData, error: imageSearchError } = await supabase.functions.invoke('recipe-image-search', {
          body: { query: draft.name, limit: 8 },
        })
        if (!imageSearchError && Array.isArray(imageSearchData?.results)) {
          const extraUrls = (imageSearchData.results as unknown[])
            .map((row: unknown) => {
              if (!row || typeof row !== 'object') return null
              const candidate = (row as { url?: unknown }).url
              const url = typeof candidate === 'string' ? candidate.trim() : ''
              return url || null
            })
            .filter((url: string | null): url is string => Boolean(url))
          if (extraUrls.length > 0) {
            const merged = Array.from(new Set([...draft.image_urls, ...extraUrls]))
            draft.image_urls = merged
            if (!draft.image_url && merged[0]) {
              draft.image_url = merged[0]
              if (draft.primary_image_index === null) {
                draft.primary_image_index = 0
              }
            }
          }
        }
      }

      setImportDraft(draft)
      setImportExtraImageUrl('')
      setImportStep(3)
      return true
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Recipe import failed')
      return false
    } finally {
      setImportingRecipe(false)
    }
  }

  async function addImportCaptureFiles(files: File[], source: 'upload' | 'camera') {
    if (files.length === 0) {
      if (source === 'camera') {
        setImportError('No photo was captured. Please try again.')
      }
      return
    }
    setImportError(null)
    const nextFiles: ImportCaptureFile[] = []
    for (const file of files) {
      const { isPdf, isImage } = shouldAcceptImportFile(file, source)
      if (!isPdf && !isImage) continue
      const buffer = await file.arrayBuffer()
      const base64 = arrayBufferToBase64(buffer)
      const mimeType = file.type || (isPdf ? 'application/pdf' : 'image/jpeg')
      const previewUrl = isImage
        ? `data:${mimeType};base64,${base64}`
        : recipeFallbackHero
      nextFiles.push({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mimeType,
        fileBase64: base64,
        previewUrl,
      })
    }
    if (nextFiles.length === 0) {
      setImportError(source === 'camera' ? 'Could not read that photo. Please try another shot.' : 'Please upload recipe photos or a PDF')
      return
    }
    setImportCaptureFiles((current) => [...current, ...nextFiles])
    setImportStep((current) => (current < 2 ? 2 : current))
  }

  function removeImportCaptureFile(fileId: string) {
    setImportCaptureFiles((current) => {
      const next = current.filter((file) => file.id !== fileId)
      setImportMealPhotoIndex((existing) => {
        if (next.length === 0 || existing === null) return null
        return Math.max(0, Math.min(existing, next.length - 1))
      })
      return next
    })
  }


  async function runImportFromCurrentSources() {
    const url = importUrlInput.trim()
    if (!url && importCaptureFiles.length === 0) {
      setImportError('Add a URL or one or more photos first.')
      return
    }
    if (importCaptureFiles.length > 0) {
      const hasPdf = importCaptureFiles.some((file) => file.mimeType === 'application/pdf')
      const sourceType: 'image' | 'pdf' = hasPdf ? 'pdf' : 'image'
      await importRecipeFromSource({
        sourceType,
        files: importCaptureFiles.map((file) => ({ fileBase64: file.fileBase64, mimeType: file.mimeType })),
        mealPhotoIndex: importMealPhotoIndex,
        fallbackName: 'Captured recipe',
      })
      return
    }
    await importRecipeFromSource({ sourceType: 'url', sourceUrl: url, fallbackName: 'Web recipe' })
  }

  function chooseImportPrimaryImage(index: number) {
    setImportDraft((current) => {
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
  }

  function addImportImageUrl() {
    const candidate = importExtraImageUrl.trim()
    if (!candidate) return
    try {
      const parsed = new URL(candidate)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol')
    } catch {
      setImportError('Please add a valid image URL (http/https).')
      return
    }
    setImportError(null)
    setImportDraft((current) => {
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
    setImportExtraImageUrl('')
  }

  function updateImportStepInstruction(stepIndex: number, instruction: string) {
    setImportDraft((current) => {
      if (!current) return current
      const nextSteps = current.steps.map((step, index) => (
        index === stepIndex
          ? { ...step, instruction }
          : step
      ))
      return { ...current, steps: renumberDraftSteps(nextSteps) }
    })
  }

  function moveImportStep(stepIndex: number, direction: -1 | 1) {
    setImportDraft((current) => {
      if (!current) return current
      const targetIndex = stepIndex + direction
      if (targetIndex < 0 || targetIndex >= current.steps.length) return current
      const nextSteps = [...current.steps]
      const [moved] = nextSteps.splice(stepIndex, 1)
      nextSteps.splice(targetIndex, 0, moved)
      return { ...current, steps: renumberDraftSteps(nextSteps) }
    })
  }

  function addImportStepAfter(stepIndex: number) {
    setImportDraft((current) => {
      if (!current) return current
      const nextSteps = [...current.steps]
      nextSteps.splice(stepIndex + 1, 0, { step_number: stepIndex + 2, instruction: '' })
      return { ...current, steps: renumberDraftSteps(nextSteps) }
    })
  }

  function removeImportStep(stepIndex: number) {
    setImportDraft((current) => {
      if (!current) return current
      if (current.steps.length <= 1) return current
      const nextSteps = current.steps.filter((_, index) => index !== stepIndex)
      return { ...current, steps: renumberDraftSteps(nextSteps) }
    })
  }

  async function saveImportedRecipe(options?: { openCookMode?: boolean }) {
    if (!importDraft) return
    setImportSaving(true)
    setImportError(null)
    try {
      const cleanedSteps = renumberDraftSteps(
        importDraft.steps
          .map((step) => ({ ...step, instruction: step.instruction.trim() }))
          .filter((step) => step.instruction.length > 0),
      )
      if (cleanedSteps.length === 0) {
        throw new Error('Add at least one direction step before saving.')
      }
      const normalizedImageUrls = Array.from(new Set(importDraft.image_urls.map((url) => url.trim()).filter(Boolean)))
      const selectedPrimaryImageCandidate = importDraft.primary_image_index === null
        ? null
        : (normalizedImageUrls[importDraft.primary_image_index] ?? importDraft.image_url ?? null)
      const persistableImageUrls = Array.from(new Set(normalizedImageUrls.filter((url) => isPersistableImageUrl(url))))
      const selectedPrimaryImage = selectedPrimaryImageCandidate && isPersistableImageUrl(selectedPrimaryImageCandidate)
        ? selectedPrimaryImageCandidate
        : (persistableImageUrls[0] ?? null)
      const { data: recipeRow, error: recipeError } = await supabase
        .from('recipes')
        .insert({
          name: importDraft.name,
          source_type: importDraft.source_type,
          source_url: importDraft.source_url,
          image_url: selectedPrimaryImage,
          servings: importDraft.servings,
          cook_time: importDraft.cook_time,
          instructions_text: cleanedSteps.map((step) => `${step.step_number}. ${step.instruction}`).join('\n'),
          last_used_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (recipeError) throw new Error(`Saving recipe header failed: ${formatSupabaseError(recipeError, 'Unable to create recipe')}`)

      const recipeId = String(recipeRow.id)
      const ingredientRows = importDraft.ingredients.map((ingredient, index) => {
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

      await refetchRecipes()
      setImportDraft(null)
      setImportExtraImageUrl('')
      setImportUrlInput('')
      setImportCaptureFiles([])
      setImportMealPhotoIndex(null)
      setImportStep(1)
      setImportDialogOpen(false)
      if (options?.openCookMode) {
        setCookRecipeId(recipeId)
        setStepIndex(0)
        setRecipeScale('1')
        setDirectionsViewMode('step')
      }
    } catch (error) {
      console.error('[CookPage] saveImportedRecipe failed', error)
      setImportError(formatSupabaseError(error, 'Could not save recipe'))
    } finally {
      setImportSaving(false)
    }
  }

  function closeImportDialog() {
    setImportDialogOpen(false)
    setImportError(null)
    setImportingRecipe(false)
    setImportSaving(false)
    setImportDraft(null)
    setImportExtraImageUrl('')
    setImportUrlInput('')
    setImportCaptureFiles([])
    setImportMealPhotoIndex(null)
    setImportStep(1)
  }

  function openImportDialog() {
    setImportDialogOpen(true)
    setImportError(null)
    setImportDraft(null)
    setImportExtraImageUrl('')
    setImportCaptureFiles([])
    setImportMealPhotoIndex(null)
    setImportStep(1)
  }

  const cookIngredientRows = cookIngredients.map((ingredient, index) => {
    const normalized = normalizeRecipeIngredientFields({
      rawText: ingredient.raw_text,
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
    })
    const name = normalized.name || ingredient.raw_text
    const qty = quantityLabel(ingredient)
    const searchableName = name.toLowerCase()
    const searchTokens = searchableName
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4)
    return {
      id: `${ingredient.recipe_id}-${index}`,
      name,
      qty,
      searchableName,
      searchTokens,
    }
  })
  const currentStepInstruction = currentStep?.instruction?.toLowerCase() ?? ''
  const neededNowIngredientRows = (() => {
    if (cookIngredientRows.length === 0) return []
    if (!currentStepInstruction) return cookIngredientRows.slice(0, 4)
    const matched = cookIngredientRows.filter((row) =>
      currentStepInstruction.includes(row.searchableName)
      || row.searchTokens.some((token) => currentStepInstruction.includes(token))
    )
    return (matched.length > 0 ? matched : cookIngredientRows).slice(0, 4)
  })()
  const landingMetaLabel = `${new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())} · ${plannedRecipes.length} planned this week`
  const buildMoodReason = (insight: RecipeMoodInsight): string => {
    if (cookMood === 'quick') {
      if (typeof insight.minutes === 'number') return `${insight.minutes} min and weeknight-friendly.`
      return 'Fast prep flow with low decision overhead.'
    }
    if (cookMood === 'family') {
      if (insight.planned) return 'Already in the family plan, so dinner is a one-tap launch.'
      return 'High-confidence crowd-pleaser based on your recent rotations.'
    }
    if (cookMood === 'new') {
      return insight.usedAtMs ? 'Fresh variation with different flavor profile from recent meals.' : 'Not recently cooked, so it keeps the week feeling new.'
    }
    if (cookMood === 'fancy') {
      return 'Restaurant-style finish while staying practical for home cooking.'
    }
    if (insight.ingredientsCount > 0) {
      return `Uses a tighter ingredient set (${insight.ingredientsCount}) to reduce extra shopping.`
    }
    return 'Pantry-first pick tuned to reduce additional purchases.'
  }
  const buildTopPickApproval = (insight: RecipeMoodInsight): string | null => {
    if (insight.planned) return 'Already planned'
    if (cookMood === 'new' && !insight.usedAtMs) return 'New this week'
    if (cookMood === 'pantry') return 'Pantry-first'
    if (typeof insight.minutes === 'number' && insight.minutes <= 20) return 'Fast favorite'
    return null
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto bg-casa-bg p-4 lg:p-6">
      <Card padding="lg">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            aria-label="Cook view"
            value={cookLandingMode}
            onChange={setCookLandingMode}
            options={[
              { value: 'cook-now', label: 'Cook tonight' },
              { value: 'plan-week', label: 'Plan the week', icon: <Sparkles size={14} className="text-casa-info" /> },
            ]}
          />
          <Text role="body-sm" muted>{landingMetaLabel}</Text>
        </div>

        {cookLandingMode === 'cook-now' ? (
          <div className="mt-4">
            <Heading role="display-sm" className="font-body font-bold">What are we feeling tonight?</Heading>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {COOK_MOOD_OPTIONS.map((mood) => (
                <Chip
                  key={mood.id}
                  onClick={() => {
                    setCookMood(mood.id)
                    setShortlistOffsets((current) => ({ ...current, [mood.id]: 0 }))
                  }}
                  selected={cookMood === mood.id}
                  tone={cookMood === mood.id ? 'accent' : 'neutral'}
                >
                  {mood.label}
                </Chip>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <Text role="body-sm" className="font-semibold text-casa-navy">3 {shortlistHeadingLabel} picks for tonight</Text>
              <Button
                onClick={() => setShortlistOffsets((current) => ({ ...current, [cookMood]: current[cookMood] + 1 }))}
                variant="ghost"
                size="sm"
              >
                Shuffle →
              </Button>
            </div>

            {moodShortlistRecipes.length === 0 ? (
              <Card tone="subtle" className="mt-3">
                <Text>Import recipes from Grocery to unlock your mood-based shortlist.</Text>
                <Button
                  onClick={openImportDialog}
                  className="mt-3"
                >
                  Import recipe
                </Button>
              </Card>
            ) : (
              <div className="mt-3 grid grid-cols-1 xl:grid-cols-[1.25fr_1fr_1fr] gap-4">
                {moodShortlistRecipes.map((insight, index) => {
                  const focus = parseRecipeImageFocus(insight.recipe.image_url)
                  const isTop = index === 0
                  const minutesLabel = insight.minutes ? `${insight.minutes} min` : (insight.recipe.cook_time ?? 'Quick cook')
                  const approvalLabel = isTop ? buildTopPickApproval(insight) : null
                  return (
                    <Card
                      key={`${insight.recipe.id}-${index}`}
                      padding="none"
                      tone={isTop ? 'accent' : 'surface'}
                      className={cn(
                        'flex flex-col overflow-hidden',
                        isTop && 'border-2 border-casa-accent-soft-border',
                      )}
                    >
                      {isTop && (
                        <div className="bg-casa-accent-soft px-4 py-2 text-caption font-bold uppercase tracking-wide text-casa-top-pick-band">
                          Top pick for tonight
                        </div>
                      )}
                      <RecipeImage
                        src={getRecipeImage(insight.recipe)}
                        alt={insight.recipe.name}
                        focalX={focus.focalX}
                        focalY={focus.focalY}
                        className={cn('w-full object-cover', isTop ? 'h-44' : 'h-36')}
                      />
                      <div className={cn('p-4 flex flex-col flex-1', !isTop && 'p-3.5')}>
                        {isTop ? (
                          <Heading role="heading" className="font-semibold leading-tight">{insight.recipe.name}</Heading>
                        ) : (
                          <Text as="h3" className="font-semibold leading-tight text-casa-navy">{insight.recipe.name}</Text>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Chip tone="info" size="sm" icon={<Clock3 size={14} />}>
                            {minutesLabel}
                          </Chip>
                          {approvalLabel && (
                            <Chip tone="success" size="sm" icon={<Users size={14} />}>
                              {approvalLabel}
                            </Chip>
                          )}
                        </div>
                        {isTop && (
                          <p className="mt-2 text-body-sm text-casa-text-tertiary">
                            {buildMoodReason(insight)}
                          </p>
                        )}
                        <Button
                          onClick={() => openRecipeForCookMode(insight.recipe.id)}
                          variant={isTop ? 'primary' : 'secondary'}
                          className="mt-auto pt-3"
                        >
                          Start cooking
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}

            {resumeRecipe && (
              <Button
                onClick={() => {
                  openRecipeForCookMode(resumeRecipe.recipe.id)
                  setStepIndex(Math.max(0, Math.min(resumeRecipe.progress.stepIndex, Math.max(0, resumeRecipe.progress.totalSteps - 1))))
                }}
                variant="secondary"
                fullWidth
                className="mt-4 h-auto flex-col items-stretch text-left"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm font-semibold text-casa-navy">Jump back in</span>
                  <span className="text-body-sm font-semibold text-casa-navy">{resumeRecipe.recipe.name}</span>
                  <span className="text-caption font-semibold uppercase tracking-[0.12em] text-casa-info-strong">
                    Step {resumeRecipe.progress.stepIndex + 1} of {resumeRecipe.progress.totalSteps}
                  </span>
                  {resumeRecentLabel && (
                    <span className="text-body-sm text-casa-text-faint">Also recent: {resumeRecentLabel}</span>
                  )}
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-pill bg-casa-toggle-track">
                  <span
                    className="block h-full rounded-pill bg-casa-info"
                    style={{ width: `${Math.round(((resumeRecipe.progress.stepIndex + 1) / Math.max(1, resumeRecipe.progress.totalSteps)) * 100)}%` }}
                  />
                </div>
              </Button>
            )}

            <Card tone="accent" className="mt-4 flex items-start gap-2.5 border-dashed">
              <Sparkles size={16} className="text-casa-info shrink-0 mt-0.5" />
              <p className="text-body-sm text-casa-text-secondary">
                Thinking ahead? The <span className="font-semibold text-casa-navy">Plan the week</span> tab opens Meal Planner AI — build a weekly plan, optimize budget, and push groceries to shopping.
              </p>
            </Card>
          </div>
        ) : (
          <Card className="mt-4">
            <Text role="caption" className="font-semibold uppercase tracking-wide text-casa-info-strong">Meal Planner AI</Text>
            <Heading role="heading" className="mt-1 font-body font-bold">Build an overlap-optimized weekly plan</Heading>
            <p className="mt-1 text-body-sm text-casa-text-tertiary">
              Profile: {foodProfile.householdSize} people · ${foodProfile.weeklyBudgetUsd}/week · {foodProfile.defaultMealsPerWeek} meals · {foodProfile.weeknightMaxMinutes} min weeknights
            </p>
            <p className="mt-2 text-body-sm text-casa-text-secondary">
              Use the planner workspace below to generate, optimize, and apply your weekly meal + grocery plan.
            </p>
          </Card>
        )}
      </Card>

      {cookLandingMode === 'plan-week' && (
      <>
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Text role="caption" className="font-semibold uppercase tracking-wide text-casa-info-strong">Meal Planner AI</Text>
            <Text role="caption" muted className="mt-1">
              Build an overlap-optimized weekly plan, then confirm groceries + queue actions.
            </Text>
          </div>
          <Button
            onClick={() => navigate('/settings/food-profile')}
            variant="secondary"
            size="sm"
          >
            Food profile
          </Button>
        </div>
        <Card tone="subtle" padding="sm">
          <Text role="caption" muted>
            Profile: {foodProfile.householdSize} people · ${foodProfile.weeklyBudgetUsd}/week · {foodProfile.defaultMealsPerWeek} meals · {foodProfile.weeknightMaxMinutes} min weeknights
          </Text>
          <Textarea
            value={mealPlannerPrompt}
            onChange={(event) => setMealPlannerPrompt(event.target.value)}
            rows={2}
            placeholder="Plan 5 dinners this week under $140 with overlapping ingredients and one fish meal."
            className="mt-2"
          />
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button
              onClick={() => void generateMealPlan()}
              disabled={mealPlannerLoading}
              loading={mealPlannerLoading}
            >
              {mealPlannerLoading ? 'Planning…' : 'Generate plan'}
            </Button>
            <Button
              onClick={() => void optimizeCurrentPlanForBudget()}
              disabled={mealPlannerLoading || !mealPlannerPlan}
              variant="secondary"
            >
              Optimize budget
            </Button>
            <Button
              onClick={() => void applyPlannerGroceries()}
              disabled={mealPlannerAddingGroceries || pendingPlannerGroceries.length === 0}
              loading={mealPlannerAddingGroceries}
            >
              {mealPlannerAddingGroceries
                ? `Adding groceries... (${pendingPlannerGroceries.length})`
                : `Apply to shopping (${pendingPlannerGroceries.length})`}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                const prompt = mealPlannerPrompt.trim() || 'Plan 4 quick weeknight dinners under budget.'
                document.dispatchEvent(new CustomEvent('open-ai-chat', {
                  detail: {
                    prompt,
                    autoSend: false,
                    source: 'cook-talk-to-chef',
                    page: 'cook',
                    agent: 'chef',
                  },
                }))
              }}
              variant="secondary"
              size="sm"
            >
              Talk to Chef
            </Button>
            <Button
              onClick={() => setPlannerAdvancedOpen((value) => !value)}
              variant="secondary"
              size="sm"
            >
              {plannerAdvancedOpen ? 'Hide advanced' : 'Show advanced'}
            </Button>
            {!plannerAdvancedOpen && typeof mealPlannerDebug?.elapsed_ms === 'number' && (
              <span className="text-caption text-casa-muted">
                trace {mealPlannerLastTraceId ? mealPlannerLastTraceId.slice(0, 8) : 'n/a'} · {mealPlannerDebug.elapsed_ms}ms
              </span>
            )}
          </div>
          {plannerAdvancedOpen && (
            <div className="mt-2 space-y-2 rounded-lg border border-casa-border bg-casa-surface p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {([
                  { key: 'balanced', label: 'Balanced' },
                  { key: 'budget', label: 'Budget-first' },
                  { key: 'speed', label: 'Speed-first' },
                ] as Array<{ key: MealPlannerStrategy; label: string }>).map((strategy) => (
                  <button
                    key={strategy.key}
                    type="button"
                    onClick={() => setMealPlannerStrategy(strategy.key)}
                    className={cn(
                      'px-2 py-1 rounded-pill border text-caption transition-colors',
                      mealPlannerStrategy === strategy.key
                        ? 'border-casa-gold/50 bg-casa-gold/10 text-casa-navy'
                        : 'border-casa-border bg-casa-bg text-casa-muted hover:text-casa-navy',
                    )}
                  >
                    {strategy.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
                <input
                  value={mealPlannerTemplateName}
                  onChange={(event) => setMealPlannerTemplateName(event.target.value)}
                  placeholder="Template name (optional)"
                  className="rounded-button border border-casa-border bg-casa-bg px-3 py-2 text-body-sm text-casa-text placeholder:text-casa-muted outline-none"
                />
                <button
                  type="button"
                  onClick={() => void saveCurrentPromptTemplate()}
                  className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy hover:bg-casa-bg"
                >
                  Save template
                </button>
                <button
                  type="button"
                  onClick={() => void runWeeklyAutoDraft()}
                  className="px-3 py-2 rounded-button border border-casa-gold/40 bg-casa-gold/10 text-body-sm text-casa-navy hover:bg-casa-gold/15"
                >
                  Auto weekly draft
                </button>
              </div>
              {mealPlannerTemplates.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {mealPlannerTemplates.slice(0, 6).map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => setMealPlannerPrompt(template.prompt)}
                      className="px-2 py-1 rounded-pill border border-casa-border bg-casa-bg text-caption text-casa-muted hover:text-casa-navy hover:bg-casa-main"
                      title={template.prompt}
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              )}
              {typeof mealPlannerDebug?.elapsed_ms === 'number' && (
                <p className="text-caption text-casa-muted">
                  Debug latency {mealPlannerDebug.elapsed_ms}ms
                  {mealPlannerLastTraceId ? ` · trace ${mealPlannerLastTraceId}` : ''}
                </p>
              )}
            </div>
          )}
        </Card>
        {mealPlannerError && <p className="text-caption text-casa-error">{mealPlannerError}</p>}
        {!mealPlannerError && mealPlannerStatus && <p className="text-caption text-casa-muted">{mealPlannerStatus}</p>}
        {mealPlannerPlan && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border border-casa-border bg-casa-bg p-3">
              <p className="text-body-sm font-semibold text-casa-navy inline-flex items-center gap-1.5">
                Weekly meal queue preview
                <InfoHint label="Meal selection reasoning" text={mealPlannerPlan.explainability?.meal_selection ?? 'Ranked recipes by overlap, time fit, and learned preferences.'} />
              </p>
              <p className="text-caption text-casa-muted mt-1">{mealPlannerPlan.summary}</p>
              <p className="text-caption text-casa-muted mt-1 inline-flex items-center gap-1.5">
                Overlap strategy
                <InfoHint label="Overlap strategy reasoning" text={mealPlannerPlan.explainability?.overlap_strategy ?? 'Balanced ingredient overlap against variety preference.'} />
              </p>
              <p className="text-caption text-casa-muted mt-1">
                Active meals: {configuredPlannerMeals.filter((meal) => meal.enabled).length} / {configuredPlannerMeals.length}
              </p>
              <div className="mt-2 space-y-2">
                {configuredPlannerMeals.map((meal) => (
                  <div key={meal.key} className={cn('rounded-lg border border-casa-border bg-casa-surface px-2.5 py-2', !meal.enabled && 'opacity-55')}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-caption text-casa-muted">{SLOT_LABELS[meal.slot]}{meal.planned_for ? ` · ${meal.planned_for}` : ''}</p>
                        <p className="text-body-sm font-semibold text-casa-navy">{meal.recipe_name}</p>
                        <p className="text-caption text-casa-muted">Overlap {(meal.overlap_score * 100).toFixed(0)}% · {meal.reason}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleConfiguredMeal(meal.key)}
                          aria-label={meal.enabled ? 'Disable meal' : 'Enable meal'}
                          className={cn(
                            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                            meal.enabled ? 'bg-casa-gold/70' : 'bg-casa-border',
                          )}
                        >
                          <span
                            className={cn(
                              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                              meal.enabled ? 'translate-x-4' : 'translate-x-0.5',
                            )}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteConfiguredMeal(meal.key)}
                          aria-label="Delete meal from planner"
                          className="text-casa-muted hover:text-casa-error"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {configuredPlannerMeals.length === 0 && (
                  <p className="text-caption text-casa-muted">No meals left in the queue. Generate a new plan.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void applyPlannerMealQueue()}
                className="mt-3 px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy hover:bg-casa-surface"
              >
                Queue meals for week
              </button>
              <button
                type="button"
                onClick={() => void reinforceCurrentPlanPreferences()}
                className="mt-2 ml-2 px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted hover:bg-casa-surface"
              >
                Love this pattern (learn)
              </button>
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    if (!mealPlannerPlan) return
                    try {
                      await recordPlannerRejection(mealPlannerPlan)
                      setMealPlannerStatus('Captured feedback. Regenerating with updated learning…')
                      await generateMealPlan()
                    } catch (error) {
                      setMealPlannerError(formatSupabaseError(error, 'Could not save planner feedback'))
                    }
                  })()
                }}
                className="mt-2 px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted hover:bg-casa-surface"
              >
                This plan missed (learn + regenerate)
              </button>
            </div>
            <div className="rounded-xl border border-casa-border bg-casa-bg p-3">
              <p className="text-body-sm font-semibold text-casa-navy inline-flex items-center gap-1.5">
                Consolidated grocery preview
                <InfoHint label="Budget reasoning" text={mealPlannerPlan.explainability?.budget_strategy ?? 'Estimated basket cost vs weekly budget target.'} />
              </p>
              <p className="text-caption text-casa-muted mt-1">
                Est. ${configuredPlannerMetrics.estimatedLow}-{configuredPlannerMetrics.estimatedHigh} {mealPlannerPlan.estimated_cost_range.currency}
              </p>
              <p className="text-caption text-casa-muted mt-1">
                Budget fit {(configuredPlannerMetrics.budgetFit * 100).toFixed(0)}% · Waste score {(configuredPlannerMetrics.wasteScore * 100).toFixed(0)}% · Est. waste ${configuredPlannerMetrics.wasteValue.toFixed(2)}
                <span className="ml-1.5 inline-flex items-center gap-1">
                  <InfoHint label="Waste reasoning" text={mealPlannerPlan.explainability?.waste_strategy ?? 'Pack-size rounding is used to estimate waste risk.'} />
                </span>
              </p>
              {configuredPlannerMetrics.budgetFit < 0.8 && (
                <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2">
                  <p className="text-caption font-semibold text-amber-800">
                    Over budget risk detected
                  </p>
                  {overBudgetSwapHints.length > 0 && (
                    <ul className="mt-1 list-disc pl-4 text-caption text-amber-800 space-y-0.5">
                      {overBudgetSwapHints.map((hint) => <li key={hint}>{hint}</li>)}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => void optimizeCurrentPlanForBudget()}
                    className="mt-2 px-2.5 py-1.5 rounded-button border border-amber-300 bg-amber-100 text-caption text-amber-900"
                  >
                    Auto optimize for budget
                  </button>
                </div>
              )}
              {mealPlannerPlan.pantry_deductions.length > 0 && (
                <div className="mt-2 rounded-lg border border-casa-border bg-casa-surface px-2.5 py-2">
                  <p className="text-caption text-casa-muted inline-flex items-center gap-1.5">
                    Pantry deductions ({mealPlannerPlan.pantry_deductions.length})
                    <InfoHint label="Pantry deduction reasoning" text={mealPlannerPlan.explainability?.pantry_strategy ?? 'Pantry staples are removed from grocery adds.'} />
                  </p>
                  <p className="text-caption text-casa-navy mt-1 line-clamp-2">
                    {mealPlannerPlan.pantry_deductions.slice(0, 6).map((row) => row.name).join(', ')}
                  </p>
                </div>
              )}
              <div className="mt-2 max-h-52 overflow-y-auto space-y-1.5 pr-1">
                {configuredPlannerGroceries.slice(0, 40).map((item) => {
                  const checked = Boolean(mealPlannerPantryConfig[plannerGroceryKey(item)])
                  const tracker = projectedPantryForItem(item)
                  return (
                    <label key={`${item.name}-${item.category}`} className="flex items-start gap-2 text-body-sm text-casa-navy">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePlannerPantryItem(item)}
                        className="mt-[2px] h-3.5 w-3.5 rounded border-casa-border text-casa-navy"
                        aria-label={`Mark ${item.name} as already in pantry`}
                      />
                      <span className={checked ? 'line-through text-casa-muted' : ''}>
                        {item.name}
                        {item.quantity ? ` · ${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : ''}
                        {item.suggested_purchase_display && (
                          <span className="text-casa-muted"> · buy {item.suggested_purchase_display}</span>
                        )}
                        {typeof tracker.remaining === 'number' && (
                          <span className="text-casa-muted">
                            {' '}· est pantry after apply {tracker.remaining} {item.suggested_purchase_unit || 'packs'}
                          </span>
                        )}
                        {(tracker.lowStock || item.low_stock_prompt) && <span className="text-casa-muted"> · low-stock check?</span>}
                        <span className="text-casa-muted"> · {item.category} · waste {(item.waste_ratio * 100).toFixed(0)}%</span>
                      </span>
                    </label>
                  )
                })}
                {configuredPlannerGroceries.length === 0 && (
                  <p className="text-caption text-casa-muted">No grocery items for the current meal selection.</p>
                )}
              </div>
              {configuredPlannerGroceries.length > 0 && (
                <p className="mt-2 text-caption text-casa-muted">
                  {configuredPlannerGroceries.length - pendingPlannerGroceries.length} marked as already in pantry · {pendingPlannerGroceries.length} heading to shopping list
                </p>
              )}
              {lowStockPlannerItems.length > 0 && (
                <p className="mt-1 text-caption text-casa-muted">
                  {lowStockPlannerItems.length} item{lowStockPlannerItems.length === 1 ? '' : 's'} are projected low after this plan — review pantry before checkout.
                </p>
              )}
              {configuredPlannerGroceries.length > 0 && (
                <p className="mt-1 text-caption text-casa-muted">
                  Pantry tracker persists leftovers after apply and projects low-stock from your inventory balance.
                  <button
                    type="button"
                    onClick={() => navigate('/settings/pantry-inventory')}
                    className="ml-1 underline underline-offset-2"
                  >
                    Manage inventory
                  </button>
                </p>
              )}
              {mealPlannerPlan.suggested_recipe && (
                <div className="mt-2 rounded-lg border border-casa-border bg-casa-surface px-2.5 py-2">
                  <p className="text-caption text-casa-muted">Suggested extra recipe</p>
                  <p className="text-body-sm font-semibold text-casa-navy">{mealPlannerPlan.suggested_recipe.name}</p>
                  <p className="text-caption text-casa-muted">{mealPlannerPlan.suggested_recipe.reason}</p>
                </div>
              )}
              <p className="mt-3 text-caption text-casa-muted">
                Use “Apply to shopping” above to send this list.
              </p>
              {mealPlannerAddResult && (
                <div className="mt-2 rounded-lg border border-green-300 bg-green-50 px-2.5 py-2 text-caption text-green-800">
                  Sent {mealPlannerAddResult.attempted} planner items to Shopping.
                  {' '}
                  Added {mealPlannerAddResult.inserted} new item{mealPlannerAddResult.inserted === 1 ? '' : 's'}
                  {' '}
                  ({mealPlannerAddResult.attempted - mealPlannerAddResult.inserted} already existed).
                  <button
                    type="button"
                    onClick={() => navigate('/grocery')}
                    className="ml-2 underline underline-offset-2"
                  >
                    Open shopping list
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {mealPlannerActionLog.length > 0 && (
          <div className="mt-3 rounded-xl border border-casa-border bg-casa-bg p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-caption font-semibold text-casa-navy">Planner action log</p>
              <button
                type="button"
                onClick={() => setPlannerLogOpen((value) => !value)}
                className="px-2 py-1 rounded-pill border border-casa-border text-caption text-casa-muted hover:text-casa-navy"
              >
                {plannerLogOpen ? 'Hide' : 'Show'}
              </button>
            </div>
            {plannerLogOpen && (
              <div className="mt-1.5 max-h-36 overflow-y-auto space-y-1 pr-1">
                {mealPlannerActionLog.slice(0, 12).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-casa-border bg-casa-surface px-2 py-1.5">
                    <p className="text-caption text-casa-navy">
                      {entry.action.replace(/_/g, ' ')} · {entry.status}
                    </p>
                    <p className="text-caption text-casa-muted">
                      {entry.detail}
                      {entry.trace_id ? ` · trace ${entry.trace_id.slice(0, 8)}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2 mb-3">
          <Heading role="heading">Planned meals</Heading>
          <Text role="caption" muted>Drag planning happens in Grocery</Text>
        </div>
        {plannedMealError && (
          <p className="mb-2 text-caption text-casa-error">{plannedMealError}</p>
        )}
        {!plannedMealError && plannedMealStatus && (
          <p className="mb-2 text-caption text-casa-muted">{plannedMealStatus}</p>
        )}
        {plannedRecipes.length === 0 ? (
          <p className="text-body-sm text-casa-muted">No meal slots yet. Plan recipes from Grocery → Saved recipes.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {plannedRecipes.slice(0, 9).map(({ plan, recipe }) => (
              <article
                key={`${plan.slot}-${recipe.id}`}
                className="rounded-xl border border-casa-border bg-casa-bg px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCookRecipeId(recipe.id)
                      setStepIndex(0)
                      setRecipeScale('1')
                      setDirectionsViewMode('step')
                    }}
                    className="text-left min-w-0 flex-1 hover:opacity-90 transition-opacity"
                  >
                    <p className="text-caption text-casa-muted">{SLOT_LABELS[plan.slot]}</p>
                    <p className="text-body-sm font-semibold text-casa-navy truncate">{recipe.name}</p>
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void shiftPlannedMealSlot(plan, recipe, -1)}
                      disabled={plan.slot === 'tonight' || plannedMealActionId !== null}
                      className="inline-flex items-center justify-center px-1.5 py-1 rounded-button border border-casa-border text-casa-muted disabled:opacity-40"
                      aria-label="Move planned meal earlier"
                    >
                      <ChevronLeft size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void shiftPlannedMealSlot(plan, recipe, 1)}
                      disabled={plan.slot === 'this-week' || plannedMealActionId !== null}
                      className="inline-flex items-center justify-center px-1.5 py-1 rounded-button border border-casa-border text-casa-muted disabled:opacity-40"
                      aria-label="Move planned meal later"
                    >
                      <ChevronRight size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openRecipeForCookMode(recipe.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-button border border-casa-border text-caption text-casa-muted hover:text-casa-navy"
                    >
                      Cook now
                    </button>
                    <button
                      type="button"
                      onClick={() => void markPlannedMealCooked(plan, recipe)}
                      disabled={plannedMealActionId !== null}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-button border border-green-300 text-caption text-green-700 hover:bg-green-50 disabled:opacity-60"
                    >
                      Done
                    </button>
                    <button
                      type="button"
                      onClick={() => void removePlannedMeal(plan, recipe)}
                      disabled={plannedMealActionId === `${plan.slot}:${recipe.id}` || plannedMealActionId !== null}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-button border border-casa-border text-caption text-casa-muted hover:text-casa-error hover:border-casa-error/40 disabled:opacity-60"
                    >
                      <Trash2 size={12} />
                      {plannedMealActionId === `${plan.slot}:${recipe.id}` ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
      </>
      )}

      <section className="rounded-2xl border border-casa-border bg-casa-surface p-4">
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-heading font-semibold text-casa-navy">Recipe library</p>
              <p className="text-body-sm text-casa-text-tertiary mt-1">
                Browse all {recipes.length} recipes.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-2 rounded-[8px] border border-casa-control-border bg-casa-surface px-3 py-2 min-w-[15rem]">
                <Search size={14} className="text-casa-text-tertiary" />
                <input
                  value={recipeSearch}
                  onChange={(event) => setRecipeSearch(event.target.value)}
                  placeholder="Search recipes..."
                  className="w-full bg-transparent text-body-sm text-casa-text placeholder:text-casa-text-faint outline-none"
                />
              </div>
              <button
                type="button"
                onClick={openImportDialog}
                className="px-3 py-2 rounded-button border border-casa-accent-soft-border bg-casa-accent-soft text-body-sm font-semibold text-casa-navy hover:bg-casa-accent-subtle transition-colors inline-flex items-center gap-1.5"
              >
                <Upload size={14} />
                Import recipe
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { id: 'all', label: `All (${recipes.length})` },
              { id: 'quick', label: `Quick (${quickTonightCount})` },
              { id: 'planned', label: `Planned (${plannedRecipes.length})` },
            ] as const).map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setRecipeBrowseFilter(filter.id)}
                className={cn(
                  'px-3 py-1.5 rounded-pill border text-body-sm font-semibold transition-colors',
                  recipeBrowseFilter === filter.id
                    ? 'border-casa-accent-soft-border bg-casa-accent-soft text-casa-navy'
                    : 'border-casa-control-border bg-casa-surface text-casa-text-secondary hover:text-casa-navy',
                )}
                aria-pressed={recipeBrowseFilter === filter.id}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        {libraryActionError && (
          <p className="mb-2 text-caption text-casa-error">{libraryActionError}</p>
        )}
        {!libraryActionError && libraryActionStatus && (
          <p className="mb-2 text-caption text-casa-muted">{libraryActionStatus}</p>
        )}
        {filteredRecipes.length === 0 && (
          <p className="mb-2 text-caption text-casa-muted">
            No recipes match this filter yet. Try switching filters or importing a recipe.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredRecipes.slice(0, 24).map((recipe) => (
            <article
              key={recipe.id}
              role="button"
              tabIndex={0}
              onClick={() => openRecipeForCookMode(recipe.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openRecipeForCookMode(recipe.id)
                }
              }}
              className="h-full rounded-2xl border border-casa-border bg-casa-surface overflow-hidden cursor-pointer hover:border-casa-accent-soft-border transition-colors flex flex-col"
            >
              {(() => {
                const focus = parseRecipeImageFocus(recipe.image_url)
                return (
                  <RecipeImage
                    src={getRecipeImage(recipe)}
                    alt={recipe.name}
                    focalX={focus.focalX}
                    focalY={focus.focalY}
                    className="h-40 w-full object-cover"
                  />
                )
              })()}
              <div className="p-3 flex flex-1 flex-col">
                <p className="text-body font-semibold text-casa-navy line-clamp-2">{recipe.name}</p>
                <p className="mt-1 text-caption text-casa-muted">
                  {recipe.cook_time ? `${recipe.cook_time} · ` : ''}
                  {recipe.servings ?? 'servings n/a'}
                </p>
                <div className="mt-auto pt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void smartAddIngredientsToShoppingList(recipe)
                    }}
                    disabled={smartAddingRecipeId === recipe.id}
                    className="flex-1 px-3 py-2 rounded-button border border-casa-accent-subtle-border bg-casa-accent-subtle text-body-sm font-semibold text-casa-navy hover:bg-casa-accent-soft transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <ShoppingCart size={14} />
                    {smartAddingRecipeId === recipe.id ? 'Adding…' : 'Smart add ingredients'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {photoEditorOpen && (
        <div className="fixed inset-0 z-[80] bg-casa-navy/40 flex items-end md:items-center justify-center p-3 md:p-4 overflow-y-auto" onClick={() => setPhotoEditorRecipeId(null)}>
          <div
            className="w-full max-w-2xl max-h-[92vh] rounded-2xl border border-casa-border bg-casa-surface shadow-modal overflow-hidden flex flex-col self-end md:self-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-casa-divider">
              <p className="text-caption uppercase tracking-[0.14em] text-casa-muted font-semibold">Recipe photo editor</p>
              <p className="text-body font-semibold text-casa-navy mt-1">{photoEditorName}</p>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
              <div className="rounded-xl border border-casa-border bg-casa-bg p-3">
                <p className="text-caption text-casa-muted mb-2">Search recipe images (Pexels + Unsplash)</p>
                <div className="flex items-center gap-2">
                  <input
                    value={photoSearchQuery}
                    onChange={(event) => setPhotoSearchQuery(event.target.value)}
                    placeholder="e.g., chicken alfredo"
                    className="flex-1 rounded-button border border-casa-border bg-casa-surface px-3 py-2 text-body-sm text-casa-text outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void searchWebImages(photoSearchQuery)}
                    disabled={photoSearchLoading}
                    className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy hover:bg-casa-surface disabled:opacity-60"
                  >
                    {photoSearchLoading ? 'Searching…' : 'Search'}
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => triggerFileInput(photoEditorUploadInputRef)}
                    disabled={photoEditorUploading}
                    className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy hover:bg-casa-surface disabled:opacity-60 inline-flex items-center gap-1"
                  >
                    <Upload size={14} />
                    Upload photo
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerFileInput(photoEditorCameraInputRef)}
                    disabled={photoEditorUploading}
                    className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy hover:bg-casa-surface disabled:opacity-60 inline-flex items-center gap-1"
                  >
                    <Camera size={14} />
                    Take photo
                  </button>
                  {photoEditorUploading && (
                    <span className="text-caption text-casa-muted animate-breathe">Uploading…</span>
                  )}
                </div>
                <input
                  ref={photoEditorUploadInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const files = event.target.files ? Array.from(event.target.files) : []
                    event.currentTarget.value = ''
                    void handlePhotoEditorFileSelection(files, 'upload')
                  }}
                />
                <input
                  ref={photoEditorCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => {
                    const files = event.target.files ? Array.from(event.target.files) : []
                    event.currentTarget.value = ''
                    void handlePhotoEditorFileSelection(files, 'camera')
                  }}
                />
                {photoSearchError && <p className="mt-2 text-caption text-casa-error">{photoSearchError}</p>}
                {photoSearchResults.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {photoSearchResults.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setPhotoEditorUrl(option.url.split('#')[0] ?? option.url)
                          setPhotoEditorFocalX(50)
                          setPhotoEditorFocalY(42)
                        }}
                        className={cn(
                          'rounded-lg border overflow-hidden text-left transition-colors',
                          photoEditorUrl.trim() === option.url ? 'border-casa-gold' : 'border-casa-border hover:border-casa-gold/40'
                        )}
                      >
                        <img
                          src={option.url}
                          alt={option.title || 'recipe option'}
                          className="h-20 w-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        {option.source && (
                          <span className="block px-2 py-1 text-caption text-casa-muted truncate border-t border-casa-divider/60">
                            {option.source}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="block">
                <span className="text-caption text-casa-muted">Image URL</span>
                <input
                  value={photoEditorUrl}
                  onChange={(event) => setPhotoEditorUrl(event.target.value)}
                  placeholder="https://.../recipe-photo.jpg"
                  className="mt-1 w-full rounded-button border border-casa-border bg-casa-bg px-3 py-2 text-body-sm text-casa-text outline-none"
                />
              </label>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start">
                <div className="rounded-xl border border-casa-border bg-casa-bg p-2">
                  <img
                    src={photoEditorUrl.trim() || recipeFallbackHero}
                    alt={photoEditorName}
                    className="w-full h-56 rounded-lg object-cover border border-casa-border"
                    style={{ objectPosition: `${photoEditorFocalX}% ${photoEditorFocalY}%` }}
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      const target = event.currentTarget
                      if (target.src !== recipeFallbackHero) target.src = recipeFallbackHero
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-caption text-casa-muted mb-1">Horizontal crop focus</p>
                    <input type="range" min={0} max={100} value={photoEditorFocalX} onChange={(event) => setPhotoEditorFocalX(Number(event.target.value))} />
                  </div>
                  <div>
                    <p className="text-caption text-casa-muted mb-1">Vertical crop focus</p>
                    <input type="range" min={0} max={100} value={photoEditorFocalY} onChange={(event) => setPhotoEditorFocalY(Number(event.target.value))} />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoEditorFocalX(50)
                      setPhotoEditorFocalY(42)
                    }}
                    className="px-3 py-1.5 rounded-pill border border-casa-gold/40 bg-casa-gold/10 text-caption text-casa-navy hover:bg-casa-gold/15"
                  >
                    Auto-crop
                  </button>
                </div>
              </div>
              {photoEditorError && <p className="text-caption text-casa-error">{photoEditorError}</p>}
            </div>
            <div
              className="px-4 pt-3 border-t border-casa-divider flex items-center justify-end gap-2"
              style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
            >
              <button
                type="button"
                onClick={() => setPhotoEditorRecipeId(null)}
                className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted hover:bg-casa-main"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={photoEditorSaving || photoEditorUploading}
                onClick={() => void savePhotoEditor()}
                className="px-3 py-2 rounded-button bg-casa-navy text-white text-body-sm font-semibold hover:bg-casa-navy/90 disabled:opacity-60"
              >
                {photoEditorSaving ? 'Saving…' : 'Save photo'}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteConfirmRecipe && (
        <div
          className="fixed inset-0 z-[90] bg-casa-navy/40 flex items-center justify-center p-4"
          onClick={() => {
            if (deletingRecipeId !== deleteConfirmRecipe.id) {
              setDeleteConfirmRecipe(null)
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-casa-border bg-casa-surface shadow-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-casa-divider">
              <p className="text-body font-semibold text-casa-navy">Delete recipe?</p>
              <p className="mt-1 text-body-sm text-casa-muted">
                Delete "{deleteConfirmRecipe.name}"? This cannot be undone.
              </p>
            </div>
            <div className="px-4 py-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmRecipe(null)}
                disabled={deletingRecipeId === deleteConfirmRecipe.id}
                className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted hover:bg-casa-main disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteRecipe()}
                disabled={deletingRecipeId === deleteConfirmRecipe.id}
                className="px-3 py-2 rounded-button bg-red-600 text-white text-body-sm font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                {deletingRecipeId === deleteConfirmRecipe.id ? 'Deleting…' : 'Delete recipe'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importDialogOpen && (
        <div className="fixed inset-0 z-[85] bg-casa-navy/40 flex items-center justify-center p-4" onClick={closeImportDialog}>
          <div
            className="w-full max-w-3xl max-h-[92vh] rounded-2xl border border-casa-border bg-casa-surface shadow-modal overflow-hidden flex flex-col self-end md:self-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-casa-divider">
              <p className="text-caption uppercase tracking-[0.14em] text-casa-muted font-semibold">Dinner Control Center</p>
              <p className="text-body font-semibold text-casa-navy mt-1">Import recipe</p>
              <p className="text-caption text-casa-muted mt-1">
                {importStep === 1 ? 'Step 1 of 3 · Add sources' : importStep === 2 ? 'Step 2 of 3 · Confirm sources' : 'Step 3 of 3 · Review + save'}
              </p>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              {(importStep === 1 || importStep === 2) && (
                <div className="rounded-2xl border border-casa-border bg-casa-bg p-3 space-y-2">
                  <p className="text-caption text-casa-muted">Add a URL and/or photos. Import will use whatever you provided.</p>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="url"
                      value={importUrlInput}
                      onChange={(event) => setImportUrlInput(event.target.value)}
                      placeholder="https://..."
                      className="flex-1 rounded-button border border-casa-border bg-casa-surface px-3 py-2 text-body-sm text-casa-text outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => triggerFileInput(importFileInputRef)}
                      className={cn(
                        'px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted hover:bg-casa-main transition-colors inline-flex items-center justify-center gap-1 cursor-pointer',
                        importingRecipe && 'opacity-60 pointer-events-none',
                      )}
                    >
                      <Upload size={14} />
                      Upload
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerFileInput(importCameraInputRef)}
                      className={cn(
                        'px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted hover:bg-casa-main transition-colors inline-flex items-center justify-center gap-1 cursor-pointer',
                        importingRecipe && 'opacity-60 pointer-events-none',
                      )}
                    >
                      <Camera size={14} />
                      Take photo
                    </button>
                  </div>
                  <input
                    id="cook-import-file-input"
                    ref={importFileInputRef}
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    multiple
                    className="absolute left-[-9999px] h-px w-px opacity-0 pointer-events-none"
                    onChange={(event) => {
                      const files = event.target.files ? Array.from(event.target.files) : []
                      event.currentTarget.value = ''
                      void addImportCaptureFiles(files, 'upload')
                    }}
                  />
                  <input
                    id="cook-import-camera-input"
                    ref={importCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="absolute left-[-9999px] h-px w-px opacity-0 pointer-events-none"
                    onChange={(event) => {
                      const files = event.target.files ? Array.from(event.target.files) : []
                      event.currentTarget.value = ''
                      void addImportCaptureFiles(files, 'camera')
                    }}
                  />
                  {importCaptureFiles.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-caption text-casa-muted">Attached photos ({importCaptureFiles.length}) · meal photo is optional</p>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {importCaptureFiles.map((file, index) => {
                          const selected = importMealPhotoIndex !== null && index === importMealPhotoIndex
                          return (
                            <div key={file.id} className={cn('rounded-lg border overflow-hidden', selected ? 'border-casa-gold' : 'border-casa-border')}>
                              <button
                                type="button"
                                onClick={() => setImportMealPhotoIndex((current) => (current === index ? null : index))}
                                className="block w-full"
                              >
                                <img
                                  src={file.previewUrl}
                                  alt={file.name}
                                  className="h-16 w-full object-cover bg-casa-surface"
                                  loading="lazy"
                                />
                                <span className={cn('block px-1 py-1 text-caption truncate text-left', selected ? 'text-casa-navy font-semibold' : 'text-casa-muted')}>
                                  {selected ? 'Meal photo' : 'Set meal photo'}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => removeImportCaptureFile(file.id)}
                                className="w-full border-t border-casa-divider px-1 py-1 text-caption text-casa-muted hover:bg-casa-bg"
                              >
                                Remove
                              </button>
                            </div>
                          )
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => setImportMealPhotoIndex(null)}
                        className={cn(
                          'mt-1 px-2.5 py-1.5 rounded-button border text-caption transition-colors',
                          importMealPhotoIndex === null
                            ? 'border-casa-gold bg-casa-gold/10 text-casa-navy font-semibold'
                            : 'border-casa-border text-casa-muted hover:bg-casa-bg',
                        )}
                      >
                        No meal photo
                      </button>
                    </div>
                  )}
                </div>
              )}

              {importingRecipe && (
                <p className="text-caption text-casa-muted animate-breathe">Extracting recipe…</p>
              )}
              {importError && (
                <p className="text-caption text-casa-error">{importError}</p>
              )}

              {importStep === 3 && importDraft && (
                <div className="rounded-2xl border border-casa-border bg-casa-bg p-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <img
                      src={
                        importDraft.primary_image_index === null
                          ? (importDraft.image_url ?? recipeFallbackHero)
                          : (importDraft.image_urls[importDraft.primary_image_index] ?? importDraft.image_url ?? recipeFallbackHero)
                      }
                      alt={importDraft.name}
                      className="h-16 w-16 rounded-xl border border-casa-border object-cover bg-casa-surface flex-shrink-0"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        const target = event.currentTarget
                        if (target.src !== recipeFallbackHero) target.src = recipeFallbackHero
                      }}
                    />
                    <div className="min-w-0">
                      <p className="text-body-sm font-semibold text-casa-navy">{importDraft.name}</p>
                      <p className="text-caption text-casa-muted">
                        {importDraft.ingredients.length} ingredients · {importDraft.steps.length} steps · {Math.round(importDraft.confidence * 100)}% confidence
                        {importDraft.servings ? ` · ${importDraft.servings}` : ''}
                        {importDraft.cook_time ? ` · ${importDraft.cook_time}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-casa-border bg-casa-surface p-2">
                    <p className="text-caption text-casa-muted mb-1">Recipe photos</p>
                    <p className="text-caption text-casa-muted mb-2">Tap a photo to mark as meal photo (cover), or choose none.</p>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="url"
                        value={importExtraImageUrl}
                        onChange={(event) => setImportExtraImageUrl(event.target.value)}
                        placeholder="https://.../another-photo.jpg"
                        className="flex-1 rounded-button border border-casa-border bg-casa-bg px-2.5 py-1.5 text-caption text-casa-text outline-none"
                      />
                      <button
                        type="button"
                        onClick={addImportImageUrl}
                        className="px-2.5 py-1.5 rounded-button border border-casa-border text-caption text-casa-navy hover:bg-casa-bg transition-colors"
                      >
                        Add image
                      </button>
                    </div>
                    {importDraft.image_urls.length === 0 ? (
                      <p className="text-caption text-casa-muted">No images found yet.</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {importDraft.image_urls.map((imageUrl, imageIndex) => {
                          const selected = importDraft.primary_image_index !== null && imageIndex === importDraft.primary_image_index
                          return (
                            <button
                              key={`${imageUrl}-${imageIndex}`}
                              type="button"
                              onClick={() => chooseImportPrimaryImage(imageIndex)}
                              className={cn(
                                'rounded-lg overflow-hidden border text-left transition-colors',
                                selected ? 'border-casa-gold' : 'border-casa-border hover:border-casa-gold/40',
                              )}
                            >
                              <img
                                src={imageUrl}
                                alt={`${importDraft.name} image ${imageIndex + 1}`}
                                className="h-20 w-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={(event) => {
                                  const target = event.currentTarget
                                  if (target.src !== recipeFallbackHero) target.src = recipeFallbackHero
                                }}
                              />
                              <span
                                className={cn(
                                  'block px-1.5 py-1 text-caption',
                                  selected ? 'text-casa-navy font-semibold' : 'text-casa-muted'
                                )}
                              >
                                {selected ? 'Meal photo selected' : 'Mark as meal photo'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setImportDraft((current) => current ? { ...current, primary_image_index: null, image_url: null } : current)
                      }}
                      className={cn(
                        'mt-2 px-2.5 py-1.5 rounded-button border text-caption transition-colors',
                        importDraft.primary_image_index === null
                          ? 'border-casa-gold bg-casa-gold/10 text-casa-navy font-semibold'
                          : 'border-casa-border text-casa-muted hover:bg-casa-bg',
                      )}
                    >
                      No meal photo
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    <div className="rounded-xl border border-casa-border bg-casa-surface p-2">
                      <p className="text-caption text-casa-muted mb-1">Ingredients preview</p>
                      <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                        {importDraft.ingredients.map((ingredient, index) => {
                          const normalized = normalizeRecipeIngredientFields({
                            rawText: ingredient.raw_text,
                            name: ingredient.name,
                            quantity: ingredient.quantity,
                            unit: ingredient.unit,
                          })
                          return (
                            <div key={`${ingredient.raw_text}-${index}`} className="rounded-lg border border-casa-border bg-casa-bg px-2 py-1.5 text-caption text-casa-text">
                              <p><span className="text-casa-muted">Item:</span> <span className="font-medium">{normalized.name || ingredient.raw_text}</span></p>
                              <p className="text-caption text-casa-muted">
                                Qty: {normalized.quantity || '—'} · Unit: {normalized.unit || '—'}
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <div className="rounded-xl border border-casa-border bg-casa-surface p-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-caption text-casa-muted">Directions preview (literal text, ordered)</p>
                        <button
                          type="button"
                          onClick={() => void runImportFromCurrentSources()}
                          disabled={importingRecipe}
                          className="px-2 py-1 rounded-pill border border-casa-border text-caption text-casa-navy hover:bg-casa-bg disabled:opacity-60"
                        >
                          {importingRecipe ? 'Re-extracting…' : 'Re-extract'}
                        </button>
                      </div>
                      <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                        {importDraft.steps.map((step, stepIndex) => (
                          <div key={`${step.step_number}-${stepIndex}`} className="rounded-lg border border-casa-border bg-casa-bg p-2">
                            <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                              <p className="text-caption font-semibold text-casa-muted">Step {stepIndex + 1}</p>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveImportStep(stepIndex, -1)}
                                  disabled={stepIndex === 0}
                                  className="px-1.5 py-0.5 rounded-pill border border-casa-border text-caption text-casa-muted hover:bg-casa-surface disabled:opacity-50"
                                >
                                  Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveImportStep(stepIndex, 1)}
                                  disabled={stepIndex >= importDraft.steps.length - 1}
                                  className="px-1.5 py-0.5 rounded-pill border border-casa-border text-caption text-casa-muted hover:bg-casa-surface disabled:opacity-50"
                                >
                                  Down
                                </button>
                                <button
                                  type="button"
                                  onClick={() => addImportStepAfter(stepIndex)}
                                  className="px-1.5 py-0.5 rounded-pill border border-casa-border text-caption text-casa-navy hover:bg-casa-surface"
                                >
                                  Add
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeImportStep(stepIndex)}
                                  disabled={importDraft.steps.length <= 1}
                                  className="px-1.5 py-0.5 rounded-pill border border-casa-border text-caption text-casa-error hover:bg-casa-surface disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                            <textarea
                              value={step.instruction}
                              onChange={(event) => updateImportStepInstruction(stepIndex, event.target.value)}
                              rows={3}
                              className="w-full rounded-button border border-casa-border bg-casa-surface px-2 py-1.5 text-caption text-casa-text outline-none resize-y"
                            />
                          </div>
                        ))}
                        {importDraft.steps.length === 0 && (
                          <button
                            type="button"
                            onClick={() => addImportStepAfter(-1)}
                            className="w-full px-2 py-1.5 rounded-button border border-casa-border text-caption text-casa-navy hover:bg-casa-surface"
                          >
                            Add first step
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-casa-divider flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeImportDialog}
                className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted hover:bg-casa-main"
              >
                Cancel
              </button>
              {importStep === 1 && (
                <button
                  type="button"
                  disabled={!hasImportSource}
                  onClick={() => setImportStep(2)}
                  className="px-3 py-2 rounded-button bg-casa-navy text-white text-body-sm font-semibold hover:bg-casa-navy/90 disabled:opacity-60"
                >
                  Next
                </button>
              )}
              {importStep === 2 && (
                <>
                  <button
                    type="button"
                    onClick={() => setImportStep(1)}
                    className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted hover:bg-casa-main"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={importingRecipe || !hasImportSource}
                    onClick={() => void runImportFromCurrentSources()}
                    className="px-3 py-2 rounded-button bg-casa-navy text-white text-body-sm font-semibold hover:bg-casa-navy/90 disabled:opacity-60"
                  >
                    {importingRecipe ? 'Importing…' : 'Import'}
                  </button>
                </>
              )}
              {importStep === 3 && (
                <>
                  <button
                    type="button"
                    onClick={() => setImportStep(2)}
                    className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted hover:bg-casa-main"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={!importDraft || importSaving}
                    onClick={() => void saveImportedRecipe({ openCookMode: false })}
                    className="px-3 py-2 rounded-button border border-casa-border text-body-sm font-semibold text-casa-navy hover:bg-casa-main disabled:opacity-60"
                  >
                    Save recipe
                  </button>
                  <button
                    type="button"
                    disabled={!importDraft || importSaving}
                    onClick={() => void saveImportedRecipe({ openCookMode: true })}
                    className="px-3 py-2 rounded-button bg-casa-navy text-white text-body-sm font-semibold hover:bg-casa-navy/90 disabled:opacity-60"
                  >
                    {importSaving ? 'Saving…' : 'Save + Cook now'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {cookRecipe && (
        <div
          className="fixed inset-0 z-[70] casa-scrim flex items-start justify-center overflow-y-auto p-4 sm:p-6"
          onClick={() => setCookRecipeId(null)}
        >
          <div
            className="w-[min(64rem,calc(100vw-2rem))] my-auto max-h-[calc(100vh-2rem)] rounded-modal border border-casa-border bg-casa-bg shadow-modal flex flex-col overflow-hidden"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={cookRecipe.name}
          >
            {isRecipeEditMode ? (
              <div className="px-5 py-3.5 border-b border-casa-divider flex items-center justify-between gap-2 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <RecipeImage
                    src={getRecipeImage(cookRecipe)}
                    alt={cookRecipe.name}
                    focalX={parseRecipeImageFocus(cookRecipe.image_url).focalX}
                    focalY={parseRecipeImageFocus(cookRecipe.image_url).focalY}
                    className="w-12 h-12 rounded-card object-cover border border-casa-border bg-casa-bg flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-body font-semibold text-casa-navy truncate">
                      {recipeEditorDraft?.name ?? cookRecipe.name}
                    </p>
                    <p className="text-caption text-casa-muted">Editing recipe</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openPhotoEditor(cookRecipe)}
                    className="px-2.5 py-1.5 rounded-button border border-casa-border text-caption text-casa-muted hover:bg-casa-main inline-flex items-center gap-1"
                  >
                    <Camera size={12} />
                    Edit photo
                  </button>
                  <button
                    type="button"
                    onClick={() => requestDeleteRecipe(cookRecipe)}
                    disabled={deletingRecipeId === cookRecipe.id}
                    className="px-2.5 py-1.5 rounded-button border border-casa-error/40 text-caption text-casa-error hover:bg-casa-error/10 inline-flex items-center gap-1 disabled:opacity-60"
                  >
                    <Trash2 size={12} />
                    {deletingRecipeId === cookRecipe.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative h-[150px] flex-shrink-0 overflow-hidden bg-casa-navy">
                <RecipeImage
                  src={getRecipeImage(cookRecipe)}
                  alt=""
                  focalX={parseRecipeImageFocus(cookRecipe.image_url).focalX}
                  focalY={parseRecipeImageFocus(cookRecipe.image_url).focalY}
                  loading="eager"
                  className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-60"
                />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(to top, rgba(11,31,58,0.92) 0%, rgba(11,31,58,0.62) 55%, rgba(11,31,58,0.55) 100%)' }}
                  aria-hidden
                />
                <div className="absolute inset-0 p-4 flex items-end gap-4">
                  <RecipeImage
                    src={getRecipeImage(cookRecipe)}
                    alt={cookRecipe.name}
                    focalX={parseRecipeImageFocus(cookRecipe.image_url).focalX}
                    focalY={parseRecipeImageFocus(cookRecipe.image_url).focalY}
                    loading="eager"
                    className="w-[104px] h-[104px] rounded-card object-cover border border-white/25 shadow-card flex-shrink-0 bg-casa-navy"
                  />
                  <div className="min-w-0 pb-1">
                    <p className="text-caption font-semibold uppercase tracking-[0.18em] text-casa-info">
                      Now cooking
                    </p>
                    <p className="mt-0.5 text-white font-semibold text-display-sm leading-tight line-clamp-2 drop-shadow">
                      {cookRecipe.name}
                    </p>
                  </div>
                </div>
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  {cookRecipe.source_url && (
                    <a
                      href={cookRecipe.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1.5 rounded-button bg-casa-surface/85 backdrop-blur border border-casa-border text-caption text-casa-navy hover:bg-casa-surface inline-flex items-center gap-1"
                    >
                      <ExternalLink size={12} />
                      Original
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={startRecipeEditing}
                    className="px-2.5 py-1.5 rounded-button bg-casa-surface/85 backdrop-blur border border-casa-border text-caption text-casa-navy hover:bg-casa-surface inline-flex items-center gap-1"
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 min-h-0 p-4 flex flex-col gap-3 overflow-y-auto">
              {isRecipeEditMode && recipeEditorDraft ? (
                <>
                  <div className="rounded-xl border border-casa-border bg-casa-bg p-3 space-y-2">
                    <label className="block">
                      <span className="text-body-sm text-casa-muted">Recipe name</span>
                      <input
                        type="text"
                        value={recipeEditorDraft.name}
                        onChange={(event) => setRecipeEditorDraft((current) => current ? { ...current, name: event.target.value } : current)}
                        className="mt-1 w-full rounded-button border border-casa-border bg-casa-surface px-3 py-2 text-body-lg text-casa-text outline-none"
                      />
                    </label>
                    <div className="rounded-lg border border-casa-border bg-casa-surface p-2 space-y-2">
                      <p className="text-body-sm text-casa-muted">Quick actions</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => applyPipeChoiceToRecipeDraft('left')}
                          className="px-2.5 py-1.5 rounded-pill border border-casa-border text-body-sm text-casa-navy hover:bg-casa-bg"
                        >
                          Use left side of |
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPipeChoiceToRecipeDraft('right')}
                          className="px-2.5 py-1.5 rounded-pill border border-casa-border text-body-sm text-casa-navy hover:bg-casa-bg"
                        >
                          Use right side of |
                        </button>
                        {recipeQuickActions.map((action) => (
                          <button
                            key={action.id}
                            type="button"
                            onClick={() => applyRegexQuickAction(action)}
                            className="px-2.5 py-1.5 rounded-pill border border-casa-border text-body-sm text-casa-muted hover:bg-casa-bg"
                          >
                            {action.name}
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
                        <textarea
                          value={recipeAiInstruction}
                          onChange={(event) => setRecipeAiInstruction(event.target.value)}
                          rows={2}
                          placeholder='AI edit instruction (e.g. "split quantities using left side of | for 2 people").'
                          className="rounded-button border border-casa-border bg-casa-bg px-2.5 py-2 text-body-sm text-casa-text outline-none resize-y"
                        />
                        <button
                          type="button"
                          onClick={() => void applyAiRecipeEdit()}
                          disabled={recipeAiEditing}
                          className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy hover:bg-casa-bg disabled:opacity-60"
                        >
                          {recipeAiEditing ? 'Applying…' : 'Apply AI edit'}
                        </button>
                      </div>
                      {recipeAiError && <p className="text-body-sm text-casa-error">{recipeAiError}</p>}
                      {recipeSuggestedQuickAction && (
                        <div className="rounded-lg border border-casa-gold/40 bg-casa-gold/10 p-2 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-body-sm font-semibold text-casa-navy">AI suggested quick action: {recipeSuggestedQuickAction.name}</p>
                            {recipeSuggestedQuickAction.description && (
                              <p className="text-body-sm text-casa-muted">{recipeSuggestedQuickAction.description}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={saveSuggestedQuickAction}
                            className="px-2.5 py-1.5 rounded-pill border border-casa-border text-body-sm text-casa-navy hover:bg-casa-bg"
                          >
                            Save action
                          </button>
                        </div>
                      )}
                    </div>
                    {recipeEditorError && <p className="text-body-sm text-casa-error">{recipeEditorError}</p>}
                    {recipeEditorStatus && <p className="text-body-sm text-casa-muted">{recipeEditorStatus}</p>}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
                    <div className="rounded-xl border border-casa-border bg-casa-bg p-2 flex flex-col min-h-0">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-body-sm font-semibold text-casa-muted">Ingredients ({recipeEditorDraft.ingredients.length})</p>
                        <button
                          type="button"
                          onClick={addRecipeDraftIngredient}
                          className="px-2.5 py-1.5 rounded-pill border border-casa-border text-body-sm text-casa-navy hover:bg-casa-surface"
                        >
                          Add ingredient
                        </button>
                      </div>
                      <div className="space-y-1 overflow-y-auto pr-1">
                        {recipeEditorDraft.ingredients.map((ingredient, index) => (
                          <div key={`edit-ingredient-${index}`} className="rounded-lg border border-casa-border bg-casa-surface p-2 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={ingredient.quantity ?? ''}
                                onChange={(event) => updateRecipeDraftIngredient(index, { quantity: event.target.value || null })}
                                placeholder="Qty"
                                className="w-16 rounded-button border border-casa-border bg-casa-bg px-2 py-1.5 text-body text-casa-text outline-none"
                              />
                              <input
                                type="text"
                                value={ingredient.unit ?? ''}
                                onChange={(event) => updateRecipeDraftIngredient(index, { unit: event.target.value || null })}
                                placeholder="Unit"
                                className="w-16 rounded-button border border-casa-border bg-casa-bg px-2 py-1.5 text-body text-casa-text outline-none"
                              />
                              <input
                                type="text"
                                value={ingredient.name ?? ''}
                                onChange={(event) => updateRecipeDraftIngredient(index, { name: event.target.value || null })}
                                placeholder="Ingredient name"
                                className="flex-1 rounded-button border border-casa-border bg-casa-bg px-2 py-1.5 text-body text-casa-text outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => removeRecipeDraftIngredient(index)}
                                className="px-2 py-1.5 rounded-pill border border-casa-border text-body-sm text-casa-error hover:bg-casa-bg"
                              >
                                Remove
                              </button>
                            </div>
                            <input
                              type="text"
                              value={ingredient.raw_text}
                              onChange={(event) => updateRecipeDraftIngredient(index, { raw_text: event.target.value })}
                              placeholder="Raw ingredient text"
                              className="w-full rounded-button border border-casa-border bg-casa-bg px-2 py-1.5 text-body-sm text-casa-muted outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-casa-border bg-casa-bg p-2 flex flex-col min-h-0">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-body-sm font-semibold text-casa-muted">Directions ({recipeEditorDraft.steps.length})</p>
                        <button
                          type="button"
                          onClick={() => addRecipeDraftStepAfter(recipeEditorDraft.steps.length - 1)}
                          className="px-2.5 py-1.5 rounded-pill border border-casa-border text-body-sm text-casa-navy hover:bg-casa-surface"
                        >
                          Add step
                        </button>
                      </div>
                      <div className="space-y-2 overflow-y-auto pr-1">
                        {recipeEditorDraft.steps.map((step, index) => (
                          <div key={`edit-step-${index}`} className="rounded-lg border border-casa-border bg-casa-surface p-2">
                            <div className="mb-1 flex items-center justify-between gap-1">
                              <p className="text-body-sm font-semibold text-casa-muted">Step {index + 1}</p>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveRecipeDraftStep(index, -1)}
                                  disabled={index === 0}
                                  className="px-2 py-1 rounded-pill border border-casa-border text-body-sm text-casa-muted hover:bg-casa-bg disabled:opacity-50"
                                >
                                  Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveRecipeDraftStep(index, 1)}
                                  disabled={index >= recipeEditorDraft.steps.length - 1}
                                  className="px-2 py-1 rounded-pill border border-casa-border text-body-sm text-casa-muted hover:bg-casa-bg disabled:opacity-50"
                                >
                                  Down
                                </button>
                                <button
                                  type="button"
                                  onClick={() => addRecipeDraftStepAfter(index)}
                                  className="px-2 py-1 rounded-pill border border-casa-border text-body-sm text-casa-navy hover:bg-casa-bg"
                                >
                                  Add
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeRecipeDraftStep(index)}
                                  disabled={recipeEditorDraft.steps.length <= 1}
                                  className="px-2 py-1 rounded-pill border border-casa-border text-body-sm text-casa-error hover:bg-casa-bg disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                            <textarea
                              value={step.instruction}
                              onChange={(event) => updateRecipeDraftStep(index, event.target.value)}
                              rows={3}
                              className="w-full rounded-button border border-casa-border bg-casa-bg px-2.5 py-2 text-body text-casa-text outline-none resize-y leading-relaxed"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_17.5rem] gap-3">
                  <div className="order-1 lg:min-w-0">
                    <div className="pb-2 flex items-center justify-between gap-2">
                      <p className="text-body-sm font-bold text-casa-navy">
                        {directionsViewMode === 'step'
                          ? `Step ${stepIndex + 1} of ${Math.max(1, cookSteps.length)}`
                          : `${cookSteps.length} steps`}
                      </p>
                      <SegmentedControl
                        aria-label="Directions view"
                        value={directionsViewMode}
                        onChange={setDirectionsViewMode}
                        options={[
                          { value: 'step', label: 'Step-by-step' },
                          { value: 'all', label: 'All steps' },
                        ]}
                      />
                    </div>
                    {directionsViewMode === 'step' && neededNowIngredientRows.length > 0 && (
                      <div className="pb-3">
                        <div className="rounded-card border border-casa-accent-subtle-border bg-casa-accent-subtle px-3 py-2">
                          <p className="text-caption font-semibold uppercase tracking-[0.14em] text-casa-top-pick-band">Needed now</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {neededNowIngredientRows.map((row) => (
                              <span
                                key={`needed-now-${row.id}`}
                                className="inline-flex items-center gap-1 rounded-pill border border-casa-accent-subtle-border bg-casa-surface px-2.5 py-1 text-body-sm font-semibold text-casa-top-pick-band"
                              >
                                <span>{row.name}</span>
                                {row.qty && <span className="font-normal text-casa-text-secondary">{row.qty}</span>}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    {directionsViewMode === 'step' && cookSteps.length > 1 && (
                      <div className="pb-3 flex items-center gap-1" aria-hidden>
                        {cookSteps.map((_, index) => (
                          <span
                            key={`step-seg-${index}`}
                            className={cn(
                              'h-1.5 flex-1 rounded-pill transition-colors',
                              index <= stepIndex ? 'bg-casa-info' : 'bg-casa-control-border'
                            )}
                          />
                        ))}
                      </div>
                    )}
                    {directionsViewMode === 'all' && cookSteps.length > 1 && (
                      <div className="pb-3">
                        <div className="h-[5px] w-full rounded-pill bg-casa-control-border overflow-hidden" aria-hidden>
                          <div
                            className="h-full bg-casa-info transition-[width] duration-300"
                            style={{ width: `${Math.round(((stepIndex + 1) / Math.max(1, cookSteps.length)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <div className="pt-2">
                      {directionsViewMode === 'step' ? (
                        <div ref={(el) => { currentStepRef.current = el }} className="pr-1 flex gap-3">
                          <span className="text-casa-accent-soft-border font-extrabold leading-none text-display-md flex-shrink-0 tabular-nums">
                            {stepIndex + 1}
                          </span>
                          <p className="text-display-sm text-casa-navy leading-snug pt-1">{currentStep?.instruction ?? 'No directions saved for this recipe yet.'}</p>
                        </div>
                      ) : (
                        <div className="flex flex-col pr-1">
                          {(cookSteps.length > 0 ? cookSteps : [{ step_number: 1, instruction: 'No directions saved for this recipe yet.' }]).map((step, index) => {
                            const isCurrent = cookSteps.length > 0 && index === stepIndex
                            const isDone = cookSteps.length > 0 && index < stepIndex
                            const canJump = cookSteps.length > 0
                            return (
                              <button
                                key={`${step.step_number}-${index}`}
                                ref={isCurrent ? (el) => { currentStepRef.current = el } : undefined}
                                type="button"
                                disabled={!canJump}
                                onClick={() => canJump && setStepIndex(index)}
                                className={cn(
                                  'w-full text-left flex gap-3.5 transition-colors scroll-mt-4 scroll-mb-4',
                                  isCurrent
                                    ? 'rounded-card border border-casa-accent-subtle-border bg-casa-accent-subtle p-4 my-1.5'
                                    : 'items-start py-4 px-0.5 border-b border-casa-divider last:border-b-0'
                                )}
                              >
                                <span
                                  className={cn(
                                    'flex-none grid place-items-center w-[32px] h-[32px] rounded-pill text-body font-bold leading-none border transition-colors',
                                    isDone
                                      ? 'bg-casa-info border-casa-info text-white'
                                      : isCurrent
                                        ? 'bg-casa-accent-soft border-casa-accent-soft-border text-casa-navy'
                                        : 'bg-casa-surface border-casa-control-border text-casa-text-tertiary'
                                  )}
                                >
                                  {isDone ? <Check size={15} strokeWidth={3} /> : step.step_number}
                                </span>
                                <div className="min-w-0 flex-1">
                                  {isCurrent && (
                                    <p className="text-body-sm font-bold uppercase tracking-[0.12em] text-casa-info-strong mb-2">
                                      Current step
                                    </p>
                                  )}
                                  <p
                                    className={cn(
                                      'text-display-sm leading-snug pt-0.5',
                                      isDone ? 'text-casa-text-tertiary' : 'text-casa-navy'
                                    )}
                                  >
                                    {step.instruction}
                                  </p>
                                  {isCurrent && neededNowIngredientRows.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                      {neededNowIngredientRows.map((row) => (
                                        <span
                                          key={`mini-needed-${row.id}`}
                                          className="inline-flex items-center gap-1.5 rounded-pill border border-casa-accent-soft-border bg-casa-surface px-3 py-1.5 text-body-sm font-semibold text-casa-top-pick-band"
                                        >
                                          {row.name}
                                          {row.qty && <b className="font-semibold text-casa-text-secondary">{row.qty}</b>}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="order-2">
                    <div className="rounded-card border border-casa-border bg-casa-surface overflow-hidden lg:sticky lg:top-0 shadow-[0_1px_2px_1px_rgba(6,10,36,0.05)]">
                    <div className="px-4 pt-3 pb-3 border-b border-casa-divider">
                      <div className="flex items-baseline justify-between gap-2 mb-1.5">
                        <p className="text-body font-bold text-casa-navy">Ingredients</p>
                        <SegmentedControl
                          aria-label="Ingredient units"
                          value={showCupsConversion ? 'cups' : 'grams'}
                          onChange={(value) => setShowCupsConversion(value === 'cups')}
                          options={[
                            { value: 'grams', label: 'Grams' },
                            { value: 'cups', label: 'Cups' },
                          ]}
                        />
                      </div>
                      <p className="text-caption text-casa-text-tertiary mb-3">{cookIngredients.length} items · low-touch shelf</p>
                      <SegmentedControl
                        aria-label="Recipe quantity scale"
                        value={recipeScale}
                        onChange={setRecipeScale}
                        fullWidth
                        options={[
                          { value: '0.5', label: '0.5×' },
                          { value: '1', label: '1×' },
                          { value: '2', label: '2×' },
                        ]}
                      />
                    </div>
                    <div className="p-4">
                      {cookIngredientRows.length === 0 ? (
                        <p className="text-body-sm text-casa-muted">No ingredient breakdown saved for this recipe.</p>
                      ) : (
                        <div className="max-h-40 lg:max-h-[60vh] overflow-y-auto pr-1">
                          {cookIngredientRows.map((row) => {
                            const checked = checkedCookIngredients.has(row.id)
                            return (
                              <button
                                key={row.id}
                                type="button"
                                onClick={() =>
                                  setCheckedCookIngredients((current) => {
                                    const next = new Set(current)
                                    if (next.has(row.id)) next.delete(row.id)
                                    else next.add(row.id)
                                    return next
                                  })
                                }
                                aria-pressed={checked}
                                className="w-full flex items-center justify-between gap-3 py-3 text-left border-b border-casa-divider last:border-b-0"
                              >
                                <span className="flex items-center gap-3 min-w-0">
                                  <span
                                    className={cn(
                                      'flex-none grid place-items-center w-[19px] h-[19px] rounded-full border-2 transition-colors',
                                      checked
                                        ? 'border-casa-info bg-casa-info text-white'
                                        : 'border-casa-control-border text-transparent'
                                    )}
                                  >
                                    <Check size={12} strokeWidth={3} />
                                  </span>
                                  <span
                                    className={cn(
                                      'text-body leading-snug transition-colors truncate',
                                      checked ? 'text-casa-text-tertiary line-through' : 'text-casa-navy'
                                    )}
                                  >
                                    {row.name}
                                  </span>
                                </span>
                                {row.qty && (
                                  <span
                                    className={cn(
                                      'flex-none whitespace-nowrap text-body font-semibold transition-colors',
                                      checked ? 'text-casa-text-faint line-through' : 'text-casa-text-secondary'
                                    )}
                                  >
                                    {row.qty}
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-casa-divider flex items-center justify-between">
              {isRecipeEditMode ? (
                <>
                  <button
                    type="button"
                    onClick={cancelRecipeEditing}
                    disabled={recipeEditorSaving}
                    className="px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-muted hover:bg-casa-main disabled:opacity-60"
                  >
                    Cancel edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveRecipeEdits()}
                    disabled={recipeEditorSaving}
                    className="px-3 py-2 rounded-button bg-casa-navy text-white text-body-sm font-semibold hover:bg-casa-navy/90 disabled:opacity-60"
                  >
                    {recipeEditorSaving ? 'Saving…' : 'Save changes'}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={stepIndex <= 0} className="min-h-[46px] px-4 py-2.5 rounded-button border border-casa-border text-body-sm font-semibold text-casa-muted disabled:opacity-50 inline-flex items-center gap-1">
                    <ChevronLeft size={14} />
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setCookRecipeId(null)}
                    className="min-h-[46px] px-4 py-2.5 rounded-button border border-casa-border text-body-sm font-semibold text-casa-muted hover:bg-casa-main transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (stepIndex >= cookSteps.length - 1) {
                        setCookRecipeId(null)
                        return
                      }
                      setStepIndex((current) => Math.min(Math.max(0, cookSteps.length - 1), current + 1))
                    }}
                    className="min-h-[46px] px-4 py-2.5 rounded-button border border-casa-navy bg-casa-navy text-white text-body-sm font-semibold hover:bg-casa-navy/90 inline-flex items-center gap-1 transition-colors"
                  >
                    {stepIndex >= cookSteps.length - 1 ? 'Finish' : 'Next step'}
                    <ChevronRight size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
