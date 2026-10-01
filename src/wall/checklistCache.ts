import type { QueryClient } from '@tanstack/react-query'
import type { WallChecklistItem } from './packing'

// A tick shows the moment it's pressed (Jake, 2026-10-01: "theres like a 1 second delay to update.. make all tick
// boxes snappy"). It used to wait for the write and then a fresh read, two trips to the database, before the box
// changed. Now every cached list holding the item flips at once; the write follows, and a failed write puts it back.

export const CHECKLIST_KEY = ['events', 'wall-checklist'] as const

/** Flip one item in every cached checklist; gives back an undo. */
export function tickInCache(queryClient: QueryClient, id: string, checked: boolean): () => void {
  const before = queryClient.getQueriesData<WallChecklistItem[]>({ queryKey: CHECKLIST_KEY })
  queryClient.setQueriesData<WallChecklistItem[]>({ queryKey: CHECKLIST_KEY }, (list) =>
    list?.map((item) => (item.id === id ? { ...item, checked } : item)))
  return () => {
    for (const [key, list] of before) queryClient.setQueryData(key, list)
  }
}
