import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useProfileSession } from '../contexts/useProfileSession'
import { readWallHomeFlag, RETURN_TO_WALL_MS } from '../wall/kioskHome'
import { draftOf, emptyDraft, RecipesContext, useRecipesSource, type RecipeDraft, type RecipesSource } from './data'
import { LayoutContext, useLayoutFor, type RecipesLayout } from './layout'
import { liveRecipesSource } from './liveSource'
import PhotoWall from './PhotoWall'
import RecipePage from './RecipePage'
import CookMode from './CookMode'
import RecipeEditor from './RecipeEditor'
import AddRecipe from './AddRecipe'
import { routeOf } from './routes'

// Recipes V2 (canvas row 49; Jake, Oct 6: "ok lets go for it"): /recipes is the photo wall, /recipes/<id> a recipe,
// /recipes/<id>/cook cooking it, /recipes/<id>/edit and /recipes/new/check the editor, /recipes/new adding one. The
// old page stays at /cook until this has earned its place.

/** A draft from an import (or "Type it in") waiting to be checked: kept across the move to /recipes/new/check. */
let pendingDraft: RecipeDraft | null = null

export function RecipesScreens() {
  const src = useRecipesSource()
  const layout = useLayoutFor(src.onWall)
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const route = routeOf(pathname)
  const recipes = src.useRecipes()
  const cooking = src.useCooking()
  const [flash, setFlash] = useState<string | null>(null)
  const recipe = 'id' in route ? recipes?.find((r) => r.id === route.id) ?? null : null
  const place = recipe ? cooking.find((p) => p.recipe_id === recipe.id) ?? null : null
  const leave = () => navigate(src.onWall ? '/wall' : layout === 'phone' ? '/phone' : '/')
  const go = (to: string) => { navigate(to); window.scrollTo({ top: 0 }) }

  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), 4000)
    return () => window.clearTimeout(timer)
  }, [flash])

  // The wall goes home after a few idle minutes — never while cooking.
  useEffect(() => {
    if (!src.onWall || route.screen === 'cook') return
    let timer = window.setTimeout(() => navigate('/wall'), RETURN_TO_WALL_MS)
    const touched = () => { window.clearTimeout(timer); timer = window.setTimeout(() => navigate('/wall'), RETURN_TO_WALL_MS) }
    window.addEventListener('pointerdown', touched)
    return () => { window.clearTimeout(timer); window.removeEventListener('pointerdown', touched) }
  }, [src.onWall, route.screen, navigate])

  const counts = useMemo(() => ({
    image: (recipes ?? []).filter((r) => r.source_type === 'image').length,
    pdf: (recipes ?? []).filter((r) => r.source_type === 'pdf').length,
    url: (recipes ?? []).filter((r) => r.source_type === 'url').length,
  }), [recipes])

  let body: React.ReactNode
  const missing = recipes != null && 'id' in route && !recipe
  if (missing) {
    body = <p className="m-0 font-body text-phone-body text-wall-ink-2">That recipe isn’t here any more. <button type="button" onClick={() => go('/recipes')} className="border-0 bg-transparent p-0 font-semibold text-wall-brass-ink underline">All recipes</button></p>
  } else if (route.screen === 'recipe' && recipe) {
    body = <RecipePage recipe={recipe} place={place} onBack={() => go('/recipes')} onCook={(s) => go(`/recipes/${recipe.id}/cook?serves=${s}`)} onEdit={() => go(`/recipes/${recipe.id}/edit`)} onDeleted={() => { setFlash('Deleted.'); go('/recipes') }} />
  } else if (route.screen === 'cook' && recipe) {
    const serves = Number(new URLSearchParams(search).get('serves') ?? 0) || 0
    body = <CookMode recipe={recipe} place={place} startServings={serves} onClose={() => go(`/recipes/${recipe.id}`)} onFinished={(n) => { setFlash(n === 1 ? 'Made it. The first time.' : `Made it. That’s ${n} times.`); go(`/recipes/${recipe.id}`) }} />
  } else if (route.screen === 'edit' && recipe) {
    body = <RecipeEditor key={recipe.id} initial={draftOf(recipe)} mode="edit" onCancel={() => go(`/recipes/${recipe.id}`)} onSaved={(id) => { setFlash('Saved.'); go(`/recipes/${id}`) }}
      onDelete={async () => { const r = await src.remove(recipe.id); if (r.ok) { setFlash('Deleted.'); go('/recipes') } }} />
  } else if (route.screen === 'check') {
    const draft = pendingDraft
    body = draft
      ? <RecipeEditor initial={draft} mode={draft.source_type === 'manual' ? 'new' : 'check'} onCancel={() => { pendingDraft = null; go('/recipes') }} onSaved={(id) => { pendingDraft = null; setFlash('Saved.'); go(`/recipes/${id}`) }} />
      : <p className="m-0 font-body text-phone-body text-wall-ink-2">Nothing to check. <button type="button" onClick={() => go('/recipes/new')} className="border-0 bg-transparent p-0 font-semibold text-wall-brass-ink underline">Add a recipe</button></p>
  } else if (recipes != null || route.screen === 'wall') {
    body = (
      <PhotoWall recipes={recipes} cooking={cooking} onOpen={(id) => go(`/recipes/${id}`)} onCook={(id) => go(`/recipes/${id}/cook`)} onAdd={() => go('/recipes/new')}
        onLeave={leave} leaveWords={src.onWall ? 'Back to the Wall' : layout === 'phone' ? 'Close' : 'Home'} />
    )
  }

  const frame: Record<RecipesLayout, string> = {
    phone: 'px-[18px] pb-[48px] pt-[max(20px,calc(env(safe-area-inset-top)+10px))]',
    tablet: 'mx-auto max-w-[1280px] px-[32px] pb-[60px] pt-[28px]',
    wall: 'px-[96px] pb-[56px] pt-[44px]',
  }
  return (
    <LayoutContext.Provider value={layout}>
      <main className="min-h-[100dvh] bg-phone-ground font-body text-wall-ink">
        <div className={route.screen === 'recipe' && recipe ? '' : frame[layout]}>{body}</div>
        {flash && <div role="status" className="fixed left-1/2 top-[max(16px,calc(env(safe-area-inset-top)+8px))] z-40 -translate-x-1/2 rounded-full bg-wall-ink px-[22px] py-[12px] font-body text-phone-body font-semibold text-wall-on-pigment">{flash}</div>}
      </main>
      {route.screen === 'wall' && route.adding && (
        <LayoutContext.Provider value={layout}>
          <AddRecipe counts={counts} onClose={() => go('/recipes')} onDraft={(d) => { pendingDraft = d; go('/recipes/new/check') }} onType={() => { pendingDraft = emptyDraft(); go('/recipes/new/check') }} />
        </LayoutContext.Provider>
      )}
    </LayoutContext.Provider>
  )
}

/** Where this device cooks from, as the others say it: "Jake’s phone", "the wall". */
function deviceName(onWall: boolean, name: string | null | undefined): string {
  if (onWall) return 'the wall'
  const narrow = typeof window !== 'undefined' && window.innerWidth < 700
  const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1
  const kind = narrow ? 'phone' : touch ? 'tablet' : 'computer'
  return name ? `${name}’s ${kind}` : `a ${kind}`
}

export default function RecipesRoot() {
  const qc = useQueryClient()
  const { profile } = useProfileSession()
  const source: RecipesSource = useMemo(() => liveRecipesSource(deviceName(readWallHomeFlag() === '1', profile?.memberName), qc), [qc, profile?.memberName])
  return <RecipesContext.Provider value={source}><RecipesScreens /></RecipesContext.Provider>
}
