import { useState, useEffect, useRef } from 'react'
import { format, addDays, isSameDay, differenceInCalendarDays } from 'date-fns'
import {
  Calendar, Clock, ChevronDown, Minus, Plus, Tag,
  ShoppingBag, Trophy, Stethoscope, PartyPopper,
  GraduationCap, Utensils, Plane, Church, Pill,
  ShoppingCart, BookOpen, Wrench, PawPrint, ClipboardList,
  Check, Bell, X, Pencil, Bed, Moon, Repeat, Sun
} from 'lucide-react'
import type { LivingFlowMode } from '../types'
import { EventProvenanceBadge } from '../../EventProvenanceBadge'
import {
  parseRrule,
  buildRrule,
  formatRecurrenceSummary,
  formatRecurrencePillLabel,
  type RecurrenceConfig,
  type RecurrenceFrequency,
  type RecurrenceEndType,
} from '../../../../utils/recurrenceUtils'

interface LivingHeroTitleCardProps {
  title: string
  category: string
  mode: LivingFlowMode
  startDate: Date
  endDate?: Date
  durationMinutes: number
  isAllDay?: boolean
  rrule?: string | null
  sourceType?: string | null
  onUpdateTitle: (newTitle: string) => void
  onSetStartAndDuration: (startDate: Date, durationMinutes: number, isAllDay?: boolean) => void
  onSetStartAndEnd?: (startDate: Date, endDate: Date, isAllDay?: boolean) => void
  onSelectCategory: (catName: string, icon: string, mode: LivingFlowMode) => void
  onNudgeTime: (deltaMinutes: number) => void
  onUpdateRecurrence: (rrule: string | null, config: RecurrenceConfig) => void
}

const EVENT_CATEGORIES = [
  { name: 'Social', label: 'Social / Outing', icon: ShoppingBag },
  { name: 'Sports', label: 'Sports & Practice', icon: Trophy },
  { name: 'Medical', label: 'Medical / Doctor', icon: Stethoscope },
  { name: 'Birthday', label: 'Birthday Party', icon: PartyPopper },
  { name: 'School', label: 'School / Academics', icon: GraduationCap },
  { name: 'Dining', label: 'Dining & Food', icon: Utensils },
  { name: 'Travel', label: 'Travel / Trip', icon: Plane },
  { name: 'Community', label: 'Community / Church', icon: Church }
]

const REMINDER_CATEGORIES = [
  { name: 'Meds & Health', label: 'Meds & Health', icon: Pill },
  { name: 'Errand', label: 'Household Errand', icon: ShoppingCart },
  { name: 'School Chores', label: 'School & Chores', icon: BookOpen },
  { name: 'Maintenance', label: 'Home Maintenance', icon: Wrench },
  { name: 'Pet Care', label: 'Pet Care', icon: PawPrint },
  { name: 'Family Admin', label: 'Family Admin', icon: ClipboardList }
]

