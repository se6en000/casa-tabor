// Picking one of a few things on the wall — "Move to…" another project, a project to put inside,
// "Part of" (P3.23). A plain list of big buttons over the page, and Cancel.

export interface WallChooserProps {
  title: string
  options: Array<{ key: string; label: string; detail?: string }>
  onPick: (key: string) => void
  onCancel: () => void
}

export default function WallChooser({ title, options, onPick, onCancel }: WallChooserProps) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-wall-ink/30" onClick={(e) => { e.stopPropagation(); onCancel() }}>
      <section aria-label={title} className="flex max-h-[860px] w-[760px] flex-col gap-[10px] overflow-hidden rounded-[24px] bg-wall-ground p-[32px] text-wall-ink" onClick={(e) => e.stopPropagation()}>
        <span className="pb-[6px] font-display text-wall-date font-semibold">{title}</span>
        <div className="flex min-h-0 flex-col gap-[8px] overflow-y-auto">
          {options.map((o) => (
            <button key={o.key} type="button" onClick={() => onPick(o.key)} className="flex min-h-[60px] shrink-0 flex-col justify-center rounded-[16px] border border-solid border-wall-rule bg-transparent px-[20px] py-[8px] text-left text-wall-ink">
              <span className="text-wall-body font-semibold">{o.label}</span>
              {o.detail && <span className="text-wall-label text-wall-ink-2">{o.detail}</span>}
            </button>
          ))}
          {options.length === 0 && <span className="text-wall-detail text-wall-ink-2">Nothing to pick yet.</span>}
        </div>
        <button type="button" onClick={onCancel} className="mt-[6px] h-[52px] self-start rounded-full border border-solid border-wall-ink-2 bg-transparent px-[24px] text-wall-detail font-semibold text-wall-ink">Cancel</button>
      </section>
    </div>
  )
}
