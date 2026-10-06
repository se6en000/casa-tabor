import { useState } from 'react'
import { Camera, FileText, Link2, PenLine } from 'lucide-react'
import { useRecipesSource, type RecipeDraft } from './data'
import { useT } from './layout'
import { Pill, Sheet } from './ui'

// Adding a recipe (canvas 49d): take photos of a page, choose photos or a PDF, paste a link, or type it in. It reads
// the page and you check it before it's saved — and when it can't read it, it says so (the old phone view made up a
// "Grandma's Rustic Skillet Pasta" instead).

export default function AddRecipe({ counts, onDraft, onType, onClose }: {
  /** How many of yours came each way. */
  counts: { image: number; pdf: number; url: number }
  onDraft: (draft: RecipeDraft) => void
  onType: () => void
  onClose: () => void
}) {
  const src = useRecipesSource()
  const t = useT()
  const [link, setLink] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const read = async (input: Parameters<typeof src.importRecipe>[0]) => {
    setError(null)
    setReading(true)
    const r = await src.importRecipe(input)
    setReading(false)
    if (r.ok && r.draft) onDraft(r.draft)
    else setError(r.message ?? 'That couldn’t be read.')
  }
  const fromFiles = (list: FileList | null) => {
    const picked = Array.from(list ?? [])
    if (!picked.length) return
    const pdf = picked.find((f) => f.type === 'application/pdf')
    void read(pdf ? { kind: 'pdf', files: [pdf] } : { kind: 'photos', files: picked.filter((f) => f.type.startsWith('image/')) })
  }
  const so = (n: number, what: string) => (n ? ` · ${n} of yours came this way` : what)

  const rowClass = `flex min-h-[72px] w-full cursor-pointer items-center gap-[14px] border-0 border-t border-solid border-wall-stone bg-transparent px-[2px] text-left font-body text-wall-ink ${reading ? 'pointer-events-none opacity-40' : ''}`
  const inner = (icon: React.ReactNode, title: string, sub: string) => (
    <>
      <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[12px] bg-phone-card">{icon}</span>
      <span className="flex flex-col gap-[2px]"><span className={`font-semibold ${t.body}`}>{title}</span><span className={`text-wall-ink-2 ${t.detail}`}>{sub}</span></span>
    </>
  )

  return (
    <Sheet label="Add a recipe" onClose={reading ? () => {} : onClose}>
      <h2 className={`m-0 text-wall-ink font-display font-bold ${t.heading}`}>Add a recipe</h2>
      <p className={`m-0 mb-[12px] mt-[4px] text-wall-ink-2 ${t.detail}`}>It reads the page and fills in the ingredients and steps; you check it before it’s saved.</p>
      {reading ? (
        <div role="status" className="flex flex-col items-center gap-[14px] py-[36px]">
          <span aria-hidden="true" className="h-[40px] w-[40px] animate-spin rounded-full border-[3px] border-solid border-wall-stone border-t-wall-ink" />
          <span className={`text-wall-ink ${t.body}`}>Reading your recipe…</span>
          <span className={`text-wall-ink-2 ${t.detail}`}>Usually 10 to 30 seconds.</span>
        </div>
      ) : link !== null ? (
        <form className="flex flex-col gap-[12px]" onSubmit={(e) => { e.preventDefault(); if (link.trim()) void read({ kind: 'link', url: link.trim() }) }}>
          <input aria-label="The recipe’s link" type="url" inputMode="url" autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://"
            className={`h-[52px] w-full rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment px-[14px] font-body outline-none ${t.body}`} />
          <div className="flex gap-[10px]"><Pill onClick={() => setLink(null)}>Back</Pill><Pill tone="ink" wide type="submit" disabled={!/^https?:\/\/\S+\.\S+/.test(link.trim())}>Read it</Pill></div>
        </form>
      ) : (
        <>
          <label className={rowClass}>
            {inner(<Camera size={22} />, 'Take photos of a page', `A cookbook or a recipe card${so(counts.image, '')}`)}
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" aria-label="Take photos of a page" onChange={(e) => { fromFiles(e.target.files); e.target.value = '' }} />
          </label>
          <label className={rowClass}>
            {inner(<FileText size={22} />, 'Choose photos or a PDF', `From your photos or files${so(counts.pdf, '')}`)}
            <input type="file" accept="image/*,application/pdf" multiple className="hidden" aria-label="Choose photos or a PDF" onChange={(e) => { fromFiles(e.target.files); e.target.value = '' }} />
          </label>
          <button type="button" className={rowClass} onClick={() => setLink('')}>{inner(<Link2 size={22} />, 'Paste a link', `A recipe website${so(counts.url, '')}`)}</button>
          <button type="button" className={rowClass} onClick={onType}>{inner(<PenLine size={22} />, 'Type it in', 'Name, ingredients, steps')}</button>
        </>
      )}
      {error && <p role="alert" className={`m-0 mt-[12px] text-wall-rust ${t.detail}`}>{error} Try clearer photos, or type it in.</p>}
      {!reading && <div className="mt-[14px] flex justify-end"><Pill onClick={onClose}>Cancel</Pill></div>}
    </Sheet>
  )
}
