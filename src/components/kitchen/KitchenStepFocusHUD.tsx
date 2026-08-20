import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Flame,
  PartyPopper,
  Sparkles,
} from 'lucide-react'
import { motion, AnimatePresence, type PanInfo } from 'framer-motion'
import { Button, Progress, SegmentedControl } from '../ui'
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

const stepVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 60 : dir < 0 ? -60 : 0,
    opacity: 0,
    scale: 0.98,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.28,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -60 : 60,
    opacity: 0,
    scale: 0.98,
    transition: {
      duration: 0.2,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  }),
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
  const nextStep = currentStepIndex < steps.length - 1 ? steps[currentStepIndex + 1] : null
  const isFirstStep = currentStepIndex === 0
  const isLastStep = steps.length > 0 && currentStepIndex === steps.length - 1
  const activeStepRef = useRef<HTMLDivElement | null>(null)

  const [direction, setDirection] = useState<number>(0)
  const prevIndexRef = useRef(currentStepIndex)

  useEffect(() => {
    if (currentStepIndex > prevIndexRef.current) {
      setDirection(1)
    } else if (currentStepIndex < prevIndexRef.current) {
      setDirection(-1)
    }
    prevIndexRef.current = currentStepIndex
  }, [currentStepIndex])

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

  const handleDragEnd = (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const swipeThreshold = 50
    const velocityThreshold = 300
    if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
      if (!isLastStep) {
        onStepChange(currentStepIndex + 1)
      }
    } else if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
      if (!isFirstStep) {
        onStepChange(currentStepIndex - 1)
      }
    }
  }

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
              <Progress
                value={steps.length > 0 ? currentStepIndex + 1 : 0}
                max={Math.max(1, steps.length)}
                aria-label="Step progress"
              />
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
          /* Step Focus Blue Hero HUD Card */
          <div className="h-full relative overflow-hidden flex flex-col">
            <AnimatePresence mode="popLayout" custom={direction} initial={false}>
              <motion.div
                key={`step-card-${currentStepIndex}`}
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={handleDragEnd}
                className="w-full h-full flex flex-col justify-between rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white border border-white/10 shadow-hero-dark relative overflow-hidden group select-none touch-pan-y"
              >
                {/* Background ambient gold glow */}
                <div
                  aria-hidden="true"
                  className="absolute top-0 right-0 w-80 h-80 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none"
                />

                {/* Left Edge Slap Zone */}
                {!isFirstStep && (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Previous step"
                    onClick={() => onStepChange(currentStepIndex - 1)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onStepChange(currentStepIndex - 1)
                      }
                    }}
                    className="absolute left-0 top-0 bottom-0 w-12 sm:w-16 z-20 flex items-center justify-start pl-2 cursor-pointer group/edge opacity-0 hover:opacity-100 transition-opacity focus-visible:opacity-100 focus:outline-none"
                  >
                    <div className="w-8 h-12 rounded-r-xl bg-white/10 backdrop-blur-md border-r border-y border-white/20 flex items-center justify-center text-slate-300 group-hover/edge:text-casa-gold group-hover/edge:bg-white/20 transition-all shadow-sm">
                      <ChevronLeft size={20} />
                    </div>
                  </div>
                )}

                {/* Right Edge Slap Zone */}
                {!isLastStep && (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Next step"
                    onClick={() => onStepChange(currentStepIndex + 1)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onStepChange(currentStepIndex + 1)
                      }
                    }}
                    className="absolute right-0 top-0 bottom-0 w-12 sm:w-16 z-20 flex items-center justify-end pr-2 cursor-pointer group/edge opacity-0 hover:opacity-100 transition-opacity focus-visible:opacity-100 focus:outline-none"
                  >
                    <div className="w-8 h-12 rounded-l-xl bg-white/10 backdrop-blur-md border-l border-y border-white/20 flex items-center justify-center text-slate-300 group-hover/edge:text-casa-gold group-hover/edge:bg-white/20 transition-all shadow-sm">
                      <ChevronRight size={20} />
                    </div>
                  </div>
                )}

                {/* Main Step Content — Scrollable when ingredient chips or text overflow */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 sm:space-y-5 relative z-10 pr-1.5 touch-pan-y">
                  {/* Step indicator header badge */}
                  <div className="flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <span className="px-3.5 py-1.5 rounded-full bg-white/10 text-casa-gold font-bold text-caption tracking-wider uppercase border border-white/15 shadow-xs">
                        Step {currentStep ? currentStep.stepNumber : 1} of {steps.length}
                      </span>
                      {neededIngredients.length > 0 && (
                        <span className="text-caption text-slate-300 font-medium hidden sm:inline">
                          · {neededIngredients.length} ingredient{neededIngredients.length > 1 ? 's' : ''} needed
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-amber-300 bg-amber-500/20 px-3.5 py-1.5 rounded-full border border-amber-500/30 text-caption font-bold shadow-xs">
                      <Flame size={14} className="animate-pulse text-amber-400" />
                      <span>Cooking In Progress</span>
                    </div>
                  </div>

                  {/* Needed ingredients chips for this step */}
                  {neededIngredients.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-2xs font-bold uppercase tracking-wider text-slate-300/90 block">
                        Grab &amp; Measure for this step:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {neededIngredients.map((ing) => (
                          <div
                            key={ing.id}
                            className="px-3.5 py-1.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white flex items-center gap-1.5 text-body-sm font-medium transition-colors shadow-xs"
                          >
                            <span className="font-bold">{ing.name}</span>
                            {ing.qty && (
                              <span className="text-casa-gold ml-1 font-mono font-semibold">
                                ({ing.qty})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 8-Foot Glanceable Giant Instruction Text */}
                  <div className="py-1">
                    <p className="font-sans text-heading sm:text-display-sm lg:text-display font-medium text-white leading-relaxed sm:leading-snug tracking-tight casa-heading-on-dark">
                      {currentStep?.instruction || 'No instruction text for this step.'}
                    </p>
                  </div>

                  {/* Warning/Alert callout if step mentions high heat or timers */}
                  {(currentStep?.instruction?.toLowerCase().includes('burn') ||
                    currentStep?.instruction?.toLowerCase().includes('careful') ||
                    currentStep?.instruction?.toLowerCase().includes('immediately')) && (
                    <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200">
                      <AlertTriangle size={20} className="shrink-0 text-amber-400 mt-0.5" />
                      <div className="text-body-sm font-medium">
                        <strong className="font-bold block text-amber-100">Chef's Attention:</strong>
                        Watch heat closely during this step to avoid burning or overcooking.
                      </div>
                    </div>
                  )}
                </div>

                {/* Lower section: Horizon next-up ticker + gesture hint + ENCOMPASSED ACTION FOOTER (Pinned to bottom) */}
                <div className="shrink-0 space-y-3 pt-3.5 border-t border-white/10 relative z-10 mt-auto">
                  {/* Heads-up next step ticker */}
                  {nextStep && (
                    <div className="p-3 sm:p-3.5 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-2.5 text-body-sm text-slate-300 backdrop-blur-xs">
                      <Eye size={16} className="text-casa-gold shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 truncate">
                        <span className="text-2xs font-bold uppercase tracking-wider text-casa-gold mr-2 shrink-0">
                          Next Up (Step {nextStep.stepNumber}):
                        </span>
                        <span className="text-slate-300 font-normal text-body-sm">
                          {nextStep.instruction}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Encompassed Action Controls inside the Dark Card */}
                  <div className="flex items-center justify-between gap-4 pt-1">
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => onStepChange(Math.max(0, currentStepIndex - 1))}
                      disabled={isFirstStep}
                      className="min-h-[52px] sm:min-h-[58px] px-5 sm:px-8 font-bold text-body sm:text-body-lg flex items-center gap-2 rounded-2xl bg-white/10 hover:bg-white/15 border-white/15 text-white disabled:opacity-30 disabled:border-transparent"
                      aria-label="Previous step"
                    >
                      <ChevronLeft size={22} />
                      <span>Previous</span>
                    </Button>

                    <div className="hidden sm:flex items-center gap-1.5 text-caption text-slate-400">
                      <Sparkles size={14} className="text-casa-gold/80 shrink-0" />
                      <span>Messy hands? Tap with knuckle</span>
                    </div>

                    {isLastStep ? (
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={onFinishCooking}
                        className="min-h-[52px] sm:min-h-[58px] px-6 sm:px-10 font-bold text-body sm:text-body-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white flex items-center gap-2.5 rounded-2xl shadow-lg animate-pulse"
                        aria-label="Finish cooking recipe"
                      >
                        <PartyPopper size={22} />
                        <span>Finish &amp; Complete Meal!</span>
                      </Button>
                    ) : (
                      <Button
                        variant="champagne"
                        size="lg"
                        onClick={() => onStepChange(Math.min(steps.length - 1, currentStepIndex + 1))}
                        className="min-h-[52px] sm:min-h-[58px] px-6 sm:px-10 font-extrabold text-body sm:text-body-lg flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-casa-gold text-slate-950 hover:brightness-105 border-0 shadow-md"
                        aria-label="Next step"
                      >
                        <span>Next Step</span>
                        <ChevronRight size={22} />
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          /* All Steps List Mode */
          <div className="space-y-4">
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
                      'w-full p-4 sm:p-5 rounded-3xl border text-left transition-all flex items-start gap-4 active:scale-[0.99] select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-casa-gold',
                      isCurrent
                        ? 'bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white border-casa-gold/60 shadow-hero-dark ring-2 ring-casa-gold/40'
                        : isDone
                        ? 'bg-casa-surface/60 border-casa-border/60 opacity-75 hover:opacity-90'
                        : 'bg-casa-surface border-casa-border hover:border-casa-gold/60'
                    )}
                  >
                    <span
                      className={cn(
                        'w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-body-sm shrink-0 mt-0.5 shadow-xs transition-colors',
                        isDone
                          ? 'bg-emerald-500 text-white'
                          : isCurrent
                          ? 'bg-gradient-to-br from-amber-400 to-casa-gold text-slate-950 shadow-md font-extrabold'
                          : 'bg-casa-bg border border-casa-border text-casa-navy'
                      )}
                    >
                      {isDone ? <Check size={18} strokeWidth={3} /> : step.stepNumber}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={cn(
                            'text-2xs font-bold uppercase tracking-wider',
                            isCurrent ? 'text-casa-gold' : 'text-casa-muted'
                          )}
                        >
                          Step {step.stepNumber}
                        </span>
                        {isCurrent && (
                          <span className="text-2xs font-bold uppercase tracking-widest text-amber-300 bg-amber-500/25 px-2.5 py-0.5 rounded-full border border-amber-500/40">
                            Active Step
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
                          isCurrent ? 'text-white' : isDone ? 'text-casa-muted line-clamp-2' : 'text-casa-navy'
                        )}
                      >
                        {step.instruction}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Navigation Footer for All Steps List Mode */}
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
                  <span>Finish &amp; Complete Meal!</span>
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
        )}
      </div>
    </div>
  )
}
