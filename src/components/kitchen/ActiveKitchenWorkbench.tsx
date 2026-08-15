import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  PartyPopper,
  RotateCcw,
  Star,
} from 'lucide-react'
import KitchenHeaderHUD, { type KitchenTimer } from './KitchenHeaderHUD'
import KitchenMiseEnPlaceShelf, { type KitchenIngredientRow } from './KitchenMiseEnPlaceShelf'
import KitchenStepFocusHUD, { type NeededIngredientChip } from './KitchenStepFocusHUD'
import KitchenSousChefSidecar from './KitchenSousChefSidecar'
import { Button, Card, IconButton, SegmentedControl } from '../ui'
import { cn } from '../../utils/cn'

export interface ActiveKitchenRecipe {
  id: string
  name: string
  cook_time?: string | null
  servings?: string | null
  image_url?: string | null
  source_url?: string | null
}

export interface ActiveKitchenIngredient {
  id: string
  name: string | null
  quantity: string | null
  unit: string | null
  raw_text: string
  sort_order?: number
}

export interface ActiveKitchenStep {
  step_number: number
  instruction: string
}

interface ActiveKitchenWorkbenchProps {
  recipe: ActiveKitchenRecipe
  ingredients: ActiveKitchenIngredient[]
  steps: ActiveKitchenStep[]
  initialStepIndex?: number
  onExit: () => void
  onCompleteMeal?: (rating?: number) => void
  onEditRecipe?: () => void
  className?: string
}

