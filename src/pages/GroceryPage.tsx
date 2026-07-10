import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ShoppingCart, Trash2, Check, X, Plus, Minus, RefreshCw, GripVertical, Link2, Upload, BookOpen, ChefHat, ChevronLeft, ChevronRight, Clock3, ExternalLink, Camera, Sparkles, Leaf, Milk, Beef, Croissant, Snowflake, Package, Coffee, Popcorn, Sandwich, House, HeartPulse, Baby as BabyIcon, PawPrint, Circle } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '../utils/cn'
import { useGroceryList, GROCERY_CATEGORIES, type GroceryItem } from '../hooks/useGroceryList'
import GroceryQuickAddSheet from '../components/shared/GroceryQuickAddSheet'
import { inferCategoryFromName } from '../utils/groceryCategorization'
import { normalizeRecipeIngredientFields } from '../utils/recipeIngredientParsing'
import { supabase } from '../lib/supabase'
import { formatSupabaseError } from '../lib/formatSupabaseError'
import {
  appendPantryInventoryAudit,
  normalizePackageUnit,
  normalizePantryKey,
  type PantryInventoryAuditEntry,
} from '../lib/pantryInventoryUtils'
import {
  buildGroceryPredictionDeferredUntil,
  GROCERY_PREDICTION_DISMISS_DAYS,
  GROCERY_PREDICTION_PUSH_DAYS,
  normalizeGroceryNameKey,
  resolveGroceryPredictionDueAt,
  sanitizeGroceryPredictionDeferrals,
  type GroceryPredictionDeferrals,
} from '../utils/groceryPredictionDeferrals'
import recipeFallbackHero from '../assets/hero.png'

const SYNC_LAST_AT_KEY = 'grocery-sync-last-at-v1'
const SYNC_LAST_SUMMARY_KEY = 'grocery-sync-last-summary-v1'
const GROCERY_PREDICTION_DEFERRALS_SETTING_KEY = 'grocery_prediction_deferrals'
// Background dedupe is a full-table scan + write. It only needs to catch
// duplicates introduced by adds/imports/iOS merges, not run on every tick.
// Throttle background dedupe to at most once per this interval; the manual
// "Clean + Sync" button still forces a dedupe pass regardless.
const DEDUPE_MIN_INTERVAL_MS = 10 * 60_000
const SYNC_LAST_DEDUPE_AT_KEY = 'grocery-sync-last-dedupe-at-v1'
const CLEAN_SYNC_BATCH_SIZE = 60
const QUICK_ADD_TOUCH_ITEMS = ['Milk', 'Eggs', 'Bread', 'Bananas', 'Chicken', 'Coffee']
const CHECKED_ITEM_DISMISS_MS = 3_000
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
type CategoryVisual = {
  icon: typeof ShoppingCart
  iconBg: string
  iconFg: string
  subtitle: string
}

const DEFAULT_CATEGORY_VISUAL: CategoryVisual = {
  icon: ShoppingCart,
  iconBg: '#F5F1E7',
  iconFg: '#7A7363',
  subtitle: 'Auto-organized for faster list scanning',
}

