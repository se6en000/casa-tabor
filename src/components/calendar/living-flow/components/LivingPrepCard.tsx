import { useState, useMemo, useRef } from 'react'
import { PackageCheck, Plus, Trash2, Sparkles, Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../../lib/supabase'
import { publishEventAggregatePatch } from '../../../../lib/eventAggregateCache'
import type { EventWithDetails } from '../../../../hooks/useCalendarEvents'
import type { EventChecklistItem } from '../../../../types'
import { Button, IconButton, Chip, Input } from '../../../ui'
import { useFamilyMembers } from '../../../../hooks/useFamilyMembers'
import { useAppStore } from '../../../../stores/appStore'
import { materializeSyntheticRoutineEvent } from '../../../../lib/eventMutations'
import { cn } from '../../../../utils/cn'

interface LivingPrepCardProps {
  event: EventWithDetails | null
}

// Category fallback suggestions when no AI suggestions exist
const CATEGORY_PRESET_SUGGESTIONS: Record<string, string[]> = {
  pets: ['Leash & Collar', 'Vet Records / Meds', 'Food & Treats', 'Carrier / Crate'],
  pet_care: ['Leash & Collar', 'Vet Records / Meds', 'Food & Treats', 'Carrier / Crate'],
  sports: ['Water Bottle', 'Uniform / Jersey', 'Cleats / Shoes', 'Towel & Snacks'],
  school: ['Backpack', 'Signed Permission Slip', 'Snack / Lunch', 'Water Bottle'],
  medical: ['Insurance Card', 'Photo ID', 'Medication List', 'Copay / Payment'],
  health: ['Water Bottle', 'Gym Towel', 'Change of Clothes', 'Lock'],
  travel: ['Passports / IDs', 'Boarding Passes', 'Phone Chargers', 'Toiletries Kit'],
  social: ['Host Gift / Wine', 'Appetizer / Dish', 'Camera', 'Card / Gift'],
}

export default function LivingPrepCard({ event }: LivingPrepCardProps) {
  const qc = useQueryClient()
  const items = event?.checklist ?? []
  const [isExpanded, setIsExpanded] = useState(false)
  const [localChecked, setLocalChecked] = useState<Record<string, boolean>>({})
  const [removedIds, setRemovedIds] = useState<Record<string, true>>({})
  const [addedItems, setAddedItems] = useState<EventChecklistItem[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const itemIds = useMemo(() => new Set(items.map((item) => item.id)), [items])
  const visibleItems = useMemo(() => [
    ...items,
    ...addedItems.filter((item) => !itemIds.has(item.id)),
  ].filter((item) => !removedIds[item.id]), [items, addedItems, itemIds, removedIds])

  const aggregateItems = () => visibleItems.map((item) => ({
    ...item,
    checked: localChecked[item.id] ?? item.checked,
  }))

  const packedCount = useMemo(() => {
    return visibleItems.filter((item) => localChecked[item.id] ?? item.checked).length
  }, [visibleItems, localChecked])

  const totalCount = visibleItems.length
  const allPacked = totalCount > 0 && packedCount === totalCount

  // Extract suggestions from AI enrichment
  const suggestions = useMemo(() => {
    const rawEnrichment = event?.enrichment?.what_to_bring as unknown
    let parsed: string[] = []

    if (Array.isArray(rawEnrichment)) {
      parsed = rawEnrichment.map((s) => String(s).trim()).filter(Boolean)
    } else if (typeof rawEnrichment === 'string' && rawEnrichment.trim()) {
      parsed = rawEnrichment
        .split(/[,;\n•·]/)
        .map((s) => s.trim())
        .filter(Boolean)
    }

    // If no AI suggestions, check category presets
    if (parsed.length === 0 && event?.enrichment?.category) {
      const catKey = event.enrichment.category.toLowerCase().replace(/\s+/g, '_')
      if (CATEGORY_PRESET_SUGGESTIONS[catKey]) {
        parsed = CATEGORY_PRESET_SUGGESTIONS[catKey]
      }
    }

    // Filter out items already in the visible list
    const existingLabels = new Set(
      visibleItems.map((item) => (item.label || '').toLowerCase().trim())
    )
    return parsed.filter((s) => !existingLabels.has(s.toLowerCase()))
  }, [event?.enrichment?.what_to_bring, event?.enrichment?.category, visibleItems])

  const invalidateChecklistQueries = async () => {
    if (!event?.id) return
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['events'] }),
      qc.invalidateQueries({ queryKey: ['event-details', event.id] }),
      qc.invalidateQueries({ queryKey: ['today-events'] }),
      qc.invalidateQueries({ queryKey: ['rolling-events'] }),
    ])
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('casa:event-updated', { detail: { eventId: event.id } }))
    }
  }

  const toggle = async (item: EventChecklistItem) => {
    if (!event?.id) return
    const previous = localChecked[item.id] ?? item.checked
    const newVal = !previous
    const previousItems = aggregateItems()
    const nextItems = previousItems.map((entry) => (
      entry.id === item.id ? { ...entry, checked: newVal } : entry
    ))
    setSaveError(null)
    setLocalChecked((prev) => ({ ...prev, [item.id]: newVal }))
    publishEventAggregatePatch(qc, event.id, { checklist: nextItems })

    const { error } = await supabase
      .from('event_checklist_items')
      .update({ checked: newVal })
      .eq('id', item.id)

    if (error) {
      setLocalChecked((prev) => ({ ...prev, [item.id]: previous }))
      publishEventAggregatePatch(qc, event.id, { checklist: previousItems })
      setSaveError(`Could not update "${item.label}". ${error.message}`)
      return
    }
    await invalidateChecklistQueries()
  }

  const remove = async (item: EventChecklistItem) => {
    if (!event?.id) return
    const previousItems = aggregateItems()
    setSaveError(null)
    setRemovedIds((prev) => ({ ...prev, [item.id]: true }))
    publishEventAggregatePatch(qc, event.id, {
      checklist: previousItems.filter((entry) => entry.id !== item.id),
    })

    const { error } = await supabase
      .from('event_checklist_items')
      .delete()
      .eq('id', item.id)

    if (error) {
      setRemovedIds((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      publishEventAggregatePatch(qc, event.id, { checklist: previousItems })
      setSaveError(`Could not remove "${item.label}". ${error.message}`)
      return
    }
    setAddedItems((prev) => prev.filter((a) => a.id !== item.id))
    await invalidateChecklistQueries()
  }

  const { data: familyMembers = [] } = useFamilyMembers()

  const addItem = async (labelToAdd?: string) => {
    const label = (labelToAdd ?? newLabel).trim()
    if (!label || !event?.id) return
    setSaveError(null)

    let targetEventId = event.id
    if (event.id.startsWith('routine-')) {
      try {
        const materialized = await materializeSyntheticRoutineEvent(
          supabase,
          qc,
          event,
          {},
          { familyMembers }
        )
        targetEventId = materialized.id
        useAppStore.getState().setSelectedSidecarEventId(materialized.id)
      } catch (matErr) {
        console.error('[LivingPrepCard] Failed to materialize routine event:', matErr)
        setSaveError(`Could not save item for routine event.`)
        return
      }
    }

    const nextSortOrder = visibleItems.reduce((max, i) => Math.max(max, i.sort_order), -1) + 1
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const optimisticItem: EventChecklistItem = {
      id: tempId,
      event_id: targetEventId,
      label,
      note: null,
      checked: false,
      category: null,
      sort_order: nextSortOrder,
      created_at: new Date().toISOString(),
    }

    setAddedItems((prev) => [...prev, optimisticItem])
    if (!labelToAdd) setNewLabel('')
    publishEventAggregatePatch(qc, event.id, {
      checklist: [...aggregateItems(), optimisticItem],
    })
    if (targetEventId !== event.id) {
      publishEventAggregatePatch(qc, targetEventId, {
        checklist: [...aggregateItems(), optimisticItem],
      })
    }

    const { data, error } = await supabase
      .from('event_checklist_items')
      .insert({ event_id: targetEventId, label, checked: false, sort_order: nextSortOrder })
      .select()
      .single()

    if (error || !data) {
      setSaveError(`Could not add "${label}". ${error?.message ?? 'Unknown error'}`)
      setAddedItems((prev) => prev.filter((a) => a.id !== tempId))
      publishEventAggregatePatch(qc, event.id, {
        checklist: aggregateItems().filter((a) => a.id !== tempId),
      })
      if (targetEventId !== event.id) {
        publishEventAggregatePatch(qc, targetEventId, {
          checklist: aggregateItems().filter((a) => a.id !== tempId),
        })
      }
      return
    }

    const realItem = data as EventChecklistItem
    setAddedItems((prev) => prev.map((a) => (a.id === tempId ? realItem : a)))
    publishEventAggregatePatch(qc, targetEventId, {
      checklist: aggregateItems().map((a) => (a.id === tempId ? realItem : a)),
    })
    await invalidateChecklistQueries()
  }

  const handleOpenEditor = () => {
    setIsExpanded(true)
    setTimeout(() => {
      inputRef.current?.focus()
    }, 100)
  }

  // ═══════════════ STATE 1: EMPTY & COLLAPSED (NO ITEMS YET) ═══════════════
  if (visibleItems.length === 0 && !isExpanded) {
    return (
      <section className="living-prep-card living-prep-card-empty" aria-label="Prep and what to bring">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackageCheck size={16} className="text-casa-gold" />
            <span className="text-2xs font-extrabold uppercase tracking-wider text-casa-navy font-sans">
              Prep & What to Bring
            </span>
          </div>
          {suggestions.length > 0 && (
            <Chip tone="accent" size="sm" icon={<Sparkles size={11} className="text-casa-gold" />}>
              {suggestions.length} suggested
            </Chip>
          )}
        </div>

        {/* If suggestions exist, show smart 1-tap chip row */}
        {suggestions.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2.5">
            <p className="text-caption text-casa-muted">
              Suggested for this event:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.slice(0, 4).map((sugg) => (
                <Chip
                  key={sugg}
                  tone="accent"
                  size="sm"
                  icon={<Plus size={11} />}
                  onClick={() => void addItem(sugg)}
                >
                  {sugg}
                </Chip>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Plus size={14} className="text-casa-gold" />}
              onClick={handleOpenEditor}
              fullWidth
              className="mt-1 border-dashed border-casa-gold/60 bg-casa-surface"
            >
              Add custom item…
            </Button>
          </div>
        ) : (
          /* Clean collapsed button for 1-tap expansion */
          <Button
            variant="secondary"
            size="md"
            leadingIcon={<Plus size={15} className="text-casa-gold" />}
            onClick={handleOpenEditor}
            fullWidth
            className="w-full mt-2 border-dashed border-casa-gold/60 bg-casa-surface hover:border-casa-gold"
          >
            Add Prep & Packing Items
          </Button>
        )}
      </section>
    )
  }

  // ═══════════════ STATE 2: ACTIVE CHECKLIST / EXPANDED ═══════════════
  return (
    <section className="living-prep-card" aria-label="Prep and what to bring checklist">
      {/* Card Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PackageCheck size={16} className="text-casa-gold" />
          <span className="text-2xs font-extrabold uppercase tracking-wider text-casa-navy font-sans">
            Prep & What to Bring
          </span>
        </div>

        {totalCount > 0 && (
          <div
            className={cn(
              'px-2.5 py-0.5 rounded-full text-2xs font-extrabold tracking-wide font-sans transition-all flex items-center gap-1',
              allPacked
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300/60'
                : 'bg-casa-gold-light text-casa-gold-dark border border-casa-gold/40'
            )}
          >
            {allPacked && <Check size={11} className="text-emerald-700 stroke-[3]" />}
            <span>
              {allPacked ? 'All Packed' : `${packedCount}/${totalCount} Packed`}
            </span>
          </div>
        )}
      </div>

      {saveError && (
        <p role="alert" className="text-caption text-casa-error mt-1 font-medium">
          {saveError}
        </p>
      )}

      {/* Checklist Items List */}
      <div className="mt-3 flex flex-col gap-1.5">
        {visibleItems.map((item) => {
          const checked = localChecked[item.id] ?? item.checked
          return (
            <div
              key={item.id}
              onClick={() => void toggle(item)}
              className={cn(
                'living-prep-item-row group',
                checked && 'is-checked'
              )}
            >
              {/* Touch-Friendly Custom Checkbox */}
              <div
                className={cn(
                  'living-prep-checkbox-box shrink-0',
                  checked && 'is-checked'
                )}
              >
                {checked && <Check size={13} className="text-white stroke-[3]" />}
              </div>

              {/* Item Label */}
              <span
                className={cn(
                  'flex-1 text-body-sm font-semibold transition-all select-none',
                  checked
                    ? 'text-casa-muted line-through opacity-70 font-normal'
                    : 'text-casa-navy'
                )}
              >
                {item.label}
              </span>

              {/* Accessible Remove button */}
              <IconButton
                icon={<Trash2 size={14} />}
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  void remove(item)
                }}
                aria-label={`Remove "${item.label}"`}
                title={`Remove "${item.label}"`}
                className="text-casa-muted/60 hover:text-casa-error hover:bg-red-50 shrink-0"
              />
            </div>
          )
        })}
      </div>

      {/* Suggestions Tray (if items remain) */}
      {suggestions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-dashed border-casa-border/80 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-3xs font-extrabold uppercase tracking-wider text-casa-muted">
            <Sparkles size={11} className="text-casa-gold" />
            <span>Suggested additions</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 3).map((sugg) => (
              <Chip
                key={sugg}
                tone="accent"
                size="sm"
                icon={<Plus size={11} />}
                onClick={() => void addItem(sugg)}
              >
                {sugg}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Quick Add Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void addItem()
        }}
        className="mt-3 flex items-center gap-2"
      >
        <Input
          ref={inputRef}
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Add item to pack or prep…"
          aria-label="Add item to pack or prep"
          className="flex-1 min-w-0"
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!newLabel.trim()}
        >
          Add
        </Button>
      </form>
    </section>
  )
}
