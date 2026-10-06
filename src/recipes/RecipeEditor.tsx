import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ImageIcon, Plus, X } from 'lucide-react'
import { useRecipesSource, type RecipeDraft } from './data'
import { useLayout, useT } from './layout'
import { Label, Pill, RecipePhoto } from './ui'
import { useNote } from './note'
import PhotoPicker from './PhotoPicker'

// One editor for a new recipe, an import to check, and an edit (Jake: "some of the screens to import edit recipes
// are kinda complex, feel free to make them 100% better"). The old one had separate editors, AI quick actions, a
// crop tool and draft step renumbering; this is a page you read top to bottom: the photo, the name, how long and who
// it serves, the ingredients (one per line) and the steps (a box each, in order).

function AutoText({ value, onChange, label, placeholder, rows = 2, className }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; rows?: number; className: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return <textarea ref={ref} aria-label={label} value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`w-full resize-none overflow-hidden ${className}`} />
}

export default function RecipeEditor({ initial, mode, onCancel, onSaved, onDelete }: {
  initial: RecipeDraft
  mode: 'new' | 'check' | 'edit'
  onCancel: () => void
  onSaved: (id: string) => void
  onDelete?: () => void
}) {
  const src = useRecipesSource()
  const layout = useLayout()
  const t = useT()
  const [draft, setDraft] = useState(initial)
  const [ingredients, setIngredients] = useState(initial.ingredients.join('\n'))
  const [steps, setSteps] = useState(initial.steps.length ? initial.steps : [''])
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null)
  const [picking, setPicking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sure, setSure] = useState(false)
  const [note, show] = useNote()
  const set = (patch: Partial<RecipeDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const field = `w-full rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment px-[14px] font-body text-wall-ink outline-none focus:border-wall-ink`
  const title = mode === 'new' ? 'New recipe' : mode === 'check' ? 'Check the recipe' : 'Edit recipe'

  const save = async () => {
    if (!draft.name.trim()) { show('It needs a name.', true); return }
    setSaving(true)
    const r = await src.save({ ...draft, ingredients: ingredients.split('\n'), steps }, photo?.file ?? null)
    setSaving(false)
    if (r.ok && r.id) onSaved(r.id)
    else show(r.message ?? 'The recipe didn’t save.', true)
  }
  const moveStep = (i: number, by: -1 | 1) => setSteps((s) => { const next = [...s]; const j = i + by; if (j < 0 || j >= s.length) return s; [next[i], next[j]] = [next[j], next[i]]; return next })

  return (
    <section aria-label={title} className={`mx-auto flex w-full flex-col gap-[20px] text-wall-ink ${layout === 'wall' ? 'max-w-[1100px]' : layout === 'tablet' ? 'max-w-[760px]' : ''}`}>
      <header className="sticky top-0 z-10 flex items-center gap-[10px] bg-phone-ground py-[8px]">
        <Pill onClick={onCancel}>Cancel</Pill>
        <h1 className={`m-0 text-wall-ink min-w-0 flex-1 truncate text-center font-display font-semibold ${t.heading}`}>{title}</h1>
        <Pill tone="ink" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Pill>
      </header>
      {mode === 'check' && (
        <p className={`m-0 rounded-[14px] bg-phone-card px-[16px] py-[12px] text-wall-ink ${t.detail}`}>
          Read from your {draft.source_type === 'url' ? 'link' : draft.source_type === 'pdf' ? 'PDF' : 'photos'}. Check the name, the amounts and the steps, then save.
        </p>
      )}

      <div className="relative">
        <RecipePhoto src={photo?.preview ?? draft.image_url} name={draft.name || '?'} className={`w-full rounded-[20px] ${layout === 'phone' ? 'h-[200px]' : 'h-[300px]'}`} />
        <div className="absolute bottom-[12px] right-[12px]">
          <button type="button" onClick={() => setPicking(true)} className={`flex items-center gap-[8px] rounded-full border-0 bg-wall-on-pigment/95 px-[16px] font-body font-semibold text-wall-ink ${t.pill} ${t.detail}`}>
            <ImageIcon size={18} />{draft.image_url || photo ? 'Change photo' : 'Add a photo'}
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-[6px]">
        <span className={`font-semibold text-wall-ink-2 ${t.detail}`}>Name</span>
        <input aria-label="Name" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Garlic butter shrimp scampi"
          className={`${field} h-[56px] font-display font-semibold ${t.heading}`} />
      </label>
      <div className="flex gap-[12px]">
        <label className="flex flex-1 flex-col gap-[6px]">
          <span className={`font-semibold text-wall-ink-2 ${t.detail}`}>How long</span>
          <input aria-label="How long" value={draft.cook_time} onChange={(e) => set({ cook_time: e.target.value })} placeholder="30 min" className={`${field} h-[50px] ${t.body}`} />
        </label>
        <label className="flex flex-1 flex-col gap-[6px]">
          <span className={`font-semibold text-wall-ink-2 ${t.detail}`}>Serves</span>
          <input aria-label="Serves" value={draft.servings} onChange={(e) => set({ servings: e.target.value })} placeholder="4" className={`${field} h-[50px] ${t.body}`} />
        </label>
      </div>

      <section aria-label="Ingredients">
        <Label right={`${ingredients.split('\n').filter((l) => l.trim()).length}`}>Ingredients</Label>
        <AutoText label="Ingredients, one per line" value={ingredients} onChange={setIngredients} rows={6}
          placeholder={'10 oz shrimp\n2 cloves garlic\n6 oz spaghetti'} className={`${field} py-[12px] leading-[1.7] ${t.body}`} />
        <p className={`m-0 mt-[6px] text-wall-ink-2 ${t.label}`}>One per line. A card with two amounts can keep both: 10 oz | 20 oz Shrimp.</p>
      </section>

      <section aria-label="Steps">
        <Label right={`${steps.filter((s) => s.trim()).length}`}>Steps</Label>
        <ol className="m-0 flex list-none flex-col gap-[12px] p-0">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-[10px]">
              <span className={`w-[26px] shrink-0 pt-[12px] font-display font-bold text-wall-brass-ink lining-nums ${t.heading}`}>{i + 1}</span>
              <div className="min-w-0 flex-1">
                <AutoText label={`Step ${i + 1}`} value={s} onChange={(v) => setSteps((all) => all.map((x, j) => (j === i ? v : x)))} placeholder="What to do" className={`${field} py-[11px] ${t.body}`} />
                <div className="flex justify-end gap-[2px]">
                  <IconBtn label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => moveStep(i, -1)}><ArrowUp size={18} /></IconBtn>
                  <IconBtn label={`Move step ${i + 1} down`} disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)}><ArrowDown size={18} /></IconBtn>
                  <IconBtn label={`Remove step ${i + 1}`} disabled={steps.length === 1 && !s} onClick={() => setSteps((all) => (all.length === 1 ? [''] : all.filter((_, j) => j !== i)))}><X size={18} /></IconBtn>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setSteps((s) => [...s, ''])} className={`mt-[4px] flex min-h-[44px] items-center gap-[8px] border-0 bg-transparent p-0 font-body font-semibold text-wall-brass-ink ${t.body}`}><Plus size={18} />Add a step</button>
      </section>

      {note}
      <div className="flex items-center gap-[10px] border-0 border-t border-solid border-wall-stone pb-[24px] pt-[14px]">
        {onDelete && <Pill tone="rust" onClick={() => { if (sure) onDelete(); else setSure(true) }}>{sure ? 'Tap again to delete it' : 'Delete recipe'}</Pill>}
        <div className="flex-1" />
        <Pill onClick={onCancel}>Cancel</Pill>
        <Pill tone="ink" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Pill>
      </div>
      {picking && (
        <PhotoPicker name={draft.name} current={photo ? null : draft.image_url} choices={draft.image_urls}
          onPick={(p) => { if ('url' in p) { setPhoto(null); set({ image_url: p.url }) } else setPhoto(p) }} onClose={() => setPicking(false)} />
      )}
    </section>
  )
}

function IconBtn({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border-0 bg-transparent p-0 text-wall-ink-2 disabled:opacity-30">{children}</button>
}
