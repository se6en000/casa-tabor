import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { cn } from '../../utils/cn'
import { Checkbox, IconButton } from '../ui'
import type { EventChecklistItem } from '../../types'

/**
 * Shared checklist UI backed by the `event_checklist_items` table — the
 * single structured source of truth for "what to bring"/"pack" lists.
 * Renders read-only (toggle only) by default; pass `editable` to also allow
 * adding and removing rows (used by the full Edit Details sheet and, from
 * Phase 2, the read-only Detail sheet as well).
 */
export default function ChecklistEditor({
  eventId,
  items,
  editable = false,
}: {
  eventId: string
  items: EventChecklistItem[]
  editable?: boolean
}) {
  const [localChecked, setLocalChecked] = useState<Record<string, boolean>>({})
  const [removedIds, setRemovedIds] = useState<Record<string, true>>({})
  const [addedItems, setAddedItems] = useState<EventChecklistItem[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const qc = useQueryClient()

  const visibleItems = [...items, ...addedItems].filter((item) => !removedIds[item.id])

  const toggle = async (item: EventChecklistItem) => {
    const previous = localChecked[item.id] ?? item.checked
    const newVal = !previous
    setSaveError(null)
    setLocalChecked((prev) => ({ ...prev, [item.id]: newVal }))
    const { error } = await supabase.from('event_checklist_items').update({ checked: newVal }).eq('id', item.id)
    if (error) {
      setLocalChecked((prev) => ({ ...prev, [item.id]: previous }))
      setSaveError(`Could not update "${item.label}". ${error.message}`)
      return
    }
    await qc.invalidateQueries({ queryKey: ['events'] })
  }

  const remove = async (item: EventChecklistItem) => {
    setSaveError(null)
    setRemovedIds((prev) => ({ ...prev, [item.id]: true }))
    const { error } = await supabase.from('event_checklist_items').delete().eq('id', item.id)
    if (error) {
      setRemovedIds((prev) => {
        const next = { ...prev }
        delete next[item.id]
        return next
      })
      setSaveError(`Could not remove "${item.label}". ${error.message}`)
      return
    }
    setAddedItems((prev) => prev.filter((a) => a.id !== item.id))
    await qc.invalidateQueries({ queryKey: ['events'] })
  }

  const addItem = async () => {
    const label = newLabel.trim()
    if (!label) return
    setSaveError(null)
    const nextSortOrder = visibleItems.reduce((max, i) => Math.max(max, i.sort_order), -1) + 1
    const { data, error } = await supabase
      .from('event_checklist_items')
      .insert({ event_id: eventId, label, checked: false, sort_order: nextSortOrder })
      .select()
      .single()
    if (error || !data) {
      setSaveError(`Could not add "${label}". ${error?.message ?? 'Unknown error'}`)
      return
    }
    setNewLabel('')
    setAddedItems((prev) => [...prev, data as EventChecklistItem])
    await qc.invalidateQueries({ queryKey: ['events'] })
  }

  return (
    <div>
      {saveError && <p role="alert" className="pb-1 text-caption text-casa-error">{saveError}</p>}
      {visibleItems.map((item, i) => {
        const checked = localChecked[item.id] ?? item.checked
        return (
          <div
            key={item.id}
            className={cn('flex items-center gap-3 py-2', i > 0 && 'border-t border-casa-navy/[0.06]')}
          >
            <Checkbox
              className="flex-1 min-h-0"
              checked={checked}
              onChange={() => void toggle(item)}
              label={(
                <span className={cn('text-body-sm', checked ? 'text-casa-muted line-through' : 'text-casa-navy')}>
                  {item.label}
                </span>
              )}
            />
            {editable && (
              <IconButton
                icon={<X size={14} />}
                variant="ghost"
                size="sm"
                onClick={() => void remove(item)}
                aria-label={`Remove "${item.label}"`}
                className="text-casa-muted hover:text-casa-error"
              />
            )}
          </div>
        )
      })}
      {visibleItems.length === 0 && !editable && (
        <p className="text-body-sm text-casa-muted">Nothing added yet.</p>
      )}
      {editable && (
        <div className="flex items-center gap-2 mt-2 bg-casa-bg rounded-xl border border-casa-border px-3 h-11 focus-within:ring-2 focus-within:ring-casa-gold/40 transition-shadow">
          <Plus size={16} className="text-casa-muted shrink-0" />
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addItem()
              }
            }}
            placeholder="Add an item…"
            className="flex-1 min-w-0 bg-transparent text-body-sm text-casa-text placeholder:text-casa-muted outline-none"
          />
        </div>
      )}
    </div>
  )
}
