import { create } from 'zustand'
import type { CalendarView } from '../types'

interface CalendarStore {
  selectedDate: Date
  setSelectedDate: (date: Date) => void
  activeView: CalendarView
  setActiveView: (view: CalendarView) => void
  visibleMembers: string[]
  toggleMember: (id: string) => void
  showAllMembers: (ids: string[]) => void
}

export const useCalendarStore = create<CalendarStore>((set) => ({
  selectedDate: new Date(),  // defaults to today
  setSelectedDate: (date) => set({ selectedDate: date }),
  activeView: 'week',
  setActiveView: (view) => set({ activeView: view }),
  visibleMembers: [],
  toggleMember: (id) =>
    set((state) => ({
      visibleMembers: state.visibleMembers.includes(id)
        ? state.visibleMembers.filter((m) => m !== id)
        : [...state.visibleMembers, id],
    })),
  showAllMembers: (ids) => set({ visibleMembers: ids }),
}))