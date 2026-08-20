/**
 * OPTION 3 (HIGH EFFORT) — WORLD-CLASS "LIVING CANVAS" KITCHEN COMMAND STATION
 * Route: /prototype/cook-high
 * Features:
 *  - 100vh / 100vw Immersive Full-Screen Command Center (Zero modal scrims, zero double-scroll)
 *  - 64px+ Ergonomic Kitchen Touch Targets (Easy tapping with wet/greasy hands)
 *  - Multi-Timer Floating Dock (Concurrent parallel timers for searing, baking, resting)
 *  - AI Sous-Chef "Hot Mic" Voice Trigger & Non-blocking Sidecar Assistant
 *  - Screen Wake-Lock Status Guard
 *  - "Dinner Served" Inventory Closure Flow (Automated 1-tap pantry inventory deduction)
 */

import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Clock, Sparkles, Check, ChevronLeft, ChevronRight,
  Scale, Play, Pause, Plus, ShieldCheck, X,
  ShoppingBag, Utensils, CheckCircle2, ArrowRight
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// Mock recipe data
const RECIPE = {
  id: 'rec-high-1',
  name: 'Pan-Seared Tuscan Salmon with Garlic Cream Sauce',
  servings: 4,
  prepMinutes: 15,
  cookMinutes: 20,
  ingredients: [
    { id: 'i1', name: 'Fresh Salmon Fillets', baseQty: 4, unit: 'pieces (6 oz)', pantryStock: 'In Stock' },
    { id: 'i2', name: 'Fresh Asparagus', baseQty: 1, unit: 'bunch', pantryStock: 'In Stock' },
    { id: 'i3', name: 'Unsalted Butter', baseQty: 3, unit: 'tbsp', pantryStock: 'In Stock' },
    { id: 'i4', name: 'Garlic Cloves', baseQty: 5, unit: 'minced', pantryStock: 'Low Stock' },
    { id: 'i5', name: 'Heavy Cream', baseQty: 0.75, unit: 'cup', pantryStock: 'In Stock' },
    { id: 'i6', name: 'Sun-Dried Tomatoes', baseQty: 0.5, unit: 'cup', pantryStock: 'In Stock' },
    { id: 'i7', name: 'Parmesan Cheese', baseQty: 0.5, unit: 'cup', pantryStock: 'In Stock' },
    { id: 'i8', name: 'Fresh Baby Spinach', baseQty: 2, unit: 'cups', pantryStock: 'In Stock' },
  ],
  steps: [
    {
      stepNumber: 1,
      title: 'Mise-en-Place & Seasoning',
      instruction: 'Pat salmon fillets dry with paper towels. Season both sides with 1 tsp salt, 1/2 tsp black pepper, and 1/2 tsp paprika. Snap tough woody ends off asparagus spears.',
      ingredientIds: ['i1', 'i2'],
      recommendedTimer: null,
    },
    {
      stepNumber: 2,
      title: 'Sear Salmon Fillets',
      instruction: 'Heat 1 tbsp olive oil and 1 tbsp butter in a large heavy skillet over medium-high heat. Place salmon skin-side up. Sear for 4 minutes until golden crust forms, then flip and cook 3 minutes more.',
      ingredientIds: ['i1', 'i3'],
      recommendedTimer: { label: 'Salmon Sear (Side A)', durationSeconds: 240 },
    },
    {
      stepNumber: 3,
      title: 'Sauté Asparagus & Aromatics',
      instruction: 'In the same skillet, melt remaining 2 tbsp butter. Add minced garlic and sun-dried tomatoes. Sauté for 1 minute until fragrant. Add asparagus and cook 3 minutes.',
      ingredientIds: ['i2', 'i3', 'i4', 'i6'],
      recommendedTimer: { label: 'Sauté Asparagus', durationSeconds: 180 },
    },
    {
      stepNumber: 4,
      title: 'Simmer Garlic Cream Sauce',
      instruction: 'Reduce heat to medium. Pour in heavy cream and bring to a gentle simmer for 3 minutes. Stir in grated parmesan until rich, creamy, and completely smooth.',
      ingredientIds: ['i5', 'i7'],
      recommendedTimer: { label: 'Simmer Cream Sauce', durationSeconds: 180 },
    },
    {
      stepNumber: 5,
      title: 'Wilt Spinach & Finish Line',
      instruction: 'Add fresh baby spinach into the simmering cream sauce. Stir for 2 minutes until wilted. Nestled salmon fillets back into skillet, spooning sauce over top.',
      ingredientIds: ['i1', 'i8'],
      recommendedTimer: { label: 'Spinach & Warm Salmon', durationSeconds: 120 },
    },
  ]
}

