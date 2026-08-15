import { useEffect, useRef } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  PartyPopper,
} from 'lucide-react'
import { Button, Card, Chip, Progress, SegmentedControl } from '../ui'
import { cn } from '../../utils/cn'

export interface KitchenStepItem {
  stepNumber: number
  instruction: string
}

export interface NeededIngredientChip {
  id: string
  name: string
  qty: string | null
}

interface KitchenStepFocusHUDProps {
  steps: KitchenStepItem[]
  currentStepIndex: number
  onStepChange: (index: number) => void
  viewMode: 'step' | 'all'
  onChangeViewMode: (mode: 'step' | 'all') => void
  neededIngredients: NeededIngredientChip[]
  onFinishCooking: () => void
  className?: string
}

export default function KitchenStepFocusHUD({
  steps,
  currentStepIndex,
  onStepChange,
  viewMode,
  onChangeViewMode,
  neededIngredients,
  onFinishCooking,
  className,
}: KitchenStepFocusHUDProps) {
  const currentStep = steps[currentStepIndex]
  const isFirstStep = currentStepIndex === 0
  const isLastStep = steps.length > 0 && currentStepIndex === steps.length - 1
  const activeStepRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll to active step in 'all' view mode
  useEffect(() => {
    if (viewMode === 'all' && activeStepRef.current) {
      activeStepRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentStepIndex, viewMode])

  // Keyboard navigation for steps
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault()
        if (currentStepIndex < steps.length - 1) {
          onStepChange(currentStepIndex + 1)
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        if (currentStepIndex > 0) {
          onStepChange(currentStepIndex - 1)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentStepIndex, steps.length, onStepChange])

  return (
    <div className={cn('flex flex-col h-full overflow-hidden space-y-4', className)}>
      {/* Step HUD Header: Progress & View Switcher */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-800 flex items-center justify-center font-bold text-body shrink-0 shadow-xs">
            {steps.length > 0 ? `${currentStepIndex + 1}/${steps.length}` : '0'}
          </div>
          <div>
            <span className="text-2xs font-bold uppercase tracking-wider text-casa-muted block">
              Step Progress
            </span>
            <div className="w-28 sm:w-36 mt-1">
              <Progress value={steps.length > 0 ? currentStepIndex + 1 : 0} max={Math.max(1, steps.length)} aria-label="Step progress" />
            </div>
          </div>
        </div>

        {/* Step vs All View Switcher */}
        <SegmentedControl
          aria-label="Steps view mode"
          value={viewMode}
          onChange={(val) => onChangeViewMode(val as 'step' | 'all')}
          options={[
            { value: 'step', label: 'Step focus' },
            { value: 'all', label: `All steps (${steps.length})` },
          ]}
        />
      </div>

      {/* Main Focus Canvas / Scrollable View */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {viewMode === 'step' ? (
          /* Step Focus HUD Card */
          <Card
            tone="surface"
            padding="lg"
            className="h-full flex flex-col justify-between border-casa-border/80 shadow-md rounded-3xl relative overflow-hidden bg-casa-surface/90 backdrop-blur-xs"
          >
            <div className="space-y-6">
              {/* Step indicator header badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-casa-navy text-casa-gold font-bold text-caption tracking-wider uppercase shadow-xs">
                    Step {currentStep ? currentStep.stepNumber : 1}
                  </span>
                  {neededIngredients.length > 0 && (
                    <span className="text-caption text-casa-muted font-medium hidden sm:inline">
                      · {neededIngredients.length} ingredient{neededIngredients.length > 1 ? 's' : ''} needed
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-amber-800 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20 text-caption font-bold">
                  <Flame size={14} className="animate-pulse" />
                  <span>Cooking In Progress</span>
                </div>
              </div>

              {/* Needed ingredients chips for this step */}
              {neededIngredients.length > 0 && (
                <div className="space-y-2">
                  <span className="text-2xs font-bold uppercase tracking-wider text-casa-muted block">
                    Grab &amp; Measure for this step:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {neededIngredients.map((ing) => (
                      <Chip
                        key={ing.id}
                        tone="accent"
                        size="md"
                        className="font-medium text-body-sm shadow-xs"
                      >
                        <span className="font-bold">{ing.name}</span>
                        {ing.qty && <span className="text-casa-navy/80 ml-1 font-mono font-semibold">({ing.qty})</span>}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              {/* 8-Foot Glanceable Giant Instruction Text */}
              <div className="py-2">
                <p className="font-sans text-heading sm:text-display-sm lg:text-display font-medium text-casa-navy leading-relaxed sm:leading-snug tracking-tight">
                  {currentStep?.instruction || 'No instruction text for this step.'}
                </p>
              </div>

              {/* Warning/Alert callout if step mentions high heat or timers */}
              {(currentStep?.instruction?.toLowerCase().includes('burn') ||
                currentStep?.instruction?.toLowerCase().includes('careful') ||
                currentStep?.instruction?.toLowerCase().includes('immediately')) && (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900">
                  <AlertTriangle size={20} className="shrink-0 text-amber-700 mt-0.5" />
                  <div className="text-body-sm font-medium">
                    <strong className="font-bold block text-amber-950">Chef's Attention:</strong>
                    Watch heat closely during this step to avoid burning or overcooking.
                  </div>
                </div>
              )}
            </div>

            {/* Hint text */}
            <div className="pt-6 border-t border-casa-border/60 flex items-center justify-between text-caption text-casa-muted">
              <span>Tip: Use Arrow Keys or the buttons below to advance</span>
              <span className="hidden sm:inline">Hands messy? Tap with your knuckle</span>
            </div>
          </Card>
        ) : (
          /* All Steps List Mode */
          <div className="space-y-3">
            {steps.map((step, index) => {
              const isCurrent = index === currentStepIndex
              const isDone = index < currentStepIndex

              return (
                <div
                  key={`step-${step.stepNumber}-${index}`}
                  ref={isCurrent ? activeStepRef : undefined}
                  role="button"
                  tabIndex={0}
                  onClick={() => onStepChange(index)}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault()
                      onStepChange(index)
                    }
                  }}
                  className={cn(
                    'w-full p-4 rounded-3xl border text-left transition-all flex items-start gap-4 active:scale-[0.99] select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-casa-gold',
                    isCurrent
                      ? 'bg-amber-500/15 border-casa-gold ring-2 ring-casa-gold/40 shadow-sm'
                      : isDone
                      ? 'bg-casa-surface/60 border-casa-border/60 opacity-75'
                      : 'bg-casa-surface border-casa-border hover:border-casa-gold/60'
                  )}
                >
                  <span
                    className={cn(
                      'w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-body-sm shrink-0 mt-0.5 shadow-xs transition-colors',
                      isDone
                        ? 'bg-emerald-500 text-white'
                        : isCurrent
                        ? 'bg-gradient-to-br from-amber-500 to-casa-gold text-slate-950 shadow-md font-extrabold'
                        : 'bg-casa-bg border border-casa-border text-casa-navy'
                    )}
                  >
                    {isDone ? <Check size={18} strokeWidth={3} /> : step.stepNumber}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xs font-bold uppercase tracking-wider text-casa-muted">
                        Step {step.stepNumber}
                      </span>
                      {isCurrent && (
                        <span className="text-2xs font-bold uppercase tracking-widest text-amber-800 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
                          Active
                        </span>
                      )}
                      {isDone && (
                        <span className="text-2xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                          Completed
                        </span>
                      )}
                    </div>
                    <p
                      className={cn(
                        'text-body font-medium leading-relaxed',
                        isDone ? 'text-casa-muted line-clamp-2' : 'text-casa-navy'
                      )}
                    >
                      {step.instruction}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Knuckle/Messy-Hands Oversized 64px Navigation Footer */}
      <div className="p-2 sm:p-3 bg-casa-surface border border-casa-border/80 rounded-3xl shadow-sm flex items-center justify-between gap-4 shrink-0">
        <Button
          variant="secondary"
          size="lg"
          onClick={() => onStepChange(Math.max(0, currentStepIndex - 1))}
          disabled={isFirstStep}
          className="min-h-[56px] sm:min-h-[64px] px-5 sm:px-8 font-bold text-body sm:text-body-lg flex items-center gap-2 rounded-2xl"
          aria-label="Previous step"
        >
          <ChevronLeft size={22} />
          <span>Previous</span>
        </Button>

        {isLastStep ? (
          <Button
            variant="primary"
            size="lg"
            onClick={onFinishCooking}
            className="min-h-[56px] sm:min-h-[64px] px-6 sm:px-10 font-bold text-body sm:text-body-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white flex items-center gap-2.5 rounded-2xl shadow-lg animate-pulse"
            aria-label="Finish cooking recipe"
          >
            <PartyPopper size={22} />
            <span>Finish & Complete Meal!</span>
          </Button>
        ) : (
          <Button
            variant="champagne"
            size="lg"
            onClick={() => onStepChange(Math.min(steps.length - 1, currentStepIndex + 1))}
            className="min-h-[56px] sm:min-h-[64px] px-6 sm:px-10 font-bold text-body sm:text-body-lg flex items-center gap-2 rounded-2xl"
            aria-label="Next step"
          >
            <span>Next Step</span>
            <ChevronRight size={22} />
          </Button>
        )}
      </div>
    </div>
  )
}
