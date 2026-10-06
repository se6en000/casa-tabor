// Recipes V2's addresses (see RecipesRoot).
export type RecipesRoute =
  | { screen: 'wall'; adding: boolean }
  | { screen: 'check' }
  | { screen: 'recipe'; id: string }
  | { screen: 'cook'; id: string }
  | { screen: 'edit'; id: string }

export function routeOf(pathname: string): RecipesRoute {
  const parts = pathname.replace(/^\/recipes\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'new') return parts[1] === 'check' ? { screen: 'check' } : { screen: 'wall', adding: true }
  if (!parts[0]) return { screen: 'wall', adding: false }
  if (parts[1] === 'cook') return { screen: 'cook', id: parts[0] }
  if (parts[1] === 'edit') return { screen: 'edit', id: parts[0] }
  return { screen: 'recipe', id: parts[0] }
}
