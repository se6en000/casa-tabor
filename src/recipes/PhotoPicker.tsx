import { useRef, useState } from 'react'
import { Camera, Check, Search } from 'lucide-react'
import { useRecipesSource } from './data'
import { useLayout, useT } from './layout'
import { Label, Pill, Sheet } from './ui'

/**
 * Change photo (the checklist: "one Change photo: take, upload or search, and pick the cover"): the photos it has, a
 * search of the web by the recipe's name, or one of your own (taken now or from your photos).
 */
export default function PhotoPicker({ name, current, choices, onPick, onClose }: {
  name: string
  current: string | null
  choices: string[]
  /** A web photo (url) or your own (file, uploaded when the recipe saves). */
  onPick: (pick: { url: string } | { file: File; preview: string }) => void
  onClose: () => void
}) {
  const src = useRecipesSource()
  const layout = useLayout()
  const t = useT()
  const [q, setQ] = useState(name)
  const [found, setFound] = useState<string[] | null>(null)
  const [looking, setLooking] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const photos = Array.from(new Set([...(current ? [current] : []), ...choices, ...(found ?? [])]))
  const search = async () => {
    if (!q.trim()) return
    setLooking(true)
    setFound(await src.searchPhotos(q.trim()))
    setLooking(false)
  }
  const thumb = layout === 'wall' ? 'h-[150px]' : 'h-[104px]'
  return (
    <Sheet label="Change photo" onClose={onClose}>
      <h2 className={`m-0 text-wall-ink font-display font-semibold ${t.heading}`}>Change photo</h2>
      <div className="mt-[14px] flex gap-[10px]">
        <Pill tone="brass" wide onClick={() => file.current?.click()}><Camera size={t.icon} />Take or choose a photo</Pill>
        <input ref={file} type="file" accept="image/*" className="hidden" aria-label="Your photo"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { onPick({ file: f, preview: URL.createObjectURL(f) }); onClose() } }} />
      </div>
      <form className="mt-[14px] flex gap-[10px]" onSubmit={(e) => { e.preventDefault(); void search() }}>
        <label className={`flex min-w-0 flex-1 items-center gap-[8px] rounded-full border border-solid border-wall-stone bg-wall-on-pigment px-[14px] ${t.pill}`}>
          <Search size={18} aria-hidden="true" className="shrink-0 text-wall-ink-2" />
          <input aria-label="Search the web for a photo" value={q} onChange={(e) => setQ(e.target.value)} className={`min-w-0 flex-1 border-0 bg-transparent font-body outline-none ${t.body}`} />
        </label>
        <Pill type="submit" disabled={looking || !q.trim()}>{looking ? 'Looking…' : 'Search'}</Pill>
      </form>
      {found && found.length === 0 && <p className={`m-0 mt-[10px] text-wall-ink-2 ${t.detail}`}>No photos for that. Try fewer words.</p>}
      {photos.length > 0 && (
        <div className="mt-[16px]">
          <Label>{found ? 'Pick one' : 'Its photos'}</Label>
          <div className={`grid gap-[8px] ${layout === 'phone' ? 'grid-cols-3' : 'grid-cols-4'}`}>
            {photos.map((url) => (
              <button key={url} type="button" aria-label={url === current ? 'The cover now' : 'Use this photo'} aria-pressed={url === current} onClick={() => { onPick({ url }); onClose() }}
                className={`relative overflow-hidden rounded-[12px] border-0 p-0 ${thumb} ${url === current ? 'ring-[3px] ring-wall-ink' : ''}`}>
                <img src={url} alt="" loading="lazy" className="block h-full w-full object-cover" />
                {url === current && <span className="absolute right-[6px] top-[6px] flex h-[26px] w-[26px] items-center justify-center rounded-full bg-wall-ink text-wall-on-pigment"><Check size={16} /></span>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-[16px] flex justify-end"><Pill onClick={onClose}>Done</Pill></div>
    </Sheet>
  )
}