type ActiveTimer = {
  id: string
  label: string
  secondsLeft: number
  totalSeconds: number
  isRunning: boolean
}

export default function CookPrototypeLivingCanvasPage() {
  const [stage, setStage] = useState<'prep' | 'cook'>('prep')
  const [portionScale, setPortionScale] = useState<number>(1)
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [checkedPreps, setCheckedPreps] = useState<Record<string, boolean>>({})

  // Multi-timer dock state
  const [timers, setTimers] = useState<ActiveTimer[]>([
    { id: 't-1', label: 'Overall Cook Window', secondsLeft: 1200, totalSeconds: 1200, isRunning: false }
  ])

  // AI Sous-Chef Sidecar Drawer
  const [isSousChefOpen, setIsSousChefOpen] = useState(false)
  const [isHotMicListening, setIsHotMicListening] = useState(false)
  const [sousChefMessages, setSousChefMessages] = useState<Array<{ sender: 'user' | 'chef'; text: string }>>([
    { sender: 'chef', text: 'Hey there Chef! I am your Sous-Chef. Ask me anything, or tap a quick question below.' }
  ])

  // Dinner Served Closure Modal State
  const [isDinnerServedOpen, setIsDinnerServedOpen] = useState(false)
  const [isInventoryDeducted, setIsInventoryDeducted] = useState(false)

  // Timer Ticker Loop
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prevTimers =>
        prevTimers.map(t => {
          if (t.isRunning && t.secondsLeft > 0) {
            return { ...t, secondsLeft: t.secondsLeft - 1 }
          } else if (t.secondsLeft === 0 && t.isRunning) {
            return { ...t, isRunning: false }
          }
          return t
        })
      )
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const currentStep = RECIPE.steps[currentStepIdx]

  const scaledIngredients = useMemo(() => {
    return RECIPE.ingredients.map(ing => {
      const qty = ing.baseQty * portionScale
      return {
        ...ing,
        scaledQtyDisplay: Number.isInteger(qty) ? qty.toString() : qty.toFixed(2).replace(/\.00$/, '')
      }
    })
  }, [portionScale])

  const preppedCount = useMemo(() => {
    return Object.values(checkedPreps).filter(Boolean).length
  }, [checkedPreps])

  const togglePrepItem = (id: string) => {
    setCheckedPreps(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const addTimer = (label: string, durationSeconds: number) => {
    const newTimer: ActiveTimer = {
      id: `t-${Date.now()}`,
      label,
      secondsLeft: durationSeconds,
      totalSeconds: durationSeconds,
      isRunning: true
    }
    setTimers(prev => [...prev, newTimer])
  }

  const toggleTimer = (id: string) => {
    setTimers(prev =>
      prev.map(t => (t.id === id ? { ...t, isRunning: !t.isRunning } : t))
    )
  }

  const removeTimer = (id: string) => {
    setTimers(prev => prev.filter(t => t.id !== id))
  }

  const askSousChefQuestion = (q: string) => {
    setSousChefMessages(prev => [...prev, { sender: 'user', text: q }])
    setTimeout(() => {
      let answer = "I'm right here with you! Keep your heat on medium-high for that crisp golden crust."
      if (q.includes('substitute')) {
        answer = "Pecorino Romano works great as a parmesan substitute! Use about 10% less since it's slightly saltier."
      } else if (q.includes('done')) {
        answer = "Salmon is perfectly done when internal temp hits 125°F-130°F (medium-rare to medium) or flakes easily with a fork."
      } else if (q.includes('garlic')) {
        answer = "Sauté garlic for just 45-60 seconds until fragrant—don't let it brown or it will turn bitter!"
      }
      setSousChefMessages(prev => [...prev, { sender: 'chef', text: answer }])
    }, 600)
  }

  const handleFinishCooking = () => {
    setIsDinnerServedOpen(true)
  }

  const executeInventoryDeduction = () => {
    setIsInventoryDeducted(true)
    setTimeout(() => {
      setIsDinnerServedOpen(false)
      alert('Inventory Updated! Meal logged to Casa Tabor history 🎉')
    }, 1200)
  }

  return (
    <div className="fixed inset-0 bg-[#FAF8F5] text-slate-900 flex flex-col font-sans overflow-hidden select-none">
      
      {/* ════ TOP PROTOTYPE BAR ════ */}
      <div className="bg-[#1E2A4A] text-white px-6 py-2.5 flex items-center justify-between z-30 flex-shrink-0 shadow-md">
        <div className="flex items-center gap-4">
          <Link to="/cook" className="text-amber-200 hover:text-white text-xs flex items-center gap-1">
            <ChevronLeft size={14} /> Exit Prototype
          </Link>
          <div className="h-4 w-px bg-white/20" />
          <span className="bg-amber-500/30 text-amber-200 text-xs px-3 py-1 rounded-full font-bold border border-amber-400/40 tracking-wide">
            OPTION 3: LIVING CANVAS KITCHEN COMMAND STATION
          </span>
          <div className="hidden lg:flex items-center gap-2 text-xs text-amber-100/80">
            <span className="flex items-center gap-1 text-emerald-300 font-medium">
              <ShieldCheck size={14} /> Screen Wake Lock Active
            </span>
            <span>· Warm Creamy Theme · 64px Touch Targets · Multi-Timer Dock</span>
          </div>
        </div>

        <Link
          to="/prototype/cook-medium"
          className="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg border border-white/20 transition-colors flex items-center gap-1.5"
        >
          Switch to Option 2 (Medium) <ArrowRight size={13} />
        </Link>
      </div>

      {/* ════ KITCHEN COMMAND BAR (HEADER) ════ */}
      <header className="bg-white/90 backdrop-blur-md border-b border-amber-900/10 px-8 py-4 flex items-center justify-between flex-shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-[#1E2A4A] tracking-tight font-serif">{RECIPE.name}</h1>
              <span className="bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold px-3 py-1 rounded-full">
                {portionScale}x ({RECIPE.servings * portionScale} Servings)
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600 mt-1">
              <span className="flex items-center gap-1.5 font-medium"><Clock size={14} className="text-amber-700" /> Prep: {RECIPE.prepMinutes}m · Cook: {RECIPE.cookMinutes}m</span>
              <span>·</span>
              <span>8 Ingredients</span>
              <span>·</span>
              <span>5 Active Steps</span>
            </div>
          </div>
        </div>

        {/* Ergonomic 64px Stage Navigation Tabs */}
        <div className="flex items-center gap-3">
          <div className="bg-[#F3EFE9] p-1.5 rounded-2xl border border-amber-900/10 flex items-center gap-2">
            <button
              onClick={() => setStage('prep')}
              className={`min-h-[64px] px-6 rounded-xl font-bold text-sm transition-all flex items-center gap-3 ${
                stage === 'prep'
                  ? 'bg-[#1E2A4A] text-white shadow-lg scale-[1.02]'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <ShoppingBag size={20} className={stage === 'prep' ? 'text-amber-300' : 'text-amber-700'} />
              <div className="text-left leading-tight">
                <div>Phase 1: Mise-en-Place</div>
                <div className="text-[11px] font-normal opacity-80">{preppedCount}/{scaledIngredients.length} Prepped</div>
              </div>
            </button>

            <button
              onClick={() => setStage('cook')}
              className={`min-h-[64px] px-6 rounded-xl font-bold text-sm transition-all flex items-center gap-3 ${
                stage === 'cook'
                  ? 'bg-[#1E2A4A] text-white shadow-lg scale-[1.02]'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <Utensils size={20} className={stage === 'cook' ? 'text-amber-300' : 'text-amber-700'} />
              <div className="text-left leading-tight">
                <div>Phase 2: Active Cooking</div>
                <div className="text-[11px] font-normal opacity-80">Step {currentStepIdx + 1} of 5</div>
              </div>
            </button>
          </div>

          {/* Sous-Chef Hot-Mic Toggle Button (64px Target) */}
          <button
            onClick={() => setIsSousChefOpen(!isSousChefOpen)}
            className={`min-h-[64px] px-5 rounded-2xl font-bold text-sm border transition-all flex items-center gap-3 ${
              isSousChefOpen
                ? 'bg-purple-900 border-purple-700 text-white shadow-lg shadow-purple-900/20'
                : 'bg-purple-50 border-purple-200 text-purple-900 hover:bg-purple-100'
            }`}
          >
            <div className="relative">
              <Sparkles size={20} className="text-purple-600" />
              {isHotMicListening && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
              )}
            </div>
            <div className="text-left leading-tight hidden sm:block">
              <div>Ask Sous-Chef</div>
              <div className="text-[10px] font-normal text-purple-700">AI Kitchen Assistant</div>
            </div>
          </button>
        </div>
      </header>

      {/* ════ MAIN CANVAS CONTENT ════ */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left/Center Cooking Stage Area */}
        <main className="flex-1 overflow-y-auto p-8 flex flex-col justify-between space-y-6">

          {stage === 'prep' ? (
            /* ════ PHASE 1: MISE-EN-PLACE PRE-FLIGHT ════ */
            <div className="max-w-5xl mx-auto w-full space-y-8 my-auto">
              
              {/* Scaler & Unit Header Card */}
              <div className="bg-white border border-amber-900/10 rounded-3xl p-8 flex flex-wrap items-center justify-between gap-6 shadow-xl shadow-amber-900/5">
                <div>
                  <h2 className="text-2xl font-black text-[#1E2A4A] flex items-center gap-3 font-serif">
                    <Scale size={28} className="text-amber-700" /> Mise-en-Place & Portion Control
                  </h2>
                  <p className="text-sm text-slate-600 mt-1 max-w-xl">
                    Prepare and measure all ingredients before turning on the burner. Tap any ingredient once measured.
                  </p>
                </div>

                {/* Ergonomic 64px Scaler Buttons */}
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Portion Scale:</span>
                  <div className="bg-[#F3EFE9] p-1.5 rounded-2xl border border-amber-900/10 flex items-center gap-1.5">
                    {[0.5, 1, 2].map(s => (
                      <button
                        key={s}
                        onClick={() => setPortionScale(s)}
                        className={`min-h-[56px] min-w-[72px] rounded-xl font-black text-base transition-all ${
                          portionScale === s
                            ? 'bg-[#1E2A4A] text-white shadow-md scale-105'
                            : 'text-slate-700 hover:text-slate-900 hover:bg-white/50'
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Touch-Friendly Prep Checklist Grid (64px Touch Target Rows) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scaledIngredients.map(ing => {
                  const isChecked = !!checkedPreps[ing.id]
                  return (
                    <button
                      key={ing.id}
                      onClick={() => togglePrepItem(ing.id)}
                      className={`min-h-[64px] p-5 rounded-2xl border-2 transition-all flex items-center justify-between text-left ${
                        isChecked
                          ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900 opacity-70 line-through'
                          : 'bg-white border-amber-900/10 text-slate-900 hover:border-amber-400 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center border-2 transition-all ${
                            isChecked
                              ? 'bg-emerald-600 border-emerald-500 text-white'
                              : 'border-slate-300 bg-[#FAF8F5] text-transparent'
                          }`}
                        >
                          <Check size={20} strokeWidth={3.5} />
                        </div>
                        <div>
                          <div className="font-bold text-base text-[#1E2A4A]">{ing.name}</div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">{ing.pantryStock}</div>
                        </div>
                      </div>

                      <span className="font-mono text-sm font-bold text-amber-900 bg-amber-100/80 border border-amber-300 px-3 py-1.5 rounded-xl">
                        {ing.scaledQtyDisplay} {ing.unit}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Ready to Cook Bottom Bar */}
              <div className="bg-white border border-amber-900/10 p-6 rounded-3xl flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={24} className="text-emerald-600" />
                  <span className="text-sm text-slate-700 font-medium">
                    {preppedCount === scaledIngredients.length
                      ? 'All ingredients prepped! Ready to enter line cooking.'
                      : `${preppedCount} of ${scaledIngredients.length} ingredients ready.`}
                  </span>
                </div>

                <button
                  onClick={() => setStage('cook')}
                  className="min-h-[64px] px-8 rounded-2xl bg-[#1E2A4A] hover:bg-[#2A3B66] text-white font-black text-base transition-all shadow-xl flex items-center gap-3"
                >
                  Enter Active Line Cooking <ArrowRight size={20} strokeWidth={3} className="text-amber-300" />
                </button>
              </div>
            </div>
          ) : (
            /* ════ PHASE 2: ACTIVE LINE COOKING ════ */
            <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col justify-between space-y-6">

              {/* Step Counter & Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-widest">
                  <span>Step {currentStepIdx + 1} of {RECIPE.steps.length}</span>
                  <span>{Math.round(((currentStepIdx + 1) / RECIPE.steps.length) * 100)}% Progress</span>
                </div>
                <div className="h-3 bg-white rounded-full border border-amber-900/10 overflow-hidden shadow-inner">
                  <div
                    className="h-full bg-amber-600 transition-all duration-300"
                    style={{ width: `${((currentStepIdx + 1) / RECIPE.steps.length) * 100}%` }}
                  />
                </div>
              </div>

              {/* Active Step Large Typography Card */}
              <div className="bg-white border-2 border-amber-900/10 rounded-3xl p-10 space-y-8 shadow-xl shadow-amber-900/5 flex-1 flex flex-col justify-between">
                
                <div className="space-y-4">
                  <div className="inline-block bg-amber-100 border border-amber-300 text-amber-950 text-xs font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider">
                    Step {currentStep.stepNumber}
                  </div>
                  <h2 className="text-3xl font-black text-[#1E2A4A] leading-tight font-serif">{currentStep.title}</h2>
                  <p className="text-xl text-slate-800 leading-relaxed font-normal">
                    {currentStep.instruction}
                  </p>
                </div>

                {/* Step Ingredients Chips */}
                <div className="bg-[#FAF8F5] border border-amber-900/10 rounded-2xl p-5 space-y-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block">
                    Ingredients for this step:
                  </span>
                  <div className="flex flex-wrap gap-3">
                    {currentStep.ingredientIds.map(id => {
                      const ing = scaledIngredients.find(i => i.id === id)
                      if (!ing) return null
                      return (
                        <div key={id} className="bg-amber-100/90 border border-amber-300 text-amber-950 text-sm font-bold px-4 py-2 rounded-xl flex items-center gap-2">
                          <span>{ing.name}</span>
                          <span className="text-xs font-mono opacity-80">({ing.scaledQtyDisplay} {ing.unit})</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Recommended Timer Trigger */}
                {currentStep.recommendedTimer && (
                  <div className="bg-[#FAF8F5] border border-amber-300 rounded-2xl p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center">
                        <Clock size={24} />
                      </div>
                      <div>
                        <div className="font-bold text-base text-[#1E2A4A]">{currentStep.recommendedTimer.label}</div>
                        <div className="text-xs text-slate-600">Step Timer: {Math.floor(currentStep.recommendedTimer.durationSeconds / 60)} minutes</div>
                      </div>
                    </div>

                    <button
                      onClick={() => addTimer(currentStep.recommendedTimer!.label, currentStep.recommendedTimer!.durationSeconds)}
                      className="min-h-[56px] px-6 rounded-xl bg-[#1E2A4A] hover:bg-[#2A3B66] text-white font-bold text-sm transition-all flex items-center gap-2 shadow-md"
                    >
                      <Plus size={18} strokeWidth={3} className="text-amber-300" /> Add to Multi-Timer Dock
                    </button>
                  </div>
                )}
              </div>

              {/* 64px Kitchen Navigation Control Bar */}
              <div className="flex items-center justify-between gap-6 pt-2">
                <button
                  disabled={currentStepIdx === 0}
                  onClick={() => setCurrentStepIdx(prev => prev - 1)}
                  className="min-h-[64px] px-8 rounded-2xl bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-bold text-base border border-slate-300 transition-all flex items-center gap-3 shadow-sm"
                >
                  <ChevronLeft size={22} strokeWidth={3} /> Previous Step
                </button>

                {currentStepIdx < RECIPE.steps.length - 1 ? (
                  <button
                    onClick={() => setCurrentStepIdx(prev => prev + 1)}
                    className="min-h-[64px] px-10 rounded-2xl bg-[#1E2A4A] hover:bg-[#2A3B66] text-white font-black text-lg transition-all shadow-xl flex items-center gap-3"
                  >
                    Next Step <ChevronRight size={22} strokeWidth={3} className="text-amber-300" />
                  </button>
                ) : (
                  <button
                    onClick={handleFinishCooking}
                    className="min-h-[64px] px-10 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-black text-lg transition-all shadow-xl flex items-center gap-3"
                  >
                    <Check size={22} strokeWidth={3} /> Dinner Served!
                  </button>
                )}
              </div>
            </div>
          )}
        </main>

        {/* ════ AI SOUS-CHEF SIDECAR DRAWER ════ */}
        <AnimatePresence>
          {isSousChefOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 380, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-l border-amber-900/10 bg-white flex flex-col h-full z-20 flex-shrink-0 shadow-2xl"
            >
              {/* Drawer Header */}
              <div className="p-5 border-b border-amber-900/10 flex items-center justify-between bg-[#FAF8F5]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-900 flex items-center justify-center border border-purple-300">
                    <Sparkles size={20} className="text-purple-700" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#1E2A4A] text-base font-serif">AI Sous-Chef</h3>
                    <p className="text-xs text-purple-800 font-medium">Hands-free Kitchen AI</p>
                  </div>
                </div>

                <button
                  onClick={() => setIsSousChefOpen(false)}
                  className="text-slate-500 hover:text-slate-800 p-2 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Hot-Mic Indicator Banner */}
              <div className="bg-purple-50 border-b border-purple-200 px-5 py-3 flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-purple-900 font-semibold">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
                  Voice Hot-Mic Active
                </span>
                <button
                  onClick={() => setIsHotMicListening(!isHotMicListening)}
                  className="text-purple-800 hover:underline font-bold"
                >
                  {isHotMicListening ? 'Mute Mic' : 'Listen Now'}
                </button>
              </div>

              {/* Message Transcript */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                {sousChefMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`p-3.5 rounded-2xl ${
                      msg.sender === 'chef'
                        ? 'bg-[#FAF8F5] border border-amber-900/10 text-slate-800'
                        : 'bg-[#1E2A4A] text-white ml-6 font-medium'
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
              </div>

              {/* Quick Preset Questions */}
              <div className="p-4 border-t border-amber-900/10 bg-[#FAF8F5] space-y-2">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                  Quick Kitchen Queries:
                </span>
                <button
                  onClick={() => askSousChefQuestion('Can I substitute parmesan cheese?')}
                  className="w-full text-left bg-white hover:bg-purple-50 p-2.5 rounded-xl text-xs text-purple-900 border border-purple-200 transition-colors font-medium"
                >
                  💡 "Can I substitute parmesan cheese?"
                </button>
                <button
                  onClick={() => askSousChefQuestion('How do I know when salmon is done?')}
                  className="w-full text-left bg-white hover:bg-purple-50 p-2.5 rounded-xl text-xs text-purple-900 border border-purple-200 transition-colors font-medium"
                >
                  💡 "How do I know when salmon is done?"
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ════ MULTI-TIMER DOCK (FLOATING FOOTER BAR) ════ */}
      <footer className="bg-white border-t border-amber-900/10 px-8 py-3 flex items-center justify-between z-30 flex-shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <Clock size={20} className="text-amber-700" />
          <span className="text-xs font-bold text-[#1E2A4A] uppercase tracking-widest">
            Multi-Timer Dock ({timers.length})
          </span>
        </div>

        {/* Active Timers List */}
        <div className="flex items-center gap-3 overflow-x-auto py-1">
          {timers.map(t => {
            const mins = Math.floor(t.secondsLeft / 60)
            const secs = t.secondsLeft % 60
            const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`

            return (
              <div
                key={t.id}
                className={`flex items-center gap-3 px-4 py-2 rounded-xl border transition-all ${
                  t.secondsLeft === 0
                    ? 'bg-red-100 border-red-400 text-red-900 animate-bounce'
                    : t.isRunning
                    ? 'bg-amber-100 border-amber-300 text-amber-950 font-bold'
                    : 'bg-[#FAF8F5] border-slate-300 text-slate-700'
                }`}
              >
                <div className="text-left">
                  <div className="text-xs font-bold leading-tight truncate max-w-[120px]">{t.label}</div>
                  <div className="font-mono text-sm font-bold tabular-nums">{timeStr}</div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleTimer(t.id)}
                    className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-200"
                  >
                    {t.isRunning ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button
                    onClick={() => removeTimer(t.id)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )
          })}

          {/* Quick Add Custom Timer */}
          <button
            onClick={() => addTimer('Custom Timer', 300)}
            className="bg-[#FAF8F5] border border-amber-900/10 hover:bg-amber-50 text-slate-700 text-xs px-3.5 py-2.5 rounded-xl font-medium flex items-center gap-1.5"
          >
            <Plus size={14} /> Add 5m Timer
          </button>
        </div>
      </footer>

      {/* ════ DINNER SERVED INVENTORY CLOSURE MODAL ════ */}
      <AnimatePresence>
        {isDinnerServedOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white border border-amber-900/10 rounded-3xl p-8 max-w-xl w-full space-y-6 text-center shadow-2xl"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-300">
                <Utensils size={32} />
              </div>

              <div>
                <h2 className="text-3xl font-black text-[#1E2A4A] font-serif">Dinner Served! 🍽️</h2>
                <p className="text-sm text-slate-600 mt-2">
                  Fantastic cooking, Chef! Confirm ingredients to auto-deduct from Casa Tabor pantry inventory.
                </p>
              </div>

              {/* Pre-checked Pantry Deduction Roster */}
              <div className="bg-[#FAF8F5] border border-amber-900/10 rounded-2xl p-4 text-left max-h-60 overflow-y-auto space-y-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  Pantry Inventory Deduction:
                </span>
                {scaledIngredients.map(ing => (
                  <div key={ing.id} className="flex items-center justify-between text-xs py-1 border-b border-amber-900/5 last:border-0">
                    <span className="text-slate-800 font-medium">{ing.name} ({ing.scaledQtyDisplay} {ing.unit})</span>
                    <span className="text-emerald-700 font-mono font-bold">- Deduct Stock</span>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsDinnerServedOpen(false)}
                  className="px-6 py-3.5 rounded-xl text-slate-600 hover:text-slate-900 text-sm font-medium"
                >
                  Skip Inventory
                </button>

                <button
                  onClick={executeInventoryDeduction}
                  disabled={isInventoryDeducted}
                  className="px-8 py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-black text-sm transition-all shadow-lg flex items-center gap-2"
                >
                  {isInventoryDeducted ? (
                    <>Deducting Inventory...</>
                  ) : (
                    <><Check size={18} strokeWidth={3} /> Save & Deduct Pantry Stock</>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
