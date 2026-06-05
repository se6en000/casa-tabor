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
}

export interface GroceryList {
  id: string
  name: string
  created_at: string
}

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

async function fetchGroceryData() {
  const [{ data: lists }, { data: items }] = await Promise.all([
    supabase.from('grocery_lists').select('id, name, created_at').order('created_at').limit(5),
    supabase.from('grocery_items').select('*').order('category').order('name'),
  ])
  return { lists: lists ?? [], items: items ?? [] }
}

export function useGroceryList() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['grocery'],
    queryFn: fetchGroceryData,
    staleTime: 30_000,
  })

  const addItem = useMutation({
    mutationFn: async (item: Omit<GroceryItem, 'id' | 'created_at'>) => {
      const { error } = await supabase.from('grocery_items').insert(item)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grocery'] }),
  })

  const toggleItem = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      const { error } = await supabase.from('grocery_items').update({ checked }).eq('id', id)
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
      const { error } = await supabase.from('grocery_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grocery'] }),
  })

  const clearChecked = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('grocery_items').delete().eq('checked', true)
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
    clearChecked,
  }
}