const CATEGORY_VISUAL_BY_KEY: Record<string, CategoryVisual> = {
  produce: { icon: Leaf, iconBg: '#E4F0E8', iconFg: '#3F7E58', subtitle: 'Fresh items • entry side' },
  dairy: { icon: Milk, iconBg: '#F6E7EB', iconFg: '#B05468', subtitle: 'Cold essentials • back wall' },
  meat: { icon: Beef, iconBg: '#F5E3D6', iconFg: '#B4562A', subtitle: 'Protein picks • butcher lane' },
  bakery: { icon: Croissant, iconBg: '#F6ECD5', iconFg: '#B08A34', subtitle: 'Bread & baked goods' },
  frozen: { icon: Snowflake, iconBg: '#E1EAF3', iconFg: '#2E6FB0', subtitle: 'Frozen staples' },
  pantry: { icon: Package, iconBg: '#F5E3D6', iconFg: '#B4562A', subtitle: 'Shelf staples • center aisles' },
  beverages: { icon: Coffee, iconBg: '#E1EAF3', iconFg: '#2E6FB0', subtitle: 'Drinks & hydration' },
  snacks: { icon: Popcorn, iconBg: '#F6E7EB', iconFg: '#B05468', subtitle: 'Quick bites & treats' },
  deli: { icon: Sandwich, iconBg: '#F4E7CB', iconFg: '#8A5A1E', subtitle: 'Prepared foods' },
  household: { icon: House, iconBg: '#E7F4F4', iconFg: '#0A6266', subtitle: 'Home & cleaning' },
  'personal-care': { icon: HeartPulse, iconBg: '#EDE9F8', iconFg: '#6C5AA0', subtitle: 'Health & body' },
  baby: { icon: BabyIcon, iconBg: '#FFF3D9', iconFg: '#A87722', subtitle: 'Baby essentials' },
  pet: { icon: PawPrint, iconBg: '#E6F3EA', iconFg: '#2E7D5B', subtitle: 'Pet supplies' },
  other: { icon: ShoppingCart, iconBg: '#F5F1E7', iconFg: '#7A7363', subtitle: 'Everything else' },
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

function detectCategory(name: string): string {
  return inferCategoryFromName(name)
}

function normalizeItemName(name: string): string {
  return normalizeGroceryNameKey(name)
}

function pantryInventoryKey(name: string, category: string): string {
  return normalizePantryKey(name, category)
}

function defaultLowStockThreshold(category: string): number {
  if (category === 'pantry') return 0.5
  if (category === 'other') return 0.35
  return 0.25
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

function getDepletionVisual(daysUntil: number): { dueLabel: string; dotColor: string; tagBg: string; tagText: string; meterColor: string } {
  if (daysUntil <= 0) {
    return {
      dueLabel: 'Due now',
      dotColor: '#D98C2B',
      tagBg: '#FBEAD2',
      tagText: '#9A5B12',
      meterColor: '#D98C2B',
    }
  }
  if (daysUntil <= 3) {
    return {
      dueLabel: `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
      dotColor: '#C9A94E',
      tagBg: '#F4EEDD',
      tagText: '#8A7327',
      meterColor: '#C9A94E',
    }
  }
  return {
    dueLabel: `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
    dotColor: '#9BB18A',
    tagBg: '#EEF1E9',
    tagText: '#5E6B4E',
    meterColor: '#9BB18A',
  }
}

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
  const categoryLabel = splitCategoryLabel(
    GROCERY_CATEGORIES.find((category) => category.key === item.category)?.label ?? item.category
  )
  const metaParts = [
    item.store_section?.trim() || categoryLabel,
    item.subcategory?.trim(),
    item.brand?.trim(),
  ].filter((value): value is string => Boolean(value))
  const needsConfidenceReview =
    !item.checked &&
    typeof item.enhancement_confidence === 'number' &&
    item.enhancement_confidence < LOW_CONFIDENCE_REVIEW_THRESHOLD

  return (
    <div className={cn(
      'flex items-start gap-3.5 px-4 py-3.5 hover:bg-casa-bg/55 transition-all duration-300 ease-out group will-change-transform',
      visualChecked && 'opacity-55',
      dismissPhase === 'queued' && 'bg-casa-gold/8',
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
          className="mt-0.5 flex-shrink-0 text-casa-muted/70 hover:text-casa-navy transition-colors touch-none"
          aria-label={`Move ${item.name}`}
        >
          <GripVertical size={18} />
        </button>
      )}
      <button
        type="button"
        onClick={() => onToggle(item.id, !visualChecked)}
        className={cn(
          'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl border-2 transition-colors',
          visualChecked
            ? 'border-emerald-400 bg-emerald-50 text-emerald-600'
            : 'border-casa-border bg-casa-surface text-casa-navy/60 hover:border-casa-gold/40'
        )}
      >
        {visualChecked ? <Check size={15} className="text-emerald-600" /> : null}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className={cn(
              'text-body-lg font-semibold text-casa-text leading-tight',
              visualChecked && 'line-through text-casa-muted'
            )}>
              {item.name}
            </span>
            {(item.quantity || item.unit) && (
              <span className="ml-2 text-body-sm font-medium text-casa-muted">
                {item.quantity}{item.unit ? ' ' + item.unit : ''}
              </span>
            )}
          </div>
          {needsConfidenceReview && (
            <button
              type="button"
              onClick={() => onRequestReview?.(item.id)}
              title={`Suggested placement (${Math.round((item.enhancement_confidence ?? 0) * 100)}% confidence). Tap to recategorize.`}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#B8E4E6] bg-[#E7F4F4] px-2.5 py-1 text-[10.5px] font-semibold text-[#0A6266] hover:bg-[#DFF1F1] transition-colors"
            >
              <Sparkles size={11} />
              Suggested
            </button>
          )}
        </div>
        <p className="mt-0.5 text-body-sm leading-relaxed text-casa-muted">
          {metaParts.join(' · ')}
        </p>
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
                  {splitCategoryLabel(category.label)}
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
        className="opacity-70 lg:opacity-0 lg:group-hover:opacity-100 mt-0.5 flex-shrink-0 text-casa-muted hover:text-red-500 transition-all"
      >
        <X size={15} />
      </button>
    </div>
  )
}

export default function GroceryPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    items,
    defaultListId,
    uncheckedCount,
    checkedCount,
    isLoading,
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
    refetchInterval: 10 * 60_000,
  })

  const { data: predictionDeferrals = {}, refetch: refetchPredictionDeferrals } = useQuery({
    queryKey: ['grocery-pantry-prediction-deferrals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', GROCERY_PREDICTION_DEFERRALS_SETTING_KEY)
        .maybeSingle()
      if (error) throw error
      return sanitizeGroceryPredictionDeferrals(data?.value, Date.now())
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
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
  const [groceryViewMode, setGroceryViewMode] = useState<'manage' | 'smart'>('manage')
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false)
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false)
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
  const [cookView, setCookView] = useState<{ recipe: RecipePreset; stepIndex: number } | null>(null)
  const [cookTimer, setCookTimer] = useState<{ totalSeconds: number; remainingSeconds: number; label: string } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [reconcilingPantry, setReconcilingPantry] = useState(false)
  const [pantryReconcileDraft, setPantryReconcileDraft] = useState<PantryReconcileDraft | null>(null)
  const [pantryReconcileMessage, setPantryReconcileMessage] = useState<string | null>(null)
  const [pantryReconcileError, setPantryReconcileError] = useState<string | null>(null)
  const [predictionDeferralMessage, setPredictionDeferralMessage] = useState<string | null>(null)
  const [predictionDeferralError, setPredictionDeferralError] = useState<string | null>(null)
  const [expandedReconcileQtyIds, setExpandedReconcileQtyIds] = useState<Set<string>>(new Set())
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

    const results: Array<{
      name: string
      daysUntil: number
      cadenceDays: number
      dueAt: number
      confidence: 'high' | 'medium'
      deferredUntil: string | null
    }> = []
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
      const projectedDueAt = lastAt + cadenceDays * dayMs
      const { dueAt, deferredUntil } = resolveGroceryPredictionDueAt(
        value.name,
        projectedDueAt,
        predictionDeferrals,
        analysisNow,
      )
      const daysUntil = Math.round((dueAt - analysisNow) / dayMs)
      if (daysUntil > 7) return
      results.push({
        name: value.name,
        daysUntil,
        cadenceDays: Math.max(1, Math.round(cadenceDays)),
        dueAt,
        confidence: uniqueTs.length >= 4 ? 'high' : 'medium',
        deferredUntil,
      })
    })

    return results
      .sort((a, b) => a.daysUntil - b.daysUntil || b.dueAt - a.dueAt)
      .slice(0, 8)
  }, [activeNameSet, analysisNow, historyRows, predictionDeferrals])

  const activePredictionDeferralCount = useMemo(() => {
    return Object.values(predictionDeferrals).filter((entry) => Date.parse(entry.deferred_until) > analysisNow).length
  }, [analysisNow, predictionDeferrals])

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

  const persistPredictionDeferrals = useCallback(async (nextDeferrals: GroceryPredictionDeferrals) => {
    const nowIso = new Date().toISOString()
    const sanitized = sanitizeGroceryPredictionDeferrals(nextDeferrals, Date.now())
    const { error } = await supabase.from('settings').upsert(
      {
        key: GROCERY_PREDICTION_DEFERRALS_SETTING_KEY,
        value: sanitized,
        updated_at: nowIso,
      },
      { onConflict: 'key' },
    )
    if (error) throw error
    await refetchPredictionDeferrals()
  }, [refetchPredictionDeferrals])

  const deferPantryPrediction = useCallback(async (itemName: string, daysToPush: number, mode: 'push' | 'dismiss') => {
    const normalizedName = normalizeItemName(itemName)
    if (!normalizedName) return
    setPredictionDeferralError(null)
    try {
      const currentDeferredUntil = predictionDeferrals[normalizedName]?.deferred_until ?? null
      const nextDeferredUntil = buildGroceryPredictionDeferredUntil(currentDeferredUntil, Date.now(), daysToPush)
      const nextDeferrals: GroceryPredictionDeferrals = {
        ...predictionDeferrals,
        [normalizedName]: {
          name: itemName.trim() || predictionDeferrals[normalizedName]?.name || itemName,
          deferred_until: nextDeferredUntil,
          updated_at: new Date().toISOString(),
        },
      }
      await persistPredictionDeferrals(nextDeferrals)
      setPredictionDeferralMessage(
        `${mode === 'dismiss' ? 'Dismissed' : 'Pushed'} ${itemName} until ${new Date(nextDeferredUntil).toLocaleDateString([], { month: 'short', day: 'numeric' })}.`,
      )
    } catch (error) {
      setPredictionDeferralError(formatSupabaseError(error, 'Could not defer pantry prediction'))
    }
  }, [persistPredictionDeferrals, predictionDeferrals])

  const clearPantryPredictionDeferrals = useCallback(async () => {
    setPredictionDeferralError(null)
    try {
      await persistPredictionDeferrals({})
      setPredictionDeferralMessage('Deferred pantry predictions are visible again.')
    } catch (error) {
      setPredictionDeferralError(formatSupabaseError(error, 'Could not reset deferred pantry predictions'))
    }
  }, [persistPredictionDeferrals])

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

  const handleSyncNow = useCallback(async (options?: { cleanBeforeSync?: boolean }) => {
    if (syncInFlightRef.current) return
    syncInFlightRef.current = true
    setSyncing(true)
    setSyncError(null)
    try {
      let cleanSummary = ''
      if (options?.cleanBeforeSync) {
        const archivedItemCount = items.filter((item) => item.checked && !item.deleted_at).length
        if (archivedItemCount > 0) {
          await clearChecked.mutateAsync()
          setShowCompletedArchive(false)
          cleanSummary = `Cleared ${archivedItemCount} archived item${archivedItemCount === 1 ? '' : 's'}`
        } else {
          cleanSummary = 'Archive already clear'
        }

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
          const cleanupStatus = totalScanned > 0
            ? 'Clean pass: names already looked good (no spelling/case fixes needed)'
            : 'Clean pass: no suspicious names'
          cleanSummary = cleanSummary
            ? `${cleanSummary} · ${cleanupStatus}`
            : cleanupStatus
        } else {
          const cleanupStatus = `Cleaned ${totalCorrected} name${totalCorrected === 1 ? '' : 's'} · Enhanced ${totalEnhanced} item${totalEnhanced === 1 ? '' : 's'}`
          cleanSummary = cleanSummary
            ? `${cleanSummary} · ${cleanupStatus}`
            : cleanupStatus
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

      const lastDedupeAtRaw = Number(localStorage.getItem(SYNC_LAST_DEDUPE_AT_KEY) ?? 0)
      const shouldDedupe =
        Boolean(options?.cleanBeforeSync) ||
        !Number.isFinite(lastDedupeAtRaw) ||
        Date.now() - lastDedupeAtRaw >= DEDUPE_MIN_INTERVAL_MS

      let dedupedRows = 0
      if (shouldDedupe) {
        const { data: dedupeData, error: dedupeError } = await supabase.functions.invoke('dedupe-grocery-items', {
          body: { dry_run: false },
        })
        if (dedupeError) throw dedupeError
        dedupedRows = Number(dedupeData?.duplicate_rows ?? 0)
        localStorage.setItem(SYNC_LAST_DEDUPE_AT_KEY, String(Date.now()))
      }

      // Casa→iOS reconciliation is owned by the Mac launchd job (which applies
      // deltas to Reminders using its own cursor). The frontend no longer polls
      // sync-casa-to-ios — it was redundant telemetry that never applied changes.
      const dedupeSummary = dedupedRows > 0
        ? `Deduped ${dedupedRows} duplicate item${dedupedRows === 1 ? '' : 's'}`
        : ''
      const summary = [cleanSummary, dedupeSummary].filter(Boolean).join(' · ') || 'List is tidy'

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
  }, [clearChecked, items])

  // Silent background maintenance: throttled dedupe only. Does NOT touch the
  // `syncing` UI state (no button spin / no flicker) and never calls
  // sync-casa-to-ios (Mac owns Casa→iOS). List freshness is handled separately
  // by react-query realtime + refetch; the "Synced <time>" label reads
  // dataUpdatedAt. This keeps background edge-function calls to ~1 per 10 min.
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
        const key = pantryInventoryKey(row.name, row.category)
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
  const hasSmartPicks = (
    predictiveSuggestions.length > 0
    || smartRebuySuggestions.length > 0
    || SMART_BUNDLES.length > 0
    || weeklyAutoListCandidates.length > 0
    || pantryDepletionPredictions.length > 0
    || activePredictionDeferralCount > 0
  )
  const totalTrackedItems = checkedCount + uncheckedCount
  const checkedProgressPercent = totalTrackedItems > 0 ? Math.round((checkedCount / totalTrackedItems) * 100) : 0
  const lastSyncTimeLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null
  const syncStatusLabel = syncError
    ? 'Sync failed'
    : lastSyncTimeLabel
      ? `Updated ${lastSyncTimeLabel}`
      : 'Loading…'
  const weeklyHeroPreviewItems = weeklyAutoListCandidates.slice(0, 7)
  const weeklyHeroOverflowCount = Math.max(0, weeklyAutoListCandidates.length - weeklyHeroPreviewItems.length)

  return (
    <div className="h-full min-h-0 bg-casa-bg flex flex-col overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-casa-bg px-4 pt-safe-t">
        <div className="space-y-3 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-casa-border bg-casa-bg-2 text-casa-gold">
              <ShoppingCart size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-display-md leading-none text-casa-navy">Grocery List</h1>
              <p className="mt-1 text-body-sm text-casa-muted">
                {syncStatusLabel} · sorted by store aisle
              </p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSyncNow({ cleanBeforeSync: true })}
                disabled={syncing}
                title={`${lastSyncSummary}${lastSyncAt ? ` · ${new Date(lastSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`}
                className="hidden md:flex items-center gap-1.5 min-h-11 px-5 rounded-full text-body-sm font-medium text-casa-text-secondary border border-casa-border bg-casa-surface shadow-[0_3px_10px_rgba(27,42,74,0.08)] hover:bg-white transition-colors disabled:opacity-60"
              >
                <RefreshCw size={14} className={cn(syncing && 'animate-spin')} />
                Clean + Sync
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="cook-v2-topline-toggle inline-flex shrink-0 items-center rounded-pill p-1">
              {([
                { id: 'manage', label: 'Manage list' },
                { id: 'smart', label: 'Smart picks' },
              ] as const).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setGroceryViewMode(mode.id)}
                  className={cn(
                    'cook-v2-topline-toggle-btn inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-body-sm font-semibold transition-colors',
                    groceryViewMode === mode.id && 'cook-v2-topline-toggle-btn-active',
                  )}
                  aria-pressed={groceryViewMode === mode.id}
                >
                  {mode.id === 'smart' && <Sparkles size={14} className="text-casa-info" />}
                  {mode.label}
                </button>
              ))}
            </div>
            {groceryViewMode === 'manage' && totalTrackedItems > 0 && (
              <div className="hidden md:block md:min-w-[14rem] md:flex-1 md:max-w-[42rem] px-2">
                <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-casa-muted">
                  <span><span className="text-casa-navy">{checkedCount}</span> of {totalTrackedItems} checked</span>
                  <span>{uncheckedCount} remaining</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-casa-border/70">
                  <div
                    className="h-full rounded-full bg-[#4E9A6B] transition-all duration-300"
                    style={{ width: `${checkedProgressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
        {syncError && (
          <p className="pb-3 text-[11px] text-red-600">Sync error: {syncError}</p>
        )}
        {pantryReconcileError && (
          <p className="pb-3 text-[11px] text-red-600">Pantry restock error: {pantryReconcileError}</p>
        )}
        {!pantryReconcileError && pantryReconcileMessage && (
          <p className="pb-3 text-[11px] text-casa-muted">{pantryReconcileMessage}</p>
        )}
        {predictionDeferralError && (
          <p className="pb-3 text-[11px] text-red-600">Prediction deferral error: {predictionDeferralError}</p>
        )}
        {!predictionDeferralError && predictionDeferralMessage && (
          <p className="pb-3 text-[11px] text-casa-muted">{predictionDeferralMessage}</p>
        )}
        {pantryReconcileDraft && (
          <div className="pb-3">
            <div className="rounded-2xl border border-casa-border bg-casa-bg p-3">
              <p className="text-[11px] font-semibold text-casa-navy">
                Review pantry restock ({pantryReconcileDraft.rows.length})
              </p>
              <p className="mt-0.5 text-[11px] text-casa-muted">
                Adjust package counts before saving to pantry inventory.
              </p>
              <div className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                {pantryReconcileRowsByCategory.map((group) => (
                  <div key={`reconcile-group-${group.category}`} className="rounded-xl border border-casa-border bg-casa-surface p-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-casa-muted">
                      {GROCERY_CATEGORIES.find((category) => category.key === group.category)?.label ?? group.category}
                    </p>
                    <div className="mt-1.5 grid grid-cols-1 gap-1.5 lg:grid-cols-4">
                      {group.rows.map((row) => (
                        <div key={`reconcile-draft-${row.item_id}`} className="rounded-lg border border-casa-border bg-casa-bg px-2 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-semibold text-casa-text">{row.name}</p>
                              <p className="text-[10px] text-casa-muted">
                                {row.package_unit || 'pack'}{row.package_size ? ` · ${row.package_size}` : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removePantryReconcileDraftRow(row.item_id)}
                              className="rounded-md border border-casa-border p-1 text-casa-muted hover:text-casa-error"
                              aria-label={`Remove ${row.name} from pantry restock review`}
                              title="Remove from review"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-1">
                            <button
                              type="button"
                              onClick={() => updatePantryReconcileRowStatus(row.item_id, 'out')}
                              className={cn(
                                'rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors',
                                row.review_status === 'out'
                                  ? 'border-red-300 bg-red-50 text-red-700'
                                  : 'border-casa-border bg-casa-surface text-casa-muted hover:bg-red-50/70'
                              )}
                            >
                              Out
                            </button>
                            <button
                              type="button"
                              onClick={() => updatePantryReconcileRowStatus(row.item_id, 'low')}
                              className={cn(
                                'rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors',
                                row.review_status === 'low'
                                  ? 'border-amber-300 bg-amber-50 text-amber-700'
                                  : 'border-casa-border bg-casa-surface text-casa-muted hover:bg-amber-50/70'
                              )}
                            >
                              Low
                            </button>
                            <button
                              type="button"
                              onClick={() => updatePantryReconcileRowStatus(row.item_id, 'ok')}
                              className={cn(
                                'rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors',
                                row.review_status === 'ok'
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                                  : 'border-casa-border bg-casa-surface text-casa-muted hover:bg-emerald-50/70'
                              )}
                            >
                              OK
                            </button>
                          </div>
                          {row.review_status === 'ok' && (
                            <div className="mt-1.5">
                              <button
                                type="button"
                                onClick={() => toggleReconcileQtyEditor(row.item_id)}
                                className="text-[10px] font-semibold text-casa-muted hover:text-casa-navy"
                              >
                                Qty: {row.package_count} {expandedReconcileQtyIds.has(row.item_id) ? '▲' : '▼'}
                              </button>
                              {expandedReconcileQtyIds.has(row.item_id) && (
                                <div className="mt-1 flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => updatePantryReconcileDraftRow(row.item_id, Math.max(0, row.package_count - 0.25))}
                                    className="rounded-md border border-casa-border bg-casa-surface p-1 text-casa-muted"
                                    aria-label={`Decrease ${row.name} restock quantity`}
                                  >
                                    <Minus size={11} />
                                  </button>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.25}
                                    value={row.package_count}
                                    onChange={(event) => updatePantryReconcileDraftRow(row.item_id, Number(event.target.value))}
                                    className="w-16 rounded-md border border-casa-border bg-casa-surface px-1 py-1 text-center text-[11px] text-casa-navy"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updatePantryReconcileDraftRow(row.item_id, row.package_count + 0.25)}
                                    className="rounded-md border border-casa-border bg-casa-surface p-1 text-casa-muted"
                                    aria-label={`Increase ${row.name} restock quantity`}
                                  >
                                    <Plus size={11} />
                                  </button>
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
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleReconcilePantryFromDone()}
                  disabled={reconcilingPantry}
                  className="px-3 py-1.5 rounded-button border border-casa-gold/40 bg-casa-gold/10 text-[11px] font-semibold text-casa-navy disabled:opacity-60"
                >
                  {reconcilingPantry ? 'Saving…' : 'Confirm restock'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPantryReconcileDraft(null)
                    setExpandedReconcileQtyIds(new Set())
                  }}
                  disabled={reconcilingPantry}
                  className="px-3 py-1.5 rounded-button border border-casa-border text-[11px] text-casa-muted disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
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
        ) : (
          groceryViewMode === 'manage' ? (
            items.length === 0 ? (
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
                        {splitCategoryLabel(cat.label)}
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
              <div className="columns-1 gap-3 lg:columns-2 2xl:columns-3">
                <AnimatePresence initial={false}>
                {activeItemsByCategory.map((cat) => ({
                  key: cat.key,
                  label: splitCategoryLabel(cat.label),
                  items: cat.items,
                  dropKey: cat.key,
                  visual: CATEGORY_VISUAL_BY_KEY[cat.key] ?? DEFAULT_CATEGORY_VISUAL,
                  reviewCount: cat.items.filter((item) =>
                    typeof item.enhancement_confidence === 'number' &&
                    item.enhancement_confidence < LOW_CONFIDENCE_REVIEW_THRESHOLD
                  ).length,
                })).map((section) => {
                  const CategoryIcon = section.visual.icon
                  return (
                    <motion.div
                      key={section.key}
                      layout
                      initial={false}
                      exit={{ opacity: 0, scale: 0.96, height: 0, marginBottom: 0, transition: { duration: 0.32, ease: 'easeInOut' } }}
                      transition={{ layout: { duration: 0.28, ease: 'easeInOut' } }}
                      data-drop-category={section.dropKey ?? undefined}
                      className={cn(
                        'mb-3 overflow-hidden break-inside-avoid rounded-2xl',
                        section.dropKey && dragState && dragOverCategory === section.dropKey && 'bg-casa-gold/5 ring-2 ring-casa-gold/60'
                      )}
                    >
                      <div className="overflow-hidden rounded-[1.2rem] border border-casa-border bg-casa-surface shadow-card">
                        <div className="flex items-start justify-between gap-3 border-b border-[#E7D3A3] bg-[linear-gradient(120deg,#F4E7CB,#EAD7AC)] px-4 py-3.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-casa-border/70"
                              style={{ backgroundColor: section.visual.iconBg, color: section.visual.iconFg }}
                            >
                              <CategoryIcon size={18} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-heading font-semibold leading-tight text-casa-navy">{section.label}</p>
                              <p className="mt-0.5 text-body-sm text-[#7A6742]">{section.visual.subtitle}</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-caption text-casa-muted">
                            {section.reviewCount > 0 && (
                              <span className="rounded-pill border border-[#B8E4E6] bg-[#E7F4F4] px-2.5 py-1 text-[10.5px] font-semibold text-[#0A6266]">
                                {section.reviewCount} suggested
                              </span>
                            )}
                            <span className="rounded-pill border border-[#D8C09A] bg-white/70 px-3 py-1 text-body-sm font-semibold text-[#5A4A2A]">
                              {section.items.length} item{section.items.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>
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
                    </motion.div>
                  )
                })}
                </AnimatePresence>
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
                            {splitCategoryLabel(cat.label)}
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
              <div className="h-24" />
          </div>
            )
          ) : (
            <div className="pt-3 pb-6">
              {hasSmartPicks ? (
                <div className="mt-2 space-y-3">
                  {weeklyAutoListCandidates.length > 0 && (
                    <div className="overflow-hidden rounded-[1.15rem] border border-[#E7D3A3] bg-[linear-gradient(120deg,#F4E7CB,#EAD7AC)] px-4 py-4 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="pr-1">
                          <p className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#8A5A1E]">
                            <Sparkles size={12} />
                            Auto weekly list
                          </p>
                          <h3 className="mt-1 text-xl font-display text-casa-navy">Your usual week, ready to add</h3>
                          <p className="mt-1 text-[12px] text-[#7A6742]">Built from your last 30 days of repeat buys.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleGenerateWeeklyList}
                          className="rounded-full bg-casa-navy px-4 py-2 text-[12px] font-semibold text-white transition-all hover:brightness-110"
                        >
                          Add all {weeklyAutoListCandidates.length} →
                        </button>
                      </div>
                      <div className="mt-3 hidden flex-wrap gap-2 md:flex">
                        {weeklyHeroPreviewItems.map((item) => (
                          <span
                            key={`weekly-${item.name}`}
                            className="rounded-full border border-[#D8C09A] bg-white/70 px-3 py-1.5 text-[12px] font-medium text-[#5A4A2A]"
                          >
                            {item.name}
                          </span>
                        ))}
                        {weeklyHeroOverflowCount > 0 && (
                          <span className="rounded-full border border-[#D8C09A] bg-white/70 px-3 py-1.5 text-[12px] font-medium text-[#5A4A2A]">
                            + {weeklyHeroOverflowCount} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {(pantryDepletionPredictions.length > 0 || activePredictionDeferralCount > 0) && (
                    <div className="rounded-2xl border border-casa-border bg-casa-surface p-4">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-casa-muted">
                          Pantry depletion predictions
                        </p>
                        {activePredictionDeferralCount > 0 && (
                          <button
                            type="button"
                            onClick={() => void clearPantryPredictionDeferrals()}
                            className="rounded-full border border-casa-border px-2.5 py-1 text-[10px] font-semibold text-casa-muted transition-colors hover:bg-casa-main"
                          >
                            Show deferred ({activePredictionDeferralCount})
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {pantryDepletionPredictions.slice(0, 4).map((prediction) => {
                          const visual = getDepletionVisual(prediction.daysUntil)
                          const cadenceMeterPercent = Math.max(
                            12,
                            Math.min(
                              100,
                              Math.round(((prediction.cadenceDays - Math.max(prediction.daysUntil, 0)) / Math.max(prediction.cadenceDays, 1)) * 100)
                            )
                          )
                          return (
                            <div key={`depletion-${prediction.name}`} className="flex items-center gap-3 border-t border-casa-divider px-1 py-2 first:border-t-0">
                              <Circle size={10} fill={visual.dotColor} color={visual.dotColor} className="shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[14px] font-semibold text-casa-navy">{prediction.name}</p>
                                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-casa-muted">
                                  <span>Cadence ~{prediction.cadenceDays}d</span>
                                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-casa-border/80">
                                    <span
                                      className="block h-full rounded-full"
                                      style={{ width: `${cadenceMeterPercent}%`, backgroundColor: visual.meterColor }}
                                    />
                                  </span>
                                </div>
                              </div>
                              <span
                                className="rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
                                style={{ backgroundColor: visual.tagBg, color: visual.tagText }}
                              >
                                {visual.dueLabel}
                              </span>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void deferPantryPrediction(prediction.name, GROCERY_PREDICTION_PUSH_DAYS, 'push')}
                                  title={`Push this prediction ${GROCERY_PREDICTION_PUSH_DAYS} days later`}
                                  className="inline-flex items-center gap-1 rounded-full border border-casa-border px-2.5 py-1.5 text-[10.5px] font-semibold text-casa-muted transition-colors hover:bg-casa-main"
                                >
                                  <Clock3 size={11} />
                                  +{GROCERY_PREDICTION_PUSH_DAYS}d
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deferPantryPrediction(prediction.name, GROCERY_PREDICTION_DISMISS_DAYS, 'dismiss')}
                                  title={`Dismiss this prediction for ${GROCERY_PREDICTION_DISMISS_DAYS} days`}
                                  className="rounded-full border border-casa-border px-2.5 py-1.5 text-[10.5px] font-semibold text-casa-muted transition-colors hover:bg-casa-main"
                                >
                                  {Math.round(GROCERY_PREDICTION_DISMISS_DAYS / 7)}w
                                </button>
                                <button
                                  type="button"
                                  onClick={() => addItemByName(prediction.name, { spotlightOnDuplicate: true, clearInput: true })}
                                  className="rounded-full border border-casa-border px-3 py-1.5 text-[11px] font-semibold text-casa-navy transition-colors hover:bg-casa-main"
                                >
                                  Add
                                </button>
                              </div>
                            </div>
                          )
                        })}
                        {pantryDepletionPredictions.length === 0 && activePredictionDeferralCount > 0 && (
                          <p className="px-1 py-2 text-[11px] text-casa-muted">
                            Predictions are currently deferred. Use “Show deferred” to bring them back now.
                          </p>
                        )}
                      </div>
                      <p className="mt-2 text-[10.5px] text-casa-muted">
                        Push items out a few days or dismiss for two weeks when you still have stock.
                      </p>
                    </div>
                  )}

                  {(predictiveSuggestions.length > 0 || smartRebuySuggestions.length > 0 || SMART_BUNDLES.length > 0) && (
                    <div className="rounded-2xl border border-casa-border bg-casa-surface p-4">
                      {predictiveSuggestions.length > 0 && (
                        <div className="mb-4">
                          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-casa-muted">Likely next adds</p>
                          <div className="flex flex-wrap gap-2">
                            {predictiveSuggestions.map((item) => (
                              <button
                                key={`predictive-${item.name}`}
                                type="button"
                                onClick={() => addItemByName(item.name, { spotlightOnDuplicate: true, clearInput: true })}
                                className="rounded-full border border-casa-border bg-casa-bg px-3 py-1.5 text-[12px] font-medium text-casa-text transition-colors hover:bg-casa-main"
                              >
                                <span className="mr-1.5 font-bold text-[#B08A34]">+</span>
                                {item.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {smartRebuySuggestions.length > 0 && (
                        <div className="mb-4">
                          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-casa-muted">Rebuy from your history</p>
                          <div className="flex flex-wrap gap-2">
                            {smartRebuySuggestions.map((item) => (
                              <button
                                key={`rebuy-${item.name}`}
                                type="button"
                                onClick={() => addItemByName(item.name, { spotlightOnDuplicate: true, clearInput: true })}
                                className="rounded-full border border-casa-border bg-casa-bg px-3 py-1.5 text-[12px] font-medium text-casa-text transition-colors hover:bg-casa-main"
                              >
                                <span className="mr-1.5 font-bold text-[#B08A34]">+</span>
                                {item.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {SMART_BUNDLES.length > 0 && (
                        <div>
                          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-casa-muted">1-tap bundles</p>
                          <div className="flex flex-wrap gap-2">
                            {SMART_BUNDLES.map((bundle) => (
                              <button
                                key={bundle.name}
                                type="button"
                                onClick={() => handleAddBundle(bundle.items)}
                                className="rounded-full border border-[#E7D3A3] bg-[#F4E7CB] px-3 py-1.5 text-[12px] font-semibold text-[#5A4A2A] transition-colors hover:bg-[#EFDFC0]"
                              >
                                <span className="mr-1.5 font-bold text-[#8A5A1E]">+</span>
                                {bundle.name}
                                <span className="ml-1.5 opacity-65">· {bundle.items.length}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-2 rounded-2xl border border-casa-border bg-casa-surface p-6 text-center">
                  <p className="text-body font-semibold text-casa-text">No smart picks yet</p>
                  <p className="mt-1 text-body-sm text-casa-muted">
                    Keep checking items off and syncing — predictions, rebuys, and bundles will appear here.
                  </p>
                </div>
              )}
              <div className="h-24" />
            </div>
          )
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
              onClick={() => {
                setAddPanelMode('recipe')
                if (!parsedRecipe) setRecipeImportStep(1)
              }}
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
            Tip: tap the sparkle in the top bar to ask Casa AI, then say “add milk, eggs, and bananas.”
          </p>
            </>
          )}

          {addPanelMode === 'recipe' && (
            <div>
              <div className="rounded-2xl border border-casa-border bg-casa-bg p-3">
                <p className="text-[11px] text-casa-muted mb-2">
                  {recipeImportStep === 1 ? 'Step 1 of 3 · Add sources' : recipeImportStep === 2 ? 'Step 2 of 3 · Confirm sources' : 'Step 3 of 3 · Review + save'}
                </p>
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
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => triggerFileInput(recipeFileInputRef)}
                    className={cn(
                      'px-3 py-1.5 rounded-pill border border-casa-border text-[11px] text-casa-muted hover:bg-casa-surface transition-colors inline-flex items-center gap-1 cursor-pointer',
                      recipeImporting && 'opacity-60 pointer-events-none',
                    )}
                  >
                    <Upload size={12} />
                    Upload file(s)
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerFileInput(recipeCameraInputRef)}
                    className={cn(
                      'px-3 py-1.5 rounded-pill border border-casa-border text-[11px] text-casa-muted hover:bg-casa-surface transition-colors inline-flex items-center gap-1 cursor-pointer',
                      recipeImporting && 'opacity-60 pointer-events-none',
                    )}
                  >
                    <Camera size={12} />
                    Take photo(s)
                  </button>
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
                          <button
                            type="button"
                            onClick={() => setRecipeMealPhotoIndex((current) => (current === index ? null : index))}
                            className="block w-full"
                          >
                            <img src={file.previewUrl} alt={file.name} className="h-16 w-full object-cover bg-casa-surface" loading="lazy" />
                            <span className={cn('block px-1 py-1 text-[10px] truncate text-left', selected ? 'text-casa-navy font-semibold' : 'text-casa-muted')}>
                              {selected ? 'Meal photo' : 'Mark meal'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRecipeImportFile(file.id)}
                            className="w-full border-t border-casa-divider px-1 py-1 text-[10px] text-casa-muted hover:bg-casa-bg"
                          >
                            Remove
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                {recipeImportFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setRecipeMealPhotoIndex(null)}
                    className={cn(
                      'mt-2 px-2.5 py-1.5 rounded-button border text-[11px] transition-colors',
                      recipeMealPhotoIndex === null
                        ? 'border-casa-gold bg-casa-gold/10 text-casa-navy font-semibold'
                        : 'border-casa-border text-casa-muted hover:bg-casa-surface',
                    )}
                  >
                    No meal photo
                  </button>
                )}
                <div className="mt-2 flex items-center justify-end gap-2">
                  {recipeImportStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setRecipeImportStep((current) => (current === 3 ? 2 : 1))}
                      className="px-3 py-1.5 rounded-pill border border-casa-border text-[11px] text-casa-muted hover:bg-casa-surface"
                    >
                      Back
                    </button>
                  )}
                  {recipeImportStep < 2 && (
                    <button
                      type="button"
                      disabled={!hasRecipeImportSource}
                      onClick={() => setRecipeImportStep(2)}
                      className="px-3 py-1.5 rounded-pill bg-casa-navy text-white text-[11px] font-semibold hover:bg-casa-navy/90 disabled:opacity-60"
                    >
                      Next
                    </button>
                  )}
                  {recipeImportStep === 2 && (
                    <button
                      type="button"
                      disabled={recipeImporting || !hasRecipeImportSource}
                      onClick={() => void runRecipeImportFromCurrentSources()}
                      className="px-3 py-1.5 rounded-pill bg-casa-navy text-white text-[11px] font-semibold hover:bg-casa-navy/90 disabled:opacity-60"
                    >
                      {recipeImporting ? 'Importing…' : 'Import'}
                    </button>
                  )}
                </div>
              </div>

              {recipeImporting && (
                <p className="mt-2 text-[11px] text-casa-muted animate-breathe">Extracting recipe…</p>
              )}
              {recipeImportError && (
                <p className="mt-2 text-[11px] text-casa-error">{recipeImportError}</p>
              )}

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
                      <p className="text-[11px] text-casa-muted">
                        {parsedRecipe.ingredients.length} ingredients · {parsedRecipe.steps.length} steps · {Math.round(parsedRecipe.confidence * 100)}% confidence
                        {parsedRecipe.servings ? ` · ${parsedRecipe.servings}` : ''}
                        {parsedRecipe.cook_time ? ` · ${parsedRecipe.cook_time}` : ''}
                      </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-casa-border bg-casa-bg p-2">
                    <p className="text-[11px] text-casa-muted mb-2">Recipe photos (cover image optional)</p>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="url"
                        value={recipeExtraImageUrl}
                        onChange={(event) => setRecipeExtraImageUrl(event.target.value)}
                        placeholder="https://.../another-photo.jpg"
                        className="flex-1 rounded-button border border-casa-border bg-casa-surface px-2.5 py-1.5 text-[11px] text-casa-text outline-none"
                      />
                      <button
                        type="button"
                        onClick={addRecipeImageUrl}
                        className="px-2.5 py-1.5 rounded-button border border-casa-border text-[11px] text-casa-navy hover:bg-casa-surface transition-colors"
                      >
                        Add image
                      </button>
                    </div>
                    {parsedRecipe.image_urls.length === 0 ? (
                      <p className="text-[11px] text-casa-muted">No images yet. Add one above.</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {parsedRecipe.image_urls.map((imageUrl, imageIndex) => {
                          const selected = parsedRecipe.primary_image_index !== null && imageIndex === parsedRecipe.primary_image_index
                          return (
                            <button
                              key={`${imageUrl}-${imageIndex}`}
                              type="button"
                              onClick={() => choosePrimaryRecipeImage(imageIndex)}
                              className={cn(
                                'rounded-lg overflow-hidden border text-left transition-colors',
                                selected ? 'border-casa-gold' : 'border-casa-border hover:border-casa-gold/40',
                              )}
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
                              <span className="block px-1.5 py-1 text-[10px] text-casa-muted">
                                {selected ? 'Meal cover' : 'Set as cover'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setParsedRecipe((current) => current ? { ...current, primary_image_index: null, image_url: null } : current)
                      }}
                      className={cn(
                        'mt-2 px-2.5 py-1.5 rounded-button border text-[11px] transition-colors',
                        parsedRecipe.primary_image_index === null
                          ? 'border-casa-gold bg-casa-gold/10 text-casa-navy font-semibold'
                          : 'border-casa-border text-casa-muted hover:bg-casa-surface',
                      )}
                    >
                      No meal photo
                    </button>
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
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-casa-muted">Directions (literal text, ordered)</p>
                        <button
                          type="button"
                          onClick={() => void runRecipeImportFromCurrentSources()}
                          disabled={recipeImporting}
                          className="px-2 py-1 rounded-pill border border-casa-border text-[10px] text-casa-navy hover:bg-casa-surface disabled:opacity-60"
                        >
                          {recipeImporting ? 'Re-extracting…' : 'Re-extract'}
                        </button>
                      </div>
                      <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                        {parsedRecipe.steps.map((step, stepIndex) => (
                          <div key={`${step.step_number}-${stepIndex}`} className="rounded-lg border border-casa-border bg-casa-surface px-2 py-1.5">
                            <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                              <p className="text-[10px] font-semibold text-casa-muted">Step {stepIndex + 1}</p>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveParsedStep(stepIndex, -1)}
                                  disabled={stepIndex === 0}
                                  className="px-1.5 py-0.5 rounded-pill border border-casa-border text-[10px] text-casa-muted hover:bg-casa-bg disabled:opacity-50"
                                >
                                  Up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveParsedStep(stepIndex, 1)}
                                  disabled={stepIndex >= parsedRecipe.steps.length - 1}
                                  className="px-1.5 py-0.5 rounded-pill border border-casa-border text-[10px] text-casa-muted hover:bg-casa-bg disabled:opacity-50"
                                >
                                  Down
                                </button>
                                <button
                                  type="button"
                                  onClick={() => addParsedStepAfter(stepIndex)}
                                  className="px-1.5 py-0.5 rounded-pill border border-casa-border text-[10px] text-casa-navy hover:bg-casa-bg"
                                >
                                  Add
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeParsedStep(stepIndex)}
                                  disabled={parsedRecipe.steps.length <= 1}
                                  className="px-1.5 py-0.5 rounded-pill border border-casa-border text-[10px] text-casa-error hover:bg-casa-bg disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                            <textarea
                              value={step.instruction}
                              onChange={(event) => updateParsedStep(stepIndex, event.target.value)}
                              rows={3}
                              className="w-full rounded-button border border-casa-border bg-casa-bg px-2 py-1 text-[11px] text-casa-text outline-none resize-y"
                            />
                          </div>
                        ))}
                        {parsedRecipe.steps.length === 0 && (
                          <button
                            type="button"
                            onClick={() => addParsedStepAfter(-1)}
                            className="w-full px-2 py-1.5 rounded-button border border-casa-border text-[11px] text-casa-navy hover:bg-casa-surface"
                          >
                            Add first step
                          </button>
                        )}
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
        onClick={() => setIsQuickAddOpen(true)}
        className="fixed right-5 bottom-[calc(var(--spacing-nav-height)+1rem+var(--vk-height,0px)+var(--vk-gap,0px))] lg:bottom-[calc(1.5rem+var(--vk-height,0px)+var(--vk-gap,0px))] z-[60] w-14 h-14 rounded-full bg-casa-gold text-casa-navy font-semibold border border-casa-gold/50 shadow-[0_1px_0_rgba(255,255,255,0.25)_inset] flex items-center justify-center hover:brightness-110 transition-all"
        aria-label="Quick add grocery item"
        title="Quick add"
      >
        <Plus size={24} />
      </button>
      <GroceryQuickAddSheet
        open={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        items={items}
        defaultListId={defaultListId}
        addItem={addItem}
        deleteItem={deleteItem}
        onOpenMore={() => {
          setAddPanelMode('recipe')
          if (!parsedRecipe) setRecipeImportStep(1)
          setIsAddPanelOpen(true)
        }}
      />
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
                {cookView.recipe.ingredients.map((ingredient, index) => {
                  const normalized = normalizeRecipeIngredientFields({
                    rawText: ingredient.raw_text,
                    name: ingredient.name,
                    quantity: ingredient.quantity,
                    unit: ingredient.unit,
                  })
                  return (
                    <div key={`${cookView.recipe.id}-${index}`} className="rounded-xl border border-casa-border bg-casa-bg px-2 py-1.5">
                      <p className="text-[11px] text-casa-text">
                        {[normalized.quantity, normalized.unit].filter(Boolean).join(' ')} {(normalized.name || ingredient.raw_text).trim()}
                      </p>
                    </div>
                  )
                })}
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
