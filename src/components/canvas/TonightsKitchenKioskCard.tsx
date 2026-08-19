import { useState } from 'react'
import {
  Utensils,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Clock,
  Plus,
  ChefHat,
  RotateCcw,
} from 'lucide-react'
import { Button } from '../ui'
import { useTonightsKitchenMeal } from '../../hooks/useTonightsKitchenMeal'
import { cn } from '../../utils/cn'

interface TonightsKitchenKioskCardProps {
  navigateTo: (path: string) => void
}

export function TonightsKitchenKioskCard({ navigateTo }: TonightsKitchenKioskCardProps) {
  const {
    isLoading,
    hasMeal,
    recipe,
    cookMinutes,
    targetTime,
    prepStartTime,
    isPrepTimeNow,
    isDinnerPast,
    isCompleted,
    pantryStatus,
    addMissingToGroceryList,
  } = useTonightsKitchenMeal()

  const [addingToGrocery, setAddingToGrocery] = useState(false)
  const [addedGrocerySuccess, setAddedGrocerySuccess] = useState(false)

  const handleLaunchAIDrawer = () => {
    document.dispatchEvent(
      new CustomEvent('open-ai-chat', {
        detail: {
          agent: 'chef',
          prompt: 'What can I cook for dinner tonight based on what is currently in our pantry?',
          autoSend: true,
          source: 'tonights-kitchen-widget',
        },
      })
    )
  }

  const handleAddGrocery = async () => {
    setAddingToGrocery(true)
    try {
      await addMissingToGroceryList()
      setAddedGrocerySuccess(true)
      setTimeout(() => setAddedGrocerySuccess(false), 4000)
    } catch (err) {
      console.error('Failed to add missing ingredients to grocery list:', err)
    } finally {
      setAddingToGrocery(false)
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-3xl p-6 bg-gradient-to-br from-amber-500/10 via-casa-surface to-casa-surface border border-amber-500/20 shadow-sm animate-pulse min-h-[220px]">
        <div className="h-6 w-36 bg-amber-500/20 rounded mb-4" />
        <div className="h-8 w-3/4 bg-casa-border/40 rounded mb-2" />
        <div className="h-4 w-1/2 bg-casa-border/30 rounded" />
      </div>
    )
  }

  // ── State 3: Evening Wind-Down / Dinner Completed ──
  if (isDinnerPast || isCompleted) {
    return (
      <div className="rounded-3xl p-6 bg-gradient-to-br from-slate-900/5 via-casa-surface to-casa-surface border border-slate-200 shadow-sm flex flex-col justify-between transition-all">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center font-bold">
              <CheckCircle2 size={16} />
            </div>
            <span className="text-caption font-bold uppercase tracking-widest text-slate-600">
              Tonight's Kitchen
            </span>
          </div>
          <span className="text-caption font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            Dinner Completed
          </span>
        </div>

        <div>
          <h3 className="font-display text-heading font-bold text-casa-navy">
            {recipe?.name || 'Tonight\'s Dinner'} Served
          </h3>
          <p className="text-body-sm text-casa-text-secondary mt-1">
            Dinner finished & kitchen cleaned up. Great job chef!
          </p>
        </div>

        <div className="pt-4 mt-4 border-t border-casa-border/50 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLaunchAIDrawer}
            className="text-caption font-semibold text-casa-text-secondary hover:text-casa-navy flex items-center gap-1 min-h-[44px]"
          >
            <Sparkles size={14} className="text-casa-gold" />
            <span>Plan Tomorrow</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateTo('/cook')}
            className="text-body-sm font-bold text-casa-navy hover:text-casa-gold transition-colors flex items-center gap-1 min-h-[44px] px-3"
          >
            <span>Cook Library</span>
            <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    )
  }

  // ── State 2: No Meal Scheduled for Tonight ──
  if (!hasMeal || !recipe) {
    return (
      <div className="rounded-3xl p-6 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-casa-surface border border-amber-500/30 shadow-sm flex flex-col justify-between transition-all">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center font-bold">
              <Utensils size={16} />
            </div>
            <span className="text-caption font-bold uppercase tracking-widest text-amber-800">
              Tonight's Kitchen
            </span>
          </div>
          <span className="text-caption font-semibold text-amber-800 bg-amber-100/60 px-2.5 py-0.5 rounded-full">
            No Plan Set
          </span>
        </div>

        <div>
          <h3 className="font-display text-heading font-bold text-casa-navy">
            No dinner scheduled for tonight
          </h3>
          <p className="text-body-sm text-casa-text-secondary mt-1">
            Let the AI Chef inspect your pantry inventory and suggest a quick meal on hand.
          </p>
        </div>

        <div className="pt-4 mt-4 border-t border-amber-500/20 flex items-center justify-between gap-3">
          <Button
            variant="strong"
            size="sm"
            onClick={handleLaunchAIDrawer}
            className="w-full font-bold min-h-[44px] rounded-xl flex items-center justify-center gap-2 shadow-sm"
          >
            <Sparkles size={16} className="text-casa-gold animate-pulse" />
            <span>🎲 What can I cook with what's on hand?</span>
          </Button>
        </div>
      </div>
    )
  }

  // ── State 1: Active Dinner Scheduled ──
  return (
    <div
      className={cn(
        'rounded-3xl p-6 bg-gradient-to-br from-amber-500/10 via-casa-surface to-casa-surface border border-amber-500/20 shadow-sm flex flex-col justify-between transition-all',
        isPrepTimeNow && 'ring-2 ring-amber-500/40 bg-amber-500/15'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center font-bold">
            <Utensils size={16} />
          </div>
          <span className="text-caption font-bold uppercase tracking-widest text-amber-800">
            Tonight's Kitchen
          </span>
        </div>
        <span
          className={cn(
            'text-caption font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1',
            isPrepTimeNow
              ? 'bg-amber-500 text-white font-bold animate-pulse'
              : 'text-casa-muted bg-casa-border/30'
          )}
        >
          <Clock size={12} />
          {isPrepTimeNow ? `⏰ Prep Now (${prepStartTime})` : `Prep starts ${prepStartTime}`}
        </span>
      </div>

      <div>
        <h3 className="font-display text-heading font-bold text-casa-navy line-clamp-1">
          {recipe.name}
        </h3>
        <p className="text-body-sm text-casa-text-secondary mt-1 flex items-center gap-2">
          <span>{cookMinutes}m cook</span>
          <span>·</span>
          <span>Target {targetTime}</span>
        </p>
      </div>

      <div className="pt-4 mt-4 border-t border-casa-border/50 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          {pantryStatus.status === 'all_ready' ? (
            <span className="inline-flex items-center gap-1.5 text-caption font-semibold px-2.5 py-1 rounded-md text-emerald-800 bg-emerald-100 border border-emerald-300">
              <CheckCircle2 size={13} /> Ingredients ready
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-caption font-semibold px-2.5 py-1 rounded-md text-amber-800 bg-amber-100 border border-amber-300">
                <AlertCircle size={13} /> Missing {pantryStatus.missingCount} item(s)
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleAddGrocery}
                disabled={addingToGrocery || addedGrocerySuccess}
                className="text-caption font-bold text-casa-navy hover:text-casa-gold flex items-center gap-1 min-h-[36px] px-2 py-0"
              >
                <Plus size={12} />
                <span>{addedGrocerySuccess ? 'Added to List!' : 'Add to List'}</span>
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLaunchAIDrawer}
              className="text-caption font-semibold text-casa-text-secondary hover:text-casa-navy min-h-[44px] px-2"
              title="Change or re-prompt recipe"
            >
              <RotateCcw size={14} />
            </Button>
            <Button
              variant="strong"
              size="sm"
              onClick={() => navigateTo(`/cook?id=${recipe.id}`)}
              className="text-body-sm font-bold flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl shadow-xs"
            >
              <ChefHat size={15} className="text-casa-gold" />
              <span>Start Cooking</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
