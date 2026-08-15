import { useState } from 'react'
import {
  Tag, X, Calendar, Bell, ShoppingBag, Trophy, Stethoscope,
  PartyPopper, GraduationCap, Utensils, Plane, Church,
  Pill, ShoppingCart, BookOpen, Wrench, PawPrint, ClipboardList,
  Check, Plus
} from 'lucide-react'
import type { LivingFlowMode } from '../types'

interface CategoryPopoverProps {
  currentCategory: string
  currentMode: LivingFlowMode
  onSelectCategory: (catName: string, icon: string, mode: LivingFlowMode) => void
  onClose: () => void
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

export default function CategoryPopover({
  currentCategory,
  currentMode,
  onSelectCategory,
  onClose
}: CategoryPopoverProps) {
  const [activeMode, setActiveMode] = useState<LivingFlowMode>(currentMode)

  return (
    <div 
      className="living-floating-card living-category-popover"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Title Row */}
      <div className="living-card-title-row">
        <span className="living-card-heading">
          <Tag size={16} className="text-slate-700" />
          <span>Schedule Type & Category</span>
        </span>
        <button
          onClick={onClose}
          className="living-card-close-btn"
          aria-label="Close category popover"
        >
          <X size={16} />
        </button>
      </div>

      {/* Mode Switcher */}
      <div>
        <div className="text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wider">
          Schedule Type
        </div>
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
      </div>

      {/* Category Grid */}
      <div>
        <div className="text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">
          {activeMode === 'event' ? 'Event Categories' : 'Reminder Categories'}
        </div>
        <div className="category-picker-grid">
          {(activeMode === 'event' ? EVENT_CATEGORIES : REMINDER_CATEGORIES).map((cat) => {
            const isSelected = currentCategory.toLowerCase().includes(cat.name.toLowerCase())
            const IconComp = cat.icon
            return (
              <button
                key={cat.name}
                onClick={() => {
                  onSelectCategory(cat.name, '', activeMode)
                  onClose()
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
    </div>
  )
}
