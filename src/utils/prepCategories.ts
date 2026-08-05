// Enforced prep-item category taxonomy — the single source of truth for label, icon,
// and tone used identically across Action Hub filter chips/card badges, the "Needs You"
// home panel, and the prep item detail sheet.
//
// This replaces the old free-text `type` field, which drifted to 17 different values
// over time (reminder, forms, medical, payment, delivery, gift, general, cancellation,
// prep, travel, response, billing, deadline, rsvp, dish, billing/payment, return) with
// zero enforcement — three different UI surfaces each hand-rolled their own partial
// mapping of it. See supabase/migrations/20260805150000_prep_category_taxonomy_and_overdue_safety_valve.sql
// for the DB-side enforcement and analyze-prep/index.ts for the LLM-side enum.
//
// Deliberately closed and small (9 categories, no emojis, no user-defined additions):
// a fixed taxonomy is what keeps the AI classifier consistent and the filter chips
// memorable. If a real, recurring gap shows up, it's a "revisit the taxonomy"
// conversation — not a self-service add button.
import type { ComponentType } from 'react'
import {
  Gift, UtensilsCrossed, FileText, CreditCard, Plane,
  HeartPulse, Home, ReplyAll, ClipboardList,
} from 'lucide-react'
import type { ChipTone } from '../design-system/variants.mjs'
import type { PrepItem, PrepItemCategory } from '../types'

type IconComponent = ComponentType<{ size?: number | string; className?: string; strokeWidth?: number }>

export interface PrepCategoryConfig {
  key: PrepItemCategory
  label: string
  icon: IconComponent
  tone: ChipTone
}

/** Ordered so the filter-chip row renders in a stable, sensible sequence. */
export const PREP_CATEGORIES: PrepCategoryConfig[] = [
  { key: 'gift_occasion', label: 'Gifts & Occasions', icon: Gift, tone: 'accent' },
  { key: 'food_hosting', label: 'Food & Hosting', icon: UtensilsCrossed, tone: 'warning' },
  { key: 'forms_paperwork', label: 'Forms & Paperwork', icon: FileText, tone: 'info' },
  { key: 'bills_payments', label: 'Bills & Payments', icon: CreditCard, tone: 'danger' },
  { key: 'travel_trips', label: 'Travel & Trips', icon: Plane, tone: 'info' },
  { key: 'medical_health', label: 'Medical & Health', icon: HeartPulse, tone: 'danger' },
  { key: 'household_errands', label: 'Household & Errands', icon: Home, tone: 'neutral' },
  { key: 'rsvp_response', label: 'RSVP & Responses', icon: ReplyAll, tone: 'accent' },
  { key: 'general_todo', label: 'General To-Do', icon: ClipboardList, tone: 'neutral' },
]

const CATEGORY_BY_KEY: Record<PrepItemCategory, PrepCategoryConfig> = Object.fromEntries(
  PREP_CATEGORIES.map((c) => [c.key, c])
) as Record<PrepItemCategory, PrepCategoryConfig>

/** Resolves a prep item's category config, falling back to General To-Do for any
 * legacy row that predates the `category` column backfill. */
export function getPrepCategoryConfig(item: Pick<PrepItem, 'category'>): PrepCategoryConfig {
  return (item.category && CATEGORY_BY_KEY[item.category]) || CATEGORY_BY_KEY.general_todo
}
