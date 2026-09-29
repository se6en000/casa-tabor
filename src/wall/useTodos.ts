import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { TodoAction, TodoList, TodoProjectDetail } from './todos'

/**
 * Jake's to-dos, organised (P3.22), from the `todos` function. They change slowly — a capture on his
 * watch, a tick — so a quarter-hourly refresh is plenty; an answer here updates the list at once and
 * the refresh confirms it. Reading the list also starts Casa sorting anything new.
 */
export function useTodos() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['todos'],
    queryFn: async (): Promise<TodoList> => {
      const { data, error } = await supabase.functions.invoke('todos', { body: { action: 'list' } })
      if (error) throw error
      return data as TodoList
    },
    staleTime: 5 * 60_000,
    refetchInterval: 15 * 60_000,
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
    const { error } = await supabase.functions.invoke('todos', { body: request })
    await queryClient.invalidateQueries({ queryKey: ['todos'] })
    if (request.action === 'project_edit') await queryClient.invalidateQueries({ queryKey: ['todo-project', request.id] })
    if (error) throw error
  }, [queryClient])
  return { data: query.data ?? null, act }
}

/** One project with all its steps (the project screen). */
export function useTodoProject(id: string | null) {
  return useQuery({
    queryKey: ['todo-project', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<TodoProjectDetail> => {
      const { data, error } = await supabase.functions.invoke('todos', { body: { action: 'project', id } })
      if (error) throw error
      return data as TodoProjectDetail
    },
  })
}
