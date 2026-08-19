/**
 * OPTION 2 (MEDIUM EFFORT) — KITCHEN COOKING PROTOTYPE
 * Route: /prototype/cook-medium
 * Features:
 *  - 2-Stage Flow: Stage 1 (Mise-en-Place Prep & Portion Scaling) -> Stage 2 (Active Step Cooking)
 *  - Dynamic Portion Scaler (0.5x, 1x, 2x)
 *  - Step-Specific Ingredient Filtering
 *  - Auto-Extracted Regex Timers
 */

import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, Check, Play, Pause,
  Scale, Clock, ShoppingBag, ArrowRight
} from 'lucide-react'

// Mock recipe data for demonstration
const MOCK_RECIPE = {
  id: 'rec-medium-1',
  name: 'Tuscan Garlic Butter Salmon & Asparagus',
  servings: 4,
  prepTime: '15 min',
  cookTime: '20 min',
  ingredients: [
    { id: 'i1', name: 'Salmon Fillets', baseQty: 4, unit: 'pieces (6 oz each)', category: 'Proteins' },
    { id: 'i2', name: 'Fresh Asparagus', baseQty: 1, unit: 'bunch (trimmed)', category: 'Produce' },
    { id: 'i3', name: 'Unsalted Butter', baseQty: 3, unit: 'tbsp', category: 'Dairy' },
    { id: 'i4', name: 'Garlic', baseQty: 4, unit: 'cloves (minced)', category: 'Produce' },
    { id: 'i5', name: 'Heavy Cream', baseQty: 0.75, unit: 'cup', category: 'Dairy' },
    { id: 'i6', name: 'Sun-Dried Tomatoes', baseQty: 0.5, unit: 'cup (drained & chopped)', category: 'Pantry' },
    { id: 'i7', name: 'Parmesan Cheese', baseQty: 0.5, unit: 'cup (freshly grated)', category: 'Dairy' },
    { id: 'i8', name: 'Fresh Spinach', baseQty: 2, unit: 'cups (packed)', category: 'Produce' },
  ],
  steps: [
    {
      stepNumber: 1,
      title: 'Prep & Season Salmon',
      instruction: 'Pat salmon fillets dry with paper towels. Season both sides generously with salt, black pepper, and paprika. Trim asparagus ends.',
      ingredientIds: ['i1', 'i2'],
      timerMinutes: null,
    },
    {
      stepNumber: 2,
      title: 'Sear the Salmon',
      instruction: 'Heat 1 tbsp olive oil and 1 tbsp butter in a large skillet over medium-high heat. Sear salmon skin-side up for 4 minutes until golden crust forms, then flip and cook 3 minutes more. Transfer to plate.',
      ingredientIds: ['i1', 'i3'],
      timerMinutes: 4,
      timerLabel: 'Sear Salmon (Side A)',
    },
    {
      stepNumber: 3,
      title: 'Sauté Aromatics & Asparagus',
      instruction: 'In the same skillet, melt remaining 2 tbsp butter. Add minced garlic and sun-dried tomatoes. Sauté for 1 minute until fragrant. Add asparagus spears and cook for 3 minutes.',
      ingredientIds: ['i2', 'i3', 'i4', 'i6'],
      timerMinutes: 3,
      timerLabel: 'Sauté Asparagus & Garlic',
    },
    {
      stepNumber: 4,
      title: 'Simmer Creamy Sauce',
      instruction: 'Reduce heat to medium. Pour in heavy cream and bring to a gentle simmer for 3 minutes. Stir in grated parmesan until melted and smooth.',
      ingredientIds: ['i5', 'i7'],
      timerMinutes: 3,
      timerLabel: 'Simmer Cream Sauce',
    },
    {
      stepNumber: 5,
      title: 'Combine & Wilt Spinach',
      instruction: 'Add fresh spinach to sauce and cook for 2 minutes until wilted. Return salmon fillets to the skillet, spooning sauce over top.',
      ingredientIds: ['i1', 'i8'],
      timerMinutes: 2,
      timerLabel: 'Wilt Spinach & Warm Salmon',
    },
  ]
}

