import { useEffect } from 'react'
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
  { key: 'other', label: '🛒 Other' },
]

function normalizeComparableName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

async function fetchGroceryData() {
  const [{ data: lists }, { data: items }] = await Promise.all([
    supabase.from('grocery_lists').select('id, name, created_at').order('created_at').limit(5),
    supabase.from('grocery_items').select('*').is('deleted_at', null).order('category').order('name'),
  ])
  return { lists: lists ?? [], items: items ?? [] }
}

export function useGroceryList() {
  const qc = useQueryClient()

  useEffect(() => {
    const handleExternalGroceryUpdate = () => {
      qc.invalidateQueries({ queryKey: ['grocery'] })
    }
    window.addEventListener('casa:grocery-updated', handleExternalGroceryUpdate)
    return () => window.removeEventListener('casa:grocery-updated', handleExternalGroceryUpdate)
  }, [qc])

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

      const { data: existing, error: existingError } = await supabase
        .from('grocery_items')
        .select('name')
        .eq('list_id', item.list_id)
        .eq('checked', false)
        .is('deleted_at', null)
      if (existingError) throw existingError

      const compareName = normalizeComparableName(normalizedName)
      const alreadyExists = (existing ?? []).some((row) => normalizeComparableName(String(row.name ?? '')) === compareName)
      if (alreadyExists) return

      const { error } = await supabase.from('grocery_items').insert({
        ...item,
        name: normalizedName,
        last_modified_source: 'casa',
      })
      if (error) throw error
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
    mutationFn: async ({ id, category }: { id: string; category: string }) => {
      const { error } = await supabase
        .from('grocery_items')
        .update({ category, last_modified_source: 'casa' })
        .eq('id', id)
      if (error) throw error
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
  const items = data?.items ?? []
  const defaultListId = lists[0]?.id ?? null

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
