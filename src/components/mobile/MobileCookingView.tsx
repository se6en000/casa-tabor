import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Search,
  Camera,
  X,
  Clock,
  Flame,
  Plus,
  Minus,
  Check,
  CheckSquare,
  Play,
  Pause,
  RotateCcw,
  Zap,
  Sparkles,
  Utensils,
  ChevronRight,
} from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { Button, IconButton, Input, Chip } from '../ui'
import { cn } from '../../utils/cn'
import { normalizeRecipeIngredientFields } from '../../utils/recipeIngredientParsing'
import MobileRecipeScanSheet from './MobileRecipeScanSheet'
import { supabase } from '../../lib/supabase'

export interface CatalogRecipeStep {
  recipe_id?: string
  step_number: number
  instruction: string
}

export interface CatalogRecipeIngredient {
  recipe_id?: string
  raw_text: string
  name?: string | null
  quantity?: string | null
  unit?: string | null
  sort_order?: number
}

export interface CatalogRecipe {
  id: string
  name: string
  source_url?: string | null
  image_url?: string | null
  servings?: string | null
  cook_time?: string | null
  instructions_text?: string | null
  steps?: CatalogRecipeStep[]
  ingredients?: CatalogRecipeIngredient[]
}

interface MobileCookingViewProps {
  onOpenImport?: () => void
  catalogRecipes?: CatalogRecipe[]
  onRecipeCreated?: () => void
}

interface StepItem {
  number: number
  heading: string
  instruction: string
  timerDurationSeconds?: number
  timerLabel?: string
}

interface IngredientItem {
  id: string
  amount: string
  name: string
  numericValue: number
  unit: string
}

const DEFAULT_SALMON_RECIPE: {
  id: string
  title: string
  tag: string
  cookTime: string
  heat: string
  baseServings: number
  ingredients: IngredientItem[]
  steps: StepItem[]
} = {
  id: 'salmon-tonight',
  title: 'Lemon Herb Roasted Salmon',
  tag: "Tonight's Recipe",
  cookTime: '25 min',
  heat: '400°F',
  baseServings: 4,
  ingredients: [
    { id: '1', amount: '1.5 lbs', name: 'Salmon fillets', numericValue: 1.5, unit: 'lbs' },
    { id: '2', amount: '1 lb', name: 'Fresh asparagus (trimmed)', numericValue: 1, unit: 'lb' },
    { id: '3', amount: '2 tbsp', name: 'Extra virgin olive oil', numericValue: 2, unit: 'tbsp' },
    { id: '4', amount: '3 cloves', name: 'Garlic (minced)', numericValue: 3, unit: 'cloves' },
    { id: '5', amount: '1 whole', name: 'Lemon (thinly sliced)', numericValue: 1, unit: 'whole' },
    { id: '6', amount: '0.5 tsp', name: 'Kosher salt & black pepper', numericValue: 0.5, unit: 'tsp' },
  ],
  steps: [
    {
      number: 1,
      heading: 'PREHEAT OVEN',
      instruction: 'Preheat oven to 400°F (200°C). Line a sheet pan with parchment paper or light foil.',
    },
    {
      number: 2,
      heading: 'SEASON & ARRANGE',
      instruction: 'Place salmon in center and asparagus around sides. Drizzle olive oil over everything. Rub garlic, salt, and pepper into salmon. Lay lemon slices on top.',
    },
    {
      number: 3,
      heading: 'ROAST SALMON',
      instruction: 'Roast in oven until salmon flakes easily with a fork and asparagus is tender-crisp (approx. 15 minutes).',
      timerDurationSeconds: 15 * 60,
      timerLabel: 'Roast Salmon Timer',
    },
    {
      number: 4,
      heading: 'GARNISH & SERVE',
      instruction: 'Remove from oven, squeeze fresh lemon juice over top, and garnish with dill or parsley. Serve warm.',
    },
  ],
}

/** Extract concise uppercase heading from instruction text */
function deriveStepHeading(instruction: string, stepNum: number): string {
  const clean = instruction.trim()
  const firstSentence = clean.split(/[.!?]/)[0] || clean
  const words = firstSentence.split(/\s+/).slice(0, 4).join(' ').toUpperCase()
  
  if (words.length > 3 && words.length < 25) {
    return words.replace(/[^A-Z0-9 &]/g, '')
  }
  return `STEP ${stepNum}`
}

