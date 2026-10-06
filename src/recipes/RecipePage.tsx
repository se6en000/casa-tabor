import { useState } from 'react'
import { Check, ChevronLeft, ExternalLink, ImageIcon, Pencil, ShoppingBasket, Trash2 } from 'lucide-react'
import { draftOf, useRecipesSource, type CookPlace, type Recipe } from './data'
import { useLayout, useT } from './layout'
import { cookTime, likelyHave, linesFor, madeLine, servingChoices } from './model'
import { Label, Pill, RecipePhoto, Round, Sheet, StarIcon } from './ui'
import { useNote } from './note'
import PhotoPicker from './PhotoPicker'
import { formatRecipeTitle } from '../pages/CookPage.helpers'

// A recipe (canvas 49b): its photo, who it serves, Start cooking, add to Groceries, the ingredients and the steps.

const SOURCE_WORDS: Record<string, string> = { url: 'from a website', pdf: 'from a PDF', image: 'from photos of a page', manual: 'typed in' }

export default function RecipePage({ recipe, place, onBack, onCook, onEdit, onDeleted }: {
  recipe: Recipe
  place: CookPlace | null
  onBack: () => void
  onCook: (servingsIndex: number) => void
  onEdit: () => void
  onDeleted: () => void
}) {
  const src = useRecipesSource()
  const layout = useLayout()
  const t = useT()
  const now = src.now()
  const choices = servingChoices(recipe.servings)
  const [servings, setServings] = useState(Math.min(place?.servings_index ?? 0, choices.length - 1))
  const [groceries, setGroceries] = useState(false)
  const [photo, setPhoto] = useState(false)
  const [sure, setSure] = useState(false)
  const [note, show] = useNote()
  const lines = linesFor(recipe, servings)
  const name = formatRecipeTitle(recipe.name)
  const meta = [cookTime(recipe.cook_time), `${recipe.steps.length} step${recipe.steps.length === 1 ? '' : 's'}`, SOURCE_WORDS[recipe.source_type]].filter(Boolean).join(' · ')
  const wide = layout !== 'phone'

  const changePhoto = async (pick: { url: string } | { file: File; preview: string }) => {
    const draft = draftOf(recipe)
    const r = 'url' in pick ? await src.save({ ...draft, image_url: pick.url }) : await src.save(draft, pick.file)
    show(r.ok ? 'New photo.' : r.message ?? 'The photo didn’t change.', !r.ok)
  }

  const head = (
    <div className="flex flex-col gap-[6px]">
      <h1 className={`m-0 font-display font-bold leading-[1.02] text-wall-ink ${layout === 'wall' ? 'text-wall-title' : 'text-phone-move'}`}>{name}</h1>
      <p className={`m-0 text-wall-ink-2 ${t.detail}`}>{meta}</p>
      <p className={`m-0 text-wall-ink-2 ${t.detail}`}>{madeLine({ ...recipe, cook_time: null }, now)}</p>
    </div>
  )
  const actions = (
    <div className="flex flex-col gap-[14px]">
      <div className="flex items-center justify-between gap-[12px]">
        <span className={`font-semibold text-wall-ink-2 ${t.detail}`}>Serves</span>
        <div role="group" aria-label="Serves" className="flex rounded-full border border-solid border-wall-stone bg-phone-card p-[3px]">
          {choices.map((c, i) => (
            <button key={c.label} type="button" aria-pressed={servings === i} onClick={() => setServings(i)}
              className={`rounded-full border-0 px-[18px] font-body font-semibold ${layout === 'wall' ? 'h-[52px] min-w-[96px]' : 'h-[38px] min-w-[64px]'} ${t.detail} ${servings === i ? 'bg-wall-ink text-wall-on-pigment' : 'bg-transparent text-wall-ink-2'}`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-[10px]">
        <Pill tone="ink" wide onClick={() => onCook(servings)}>{place ? `Keep cooking · step ${place.step + 1}` : 'Start cooking'}</Pill>
        <Pill onClick={() => setGroceries(true)}><ShoppingBasket size={t.icon - 2} />Groceries</Pill>
      </div>
      {note}
    </div>
  )
  const ingredients = (
    <section aria-label="Ingredients">
      <Label right={choices[servings]?.label && /\d/.test(choices[servings].label) ? `for ${choices[servings].label}` : undefined}>Ingredients · {lines.length}</Label>
      <ul className="m-0 list-none p-0">
        {lines.map((line, i) => <li key={i} className={`border-0 border-t border-solid border-wall-stone py-[11px] ${t.body}`}>{line}</li>)}
        {lines.length === 0 && <li className={`py-[11px] text-wall-ink-2 ${t.body}`}>None written down. Edit to add them.</li>}
      </ul>
    </section>
  )
  const steps = (
    <section aria-label="Steps">
      <Label>Steps · {recipe.steps.length}</Label>
      <ol className="m-0 flex list-none flex-col gap-[14px] p-0">
        {recipe.steps.map((s, i) => (
          <li key={i} className="flex gap-[14px]">
            <span className={`w-[28px] shrink-0 font-display font-bold text-wall-brass-ink lining-nums ${t.heading}`}>{i + 1}</span>
            <span className={`text-wall-ink ${t.body}`}>{s}</span>
          </li>
        ))}
      </ol>
    </section>
  )
  const more = (
    <div className="flex flex-wrap items-center gap-x-[20px] gap-y-[6px] border-0 border-t border-solid border-wall-stone pt-[12px]">
      <MoreButton onClick={onEdit}><Pencil size={16} />Edit</MoreButton>
      <MoreButton onClick={() => setPhoto(true)}><ImageIcon size={16} />Change photo</MoreButton>
      {recipe.source_url && <a href={recipe.source_url} target="_blank" rel="noreferrer" className={`flex min-h-[44px] items-center gap-[6px] font-semibold text-wall-ink-2 no-underline ${t.detail}`}><ExternalLink size={16} />The original page</a>}
      <MoreButton tone="rust" onClick={async () => { if (!sure) { setSure(true); return } const r = await src.remove(recipe.id); if (r.ok) onDeleted(); else show(r.message ?? 'It wasn’t deleted.', true) }}>
        <Trash2 size={16} />{sure ? 'Tap again to delete it' : 'Delete'}
      </MoreButton>
    </div>
  )
  const star = (
    <Round over label={recipe.favorite ? `Unstar ${name}` : `Star ${name}`} pressed={recipe.favorite} onClick={() => void src.setFavorite(recipe.id, !recipe.favorite)}>
      <StarIcon on={recipe.favorite} size={layout === 'wall' ? 26 : 20} />
    </Round>
  )

  return (
    <article aria-label={name} className="text-wall-ink">
      {wide ? (
        <div className="flex gap-[48px]">
          <div className={`flex shrink-0 flex-col gap-[20px] ${layout === 'wall' ? 'w-[640px]' : 'w-[42%]'}`}>
            <div className="flex items-center justify-between"><Pill onClick={onBack}><ChevronLeft size={t.icon} />Recipes</Pill>{star}</div>
            <RecipePhoto src={recipe.image_url} name={recipe.name} className={`w-full rounded-[22px] ${layout === 'wall' ? 'h-[420px]' : 'aspect-[4/3]'}`} />
            {head}
            {actions}
            {ingredients}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[24px] pt-[76px]">{steps}{more}</div>
        </div>
      ) : (
        <>
          <div className="relative -mx-[18px] -mt-[max(20px,calc(env(safe-area-inset-top)+10px))]">
            <RecipePhoto src={recipe.image_url} name={recipe.name} className="h-[300px] w-full" />
            <div className="absolute left-[12px] right-[12px] top-[max(14px,calc(env(safe-area-inset-top)+6px))] flex justify-between">
              <Round over label="Back to Recipes" onClick={onBack}><ChevronLeft size={20} /></Round>
              {star}
            </div>
          </div>
          <div className="relative -mx-[18px] -mt-[24px] flex flex-col gap-[18px] rounded-t-[24px] bg-phone-ground px-[18px] pt-[22px]">
            {head}{actions}{ingredients}{steps}{more}
          </div>
        </>
      )}
      {groceries && <GroceriesSheet name={name} lines={lines} onClose={() => setGroceries(false)} onDone={(n) => show(`${n} on the grocery list.`)} />}
      {photo && <PhotoPicker name={name} current={recipe.image_url} choices={recipe.images} onPick={(p) => void changePhoto(p)} onClose={() => setPhoto(false)} />}
    </article>
  )
}

function MoreButton({ children, onClick, tone }: { children: React.ReactNode; onClick: () => void; tone?: 'rust' }) {
  const t = useT()
  return <button type="button" onClick={onClick} className={`flex min-h-[44px] items-center gap-[6px] border-0 bg-transparent p-0 font-body font-semibold ${t.detail} ${tone === 'rust' ? 'text-wall-rust' : 'text-wall-ink-2'}`}>{children}</button>
}

/** Add to Groceries (the checklist: "pick which"): everything ticked but what's probably in the pantry. */
function GroceriesSheet({ name, lines, onClose, onDone }: { name: string; lines: string[]; onClose: () => void; onDone: (n: number) => void }) {
  const src = useRecipesSource()
  const t = useT()
  const [picked, setPicked] = useState<Set<number>>(() => new Set(lines.flatMap((l, i) => (likelyHave(l) ? [] : [i]))))
  const [busy, setBusy] = useState(false)
  const [note, show] = useNote()
  const n = picked.size
  return (
    <Sheet label="Add to Groceries" onClose={onClose}>
      <h2 className={`m-0 text-wall-ink font-display font-semibold ${t.heading}`}>Add to Groceries</h2>
      <p className={`m-0 mt-[4px] text-wall-ink-2 ${t.detail}`}>For {name}. Untick what you have.</p>
      <ul className="m-0 mt-[12px] list-none p-0">
        {lines.map((line, i) => (
          <li key={i}>
            <button type="button" aria-pressed={picked.has(i)} onClick={() => setPicked((s) => { const next = new Set(s); if (next.has(i)) next.delete(i); else next.add(i); return next })}
              className={`flex min-h-[50px] w-full items-center gap-[14px] border-0 border-t border-solid border-wall-stone bg-transparent p-0 text-left font-body ${t.body} ${picked.has(i) ? 'text-wall-ink' : 'text-wall-ink-2 line-through'}`}>
              <span className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full ${picked.has(i) ? 'bg-wall-ink text-wall-on-pigment' : 'border-2 border-solid border-wall-ink-2'}`}>{picked.has(i) && <Check size={18} strokeWidth={2.6} />}</span>
              {line}
            </button>
          </li>
        ))}
      </ul>
      {note}
      <div className="mt-[16px] flex gap-[10px]">
        <Pill onClick={onClose}>Cancel</Pill>
        <Pill tone="ink" wide disabled={!n || busy} onClick={async () => {
          setBusy(true)
          const r = await src.addToGroceries(lines.filter((_, i) => picked.has(i)))
          setBusy(false)
          if (r.ok) { onDone(n); onClose() } else show(r.message ?? 'They didn’t go on the list.', true)
        }}>{busy ? 'Adding…' : `Add ${n} to Groceries`}</Pill>
      </div>
    </Sheet>
  )
}
