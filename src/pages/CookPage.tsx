import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CalendarPlus,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  GripVertical,
  Layers,
  Plus,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Utensils,
  X,
  BookOpen,
} from 'lucide-react'
import { saveTonightDinnerPlan } from '../utils/dinnerPlanSync'
import type { DinnerPlan } from '../types'
import { supabase } from '../lib/supabase'
import { formatSupabaseError } from '../lib/formatSupabaseError'
import { inferCategoryFromName } from '../utils/groceryCategorization'
import { normalizeRecipeIngredientFields } from '../utils/recipeIngredientParsing'
import { DEFAULT_FOOD_PROFILE, normalizeFoodProfile, type FoodProfile } from '../lib/foodProfile'
import {
  appendPantryInventoryAudit,
  normalizePackageUnit,
  normalizePantryKey,
  sanitizePantryInventoryAudit,
  type PantryInventoryAuditEntry,
} from '../lib/pantryInventoryUtils'
import { cn } from '../utils/cn'
import recipeFallbackHero from '../assets/hero.png'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Chip,
  DisclosureSection,
  EmptyState,
  Heading,
  IconButton,
  Input,
  Modal,
  PageShell,
  Progress,
  SegmentedControl,
  Switch,
  Text,
  Textarea,
  Toast,
  type ToastTone,
} from '../components/ui'
import ActiveKitchenWorkbench from '../components/kitchen/ActiveKitchenWorkbench'
import MobileCookingView from '../components/mobile/MobileCookingView'
import { useAppStore } from '../stores/appStore'


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


