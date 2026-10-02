import type { QueryClient } from '@tanstack/react-query'
import type { TodoAction } from './todos'

/**
 * What to re-read after an answer. A project change re-reads every project page held, not only the one changed: a
 * project removed from inside another stayed on the parent's page (Jake, Oct 1: "when I tried to do it again the
 * project didn't actually delete from the ux").
 */
export async function refreshAfter(queryClient: QueryClient, request: TodoAction): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['todos'] })
  if (request.action === 'project_edit') await queryClient.invalidateQueries({ queryKey: ['todo-project'] })
}
