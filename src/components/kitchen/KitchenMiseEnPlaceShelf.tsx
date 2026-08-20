import { useMemo } from 'react'
import { Check, Scale, Utensils } from 'lucide-react'
import { Button, Card, Progress, SegmentedControl } from '../ui'
import { cn } from '../../utils/cn'

export interface KitchenIngredientRow {
  id: string
  name: string
  qty: string | null
  rawText: string
  isNeededForCurrentStep?: boolean
}

interface KitchenMiseEnPlaceShelfProps {
  ingredients: KitchenIngredientRow[]
  checkedIds: Set<string>
  onToggleIngredient: (id: string) => void
  onCheckAll: () => void
  onUncheckAll: () => void
  recipeScale: '0.5' | '1' | '2'
  onChangeScale: (scale: '0.5' | '1' | '2') => void
  className?: string
}

export default function KitchenMiseEnPlaceShelf({
  ingredients,
  checkedIds,
  onToggleIngredient,
  onCheckAll,
  onUncheckAll,
  recipeScale,
  onChangeScale,
  className,
}: KitchenMiseEnPlaceShelfProps) {
  const totalCount = ingredients.length
  const preppedCount = useMemo(() => {
    return ingredients.filter((item) => checkedIds.has(item.id)).length
  }, [ingredients, checkedIds])

  const allPrepped = totalCount > 0 && preppedCount === totalCount
  const progressPercent = totalCount > 0 ? Math.round((preppedCount / totalCount) * 100) : 0

  return (
    <Card
      tone="surface"
      padding="md"
      className={cn('flex flex-col h-full overflow-hidden shadow-sm border-casa-border', className)}
    >
      {/* Shelf Header */}
      <div className="pb-3 border-b border-casa-border/80 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center">
              <Utensils size={16} />
            </div>
            <div>
              <h2 className="font-display text-body font-bold text-casa-navy">
                Mise en Place
              </h2>
              <p className="text-2xs text-casa-muted font-medium">
                {preppedCount} of {totalCount} prepped
              </p>
            </div>
          </div>

          <span className="font-mono text-body-sm font-bold text-casa-navy bg-casa-bg px-2.5 py-1 rounded-lg border border-casa-border/60 tabular-nums">
            {progressPercent}%
          </span>
        </div>

        {/* Mini progress bar */}
        <Progress
          value={preppedCount}
          max={Math.max(1, totalCount)}
          aria-label="Ingredients prepped progress"
        />
      </div>

      {/* Portion Scale Toolbar */}
      <div className="py-2.5 space-y-1.5 border-b border-casa-border/60 shrink-0">
        <div className="flex items-center justify-between text-2xs font-bold uppercase tracking-wider text-casa-muted">
          <span className="flex items-center gap-1">
            <Scale size={12} className="text-casa-gold" /> Portion Scale
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={allPrepped ? onUncheckAll : onCheckAll}
            className="h-auto p-0 text-casa-gold hover:underline lowercase font-medium text-caption min-h-0"
          >
            {allPrepped ? 'uncheck all' : 'check all'}
          </Button>
        </div>
        <SegmentedControl
          aria-label="Recipe portion multiplier"
          value={recipeScale}
          onChange={(val) => onChangeScale(val as '0.5' | '1' | '2')}
          fullWidth
          options={[
            { value: '0.5', label: '0.5× Half' },
            { value: '1', label: '1× Standard' },
            { value: '2', label: '2× Double' },
          ]}
        />
      </div>

      {/* Ingredient Items Checklist */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 py-3 pr-1">
        {ingredients.map((item) => {
          const isChecked = checkedIds.has(item.id)
          const isNeeded = item.isNeededForCurrentStep

          return (
            <div
              key={item.id}
              onClick={() => onToggleIngredient(item.id)}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault()
                  onToggleIngredient(item.id)
                }
              }}
              className={cn(
                'w-full p-3 rounded-2xl border text-left transition-all flex items-center justify-between gap-3 min-h-[48px] active:scale-[0.99] select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-casa-gold',
                isChecked
                  ? 'bg-casa-bg/60 border-casa-border/60 opacity-60'
                  : isNeeded
                  ? 'bg-amber-500/10 border-amber-500/50 shadow-xs ring-1 ring-amber-500/20'
                  : 'bg-casa-surface border-casa-border/80 hover:border-casa-gold/60'
              )}
              aria-checked={isChecked}
              role="checkbox"
              tabIndex={0}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={cn(
                    'w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                    isChecked
                      ? 'bg-emerald-500 text-white'
                      : isNeeded
                      ? 'bg-amber-500/20 text-amber-700 border border-amber-500/40'
                      : 'border-2 border-casa-border text-transparent'
                  )}
                >
                  <Check size={14} strokeWidth={3} />
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-body-sm font-semibold truncate',
                      isChecked ? 'line-through text-casa-muted' : 'text-casa-navy'
                    )}
                  >
                    {item.name}
                  </p>
                  {isNeeded && !isChecked && (
                    <span className="text-2xs font-bold uppercase tracking-widest text-amber-700 block">
                      Needed this step
                    </span>
                  )}
                </div>
              </div>

              {item.qty && (
                <span
                  className={cn(
                    'font-mono text-caption font-bold px-2 py-0.5 rounded-md shrink-0 tabular-nums',
                    isChecked
                      ? 'bg-black/5 text-casa-muted'
                      : isNeeded
                      ? 'bg-amber-500/20 text-amber-900 border border-amber-500/30'
                      : 'bg-casa-bg border border-casa-border text-casa-navy'
                  )}
                >
                  {item.qty}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
