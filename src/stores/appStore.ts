import { create } from 'zustand'
import type { AppMode, ExperienceMode, CanvasSubmode } from '../types'

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
}))