import { useState, useEffect, useRef } from 'react'
import { format, addDays } from 'date-fns'
import {
  Calendar, Clock, ChevronDown, Minus, Plus, Tag,
  ShoppingBag, Trophy, Stethoscope, PartyPopper,
  GraduationCap, Utensils, Plane, Church, Pill,
  ShoppingCart, BookOpen, Wrench, PawPrint, ClipboardList,
  Check, Bell, X, Pencil
} from 'lucide-react'
import type { LivingFlowMode } from '../types'

interface LivingHeroTitleCardProps {
  title: string
  category: string
  mode: LivingFlowMode
  startDate: Date
  durationMinutes: number
  onUpdateTitle: (newTitle: string) => void
  onSetStartAndDuration: (startDate: Date, durationMins: number) => void
  onSelectCategory: (catName: string, icon: string, mode: LivingFlowMode) => void
  onNudgeTime: (mins: number) => void
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
  durationMinutes,
  onUpdateTitle,
  onSetStartAndDuration,
  onSelectCategory,
  onNudgeTime
}: LivingHeroTitleCardProps) {
  const safeDate = !startDate || isNaN(new Date(startDate).getTime()) ? new Date() : new Date(startDate)
  const [localTitle, setLocalTitle] = useState(title)
  const [expandedSection, setExpandedSection] = useState<'datetime' | 'category' | null>(null)
  const [currentDate, setCurrentDate] = useState<Date>(safeDate)
  const [duration, setDuration] = useState<number>(durationMinutes)
  const [activeMode, setActiveMode] = useState<LivingFlowMode>(mode)
  const isEditingRef = useRef(false)

  useEffect(() => {
    if (!isEditingRef.current) {
      setLocalTitle(title)
    }
  }, [title])

  useEffect(() => {
    const d = !startDate || isNaN(new Date(startDate).getTime()) ? new Date() : new Date(startDate)
    setCurrentDate(d)
  }, [startDate])

  useEffect(() => {
    setDuration(durationMinutes)
  }, [durationMinutes])

  const formattedDate = format(currentDate, 'EEE, MMM d')
  const formattedTime = format(currentDate, 'h:mm a')

  // Date / Time stepping
  const hours24 = currentDate.getHours()
  const hour12 = hours24 % 12 || 12
  const minutes = currentDate.getMinutes()
  const period = hours24 >= 12 ? 'PM' : 'AM'

  const stepHour = (delta: number) => {
    const next = new Date(currentDate)
    next.setHours(next.getHours() + delta)
    setCurrentDate(next)
    onSetStartAndDuration(next, duration)
  }

  const stepMinute = (delta: number) => {
    const next = new Date(currentDate)
    next.setMinutes(next.getMinutes() + delta)
    setCurrentDate(next)
    onSetStartAndDuration(next, duration)
  }

  const togglePeriod = () => {
    const next = new Date(currentDate)
    if (period === 'AM') {
      next.setHours(next.getHours() + 12)
    } else {
      next.setHours(next.getHours() - 12)
    }
    setCurrentDate(next)
    onSetStartAndDuration(next, duration)
  }

  const selectDayOffset = (days: number) => {
    const target = addDays(new Date(), days)
    const next = new Date(currentDate)
    next.setFullYear(target.getFullYear(), target.getMonth(), target.getDate())
    setCurrentDate(next)
    onSetStartAndDuration(next, duration)
  }

  const selectDuration = (mins: number) => {
    setDuration(mins)
    onSetStartAndDuration(currentDate, mins)
  }

  return (
    <div className={`living-hero-title-card flex flex-col ${expandedSection ? 'has-expanded' : ''}`}>
      {/* In-Place Controlled Editable Title via Zero-Lag CSS Grid Auto-Sizing */}
      <div className="group relative w-full">
        <div className="grid grid-cols-1 grid-rows-1 relative w-full">
          {/* Invisible shadow span that dictates the exact container height without white-space gaps */}
          <span
            aria-hidden="true"
            className="invisible col-start-1 row-start-1 living-event-title px-1.5 -mx-1.5 whitespace-pre-wrap select-none pointer-events-none pr-7"
          >
            {localTitle || 'Event title…'}
          </span>

          {/* Textarea that fills the grid cell exactly */}
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
        {/* Category Pill */}
        <button
          onClick={() => setExpandedSection(prev => prev === 'category' ? null : 'category')}
          className={`living-action-chip ${expandedSection === 'category' ? 'active' : 'gold-active shadow-sm'}`}
        >
          <span>{category}</span>
          <ChevronDown size={12} className={expandedSection === 'category' ? 'rotate-180 transition-transform' : ''} />
        </button>

        {/* Date Pill */}
        <button
          onClick={() => setExpandedSection(prev => prev === 'datetime' ? null : 'datetime')}
          className={`living-action-chip ${expandedSection === 'datetime' ? 'active' : ''}`}
        >
          <Calendar size={13} className={expandedSection === 'datetime' ? 'text-white' : 'text-slate-500'} />
          <span>{formattedDate}</span>
          <ChevronDown size={12} className={expandedSection === 'datetime' ? 'rotate-180 transition-transform' : 'text-slate-400'} />
        </button>

        {/* Time Pill */}
        <button
          onClick={() => setExpandedSection(prev => prev === 'datetime' ? null : 'datetime')}
          className={`living-action-chip ${expandedSection === 'datetime' ? 'active' : ''}`}
        >
          <Clock size={13} className={expandedSection === 'datetime' ? 'text-white' : 'text-slate-500'} />
          <span>{formattedTime}</span>
          <ChevronDown size={12} className={expandedSection === 'datetime' ? 'rotate-180 transition-transform' : 'text-slate-400'} />
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
              <span>Schedule & Start Time</span>
            </span>
            <button
              onClick={() => setExpandedSection(null)}
              className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-0.5"
            >
              <span>Done</span>
              <X size={13} />
            </button>
          </div>

          {/* 1. Day Selector Grid */}
          <div className="day-selector-grid-exact">
            <button onClick={() => selectDayOffset(0)} className="day-select-pill-btn">
              Today<small>{format(new Date(), 'EEE d')}</small>
            </button>
            <button onClick={() => selectDayOffset(1)} className="day-select-pill-btn active">
              Tomorrow<small>{format(addDays(new Date(), 1), 'EEE d')}</small>
            </button>
            <button onClick={() => selectDayOffset(2)} className="day-select-pill-btn">
              {format(addDays(new Date(), 2), 'EEEE')}<small>{format(addDays(new Date(), 2), 'EEE d')}</small>
            </button>
            <button onClick={() => selectDayOffset(3)} className="day-select-pill-btn">
              <div className="flex flex-col items-center justify-center">
                <span>Pick Date</span>
                <Calendar size={12} className="mt-0.5" />
              </div>
            </button>
          </div>

          {/* 2. Touch Stepper Wheels (48px targets) */}
          <div className="time-stepper-touch-grid">
            {/* Hour Column */}
            <div className="stepper-column-box">
              <span className="stepper-label-tag">Hour</span>
              <div className="stepper-number-display">{hour12 < 10 ? `0${hour12}` : hour12}</div>
              <div className="stepper-buttons-row">
                <button onClick={() => stepHour(-1)} className="stepper-arrow-btn" aria-label="Decrease hour">
                  <Minus size={15} />
                </button>
                <button onClick={() => stepHour(1)} className="stepper-arrow-btn" aria-label="Increase hour">
                  <Plus size={15} />
                </button>
              </div>
            </div>

            {/* Minute Column */}
            <div className="stepper-column-box">
              <span className="stepper-label-tag">Minute</span>
              <div className="stepper-number-display">{minutes < 10 ? `0${minutes}` : minutes}</div>
              <div className="stepper-buttons-row">
                <button onClick={() => stepMinute(-5)} className="stepper-arrow-btn" aria-label="Decrease 5 minutes">
                  <Minus size={15} />
                </button>
                <button onClick={() => stepMinute(5)} className="stepper-arrow-btn" aria-label="Increase 5 minutes">
                  <Plus size={15} />
                </button>
              </div>
            </div>

            {/* Period Column */}
            <div className="stepper-column-box">
              <span className="stepper-label-tag">Period</span>
              <div className="stepper-number-display">{period}</div>
              <button onClick={togglePeriod} className="ampm-toggle-btn">
                AM / PM
              </button>
            </div>
          </div>

          {/* 3. Duration Presets */}
          <div className="duration-chips-row">
            {[
              { mins: 45, label: '45m' },
              { mins: 90, label: '1h 30m' },
              { mins: 160, label: '2h 40m' },
              { mins: 240, label: '4h' },
              { mins: 480, label: 'All Day' }
            ].map((item) => (
              <button
                key={item.mins}
                onClick={() => selectDuration(item.mins)}
                className={`dur-chip-btn ${duration === item.mins ? 'active' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </div>
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

    </div>
  )
}
