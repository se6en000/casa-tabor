import { useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { LIVE_LIST } from '../lib/eventsCachePersister'
import type { TodoAction, TodoList, TodoProjectDetail } from './todos'
import { refreshAfter } from './todoRefresh'

/**
 * Jake's to-dos, organised (P3.22), from the `todos` function. They change slowly — a capture on his
 * watch, a tick — so a quarter-hourly refresh is plenty; an answer here updates the list at once and
 * the refresh confirms it. Reading the list also starts Casa sorting anything new.
 */
export function useTodos({ enabled = true, surface = 'wall' }: { enabled?: boolean; surface?: 'wall' | 'phone' } = {}) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['todos'],
    enabled,
    queryFn: async (): Promise<TodoList> => {
      const { data, error } = await supabase.functions.invoke('todos', { body: { action: 'list' } })
      if (error) throw error
      return data as TodoList
    },
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
    // On screen with a stale copy (a reload's restored one), or back to the tab: read again (Oct 8, the Mac's stuck To do).
    ...LIVE_LIST,
  })
  const act = useCallback(async (request: TodoAction) => {
    queryClient.setQueryData<TodoList>(['todos'], (old) => {
      if (!old) return old
      const gone = (items: TodoList['nextUp']) => items.filter((i) => i.id !== request.id)
      if (request.action === 'dismiss') return { ...old, suggestions: old.suggestions.filter((s) => s.id !== request.id) }
      // Edits show when the refresh lands (a moment later); only a delete leaves at once.
      if (request.action === 'update' || request.action === 'project_edit') return old
      return {
        ...old,
        nextUp: gone(old.nextUp),
        groups: request.action === 'snooze' ? old.groups : Object.fromEntries(Object.entries(old.groups).map(([k, v]) => [k, gone(v)])) as TodoList['groups'],
        suggestions: old.suggestions.filter((s) => s.id !== request.id),
      }
    })
    const { error } = await supabase.functions.invoke('todos', { body: { ...request, surface } })
    await refreshAfter(queryClient, request)
    if (error) throw error
  }, [queryClient, surface])
  return { data: query.data ?? null, act }
}

const fetchProject = async (id: string): Promise<TodoProjectDetail> => {
  const { data, error } = await supabase.functions.invoke('todos', { body: { action: 'project', id } })
  if (error) throw error
  return data as TodoProjectDetail
}

/** One project with all its steps (the project screen). */
export function useTodoProject(id: string | null) {
  return useQuery({
    queryKey: ['todo-project', id],
    enabled: Boolean(id),
    queryFn: () => fetchProject(id!),
  })
}

/**
 * The shelf's projects fetched ahead, so tapping one opens at once (Jake's phone, Oct 2: a project took ~2.5 s to
 * arrive and its page slid in empty). Already fresh ones aren't fetched again.
 */
export function useTodoProjectsAhead(ids: string[]) {
  const queryClient = useQueryClient()
  const key = ids.join('|')
  useEffect(() => {
    for (const id of key ? key.split('|') : []) {
      void queryClient.prefetchQuery({ queryKey: ['todo-project', id], queryFn: () => fetchProject(id), staleTime: 60_000 })
    }
  }, [key, queryClient])
}