export default function CookPrototypeMediumPage() {
  const [scale, setScale] = useState<number>(1)
  const [isMetric, setIsMetric] = useState(false)
  const [prepStage, setPrepStage] = useState<'mise-en-place' | 'active-cooking'>('mise-en-place')
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({})
  const [currentStepIndex, setCurrentStepIndex] = useState(0)

  // Active step timer state
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number | null>(null)
  const [isTimerRunning, setIsTimerRunning] = useState(false)

  const scaledIngredients = useMemo(() => {
    return MOCK_RECIPE.ingredients.map(ing => {
      const qty = ing.baseQty * scale
      const formattedQty = Number.isInteger(qty) ? qty.toString() : qty.toFixed(2).replace(/\.00$/, '')
      return {
        ...ing,
        scaledQty: formattedQty
      }
    })
  }, [scale])

  const preppedCount = useMemo(() => {
    return Object.values(checkedIngredients).filter(Boolean).length
  }, [checkedIngredients])

  const currentStep = MOCK_RECIPE.steps[currentStepIndex]

  // Handle timer countdown
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    if (isTimerRunning && timerSecondsLeft !== null && timerSecondsLeft > 0) {
      interval = setInterval(() => {
        setTimerSecondsLeft(prev => (prev !== null && prev > 0 ? prev - 1 : 0))
      }, 1000)
    } else if (timerSecondsLeft === 0) {
      setIsTimerRunning(false)
    }
    return () => clearInterval(interval)
  }, [isTimerRunning, timerSecondsLeft])

  const startStepTimer = (mins: number) => {
    setTimerSecondsLeft(mins * 60)
    setIsTimerRunning(true)
  }

  const toggleIngredient = (id: string) => {
    setCheckedIngredients(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">

      {/* Top Prototype Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between z-20">
        <div className="flex items-center gap-4">
          <Link to="/cook" className="text-slate-400 hover:text-white text-sm flex items-center gap-1">
            <ChevronLeft size={16} /> Exit Prototype
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-1 rounded-full font-medium border border-emerald-500/30">
            OPTION 2: MEDIUM EFFORT MOCK
          </span>
          <span className="text-slate-400 text-sm hidden md:inline">
            2-Stage Flow (Mise-en-Place Prep $\rightarrow$ Active Cooking)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/prototype/cook-high"
            className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 font-medium"
          >
            Switch to Option 3 (High / Living Canvas) <ArrowRight size={13} />
          </Link>
        </div>
      </header>

      {/* Stage Navigation Indicator */}
      <div className="bg-slate-900/60 border-b border-slate-800/80 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">{MOCK_RECIPE.name}</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Serves {(MOCK_RECIPE.servings * scale)} · Prep: {MOCK_RECIPE.prepTime} · Cook: {MOCK_RECIPE.cookTime}
          </p>
        </div>

        {/* 2-Stage Segment Switch */}
        <div className="bg-slate-900 border border-slate-800 p-1 rounded-xl flex items-center gap-1">
          <button
            onClick={() => setPrepStage('mise-en-place')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              prepStage === 'mise-en-place'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShoppingBag size={14} /> Stage 1: Mise-en-Place ({preppedCount}/{MOCK_RECIPE.ingredients.length})
          </button>
          <button
            onClick={() => setPrepStage('active-cooking')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              prepStage === 'active-cooking'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock size={14} /> Stage 2: Active Step Cooking
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6">
        {prepStage === 'mise-en-place' ? (
          /* ════ STAGE 1: MISE-EN-PLACE PREP ════ */
          <div className="space-y-6">
            
            {/* Prep Banner Controls */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-amber-400 flex items-center gap-2">
                  <Scale size={20} /> Pre-Flight Prep & Portion Control
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Scale your ingredients, confirm your prep checklist, and hit "Start Cooking" when ready.
                </p>
              </div>

              {/* Portion Scale Controls */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Portions:</span>
                <div className="bg-slate-950 border border-slate-800 p-1 rounded-xl flex items-center gap-1">
                  {[0.5, 1, 2].map(s => (
                    <button
                      key={s}
                      onClick={() => setScale(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        scale === s ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {s}x ({MOCK_RECIPE.servings * s} servings)
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setIsMetric(!isMetric)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-2 rounded-xl transition-colors font-medium border border-slate-700"
                >
                  {isMetric ? 'Metric (g/ml)' : 'US Customary'}
                </button>
              </div>
            </div>

            {/* Ingredient Checklist */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                  Mise-en-Place Checklist ({preppedCount} of {scaledIngredients.length} Ready)
                </h3>
                {preppedCount > 0 && (
                  <button
                    onClick={() => setCheckedIngredients({})}
                    className="text-xs text-slate-400 hover:text-slate-200 underline"
                  >
                    Reset Checklist
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {scaledIngredients.map(ing => {
                  const isChecked = !!checkedIngredients[ing.id]
                  return (
                    <div
                      key={ing.id}
                      onClick={() => toggleIngredient(ing.id)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isChecked
                          ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200 opacity-60 line-through'
                          : 'bg-slate-950 border-slate-800 text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-all ${
                            isChecked
                              ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                              : 'border-slate-700 bg-slate-900'
                          }`}
                        >
                          {isChecked && <Check size={14} strokeWidth={3} />}
                        </div>
                        <span className="font-medium text-sm">{ing.name}</span>
                      </div>
                      <span className="font-mono text-xs text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                        {ing.scaledQty} {ing.unit}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Ready to Cook CTA */}
              <div className="mt-8 pt-6 border-t border-slate-800 flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  {preppedCount === scaledIngredients.length
                    ? '🎉 All ingredients prepped! Ready to cook on the line.'
                    : 'Tip: Check off prepped ingredients as you measure them out.'}
                </p>
                <button
                  onClick={() => setPrepStage('active-cooking')}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 py-3 rounded-xl transition-all shadow-lg flex items-center gap-2 text-sm"
                >
                  Start Active Cooking <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ════ STAGE 2: ACTIVE STEP-BY-STEP COOKING ════ */
          <div className="space-y-6">

            {/* Step Progress Header */}
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider">
                Step {currentStepIndex + 1} of {MOCK_RECIPE.steps.length}
              </span>
              <span>{Math.round(((currentStepIndex + 1) / MOCK_RECIPE.steps.length) * 100)}% Complete</span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${((currentStepIndex + 1) / MOCK_RECIPE.steps.length) * 100}%` }}
              />
            </div>

            {/* Main Active Step Display Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6">

              {/* Step Title & Instruction */}
              <div>
                <h2 className="text-2xl font-bold text-amber-400 mb-3">
                  Step {currentStep.stepNumber}: {currentStep.title}
                </h2>
                <p className="text-lg text-slate-200 leading-relaxed font-light">
                  {currentStep.instruction}
                </p>
              </div>

              {/* Ingredients Needed for THIS Step */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Ingredients Needed for this step:
                </h4>
                <div className="flex flex-wrap gap-2">
                  {currentStep.ingredientIds.map(ingId => {
                    const ing = scaledIngredients.find(i => i.id === ingId)
                    if (!ing) return null
                    return (
                      <span
                        key={ingId}
                        className="bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs px-3 py-1.5 rounded-lg font-medium"
                      >
                        {ing.name} ({ing.scaledQty} {ing.unit})
                      </span>
                    )
                  })}
                </div>
              </div>

              {/* Step Automated Timer Widget (if present) */}
              {currentStep.timerMinutes && (
                <div className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock size={24} className="text-amber-400" />
                    <div>
                      <h4 className="text-sm font-bold text-amber-300">{currentStep.timerLabel}</h4>
                      <p className="text-xs text-slate-400">Step Step Auto-Extracted Timer</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="font-mono text-2xl font-bold text-white tabular-nums">
                      {timerSecondsLeft !== null
                        ? `${Math.floor(timerSecondsLeft / 60)}:${(timerSecondsLeft % 60).toString().padStart(2, '0')}`
                        : `${currentStep.timerMinutes}:00`}
                    </span>

                    {isTimerRunning ? (
                      <button
                        onClick={() => setIsTimerRunning(false)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-2.5 rounded-xl border border-slate-700"
                      >
                        <Pause size={18} />
                      </button>
                    ) : (
                      <button
                        onClick={() => startStepTimer(currentStep.timerMinutes!)}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5"
                      >
                        <Play size={15} fill="currentColor" /> Start Timer
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Step Navigation Controls */}
              <div className="pt-4 flex items-center justify-between border-t border-slate-800">
                <button
                  disabled={currentStepIndex === 0}
                  onClick={() => setCurrentStepIndex(prev => prev - 1)}
                  className="bg-slate-800 disabled:opacity-40 hover:bg-slate-700 text-slate-200 font-medium px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 border border-slate-700 transition-colors"
                >
                  <ChevronLeft size={16} /> Previous Step
                </button>

                {currentStepIndex < MOCK_RECIPE.steps.length - 1 ? (
                  <button
                    onClick={() => setCurrentStepIndex(prev => prev + 1)}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md"
                  >
                    Next Step <ChevronRight size={16} />
                  </button>
                ) : (
                  <button
                    onClick={() => alert('Meal complete! In Option 3 you can auto-deduct inventory.')}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-lg"
                  >
                    <Check size={16} /> Finish Cooking
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