export default function ActiveKitchenWorkbench({
  recipe,
  ingredients,
  steps,
  initialStepIndex = 0,
  onExit,
  onCompleteMeal,
  onEditRecipe,
  className,
}: ActiveKitchenWorkbenchProps) {
  const [stepIndex, setStepIndex] = useState(initialStepIndex)
  const [viewMode, setViewMode] = useState<'step' | 'all'>('step')
  const [recipeScale, setRecipeScale] = useState<'0.5' | '1' | '2'>('1')
  const [checkedIngredientIds, setCheckedIngredientIds] = useState<Set<string>>(new Set())
  const [timers, setTimers] = useState<KitchenTimer[]>([])
  const [isSousChefOpen, setIsSousChefOpen] = useState(true)
  const [mobileActiveTab, setMobileActiveTab] = useState<'step' | 'mise' | 'chef'>('step')
  const [mealCompleted, setMealCompleted] = useState(false)
  const [mealRating, setMealRating] = useState<number | null>(null)

  // Timer Tick Engine: ticks running timers every 1s
  useEffect(() => {
    const hasRunningTimers = timers.some((t) => t.isRunning && !t.isCompleted)
    if (!hasRunningTimers) return

    const interval = setInterval(() => {
      setTimers((prev) =>
        prev.map((timer) => {
          if (!timer.isRunning || timer.isCompleted) return timer
          const nextRemaining = timer.remainingSeconds - 1
          if (nextRemaining <= 0) {
            return {
              ...timer,
              remainingSeconds: 0,
              isRunning: false,
              isCompleted: true,
            }
          }
          return {
            ...timer,
            remainingSeconds: nextRemaining,
          }
        })
      )
    }, 1000)

    return () => clearInterval(interval)
  }, [timers])

  // Timer Handlers
  const handleAddTimer = useCallback((label: string, durationSeconds: number) => {
    const newTimer: KitchenTimer = {
      id: `timer-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      label,
      durationSeconds,
      remainingSeconds: durationSeconds,
      isRunning: true,
      isCompleted: false,
    }
    setTimers((prev) => [...prev, newTimer])
  }, [])

  const handleToggleTimer = useCallback((id: string) => {
    setTimers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isRunning: !t.isRunning } : t))
    )
  }, [])

  const handleResetTimer = useCallback((id: string) => {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, remainingSeconds: t.durationSeconds, isRunning: false, isCompleted: false }
          : t
      )
    )
  }, [])

  const handleRemoveTimer = useCallback((id: string) => {
    setTimers((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Scale quantity calculation helper
  const scaleQuantity = useCallback(
    (qty: string | null, scale: number) => {
      if (!qty) return qty
      const trimmed = qty.trim()
      if (Math.abs(scale - 1) < 0.001) return trimmed

      const parsedNum = parseFloat(trimmed)
      if (Number.isFinite(parsedNum) && parsedNum > 0) {
        const scaled = parsedNum * scale
        if (Math.abs(Math.round(scaled) - scaled) < 0.05) {
          return String(Math.round(scaled))
        }
        return scaled < 1 ? scaled.toFixed(2) : scaled.toFixed(1)
      }
      return trimmed
    },
    []
  )

  // Current Step Item
  const currentStep = steps[stepIndex]

  // Formatted Ingredients with scaling & current step highlight
  const formattedIngredients: KitchenIngredientRow[] = useMemo(() => {
    const multiplier = Number(recipeScale)
    const currentStepText = (currentStep?.instruction ?? '').toLowerCase()

    return ingredients.map((ing) => {
      const name = ing.name || ing.raw_text
      const scaledQty = ing.quantity ? scaleQuantity(ing.quantity, multiplier) : null
      const formattedQty = [scaledQty, ing.unit].filter(Boolean).join(' ').trim() || null

      // Check if ingredient name words appear in active step instruction
      const nameWords = (ing.name || '')
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
      const isNeeded = nameWords.some((w) => currentStepText.includes(w))

      return {
        id: ing.id,
        name: name,
        qty: formattedQty,
        rawText: ing.raw_text,
        isNeededForCurrentStep: isNeeded,
      }
    })
  }, [ingredients, recipeScale, scaleQuantity, currentStep])

  // Needed Now chips for the center step HUD
  const neededNowChips: NeededIngredientChip[] = useMemo(() => {
    return formattedIngredients
      .filter((ing) => ing.isNeededForCurrentStep)
      .map((ing) => ({
        id: ing.id,
        name: ing.name,
        qty: ing.qty,
      }))
  }, [formattedIngredients])



  const handleToggleIngredient = useCallback((id: string) => {
    setCheckedIngredientIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleCheckAll = useCallback(() => {
    setCheckedIngredientIds(new Set(ingredients.map((ing) => ing.id)))
  }, [ingredients])

  const handleUncheckAll = useCallback(() => {
    setCheckedIngredientIds(new Set())
  }, [])

  const handleFinishCooking = useCallback(() => {
    setMealCompleted(true)
    if (onCompleteMeal) {
      onCompleteMeal(mealRating || undefined)
    }
  }, [onCompleteMeal, mealRating])

  // If meal is finished, show Celebration HUD
  if (mealCompleted) {
    return (
      <div className={cn('flex flex-col h-full w-full bg-casa-bg select-none overflow-y-auto p-4 sm:p-8 justify-center items-center', className)}>
        <Card
          tone="ambient"
          padding="lg"
          className="max-w-2xl w-full text-center space-y-6 rounded-3xl border-amber-500/30 bg-gradient-to-b from-amber-500/10 via-casa-surface to-casa-surface shadow-2xl p-8 sm:p-12"
        >
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-casa-gold text-slate-950 flex items-center justify-center mx-auto shadow-lg animate-bounce">
            <PartyPopper size={40} />
          </div>

          <div className="space-y-2">
            <span className="text-caption font-bold uppercase tracking-widest text-amber-800 bg-amber-500/20 px-3 py-1 rounded-full border border-amber-500/30">
              Dinner is Served!
            </span>
            <h1 className="font-display text-display-sm sm:text-display-md font-extrabold text-casa-navy">
              {recipe.name}
            </h1>
            <p className="text-body text-casa-muted max-w-md mx-auto">
              All {steps.length} steps completed. Enjoy your home-cooked meal with the family!
            </p>
          </div>

          {/* Meal Rating */}
          <div className="space-y-2 pt-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-casa-muted block">
              Rate tonight's dinner for future meal plans:
            </span>
            <div className="flex items-center justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <IconButton
                  key={star}
                  icon={
                    <Star
                      size={28}
                      className={cn(
                        'transition-colors',
                        (mealRating ?? 0) >= star
                          ? 'text-amber-500 fill-amber-500'
                          : 'text-casa-border hover:text-amber-300'
                      )}
                    />
                  }
                  variant="ghost"
                  size="lg"
                  onClick={() => setMealRating(star)}
                  aria-label={`Rate ${star} stars`}
                  className="transition-transform active:scale-90 hover:scale-110"
                />
              ))}
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                setMealCompleted(false)
                setStepIndex(0)
              }}
              className="w-full sm:w-auto font-bold min-h-control px-6 rounded-2xl flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} />
              <span>Cook Again / Review Steps</span>
            </Button>

            <Button
              variant="champagne"
              size="lg"
              onClick={onExit}
              className="w-full sm:w-auto font-bold min-h-control px-8 rounded-2xl"
            >
              Back to Recipe Library
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full w-full bg-casa-bg select-none overflow-hidden',
        className
      )}
    >
      {/* Top Header HUD with Timers & Metadata */}
      <KitchenHeaderHUD
        recipeName={recipe.name}
        cookTime={recipe.cook_time}
        servings={recipe.servings}
        currentStepIndex={stepIndex}
        totalSteps={steps.length}
        timers={timers}
        onAddTimer={handleAddTimer}
        onToggleTimer={handleToggleTimer}
        onResetTimer={handleResetTimer}
        onRemoveTimer={handleRemoveTimer}
        onExit={onExit}
        onToggleSousChef={() => setIsSousChefOpen((prev) => !prev)}
        isSousChefOpen={isSousChefOpen}
        onEditRecipe={onEditRecipe}
      />

      {/* Mobile Tab Switcher (< lg viewports) */}
      <div className="lg:hidden px-4 py-2 bg-casa-surface border-b border-casa-border/80 flex items-center justify-between gap-2 shrink-0">
        <SegmentedControl
          aria-label="Kitchen view switcher"
          value={mobileActiveTab}
          onChange={(val) => setMobileActiveTab(val as 'step' | 'mise' | 'chef')}
          fullWidth
          options={[
            { value: 'step', label: `Step ${stepIndex + 1}/${steps.length}` },
            { value: 'mise', label: `Ingredients (${ingredients.length})` },
            { value: 'chef', label: 'AI Chef' },
          ]}
        />
      </div>

      {/* Main Studio Workbench (Responsive 2 or 3-Column Layout) */}
      <main className="flex-1 min-h-0 p-3 sm:p-4 lg:p-6 overflow-hidden">
        {/* Desktop / Kiosk Multi-Column Layout */}
        <div
          className={cn(
            'hidden lg:grid h-full gap-5 xl:gap-6 transition-all duration-300',
            isSousChefOpen
              ? 'lg:grid-cols-[22rem_minmax(0,1fr)_24rem]'
              : 'lg:grid-cols-[22rem_minmax(0,1fr)]'
          )}
        >
          {/* Left Column: Mise en place */}
          <section className="h-full min-h-0" aria-label="Mise en place shelf">
            <KitchenMiseEnPlaceShelf
              ingredients={formattedIngredients}
              checkedIds={checkedIngredientIds}
              onToggleIngredient={handleToggleIngredient}
              onCheckAll={handleCheckAll}
              onUncheckAll={handleUncheckAll}
              recipeScale={recipeScale}
              onChangeScale={setRecipeScale}
            />
          </section>

          {/* Center Column: Step Focus HUD */}
          <section className="h-full min-h-0 flex flex-col" aria-label="Active cooking step">
            <KitchenStepFocusHUD
              steps={steps.map((s) => ({ stepNumber: s.step_number, instruction: s.instruction }))}
              currentStepIndex={stepIndex}
              onStepChange={setStepIndex}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              neededIngredients={neededNowChips}
              onFinishCooking={handleFinishCooking}
            />
          </section>

          {/* Right Column: AI Sous Chef Sidecar (Visible when toggled ON) */}
          {isSousChefOpen && (
            <aside className="h-full min-h-0" aria-label="AI Sous Chef sidecar">
              <KitchenSousChefSidecar
                recipeName={recipe.name}
                currentStepIndex={stepIndex}
                totalSteps={steps.length}
                currentStepInstruction={currentStep?.instruction}
                allSteps={steps.map((s) => ({ stepNumber: s.step_number, instruction: s.instruction }))}
                ingredients={formattedIngredients}
                recipeScale={recipeScale}
                onAddTimer={handleAddTimer}
                onStepChange={setStepIndex}
                onChangeScale={(scale) => {
                  if (scale === '0.5' || scale === '1' || scale === '2') {
                    setRecipeScale(scale)
                  }
                }}
                onClose={() => setIsSousChefOpen(false)}
              />
            </aside>
          )}
        </div>

        {/* Mobile / Tablet Responsive View */}
        <div className="lg:hidden h-full min-h-0 flex flex-col">
          {mobileActiveTab === 'step' && (
            <KitchenStepFocusHUD
              steps={steps.map((s) => ({ stepNumber: s.step_number, instruction: s.instruction }))}
              currentStepIndex={stepIndex}
              onStepChange={setStepIndex}
              viewMode={viewMode}
              onChangeViewMode={setViewMode}
              neededIngredients={neededNowChips}
              onFinishCooking={handleFinishCooking}
            />
          )}

          {mobileActiveTab === 'mise' && (
            <KitchenMiseEnPlaceShelf
              ingredients={formattedIngredients}
              checkedIds={checkedIngredientIds}
              onToggleIngredient={handleToggleIngredient}
              onCheckAll={handleCheckAll}
              onUncheckAll={handleUncheckAll}
              recipeScale={recipeScale}
              onChangeScale={setRecipeScale}
            />
          )}

          {mobileActiveTab === 'chef' && (
            <KitchenSousChefSidecar
              recipeName={recipe.name}
              currentStepIndex={stepIndex}
              totalSteps={steps.length}
              currentStepInstruction={currentStep?.instruction}
              allSteps={steps.map((s) => ({ stepNumber: s.step_number, instruction: s.instruction }))}
              ingredients={formattedIngredients}
              recipeScale={recipeScale}
              onAddTimer={handleAddTimer}
              onStepChange={setStepIndex}
              onChangeScale={(scale) => {
                if (scale === '0.5' || scale === '1' || scale === '2') {
                  setRecipeScale(scale)
                }
              }}
              onClose={() => setIsSousChefOpen(false)}
            />
          )}
        </div>
      </main>
    </div>
  )
}