export default function CookPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const aiDrawerOpen = useAppStore((s) => s.aiDrawerOpen)
  const [cookRecipeId, setCookRecipeId] = useState<string | null>(null)
  const [assigningDay, setAssigningDay] = useState<{ slot: 'tonight' | 'tomorrow' | 'this-week'; dateStr: string; dayLabel: string } | null>(null)
  const [assignDaySearch, setAssignDaySearch] = useState('')
  const [recipeSearch, setRecipeSearch] = useState('')

  useEffect(() => {
    const recipeParam = searchParams.get('recipe')
    if (recipeParam) {
      setCookRecipeId(recipeParam)
    }
  }, [searchParams])
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
  const [directionsViewMode, setDirectionsViewMode] = useState<'step' | 'all'>('step')
  const [photoEditorUrl, setPhotoEditorUrl] = useState('')
  const [photoEditorPreviewUrl, setPhotoEditorPreviewUrl] = useState('')
  const [photoEditorPendingFile, setPhotoEditorPendingFile] = useState<File | null>(null)
  const [photoEditorDirty, setPhotoEditorDirty] = useState(false)
  const [photoEditorExpanded, setPhotoEditorExpanded] = useState(false)
  const [photoEditorFocalX, setPhotoEditorFocalX] = useState(50)
  const [photoEditorFocalY, setPhotoEditorFocalY] = useState(50)
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

  // Toast with Undo state
  const [toastState, setToastState] = useState<{
    open: boolean
    message: React.ReactNode
    tone?: ToastTone
    actionLabel?: string
    onAction?: () => void
  } | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [activeGroceryRecipeId, setActiveGroceryRecipeId] = useState<string | null>(null)
  const [recipeGrocerySelections, setRecipeGrocerySelections] = useState<Record<string, Set<number>>>({})

  // Drag-and-Drop Weekly Horizon State
  const [horizonExpanded, setHorizonExpanded] = useState(false)
  const [draggingHorizonDateStr, setDraggingHorizonDateStr] = useState<string | null>(null)
  const [dragOverHorizonDateStr, setDragOverHorizonDateStr] = useState<string | null>(null)
  const [justSwappedDates, setJustSwappedDates] = useState<{ dates: [string, string]; type: 'swap' | 'move' } | null>(null)
  const touchDragSourceDateStrRef = useRef<string | null>(null)
  const swapAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const importFileInputRef = useRef<HTMLInputElement>(null)
  const importCameraInputRef = useRef<HTMLInputElement>(null)
  const photoEditorUploadInputRef = useRef<HTMLInputElement>(null)
  const photoEditorCameraInputRef = useRef<HTMLInputElement>(null)
  const photoEditorObjectUrlRef = useRef<string | null>(null)
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
  const fullRecipes = useMemo(() => {
    return recipes.map((recipe) => ({
      ...recipe,
      ingredients: ingredientsByRecipe.get(recipe.id) ?? [],
      steps: stepsByRecipe.get(recipe.id) ?? [],
    }))
  }, [recipes, ingredientsByRecipe, stepsByRecipe])
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
  const weekDays = useMemo(() => {
    const days: Array<{
      date: Date
      dateStr: string
      dayName: string
      formattedDate: string
      isToday: boolean
      slot: 'tonight' | 'tomorrow' | 'this-week'
    }> = []

    const today = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const dateStr = d.toISOString().split('T')[0]
      const dayName = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })
      const formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const slot: 'tonight' | 'tomorrow' | 'this-week' = i === 0 ? 'tonight' : i === 1 ? 'tomorrow' : 'this-week'
      days.push({
        date: d,
        dateStr,
        dayName,
        formattedDate,
        isToday: i === 0,
        slot,
      })
    }
    return days
  }, [])

  const weekDayMeals = useMemo(() => {
    return weekDays.map((day, index) => {
      let matched = plannedRecipes.find(
        (p) =>
          (day.isToday && p.plan.slot === 'tonight') ||
          (index === 1 && p.plan.slot === 'tomorrow') ||
          (p.plan.planned_for && p.plan.planned_for.startsWith(day.dateStr))
      )

      if (!matched && index > 1) {
        const remainingThisWeek = plannedRecipes.filter(
          (p) => p.plan.slot === 'this-week' && (!p.plan.planned_for || p.plan.planned_for === day.dateStr)
        )
        const offset = index - 2
        if (remainingThisWeek[offset]) {
          matched = remainingThisWeek[offset]
        }
      }

      return {
        day,
        plan: matched?.plan ?? null,
        recipe: matched?.recipe ?? null,
      }
    })
  }, [weekDays, plannedRecipes])
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
      if (query) return haystack.includes(query)
      if (recipeBrowseFilter === 'quick') {
        const minutes = parseCookMinutes(recipe.cook_time)
        return typeof minutes === 'number' && minutes <= 30
      }
      if (recipeBrowseFilter === 'planned') return plannedRecipeIds.has(recipe.id)
      return true
    })
  }, [recipes, recipeSearch, recipeBrowseFilter, plannedRecipeIds])

  const cookRecipe = cookRecipeId ? recipeById.get(cookRecipeId) ?? null : null
  const cookSteps = cookRecipeId ? stepsByRecipe.get(cookRecipeId) ?? [] : []
  const cookIngredients = cookRecipeId ? ingredientsByRecipe.get(cookRecipeId) ?? [] : []

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

  // Keyboard nav for the Cook panel: ← / → move steps, Esc closes.
  // Only active while cooking (not editing) and no nested dialog is open.
  useEffect(() => {
    if (!cookRecipeId || isRecipeEditMode) return
    if (importDialogOpen || deleteConfirmRecipe) return
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
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
  }, [cookRecipeId, isRecipeEditMode, importDialogOpen, deleteConfirmRecipe, directionsViewMode, cookSteps.length])

  useEffect(() => () => {
    if (photoEditorObjectUrlRef.current) URL.revokeObjectURL(photoEditorObjectUrlRef.current)
  }, [])

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
    setDirectionsViewMode('step')
    setLibraryActionError(null)
  }

  function closeCookRecipe() {
    clearPhotoEditorPendingFile()
    setCookRecipeId(null)
    setStepIndex(0)
    setDirectionsViewMode('step')
    if (searchParams.has('recipe') || searchParams.has('autocook')) {
      setSearchParams({}, { replace: true })
    }
  }

  function startRecipeEditing() {
    if (!cookRecipe) return
    initializePhotoEditorDraft(cookRecipe)
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
    clearPhotoEditorPendingFile()
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

  async function insertUniqueGroceryItems(
    listId: string,
    items: Array<{ name: string; quantity: string | null; unit: string | null; notes: string }>,
  ): Promise<{ insertedCount: number; insertedIds: string[] }> {
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

    if (rowsToInsert.length === 0) {
      return { insertedCount: 0, insertedIds: [] }
    }

    const { data: insertedRows, error: insertError } = await supabase
      .from('grocery_items')
      .insert(rowsToInsert)
      .select('id')
    if (insertError && insertError.code !== '23505') throw insertError
    const insertedIds = (insertedRows ?? []).map((row) => (row as { id: string }).id)
    return { insertedCount: rowsToInsert.length, insertedIds }
  }

  function showToast(options: {
    message: React.ReactNode
    tone?: ToastTone
    actionLabel?: string
    onAction?: () => void
    duration?: number
  }) {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
      toastTimeoutRef.current = null
    }
    setToastState({
      open: true,
      message: options.message,
      tone: options.tone ?? 'success',
      actionLabel: options.actionLabel,
      onAction: options.onAction,
    })
    toastTimeoutRef.current = setTimeout(() => {
      setToastState(null)
    }, options.duration ?? 6000)
  }

  function toggleGroceryDrawer(recipe: Recipe) {
    if (activeGroceryRecipeId === recipe.id) {
      setActiveGroceryRecipeId(null)
    } else {
      setActiveGroceryRecipeId(recipe.id)
      const recipeIngredients = ingredientsByRecipe.get(recipe.id) ?? []
      if (!recipeGrocerySelections[recipe.id]) {
        setRecipeGrocerySelections((prev) => ({
          ...prev,
          [recipe.id]: new Set(recipeIngredients.map((_, i) => i)),
        }))
      }
    }
  }

  function toggleIngredientSelection(recipeId: string, index: number) {
    setRecipeGrocerySelections((prev) => {
      const current = new Set(prev[recipeId] ?? [])
      if (current.has(index)) {
        current.delete(index)
      } else {
        current.add(index)
      }
      return { ...prev, [recipeId]: current }
    })
  }

  function toggleAllIngredients(recipe: Recipe) {
    const recipeIngredients = ingredientsByRecipe.get(recipe.id) ?? []
    setRecipeGrocerySelections((prev) => {
      const current = prev[recipe.id] ?? new Set()
      const allSelected = current.size === recipeIngredients.length
      return {
        ...prev,
        [recipe.id]: allSelected ? new Set() : new Set(recipeIngredients.map((_, i) => i)),
      }
    })
  }

  async function addSelectedRecipeGroceries(recipe: Recipe) {
    const recipeIngredients = ingredientsByRecipe.get(recipe.id) ?? []
    const selectedIndexes = recipeGrocerySelections[recipe.id] ?? new Set(recipeIngredients.map((_, i) => i))
    const itemsToAdd = recipeIngredients
      .filter((_, i) => selectedIndexes.has(i))
      .map((ingredient) => {
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

    if (itemsToAdd.length === 0) {
      showToast({ message: 'No ingredients selected to add.', tone: 'info', duration: 3000 })
      return
    }

    setSmartAddingRecipeId(recipe.id)
    try {
      const listId = await getOrCreateShoppingListId()
      const { insertedCount, insertedIds } = await insertUniqueGroceryItems(listId, itemsToAdd)
      setActiveGroceryRecipeId(null)

      if (insertedCount > 0) {
        showToast({
          message: `Added ${insertedCount} ingredient${insertedCount === 1 ? '' : 's'} from "${recipe.name}" to cart.`,
          tone: 'success',
          actionLabel: 'Undo',
          onAction: () => {
            void undoAddGroceries(insertedIds, recipe.name)
          },
        })
      } else {
        showToast({
          message: `Selected ingredients from "${recipe.name}" are already in your cart.`,
          tone: 'info',
        })
      }
    } catch (error) {
      showToast({
        message: formatSupabaseError(error, 'Could not add ingredients to cart'),
        tone: 'danger',
      })
    } finally {
      setSmartAddingRecipeId(null)
    }
  }

  async function undoAddGroceries(insertedIds: string[], recipeName: string) {
    if (insertedIds.length === 0) return
    try {
      const { error } = await supabase
        .from('grocery_items')
        .delete()
        .in('id', insertedIds)
      if (error) throw error
      setToastState(null)
      showToast({
        message: `Removed ingredients for "${recipeName}" from cart.`,
        tone: 'info',
        duration: 4000,
      })
    } catch (error) {
      showToast({
        message: formatSupabaseError(error, 'Could not undo grocery addition'),
        tone: 'danger',
      })
    }
  }

  async function handleAssignRecipeToDay(recipe: Recipe) {
    if (!assigningDay) return
    const { slot, dateStr, dayLabel } = assigningDay
    const actionId = `assign-day:${recipe.id}:${dateStr}`
    setPlannedMealActionId(actionId)

    try {
      const { error } = await supabase.from('recipe_meal_plans').upsert(
        [{
          recipe_id: recipe.id,
          slot,
          planned_for: dateStr,
          notes: null,
        }],
        { onConflict: 'recipe_id,slot' },
      )
      if (error) throw error

      if (slot === 'tonight') {
        const prepTime = recipe.cook_time ? `${recipe.cook_time} prep` : '25m prep'
        const plan: DinnerPlan = {
          mode: 'cook',
          title: recipe.name,
          subtitle: `${prepTime} · Pantry stock confirmed · Chef: Jake & Kelly`,
          targetTime: '6:30 PM Target',
          recipeId: recipe.id,
          chefOrDriver: 'Jake & Kelly',
          statusBadge: 'Ingredients ready',
          updatedAt: new Date().toISOString(),
        }
        useAppStore.getState().setDinnerPlan(plan)
        void saveTonightDinnerPlan(plan)
      }

      await refetchMealPlans()
      setAssigningDay(null)
      showToast({
        message: `Assigned "${recipe.name}" for ${dayLabel}.`,
        tone: 'success',
      })
    } catch (error) {
      showToast({
        message: formatSupabaseError(error, 'Could not assign meal for day'),
        tone: 'danger',
      })
    } finally {
      setPlannedMealActionId(null)
    }
  }

  async function undoScheduleMeal(recipe: Recipe, assignedSlot: (typeof SLOT_ORDER)[number], previousSlot?: (typeof SLOT_ORDER)[number]) {
    try {
      await supabase
        .from('recipe_meal_plans')
        .delete()
        .eq('recipe_id', recipe.id)
        .eq('slot', assignedSlot)

      if (previousSlot) {
        await supabase.from('recipe_meal_plans').upsert(
          [{
            recipe_id: recipe.id,
            slot: previousSlot,
            planned_for: new Date().toISOString(),
            notes: null,
          }],
          { onConflict: 'recipe_id,slot' },
        )
      }
      await refetchMealPlans()
      setToastState(null)
      showToast({
        message: previousSlot
          ? `Restored "${recipe.name}" to ${SLOT_LABELS[previousSlot]}.`
          : `Removed "${recipe.name}" from schedule.`,
        tone: 'info',
        duration: 4000,
      })
    } catch (error) {
      showToast({
        message: formatSupabaseError(error, 'Could not undo schedule change'),
        tone: 'danger',
      })
    }
  }

  async function moveOrSwapWeeklyMeal(sourceDateStr: string, targetDateStr: string) {
    if (!sourceDateStr || !targetDateStr || sourceDateStr === targetDateStr) return

    const sourceMeal = weekDayMeals.find((w) => w.day.dateStr === sourceDateStr)
    const targetMeal = weekDayMeals.find((w) => w.day.dateStr === targetDateStr)
    if (!sourceMeal || !sourceMeal.recipe) return

    const actionId = `drag-reorder:${sourceDateStr}:${targetDateStr}`
    setPlannedMealActionId(actionId)

    const recipeA = sourceMeal.recipe
    const recipeB = targetMeal?.recipe ?? null

    try {
      if (recipeB && targetMeal) {
        // Swap recipeA and recipeB between the two days
        await supabase
          .from('recipe_meal_plans')
          .delete()
          .in('recipe_id', [recipeA.id, recipeB.id])

        await supabase.from('recipe_meal_plans').upsert([
          {
            recipe_id: recipeA.id,
            slot: targetMeal.day.slot,
            planned_for: targetMeal.day.dateStr,
            notes: null,
          },
          {
            recipe_id: recipeB.id,
            slot: sourceMeal.day.slot,
            planned_for: sourceMeal.day.dateStr,
            notes: null,
          },
        ])

        if (targetMeal.day.isToday || targetMeal.day.slot === 'tonight') {
          const prepTime = recipeA.cook_time ? `${recipeA.cook_time} prep` : '25m prep'
          const plan: DinnerPlan = {
            mode: 'cook',
            title: recipeA.name,
            subtitle: `${prepTime} · Pantry stock confirmed · Chef: Jake & Kelly`,
            targetTime: '6:30 PM Target',
            recipeId: recipeA.id,
            chefOrDriver: 'Jake & Kelly',
            statusBadge: 'Ingredients ready',
            updatedAt: new Date().toISOString(),
          }
          useAppStore.getState().setDinnerPlan(plan)
          void saveTonightDinnerPlan(plan)
        } else if (sourceMeal.day.isToday || sourceMeal.day.slot === 'tonight') {
          const prepTime = recipeB.cook_time ? `${recipeB.cook_time} prep` : '25m prep'
          const plan: DinnerPlan = {
            mode: 'cook',
            title: recipeB.name,
            subtitle: `${prepTime} · Pantry stock confirmed · Chef: Jake & Kelly`,
            targetTime: '6:30 PM Target',
            recipeId: recipeB.id,
            chefOrDriver: 'Jake & Kelly',
            statusBadge: 'Ingredients ready',
            updatedAt: new Date().toISOString(),
          }
          useAppStore.getState().setDinnerPlan(plan)
          void saveTonightDinnerPlan(plan)
        }

        if (swapAnimationTimeoutRef.current) clearTimeout(swapAnimationTimeoutRef.current)
        setJustSwappedDates({ dates: [sourceDateStr, targetDateStr], type: 'swap' })
        swapAnimationTimeoutRef.current = setTimeout(() => {
          setJustSwappedDates(null)
        }, 1600)

        await refetchMealPlans()
        showToast({
          message: `Swapped "${recipeA.name}" and "${recipeB.name}".`,
          tone: 'success',
          actionLabel: 'Undo',
          onAction: () => {
            void moveOrSwapWeeklyMeal(targetDateStr, sourceDateStr)
          },
        })
      } else if (targetMeal) {
        // Move recipeA to the empty target day
        await supabase
          .from('recipe_meal_plans')
          .delete()
          .eq('recipe_id', recipeA.id)
          .eq('slot', sourceMeal.day.slot)

        await supabase.from('recipe_meal_plans').upsert([
          {
            recipe_id: recipeA.id,
            slot: targetMeal.day.slot,
            planned_for: targetMeal.day.dateStr,
            notes: null,
          },
        ])

        if (targetMeal.day.isToday || targetMeal.day.slot === 'tonight') {
          const prepTime = recipeA.cook_time ? `${recipeA.cook_time} prep` : '25m prep'
          const plan: DinnerPlan = {
            mode: 'cook',
            title: recipeA.name,
            subtitle: `${prepTime} · Pantry stock confirmed · Chef: Jake & Kelly`,
            targetTime: '6:30 PM Target',
            recipeId: recipeA.id,
            chefOrDriver: 'Jake & Kelly',
            statusBadge: 'Ingredients ready',
            updatedAt: new Date().toISOString(),
          }
          useAppStore.getState().setDinnerPlan(plan)
          void saveTonightDinnerPlan(plan)
        }

        if (swapAnimationTimeoutRef.current) clearTimeout(swapAnimationTimeoutRef.current)
        setJustSwappedDates({ dates: [sourceDateStr, targetDateStr], type: 'move' })
        swapAnimationTimeoutRef.current = setTimeout(() => {
          setJustSwappedDates(null)
        }, 1600)

        await refetchMealPlans()
        showToast({
          message: `Moved "${recipeA.name}" to ${targetMeal.day.dayName} (${targetMeal.day.formattedDate}).`,
          tone: 'success',
          actionLabel: 'Undo',
          onAction: () => {
            void moveOrSwapWeeklyMeal(targetDateStr, sourceDateStr)
          },
        })
      }
    } catch (error) {
      showToast({
        message: formatSupabaseError(error, 'Could not move meal'),
        tone: 'danger',
      })
    } finally {
      setPlannedMealActionId(null)
    }
  }

  function handleHorizonDragStart(e: React.DragEvent, dateStr: string, isAssigned: boolean) {
    if (!isAssigned) return
    e.dataTransfer.setData('text/plain', dateStr)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingHorizonDateStr(dateStr)
  }

  function handleHorizonDragOver(e: React.DragEvent, dateStr: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverHorizonDateStr !== dateStr) {
      setDragOverHorizonDateStr(dateStr)
    }
  }

  function handleHorizonDragLeave(_e: React.DragEvent, dateStr: string) {
    if (dragOverHorizonDateStr === dateStr) {
      setDragOverHorizonDateStr(null)
    }
  }

  function handleHorizonDrop(e: React.DragEvent, targetDateStr: string) {
    e.preventDefault()
    const sourceDateStr = e.dataTransfer.getData('text/plain') || draggingHorizonDateStr
    setDraggingHorizonDateStr(null)
    setDragOverHorizonDateStr(null)
    if (sourceDateStr && targetDateStr && sourceDateStr !== targetDateStr) {
      void moveOrSwapWeeklyMeal(sourceDateStr, targetDateStr)
    }
  }

  function handleHorizonTouchStart(dateStr: string, isAssigned: boolean) {
    if (!isAssigned) return
    touchDragSourceDateStrRef.current = dateStr
    setDraggingHorizonDateStr(dateStr)
  }

  function handleHorizonTouchMove(e: React.TouchEvent) {
    if (!touchDragSourceDateStrRef.current) return
    const touch = e.touches[0]
    if (!touch) return
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    if (el?.closest('[data-horizon-upcoming-drawer]')) {
      setHorizonExpanded(true)
    }
    const dayCard = el?.closest('[data-horizon-date]')
    const targetDateStr = dayCard?.getAttribute('data-horizon-date')
    if (targetDateStr && targetDateStr !== dragOverHorizonDateStr) {
      setDragOverHorizonDateStr(targetDateStr)
    }
  }

  function handleHorizonTouchEnd() {
    const source = touchDragSourceDateStrRef.current
    const target = dragOverHorizonDateStr
    touchDragSourceDateStrRef.current = null
    setDraggingHorizonDateStr(null)
    setDragOverHorizonDateStr(null)
    if (source && target && source !== target) {
      void moveOrSwapWeeklyMeal(source, target)
    }
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
      const { insertedCount, insertedIds } = await insertUniqueGroceryItems(listId, items)

      if (insertedCount > 0) {
        showToast({
          message: `Added ${insertedCount} ingredient${insertedCount === 1 ? '' : 's'} from "${recipe.name}" to cart.`,
          tone: 'success',
          actionLabel: 'Undo',
          onAction: () => {
            void undoAddGroceries(insertedIds, recipe.name)
          },
        })
      } else {
        showToast({
          message: `All ingredients from "${recipe.name}" are already in your cart.`,
          tone: 'info',
        })
      }
    } catch (error) {
      showToast({
        message: formatSupabaseError(error, 'Could not add ingredients to cart'),
        tone: 'danger',
      })
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

  async function deleteMealPlannerTemplate(templateId: string) {
    try {
      const nextTemplates = mealPlannerTemplates.filter((t) => t.id !== templateId)
      await persistMealPlannerTemplates(nextTemplates)
      setMealPlannerStatus('Deleted template.')
    } catch (error) {
      setMealPlannerError(formatSupabaseError(error, 'Could not delete template'))
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
      const { insertedCount: inserted } = await insertUniqueGroceryItems(
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

      const tonightRow = rows.find((r) => r.slot === 'tonight')
      if (tonightRow) {
        const rec = recipeById.get(tonightRow.recipe_id)
        if (rec) {
          const prepTime = rec.cook_time ? `${rec.cook_time} prep` : '25m prep'
          const plan: DinnerPlan = {
            mode: 'cook',
            title: rec.name,
            subtitle: `${prepTime} · Pantry stock confirmed · Chef: Jake & Kelly`,
            targetTime: '6:30 PM Target',
            recipeId: rec.id,
            chefOrDriver: 'Jake & Kelly',
            statusBadge: 'Ingredients ready',
            updatedAt: new Date().toISOString(),
          }
          useAppStore.getState().setDinnerPlan(plan)
          void saveTonightDinnerPlan(plan)
        }
      }

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

  async function addRecipeToNextAvailableSlot(recipe: Recipe) {
    const alreadyScheduled = weekDayMeals.find((w) => w.recipe?.id === recipe.id)
    if (alreadyScheduled) {
      if (alreadyScheduled.plan) {
        await removePlannedMeal(alreadyScheduled.plan, recipe)
        showToast({
          message: `Removed "${recipe.name}" from ${alreadyScheduled.day.dayName} (${alreadyScheduled.day.formattedDate}).`,
          tone: 'info',
          actionLabel: 'Undo',
          onAction: () => {
            void addRecipeToNextAvailableSlot(recipe)
          },
        })
      }
      return
    }

    const nextAvailable = weekDayMeals.find((w) => !w.recipe)
    if (!nextAvailable) {
      showToast({
        message: `All 7 days on the Weekly Horizon are filled. Use "Swap" on a day card to replace a meal.`,
        tone: 'info',
      })
      return
    }

    const { day } = nextAvailable
    const actionId = `quick-plan:${recipe.id}:${day.slot}:${day.dateStr}`
    setPlannedMealActionId(actionId)

    try {
      const { error } = await supabase.from('recipe_meal_plans').upsert(
        [{
          recipe_id: recipe.id,
          slot: day.slot,
          planned_for: day.dateStr,
          notes: null,
        }],
        { onConflict: 'recipe_id,slot' },
      )
      if (error) throw error

      if (day.slot === 'tonight' || day.isToday) {
        const prepTime = recipe.cook_time ? `${recipe.cook_time} prep` : '25m prep'
        const plan: DinnerPlan = {
          mode: 'cook',
          title: recipe.name,
          subtitle: `${prepTime} · Pantry stock confirmed · Chef: Jake & Kelly`,
          targetTime: '6:30 PM Target',
          recipeId: recipe.id,
          chefOrDriver: 'Jake & Kelly',
          statusBadge: 'Ingredients ready',
          updatedAt: new Date().toISOString(),
        }
        useAppStore.getState().setDinnerPlan(plan)
        void saveTonightDinnerPlan(plan)
      }

      await refetchMealPlans()
      showToast({
        message: `Added "${recipe.name}" to ${day.dayName} (${day.formattedDate}).`,
        tone: 'success',
        actionLabel: 'Undo',
        onAction: () => {
          void undoScheduleMeal(recipe, day.slot)
        },
      })
    } catch (error) {
      showToast({
        message: formatSupabaseError(error, 'Could not schedule meal'),
        tone: 'danger',
      })
    } finally {
      setPlannedMealActionId(null)
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

      const imageUrl = await resolvePhotoEditorImageUrl(cookRecipe.id)
      const { error: recipeError } = await supabase
        .from('recipes')
        .update({
          name: cleanedName,
          instructions_text: cleanedSteps.map((step) => `${step.step_number}. ${step.instruction}`).join('\n'),
          last_used_at: new Date().toISOString(),
          ...(imageUrl !== undefined ? { image_url: imageUrl } : {}),
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
      clearPhotoEditorPendingFile()
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

  function initializePhotoEditorDraft(recipe: Recipe) {
    clearPhotoEditorPendingFile()
    const focus = parseRecipeImageFocus(recipe.image_url)
    setPhotoEditorUrl(pickRecipeThumb(recipe) ?? '')
    setPhotoEditorPreviewUrl('')
    setPhotoEditorPendingFile(null)
    setPhotoEditorDirty(false)
    setPhotoEditorExpanded(false)
    setPhotoSearchQuery(recipe.name)
    setPhotoEditorFocalX(focus.focalX)
    setPhotoEditorFocalY(focus.focalY)
    setPhotoEditorUploading(false)
    setPhotoEditorError(null)
    setPhotoSearchResults([])
    setPhotoSearchError(null)
  }

  function clearPhotoEditorPendingFile() {
    if (photoEditorObjectUrlRef.current) {
      URL.revokeObjectURL(photoEditorObjectUrlRef.current)
      photoEditorObjectUrlRef.current = null
    }
    setPhotoEditorPreviewUrl('')
    setPhotoEditorPendingFile(null)
  }

  function stagePhotoEditorImage(file: File) {
    if (!isLikelyImageFile(file)) {
      setPhotoEditorError('Please choose an image file.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setPhotoEditorError('Photo is too large. Please use an image under 10MB.')
      return
    }
    clearPhotoEditorPendingFile()
    const previewUrl = URL.createObjectURL(file)
    photoEditorObjectUrlRef.current = previewUrl
    setPhotoEditorPreviewUrl(previewUrl)
    setPhotoEditorPendingFile(file)
    setPhotoEditorDirty(true)
    setPhotoEditorFocalX(50)
    setPhotoEditorFocalY(42)
    setPhotoEditorError(null)
  }

  function handlePhotoEditorFileSelection(files: File[], source: 'upload' | 'camera') {
    const first = files[0]
    if (!first) {
      if (source === 'camera') setPhotoEditorError('No photo captured. Please try again.')
      return
    }
    stagePhotoEditorImage(first)
  }

  function handlePhotoEditorPaste(event: ClipboardEvent<HTMLDivElement>) {
    const imageItem = Array.from(event.clipboardData.items)
      .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
    if (!imageItem) return
    const file = imageItem.getAsFile()
    if (!file) return
    event.preventDefault()
    stagePhotoEditorImage(file)
  }

  function setPhotoEditorRemoteUrl(url: string) {
    clearPhotoEditorPendingFile()
    setPhotoEditorUrl(url)
    setPhotoEditorDirty(true)
    setPhotoEditorError(null)
  }

  async function resolvePhotoEditorImageUrl(recipeId: string): Promise<string | undefined> {
    if (!photoEditorDirty) return undefined
    let candidate = photoEditorUrl.trim()
    if (photoEditorPendingFile) {
      setPhotoEditorUploading(true)
      try {
        const buffer = await photoEditorPendingFile.arrayBuffer()
        const base64 = arrayBufferToBase64(buffer)
        const mimeType = photoEditorPendingFile.type || 'image/jpeg'
        const { data, error } = await supabase.functions.invoke('recipe-photo-upload', {
          body: {
            recipe_id: recipeId,
            file_name: photoEditorPendingFile.name || `pasted-recipe-${Date.now()}.png`,
            file_base64: base64,
            mime_type: mimeType,
          },
        })
        if (error) throw error
        candidate = String(data?.url ?? '').trim()
        if (!candidate) throw new Error('Uploaded photo URL missing')
      } catch (error) {
        const message = formatSupabaseError(error, 'Could not upload photo')
        setPhotoEditorError(message)
        throw new Error(message, { cause: error })
      } finally {
        setPhotoEditorUploading(false)
      }
    }
    try {
      const parsed = new URL(candidate)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Use an http(s) image URL')
      }
    } catch {
      setPhotoEditorError('Please paste a valid image URL')
      throw new Error('Please paste a valid image URL')
    }
    setPhotoEditorError(null)
    return encodeRecipeImageUrl(candidate, photoEditorFocalX, photoEditorFocalY)
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

  if (cookRecipe && !isRecipeEditMode) {
    return (
      <ActiveKitchenWorkbench
        recipe={cookRecipe}
        ingredients={cookIngredients.map((ingredient, index) => ({
          id: `${cookRecipe.id}-${ingredient.sort_order ?? index}`,
          name: ingredient.name,
          quantity: ingredient.quantity,
          unit: ingredient.unit,
          raw_text: ingredient.raw_text,
          sort_order: ingredient.sort_order ?? index,
        }))}
        steps={cookSteps}
        initialStepIndex={stepIndex}
        onExit={closeCookRecipe}
        onEditRecipe={startRecipeEditing}
        onDeleteRecipe={() => {
          void deleteRecipe(cookRecipe)
          closeCookRecipe()
        }}
        onSaveRating={(rating) => {
          void appendMealPlannerActionLog({
            action: 'cook_complete',
            status: 'success',
            detail: `Rated ${cookRecipe.name} with ${rating} stars.`,
            trace_id: mealPlannerLastTraceId,
          })
        }}
        onCompleteMeal={() => {
          const tonightPlan = mealPlans.find((m) => m.recipe_id === cookRecipe.id && m.slot === 'tonight')
          if (tonightPlan) {
            void markPlannedMealCooked(tonightPlan, cookRecipe)
          }
          closeCookRecipe()
        }}
      />
    )
  }

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y bg-casa-bg">
      {/* ── Dedicated Mobile Basic Cooking Mode (< lg) ── */}
      <div className="lg:hidden w-full h-full overflow-y-auto">
        <MobileCookingView
          onOpenImport={openImportDialog}
          catalogRecipes={fullRecipes}
        />
      </div>

      {/* ── Desktop & Large Kiosk Meal & Kitchen Workbench (>= lg) ── */}
      <div className="hidden lg:block w-full">
        <PageShell width="full" className="space-y-8 p-4 sm:p-6 lg:p-8 pb-36 lg:pb-16 text-casa-text">
          {/* ── Open Atelier Masthead & Mode Switcher (No outer card) ── */}
          <div className="space-y-4 pb-6 border-b border-casa-border/50">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-casa-gold/20 text-casa-navy text-caption font-mono font-bold tracking-wider uppercase border border-casa-gold/30">
                    <Sparkles size={11} className="text-casa-gold" />
                    The Tabor Kitchen &amp; Atelier
                  </span>
                  <span className="text-caption text-casa-muted font-mono font-medium hidden sm:inline">
                    Palm Beach Residence
                  </span>
                </div>
                <Heading role="display-sm" className="font-display text-display-sm font-bold text-casa-navy mt-1 tracking-tight">
                  {cookLandingMode === 'cook-now' ? 'What are we feeling tonight?' : 'Weekly Dinner Planner & Atelier'}
                </Heading>
              </div>

              {/* Quick Navigation Action Pills */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/settings/food-profile')}
                  leadingIcon={<Users size={14} className="text-casa-gold" />}
                  className="text-body-sm font-semibold text-casa-navy hover:text-casa-gold min-h-control bg-casa-surface/90 border-casa-border shadow-2xs"
                >
                  Food Profile
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/settings/pantry-inventory')}
                  leadingIcon={<Layers size={14} className="text-casa-gold" />}
                  className="text-body-sm font-semibold text-casa-navy hover:text-casa-gold min-h-control bg-casa-surface/90 border-casa-border shadow-2xs"
                >
                  Pantry Inventory
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/grocery')}
                  leadingIcon={<ShoppingCart size={14} className="text-casa-gold" />}
                  className="text-body-sm font-semibold text-casa-navy hover:text-casa-gold min-h-control bg-casa-surface/90 border-casa-border shadow-2xs"
                >
                  Shopping List
                </Button>
              </div>
            </div>

            {/* Mode Switcher & Context Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
              <SegmentedControl
                aria-label="Cook view"
                value={cookLandingMode}
                onChange={setCookLandingMode}
                options={[
                  { value: 'cook-now', label: 'Cook tonight', icon: <Utensils size={15} /> },
                  { value: 'plan-week', label: 'Plan the week', icon: <Sparkles size={15} className="text-casa-gold" /> },
                ]}
                className="min-w-[18rem]"
              />

              <p className="text-caption text-casa-muted font-medium">
                {cookLandingMode === 'cook-now'
                  ? landingMetaLabel
                  : `Household of ${foodProfile.householdSize} · $${foodProfile.weeklyBudgetUsd}/week budget · ${foodProfile.defaultMealsPerWeek} meals`}
              </p>
            </div>
          </div>

          {/* ── COOK TONIGHT: DUAL-PANE UPPER MASTER STAGE (60/40 Split) ── */}
          {cookLandingMode === 'cook-now' && (
            <div className="grid grid-cols-12 gap-8 items-start">
              {/* ── LEFT COLUMN (60%): TONIGHT'S CINEMATIC STAGE & ACTIVE SESSION ── */}
              <div className="col-span-12 lg:col-span-7 xl:col-span-7 space-y-5">
                {/* Active Session (Jump Back In) */}
                {resumeRecipe && (
                  <Card
                    tone="ambient"
                    padding="md"
                    className="border-casa-gold/40 shadow-widget cursor-pointer hover:border-casa-gold transition-all rounded-3xl"
                    onClick={() => {
                      openRecipeForCookMode(resumeRecipe.recipe.id)
                      setStepIndex(
                        Math.max(
                          0,
                          Math.min(resumeRecipe.progress.stepIndex, Math.max(0, resumeRecipe.progress.totalSteps - 1)),
                        ),
                      )
                    }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-casa-gold animate-pulse" />
                          <span className="text-caption font-mono font-bold uppercase tracking-widest text-amber-800">
                            Active Session · Jump Back In
                          </span>
                          <span className="text-caption font-mono font-bold px-2.5 py-0.5 rounded-full bg-casa-surface text-casa-navy border border-casa-border shadow-2xs">
                            Step {resumeRecipe.progress.stepIndex + 1} of {resumeRecipe.progress.totalSteps}
                          </span>
                        </div>
                        <p className="font-display text-heading font-bold text-casa-navy">
                          {resumeRecipe.recipe.name}
                        </p>
                        {resumeRecentLabel && (
                          <p className="text-caption text-casa-muted">Recent history: {resumeRecentLabel}</p>
                        )}
                      </div>
                      <Button
                        variant="champagne"
                        size="md"
                        className="font-bold min-h-control px-6 shrink-0"
                      >
                        Resume Cooking →
                      </Button>
                    </div>
                    <Progress
                      value={resumeRecipe.progress.stepIndex + 1}
                      max={Math.max(1, resumeRecipe.progress.totalSteps)}
                      aria-label="Saved cooking progress"
                      className="mt-3.5 [&_.casa-progress]:h-2"
                    />
                  </Card>
                )}

                {/* The Michelin Plinth: Tonight's Feature Pick (The Singular Hero Plinth) */}
                {moodShortlistRecipes.length > 0 ? (
                  (() => {
                    const topInsight = moodShortlistRecipes[0]
                    const focus = parseRecipeImageFocus(topInsight.recipe.image_url)
                    const minutesLabel = topInsight.minutes ? `${topInsight.minutes} min` : (topInsight.recipe.cook_time ?? 'Quick cook')
                    const approvalLabel = buildTopPickApproval(topInsight)

                    return (
                      <Card
                        padding="none"
                        tone="ambient"
                        className="flex flex-col overflow-hidden transition-all group shadow-widget rounded-3xl border-casa-gold/50 ring-2 ring-casa-gold/60 relative"
                      >
                        {/* Crown Plinth Banner */}
                        <div className="bg-gradient-to-r from-casa-gold/35 via-casa-gold/20 to-transparent px-5 py-3 text-caption font-mono font-bold uppercase tracking-widest text-casa-navy border-b border-casa-gold/30 flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <Sparkles size={14} className="text-casa-gold animate-pulse" />
                            Tonight's Feature Plinth · Curated for the Tabor Kitchen
                          </span>
                          <span className="text-caption font-mono font-bold text-amber-900/80 px-2 py-0.5 rounded-full bg-casa-gold/20 border border-casa-gold/30">
                            Top Pick
                          </span>
                        </div>

                        {/* Expansive 16:9 Photography */}
                        <div className="relative overflow-hidden bg-casa-surface aspect-[16/9] w-full">
                          <RecipeImage
                            src={getRecipeImage(topInsight.recipe)}
                            alt={topInsight.recipe.name}
                            focalX={focus.focalX}
                            focalY={focus.focalY}
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-103"
                          />
                          <div className="absolute top-3 right-3 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-casa-surface/95 backdrop-blur-md text-casa-navy text-caption font-mono font-bold border border-casa-border/80 shadow-card">
                              <Clock3 size={13} className="text-casa-gold" />
                              {minutesLabel}
                            </span>
                          </div>
                        </div>

                        {/* Plinth Body */}
                        <div className="p-6 flex flex-col flex-1 gap-4">
                          <div>
                            <Heading role="heading" className="font-display font-bold leading-tight text-casa-navy text-heading sm:text-display-xs">
                              {topInsight.recipe.name}
                            </Heading>
                            <div className="mt-2.5 flex flex-wrap items-center gap-2">
                              <Chip tone="neutral" size="sm" icon={<Users size={13} />}>
                                {topInsight.recipe.servings ? `${topInsight.recipe.servings} Servings` : '4 Servings'}
                              </Chip>
                              {approvalLabel && (
                                <Chip tone="success" size="sm" icon={<CheckCircle2 size={13} />}>
                                  {approvalLabel}
                                </Chip>
                              )}
                            </div>
                            <p className="mt-3 text-body-sm text-casa-text-secondary line-clamp-2 leading-relaxed italic border-l-2 border-casa-gold pl-3 py-0.5">
                              "{buildMoodReason(topInsight)}"
                            </p>
                          </div>

                          {/* Action Bar */}
                          <div className="mt-auto pt-2 flex items-center gap-3">
                            <Button
                              onClick={() => openRecipeForCookMode(topInsight.recipe.id)}
                              variant="champagne"
                              className="mt-auto"
                              size="lg"
                              fullWidth
                            >
                              Start cooking
                            </Button>
                            <IconButton
                              icon={<ShoppingCart size={16} />}
                              variant="secondary"
                              size="lg"
                              onClick={() => void smartAddIngredientsToShoppingList(topInsight.recipe)}
                              disabled={smartAddingRecipeId === topInsight.recipe.id}
                              title="Smart add ingredients to grocery list"
                              aria-label={`Add ingredients for ${topInsight.recipe.name} to shopping list`}
                              className="shrink-0 bg-casa-surface border-casa-border hover:border-casa-gold size-control-lg shadow-2xs"
                            />
                          </div>
                        </div>
                      </Card>
                    )
                  })()
                ) : (
                  <Card tone="subtle" padding="lg" className="text-center space-y-3 border-dashed border-casa-border rounded-3xl">
                    <Text>Import recipes from your library or URL to unlock your mood-based shortlist.</Text>
                    <Button
                      onClick={openImportDialog}
                      variant="champagne"
                      size="md"
                      leadingIcon={<Upload size={16} />}
                      className="font-bold min-h-control"
                    >
                      Import recipe
                    </Button>
                  </Card>
                )}
              </div>

              {/* ── RIGHT COLUMN (40%): OPEN AGENDA & RHYTHM SHORTLIST (No heavy outer cards) ── */}
              <div className="col-span-12 lg:col-span-5 xl:col-span-5 space-y-6">
                {/* The Weekly Horizon: 7-Day Day-of-Week Schedule */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-casa-border/50">
                    <div>
                      <Heading role="heading" className="font-display text-body-lg font-bold text-casa-navy">
                        The Weekly Horizon
                      </Heading>
                      <p className="text-caption text-casa-text-secondary">
                        7-day family dinner schedule.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCookLandingMode('plan-week')}
                        leadingIcon={<Sparkles size={13} className="text-casa-gold" />}
                        className="text-caption font-bold text-casa-gold hover:text-amber-800 p-0"
                      >
                        AI Plan Week
                      </Button>
                      <span className="text-caption font-mono font-bold px-2.5 py-0.5 rounded-full bg-casa-surface border border-casa-border text-casa-navy shadow-2xs">
                        {weekDayMeals.filter((w) => Boolean(w.recipe)).length} / 7 Set
                      </span>
                    </div>
                  </div>

                  {plannedMealError && (
                    <Alert tone="danger" title="Planned meals update failed" className="shadow-sm">
                      {plannedMealError}
                    </Alert>
                  )}
                  {!plannedMealError && plannedMealStatus && (
                    <Alert tone="success" title="Planned meals updated" className="shadow-sm">
                      {plannedMealStatus}
                    </Alert>
                  )}

                  <div className="space-y-2.5" onTouchMove={handleHorizonTouchMove}>
                    {/* Primary Focus: Today & Tomorrow */}
                    {weekDayMeals.slice(0, 2).map(({ day, plan, recipe }) => {
                      const isAssigned = Boolean(plan && recipe)
                      const isToday = day.isToday
                      const isDragging = draggingHorizonDateStr === day.dateStr
                      const isDragOver = dragOverHorizonDateStr === day.dateStr && draggingHorizonDateStr !== day.dateStr
                      const isJustSwapped = justSwappedDates?.dates.includes(day.dateStr)

                      return (
                        <motion.div
                          layout
                          key={day.dateStr}
                          data-horizon-date={day.dateStr}
                          draggable={isAssigned}
                          onDragStartCapture={(e) => handleHorizonDragStart(e as unknown as React.DragEvent, day.dateStr, isAssigned)}
                          onDragOverCapture={(e) => handleHorizonDragOver(e as unknown as React.DragEvent, day.dateStr)}
                          onDragLeaveCapture={(e) => handleHorizonDragLeave(e as unknown as React.DragEvent, day.dateStr)}
                          onDropCapture={(e) => handleHorizonDrop(e as unknown as React.DragEvent, day.dateStr)}
                          onTouchEnd={handleHorizonTouchEnd}
                          initial={false}
                          animate={
                            isJustSwapped
                              ? {
                                  scale: [1, 1.015, 0.995, 1],
                                  transition: { duration: 0.65, ease: 'easeOut' },
                                }
                              : isDragging
                              ? { scale: 0.97, opacity: 0.45 }
                              : { scale: 1, opacity: 1 }
                          }
                          transition={{
                            layout: { type: 'spring', stiffness: 350, damping: 26 },
                          }}
                          className={cn(
                            'p-3 rounded-2xl border transition-colors duration-200 select-none relative overflow-hidden',
                            isJustSwapped && 'border-casa-gold ring-2 ring-inset ring-casa-gold/60 bg-casa-gold/10 shadow-sm',
                            isDragging && 'border-dashed border-casa-gold/60',
                            isDragOver && 'border-casa-gold ring-2 ring-inset ring-casa-gold/70 bg-casa-gold/15 shadow-sm',
                            !isJustSwapped && !isDragging && !isDragOver && (
                              isToday
                                ? 'bg-casa-surface border-casa-gold/60 shadow-subtle ring-1 ring-casa-gold/30'
                                : isAssigned
                                ? 'bg-casa-surface/80 border-casa-border/80 hover:border-casa-border hover:shadow-2xs'
                                : 'bg-casa-bg/60 border-dashed border-casa-border/70 hover:border-casa-gold/40'
                            )
                          )}
                        >
                          {/* Radiant Sheen Beam on Swap */}
                          {isJustSwapped && (
                            <motion.div
                              initial={{ x: '-100%' }}
                              animate={{ x: '200%' }}
                              transition={{ duration: 0.85, ease: 'easeInOut' }}
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-casa-gold/30 to-transparent pointer-events-none -skew-x-12 z-10"
                            />
                          )}

                          <div className="flex items-center justify-between gap-2 mb-2 relative z-0">
                            <div className="flex items-center gap-2">
                              {isAssigned && (
                                <div
                                  onTouchStart={() => handleHorizonTouchStart(day.dateStr, isAssigned)}
                                  className="touch-none cursor-grab active:cursor-grabbing p-1 -ml-1 text-casa-muted/60 hover:text-casa-navy transition-colors shrink-0 flex items-center justify-center"
                                  title="Drag with finger or mouse to move or swap day"
                                  aria-label="Drag recipe to reorder day"
                                >
                                  <GripVertical size={16} />
                                </div>
                              )}
                              <span
                                className={cn(
                                  'text-caption font-mono font-bold px-2 py-0.5 rounded-md uppercase tracking-wider',
                                  isToday
                                    ? 'bg-casa-gold/20 text-casa-navy border border-casa-gold/40'
                                    : 'bg-casa-surface border border-casa-border/60 text-casa-muted'
                                )}
                              >
                                {isToday ? `Today · ${day.formattedDate}` : `${day.dayName} · ${day.formattedDate}`}
                              </span>

                              <AnimatePresence>
                                {isJustSwapped && (
                                  <motion.span
                                    initial={{ opacity: 0, scale: 0.6, x: -6 }}
                                    animate={{ opacity: 1, scale: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.6, x: -6 }}
                                    transition={{ duration: 0.25 }}
                                    className="inline-flex items-center gap-1 text-2xs font-mono font-bold px-2 py-0.5 rounded-full bg-casa-gold text-white shadow-2xs"
                                  >
                                    {justSwappedDates?.type === 'swap' ? '⇄ Swapped' : '✓ Moved'}
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </div>
                            {isAssigned && recipe?.cook_time && (
                              <span className="inline-flex items-center gap-1 text-2xs font-mono text-casa-muted">
                                <Clock3 size={11} className="text-casa-gold" />
                                {recipe.cook_time}
                              </span>
                            )}
                          </div>

                          {isAssigned && recipe ? (
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                {recipe.image_url && (
                                  <img
                                    src={recipe.image_url}
                                    alt={recipe.name}
                                    className="w-11 h-11 rounded-xl object-cover border border-casa-border shrink-0"
                                  />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="font-display text-body-sm font-bold text-casa-navy truncate">
                                    {recipe.name}
                                  </p>
                                  <p className="text-2xs text-casa-muted truncate">
                                    {recipe.servings ? `${recipe.servings} serv` : 'Family size'} · Chef: Jake & Kelly
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {isToday ? (
                                  <Button
                                    variant="champagne"
                                    size="sm"
                                    onClick={() => openRecipeForCookMode(recipe.id)}
                                    className="font-bold min-h-[32px] px-3 text-caption shadow-2xs"
                                  >
                                    Cook
                                  </Button>
                                ) : (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openRecipeForCookMode(recipe.id)}
                                    className="font-semibold min-h-[32px] px-2.5 text-caption text-casa-navy hover:text-casa-gold"
                                  >
                                    View
                                  </Button>
                                )}
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => plan && void markPlannedMealCooked(plan, recipe)}
                                  disabled={plannedMealActionId !== null}
                                  className="font-semibold min-h-[32px] px-2 text-caption"
                                >
                                  Done
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setAssigningDay({
                                      slot: day.slot,
                                      dateStr: day.dateStr,
                                      dayLabel: `${day.dayName} (${day.formattedDate})`,
                                    })
                                  }
                                  className="font-semibold min-h-[32px] px-2 text-caption text-casa-gold hover:text-amber-800"
                                >
                                  Swap
                                </Button>
                                <IconButton
                                  icon={<Trash2 size={13} />}
                                  variant="danger"
                                  size="sm"
                                  onClick={() => plan && void removePlannedMeal(plan, recipe)}
                                  disabled={plannedMealActionId !== null}
                                  aria-label={`Remove ${recipe.name}`}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2 py-1">
                              <span className="text-caption text-casa-muted italic">No dinner scheduled</span>
                              <div className="flex items-center gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  leadingIcon={<Plus size={13} className="text-casa-gold" />}
                                  onClick={() =>
                                    setAssigningDay({
                                      slot: day.slot,
                                      dateStr: day.dateStr,
                                      dayLabel: `${day.dayName} (${day.formattedDate})`,
                                    })
                                  }
                                  className="text-caption font-bold text-casa-gold hover:text-amber-800 min-h-[30px] px-2.5"
                                >
                                  Assign
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  leadingIcon={<Sparkles size={12} className="text-casa-muted" />}
                                  onClick={() =>
                                    document.dispatchEvent(
                                      new CustomEvent('open-ai-chat', {
                                        detail: {
                                          launchId: crypto.randomUUID(),
                                          agent: 'chef',
                                          source: 'tonights-kitchen',
                                          prompt: `Suggest a delicious weeknight recipe for ${day.dayName} (${day.formattedDate}) using ingredients we already have in our pantry stock.`,
                                          autoSend: true,
                                        },
                                      })
                                    )
                                  }
                                  className="text-2xs font-semibold text-casa-muted hover:text-casa-navy min-h-[30px] px-2"
                                >
                                  AI Suggest
                                </Button>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )
                    })}

                    {/* Collapsible 5-Day Upcoming Horizon */}
                    {weekDayMeals.length > 2 && (
                      <div
                        data-horizon-upcoming-drawer="true"
                        onDragOver={() => {
                          if (!horizonExpanded) setHorizonExpanded(true)
                        }}
                        className="pt-1"
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setHorizonExpanded((prev) => !prev)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setHorizonExpanded((prev) => !prev)
                            }
                          }}
                          className={cn(
                            'w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-all duration-200 text-left min-h-[44px] cursor-pointer select-none',
                            horizonExpanded
                              ? 'bg-casa-surface/90 border-casa-border text-casa-navy'
                              : 'bg-casa-surface/60 border-dashed border-casa-border/80 hover:border-casa-gold/60 hover:bg-casa-surface text-casa-muted'
                          )}
                          aria-expanded={horizonExpanded}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 shrink-0">
                              <CalendarPlus size={13} className="text-casa-gold shrink-0" />
                              <span className="font-display text-caption font-bold text-casa-navy">
                                Upcoming Days (5)
                              </span>
                            </div>

                            {/* Minimal single-letter counts */}
                            <div className="flex items-center gap-1 shrink-0 ml-1 overflow-hidden">
                              {weekDayMeals.slice(2).map(({ day, plan, recipe }) => {
                                const isSet = Boolean(plan && recipe)
                                const letter = day.dayName.charAt(0)
                                return (
                                  <span
                                    key={day.dateStr}
                                    title={`${day.dayName} (${day.formattedDate}): ${isSet ? recipe?.name : 'No meal scheduled'}`}
                                    className={cn(
                                      'inline-flex items-center justify-center gap-0.5 text-2xs font-mono font-bold px-1.5 py-0.5 rounded-md border',
                                      isSet
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200/70'
                                        : 'bg-casa-bg text-casa-muted/70 border-casa-border/60'
                                    )}
                                  >
                                    <span>{letter}</span>
                                    {isSet ? (
                                      <CheckCircle2 size={9} className="text-emerald-600 shrink-0" />
                                    ) : (
                                      <Plus size={8} className="text-casa-muted/60 shrink-0" />
                                    )}
                                  </span>
                                )
                              })}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 text-caption font-semibold text-casa-gold">
                            <span className="text-2xs font-mono text-casa-muted">
                              {weekDayMeals.slice(2).filter((m) => Boolean(m.plan && m.recipe)).length}/5 planned
                            </span>
                            {horizonExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>
                        </div>

                        <AnimatePresence>
                          {horizonExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.3, ease: 'easeInOut' }}
                              className="space-y-2.5 pt-2.5 px-0.5 -mx-0.5"
                            >
                              {weekDayMeals.slice(2).map(({ day, plan, recipe }) => {
                                const isAssigned = Boolean(plan && recipe)
                                const isDragging = draggingHorizonDateStr === day.dateStr
                                const isDragOver = dragOverHorizonDateStr === day.dateStr && draggingHorizonDateStr !== day.dateStr
                                const isJustSwapped = justSwappedDates?.dates.includes(day.dateStr)

                                return (
                                  <motion.div
                                    layout
                                    key={day.dateStr}
                                    data-horizon-date={day.dateStr}
                                    draggable={isAssigned}
                                    onDragStartCapture={(e) => handleHorizonDragStart(e as unknown as React.DragEvent, day.dateStr, isAssigned)}
                                    onDragOverCapture={(e) => handleHorizonDragOver(e as unknown as React.DragEvent, day.dateStr)}
                                    onDragLeaveCapture={(e) => handleHorizonDragLeave(e as unknown as React.DragEvent, day.dateStr)}
                                    onDropCapture={(e) => handleHorizonDrop(e as unknown as React.DragEvent, day.dateStr)}
                                    onTouchEnd={handleHorizonTouchEnd}
                                    initial={false}
                                    animate={
                                      isJustSwapped
                                        ? {
                                            scale: [1, 1.015, 0.995, 1],
                                            transition: { duration: 0.65, ease: 'easeOut' },
                                          }
                                        : isDragging
                                        ? { scale: 0.97, opacity: 0.45 }
                                        : { scale: 1, opacity: 1 }
                                    }
                                    transition={{
                                      layout: { type: 'spring', stiffness: 350, damping: 26 },
                                    }}
                                    className={cn(
                                      'p-3 rounded-2xl border transition-colors duration-200 select-none relative overflow-hidden',
                                      isJustSwapped && 'border-casa-gold ring-2 ring-inset ring-casa-gold/60 bg-casa-gold/10 shadow-sm',
                                      isDragging && 'border-dashed border-casa-gold/60',
                                      isDragOver && 'border-casa-gold ring-2 ring-inset ring-casa-gold/70 bg-casa-gold/15 shadow-sm',
                                      !isJustSwapped && !isDragging && !isDragOver && (
                                        isAssigned
                                          ? 'bg-casa-surface/80 border-casa-border/80 hover:border-casa-border hover:shadow-2xs'
                                          : 'bg-casa-bg/60 border-dashed border-casa-border/70 hover:border-casa-gold/40'
                                      )
                                    )}
                                  >
                                    {isJustSwapped && (
                                      <motion.div
                                        initial={{ x: '-100%' }}
                                        animate={{ x: '200%' }}
                                        transition={{ duration: 0.85, ease: 'easeInOut' }}
                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-casa-gold/30 to-transparent pointer-events-none -skew-x-12 z-10"
                                      />
                                    )}

                                    <div className="flex items-center justify-between gap-2 mb-2 relative z-0">
                                      <div className="flex items-center gap-2">
                                        {isAssigned && (
                                          <div
                                            onTouchStart={() => handleHorizonTouchStart(day.dateStr, isAssigned)}
                                            className="touch-none cursor-grab active:cursor-grabbing p-1 -ml-1 text-casa-muted/60 hover:text-casa-navy transition-colors shrink-0 flex items-center justify-center"
                                            title="Drag with finger or mouse to move or swap day"
                                            aria-label="Drag recipe to reorder day"
                                          >
                                            <GripVertical size={16} />
                                          </div>
                                        )}
                                        <span className="text-caption font-mono font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-casa-surface border border-casa-border/60 text-casa-muted">
                                          {day.dayName} · {day.formattedDate}
                                        </span>

                                        <AnimatePresence>
                                          {isJustSwapped && (
                                            <motion.span
                                              initial={{ opacity: 0, scale: 0.6, x: -6 }}
                                              animate={{ opacity: 1, scale: 1, x: 0 }}
                                              exit={{ opacity: 0, scale: 0.6, x: -6 }}
                                              transition={{ duration: 0.25 }}
                                              className="inline-flex items-center gap-1 text-2xs font-mono font-bold px-2 py-0.5 rounded-full bg-casa-gold text-white shadow-2xs"
                                            >
                                              {justSwappedDates?.type === 'swap' ? '⇄ Swapped' : '✓ Moved'}
                                            </motion.span>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                      {isAssigned && recipe?.cook_time && (
                                        <span className="inline-flex items-center gap-1 text-2xs font-mono text-casa-muted">
                                          <Clock3 size={11} className="text-casa-gold" />
                                          {recipe.cook_time}
                                        </span>
                                      )}
                                    </div>

                                    {isAssigned && recipe ? (
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                          {recipe.image_url && (
                                            <img
                                              src={recipe.image_url}
                                              alt={recipe.name}
                                              className="w-11 h-11 rounded-xl object-cover border border-casa-border shrink-0"
                                            />
                                          )}
                                          <div className="min-w-0 flex-1">
                                            <p className="font-display text-body-sm font-bold text-casa-navy truncate">
                                              {recipe.name}
                                            </p>
                                            <p className="text-2xs text-casa-muted truncate">
                                              {recipe.servings ? `${recipe.servings} serv` : 'Family size'} · Chef: Jake & Kelly
                                            </p>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openRecipeForCookMode(recipe.id)}
                                            className="font-semibold min-h-[32px] px-2.5 text-caption text-casa-navy hover:text-casa-gold"
                                          >
                                            View
                                          </Button>
                                          <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => plan && void markPlannedMealCooked(plan, recipe)}
                                            disabled={plannedMealActionId !== null}
                                            className="font-semibold min-h-[32px] px-2 text-caption"
                                          >
                                            Done
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              setAssigningDay({
                                                slot: day.slot,
                                                dateStr: day.dateStr,
                                                dayLabel: `${day.dayName} (${day.formattedDate})`,
                                              })
                                            }
                                            className="font-semibold min-h-[32px] px-2 text-caption text-casa-gold hover:text-amber-800"
                                          >
                                            Swap
                                          </Button>
                                          <IconButton
                                            icon={<Trash2 size={13} />}
                                            variant="danger"
                                            size="sm"
                                            onClick={() => plan && void removePlannedMeal(plan, recipe)}
                                            disabled={plannedMealActionId !== null}
                                            aria-label={`Remove ${recipe.name}`}
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-between gap-2 py-1">
                                        <span className="text-caption text-casa-muted italic">No dinner scheduled</span>
                                        <div className="flex items-center gap-1.5">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            leadingIcon={<Plus size={13} className="text-casa-gold" />}
                                            onClick={() =>
                                              setAssigningDay({
                                                slot: day.slot,
                                                dateStr: day.dateStr,
                                                dayLabel: `${day.dayName} (${day.formattedDate})`,
                                              })
                                            }
                                            className="text-caption font-bold text-casa-gold hover:text-amber-800 min-h-[30px] px-2.5"
                                          >
                                            Assign
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            leadingIcon={<Sparkles size={12} className="text-casa-muted" />}
                                            onClick={() =>
                                              document.dispatchEvent(
                                                new CustomEvent('open-ai-chat', {
                                                  detail: {
                                                    launchId: crypto.randomUUID(),
                                                    agent: 'chef',
                                                    source: 'tonights-kitchen',
                                                    prompt: `Suggest a delicious weeknight recipe for ${day.dayName} (${day.formattedDate}) using ingredients we already have in our pantry stock.`,
                                                    autoSend: true,
                                                  },
                                                })
                                              )
                                            }
                                            className="text-2xs font-semibold text-casa-muted hover:text-casa-navy min-h-[30px] px-2"
                                          >
                                            AI Suggest
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </motion.div>
                                )
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tonight's Rhythm & Shortlist Alternatives (Open Pill Section) */}
                <div className="space-y-4 pt-5 border-t border-casa-border/50">
                  {/* Mood Header & Selector */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-caption font-bold uppercase tracking-wider text-casa-muted">
                        Tonight's Rhythm ({shortlistHeadingLabel})
                      </span>
                      <Button
                        onClick={() => setShortlistOffsets((current) => ({ ...current, [cookMood]: current[cookMood] + 1 }))}
                        variant="ghost"
                        size="sm"
                        leadingIcon={<RotateCcw size={13} className="text-casa-gold" />}
                        className="font-bold min-h-control text-caption text-casa-gold hover:text-amber-800 p-0"
                      >
                        Shuffle
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {COOK_MOOD_OPTIONS.map((mood) => {
                        const isSelected = cookMood === mood.id
                        return (
                          <Chip
                            key={mood.id}
                            onClick={() => {
                              setCookMood(mood.id)
                              setShortlistOffsets((current) => ({ ...current, [mood.id]: 0 }))
                            }}
                            selected={isSelected}
                            tone={isSelected ? 'accent' : 'neutral'}
                            size="sm"
                            className={cn(
                              'min-h-control-sm text-caption font-semibold transition-all px-3 py-1',
                              isSelected && 'shadow-xs border-casa-gold/70 text-casa-navy font-bold ring-1 ring-casa-gold/30',
                            )}
                          >
                            {mood.label}
                          </Chip>
                        )
                      })}
                    </div>
                  </div>

                  {/* Alternative Shortlist Recommendations (Cards #2 and #3 as Open Rows) */}
                  <div className="space-y-2 pt-1">
                    <span className="text-caption font-bold uppercase tracking-wider text-casa-muted block">
                      Shortlist Alternatives ({Math.max(0, moodShortlistRecipes.length - 1)})
                    </span>

                    {moodShortlistRecipes.slice(1, 3).map((insight, altIndex) => {
                      const focus = parseRecipeImageFocus(insight.recipe.image_url)
                      const minutesLabel = insight.minutes ? `${insight.minutes} min` : (insight.recipe.cook_time ?? 'Quick cook')
                      return (
                        <div
                          key={`${insight.recipe.id}-alt-${altIndex}`}
                          className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-casa-surface/80 transition-colors group cursor-pointer"
                          onClick={() => openRecipeForCookMode(insight.recipe.id)}
                        >
                          <div className="relative size-14 rounded-xl overflow-hidden bg-casa-surface shrink-0 border border-casa-border/80">
                            <RecipeImage
                              src={getRecipeImage(insight.recipe)}
                              alt={insight.recipe.name}
                              focalX={focus.focalX}
                              focalY={focus.focalY}
                              className="size-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <Text as="h3" role="body-lg" className="font-semibold leading-tight text-casa-navy truncate">{insight.recipe.name}</Text>
                            <p className="text-caption text-casa-muted mt-0.5 truncate">
                              {minutesLabel} · {insight.recipe.servings ? `${insight.recipe.servings} Servings` : '4 Servings'}
                            </p>
                          </div>

                          <Button
                            onClick={(event) => {
                              event.stopPropagation()
                              openRecipeForCookMode(insight.recipe.id)
                            }}
                            variant="champagne"
                            className="mt-auto shrink-0 font-bold"
                            size="sm"
                          >
                            Cook
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── PLAN THE WEEK WORKSPACE ── */}
          {cookLandingMode === 'plan-week' && (
            <Card tone="surface" padding="lg" className="space-y-6 shadow-card border-casa-border rounded-3xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-casa-border/60">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles size={18} className="text-casa-gold" />
                    <Heading role="heading" className="font-display text-heading font-bold text-casa-navy">
                      Meal Planner AI Atelier
                    </Heading>
                  </div>
                  <p className="text-body-sm text-casa-text-secondary mt-0.5">
                    Plan dinners with intelligent ingredient reuse to eliminate food waste and reduce grocery spend.
                  </p>
                </div>
              </div>

              {/* Strategy Selector */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-casa-bg rounded-2xl border border-casa-border/60">
                <div className="flex items-center gap-2">
                  <span className="text-caption font-bold uppercase tracking-wider text-casa-muted">Strategy:</span>
                  {(['balanced', 'budget', 'speed'] as const).map((strat) => (
                    <Chip
                      key={strat}
                      onClick={() => setMealPlannerStrategy(strat)}
                      selected={mealPlannerStrategy === strat}
                      tone={mealPlannerStrategy === strat ? 'accent' : 'neutral'}
                      className="capitalize font-semibold min-h-control"
                    >
                      {strat}
                    </Chip>
                  ))}
                </div>
                <p className="text-caption text-casa-muted font-medium">
                  {strategyInstruction(mealPlannerStrategy)}
                </p>
              </div>

              {/* Prompt Box */}
              <div className="space-y-2.5">
                <Textarea
                  value={mealPlannerPrompt}
                  onChange={(event) => setMealPlannerPrompt(event.target.value)}
                  rows={2}
                  placeholder="Plan 5 dinners this week under $140 with overlapping ingredients and one seafood meal."
                  className="text-body bg-casa-surface border-casa-border focus:border-casa-gold"
                />
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {[
                    'High overlap & low waste',
                    'Fast 20m weeknights',
                    'Budget friendly under $120',
                    'Use up pantry staples',
                  ].map((preset) => (
                    <Chip
                      key={preset}
                      size="sm"
                      onClick={() => setMealPlannerPrompt(preset)}
                      className="text-caption font-medium bg-casa-bg border-casa-border hover:border-casa-gold/60 cursor-pointer"
                    >
                      {preset}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* Actions Bar */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  variant="champagne"
                  size="lg"
                  onClick={() => void generateMealPlan()}
                  disabled={mealPlannerLoading}
                  loading={mealPlannerLoading}
                  leadingIcon={<Sparkles size={16} />}
                  className="font-bold px-6 min-h-control"
                >
                  {mealPlannerLoading ? 'Generating Plan…' : 'Generate Weekly Plan'}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => void optimizeCurrentPlanForBudget()}
                  disabled={mealPlannerLoading || !mealPlannerPlan}
                  className="font-semibold min-h-control"
                >
                  Optimize Budget
                </Button>
                <Button
                  variant="champagne"
                  size="lg"
                  onClick={() => void applyPlannerGroceries()}
                  disabled={mealPlannerAddingGroceries || pendingPlannerGroceries.length === 0}
                  loading={mealPlannerAddingGroceries}
                  leadingIcon={<ShoppingCart size={16} className="text-casa-gold" />}
                  className="font-bold min-h-control px-6 ml-auto"
                >
                  {mealPlannerAddingGroceries
                    ? `Adding Groceries... (${pendingPlannerGroceries.length})`
                    : `Apply to Shopping List (${pendingPlannerGroceries.length})`}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPlannerAdvancedOpen((val) => !val)}
                  className="text-caption font-bold text-casa-gold"
                >
                  {plannerAdvancedOpen ? 'Hide Advanced' : 'Show Advanced'}
                </Button>
              </div>

              {/* Advanced Planner Settings */}
              {plannerAdvancedOpen && (
                <Card tone="subtle" padding="md" className="space-y-3 rounded-2xl border-casa-border">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={mealPlannerTemplateName}
                      onChange={(event) => setMealPlannerTemplateName(event.target.value)}
                      placeholder="Template name"
                      className="flex-1 text-caption min-h-control"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void saveCurrentPromptTemplate()}
                      className="min-h-control"
                    >
                      Save Template
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void runWeeklyAutoDraft()}
                      className="min-h-control font-bold text-casa-gold"
                    >
                      Auto Weekly Draft
                    </Button>
                  </div>

                  {mealPlannerTemplates.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-caption text-casa-muted font-semibold">Saved Templates</p>
                      <div className="flex flex-wrap gap-1.5">
                        {mealPlannerTemplates.map((tpl) => (
                          <div key={tpl.id} className="inline-flex items-center gap-1 rounded-pill border border-casa-border bg-casa-surface px-2.5 py-1 text-caption shadow-2xs">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setMealPlannerPrompt(tpl.prompt)}
                              className="min-h-0 p-0 text-casa-navy hover:bg-transparent font-medium"
                            >
                              {tpl.name}
                            </Button>
                            <IconButton
                              icon={<Trash2 size={12} />}
                              variant="ghost"
                              size="sm"
                              onClick={() => void deleteMealPlannerTemplate(tpl.id)}
                              aria-label={`Delete ${tpl.name} template`}
                              className="min-h-0 min-w-0 p-0 text-casa-muted hover:text-casa-error hover:bg-transparent"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {typeof mealPlannerDebug?.elapsed_ms === 'number' && (
                    <p className="text-caption font-mono text-casa-muted">
                      trace {mealPlannerLastTraceId ? mealPlannerLastTraceId.slice(0, 8) : 'n/a'} · {mealPlannerDebug.elapsed_ms}ms
                    </p>
                  )}
                </Card>
              )}

              {mealPlannerError && (
                <Alert tone="danger" title="Meal planning error" className="shadow-sm">
                  {mealPlannerError}
                </Alert>
              )}
              {!mealPlannerError && mealPlannerStatus && (
                <Alert tone="success" title="Plan ready" className="shadow-sm">
                  {mealPlannerStatus}
                </Alert>
              )}

              {/* Generated Plan Details */}
              {mealPlannerPlan && (
                <div className="space-y-5 pt-4 border-t border-casa-border/60">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <Heading role="heading" className="font-display text-heading font-bold text-casa-navy">
                      Proposed Weekly Dinners ({configuredPlannerMeals.filter((m) => m.enabled).length})
                    </Heading>
                    <div className="flex items-center gap-2">
                      <span className="text-caption font-mono font-bold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-800 border border-emerald-500/30">
                        Est. Cost: ${configuredPlannerMetrics.estimatedLow} – ${configuredPlannerMetrics.estimatedHigh}
                      </span>
                      <span className="text-caption font-mono font-bold px-3 py-1 rounded-full bg-casa-gold/20 text-casa-navy border border-casa-gold/30">
                        Overlap Score: {(mealPlannerPlan.budget_fit_score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Over Budget Swap Hints */}
                  {overBudgetSwapHints.length > 0 && (
                    <Alert tone="warning" title="Budget optimization suggestions">
                      <ul className="list-disc pl-4 space-y-0.5 mt-1 text-body-sm">
                        {overBudgetSwapHints.map((hint) => (
                          <li key={hint}>{hint}</li>
                        ))}
                      </ul>
                    </Alert>
                  )}

                  {/* Proposed Meals Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                    {configuredPlannerMeals.map((meal) => (
                      <Card
                        key={meal.key}
                        tone={meal.enabled ? 'surface' : 'subtle'}
                        padding="md"
                        className={cn(
                          'space-y-2.5 transition-all rounded-2xl border-casa-border shadow-card',
                          !meal.enabled && 'opacity-60',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-caption font-bold uppercase tracking-wider text-casa-gold">
                            {SLOT_LABELS[meal.slot]}
                          </span>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={meal.enabled}
                              onCheckedChange={() => toggleConfiguredMeal(meal.key)}
                              label="Include"
                            />
                            <IconButton
                              icon={<Trash2 size={13} />}
                              variant="danger"
                              size="sm"
                              onClick={() => deleteConfiguredMeal(meal.key)}
                              aria-label={`Remove ${meal.recipe_name} from plan`}
                            />
                          </div>
                        </div>
                        <p className="font-display text-body-lg font-bold text-casa-navy">{meal.recipe_name}</p>
                        <p className="text-caption text-casa-text-secondary line-clamp-2 leading-relaxed">{meal.reason}</p>
                      </Card>
                    ))}
                  </div>

                  {/* Plan Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void applyPlannerMealQueue()}
                      className="font-bold min-h-control"
                    >
                      Queue meals for week
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void reinforceCurrentPlanPreferences()}
                      className="min-h-control font-semibold"
                    >
                      Love this pattern (learn)
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
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
                      className="min-h-control text-casa-muted"
                    >
                      This plan missed (learn + regenerate)
                    </Button>
                  </div>

                  {/* Overlap Ingredients & Deductions */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                    <Card tone="subtle" padding="md" className="space-y-2 rounded-2xl border-casa-border">
                      <p className="text-caption font-bold uppercase tracking-wider text-casa-navy flex items-center gap-1.5">
                        <Sparkles size={14} className="text-casa-gold" />
                        Shared Overlap Ingredients ({mealPlannerPlan.overlap_ingredients.length})
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {mealPlannerPlan.overlap_ingredients.map((item) => (
                          <Chip key={item.name} size="sm" tone="accent">
                            {item.name} ({item.recipe_count} recipes)
                          </Chip>
                        ))}
                      </div>
                    </Card>

                    <Card tone="subtle" padding="md" className="space-y-2 rounded-2xl border-casa-border">
                      <p className="text-caption font-bold uppercase tracking-wider text-casa-navy flex items-center gap-1.5">
                        <Layers size={14} className="text-casa-gold" />
                        Pantry Deductions ({mealPlannerPlan.pantry_deductions.length})
                      </p>
                      <p className="text-caption text-casa-text-secondary line-clamp-2">
                        {mealPlannerPlan.pantry_deductions.map((d) => d.name).join(', ')}
                      </p>
                    </Card>
                  </div>

                  {/* Overlap-Optimized Groceries Checklist */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <Heading role="heading" className="font-display text-heading font-bold text-casa-navy">
                        Overlap-Optimized Groceries ({pendingPlannerGroceries.length} to buy)
                      </Heading>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate('/settings/pantry-inventory')}
                        className="text-caption font-bold text-casa-gold hover:underline min-h-control"
                      >
                        Manage pantry inventory →
                      </Button>
                    </div>

                    {lowStockPlannerItems.length > 0 && (
                      <p className="text-caption text-amber-800 font-medium">
                        {lowStockPlannerItems.length} item{lowStockPlannerItems.length === 1 ? '' : 's'} projected low in pantry after this plan — review before shopping.
                      </p>
                    )}

                    {mealPlannerAddResult && (
                      <Alert tone="success" title="Shopping list updated">
                        Added {mealPlannerAddResult.inserted} new items to shopping list ({mealPlannerAddResult.attempted} processed).
                      </Alert>
                    )}

                    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                      {configuredPlannerGroceries.map((item) => {
                        const checked = Boolean(mealPlannerPantryConfig[plannerGroceryKey(item)])
                        const tracker = projectedPantryForItem(item)
                        return (
                          <div
                            key={`${item.name}-${item.category}`}
                            className="rounded-xl border border-casa-border bg-casa-surface p-3 flex items-center justify-between gap-3 shadow-2xs"
                          >
                            <Checkbox
                              checked={checked}
                              onChange={() => togglePlannerPantryItem(item)}
                              label={
                                <span className={cn('text-body-sm font-semibold', checked ? 'line-through text-casa-muted' : 'text-casa-navy')}>
                                  {item.name}
                                  {item.quantity ? ` · ${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : ''}
                                  {item.suggested_purchase_display && (
                                    <span className="text-casa-muted font-normal"> · buy {item.suggested_purchase_display}</span>
                                  )}
                                </span>
                              }
                            />
                            <div className="flex items-center gap-2">
                              <Chip size="sm" tone="neutral">
                                {item.category}
                              </Chip>
                              {tracker.lowStock && (
                                <Chip size="sm" tone="danger">
                                  Low stock
                                </Chip>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Action Log Drawer */}
                  {mealPlannerActionLog.length > 0 && (
                    <div className="pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPlannerLogOpen((val) => !val)}
                        className="text-caption font-mono text-casa-muted"
                      >
                        {plannerLogOpen ? 'Hide action log' : `Show action log (${mealPlannerActionLog.length})`}
                      </Button>
                      {plannerLogOpen && (
                        <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5 pr-1">
                          {mealPlannerActionLog.slice(0, 10).map((log) => (
                            <div key={log.id} className="p-2.5 rounded-xl bg-casa-surface border border-casa-border text-caption">
                              <p className="font-semibold text-casa-navy">{log.action}: {log.status}</p>
                              <p className="text-casa-muted">{log.detail}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* ── THE RECIPE VAULT & CATALOG (Open Gallery Section) ── */}
          <div className="space-y-5 pt-8 border-t border-casa-border/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
              <div>
                <Heading role="heading" className="font-display text-heading font-bold text-casa-navy">
                  Recipe Vault &amp; Catalog
                </Heading>
                <p className="text-body-sm text-casa-text-secondary mt-0.5">
                  Browse and search all {recipes.length} saved household recipes.
                </p>
              </div>

              {libraryActionError && (
                <Alert tone="danger" title="Library action failed">
                  {libraryActionError}
                </Alert>
              )}
              {!libraryActionError && libraryActionStatus && (
                <Alert tone="success" title="Action completed">
                  {libraryActionStatus}
                </Alert>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[15rem] flex-1 sm:flex-initial">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-casa-muted z-10" />
                  <Input
                    value={recipeSearch}
                    onChange={(event) => setRecipeSearch(event.target.value)}
                    placeholder="Search recipes..."
                    className="pl-9 min-h-control"
                  />
                  {recipeSearch.trim() && (
                    <IconButton
                      icon={<X size={14} />}
                      aria-label="Clear search"
                      onClick={() => setRecipeSearch('')}
                      size="sm"
                      variant="ghost"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2"
                    />
                  )}
                </div>
                <Button
                  variant="champagne"
                  size="md"
                  onClick={openImportDialog}
                  leadingIcon={<Upload size={16} />}
                  className="font-bold min-h-control px-4"
                >
                  Import recipe
                </Button>
              </div>
            </div>

            {/* Real-time search matches dropdown tray if user searches */}
            {recipeSearch.trim() && (
              <div className="space-y-3 p-4 bg-casa-surface rounded-2xl border border-casa-gold/40 shadow-card">
                <div className="flex items-center justify-between pb-2 border-b border-casa-border/60">
                  <Text role="caption" muted className="font-bold uppercase tracking-wider text-casa-gold">
                    Found {filteredRecipes.length} {filteredRecipes.length === 1 ? 'matching recipe' : 'matching recipes'}
                  </Text>
                  <Button variant="ghost" size="sm" onClick={() => setRecipeSearch('')} className="text-caption font-semibold">
                    Clear search
                  </Button>
                </div>
                {filteredRecipes.length === 0 ? (
                  <EmptyState title="No recipes match" description="Try a different keyword or scan a new recipe from photo or URL." />
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2 max-h-72 overflow-y-auto pr-1">
                    {filteredRecipes.map((recipe) => (
                      <Card
                        key={recipe.id}
                        interactive
                        padding="sm"
                        tone="surface"
                        onClick={() => {
                          setRecipeSearch('')
                          openRecipeForCookMode(recipe.id)
                        }}
                        className="flex items-center justify-between gap-3 border border-casa-border hover:border-casa-gold/80 group"
                      >
                        <div className="min-w-0 flex-1">
                          <Text role="body-sm" className="font-semibold text-casa-navy truncate group-hover:text-casa-gold transition-colors">
                            {recipe.name}
                          </Text>
                          <Text role="caption" muted className="truncate">
                            {recipe.cook_time ? `${recipe.cook_time} · ` : ''}{recipe.servings ? `${recipe.servings} servings` : 'Standard'}
                          </Text>
                        </div>
                        <Button variant="champagne" size="sm" leadingIcon={<Utensils size={13} />} className="shrink-0 font-bold">
                          Cook
                        </Button>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Filter Chips */}
            <div className="flex flex-wrap items-center gap-2">
              {([
                { id: 'all', label: `All Recipes (${recipes.length})` },
                { id: 'quick', label: `Quick Cooks (${quickTonightCount})` },
                { id: 'planned', label: `Planned This Week (${plannedRecipes.length})` },
              ] as const).map((filter) => (
                <Chip
                  key={filter.id}
                  onClick={() => setRecipeBrowseFilter(filter.id)}
                  selected={recipeBrowseFilter === filter.id}
                  tone={recipeBrowseFilter === filter.id ? 'accent' : 'neutral'}
                  className="min-h-control font-semibold"
                >
                  {filter.label}
                </Chip>
              ))}
            </div>

            {filteredRecipes.length === 0 && (
              <EmptyState
                title="No recipes found"
                description="Try adjusting your search or filters, or import a new recipe."
              />
            )}

            {/* Recipe Grid */}
            <div
              className={cn(
                'grid gap-5',
                aiDrawerOpen
                  ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
              )}
            >
              {filteredRecipes.slice(0, 32).map((recipe) => {
                const focus = parseRecipeImageFocus(recipe.image_url)
                const matchedHorizon = weekDayMeals.find((w) => w.recipe?.id === recipe.id)
                const isScheduled = Boolean(matchedHorizon)
                const scheduledDayLabel = matchedHorizon ? (matchedHorizon.day.isToday ? 'Today' : `${matchedHorizon.day.dayName}, ${matchedHorizon.day.formattedDate}`) : null
                const isGroceryDrawerOpen = activeGroceryRecipeId === recipe.id
                const recipeIngredients = ingredientsByRecipe.get(recipe.id) ?? []
                const selectedSet = recipeGrocerySelections[recipe.id] ?? new Set(recipeIngredients.map((_, i) => i))
                const selectedCount = selectedSet.size

                return (
                  <Card
                    key={recipe.id}
                    tone="surface"
                    padding="none"
                    className={cn(
                      'overflow-hidden flex flex-col group transition-all shadow-card rounded-2xl cursor-pointer hover:shadow-card-hover border-casa-border',
                      isGroceryDrawerOpen ? 'ring-2 ring-casa-gold/80 border-casa-gold' : 'hover:ring-2 hover:ring-casa-gold/50',
                    )}
                    onClick={() => openRecipeForCookMode(recipe.id)}
                  >
                    <div className="relative overflow-hidden bg-casa-surface">
                      <RecipeImage
                        src={getRecipeImage(recipe)}
                        alt={recipe.name}
                        focalX={focus.focalX}
                        focalY={focus.focalY}
                        className="h-44 w-full object-cover group-hover:scale-103 transition-transform duration-500"
                      />
                      {isScheduled && (
                        <div className="absolute top-2.5 left-2.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-casa-gold/20 text-casa-navy text-caption font-mono font-bold border border-casa-gold/35 shadow-xs">
                            <Sparkles size={10} className="text-casa-navy" />
                            {scheduledDayLabel || 'Planned'}
                          </span>
                        </div>
                      )}
                      {recipe.cook_time && (
                        <div className="absolute top-2.5 right-2.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-casa-surface/90 backdrop-blur-sm text-casa-navy text-caption font-mono font-bold border border-casa-border/80 shadow-xs">
                            <Clock3 size={11} className="text-casa-gold" />
                            {recipe.cook_time}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="p-4 flex flex-col flex-1 gap-2.5">
                      <Heading role="heading" className="font-display font-bold text-body-lg text-casa-navy line-clamp-2 group-hover:text-casa-gold transition-colors">
                        {recipe.name}
                      </Heading>
                      <p className="text-caption text-casa-muted">
                        {recipe.servings ? `${recipe.servings} servings` : 'Standard servings'}{recipe.cook_time ? ` · ${recipe.cook_time}` : ''}
                      </p>

                      <div className="mt-auto pt-2 flex items-center gap-2">
                        <Button
                          variant="champagne"
                          size="sm"
                          className="flex-1 font-bold min-h-control"
                          onClick={(event) => {
                            event.stopPropagation()
                            openRecipeForCookMode(recipe.id)
                          }}
                          leadingIcon={<Utensils size={13} />}
                        >
                          Cook
                        </Button>
                        <IconButton
                          icon={<CalendarPlus size={15} />}
                          variant="secondary"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            void addRecipeToNextAvailableSlot(recipe)
                          }}
                          disabled={plannedMealActionId !== null}
                          title={isScheduled ? `Scheduled for ${scheduledDayLabel} (Click to remove from schedule)` : 'Add to next available day on Weekly Horizon'}
                          aria-label={isScheduled ? `Remove ${recipe.name} from weekly schedule` : `Add ${recipe.name} to weekly dinner horizon`}
                          className={cn(
                            'shrink-0 min-h-control size-control bg-casa-surface border-casa-border hover:border-casa-gold transition-all',
                            isScheduled && 'border-casa-gold text-casa-gold bg-casa-gold/15',
                          )}
                        />
                        <IconButton
                          icon={<ShoppingCart size={15} />}
                          variant="secondary"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            toggleGroceryDrawer(recipe)
                          }}
                          disabled={smartAddingRecipeId === recipe.id}
                          title="Add ingredients to grocery list"
                          aria-label={`Add ingredients for ${recipe.name} to shopping list`}
                          className={cn(
                            'shrink-0 min-h-control size-control bg-casa-surface border-casa-border hover:border-casa-gold',
                            isGroceryDrawerOpen && 'border-casa-gold text-casa-gold bg-casa-gold/15',
                          )}
                        />
                      </div>
                    </div>

                    {/* Inline Grocery Ingredient Review Tray (Modal-Free) */}
                    {isGroceryDrawerOpen && (
                      <div
                        className="p-3 bg-casa-bg border-t border-casa-border/80 space-y-2.5 rounded-b-2xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between gap-1 pb-1 border-b border-casa-border/50">
                          <span className="text-caption font-mono font-bold uppercase tracking-wider text-casa-navy truncate">
                            Ingredients ({selectedCount}/{recipeIngredients.length})
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleAllIngredients(recipe)}
                              className="text-caption font-semibold p-0 min-h-0 text-casa-gold hover:text-amber-800"
                            >
                              {selectedCount === recipeIngredients.length ? 'Clear' : 'All'}
                            </Button>
                            <IconButton
                              icon={<X size={13} />}
                              size="sm"
                              variant="ghost"
                              aria-label="Close ingredient selector"
                              onClick={() => setActiveGroceryRecipeId(null)}
                              className="size-6 p-0 min-h-0 min-w-0 text-casa-muted hover:text-casa-navy"
                            />
                          </div>
                        </div>

                        {recipeIngredients.length === 0 ? (
                          <p className="text-caption text-casa-muted py-1">No ingredients listed for this recipe.</p>
                        ) : (
                          <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                            {recipeIngredients.map((ingredient, idx) => {
                              const isChecked = selectedSet.has(idx)
                              const text = ingredient.name || ingredient.raw_text
                              const qtyText = ingredient.quantity ? `${ingredient.quantity}${ingredient.unit ? ` ${ingredient.unit}` : ''}` : ''
                              return (
                                <div
                                  key={`${ingredient.recipe_id}-${idx}`}
                                  onClick={() => toggleIngredientSelection(recipe.id, idx)}
                                  className={cn(
                                    'flex items-center gap-2 p-1.5 rounded-xl border text-caption cursor-pointer transition-colors select-none',
                                    isChecked
                                      ? 'bg-casa-surface border-casa-gold/60 text-casa-navy'
                                      : 'bg-casa-surface/40 border-casa-border/60 text-casa-muted line-through opacity-70',
                                  )}
                                >
                                  <Checkbox
                                    checked={isChecked}
                                    onChange={() => toggleIngredientSelection(recipe.id, idx)}
                                    label=""
                                    className="pointer-events-none"
                                  />
                                  <span className="truncate font-medium flex-1">
                                    {text}
                                  </span>
                                  {qtyText && (
                                    <span className="text-caption font-mono text-casa-muted shrink-0">
                                      {qtyText}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <Button
                          variant="champagne"
                          size="sm"
                          fullWidth
                          onClick={() => void addSelectedRecipeGroceries(recipe)}
                          disabled={smartAddingRecipeId === recipe.id || selectedCount === 0}
                          loading={smartAddingRecipeId === recipe.id}
                          leadingIcon={<ShoppingCart size={13} />}
                          className="font-bold min-h-control"
                        >
                          Add {selectedCount} to cart →
                        </Button>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          </div>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteConfirmRecipe)}
        onClose={() => {
          if (deletingRecipeId !== deleteConfirmRecipe?.id) {
            setDeleteConfirmRecipe(null)
          }
        }}
        size="sm"
        title="Delete recipe?"
      >
        <div className="space-y-4">
          <p className="text-body text-casa-text-secondary">
            Are you sure you want to delete <span className="font-bold text-casa-navy">{deleteConfirmRecipe?.name}</span>? This action cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              size="md"
              onClick={() => setDeleteConfirmRecipe(null)}
              disabled={deletingRecipeId === deleteConfirmRecipe?.id}
              className="min-h-control"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              onClick={() => void confirmDeleteRecipe()}
              disabled={deletingRecipeId === deleteConfirmRecipe?.id}
              loading={deletingRecipeId === deleteConfirmRecipe?.id}
              className="font-bold min-h-control"
            >
              Delete recipe
            </Button>
          </div>
        </div>
      </Modal>

      {/* Recipe Import Multi-Step Modal */}
      <Modal
        open={importDialogOpen}
        onClose={closeImportDialog}
        size="lg"
        title={`Import Recipe · ${importStep === 1 ? 'Step 1 of 3 (Sources)' : importStep === 2 ? 'Step 2 of 3 (Photos)' : 'Step 3 of 3 (Review)'}`}
      >
        <div className="space-y-4">
          {(importStep === 1 || importStep === 2) && (
            <Card tone="subtle" padding="md" className="space-y-3">
              <p className="text-body-sm text-casa-text-secondary">
                Paste a recipe URL, upload images or PDFs, or take a camera snapshot.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Input
                  type="url"
                  value={importUrlInput}
                  onChange={(event) => setImportUrlInput(event.target.value)}
                  placeholder="https://..."
                  className="flex-1 min-h-control"
                />
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => triggerFileInput(importFileInputRef)}
                  disabled={importingRecipe}
                  leadingIcon={<Upload size={16} />}
                  className="font-semibold min-h-control"
                >
                  Upload
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => triggerFileInput(importCameraInputRef)}
                  disabled={importingRecipe}
                  leadingIcon={<Camera size={16} />}
                  className="font-semibold min-h-control"
                >
                  Take photo
                </Button>
              </div>

              <input
                id="cook-import-file-input"
                ref={importFileInputRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                multiple
                className="hidden"
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
                className="hidden"
                onChange={(event) => {
                  const files = event.target.files ? Array.from(event.target.files) : []
                  event.currentTarget.value = ''
                  void addImportCaptureFiles(files, 'camera')
                }}
              />

              {importCaptureFiles.length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-caption font-semibold text-casa-muted">
                    Attached photos ({importCaptureFiles.length})
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {importCaptureFiles.map((file, index) => {
                      const selected = importMealPhotoIndex !== null && index === importMealPhotoIndex
                      return (
                        <div
                          key={file.id}
                          className={cn(
                            'rounded-xl border overflow-hidden bg-casa-surface',
                            selected ? 'border-casa-gold ring-2 ring-casa-gold/30' : 'border-casa-border',
                          )}
                        >
                          <img
                            src={file.previewUrl}
                            alt={file.name}
                            className="h-16 w-full object-cover"
                          />
                          <div className="p-1 flex flex-col gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setImportMealPhotoIndex((curr) => (curr === index ? null : index))}
                              className="text-caption p-0 h-auto"
                            >
                              {selected ? 'Cover photo' : 'Set cover'}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => removeImportCaptureFile(file.id)}
                              className="text-caption p-0 h-auto"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </Card>
          )}

          {importingRecipe && (
            <p className="text-body-sm text-casa-gold font-bold animate-pulse text-center py-2">
              Extracting recipe with AI intelligence…
            </p>
          )}
          {importError && <Alert tone="danger" title="Recipe import failed">{importError}</Alert>}

          {importStep === 3 && importDraft && (
            <Card tone="surface" padding="md" className="space-y-4">
              <div className="flex items-start gap-4">
                <img
                  src={
                    importDraft.primary_image_index === null
                      ? (importDraft.image_url ?? recipeFallbackHero)
                      : (importDraft.image_urls[importDraft.primary_image_index] ?? importDraft.image_url ?? recipeFallbackHero)
                  }
                  alt={importDraft.name}
                  className="h-20 w-20 rounded-xl border border-casa-border object-cover bg-casa-surface flex-shrink-0"
                />
                <div>
                  <Heading role="heading" className="font-display text-heading font-bold text-casa-navy">
                    {importDraft.name}
                  </Heading>
                  <p className="text-body-sm text-casa-text-secondary mt-1">
                    {importDraft.ingredients.length} ingredients · {importDraft.steps.length} steps · {Math.round(importDraft.confidence * 100)}% AI confidence
                  </p>
                </div>
              </div>

              {/* Extra Photo Search / Custom URL inside Import */}
              <div className="space-y-2 pt-2 border-t border-casa-border/60">
                <p className="text-caption font-semibold text-casa-muted">Recipe Photos</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="url"
                    value={importExtraImageUrl}
                    onChange={(event) => setImportExtraImageUrl(event.target.value)}
                    placeholder="https://.../another-photo.jpg"
                    className="flex-1 text-caption min-h-control"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={addImportImageUrl}
                    className="min-h-control"
                  >
                    Add image
                  </Button>
                </div>

                {importDraft.image_urls.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-2">
                    {importDraft.image_urls.map((imageUrl, imageIndex) => {
                      const selected = importDraft.primary_image_index !== null && imageIndex === importDraft.primary_image_index
                      return (
                        <div
                          key={`${imageUrl}-${imageIndex}`}
                          onClick={() => chooseImportPrimaryImage(imageIndex)}
                          className={cn(
                            'rounded-xl border overflow-hidden cursor-pointer transition-all',
                            selected ? 'border-casa-gold ring-2 ring-casa-gold/40' : 'border-casa-border hover:border-casa-gold/50',
                          )}
                        >
                          <img
                            src={imageUrl}
                            alt={`${importDraft.name} photo ${imageIndex + 1}`}
                            className="h-16 w-full object-cover"
                          />
                          <span className={cn('block p-1 text-caption text-center', selected ? 'font-bold text-casa-navy bg-casa-gold/20' : 'text-casa-muted')}>
                            {selected ? 'Cover selected' : 'Set cover'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Steps Edit & Reorder inside Import */}
              <div className="space-y-2 pt-2 border-t border-casa-border/60">
                <div className="flex items-center justify-between">
                  <p className="text-caption font-semibold text-casa-muted">Extracted Steps ({importDraft.steps.length})</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => addImportStepAfter(importDraft.steps.length - 1)}
                    className="text-caption"
                  >
                    Add step
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {importDraft.steps.map((step, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl border border-casa-border bg-casa-bg space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-caption font-bold text-casa-navy">Step {idx + 1}</span>
                        <div className="flex items-center gap-1">
                          <Chip size="sm" onClick={() => moveImportStep(idx, -1)} disabled={idx === 0}>
                            ↑
                          </Chip>
                          <Chip size="sm" onClick={() => moveImportStep(idx, 1)} disabled={idx >= importDraft.steps.length - 1}>
                            ↓
                          </Chip>
                          <Chip size="sm" tone="danger" onClick={() => removeImportStep(idx)} disabled={importDraft.steps.length <= 1}>
                            Remove
                          </Chip>
                        </div>
                      </div>
                      <Textarea
                        value={step.instruction}
                        onChange={(event) => updateImportStepInstruction(idx, event.target.value)}
                        rows={2}
                        className="text-body-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-casa-border/60">
            {importStep === 1 && (
              <>
                <Button variant="secondary" onClick={closeImportDialog} className="min-h-control">
                  Cancel
                </Button>
                <Button
                  variant="champagne"
                  onClick={() => setImportStep(2)}
                  disabled={!hasImportSource}
                  className="font-bold min-h-control"
                >
                  Next: Photos
                </Button>
              </>
            )}
            {importStep === 2 && (
              <>
                <Button variant="secondary" onClick={() => setImportStep(1)} className="min-h-control">
                  Back
                </Button>
                <Button
                  variant="champagne"
                  onClick={() => void runImportFromCurrentSources()}
                  disabled={importingRecipe || !hasImportSource}
                  loading={importingRecipe}
                  className="font-bold min-h-control"
                >
                  Extract recipe
                </Button>
              </>
            )}
            {importStep === 3 && (
              <>
                <Button variant="secondary" onClick={() => setImportStep(2)} className="min-h-control">
                  Back
                </Button>
                <Button
                  variant="secondary"
                  disabled={!importDraft || importSaving}
                  onClick={() => void saveImportedRecipe({ openCookMode: false })}
                  loading={importSaving}
                  className="min-h-control"
                >
                  Save recipe
                </Button>
                <Button
                  variant="champagne"
                  disabled={!importDraft || importSaving}
                  onClick={() => void saveImportedRecipe({ openCookMode: true })}
                  loading={importSaving}
                  className="font-bold min-h-control"
                >
                  Save + Start cooking
                </Button>
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* Recipe Editing Mode Modal */}
      {cookRecipe && isRecipeEditMode && recipeEditorDraft && (
        <Modal
          open={true}
          onClose={cancelRecipeEditing}
          title="Edit Recipe"
          size="xl"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-casa-border">
              <div>
                <span className="text-caption font-bold uppercase tracking-wider text-casa-gold">Recipe Editor</span>
                <Heading role="heading" className="font-display font-bold text-casa-navy text-heading">
                  Edit Recipe
                </Heading>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => requestDeleteRecipe(cookRecipe)}
                disabled={deletingRecipeId === cookRecipe.id}
                loading={deletingRecipeId === cookRecipe.id}
                leadingIcon={<Trash2 size={14} />}
                className="min-h-control"
              >
                Delete
              </Button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto max-h-[70vh] bg-casa-bg rounded-2xl">
              {recipeEditorError && (
                <Alert tone="danger" title="Recipe edit error">
                  {recipeEditorError}
                </Alert>
              )}
              {recipeEditorStatus && (
                <Alert tone="success" title="Recipe updated">
                  {recipeEditorStatus}
                </Alert>
              )}
              {recipeAiError && (
                <Alert tone="danger" title="AI edit failed">
                  {recipeAiError}
                </Alert>
              )}
              {/* Name field */}
              <div>
                <label className="block text-body-sm font-semibold text-casa-navy mb-1">Recipe Name</label>
                <Input
                  type="text"
                  value={recipeEditorDraft.name}
                  onChange={(event) =>
                    setRecipeEditorDraft((curr) => (curr ? { ...curr, name: event.target.value } : curr))
                  }
                  className="text-body-lg min-h-control"
                />
              </div>

              {/* Photo Editor Disclosure */}
              <DisclosureSection
                title="Photo"
                summary={photoEditorPendingFile ? 'New image ready to save' : 'Search, upload, take, paste, or crop'}
                icon={<Camera size={18} />}
                open={photoEditorExpanded}
                onOpenChange={(open) => {
                  setPhotoEditorExpanded(open)
                  if (open && photoSearchResults.length === 0 && !photoSearchLoading) {
                    void searchWebImages(photoSearchQuery)
                  }
                }}
              >
                <div className="space-y-4 p-3 bg-casa-surface rounded-2xl border border-casa-border" onPaste={photoEditorExpanded ? handlePhotoEditorPaste : undefined}>
                  <p className="text-caption text-casa-muted">
                    Paste a screenshot anywhere in this section, upload an image, or take a photo.
                  </p>
                  {(photoEditorPreviewUrl || photoEditorUrl) && (
                    <div className="rounded-xl overflow-hidden border border-casa-border max-h-48">
                      <img src={photoEditorPreviewUrl || photoEditorUrl} alt="Preview" className="w-full h-48 object-cover" />
                    </div>
                  )}
                  {photoEditorError && <p role="alert" className="text-caption text-casa-error font-medium">{photoEditorError}</p>}
                  {photoSearchError && <p className="text-caption text-casa-error font-medium">{photoSearchError}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => triggerFileInput(photoEditorUploadInputRef)}
                      disabled={recipeEditorSaving || photoEditorUploading}
                      leadingIcon={<Upload size={14} />}
                      className="min-h-control"
                    >
                      Choose image
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => triggerFileInput(photoEditorCameraInputRef)}
                      disabled={recipeEditorSaving || photoEditorUploading}
                      leadingIcon={<Camera size={14} />}
                      className="min-h-control"
                    >
                      Take photo
                    </Button>
                  </div>
                  <input
                    ref={photoEditorUploadInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const files = event.target.files ? Array.from(event.target.files) : []
                      event.currentTarget.value = ''
                      handlePhotoEditorFileSelection(files, 'upload')
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
                      handlePhotoEditorFileSelection(files, 'camera')
                    }}
                  />

                  {/* Photo Search */}
                  <div className="space-y-2">
                    <label htmlFor="recipe-photo-search" className="text-body-sm font-semibold text-casa-navy">Find a recipe image</label>
                    <div className="flex gap-2">
                      <Input
                        id="recipe-photo-search"
                        type="text"
                        value={photoSearchQuery}
                        onChange={(event) => setPhotoSearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void searchWebImages(photoSearchQuery)
                          }
                        }}
                        placeholder="Search recipe photos..."
                        className="flex-1 min-h-control"
                      />
                      <Button
                        variant="secondary"
                        size="md"
                        onClick={() => void searchWebImages(photoSearchQuery)}
                        disabled={photoSearchLoading}
                        loading={photoSearchLoading}
                        leadingIcon={<Search size={14} />}
                        className="min-h-control"
                      >
                        Search
                      </Button>
                    </div>
                    {photoSearchResults.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                        {photoSearchResults.map((res) => (
                          <div
                            key={res.url}
                            onClick={() => setPhotoEditorRemoteUrl(res.url)}
                            className={cn(
                              'rounded-xl border overflow-hidden cursor-pointer',
                              photoEditorUrl === res.url ? 'border-casa-gold ring-2 ring-casa-gold/40' : 'border-casa-border',
                            )}
                          >
                            <img src={res.url} alt={res.title} className="h-20 w-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="recipe-photo-url" className="text-body-sm font-semibold text-casa-navy">
                      Image URL
                    </label>
                    <Input
                      id="recipe-photo-url"
                      type="url"
                      value={photoEditorUrl}
                      onChange={(event) => setPhotoEditorRemoteUrl(event.target.value)}
                      placeholder="https://.../recipe-photo.jpg"
                    />
                  </div>

                  <div className="space-y-3">
                    <p className="text-body-sm font-semibold text-casa-navy">Adjust photo crop (hero)</p>
                    <p className="text-caption text-casa-muted">
                      Pan focus for widescreen display. 0% is left/top, 100% is right/bottom.
                    </p>
                    <div className="overflow-hidden rounded-xl border border-casa-border bg-casa-surface">
                      <div className="relative aspect-[16/9] w-full bg-casa-surface">
                        <img
                          src={photoEditorPreviewUrl || recipeFallbackHero}
                          alt="Crop preview"
                          className="h-full w-full object-cover"
                          style={{ objectPosition: `${photoEditorFocalX}% ${photoEditorFocalY}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <label className="block text-body-sm font-semibold text-casa-navy">
                        Horizontal crop focus
                        <input
                          className="mt-2 w-full"
                          type="range"
                          min={0}
                          max={100}
                          value={photoEditorFocalX}
                          onChange={(event) => {
                            setPhotoEditorFocalX(Number(event.target.value))
                            setPhotoEditorDirty(true)
                          }}
                        />
                      </label>
                      <label className="block text-body-sm font-semibold text-casa-navy">
                        Vertical crop focus
                        <input
                          className="mt-2 w-full"
                          type="range"
                          min={0}
                          max={100}
                          value={photoEditorFocalY}
                          onChange={(event) => {
                            setPhotoEditorFocalY(Number(event.target.value))
                            setPhotoEditorDirty(true)
                          }}
                        />
                      </label>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setPhotoEditorFocalX(50)
                          setPhotoEditorFocalY(42)
                          setPhotoEditorDirty(true)
                        }}
                      >
                        Auto-crop
                      </Button>
                    </div>
                  </div>
                </div>
              </DisclosureSection>

              {/* AI Quick Actions */}
              <Card tone="subtle" padding="md" className="space-y-3">
                <p className="text-caption font-bold uppercase tracking-wider text-casa-navy">Quick Recipe AI Adjustments</p>
                <div className="flex flex-wrap gap-1.5">
                  <Chip onClick={() => applyPipeChoiceToRecipeDraft('left')}>Left side of |</Chip>
                  <Chip onClick={() => applyPipeChoiceToRecipeDraft('right')}>Right side of |</Chip>
                  {recipeQuickActions.map((act) => (
                    <Chip key={act.id} onClick={() => applyRegexQuickAction(act)}>
                      {act.name}
                    </Chip>
                  ))}
                </div>
                <div className="flex gap-2 items-start">
                  <Textarea
                    value={recipeAiInstruction}
                    onChange={(event) => setRecipeAiInstruction(event.target.value)}
                    rows={2}
                    placeholder='AI edit instruction (e.g. "scale ingredients for 2 people")'
                    className="flex-1 text-body-sm"
                  />
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => void applyAiRecipeEdit()}
                    disabled={recipeAiEditing}
                    loading={recipeAiEditing}
                    className="min-h-control"
                  >
                    Apply AI edit
                  </Button>
                </div>
                {recipeSuggestedQuickAction && (
                  <div className="p-2.5 rounded-xl bg-casa-gold/15 border border-casa-gold/30 flex items-center justify-between gap-2">
                    <span className="text-body-sm font-semibold text-casa-navy">
                      Suggested Action: {recipeSuggestedQuickAction.name}
                    </span>
                    <Button variant="secondary" size="sm" onClick={saveSuggestedQuickAction}>
                      Save Action
                    </Button>
                  </div>
                )}
              </Card>

              {/* Ingredients & Steps Edit Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Ingredients Edit Column */}
                <Card tone="surface" padding="md" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-body-lg font-bold text-casa-navy">
                      Ingredients ({recipeEditorDraft.ingredients.length})
                    </p>
                    <Button variant="secondary" size="sm" onClick={addRecipeDraftIngredient}>
                      Add ingredient
                    </Button>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {recipeEditorDraft.ingredients.map((ing, i) => (
                      <div key={i} className="p-2.5 rounded-xl border border-casa-border bg-casa-bg space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={ing.quantity ?? ''}
                            onChange={(e) => updateRecipeDraftIngredient(i, { quantity: e.target.value || null })}
                            placeholder="Qty"
                            className="w-16"
                          />
                          <Input
                            value={ing.unit ?? ''}
                            onChange={(e) => updateRecipeDraftIngredient(i, { unit: e.target.value || null })}
                            placeholder="Unit"
                            className="w-16"
                          />
                          <Input
                            value={ing.name ?? ''}
                            onChange={(e) => updateRecipeDraftIngredient(i, { name: e.target.value || null })}
                            placeholder="Name"
                            className="flex-1"
                          />
                          <IconButton
                            icon={<Trash2 size={13} />}
                            variant="danger"
                            size="sm"
                            onClick={() => removeRecipeDraftIngredient(i)}
                            aria-label="Remove ingredient"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Directions Edit Column */}
                <Card tone="surface" padding="md" className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-body-lg font-bold text-casa-navy">
                      Directions ({recipeEditorDraft.steps.length})
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => addRecipeDraftStepAfter(recipeEditorDraft.steps.length - 1)}
                    >
                      Add step
                    </Button>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {recipeEditorDraft.steps.map((st, i) => (
                      <div key={i} className="p-2.5 rounded-xl border border-casa-border bg-casa-bg space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-caption font-bold text-casa-navy">Step {i + 1}</span>
                          <div className="flex items-center gap-1">
                            <Chip size="sm" onClick={() => moveRecipeDraftStep(i, -1)} disabled={i === 0}>
                              ↑
                            </Chip>
                            <Chip size="sm" onClick={() => moveRecipeDraftStep(i, 1)} disabled={i >= recipeEditorDraft.steps.length - 1}>
                              ↓
                            </Chip>
                            <Chip size="sm" tone="danger" onClick={() => removeRecipeDraftStep(i)} disabled={recipeEditorDraft.steps.length <= 1}>
                              Remove
                            </Chip>
                          </div>
                        </div>
                        <Textarea
                          value={st.instruction}
                          onChange={(e) => updateRecipeDraftStep(i, e.target.value)}
                          rows={2}
                          className="text-body-sm"
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>

            <div className="p-4 border-t border-casa-border bg-casa-surface flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={cancelRecipeEditing} disabled={recipeEditorSaving} className="min-h-control">
                Cancel edit
              </Button>
              <Button
                variant="champagne"
                onClick={() => void saveRecipeEdits()}
                disabled={recipeEditorSaving}
                loading={recipeEditorSaving}
                className="font-bold min-h-control px-6"
              >
                Save changes
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Assign Recipe to Day Modal */}
      {assigningDay && (
        <Modal
          open={true}
          onClose={() => setAssigningDay(null)}
          title={`Assign Dinner for ${assigningDay.dayLabel}`}
          size="lg"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-casa-border">
              <div>
                <span className="text-caption font-bold uppercase tracking-wider text-casa-gold">Weekly Horizon</span>
                <Heading role="heading" className="font-display font-bold text-casa-navy text-heading">
                  Assign Dinner for {assigningDay.dayLabel}
                </Heading>
              </div>
              <IconButton
                icon={<X size={16} />}
                variant="ghost"
                size="sm"
                aria-label="Close"
                onClick={() => setAssigningDay(null)}
              />
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-casa-muted pointer-events-none" />
              <Input
                placeholder="Search recipe library..."
                value={assignDaySearch}
                onChange={(e) => setAssignDaySearch(e.target.value)}
                className="w-full pl-10"
              />
            </div>

            <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
              {recipes
                .filter((r) => !assignDaySearch || r.name.toLowerCase().includes(assignDaySearch.toLowerCase()))
                .map((recipe) => (
                  <div
                    key={recipe.id}
                    onClick={() => void handleAssignRecipeToDay(recipe)}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-casa-border bg-casa-surface hover:border-casa-gold hover:bg-casa-gold/10 cursor-pointer transition-all duration-150 active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {recipe.image_url ? (
                        <img
                          src={recipe.image_url}
                          alt={recipe.name}
                          className="w-12 h-12 rounded-xl object-cover border border-casa-border shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-casa-gold/15 flex items-center justify-center text-casa-gold shrink-0">
                          <BookOpen size={20} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-body font-bold text-casa-navy truncate">
                          {recipe.name}
                        </p>
                        <p className="text-caption text-casa-muted truncate">
                          {recipe.cook_time ? `${recipe.cook_time} · ` : ''}{recipe.servings ? `${recipe.servings} servings` : 'Standard'}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="champagne"
                      size="sm"
                      className="shrink-0 font-bold min-h-[32px] px-3 text-caption"
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleAssignRecipeToDay(recipe)
                      }}
                    >
                      Assign
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        </Modal>
      )}
        </PageShell>
      </div>

      {/* Global Toast with Undo Notification */}
      <Toast
        open={Boolean(toastState?.open)}
        message={toastState?.message ?? ''}
        tone={toastState?.tone ?? 'info'}
        actionLabel={toastState?.actionLabel}
        onAction={toastState?.onAction}
        onClose={() => setToastState(null)}
      />
    </div>
  )
}


