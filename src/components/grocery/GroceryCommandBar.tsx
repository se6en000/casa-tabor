import { type RefObject, type KeyboardEvent, type PointerEvent } from 'react'
import { Sparkles, Mic } from 'lucide-react'
import { Button, Chip, Heading, IconButton, Input } from '../ui'
import { cn } from '../../utils/cn'
import { type ParsedVoiceGroceryItem } from '../../utils/groceryBatchVoiceParser.ts'
import GroceryVoiceStagingRibbon from './GroceryVoiceStagingRibbon'

export interface GroceryCommandBarProps {
  uncheckedCount: number
  checkedCount: number
  syncStatusLabel: string
  inputValue: string
  inputRef: RefObject<HTMLInputElement | null>
  mergeSuggestion: { id: string; name: string } | null
  isListening?: boolean
  stagedVoiceItems?: ParsedVoiceGroceryItem[]
  onInputChange: (val: string) => void
  onInputKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  onAddItem: () => void
  onQuickAdd: (name: string) => void
  onSpotlightItem: (id: string) => void
  onForceAddSuggestion: () => void
  onClearChecked?: () => void
  onMicPointerDown?: (e: PointerEvent<HTMLButtonElement>) => void
  onMicPointerUp?: (e: PointerEvent<HTMLButtonElement>) => void
  onMicPointerCancel?: (e: PointerEvent<HTMLButtonElement>) => void
  onRemoveStagedItem?: (id: string) => void
  onCommitStagedItems?: (items: ParsedVoiceGroceryItem[]) => void
  onCancelStagedItems?: () => void
}

const EXPRESS_STRIP_ITEMS = [
  'Fresh Basil',
  'Whole Milk',
  'Pasture Eggs',
  'Avocados',
  'Sourdough Loaf',
  'Cold Brew',
  'Organic Bananas',
  'Olive Oil',
  'Butter',
  'Lemons',
]

export default function GroceryCommandBar({
  uncheckedCount,
  checkedCount,
  syncStatusLabel,
  inputValue,
  inputRef,
  mergeSuggestion,
  isListening = false,
  stagedVoiceItems = [],
  onInputChange,
  onInputKeyDown,
  onAddItem,
  onQuickAdd,
  onSpotlightItem,
  onForceAddSuggestion,
  onClearChecked,
  onMicPointerDown,
  onMicPointerUp,
  onMicPointerCancel,
  onRemoveStagedItem,
  onCommitStagedItems,
  onCancelStagedItems,
}: GroceryCommandBarProps) {
  return (
    <div className="space-y-3.5 pb-3.5 border-b border-casa-border/60">
      {/* Brand & Metric Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-casa-gold/15 text-casa-gold border border-casa-gold/25 shadow-2xs">
              <Sparkles size={15} />
            </span>
            <Heading role="display-sm" className="font-display text-display-sm font-semibold text-casa-navy tracking-tight truncate leading-none">Grocery List</Heading>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-casa-accent-soft text-casa-top-pick-band border border-casa-gold/30">
              {uncheckedCount} to buy
            </span>
            {checkedCount > 0 && (
              <Chip
                tone="success"
                size="sm"
                onClick={onClearChecked}
                title={onClearChecked ? 'Click to clear completed items' : undefined}
                className={cn('transition-opacity shrink-0', onClearChecked && 'cursor-pointer hover:opacity-85')}
              >
                ✓ {checkedCount} in cart{onClearChecked ? ' · Clear' : ''}
              </Chip>
            )}
            <span className="text-caption text-casa-muted hidden lg:inline font-medium ml-1">
              · {syncStatusLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Ergonomic Compact Item Composer */}
      <div className="space-y-2">
        <div
          className={cn(
            'w-full max-w-2xl flex items-center gap-2 rounded-2xl border px-2.5 py-1.5 shadow-2xs transition-all',
            isListening
              ? 'bg-casa-accent-subtle/80 border-casa-gold ring-2 ring-casa-gold/25 shadow-md'
              : 'bg-casa-surface border-casa-border focus-within:border-casa-gold/60 focus-within:ring-2 focus-within:ring-casa-gold/15'
          )}
        >
          {/* Luxury Strict Press-and-Hold Microphone Trigger on Left */}
          <IconButton
            variant={isListening ? 'secondary' : 'ghost'}
            size="sm"
            onPointerDown={onMicPointerDown}
            onPointerUp={onMicPointerUp}
            onPointerCancel={onMicPointerCancel}
            aria-label={isListening ? 'Release to add items' : 'Press and hold to speak grocery list'}
            title={isListening ? 'Listening... release to add items' : 'Press and hold to speak grocery list'}
            className={cn(
              'shrink-0 select-none touch-none transition-all duration-200',
              isListening
                ? 'bg-casa-gold text-white shadow-2xs scale-105'
                : 'text-casa-gold hover:text-casa-navy hover:bg-casa-accent-soft'
            )}
            icon={<Mic size={17} />}
          />

          {/* Undulating Champagne Soundwave while listening */}
          {isListening && (
            <div className="tactile-waveform shrink-0" aria-label="Listening audio waveform">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          )}

          <Input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={
              isListening
                ? 'Listening… release when done speaking'
                : 'Add fresh produce, dairy, bakery, meat, or pantry staple…'
            }
            className={cn(
              'flex-1 border-0 bg-transparent shadow-none text-body focus:outline-none py-1.5',
              isListening ? 'placeholder:text-casa-top-pick-band font-medium' : 'placeholder:text-casa-muted/60'
            )}
            aria-label="Add grocery item"
          />

          <Button
            variant="champagne"
            size="sm"
            onClick={onAddItem}
            disabled={!inputValue.trim()}
            className="shrink-0 font-semibold px-4 rounded-xl"
          >
            Add to list
          </Button>
        </div>

        {/* Staged Voice Ingestion Ribbon if items are detected */}
        {stagedVoiceItems.length > 0 && onRemoveStagedItem && onCommitStagedItems && onCancelStagedItems && (
          <div className="w-full max-w-2xl pt-1">
            <GroceryVoiceStagingRibbon
              items={stagedVoiceItems}
              onRemoveItem={onRemoveStagedItem}
              onCommitAll={onCommitStagedItems}
              onCancel={onCancelStagedItems}
            />
          </div>
        )}

        {/* Quick 1-Tap Express Staples Bar (Pantry Rhythms) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          <span className="text-2xs font-mono font-bold uppercase tracking-wider text-casa-muted/80 shrink-0 mr-1">
            Express:
          </span>
          {EXPRESS_STRIP_ITEMS.map((item) => (
            <Chip
              key={`quick-strip-${item}`}
              onClick={() => onQuickAdd(item)}
              size="sm"
              tone="neutral"
              className="shrink-0"
            >
              + {item}
            </Chip>
          ))}
        </div>
      </div>

      {/* Merge Suggestion Alert if present */}
      {mergeSuggestion && (
        <div className="w-full max-w-2xl rounded-xl border border-casa-gold/30 bg-casa-surface-subtle px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-2xs">
          <p className="text-caption text-casa-navy font-medium">
            Similar provision already listed: <span className="text-body font-semibold text-casa-text">{mergeSuggestion.name}</span>
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            <Chip
              tone="accent"
              size="sm"
              onClick={() => onSpotlightItem(mergeSuggestion.id)}
            >
              View
            </Chip>
            <Chip
              tone="neutral"
              size="sm"
              onClick={onForceAddSuggestion}
            >
              Add anyway
            </Chip>
          </div>
        </div>
      )}
    </div>
  )
}
