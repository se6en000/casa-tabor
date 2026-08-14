import { create } from 'zustand'
import type { AppMode, ExperienceMode, CanvasSubmode, DinnerPlan } from '../types'

export const DEFAULT_DINNER_PLAN: DinnerPlan = {
  mode: 'cook',
  title: 'Herb-Roasted Chicken & Warm Farro',
  subtitle: '35m prep · Pantry stock confirmed · Chef: Sarah & Luke',
  targetTime: '6:30 PM Target',
  chefOrDriver: 'Sarah & Luke',
  statusBadge: 'Ingredients ready',
}

interface AppStore {
  mode: AppMode
  setMode: (mode: AppMode) => void
  lastInteraction: number
  touchActivity: () => void
  aiDrawerOpen: boolean
  setAiDrawerOpen: (open: boolean) => void

  // Dual-Engine & Living Canvas state
  experienceMode: ExperienceMode
  setExperienceMode: (mode: ExperienceMode) => void
  canvasSubmode: CanvasSubmode
  setCanvasSubmode: (submode: CanvasSubmode) => void
  toggleCanvasSubmode: () => void

  // Tonight's Kitchen state
  dinnerPlan: DinnerPlan
  setDinnerPlan: (plan: DinnerPlan) => void
  resetDinnerPlan: () => void
}

const getInitialExperienceMode = (): ExperienceMode => {
  try {
    const saved = localStorage.getItem('casa-experience-mode')
    if (saved === 'classic' || saved === 'living_canvas') return saved
  } catch {}
  return 'living_canvas'
}

const getInitialCanvasSubmode = (): CanvasSubmode => {
  try {
    const saved = localStorage.getItem('casa-canvas-submode')
    if (saved === 'calm' || saved === 'turbo') return saved
  } catch {}
  return 'calm'
}

const getInitialDinnerPlan = (): DinnerPlan => {
  try {
    const saved = localStorage.getItem('casa-tonight-kitchen-plan')
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed && typeof parsed === 'object' && parsed.title) {
        return parsed as DinnerPlan
      }
    }
  } catch {}
  return DEFAULT_DINNER_PLAN
}

export const useAppStore = create<AppStore>((set, get) => ({
  mode: 'interactive',
  setMode: (mode) => set({ mode }),
  lastInteraction: Date.now(),
  touchActivity: () => set({ lastInteraction: Date.now(), mode: 'interactive' }),
  aiDrawerOpen: false,
  setAiDrawerOpen: (aiDrawerOpen) => set({ aiDrawerOpen }),

  experienceMode: getInitialExperienceMode(),
  setExperienceMode: (experienceMode) => {
    try {
      localStorage.setItem('casa-experience-mode', experienceMode)
    } catch {}
    set({ experienceMode })
  },

  canvasSubmode: getInitialCanvasSubmode(),
  setCanvasSubmode: (canvasSubmode) => {
    try {
      localStorage.setItem('casa-canvas-submode', canvasSubmode)
    } catch {}
    set({ canvasSubmode })
  },

  toggleCanvasSubmode: () => {
    const next = get().canvasSubmode === 'calm' ? 'turbo' : 'calm'
    try {
      localStorage.setItem('casa-canvas-submode', next)
    } catch {}
    set({ canvasSubmode: next })
  },

  dinnerPlan: getInitialDinnerPlan(),
  setDinnerPlan: (dinnerPlan) => {
    try {
      localStorage.setItem('casa-tonight-kitchen-plan', JSON.stringify(dinnerPlan))
    } catch {}
    set({ dinnerPlan })
  },
  resetDinnerPlan: () => {
    try {
      localStorage.removeItem('casa-tonight-kitchen-plan')
    } catch {}
    set({ dinnerPlan: DEFAULT_DINNER_PLAN })
  },
}))