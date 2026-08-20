import { create } from 'zustand'
import type { AppMode, ExperienceMode, CanvasSubmode, DinnerPlan } from '../types'
import { saveTonightDinnerPlan, normalizeDinnerPlan } from '../utils/dinnerPlanSync.ts'

export const DEFAULT_DINNER_PLAN: DinnerPlan = {
  mode: 'cook',
  title: 'Garlic Butter Shrimp Scampi',
  subtitle: '25m prep · Pantry stock confirmed · Chef: Jake & Kelly',
  targetTime: '6:30 PM Target',
  recipeId: '8cfa3cd2-a68f-4b73-912f-92865ba1ee6a',
  chefOrDriver: 'Jake & Kelly',
  statusBadge: 'Ingredients ready',
}

export interface AIChatLaunchContext {
  launchId?: string
  prompt?: string
  autoSend?: boolean
  source?: string
  page?: string
  agent?: 'general' | 'chef'
  traceId?: string
  wakeAt?: number
  right?: number
  top?: number
}

interface AppStore {
  mode: AppMode
  setMode: (mode: AppMode) => void
  lastInteraction: number
  touchActivity: () => void
  aiDrawerOpen: boolean
  setAiDrawerOpen: (open: boolean) => void
  aiLaunchContext: AIChatLaunchContext | null
  setAiLaunchContext: (context: AIChatLaunchContext | null) => void

  // Unified Sidecar Companion state
  sidecarTab: 'event' | 'ai' | 'action'
  setSidecarTab: (tab: 'event' | 'ai' | 'action') => void
  toggleSidecarTab: () => void
  selectedSidecarEventId: string | null
  setSelectedSidecarEventId: (id: string | null) => void
  selectedSidecarActionId: string | null
  setSelectedSidecarActionId: (id: string | null) => void
  openEventInSidecar: (eventId: string) => void
  openActionInSidecar: (actionId: string) => void
  openAiInSidecar: (context?: AIChatLaunchContext | null) => void
  closeSidecar: () => void

  // Dual-Engine & Living Canvas state
  experienceMode: ExperienceMode
  setExperienceMode: (mode: ExperienceMode) => void
  canvasSubmode: CanvasSubmode
  setCanvasSubmode: (submode: CanvasSubmode) => void
  toggleCanvasSubmode: () => void

  // Tonight's Kitchen state
  dinnerPlan: DinnerPlan
  setDinnerPlan: (plan: DinnerPlan, options?: { localOnly?: boolean }) => void
  resetDinnerPlan: (options?: { localOnly?: boolean }) => void
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
  aiLaunchContext: null,
  setAiLaunchContext: (aiLaunchContext) => set({ aiLaunchContext }),

  sidecarTab: 'event',
  setSidecarTab: (sidecarTab) => set({ sidecarTab }),
  toggleSidecarTab: () => {
    const current = get().sidecarTab
    if (current === 'ai') {
      const fallback = get().selectedSidecarActionId ? 'action' : 'event'
      set({ sidecarTab: fallback })
    } else {
      set({ sidecarTab: 'ai' })
    }
  },
  selectedSidecarEventId: null,
  setSelectedSidecarEventId: (selectedSidecarEventId) => set({ selectedSidecarEventId }),
  selectedSidecarActionId: null,
  setSelectedSidecarActionId: (selectedSidecarActionId) => set({ selectedSidecarActionId }),

  openEventInSidecar: (eventId: string) => {
    set({
      selectedSidecarEventId: eventId,
      sidecarTab: 'event',
      aiDrawerOpen: true,
    })
  },
  openActionInSidecar: (actionId: string) => {
    set({
      selectedSidecarActionId: actionId,
      sidecarTab: 'action',
      aiDrawerOpen: true,
    })
  },
  openAiInSidecar: (context) => {
    const launchContext = context
      ? {
          ...context,
          launchId: context.launchId || crypto.randomUUID(),
        }
      : null
    set({
      sidecarTab: 'ai',
      aiDrawerOpen: true,
      aiLaunchContext: launchContext,
    })
  },
  closeSidecar: () => {
    set({
      aiDrawerOpen: false,
      selectedSidecarEventId: null,
      selectedSidecarActionId: null,
      aiLaunchContext: null,
    })
  },

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
  setDinnerPlan: (dinnerPlan, options) => {
    const normalized = normalizeDinnerPlan(dinnerPlan) || dinnerPlan
    try {
      localStorage.setItem('casa-tonight-kitchen-plan', JSON.stringify(normalized))
    } catch {}
    set({ dinnerPlan: normalized })
    if (!options?.localOnly) {
      void saveTonightDinnerPlan(normalized)
    }
  },
  resetDinnerPlan: (options) => {
    try {
      localStorage.setItem('casa-tonight-kitchen-plan', JSON.stringify(DEFAULT_DINNER_PLAN))
    } catch {}
    set({ dinnerPlan: DEFAULT_DINNER_PLAN })
    if (!options?.localOnly) {
      void saveTonightDinnerPlan(DEFAULT_DINNER_PLAN)
    }
  },
}))