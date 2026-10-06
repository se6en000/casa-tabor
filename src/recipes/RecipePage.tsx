import { useState, type ReactNode } from 'react'
import { Check, ChevronLeft, ExternalLink, ImageIcon, Pencil, Play, ShoppingBasket, Trash2 } from 'lucide-react'
import { draftOf, useRecipesSource, type CookPlace, type Recipe } from './data'
import { useLayout, useT } from './layout'
import { cookTime, likelyHave, linesFor, madeLine, servingChoices, splitAmount } from './model'
import { Pill, RecipePhoto, Sheet, StarIcon } from './ui'
import { useNote } from './note'
import PhotoPicker from './PhotoPicker'
import { formatRecipeTitle } from '../pages/CookPage.helpers'

// A recipe (canvas 50; Jake, Oct 6: "personally I thought this would look a lot cooler" → "50b and 50c on phone"):
// on a tablet, a laptop or the wall, the photo the full height of the left half and a cookbook page beside it — the
// name, the numbers, Start cooking, Ingredients | Method. On a phone, the photo and the name fill the top and Start
// cooking floats at the bottom while you scroll.

const SOURCE_WORDS: Record<string, string> = { url: 'from a website', pdf: 'from a PDF', image: 'from photos of a page', manual: 'typed in' }
const GLASS = 'border-0 bg-wall-on-pigment/90 backdrop-blur-[8px] text-wall-ink'

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
  const [tab, setTab] = useState<'ingredients' | 'method'>('ingredients')
  const [groceries, setGroceries] = useState(false)
  const [photo, setPhoto] = useState(false)
  const [sure, setSure] = useState(false)
  const [note, show] = useNote()
  const lines = linesFor(recipe, servings)
  const name = formatRecipeTitle(recipe.name)
  const made = madeLine({ ...recipe, cook_time: null }, now)
  const time = cookTime(recipe.cook_time)
  const wall = layout === 'wall'
  const cookWords = place ? `Keep cooking · step ${place.step + 1}` : 'Start cooking'

  const changePhoto = async (pick: { url: string } | { file: File; preview: string }) => {
    const draft = draftOf(recipe)
    const r = 'url' in pick ? await src.save({ ...draft, image_url: pick.url }) : await src.save(draft, pick.file)
    show(r.ok ? 'New photo.' : r.message ?? 'The photo didn’t change.', !r.ok)
  }
  const star = (
    <button type="button" aria-label={recipe.favorite ? `Unstar ${name}` : `Star ${name}`} aria-pressed={recipe.favorite} onClick={() => void src.setFavorite(recipe.id, !recipe.favorite)}
      className={`flex items-center justify-center rounded-full p-0 ${GLASS} ${wall ? 'h-[60px] w-[60px]' : 'h-[48px] w-[48px]'}`}>
      <StarIcon on={recipe.favorite} size={wall ? 26 : 21} />
    </button>
  )
  const back = (
    <button type="button" onClick={onBack} aria-label="Back to Recipes"
      className={`flex items-center gap-[6px] rounded-full font-body font-semibold ${GLASS} ${layout === 'phone' ? 'h-[44px] w-[44px] justify-center p-0' : `${wall ? 'h-[60px]' : 'h-[48px]'} pl-[14px] pr-[20px] ${t.body}`}`}>
      <ChevronLeft size={wall ? 24 : 19} />{layout !== 'phone' && 'Recipes'}
    </button>
  )

  const ingredientRows = (cols: string) => (
    <ul className={`m-0 grid list-none p-0 ${cols}`}>
      {lines.map((line, i) => {
        const [amount, rest] = splitAmount(line)
        return (
          <li key={i} className={`flex gap-[14px] border-0 border-t border-solid border-wall-stone py-[11px] ${t.body}`}>
            <span className={`shrink-0 font-bold text-wall-brass-ink ${wall ? 'w-[150px]' : 'w-[96px]'}`}>{amount}</span>{' '}
            <span className="min-w-0 text-wall-ink">{rest}</span>
          </li>
        )
      })}
      {lines.length === 0 && <li className={`py-[11px] text-wall-ink-2 ${t.body}`}>None written down. Edit to add them.</li>}
    </ul>
  )
  const method = (
    <ol className="m-0 flex list-none flex-col p-0">
      {recipe.steps.map((s, i) => (
        <li key={i} className="flex gap-[20px] border-0 border-t border-solid border-wall-stone py-[16px]">
          <span className={`shrink-0 font-display font-semibold leading-[0.85] text-wall-brass lining-nums ${wall ? 'w-[56px] text-wall-countdown-long' : 'w-[38px] text-wall-quote'}`}>{i + 1}</span>
          <span className={`text-wall-ink ${t.body}`}>{s}</span>
        </li>
      ))}
    </ol>
  )
  const more = (
    <div className="flex flex-wrap items-center gap-x-[22px] gap-y-[6px] border-0 border-t border-solid border-wall-stone pt-[12px]">
      <MoreButton onClick={onEdit}><Pencil size={16} />Edit</MoreButton>
      <MoreButton onClick={() => setPhoto(true)}><ImageIcon size={16} />Change photo</MoreButton>
      {recipe.source_url && <a href={recipe.source_url} target="_blank" rel="noreferrer" className={`flex min-h-[44px] items-center gap-[6px] font-semibold text-wall-ink-2 no-underline ${t.detail}`}><ExternalLink size={16} />The original page</a>}
      <MoreButton tone="rust" onClick={async () => { if (!sure) { setSure(true); return } const r = await src.remove(recipe.id); if (r.ok) onDeleted(); else show(r.message ?? 'It wasn’t deleted.', true) }}>
        <Trash2 size={16} />{sure ? 'Tap again to delete it' : 'Delete'}
      </MoreButton>
    </div>
  )
  const servesSwitch = (
    <div role="group" aria-label="Serves" className="flex rounded-full border border-solid border-wall-stone bg-phone-card p-[3px]">
      {choices.map((c, i) => (
        <button key={c.label} type="button" aria-pressed={servings === i} onClick={() => setServings(i)}
          className={`rounded-full border-0 px-[14px] font-body font-semibold ${wall ? 'h-[48px] min-w-[80px]' : 'h-[36px] min-w-[52px]'} ${t.detail} ${servings === i ? 'bg-wall-ink text-wall-on-pigment' : 'bg-transparent text-wall-ink-2'}`}>
          {c.label}
        </button>
      ))}
    </div>
  )
  const sheets = (
    <>
      {groceries && <GroceriesSheet name={name} lines={lines} onClose={() => setGroceries(false)} onDone={(n) => show(`${n} on the grocery list.`)} />}
      {photo && <PhotoPicker name={name} current={recipe.image_url} choices={recipe.images} onPick={(p) => void changePhoto(p)} onClose={() => setPhoto(false)} />}
    </>
  )

  if (layout === 'phone') {
    // 50c: the photo and the name fill the top; Start cooking floats at the bottom.
    return (
      <article aria-label={name} className="text-wall-ink">
        <div className="relative h-[440px] overflow-hidden">
          <RecipePhoto src={recipe.image_url} name={recipe.name} className="h-full w-full" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-wall-ink/30 via-transparent via-35% to-wall-ink/90" />
          <div className="absolute left-[14px] right-[14px] top-[max(14px,calc(env(safe-area-inset-top)+6px))] flex justify-between">{back}{star}</div>
          <div className="absolute bottom-[22px] left-[20px] right-[20px] text-wall-on-pigment">
            <div className="text-phone-label font-bold uppercase tracking-[0.22em] text-wall-night-brass">{made}</div>
            <h1 className="m-0 mt-[6px] font-display text-phone-magnified font-semibold leading-[0.98] text-wall-on-pigment">{name}</h1>
            <p className="m-0 mt-[10px] text-phone-detail text-wall-on-pigment/90">
              {[time, `${lines.length} ingredient${lines.length === 1 ? '' : 's'}`, `${recipe.steps.length} step${recipe.steps.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-[22px] px-[20px] pb-[120px] pt-[18px]">
          <section aria-label="Ingredients">
            <div className="mb-[6px] flex items-center justify-between gap-[10px]">
              <h2 className="m-0 font-body text-phone-label font-bold uppercase tracking-[0.22em] text-wall-ink-2">Ingredients</h2>
              {choices.length > 1 && <div className="flex items-center gap-[8px]"><span className="text-phone-detail text-wall-ink-2">Serves</span>{servesSwitch}</div>}
            </div>
            {ingredientRows('grid-cols-1')}
          </section>
          <section aria-label="Method">
            <h2 className="m-0 mb-[2px] font-body text-phone-label font-bold uppercase tracking-[0.22em] text-wall-ink-2">The method</h2>
            {method}
          </section>
          {note}
          {more}
        </div>
        <div className="fixed bottom-[max(18px,calc(env(safe-area-inset-bottom)+8px))] left-[12px] right-[12px] z-30 flex gap-[8px] rounded-full bg-wall-ink p-[7px] shadow-[0_14px_30px_rgba(38,34,29,0.35)]">
          <button type="button" onClick={() => onCook(servings)} className="flex h-[52px] flex-1 items-center justify-center gap-[8px] rounded-full border-0 bg-wall-on-pigment font-body text-phone-body font-bold text-wall-ink">
            <Play size={16} strokeWidth={2.4} />{cookWords}
          </button>
          <button type="button" aria-label="Groceries" onClick={() => setGroceries(true)} className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-0 bg-transparent p-0 text-wall-on-pigment">
            <ShoppingBasket size={21} />
          </button>
        </div>
        {sheets}
      </article>
    )
  }

  // 50b: the plate — the photo the full height of the left half, a cookbook page on the right.
  const stats: Array<{ big: ReactNode; label: string }> = [
    ...(time ? [{ big: time.replace(/ min$/, ''), label: /min$/.test(time) ? 'MINUTES' : 'TIME' }] : []),
    { big: recipe.steps.length, label: recipe.steps.length === 1 ? 'STEP' : 'STEPS' },
    { big: lines.length, label: lines.length === 1 ? 'INGREDIENT' : 'INGREDIENTS' },
  ]
  const cols = ['grid-cols-3', 'grid-cols-4'][stats.length - 2] ?? 'grid-cols-4'
  return (
    <article aria-label={name} className="flex min-h-[100dvh] text-wall-ink">
      <div className="sticky top-0 h-[100dvh] w-1/2 shrink-0 overflow-hidden">
        <RecipePhoto src={recipe.image_url} name={recipe.name} className="h-full w-full" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-wall-ink/25 via-transparent via-25% to-wall-ink/60" />
        <div className={`absolute flex justify-between ${wall ? 'left-[44px] right-[36px] top-[40px]' : 'left-[32px] right-[28px] top-[28px]'}`}>{back}{star}</div>
        <div className={`absolute flex flex-wrap items-center gap-x-[6px] text-wall-on-pigment ${wall ? 'bottom-[36px] left-[44px]' : 'bottom-[26px] left-[32px]'} ${t.detail}`}>
          <span>{made.charAt(0).toUpperCase() + made.slice(1)} · {SOURCE_WORDS[recipe.source_type] ?? 'saved'} ·</span>
          <button type="button" onClick={() => setPhoto(true)} className={`min-h-[44px] border-0 bg-transparent p-0 font-body font-semibold text-wall-on-pigment underline ${t.detail}`}>Change photo</button>
        </div>
      </div>
      <div className={`flex min-w-0 flex-1 flex-col ${wall ? 'gap-[30px] px-[80px] pb-[64px] pt-[64px]' : 'gap-[24px] px-[56px] pb-[60px] pt-[52px]'}`}>
        <div>
          <div className={`font-bold tracking-[0.26em] text-wall-brass-ink ${t.label}`}>TABOR HOUSE · RECIPES</div>
          <h1 className="m-0 mt-[10px] font-display text-wall-title font-semibold leading-[0.98] text-wall-ink">{name}</h1>
        </div>
        <div className={`grid border-0 border-b border-t border-solid border-b-wall-rule border-t-wall-ink ${cols}`}>
          {stats.map((s, i) => (
            <div key={s.label} className={`py-[14px] ${i ? 'border-0 border-l border-solid border-wall-rule pl-[20px]' : ''}`}>
              <div className="font-display text-wall-quote font-semibold leading-none lining-nums">{s.big}</div>
              <div className={`mt-[4px] tracking-[0.12em] text-wall-ink-2 ${t.label}`}>{s.label}</div>
            </div>
          ))}
          <div className="border-0 border-l border-solid border-wall-rule py-[14px] pl-[20px]">
            <div className="flex items-baseline gap-[10px]">
              <span className="font-display text-wall-quote font-semibold leading-none lining-nums">{/\d/.test(choices[servings]?.label ?? '') ? choices[servings].label : '—'}</span>
              {choices.map((c, i) => i !== servings && (
                <button key={c.label} type="button" aria-label={`Serves ${c.label}`} onClick={() => setServings(i)} className={`flex min-h-[44px] items-center border-0 bg-transparent p-0 font-body font-bold text-wall-brass-ink ${t.detail}`}>{c.label} ›</button>
              ))}
            </div>
            <div className={`mt-[4px] tracking-[0.12em] text-wall-ink-2 ${t.label}`}>SERVES</div>
          </div>
        </div>
        <div className="flex gap-[10px]">
          <Pill tone="ink" wide onClick={() => onCook(servings)}><Play size={t.icon - 4} strokeWidth={2.4} />{cookWords}</Pill>
          <Pill onClick={() => setGroceries(true)}><ShoppingBasket size={t.icon - 2} />Groceries</Pill>
        </div>
        {note}
        <div role="tablist" aria-label="Ingredients or method" className="flex gap-[28px] border-0 border-b border-solid border-wall-stone">
          {(['ingredients', 'method'] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`-mb-px border-0 border-b-[3px] border-solid bg-transparent px-0 pb-[10px] pt-0 font-display font-semibold ${wall ? 'text-wall-date' : 'text-phone-heading'} ${tab === id ? 'border-wall-ink font-bold text-wall-ink' : 'border-transparent text-wall-ink-2'}`}>
              {id === 'ingredients' ? 'Ingredients' : 'Method'}
            </button>
          ))}
        </div>
        <section aria-label={tab === 'ingredients' ? 'Ingredients' : 'Method'} className="-mt-[12px]">
          {tab === 'ingredients' ? ingredientRows('grid-cols-2 gap-x-[32px] [&>li:nth-child(-n+2)]:border-t-0') : <div className="[&_ol>li:first-child]:border-t-0">{method}</div>}
        </section>
        {more}
      </div>
      {sheets}
    </article>
  )
}

function MoreButton({ children, onClick, tone }: { children: ReactNode; onClick: () => void; tone?: 'rust' }) {
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
              <span className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full ${picked.has(i) ? 'bg-wall-ink text-wall-on-pigment' : 'border-2 border-solid border-wall-ink-2 bg-wall-paper'}`}>{picked.has(i) && <Check size={18} strokeWidth={2.6} />}</span>
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
