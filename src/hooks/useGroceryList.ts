import { useCallback, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface GroceryItem {
  id: string
  list_id: string
  name: string
  quantity: string | null
  unit: string | null
  category: string
  checked: boolean
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  ios_reminder_id: string | null
  ios_updated_at: string | null
  sync_version: number
  last_modified_source: 'casa' | 'ios'
  canonical_item_id: string | null
  subcategory: string | null
  brand: string | null
  store_section: string | null
  enhancement_confidence: number | null
  enhanced_at: string | null
}

export interface GroceryList {
  id: string
  name: string
  created_at: string
}

type NewGroceryItemInput = Pick<
  GroceryItem,
  'list_id' | 'name' | 'quantity' | 'unit' | 'category' | 'checked' | 'notes'
>

export const GROCERY_CATEGORIES = [
  { key: 'produce', label: '🥦 Produce' },
  { key: 'dairy', label: '🥛 Dairy' },
  { key: 'meat', label: '🥩 Meat & Seafood' },
  { key: 'bakery', label: '🍞 Bakery' },
  { key: 'frozen', label: '🧊 Frozen' },
  { key: 'pantry', label: '🥫 Pantry' },
  { key: 'beverages', label: '☕ Beverages' },
  { key: 'snacks', label: '🍿 Snacks' },
  { key: 'deli', label: '🥪 Deli & Prepared' },
  { key: 'household', label: '🧽 Household' },
  { key: 'personal-care', label: '🧴 Personal Care' },
  { key: 'baby', label: '🍼 Baby' },
  { key: 'pet', label: '🐾 Pet' },
  { key: 'other', label: '🛒 Other' },
]

const EMPTY_ITEMS: GroceryItem[] = []
const NORMALIZATION_DEBOUNCE_MS = 1_500
const NORMALIZATION_RETRY_MS = 15_000

async function fetchGroceryData() {
  const [{ data: lists }, { data: items }] = await Promise.all([
    supabase.from('grocery_lists').select('id, name, created_at').order('created_at').limit(5),
    supabase.from('grocery_items').select('*').is('deleted_at', null).order('category').order('name'),
  ])
  return { lists: lists ?? [], items: items ?? [] }
}

export function useGroceryList() {
  const qc = useQueryClient()
  const knownItemIdsRef = useRef<Set<string> | null>(null)
  const pendingNormalizationIdsRef = useRef<Set<string>>(new Set())
  const normalizationTimerRef = useRef<number | null>(null)
  const normalizationInFlightRef = useRef(false)
  const flushIdleNormalizationRef = useRef<() => void>(() => {})

  const flushIdleNormalization = useCallback(() => {
    if (normalizationInFlightRef.current) return
    const ids = Array.from(pendingNormalizationIdsRef.current)
    if (ids.length === 0) return
    pendingNormalizationIdsRef.current.clear()
    normalizationInFlightRef.current = true

    void (async () => {
      try {
        const [{ data: normalizeData, error: normalizeError }, { data: enhanceData, error: enhanceError }] = await Promise.all([
          supabase.functions.invoke('normalize-grocery-items', {
            body: { item_ids: ids },
          }),
          supabase.functions.invoke('enhance-grocery-items', {
            body: { item_ids: ids },
          }),
        ])

        if (normalizeError) throw normalizeError
        if (enhanceError) throw enhanceError

        const correctedCount = Number(normalizeData?.corrected_count ?? 0)
        const enhancedCount = Number(enhanceData?.enhanced_count ?? 0)
        if (correctedCount > 0 || enhancedCount > 0) {
          qc.invalidateQueries({ queryKey: ['grocery'] })
        }
      } catch (err) {
        console.warn('[useGroceryList] idle normalization/enhancement failed', err)
        ids.forEach((id) => pendingNormalizationIdsRef.current.add(id))
      } finally {
        normalizationInFlightRef.current = false
        if (pendingNormalizationIdsRef.current.size > 0 && normalizationTimerRef.current == null) {
          normalizationTimerRef.current = window.setTimeout(() => {
            normalizationTimerRef.current = null
            flushIdleNormalizationRef.current()
          }, NORMALIZATION_RETRY_MS)
        }
      }
    })()
  }, [qc])

  useEffect(() => {
    flushIdleNormalizationRef.current = flushIdleNormalization
  }, [flushIdleNormalization])

  useEffect(() => {
    const handleExternalGroceryUpdate = () => {
      qc.invalidateQueries({ queryKey: ['grocery'] })
    }
    window.addEventListener('casa:grocery-updated', handleExternalGroceryUpdate)
    return () => window.removeEventListener('casa:grocery-updated', handleExternalGroceryUpdate)
  }, [qc])

  useEffect(() => {
    return () => {
      if (normalizationTimerRef.current) {
        window.clearTimeout(normalizationTimerRef.current)
      }
    }
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['grocery'],
    queryFn: fetchGroceryData,
    staleTime: 30_000,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  })

  const addItem = useMutation({
    mutationFn: async (item: NewGroceryItemInput) => {
      const normalizedName = item.name.trim().replace(/\s+/g, ' ')
      if (!normalizedName) return

      const { error } = await supabase.from('grocery_items').insert({
        ...item,
        name: normalizedName,
        last_modified_source: 'casa',
      })
      if (error && error.code !== '23505') throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grocery'] }),
  })

  const toggleItem = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      const { error } = await supabase
        .from('grocery_items')
        .update({ checked, last_modified_source: 'casa' })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, checked }) => {
      await qc.cancelQueries({ queryKey: ['grocery'] })
      qc.setQueryData(['grocery'], (old: typeof data) => {
        if (!old) return old
        return { ...old, items: old.items.map(i => i.id === id ? { ...i, checked } : i) }
      })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['grocery'] }),
  })

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('grocery_items')
        .update({ deleted_at: new Date().toISOString(), last_modified_source: 'casa' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grocery'] }),
  })

  const updateItemCategory = useMutation({
    mutationFn: async ({
      id,
      category,
      fromCategory,
      itemName,
    }: {
      id: string
      category: string
      fromCategory?: string
      itemName?: string
    }) => {
      const { error } = await supabase
        .from('grocery_items')
        .update({ category, last_modified_source: 'casa' })
        .eq('id', id)
      if (error) throw error

      if (fromCategory && fromCategory !== category) {
        const { error: feedbackError } = await supabase
          .from('grocery_category_corrections')
          .insert({
            grocery_item_id: id,
            item_name: itemName?.trim() || null,
            from_category: fromCategory,
            to_category: category,
            source: 'manual-ui',
          })
        if (feedbackError) throw feedbackError
      }
    },
    onMutate: async ({ id, category }) => {
      await qc.cancelQueries({ queryKey: ['grocery'] })
      qc.setQueryData(['grocery'], (old: typeof data) => {
        if (!old) return old
        return { ...old, items: old.items.map(i => i.id === id ? { ...i, category } : i) }
      })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['grocery'] }),
  })

  const clearChecked = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('grocery_items')
        .update({ deleted_at: new Date().toISOString(), last_modified_source: 'casa' })
        .eq('checked', true)
        .is('deleted_at', null)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grocery'] }),
  })

  const lists = data?.lists ?? []
  const items = data?.items ?? EMPTY_ITEMS
  const defaultListId = lists[0]?.id ?? null

  useEffect(() => {
    const currentIds = new Set(items.map((item) => item.id))

    if (!knownItemIdsRef.current) {
      knownItemIdsRef.current = currentIds
      return
    }

    const previouslyKnown = knownItemIdsRef.current
    let queuedAny = false
    for (const item of items) {
      if (previouslyKnown.has(item.id)) continue
      const shouldQueue =
        !item.checked &&
        !item.deleted_at &&
        item.last_modified_source === 'casa'
      if (shouldQueue) {
        pendingNormalizationIdsRef.current.add(item.id)
        queuedAny = true
      }
    }

    knownItemIdsRef.current = currentIds

    if (queuedAny) {
      if (normalizationTimerRef.current) {
        window.clearTimeout(normalizationTimerRef.current)
      }
      normalizationTimerRef.current = window.setTimeout(() => {
        normalizationTimerRef.current = null
        void flushIdleNormalization()
      }, NORMALIZATION_DEBOUNCE_MS)
    }
  }, [items, flushIdleNormalization])

  const itemsByCategory = GROCERY_CATEGORIES.map(cat => ({
    ...cat,
    items: items.filter(i => i.category === cat.key),
  })).filter(cat => cat.items.length > 0)

  const uncheckedCount = items.filter(i => !i.checked).length
  const checkedCount = items.filter(i => i.checked).length

  return {
    lists,
    items,
    itemsByCategory,
    defaultListId,
    uncheckedCount,
    checkedCount,
    isLoading,
    addItem,
    toggleItem,
    deleteItem,
    updateItemCategory,
    clearChecked,
  }
}
