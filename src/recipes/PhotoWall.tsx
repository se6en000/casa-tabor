import { useMemo, useState } from 'react'
import { Plus, Search, Timer, X } from 'lucide-react'
import type { CookPlace, Recipe } from './data'
import { useRecipesSource } from './data'
import { useLayout, useT } from './layout'
import { chipFilter, madeLine, searchRecipes, sortRecipes, type RecipeChip } from './model'
import { Chip, Pill, RecipePhoto, Round, StarIcon } from './ui'
import { formatRecipeTitle } from '../pages/CookPage.helpers'

// The photo wall (canvas 49a/49e; Jake: "i kinda like the photo wall of recipes, but would like it updated to the V2
// style"): every recipe as its photo, favorites first, then the ones made most lately. Search finds a name or what's
// in it; the chips narrow it.

const CHIPS: Array<{ id: RecipeChip; label: string }> = [
  { id: 'favorites', label: 'Favorites' },
  { id: 'quick', label: 'Quick' },
  { id: 'lately', label: 'Not made lately' },
]

export default function PhotoWall({ recipes, cooking, onOpen, onCook, onAdd, onLeave, leaveWords }: {
  recipes: Recipe[] | null
  cooking: CookPlace[]
  onOpen: (id: string) => void
  onCook: (id: string) => void
  onAdd: () => void
  onLeave: (() => void) | null
  leaveWords: string
}) {
  const src = useRecipesSource()
  const layout = useLayout()
  const t = useT()
  const now = src.now()
  const [q, setQ] = useState('')
  const [chip, setChip] = useState<RecipeChip>('all')
  const all = useMemo(() => recipes ?? [], [recipes])
  const shown = useMemo(() => sortRecipes(chipFilter(searchRecipes(all, q), chip, now)), [all, q, chip, now])
  const favorites = all.filter((r) => r.favorite).length
  const busy = cooking
    .map((p) => ({ place: p, recipe: all.find((r) => r.id === p.recipe_id) }))
    .filter((c): c is { place: CookPlace; recipe: Recipe } => Boolean(c.recipe))
  const cols = layout === 'phone' ? 'grid-cols-2 gap-x-[16px] gap-y-[18px]' : layout === 'tablet' ? 'grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-x-[20px] gap-y-[24px]' : 'grid-cols-5 gap-x-[24px] gap-y-[30px]'
  const photo = layout === 'phone' ? 'aspect-square rounded-[16px]' : layout === 'tablet' ? 'aspect-[4/3] rounded-[18px]' : 'h-[250px] rounded-[20px]'

  return (
    <div className="flex flex-col gap-[16px]">
      <header className="flex items-center gap-[16px]">
        {onLeave && layout !== 'phone' && <Pill onClick={onLeave}>{leaveWords}</Pill>}
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          {layout === 'phone' && <span className={`font-bold tracking-[0.22em] text-wall-brass-ink ${t.label}`}>TABOR HOUSE</span>}
          <h1 className={`m-0 font-display font-semibold leading-none text-wall-ink ${t.title}`}>Recipes</h1>
        </div>
        {layout === 'phone'
          ? <Round label="Add a recipe" onClick={onAdd}><Plus size={20} strokeWidth={2} className="text-wall-brass-ink" /></Round>
          : <Pill tone="brass" onClick={onAdd}><Plus size={t.icon} strokeWidth={2} />Add a recipe</Pill>}
        {onLeave && layout === 'phone' && <Round label={leaveWords} onClick={onLeave}><X size={20} /></Round>}
      </header>

      <div className={`flex gap-[12px] ${layout === 'phone' ? 'flex-col' : 'items-center'}`}>
        <label className={`flex items-center gap-[10px] rounded-full border border-solid border-wall-stone bg-wall-on-pigment px-[16px] ${layout === 'wall' ? 'h-[64px] w-[620px]' : layout === 'tablet' ? 'h-[48px] w-[380px]' : 'h-[46px]'}`}>
          <Search size={t.icon - 2} aria-hidden="true" className="shrink-0 text-wall-ink-2" />
          <input aria-label="Search recipes" value={q} onChange={(e) => setQ(e.target.value)} placeholder="A recipe, or what’s in the fridge"
            className={`min-w-0 flex-1 border-0 bg-transparent font-body text-wall-ink outline-none placeholder:text-wall-ink-2 ${t.body}`} />
          {q && <button type="button" aria-label="Clear the search" onClick={() => setQ('')} className="flex h-[36px] w-[36px] items-center justify-center rounded-full border-0 bg-transparent p-0 text-wall-ink-2"><X size={18} /></button>}
        </label>
        <div className="-mx-[2px] flex gap-[8px] overflow-x-auto px-[2px] pb-[2px]" role="group" aria-label="Show">
          {CHIPS.map((c) => (
            <Chip key={c.id} on={chip === c.id} onClick={() => setChip(chip === c.id ? 'all' : c.id)}>
              {c.id === 'favorites' && <StarIcon on={chip === 'favorites'} size={14} />}{c.label}{c.id === 'favorites' && favorites > 0 ? ` · ${favorites}` : ''}
            </Chip>
          ))}
          <Chip on={chip === 'all'} onClick={() => setChip('all')}>All {all.length}</Chip>
        </div>
      </div>

      {busy.map(({ place, recipe }) => (
        <div key={place.recipe_id} className={`flex items-center gap-[12px] rounded-[18px] bg-wall-ink px-[16px] text-wall-on-pigment ${layout === 'wall' ? 'min-h-[72px]' : 'min-h-[60px]'}`}>
          <Timer size={t.icon} aria-hidden="true" className="shrink-0 text-wall-night-brass" />
          <span className={`min-w-0 flex-1 ${t.detail}`}>
            Cooking{place.device && place.device !== src.deviceName ? ` on ${place.device}` : ''}: <b>{formatRecipeTitle(recipe.name)}</b> · step {place.step + 1} of {recipe.steps.length}
          </span>
          <button type="button" onClick={() => onCook(recipe.id)} className={`shrink-0 rounded-full border-0 bg-wall-on-pigment px-[18px] font-body font-bold text-wall-ink ${layout === 'wall' ? 'h-[52px]' : 'h-[44px]'} ${t.detail}`}>
            {place.device && place.device !== src.deviceName ? 'Open here' : 'Keep cooking'}
          </button>
        </div>
      ))}

      {recipes == null ? (
        <p className={`m-0 text-wall-ink-2 ${t.body}`}>Loading the recipes…</p>
      ) : shown.length === 0 ? (
        <p className={`m-0 py-[24px] text-wall-ink-2 ${t.body}`}>
          {q ? `Nothing called “${q.trim()}”, or with it in. Try an ingredient.` : chip === 'favorites' ? 'Star a recipe and it’ll be here.' : chip === 'quick' ? 'No recipe says 30 minutes or less.' : chip === 'lately' ? 'You’ve made all of them lately.' : 'No recipes yet. Add one.'}
        </p>
      ) : (
        <ul className={`m-0 grid list-none p-0 ${cols}`} aria-label="Recipes">
          {shown.map((r) => (
            <li key={r.id} className="relative flex min-w-0 flex-col">
              <button type="button" onClick={() => onOpen(r.id)} aria-label={formatRecipeTitle(r.name)} className="flex flex-col gap-[6px] border-0 bg-transparent p-0 text-left text-wall-ink">
                <RecipePhoto src={r.image_url} name={r.name} className={`w-full ${photo}`} />
                <span className={`font-display font-bold leading-[1.1] ${layout === 'wall' ? 'text-wall-heading' : 'text-phone-heading'}`}>{formatRecipeTitle(r.name)}</span>
                <span className={`text-wall-ink-2 ${t.detail}`}>{madeLine(r, now)}</span>
              </button>
              <div className="absolute right-[4px] top-[4px]">
                <Round over label={`${r.favorite ? 'Unstar' : 'Star'} ${formatRecipeTitle(r.name)}`} pressed={r.favorite} onClick={() => void src.setFavorite(r.id, !r.favorite)}>
                  <StarIcon on={r.favorite} size={layout === 'wall' ? 26 : 18} />
                </Round>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