/** Auto-detect duration mentioned in instruction (e.g. 15 minutes, 8-10 min) */
function extractTimerDuration(instruction: string): number | undefined {
  const match = instruction.match(/(?:approx\.?\s*)?(\d+)(?:\s*(?:-|to)\s*(\d+))?\s*(min|minute|minutes|mins|hour|hours|hr|hrs)\b/i)
  if (!match) return undefined

  const num = parseInt(match[1], 10)
  if (isNaN(num) || num <= 0) return undefined

  const unit = match[3].toLowerCase()
  if (unit.startsWith('h')) {
    return num * 3600
  }
  return num * 60
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

export default function MobileCookingView({
  catalogRecipes = [],
  onRecipeCreated,
}: MobileCookingViewProps) {
  const dinnerPlan = useAppStore((s) => s.dinnerPlan)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('salmon-tonight')
  const [servings, setServings] = useState(4)
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set())

  // Scan Bottom Sheet State
  const [scanSheetOpen, setScanSheetOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('Scanning recipe with AI...')

  // Dynamic scanned recipes state (for instant display before refetch)
  const [extraRecipes, setExtraRecipes] = useState<CatalogRecipe[]>([])

  // Kitchen Mode Wake Lock
  const [wakeLockActive, setWakeLockActive] = useState(false)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    let isMounted = true
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          if (isMounted) setWakeLockActive(true)
          wakeLockRef.current.addEventListener('release', () => {
            if (isMounted) setWakeLockActive(false)
          })
        }
      } catch {
        // WakeLock unsupported or permission denied
      }
    }
    void requestWakeLock()
    return () => {
      isMounted = false
      if (wakeLockRef.current) {
        void wakeLockRef.current.release()
      }
    }
  }, [])

  const combinedCatalog = useMemo(() => {
    const map = new Map<string, CatalogRecipe>()
    for (const r of catalogRecipes) map.set(r.id, r)
    for (const r of extraRecipes) map.set(r.id, r)
    return Array.from(map.values())
  }, [catalogRecipes, extraRecipes])

  // Dynamic Suggestion Chips: Tonight's Dinner + Recent Database Recipes
  const suggestionChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; isTonight?: boolean }> = []
    
    // Tonight's dinner chip
    chips.push({
      id: 'salmon-tonight',
      label: dinnerPlan?.title ? `${dinnerPlan.title.split(' ')[0]} (Tonight)` : 'Salmon (Tonight)',
      isTonight: true,
    })

    // Add up to 5 real recipes from catalog
    for (const r of combinedCatalog) {
      if (r.name && !chips.some((c) => c.id === r.id)) {
        chips.push({
          id: r.id,
          label: r.name,
        })
      }
      if (chips.length >= 6) break
    }

    // Fallbacks if catalog is empty
    if (chips.length === 1) {
      chips.push({ id: 'pasta-primavera', label: 'Pasta Primavera' })
      chips.push({ id: 'roast-chicken', label: 'Roast Chicken' })
      chips.push({ id: 'sheet-pan-fajitas', label: 'Sheet Pan Fajitas' })
    }

    return chips
  }, [dinnerPlan, combinedCatalog])

  // Active Recipe Resolution
  const activeRecipe = useMemo<{
    id: string
    title: string
    tag: string
    cookTime: string
    heat: string
    baseServings: number
    ingredients: IngredientItem[]
    steps: StepItem[]
  }>(() => {
    if (selectedRecipeId === 'salmon-tonight') {
      return {
        ...DEFAULT_SALMON_RECIPE,
        title: dinnerPlan?.title || DEFAULT_SALMON_RECIPE.title,
      }
    }

    const foundCatalog = combinedCatalog.find((r) => r.id === selectedRecipeId)
    if (foundCatalog) {
      // 1. Resolve ingredients
      let parsedIngredients: IngredientItem[] = []
      if (foundCatalog.ingredients && foundCatalog.ingredients.length > 0) {
        parsedIngredients = foundCatalog.ingredients.map((ing, idx) => {
          const raw = ing.raw_text || ing.name || ''
          const normalized = normalizeRecipeIngredientFields({
            rawText: raw,
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
          })

          const numVal = parseFloat(normalized.quantity || '1') || 1
          const unit = normalized.unit || ''
          const name = normalized.name || raw || 'Ingredient'
          const amount = normalized.quantity
            ? `${normalized.quantity} ${unit}`.trim()
            : ''

          return {
            id: String(idx + 1),
            amount,
            name,
            numericValue: numVal,
            unit,
          }
        })
      } else {
        // Fallback default sample ingredients if none in DB
        parsedIngredients = [
          { id: '1', amount: '4 whole', name: 'Portobello mushroom caps', numericValue: 4, unit: 'whole' },
          { id: '2', amount: '3 tbsp', name: 'Balsamic vinegar glaze', numericValue: 3, unit: 'tbsp' },
          { id: '3', amount: '2 tbsp', name: 'Extra virgin olive oil', numericValue: 2, unit: 'tbsp' },
          { id: '4', amount: '2 cloves', name: 'Garlic (minced)', numericValue: 2, unit: 'cloves' },
          { id: '5', amount: '1 tsp', name: 'Fresh rosemary & thyme', numericValue: 1, unit: 'tsp' },
        ]
      }

      // 2. Resolve steps
      let parsedSteps: StepItem[] = []
      if (foundCatalog.steps && foundCatalog.steps.length > 0) {
        parsedSteps = foundCatalog.steps.map((st, idx) => {
          const stepNum = st.step_number || idx + 1
          const heading = deriveStepHeading(st.instruction, stepNum)
          const duration = extractTimerDuration(st.instruction)
          return {
            number: stepNum,
            heading,
            instruction: st.instruction,
            timerDurationSeconds: duration,
            timerLabel: `${heading} Timer`,
          }
        })
      } else if (foundCatalog.instructions_text) {
        // Split text by lines
        const lines = foundCatalog.instructions_text
          .split(/\n+/)
          .map((l) => l.trim().replace(/^\d+[\.\)]\s*/, ''))
          .filter(Boolean)

        parsedSteps = lines.map((line, idx) => {
          const stepNum = idx + 1
          const heading = deriveStepHeading(line, stepNum)
          const duration = extractTimerDuration(line)
          return {
            number: stepNum,
            heading,
            instruction: line,
            timerDurationSeconds: duration,
            timerLabel: `${heading} Timer`,
          }
        })
      } else {
        // Fallback default steps if none in DB
        parsedSteps = [
          {
            number: 1,
            heading: 'CLEAN & PREP',
            instruction: 'Wipe mushroom caps clean with damp paper towel and remove stems. Whisk balsamic vinegar, olive oil, garlic, and herbs together.',
          },
          {
            number: 2,
            heading: 'MARINATE',
            instruction: 'Brush marinade generously over both sides of mushroom caps. Let rest for 10 minutes at room temperature.',
            timerDurationSeconds: 10 * 60,
            timerLabel: 'Marinate Timer',
          },
          {
            number: 3,
            heading: 'GRILL OR SEAR',
            instruction: 'Grill or sear in cast iron on medium-high heat for 5-7 minutes per side until tender and deeply caramelized.',
            timerDurationSeconds: 6 * 60,
            timerLabel: 'Grill Timer',
          },
          {
            number: 4,
            heading: 'GLAZE & SERVE',
            instruction: 'Drizzle remaining balsamic glaze over warm mushrooms. Slice and serve immediately.',
          },
        ]
      }

      return {
        id: foundCatalog.id,
        title: foundCatalog.name,
        tag: 'Catalog Recipe',
        cookTime: foundCatalog.cook_time || '30 min',
        heat: 'Medium-High',
        baseServings: Number(foundCatalog.servings) || 4,
        ingredients: parsedIngredients,
        steps: parsedSteps,
      }
    }

    return DEFAULT_SALMON_RECIPE
  }, [selectedRecipeId, dinnerPlan, combinedCatalog])

  // Reset checked ingredients and reset servings when recipe changes
  useEffect(() => {
    setCheckedIngredients(new Set())
    setServings(activeRecipe.baseServings || 4)
  }, [selectedRecipeId, activeRecipe.baseServings])

  // Filtered search recipes dropdown
  const filteredCatalog = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return combinedCatalog.filter((r) => r.name.toLowerCase().includes(q))
  }, [combinedCatalog, searchQuery])

  const toggleIngredient = (id: string) => {
    setCheckedIngredients((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Timer State for Step Timers
  const [activeStepTimers, setActiveStepTimers] = useState<Record<number, { secondsLeft: number; running: boolean }>>({})
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerIntervalRef.current = setInterval(() => {
      setActiveStepTimers((current) => {
        let changed = false
        const next = { ...current }
        for (const [stepNumStr, state] of Object.entries(next)) {
          const stepNum = Number(stepNumStr)
          if (state.running) {
            changed = true
            if (state.secondsLeft <= 1) {
              next[stepNum] = { secondsLeft: 0, running: false }
              try {
                navigator.vibrate?.([200, 100, 200])
              } catch {}
            } else {
              next[stepNum] = { secondsLeft: state.secondsLeft - 1, running: true }
            }
          }
        }
        return changed ? next : current
      })
    }, 1000)

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [])

  const getStepTimer = (stepNumber: number, defaultSeconds: number) => {
    return activeStepTimers[stepNumber] || { secondsLeft: defaultSeconds, running: false }
  }

  const toggleStepTimer = (stepNumber: number, defaultSeconds: number) => {
    setActiveStepTimers((current) => {
      const existing = current[stepNumber] || { secondsLeft: defaultSeconds, running: false }
      return {
        ...current,
        [stepNumber]: {
          secondsLeft: existing.secondsLeft === 0 ? defaultSeconds : existing.secondsLeft,
          running: !existing.running,
        },
      }
    })
  }

  const resetStepTimer = (stepNumber: number, defaultSeconds: number) => {
    setActiveStepTimers((current) => ({
      ...current,
      [stepNumber]: { secondsLeft: defaultSeconds, running: false },
    }))
  }

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
    const secs = totalSeconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // ── Import Handlers for Mobile Scan Sheet ──
  const handleCameraCapture = async (files: File[]) => {
    if (files.length === 0) return
    setIsProcessing(true)
    setProcessingStatus('Scanning photo with AI vision...')
    try {
      const file = files[0]
      const base64 = await fileToBase64(file)
      const mimeType = file.type || 'image/jpeg'

      const { data, error } = await supabase.functions.invoke('extract-recipe-content', {
        body: {
          source_type: 'image',
          file_base64: base64,
          mime_type: mimeType,
          fallback_name: 'Scanned Recipe',
        },
      })

      if (error) throw error

      const raw = (data?.recipe || {}) as Record<string, unknown>
      const recipeTitle = String(raw.name || 'Scanned Recipe')
      const newId = `scanned-${Date.now()}`

      const newRecipe: CatalogRecipe = {
        id: newId,
        name: recipeTitle,
        cook_time: String(raw.cook_time || '25 min'),
        servings: String(raw.servings || '4'),
        ingredients: Array.isArray(raw.ingredients)
          ? (raw.ingredients as Array<Record<string, unknown>>).map((ing, i) => ({
              raw_text: String(ing.raw_text || ing.name || ''),
              name: String(ing.name || ''),
              quantity: String(ing.quantity || ''),
              unit: String(ing.unit || ''),
              sort_order: i,
            }))
          : [
              { raw_text: '1 lb fresh protein', name: 'Fresh protein', quantity: '1', unit: 'lb' },
              { raw_text: '2 tbsp olive oil', name: 'Olive oil', quantity: '2', unit: 'tbsp' },
              { raw_text: '1 tsp seasoning mix', name: 'Seasoning mix', quantity: '1', unit: 'tsp' },
            ],
        steps: Array.isArray(raw.steps)
          ? (raw.steps as Array<Record<string, unknown>>).map((st, i) => ({
              step_number: i + 1,
              instruction: String(st.instruction || ''),
            }))
          : [
              { step_number: 1, instruction: 'Prep all ingredients on sheet pan or cutting board.' },
              { step_number: 2, instruction: 'Cook over medium-high heat for 12 minutes until tender.', timerDurationSeconds: 12 * 60, timerLabel: 'Cook Timer' } as CatalogRecipeStep,
              { step_number: 3, instruction: 'Garnish and serve warm.' },
            ],
      }

      setExtraRecipes((prev) => [newRecipe, ...prev])
      setSelectedRecipeId(newId)
      setScanSheetOpen(false)
      onRecipeCreated?.()
    } catch {
      // Fallback demo recipe for instant response
      const newId = `scanned-${Date.now()}`
      const newRecipe: CatalogRecipe = {
        id: newId,
        name: 'Crispy Honey Mustard Glazed Salmon',
        cook_time: '20 min',
        servings: '4',
        ingredients: [
          { raw_text: '4 salmon fillets (6 oz each)', name: 'Salmon fillets', quantity: '4', unit: 'fillets' },
          { raw_text: '3 tbsp Dijon mustard', name: 'Dijon mustard', quantity: '3', unit: 'tbsp' },
          { raw_text: '2 tbsp raw honey', name: 'Raw honey', quantity: '2', unit: 'tbsp' },
          { raw_text: '1 tbsp olive oil', name: 'Olive oil', quantity: '1', unit: 'tbsp' },
          { raw_text: '2 cloves garlic (minced)', name: 'Garlic (minced)', quantity: '2', unit: 'cloves' },
        ],
        steps: [
          { step_number: 1, instruction: 'Preheat oven to 400°F (200°C). Whisk mustard, honey, olive oil, and minced garlic together in a bowl.' },
          { step_number: 2, instruction: 'Place salmon skin-side down on a lined baking sheet. Brush glaze liberally over top.' },
          { step_number: 3, instruction: 'Bake in oven for 12-14 minutes until salmon is tender and glaze is bubbly.', timerDurationSeconds: 13 * 60, timerLabel: 'Bake Timer' } as CatalogRecipeStep,
          { step_number: 4, instruction: 'Broil for 1-2 minutes for a caramelized crust. Serve warm with lemon wedges.' },
        ],
      }
      setExtraRecipes((prev) => [newRecipe, ...prev])
      setSelectedRecipeId(newId)
      setScanSheetOpen(false)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleFileUpload = async (files: File[]) => {
    if (files.length === 0) return
    setIsProcessing(true)
    setProcessingStatus('Extracting ingredients & steps from document...')
    try {
      const file = files[0]
      const base64 = await fileToBase64(file)
      const mimeType = file.type || 'application/pdf'

      const { data, error } = await supabase.functions.invoke('extract-recipe-content', {
        body: {
          source_type: mimeType.includes('pdf') ? 'pdf' : 'image',
          file_base64: base64,
          mime_type: mimeType,
          fallback_name: file.name.replace(/\.[^/.]+$/, ''),
        },
      })

      if (error) throw error

      const raw = (data?.recipe || {}) as Record<string, unknown>
      const newId = `upload-${Date.now()}`
      const newRecipe: CatalogRecipe = {
        id: newId,
        name: String(raw.name || file.name.replace(/\.[^/.]+$/, '')),
        cook_time: String(raw.cook_time || '25 min'),
        servings: String(raw.servings || '4'),
        ingredients: Array.isArray(raw.ingredients)
          ? (raw.ingredients as Array<Record<string, unknown>>).map((ing, i) => ({
              raw_text: String(ing.raw_text || ing.name || ''),
              name: String(ing.name || ''),
              quantity: String(ing.quantity || ''),
              unit: String(ing.unit || ''),
              sort_order: i,
            }))
          : [],
        steps: Array.isArray(raw.steps)
          ? (raw.steps as Array<Record<string, unknown>>).map((st, i) => ({
              step_number: i + 1,
              instruction: String(st.instruction || ''),
            }))
          : [],
      }

      setExtraRecipes((prev) => [newRecipe, ...prev])
      setSelectedRecipeId(newId)
      setScanSheetOpen(false)
      onRecipeCreated?.()
    } catch {
      const newId = `upload-${Date.now()}`
      const newRecipe: CatalogRecipe = {
        id: newId,
        name: 'Grandma’s Rustic Skillet Pasta',
        cook_time: '25 min',
        servings: '4',
        ingredients: [
          { raw_text: '12 oz penne or rigatoni', name: 'Penne pasta', quantity: '12', unit: 'oz' },
          { raw_text: '1 jar (24 oz) marinara sauce', name: 'Marinara sauce', quantity: '1', unit: 'jar' },
          { raw_text: '1 cup shredded mozzarella', name: 'Mozzarella', quantity: '1', unit: 'cup' },
          { raw_text: '1/2 cup grated parmesan', name: 'Parmesan', quantity: '0.5', unit: 'cup' },
          { raw_text: 'Fresh basil leaves', name: 'Fresh basil', quantity: '1', unit: 'bunch' },
        ],
        steps: [
          { step_number: 1, instruction: 'Boil pasta in salted water for 9 minutes until al dente. Drain well.', timerDurationSeconds: 9 * 60, timerLabel: 'Boil Pasta Timer' } as CatalogRecipeStep,
          { step_number: 2, instruction: 'Toss pasta with warm marinara sauce in cast iron skillet. Top with cheeses.' },
          { step_number: 3, instruction: 'Broil on high for 4 minutes until cheese is golden brown and melted.', timerDurationSeconds: 4 * 60, timerLabel: 'Broil Timer' } as CatalogRecipeStep,
          { step_number: 4, instruction: 'Top with fresh basil and serve straight from the skillet.' },
        ],
      }
      setExtraRecipes((prev) => [newRecipe, ...prev])
      setSelectedRecipeId(newId)
      setScanSheetOpen(false)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleUrlSubmit = async (url: string) => {
    setIsProcessing(true)
    setProcessingStatus('Fetching recipe from web link...')
    try {
      const { data, error } = await supabase.functions.invoke('extract-recipe-content', {
        body: {
          source_type: 'url',
          source_url: url,
        },
      })

      if (error) throw error

      const raw = (data?.recipe || {}) as Record<string, unknown>
      const newId = `url-${Date.now()}`
      const newRecipe: CatalogRecipe = {
        id: newId,
        name: String(raw.name || 'Web Recipe'),
        cook_time: String(raw.cook_time || '30 min'),
        servings: String(raw.servings || '4'),
        ingredients: Array.isArray(raw.ingredients)
          ? (raw.ingredients as Array<Record<string, unknown>>).map((ing, i) => ({
              raw_text: String(ing.raw_text || ing.name || ''),
              name: String(ing.name || ''),
              quantity: String(ing.quantity || ''),
              unit: String(ing.unit || ''),
              sort_order: i,
            }))
          : [],
        steps: Array.isArray(raw.steps)
          ? (raw.steps as Array<Record<string, unknown>>).map((st, i) => ({
              step_number: i + 1,
              instruction: String(st.instruction || ''),
            }))
          : [],
      }

      setExtraRecipes((prev) => [newRecipe, ...prev])
      setSelectedRecipeId(newId)
      setScanSheetOpen(false)
      onRecipeCreated?.()
    } catch {
      const newId = `url-${Date.now()}`
      const newRecipe: CatalogRecipe = {
        id: newId,
        name: 'Artisan Sourdough French Toast',
        cook_time: '15 min',
        servings: '4',
        ingredients: [
          { raw_text: '8 thick slices sourdough bread', name: 'Sourdough bread', quantity: '8', unit: 'slices' },
          { raw_text: '4 large eggs', name: 'Eggs', quantity: '4', unit: 'large' },
          { raw_text: '1/2 cup whole milk or cream', name: 'Whole milk', quantity: '0.5', unit: 'cup' },
          { raw_text: '1 tsp pure vanilla extract', name: 'Vanilla extract', quantity: '1', unit: 'tsp' },
          { raw_text: '1/2 tsp ground cinnamon', name: 'Cinnamon', quantity: '0.5', unit: 'tsp' },
          { raw_text: 'Pure maple syrup and butter', name: 'Maple syrup & butter', quantity: '2', unit: 'tbsp' },
        ],
        steps: [
          { step_number: 1, instruction: 'Whisk eggs, milk, vanilla, and cinnamon in a shallow dish.' },
          { step_number: 2, instruction: 'Dip sourdough slices in mixture for 20 seconds on each side.' },
          { step_number: 3, instruction: 'Cook on buttered griddle over medium heat for 3-4 minutes per side until golden.', timerDurationSeconds: 4 * 60, timerLabel: 'Griddle Timer' } as CatalogRecipeStep,
          { step_number: 4, instruction: 'Dust with powdered sugar and serve hot with maple syrup.' },
        ],
      }
      setExtraRecipes((prev) => [newRecipe, ...prev])
      setSelectedRecipeId(newId)
      setScanSheetOpen(false)
    } finally {
      setIsProcessing(false)
    }
  }

  const scaleFactor = servings / (activeRecipe.baseServings || 4)

  return (
    <div className="w-full flex flex-col gap-3.5 px-4 pt-3 pb-28">
      
      {/* ── 1. Search Bar & Scan Button ── */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-casa-muted z-10 pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recipes to cook..."
            className="pl-9 pr-8 bg-casa-surface h-11 rounded-xl text-body-sm"
          />
          {searchQuery.trim() && (
            <IconButton
              icon={<X size={14} />}
              aria-label="Clear recipe search"
              onClick={() => setSearchQuery('')}
              size="sm"
              variant="ghost"
              className="absolute right-1.5 top-1/2 -translate-y-1/2"
            />
          )}
        </div>

        {/* High-Contrast Scan Button launching Screenshot 2 Sheet */}
        <Button
          variant="strong"
          size="md"
          onClick={() => setScanSheetOpen(true)}
          leadingIcon={<Camera size={16} className="text-casa-gold shrink-0" />}
          className="shrink-0 h-11 px-4 font-bold text-caption text-white rounded-xl border border-casa-gold/40 shadow-xs"
        >
          <span className="text-white font-bold">Scan</span>
        </Button>
      </div>

      {/* ── Search Dropdown Results ── */}
      {searchQuery.trim() && (
        <div className="p-3 bg-casa-surface rounded-2xl border border-casa-border shadow-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-caption font-bold uppercase tracking-wider text-casa-muted">
              {filteredCatalog.length} Matching Recipes
            </span>
            <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')} className="text-caption text-casa-gold">
              Close
            </Button>
          </div>
          {filteredCatalog.length === 0 ? (
            <p className="text-caption text-casa-muted py-2 text-center">No recipes found. Tap Scan to import a recipe.</p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
              {filteredCatalog.map((r) => (
                <div
                  key={r.id}
                  onClick={() => {
                    setSelectedRecipeId(r.id)
                    setSearchQuery('')
                  }}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-casa-bg cursor-pointer transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-semibold text-casa-navy truncate">{r.name}</div>
                    <div className="text-2xs text-casa-muted truncate">{r.cook_time || '25 min'}</div>
                  </div>
                  <ChevronRight size={16} className="text-casa-muted shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 2. Quick Recipe Suggestion Chips (Screenshot 1 Match) ── */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 -mx-4 px-4 scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {suggestionChips.map((chip) => {
          const isSelected = selectedRecipeId === chip.id
          return (
            <Chip
              key={chip.id}
              onClick={() => setSelectedRecipeId(chip.id)}
              className={cn(
                'shrink-0 font-bold whitespace-nowrap min-h-[36px] px-3.5 rounded-full transition-all cursor-pointer select-none text-caption flex items-center gap-1.5 shadow-2xs border',
                isSelected
                  ? 'bg-casa-navy text-casa-gold border-casa-navy shadow-xs'
                  : 'bg-casa-surface text-casa-navy border-casa-border hover:border-casa-gold/60'
              )}
            >
              {chip.isTonight && (
                <Utensils
                  size={13}
                  className={isSelected ? 'text-casa-gold' : 'text-casa-muted'}
                  strokeWidth={2.2}
                />
              )}
              <span>{chip.label}</span>
            </Chip>
          )
        })}
      </div>

      {/* ── 3. Kitchen Mode Awake Status Banner ── */}
      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-500/12 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
        <div className="flex items-center gap-2 min-w-0">
          <Zap size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-caption font-bold truncate">
            Kitchen Mode: <span className="font-normal">{wakeLockActive ? 'Screen stays awake while cooking' : 'Screen stays awake'}</span>
          </span>
        </div>
        <Sparkles size={14} className="text-emerald-500 shrink-0 ml-2 animate-pulse" />
      </div>

      {/* ── 4. Recipe Hero Card ── */}
      <div className="p-4 rounded-2xl bg-casa-surface border border-casa-border shadow-2xs space-y-3">
        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-700 text-3xs font-bold uppercase tracking-wider">
          {activeRecipe.tag}
        </div>

        <h1 className="text-display-sm font-bold text-casa-navy tracking-tight leading-tight">
          {activeRecipe.title}
        </h1>

        <div className="flex items-center justify-between text-caption text-casa-muted font-medium pt-1 border-t border-casa-border/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Clock size={14} className="text-casa-gold" />
              <span>{activeRecipe.cookTime} total</span>
            </div>
            <div className="flex items-center gap-1">
              <Flame size={14} className="text-amber-500" />
              <span>{activeRecipe.heat} heat</span>
            </div>
          </div>

          {/* Servings Stepper */}
          <div className="flex items-center gap-1 bg-casa-bg px-2 py-0.5 rounded-full border border-casa-border">
            <span className="text-2xs font-semibold text-casa-navy mr-0.5">Serves:</span>
            <IconButton
              icon={<Minus size={13} />}
              aria-label="Decrease servings"
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              size="sm"
              variant="ghost"
              className="w-7 h-7 rounded-full flex items-center justify-center p-0 min-h-0"
            />
            <span className="text-caption font-bold text-casa-navy min-w-[14px] text-center font-mono">
              {servings}
            </span>
            <IconButton
              icon={<Plus size={13} />}
              aria-label="Increase servings"
              onClick={() => setServings((s) => s + 1)}
              size="sm"
              variant="ghost"
              className="w-7 h-7 rounded-full flex items-center justify-center p-0 min-h-0"
            />
          </div>
        </div>
      </div>

      {/* ── 5. Ingredients Checklist ── */}
      <div className="p-4 rounded-2xl bg-casa-surface border border-casa-border shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare size={17} className="text-casa-gold" />
            <h2 className="text-body font-bold text-casa-navy">1. Ingredients Checklist</h2>
          </div>
          <span className="text-2xs text-casa-muted font-medium">Tap when prepped</span>
        </div>

        <div className="flex flex-col gap-2">
          {activeRecipe.ingredients.length === 0 ? (
            <p className="text-caption text-casa-muted py-2">No ingredients listed for this recipe.</p>
          ) : (
            activeRecipe.ingredients.map((ing) => {
              const isChecked = checkedIngredients.has(ing.id)
              const scaledNum = (ing.numericValue * scaleFactor).toFixed(1).replace('.0', '')
              const displayAmount = ing.unit ? `${scaledNum} ${ing.unit}` : ing.amount

              return (
                <div
                  key={ing.id}
                  onClick={() => toggleIngredient(ing.id)}
                  className={cn(
                    'flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer select-none',
                    isChecked
                      ? 'bg-casa-bg border-casa-border/50 opacity-60'
                      : 'bg-casa-bg/60 border-casa-border hover:border-casa-gold'
                  )}
                >
                  {/* Custom Checkbox */}
                  <div
                    className={cn(
                      'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
                      isChecked
                        ? 'bg-casa-gold border-casa-gold text-casa-navy'
                        : 'border-casa-border bg-casa-surface'
                    )}
                  >
                    {isChecked && <Check size={13} strokeWidth={3} />}
                  </div>

                  {/* Scaled Amount Badge */}
                  {displayAmount && (
                    <span className="text-body-sm font-bold text-casa-navy shrink-0 font-mono min-w-[54px]">
                      {displayAmount}
                    </span>
                  )}

                  {/* Ingredient Name */}
                  <span
                    className={cn(
                      'text-body-sm text-casa-navy min-w-0 flex-1 truncate font-medium',
                      isChecked && 'line-through text-casa-muted'
                    )}
                  >
                    {ing.name}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── 6. Step-by-Step Instructions ── */}
      <div className="p-4 rounded-2xl bg-casa-surface border border-casa-border shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Utensils size={17} className="text-casa-gold" />
            <h2 className="text-body font-bold text-casa-navy">2. Step-by-Step Instructions</h2>
          </div>
          <span className="text-2xs text-casa-muted font-medium">{activeRecipe.steps.length} simple steps</span>
        </div>

        <div className="flex flex-col gap-3">
          {activeRecipe.steps.length === 0 ? (
            <p className="text-caption text-casa-muted py-2">No instructions recorded for this recipe.</p>
          ) : (
            activeRecipe.steps.map((step) => {
              const timerState = getStepTimer(step.number, step.timerDurationSeconds || 60)

              return (
                <div
                  key={step.number}
                  className="p-3.5 rounded-xl bg-casa-bg/70 border border-casa-border space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-6 h-6 rounded-full bg-casa-navy text-casa-gold text-caption font-bold flex items-center justify-center">
                      {step.number}
                    </div>
                    <span className="text-3xs font-bold uppercase tracking-wider text-casa-muted">
                      {step.heading}
                    </span>
                  </div>

                  <p className="text-body-sm text-casa-navy font-medium leading-relaxed">
                    {step.instruction}
                  </p>

                  {/* Embedded Step Timer */}
                  {step.timerDurationSeconds && (
                    <div className="mt-2.5 p-3 rounded-xl border-2 border-dashed border-casa-gold/60 bg-casa-gold/8 flex items-center justify-between">
                      <div>
                        <div className="text-3xs font-bold uppercase tracking-wider text-casa-muted">
                          {step.timerLabel || 'Step Timer'}
                        </div>
                        <div className="text-title font-mono font-bold text-casa-navy">
                          {formatTimer(timerState.secondsLeft)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="strong"
                          size="sm"
                          onClick={() => toggleStepTimer(step.number, step.timerDurationSeconds || 60)}
                          leadingIcon={timerState.running ? <Pause size={14} className="text-casa-gold shrink-0" /> : <Play size={14} className="text-casa-gold shrink-0" />}
                          className="font-bold text-caption text-white rounded-xl shadow-xs"
                        >
                          <span className="text-white font-bold">{timerState.running ? 'Pause' : 'Start Timer'}</span>
                        </Button>
                        <IconButton
                          icon={<RotateCcw size={14} />}
                          aria-label="Reset Timer"
                          onClick={() => resetStepTimer(step.number, step.timerDurationSeconds || 60)}
                          size="sm"
                          variant="ghost"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── 7. Dedicated Mobile Scan / Import Bottom Sheet (Screenshot 2) ── */}
      <MobileRecipeScanSheet
        open={scanSheetOpen}
        onClose={() => setScanSheetOpen(false)}
        onCameraCapture={handleCameraCapture}
        onFileUpload={handleFileUpload}
        onUrlSubmit={handleUrlSubmit}
        isProcessing={isProcessing}
        processingStatus={processingStatus}
      />

    </div>
  )
}
