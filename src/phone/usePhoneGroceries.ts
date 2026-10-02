import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useGroceryList } from '../hooks/useGroceryList'
import { supabase } from '../lib/supabase'
import { usuals, type ShopItem } from './groceries'
import type { PhoneGroceriesData } from './PhoneGroceries'

/** What the family has added over the last few months, newest first: the usual items come from it. */
async function fetchGroceryHistory(): Promise<string[]> {
  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase.from('grocery_items').select('name').gte('created_at', since).order('created_at', { ascending: false }).limit(400)
  if (error) throw error
  return (data ?? []).map((r) => String(r.name ?? ''))
}

/** The phone's Groceries on the live list: the same list, realtime and Reminders sync as the grocery page. */
export function usePhoneGroceries(): PhoneGroceriesData {
  const list = useGroceryList()
  const { data: history = [] } = useQuery({ queryKey: ['grocery-history'], queryFn: fetchGroceryHistory, staleTime: 60 * 60_000 })
  const items: ShopItem[] = useMemo(() => list.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit, category: i.category, checked: i.checked })), [list.items])
  const usual = useMemo(() => usuals(history, items), [history, items])
  const { toggleItem, addItem, clearChecked, updateItemCategory, defaultListId } = list
  return {
    items,
    usual,
    loading: list.isLoading,
    tick: (id, checked) => toggleItem.mutateAsync({ id, checked }),
    add: async (item) => {
      if (!defaultListId) throw new Error('No grocery list yet.')
      await addItem.mutateAsync({ list_id: defaultListId, name: item.name, quantity: item.quantity, unit: item.unit, category: item.category, checked: false, notes: null })
    },
    clearDone: () => clearChecked.mutateAsync(),
    // As the grocery page's drag does: a correction by hand, so the categoriser files it there next time.
    move: async (id, category) => {
      const item = list.items.find((i) => i.id === id)
      await updateItemCategory.mutateAsync({ id, category, fromCategory: item?.category, itemName: item?.name, reviewedByUser: true })
    },
  }
}