export default function LivingHeroTitleCard({
  title,
  category,
  mode,
  startDate,
  endDate,
  durationMinutes,
  isAllDay,
  rrule,
  sourceType,
  onUpdateTitle,
  onSetStartAndDuration,
  onSetStartAndEnd,
  onSelectCategory,
  onNudgeTime,
  onUpdateRecurrence,
}: LivingHeroTitleCardProps) {
  const safeStartDate = !startDate || isNaN(new Date(startDate).getTime()) ? new Date() : new Date(startDate)
  const safeEndDate = !endDate || isNaN(new Date(endDate).getTime())
    ? new Date(safeStartDate.getTime() + Math.max(15, durationMinutes) * 60000)
    : new Date(endDate)

  const isInitialMultiDay = !isSameDay(safeStartDate, safeEndDate) && differenceInCalendarDays(safeEndDate, safeStartDate) >= 1

  const [localTitle, setLocalTitle] = useState(title)
  const [expandedSection, setExpandedSection] = useState<'datetime' | 'category' | 'recurrence' | null>(null)
  const [scheduleTab, setScheduleTab] = useState<'single' | 'multiday'>(isInitialMultiDay ? 'multiday' : 'single')
  const [currentStartDate, setCurrentStartDate] = useState<Date>(safeStartDate)
  const [currentEndDate, setCurrentEndDate] = useState<Date>(safeEndDate)
  const [duration, setDuration] = useState<number>(durationMinutes)
  const [localIsAllDay, setLocalIsAllDay] = useState<boolean>(Boolean(isAllDay))
  const [localRecur, setLocalRecur] = useState<RecurrenceConfig>(() => parseRrule(rrule))
  const [activeMode, setActiveMode] = useState<LivingFlowMode>(mode)
  const isEditingRef = useRef(false)
  const startDateInputRef = useRef<HTMLInputElement>(null)
  const endDateInputRef = useRef<HTMLInputElement>(null)
  const recurrenceEndDateInputRef = useRef<HTMLInputElement>(null)

  const isMultiDayActive = scheduleTab === 'multiday' && !isSameDay(currentStartDate, currentEndDate)
  const nightsCount = Math.max(1, differenceInCalendarDays(currentEndDate, currentStartDate))

  useEffect(() => {
    if (!isEditingRef.current) {
      setLocalTitle(title)
    }
  }, [title])

  useEffect(() => {
    const s = !startDate || isNaN(new Date(startDate).getTime()) ? new Date() : new Date(startDate)
    const e = !endDate || isNaN(new Date(endDate).getTime())
      ? new Date(s.getTime() + Math.max(15, durationMinutes) * 60000)
      : new Date(endDate)
    setCurrentStartDate(s)
    setCurrentEndDate(e)
  }, [startDate, endDate, durationMinutes])

  useEffect(() => {
    setDuration(durationMinutes)
  }, [durationMinutes])

  useEffect(() => {
    setLocalIsAllDay(Boolean(isAllDay))
  }, [isAllDay])

  const handleOpenStartDatePicker = () => {
    if (startDateInputRef.current) {
      try {
        if (typeof startDateInputRef.current.showPicker === 'function') {
          startDateInputRef.current.showPicker()
        } else {
          startDateInputRef.current.focus()
        }
      } catch {
        startDateInputRef.current.focus()
      }
    }
  }

  const handleOpenEndDatePicker = () => {
    if (endDateInputRef.current) {
      try {
        if (typeof endDateInputRef.current.showPicker === 'function') {
          endDateInputRef.current.showPicker()
        } else {
          endDateInputRef.current.focus()
        }
      } catch {
        endDateInputRef.current.focus()
      }
    }
  }

  // Commit schedule changes to parent
  const commitScheduleChange = (newStart: Date, newEnd: Date, newIsAllDay: boolean) => {
    setCurrentStartDate(newStart)
    setCurrentEndDate(newEnd)
    setLocalIsAllDay(newIsAllDay)
    const diffMins = newIsAllDay ? 1440 : Math.max(15, Math.round((newEnd.getTime() - newStart.getTime()) / 60000))
    setDuration(diffMins)

    if (onSetStartAndEnd) {
      onSetStartAndEnd(newStart, newEnd, newIsAllDay)
    } else {
      onSetStartAndDuration(newStart, diffMins, newIsAllDay)
    }
  }

  // Start Date / Time steppers
  const startHours24 = currentStartDate.getHours()
  const startHour12 = startHours24 % 12 || 12
  const startMinutes = currentStartDate.getMinutes()
  const startPeriod = startHours24 >= 12 ? 'PM' : 'AM'

  const stepStartHour = (delta: number) => {
    const nextStart = new Date(currentStartDate)
    if (localIsAllDay && nextStart.getHours() === 0 && nextStart.getMinutes() === 0) {
      nextStart.setHours(9, 0, 0, 0)
    }
    nextStart.setHours(nextStart.getHours() + delta)
    const shiftMs = nextStart.getTime() - currentStartDate.getTime()
    const nextEnd = scheduleTab === 'multiday'
      ? currentEndDate
      : new Date(currentEndDate.getTime() + shiftMs)
    commitScheduleChange(nextStart, nextEnd, false)
  }

  const stepStartMinute = (delta: number) => {
    const nextStart = new Date(currentStartDate)
    if (localIsAllDay && nextStart.getHours() === 0 && nextStart.getMinutes() === 0) {
      nextStart.setHours(9, 0, 0, 0)
    }
    nextStart.setMinutes(nextStart.getMinutes() + delta)
    const shiftMs = nextStart.getTime() - currentStartDate.getTime()
    const nextEnd = scheduleTab === 'multiday'
      ? currentEndDate
      : new Date(currentEndDate.getTime() + shiftMs)
    commitScheduleChange(nextStart, nextEnd, false)
  }

  const toggleStartPeriod = () => {
    const nextStart = new Date(currentStartDate)
    if (localIsAllDay && nextStart.getHours() === 0 && nextStart.getMinutes() === 0) {
      nextStart.setHours(9, 0, 0, 0)
    }
    if (startPeriod === 'AM') {
      nextStart.setHours(nextStart.getHours() + 12)
    } else {
      nextStart.setHours(nextStart.getHours() - 12)
    }
    const shiftMs = nextStart.getTime() - currentStartDate.getTime()
    const nextEnd = scheduleTab === 'multiday'
      ? currentEndDate
      : new Date(currentEndDate.getTime() + shiftMs)
    commitScheduleChange(nextStart, nextEnd, false)
  }

  // End Date / Time steppers (Multi-Day)
  const endHours24 = currentEndDate.getHours()
  const endHour12 = endHours24 % 12 || 12
  const endMinutes = currentEndDate.getMinutes()
  const endPeriod = endHours24 >= 12 ? 'PM' : 'AM'

  const stepEndHour = (delta: number) => {
    const nextEnd = new Date(currentEndDate)
    nextEnd.setHours(nextEnd.getHours() + delta)
    if (nextEnd.getTime() <= currentStartDate.getTime()) {
      nextEnd.setTime(currentStartDate.getTime() + 60 * 60000)
    }
    commitScheduleChange(currentStartDate, nextEnd, false)
  }

  const stepEndMinute = (delta: number) => {
    const nextEnd = new Date(currentEndDate)
    nextEnd.setMinutes(nextEnd.getMinutes() + delta)
    if (nextEnd.getTime() <= currentStartDate.getTime()) {
      nextEnd.setTime(currentStartDate.getTime() + 15 * 60000)
    }
    commitScheduleChange(currentStartDate, nextEnd, false)
  }

  const toggleEndPeriod = () => {
    const nextEnd = new Date(currentEndDate)
    if (endPeriod === 'AM') {
      nextEnd.setHours(nextEnd.getHours() + 12)
    } else {
      nextEnd.setHours(nextEnd.getHours() - 12)
    }
    if (nextEnd.getTime() <= currentStartDate.getTime()) {
      nextEnd.setTime(currentStartDate.getTime() + 60 * 60000)
    }
    commitScheduleChange(currentStartDate, nextEnd, false)
  }

  // Day Offset Selections (Single Day)
  const selectDayOffset = (days: number) => {
    const target = addDays(new Date(), days)
    const nextStart = new Date(currentStartDate)
    nextStart.setFullYear(target.getFullYear(), target.getMonth(), target.getDate())
    if (localIsAllDay) {
      nextStart.setHours(0, 0, 0, 0)
      const nextEnd = new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate(), 23, 59, 59)
      commitScheduleChange(nextStart, nextEnd, true)
    } else {
      const nextEnd = new Date(nextStart.getTime() + duration * 60000)
      commitScheduleChange(nextStart, nextEnd, false)
    }
  }

  const selectExplicitStartDate = (dateStr: string) => {
    if (!dateStr) return
    const parts = dateStr.split('-').map(Number)
    if (parts.length === 3) {
      const nextStart = new Date(currentStartDate)
      nextStart.setFullYear(parts[0], parts[1] - 1, parts[2])
      let nextEnd = new Date(currentEndDate)
      if (scheduleTab === 'multiday') {
        const spanDays = Math.max(1, differenceInCalendarDays(currentEndDate, currentStartDate))
        nextEnd = addDays(nextStart, spanDays)
        nextEnd.setHours(currentEndDate.getHours(), currentEndDate.getMinutes(), 0, 0)
        commitScheduleChange(nextStart, nextEnd, localIsAllDay)
      } else {
        if (localIsAllDay) {
          nextStart.setHours(0, 0, 0, 0)
          nextEnd = new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate(), 23, 59, 59)
          commitScheduleChange(nextStart, nextEnd, true)
        } else {
          nextEnd = new Date(nextStart.getTime() + duration * 60000)
          commitScheduleChange(nextStart, nextEnd, false)
        }
      }
    }
  }

  const selectExplicitEndDate = (dateStr: string) => {
    if (!dateStr) return
    const parts = dateStr.split('-').map(Number)
    if (parts.length === 3) {
      const nextEnd = new Date(currentEndDate)
      nextEnd.setFullYear(parts[0], parts[1] - 1, parts[2])
      if (nextEnd.getTime() <= currentStartDate.getTime()) {
        nextEnd.setHours(currentStartDate.getHours() + 2, currentStartDate.getMinutes(), 0, 0)
      }
      commitScheduleChange(currentStartDate, nextEnd, localIsAllDay)
    }
  }

  // Duration Presets (Single Day)
  const selectDuration = (mins: number) => {
    if (mins >= 1440) {
      const startOfDay = new Date(currentStartDate.getFullYear(), currentStartDate.getMonth(), currentStartDate.getDate(), 0, 0, 0)
      const endOfDay = new Date(currentStartDate.getFullYear(), currentStartDate.getMonth(), currentStartDate.getDate(), 23, 59, 59)
      commitScheduleChange(startOfDay, endOfDay, true)
    } else {
      let nextStart = new Date(currentStartDate)
      if (localIsAllDay && nextStart.getHours() === 0 && nextStart.getMinutes() === 0) {
        nextStart.setHours(9, 0, 0, 0) // Default 9:00 AM when unchecking All Day
      }
      const nextEnd = new Date(nextStart.getTime() + mins * 60000)
      commitScheduleChange(nextStart, nextEnd, false)
    }
  }

  // Night Presets (Multi-Day Stay)
  const selectNightsPreset = (nights: number) => {
    const nextStart = new Date(currentStartDate)
    if (nextStart.getHours() === 0 && nextStart.getMinutes() === 0) {
      nextStart.setHours(15, 0, 0, 0) // Default 3:00 PM Check-in
    }
    const nextEnd = addDays(nextStart, nights)
    nextEnd.setHours(11, 0, 0, 0) // Default 11:00 AM Check-out
    commitScheduleChange(nextStart, nextEnd, false)
  }

  // ══════ RECURRENCE STATE HANDLERS ══════
  const recurDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setLocalRecur(parseRrule(rrule))
  }, [rrule])

  useEffect(() => {
    return () => {
      if (recurDebounceTimerRef.current) {
        clearTimeout(recurDebounceTimerRef.current)
      }
    }
  }, [])

  const commitRecurrenceChange = (nextConfig: RecurrenceConfig, immediate = false) => {
    setLocalRecur(nextConfig)
    const newRrule = buildRrule(nextConfig)
    if (!onUpdateRecurrence) return

    if (recurDebounceTimerRef.current) {
      clearTimeout(recurDebounceTimerRef.current)
      recurDebounceTimerRef.current = null
    }

    if (immediate) {
      onUpdateRecurrence(newRrule, nextConfig)
    } else {
      recurDebounceTimerRef.current = setTimeout(() => {
        recurDebounceTimerRef.current = null
        onUpdateRecurrence(newRrule, nextConfig)
      }, 300)
    }
  }

  const handleSelectPresetFrequency = (freq: RecurrenceFrequency, interval = 1, byDay?: number[]) => {
    const currentDay = currentStartDate.getDay()
    const effectiveByDay = byDay !== undefined ? byDay : (freq === 'weekly' ? (localRecur.byDay.length > 0 ? localRecur.byDay : [currentDay]) : [])
    const nextConfig: RecurrenceConfig = {
      ...localRecur,
      freq,
      interval,
      byDay: effectiveByDay,
    }
    commitRecurrenceChange(nextConfig, true)
  }

  const handleToggleDay = (dayIndex: number) => {
    let nextByDay: number[]
    if (localRecur.byDay.includes(dayIndex)) {
      nextByDay = localRecur.byDay.filter(d => d !== dayIndex)
      if (nextByDay.length === 0) {
        nextByDay = [currentStartDate.getDay()]
      }
    } else {
      nextByDay = [...localRecur.byDay, dayIndex].sort((a, b) => a - b)
    }
    commitRecurrenceChange({
      ...localRecur,
      freq: 'weekly',
      byDay: nextByDay,
    })
  }

  const handleStepInterval = (delta: number) => {
    const nextInterval = Math.max(1, Math.min(99, localRecur.interval + delta))
    commitRecurrenceChange({
      ...localRecur,
      interval: nextInterval,
    })
  }

  const handleSetEndType = (endType: RecurrenceEndType) => {
    let defaultEndDate = localRecur.endDate
    if (endType === 'date' && !defaultEndDate) {
      defaultEndDate = format(addDays(currentStartDate, 30), 'yyyy-MM-dd')
    }
    commitRecurrenceChange({
      ...localRecur,
      endType,
      endDate: defaultEndDate,
      count: localRecur.count || 10,
    })
  }

  const handleSetEndDate = (dateStr: string) => {
    commitRecurrenceChange({
      ...localRecur,
      endType: 'date',
      endDate: dateStr,
    })
  }

  const handleStepCount = (delta: number) => {
    const nextCount = Math.max(1, Math.min(999, (localRecur.count || 10) + delta))
    commitRecurrenceChange({
      ...localRecur,
      endType: 'count',
      count: nextCount,
    })
  }

  const handleOpenRecurrenceEndDatePicker = () => {
    if (recurrenceEndDateInputRef.current) {
      try {
        if (typeof recurrenceEndDateInputRef.current.showPicker === 'function') {
          recurrenceEndDateInputRef.current.showPicker()
        } else {
          recurrenceEndDateInputRef.current.focus()
        }
      } catch {
        recurrenceEndDateInputRef.current.focus()
      }
    }
  }

  const isTodayActive = isSameDay(currentStartDate, new Date())
  const isTomorrowActive = isSameDay(currentStartDate, addDays(new Date(), 1))
  const isDay2Active = isSameDay(currentStartDate, addDays(new Date(), 2))
  const isOtherDayActive = !isTodayActive && !isTomorrowActive && !isDay2Active

  // Header pill text calculations
  const headerDateLabel = isMultiDayActive
    ? `${format(currentStartDate, 'EEE, MMM d')} → ${format(currentEndDate, 'EEE, MMM d')}`
    : format(currentStartDate, 'EEE, MMM d')

  const headerTimeLabel = isMultiDayActive
    ? localIsAllDay
      ? `All Day (${nightsCount + 1}d)`
      : `${format(currentStartDate, 'h:mm a')} → ${format(currentEndDate, 'h:mm a')}${nightsCount > 0 ? ` (${nightsCount}n)` : ''}`
    : localIsAllDay
      ? 'All Day'
      : format(currentStartDate, 'h:mm a')

  const isRecurringActive = localRecur.freq !== 'none'
  const recurrenceSummary = formatRecurrenceSummary(localRecur, currentStartDate)
  const recurrencePillLabel = formatRecurrencePillLabel(localRecur, currentStartDate)

  return (
    <div className={`living-hero-title-card flex flex-col ${expandedSection ? 'has-expanded' : ''}`}>
      {/* In-Place Controlled Editable Title via Zero-Lag CSS Grid Auto-Sizing */}
      <div className="group relative w-full">
        <div className="grid grid-cols-1 grid-rows-1 relative w-full">
          <span
            aria-hidden="true"
            className="invisible col-start-1 row-start-1 living-event-title px-1.5 -mx-1.5 whitespace-pre-wrap select-none pointer-events-none pr-7"
          >
            {localTitle || 'Event title…'}
          </span>

          <textarea
            rows={1}
            value={localTitle}
            onFocus={() => {
              isEditingRef.current = true
            }}
            onChange={(e) => {
              setLocalTitle(e.target.value)
            }}
            onBlur={(e) => {
              isEditingRef.current = false
              const text = e.target.value.trim() || 'Untitled'
              setLocalTitle(text)
              if (text !== title) {
                onUpdateTitle(text)
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            placeholder="Event title…"
            aria-label="Event title"
            className="col-start-1 row-start-1 living-event-title cursor-text hover:bg-slate-50/70 focus:bg-amber-50/40 rounded px-1.5 -mx-1.5 transition-all resize-none overflow-hidden pr-7 select-text"
          />

          <div className="absolute right-0 top-1.5 opacity-40 hover:opacity-100 transition-opacity pointer-events-none flex items-center gap-1 text-slate-400">
            <Pencil size={13} />
          </div>
        </div>
      </div>

      {/* Meta Pills Cluster */}
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {sourceType && <EventProvenanceBadge sourceType={sourceType} />}

        {/* Category Pill */}
        <button
          onClick={() => setExpandedSection(prev => prev === 'category' ? null : 'category')}
          className={`living-action-chip ${expandedSection === 'category' ? 'active' : 'gold-active shadow-sm'}`}
        >
          <span>{category}</span>
          <ChevronDown size={12} className={expandedSection === 'category' ? 'rotate-180 transition-transform' : ''} />
        </button>

        {/* Date Pill (Adaptive Multi-Day) */}
        <button
          onClick={() => setExpandedSection(prev => prev === 'datetime' ? null : 'datetime')}
          className={`living-action-chip ${expandedSection === 'datetime' ? 'active' : ''}`}
        >
          <Calendar size={13} className={expandedSection === 'datetime' ? 'text-white' : 'text-slate-500'} />
          <span className="truncate max-w-[200px]">{headerDateLabel}</span>
          <ChevronDown size={12} className={expandedSection === 'datetime' ? 'rotate-180 transition-transform' : 'text-slate-400'} />
        </button>

        {/* Time Pill (Adaptive Multi-Day) */}
        <button
          onClick={() => setExpandedSection(prev => prev === 'datetime' ? null : 'datetime')}
          className={`living-action-chip ${expandedSection === 'datetime' ? 'active' : ''}`}
        >
          <Clock size={13} className={expandedSection === 'datetime' ? 'text-white' : 'text-slate-500'} />
          <span className="truncate max-w-[190px]">{headerTimeLabel}</span>
          <ChevronDown size={12} className={expandedSection === 'datetime' ? 'rotate-180 transition-transform' : 'text-slate-400'} />
        </button>

        {/* Repeat / Recurrence Pill */}
        <button
          onClick={() => setExpandedSection(prev => prev === 'recurrence' ? null : 'recurrence')}
          className={`living-action-chip ${expandedSection === 'recurrence' ? 'active' : isRecurringActive ? 'gold-active shadow-sm' : ''}`}
          aria-label="Repeat schedule"
        >
          <Repeat size={13} className={expandedSection === 'recurrence' ? 'text-white' : isRecurringActive ? 'text-amber-800' : 'text-slate-500'} />
          <span className="truncate max-w-[170px]">{recurrencePillLabel}</span>
          <ChevronDown size={12} className={expandedSection === 'recurrence' ? 'rotate-180 transition-transform' : isRecurringActive ? 'text-amber-700' : 'text-slate-400'} />
        </button>

        {/* Micro Steppers */}
        <div className="flex items-center bg-white border border-slate-200 rounded-full p-0.5 shadow-sm">
          <button
            onClick={() => onNudgeTime(-15)}
            className="text-xs font-bold text-slate-500 py-1 px-2 hover:text-slate-900 transition-colors"
          >
            -15m
          </button>
          <button
            onClick={() => onNudgeTime(15)}
            className="text-xs font-bold text-slate-500 py-1 px-2 hover:text-slate-900 transition-colors"
          >
            +15m
          </button>
          <button
            onClick={() => onNudgeTime(30)}
            className="text-xs font-bold text-slate-500 py-1 px-2 hover:text-slate-900 transition-colors"
          >
            +30m
          </button>
        </div>
      </div>

      {/* ══════ INLINE DATE / TIME EXPANSION DRAWER ══════ */}
      {expandedSection === 'datetime' && (
        <div className="living-inline-drawer">
          <div className="living-inline-drawer-header">
            <span className="flex items-center gap-1.5">
              <Clock size={14} className="text-amber-700" />
              <span>Schedule & Timing</span>
            </span>
            <button
              onClick={() => setExpandedSection(null)}
              className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-0.5"
            >
              <span>Done</span>
              <X size={13} />
            </button>
          </div>

          {/* Mode Switcher: Single Day vs Multi-Day / Stay */}
          <div className="grid grid-cols-2 bg-slate-100 border border-slate-200 rounded-full p-0.5 mb-3 gap-0.5">
            <button
              type="button"
              onClick={() => {
                setScheduleTab('single')
                if (!isSameDay(currentStartDate, currentEndDate)) {
                  if (localIsAllDay) {
                    const startOfDay = new Date(currentStartDate.getFullYear(), currentStartDate.getMonth(), currentStartDate.getDate(), 0, 0, 0)
                    const endOfDay = new Date(currentStartDate.getFullYear(), currentStartDate.getMonth(), currentStartDate.getDate(), 23, 59, 59)
                    commitScheduleChange(startOfDay, endOfDay, true)
                  } else {
                    const newEnd = new Date(currentStartDate.getTime() + Math.min(duration, 240) * 60000)
                    commitScheduleChange(currentStartDate, newEnd, false)
                  }
                }
              }}
              className={`py-1.5 px-3 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                scheduleTab === 'single'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Clock size={13} />
              <span>Single Day</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setScheduleTab('multiday')
                if (isSameDay(currentStartDate, currentEndDate)) {
                  selectNightsPreset(1)
                }
              }}
              className={`py-1.5 px-3 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                scheduleTab === 'multiday'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Bed size={13} />
              <span>Multi-Day / Stay</span>
            </button>
          </div>

          {/* ══════ SINGLE DAY MODE ══════ */}
          {scheduleTab === 'single' ? (
            <>
              {/* Day Selector Grid */}
              <div className="day-selector-grid-exact">
                <button onClick={() => selectDayOffset(0)} className={`day-select-pill-btn ${isTodayActive ? 'active' : ''}`}>
                  Today<small>{format(new Date(), 'EEE d')}</small>
                </button>
                <button onClick={() => selectDayOffset(1)} className={`day-select-pill-btn ${isTomorrowActive ? 'active' : ''}`}>
                  Tomorrow<small>{format(addDays(new Date(), 1), 'EEE d')}</small>
                </button>
                <button onClick={() => selectDayOffset(2)} className={`day-select-pill-btn ${isDay2Active ? 'active' : ''}`}>
                  {format(addDays(new Date(), 2), 'EEEE')}<small>{format(addDays(new Date(), 2), 'EEE d')}</small>
                </button>
                <label
                  onClick={handleOpenStartDatePicker}
                  className={`day-select-pill-btn relative cursor-pointer ${isOtherDayActive ? 'active' : ''}`}
                >
                  <input
                    ref={startDateInputRef}
                    type="date"
                    value={format(currentStartDate, 'yyyy-MM-dd')}
                    onChange={(e) => selectExplicitStartDate(e.target.value)}
                    className="absolute inset-0 opacity-0 pointer-events-none w-full h-full"
                    aria-label="Pick date"
                    tabIndex={-1}
                  />
                  <div className="flex flex-col items-center justify-center pointer-events-none">
                    <span>{isOtherDayActive ? format(currentStartDate, 'MMM d') : 'Pick Date'}</span>
                    <Calendar size={12} className="mt-0.5" />
                  </div>
                </label>
              </div>

              {/* Touch Stepper Wheels (or All-Day Active Banner) */}
              {localIsAllDay ? (
                <div className="p-3.5 bg-amber-50/70 border border-amber-200/90 rounded-2xl text-center flex flex-col items-center justify-center gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
                    <Sun size={15} className="text-amber-600 shrink-0" />
                    <span>All-Day Event</span>
                  </div>
                  <span className="text-3xs font-medium text-amber-800/80">
                    Scheduled for the full day on {format(currentStartDate, 'EEEE, MMMM d')}
                  </span>
                </div>
              ) : (
                <div className="time-stepper-touch-grid">
                  <div className="stepper-column-box">
                    <span className="stepper-label-tag">Hour</span>
                    <div className="stepper-number-display">{startHour12 < 10 ? `0${startHour12}` : startHour12}</div>
                    <div className="stepper-buttons-row">
                      <button onClick={() => stepStartHour(-1)} className="stepper-arrow-btn" aria-label="Decrease hour">
                        <Minus size={15} />
                      </button>
                      <button onClick={() => stepStartHour(1)} className="stepper-arrow-btn" aria-label="Increase hour">
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="stepper-column-box">
                    <span className="stepper-label-tag">Minute</span>
                    <div className="stepper-number-display">{startMinutes < 10 ? `0${startMinutes}` : startMinutes}</div>
                    <div className="stepper-buttons-row">
                      <button onClick={() => stepStartMinute(-5)} className="stepper-arrow-btn" aria-label="Decrease 5 minutes">
                        <Minus size={15} />
                      </button>
                      <button onClick={() => stepStartMinute(5)} className="stepper-arrow-btn" aria-label="Increase 5 minutes">
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="stepper-column-box">
                    <span className="stepper-label-tag">Period</span>
                    <div className="stepper-number-display">{startPeriod}</div>
                    <button onClick={toggleStartPeriod} className="ampm-toggle-btn">
                      AM / PM
                    </button>
                  </div>
                </div>
              )}

              {/* Duration Presets */}
              <div className="duration-chips-row">
                {[
                  { mins: 45, label: '45m' },
                  { mins: 90, label: '1h 30m' },
                  { mins: 160, label: '2h 40m' },
                  { mins: 240, label: '4h' },
                  { mins: 1440, label: 'All Day' }
                ].map((item) => {
                  const isChipActive = item.mins >= 1440 ? localIsAllDay : (!localIsAllDay && duration === item.mins)
                  return (
                    <button
                      key={item.mins}
                      onClick={() => selectDuration(item.mins)}
                      className={`dur-chip-btn ${isChipActive ? 'active' : ''}`}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            /* ══════ MULTI-DAY / STAY MODE ══════ */
            <div className="space-y-3">
              {/* Quick Night Presets */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {[
                  { nights: 1, label: '1 Night (Overnight)' },
                  { nights: 2, label: '2 Nights (Weekend)' },
                  { nights: 3, label: '3 Nights' },
                  { nights: 4, label: '4 Nights' },
                ].map((preset) => {
                  const isPresetActive = nightsCount === preset.nights
                  return (
                    <button
                      key={preset.nights}
                      type="button"
                      onClick={() => selectNightsPreset(preset.nights)}
                      className={`py-1.5 px-2.5 rounded-xl text-xs font-bold transition-all border shrink-0 flex items-center gap-1 ${
                        isPresetActive
                          ? 'bg-amber-50 border-amber-400 text-amber-900 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-amber-300'
                      }`}
                    >
                      <Moon size={11} className={isPresetActive ? 'text-amber-600' : 'text-slate-400'} />
                      <span>{preset.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Check-In / Start Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Check-in / Start
                  </span>
                  <label
                    onClick={handleOpenStartDatePicker}
                    className="text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300/80 cursor-pointer flex items-center gap-1"
                  >
                    <input
                      ref={startDateInputRef}
                      type="date"
                      value={format(currentStartDate, 'yyyy-MM-dd')}
                      onChange={(e) => selectExplicitStartDate(e.target.value)}
                      className="absolute opacity-0 pointer-events-none w-0 h-0"
                      aria-label="Pick start date"
                      tabIndex={-1}
                    />
                    <Calendar size={12} />
                    <span>{format(currentStartDate, 'EEE, MMM d, yyyy')}</span>
                  </label>
                </div>

                <div className="time-stepper-touch-grid">
                  <div className="stepper-column-box">
                    <span className="stepper-label-tag">Hour</span>
                    <div className="stepper-number-display">{startHour12 < 10 ? `0${startHour12}` : startHour12}</div>
                    <div className="stepper-buttons-row">
                      <button onClick={() => stepStartHour(-1)} className="stepper-arrow-btn" aria-label="Decrease start hour">
                        <Minus size={15} />
                      </button>
                      <button onClick={() => stepStartHour(1)} className="stepper-arrow-btn" aria-label="Increase start hour">
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="stepper-column-box">
                    <span className="stepper-label-tag">Minute</span>
                    <div className="stepper-number-display">{startMinutes < 10 ? `0${startMinutes}` : startMinutes}</div>
                    <div className="stepper-buttons-row">
                      <button onClick={() => stepStartMinute(-5)} className="stepper-arrow-btn" aria-label="Decrease start 5 minutes">
                        <Minus size={15} />
                      </button>
                      <button onClick={() => stepStartMinute(5)} className="stepper-arrow-btn" aria-label="Increase start 5 minutes">
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="stepper-column-box">
                    <span className="stepper-label-tag">Period</span>
                    <div className="stepper-number-display">{startPeriod}</div>
                    <button onClick={toggleStartPeriod} className="ampm-toggle-btn">
                      AM / PM
                    </button>
                  </div>
                </div>
              </div>

              {/* Check-Out / End Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Check-out / End
                  </span>
                  <label
                    onClick={handleOpenEndDatePicker}
                    className="text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300/80 cursor-pointer flex items-center gap-1"
                  >
                    <input
                      ref={endDateInputRef}
                      type="date"
                      value={format(currentEndDate, 'yyyy-MM-dd')}
                      onChange={(e) => selectExplicitEndDate(e.target.value)}
                      className="absolute opacity-0 pointer-events-none w-0 h-0"
                      aria-label="Pick end date"
                      tabIndex={-1}
                    />
                    <Calendar size={12} />
                    <span>{format(currentEndDate, 'EEE, MMM d, yyyy')}</span>
                  </label>
                </div>

                <div className="time-stepper-touch-grid">
                  <div className="stepper-column-box">
                    <span className="stepper-label-tag">Hour</span>
                    <div className="stepper-number-display">{endHour12 < 10 ? `0${endHour12}` : endHour12}</div>
                    <div className="stepper-buttons-row">
                      <button onClick={() => stepEndHour(-1)} className="stepper-arrow-btn" aria-label="Decrease end hour">
                        <Minus size={15} />
                      </button>
                      <button onClick={() => stepEndHour(1)} className="stepper-arrow-btn" aria-label="Increase end hour">
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="stepper-column-box">
                    <span className="stepper-label-tag">Minute</span>
                    <div className="stepper-number-display">{endMinutes < 10 ? `0${endMinutes}` : endMinutes}</div>
                    <div className="stepper-buttons-row">
                      <button onClick={() => stepEndMinute(-5)} className="stepper-arrow-btn" aria-label="Decrease end 5 minutes">
                        <Minus size={15} />
                      </button>
                      <button onClick={() => stepEndMinute(5)} className="stepper-arrow-btn" aria-label="Increase end 5 minutes">
                        <Plus size={15} />
                      </button>
                    </div>
                  </div>

                  <div className="stepper-column-box">
                    <span className="stepper-label-tag">Period</span>
                    <div className="stepper-number-display">{endPeriod}</div>
                    <button onClick={toggleEndPeriod} className="ampm-toggle-btn">
                      AM / PM
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════ INLINE CATEGORY / MODE EXPANSION DRAWER ══════ */}
      {expandedSection === 'category' && (
        <div className="living-inline-drawer">
          <div className="living-inline-drawer-header">
            <span className="flex items-center gap-1.5">
              <Tag size={14} className="text-amber-700" />
              <span>Schedule Type & Category</span>
            </span>
            <button
              onClick={() => setExpandedSection(null)}
              className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-0.5"
            >
              <span>Done</span>
              <X size={13} />
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="living-mode-switcher">
            <button
              onClick={() => setActiveMode('event')}
              className={`living-mode-btn ${activeMode === 'event' ? 'active' : ''}`}
            >
              <Calendar size={14} />
              <span>Calendar Event</span>
            </button>
            <button
              onClick={() => setActiveMode('reminder')}
              className={`living-mode-btn ${activeMode === 'reminder' ? 'active' : ''}`}
            >
              <Bell size={14} />
              <span>Task Reminder</span>
            </button>
          </div>

          {/* Category Grid */}
          <div className="category-picker-grid">
            {(activeMode === 'event' ? EVENT_CATEGORIES : REMINDER_CATEGORIES).map((cat) => {
              const isSelected = category.toLowerCase().includes(cat.name.toLowerCase())
              const IconComp = cat.icon
              return (
                <button
                  key={cat.name}
                  onClick={() => {
                    onSelectCategory(cat.name, '', activeMode)
                    setExpandedSection(null)
                  }}
                  className={`category-picker-item ${isSelected ? 'selected' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <IconComp size={14} className={isSelected ? 'text-amber-800' : 'text-slate-600'} />
                    <span className="truncate">{cat.label}</span>
                  </div>
                  {isSelected ? (
                    <Check size={14} className="text-amber-800 shrink-0 ml-1" />
                  ) : (
                    <Plus size={14} className="text-slate-400 shrink-0 ml-1" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════ INLINE RECURRENCE & REPEAT EXPANSION DRAWER ══════ */}
      {expandedSection === 'recurrence' && (
        <div className="living-inline-drawer">
          <div className="living-inline-drawer-header">
            <span className="flex items-center gap-1.5">
              <Repeat size={14} className="text-amber-700" />
              <span>Repeat & Recurrence</span>
            </span>
            <button
              onClick={() => {
                commitRecurrenceChange(localRecur, true)
                setExpandedSection(null)
              }}
              className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-0.5 cursor-pointer"
            >
              <span>Done</span>
              <X size={13} />
            </button>
          </div>

          {/* Live Summary Card */}
          <div className="living-recurrence-summary-card">
            <div className="living-recurrence-summary-icon">
              <Repeat size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-2xs font-extrabold uppercase tracking-wider text-amber-800/80">
                Current Repeat Schedule
              </div>
              <div className="text-xs font-bold text-slate-900 truncate">
                {recurrenceSummary}
              </div>
            </div>
          </div>

          {/* Quick Frequency Presets Grid */}
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wider">
              Frequency
            </div>
            <div className="recur-preset-grid">
              <button
                type="button"
                onClick={() => handleSelectPresetFrequency('none')}
                className={`recur-preset-pill ${localRecur.freq === 'none' ? 'active' : ''}`}
              >
                <span>Does not repeat</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPresetFrequency('daily', 1)}
                className={`recur-preset-pill ${localRecur.freq === 'daily' && localRecur.interval === 1 ? 'active' : ''}`}
              >
                <span>Daily</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPresetFrequency('weekly', 1, [currentStartDate.getDay()])}
                className={`recur-preset-pill ${localRecur.freq === 'weekly' && localRecur.interval === 1 ? 'active' : ''}`}
              >
                <span>Weekly</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPresetFrequency('weekly', 2, [currentStartDate.getDay()])}
                className={`recur-preset-pill ${localRecur.freq === 'weekly' && localRecur.interval === 2 ? 'active' : ''}`}
              >
                <span>Every 2 Wks</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPresetFrequency('monthly', 1)}
                className={`recur-preset-pill ${localRecur.freq === 'monthly' && localRecur.interval === 1 ? 'active' : ''}`}
              >
                <span>Monthly</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPresetFrequency('yearly', 1)}
                className={`recur-preset-pill ${localRecur.freq === 'yearly' && localRecur.interval === 1 ? 'active' : ''}`}
              >
                <span>Yearly</span>
              </button>
            </div>
          </div>

          {/* Detailed Recurrence Controls when repeating */}
          {localRecur.freq !== 'none' && (
            <div className="space-y-3 pt-1">
              {/* Interval Stepper Box */}
              <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Repeat Every
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                      {localRecur.interval} {localRecur.freq === 'daily' ? (localRecur.interval === 1 ? 'day' : 'days') : localRecur.freq === 'weekly' ? (localRecur.interval === 1 ? 'week' : 'weeks') : localRecur.freq === 'monthly' ? (localRecur.interval === 1 ? 'month' : 'months') : (localRecur.interval === 1 ? 'year' : 'years')}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 gap-1">
                    <button
                      type="button"
                      onClick={() => handleStepInterval(-1)}
                      disabled={localRecur.interval <= 1}
                      className="min-w-[44px] min-h-[44px] rounded-lg bg-white border border-slate-200 text-slate-800 font-bold flex items-center justify-center hover:bg-amber-50 hover:border-amber-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-95 shadow-2xs"
                      aria-label="Decrease interval"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-12 text-center font-mono font-extrabold text-base text-slate-900">
                      {localRecur.interval}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleStepInterval(1)}
                      disabled={localRecur.interval >= 99}
                      className="min-w-[44px] min-h-[44px] rounded-lg bg-white border border-slate-200 text-slate-800 font-bold flex items-center justify-center hover:bg-amber-50 hover:border-amber-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-95 shadow-2xs"
                      aria-label="Increase interval"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  {/* Frequency Unit Selector */}
                  <div className="grid grid-cols-4 gap-1 flex-1">
                    {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((unit) => (
                      <button
                        key={unit}
                        type="button"
                        onClick={() => handleSelectPresetFrequency(unit, localRecur.interval)}
                        className={`py-2 px-1 rounded-lg text-2xs font-bold capitalize transition-all border text-center cursor-pointer ${
                          localRecur.freq === unit
                            ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
                        }`}
                      >
                        {unit === 'daily' ? 'Days' : unit === 'weekly' ? 'Weeks' : unit === 'monthly' ? 'Months' : 'Years'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Day of Week Selector for Weekly */}
              {localRecur.freq === 'weekly' && (
                <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                      Repeat on Days
                    </span>
                    {/* Quick Day Presets */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => commitRecurrenceChange({ ...localRecur, byDay: [1, 2, 3, 4, 5] })}
                        className="text-2xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-200 cursor-pointer transition-colors"
                      >
                        Weekdays
                      </button>
                      <button
                        type="button"
                        onClick={() => commitRecurrenceChange({ ...localRecur, byDay: [0, 6] })}
                        className="text-2xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-200 cursor-pointer transition-colors"
                      >
                        Weekends
                      </button>
                    </div>
                  </div>

                  <div className="recur-days-row">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayInitial, idx) => {
                      const isSelected = localRecur.byDay.includes(idx)
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleToggleDay(idx)}
                          className={`recur-day-circle-btn ${isSelected ? 'active' : ''}`}
                          aria-label={`Toggle ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][idx]}`}
                        >
                          <span>{dayInitial}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* End Condition Box */}
              <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-2">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  End Condition
                </div>

                <div className="recur-end-tabs-grid">
                  <button
                    type="button"
                    onClick={() => handleSetEndType('never')}
                    className={`recur-end-tab-btn ${localRecur.endType === 'never' ? 'active' : ''}`}
                  >
                    <span>Never</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetEndType('date')}
                    className={`recur-end-tab-btn ${localRecur.endType === 'date' ? 'active' : ''}`}
                  >
                    <span>On Date</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetEndType('count')}
                    className={`recur-end-tab-btn ${localRecur.endType === 'count' ? 'active' : ''}`}
                  >
                    <span>After Count</span>
                  </button>
                </div>

                {/* Sub-controls for On Date */}
                {localRecur.endType === 'date' && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-2">
                      <label
                        onClick={handleOpenRecurrenceEndDatePicker}
                        className="flex-1 text-xs font-bold text-slate-800 bg-slate-50 hover:bg-amber-50/60 px-3 py-2 rounded-lg border border-slate-200 hover:border-amber-300 cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <input
                          ref={recurrenceEndDateInputRef}
                          type="date"
                          value={localRecur.endDate || format(addDays(currentStartDate, 30), 'yyyy-MM-dd')}
                          onChange={(e) => handleSetEndDate(e.target.value)}
                          className="absolute opacity-0 pointer-events-none w-0 h-0"
                          aria-label="Pick recurrence end date"
                          tabIndex={-1}
                        />
                        <span className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-amber-700" />
                          <span>
                            {localRecur.endDate
                              ? format(new Date(localRecur.endDate + 'T12:00:00'), 'EEE, MMM d, yyyy')
                              : 'Select End Date'}
                          </span>
                        </span>
                        <Pencil size={11} className="text-slate-400" />
                      </label>
                    </div>

                    {/* Quick Date Presets */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                      {[
                        { label: '+1 Month', days: 30 },
                        { label: '+3 Months', days: 90 },
                        { label: '+6 Months', days: 180 },
                        { label: 'End of Year', date: `${currentStartDate.getFullYear()}-12-31` },
                      ].map((preset, idx) => {
                        const targetDateStr = preset.date || format(addDays(currentStartDate, preset.days!), 'yyyy-MM-dd')
                        const isPresetActive = localRecur.endDate === targetDateStr
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSetEndDate(targetDateStr)}
                            className={`px-2 py-1 rounded-md text-2xs font-bold transition-all border whitespace-nowrap cursor-pointer ${
                              isPresetActive
                                ? 'bg-amber-100 border-amber-400 text-amber-900'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
                            }`}
                          >
                            {preset.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Sub-controls for After Count */}
                {localRecur.endType === 'count' && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-semibold text-slate-600">
                      Total Occurrences
                    </span>
                    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 gap-1">
                      <button
                        type="button"
                        onClick={() => handleStepCount(-1)}
                        disabled={(localRecur.count || 10) <= 1}
                        className="min-w-[44px] min-h-[44px] rounded-lg bg-white border border-slate-200 text-slate-800 font-bold flex items-center justify-center hover:bg-amber-50 hover:border-amber-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-95 shadow-2xs"
                        aria-label="Decrease occurrences"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-10 text-center font-mono font-extrabold text-sm text-slate-900">
                        {localRecur.count || 10}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleStepCount(1)}
                        disabled={(localRecur.count || 10) >= 999}
                        className="min-w-[44px] min-h-[44px] rounded-lg bg-white border border-slate-200 text-slate-800 font-bold flex items-center justify-center hover:bg-amber-50 hover:border-amber-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all active:scale-95 shadow-2xs"
                        aria-label="Increase occurrences"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
