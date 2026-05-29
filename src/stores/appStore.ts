import { create } from 'zustand'
import type { AppMode } from '../types'

interface AppStore {
  mode: AppMode
  setMode: (mode: AppMode) => void
  lastInteraction: number
  touchActivity: () => void
}

export const useAppStore = create<AppStore>((set) => ({
  mode: 'interactive',
  setMode: (mode) => set({ mode }),
  lastInteraction: Date.now(),
  touchActivity: () => set({ lastInteraction: Date.now(), mode: 'interactive' }),
}))