import { useState } from 'react'
import { Check, ChevronLeft, Copy } from 'lucide-react'
import { SHARE_URL, useShareKey } from './useShareKey'

// Settings › Send to Tabor House (Jake, Oct 9: "how do I setup the shareing shortcut?"): this person's key, and the
// iPhone Shortcut, once — then Share from any app, or a double tap on the back of the phone sends the screen. A place
// goes to Places worth trying, a recipe to Recipes, dates wait for a yes; the Shortcut shows what happened.

const label = 'text-phone-label font-bold tracking-[0.16em] text-wall-brass-ink'
const card = 'flex flex-col gap-[10px] rounded-[20px] bg-phone-card p-[16px]'
const pill = 'flex h-[44px] items-center justify-center gap-[8px] rounded-full px-[18px] text-phone-body font-semibold'

function CopyButton({ text, name, label = 'Copy' }: { text: string; name: string; label?: string }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000) } catch { /* the words are on screen to select */ }
  }
  return (
    <button type="button" aria-label={`Copy ${name}`} onClick={() => void copy()} className={`${pill} border border-solid border-wall-ink-2 bg-transparent text-wall-ink`}>
      {done ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {done ? 'Copied' : label}
    </button>
  )
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function PhoneShareSetup({ onClose, useKey = useShareKey }: { onClose: () => void; useKey?: typeof useShareKey }) {
  const { status, make } = useKey()
  const [key, setKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const makeKey = async () => {
    setBusy(true)
    setError(null)
    try { setKey(await make()) } catch (e) { setError(e instanceof Error ? e.message : 'That didn’t work. Try again.') }
    setBusy(false)
  }
  const steps: Array<[string, string]> = [
    ['Open Shortcuts, tap +', 'Name it Send to Tabor House. Tap the (i) button and turn on Show in Share Sheet.'],
    ['Receive', 'Tap Receive … from Share Sheet: choose Any. Where it says If there’s no input, choose Continue.'],
    ['If', 'Add If: Shortcut Input does not have any value. Inside it, add Take Screenshot, then Set Variable: Thing, to Screenshot. Under Otherwise, add Set Variable: Thing, to Shortcut Input.'],
    ['Get Contents of URL', 'After End If, add Get Contents of URL with the address below. Method: POST. Add a header: key x-share-key, value your key. Request Body: Form — add a Text field named text with Thing, and a File field named file with Thing.'],
    ['Show Notification', 'Add Show Notification with Contents of URL. Done.'],
  ]
  return (
    <section aria-label="Send to Tabor House" className="absolute inset-0 z-20 flex flex-col bg-phone-ground font-body text-wall-ink">
      <div className="flex shrink-0 items-center gap-[12px] border-0 border-b border-solid border-wall-stone px-[20px] pb-[12px] pt-[max(14px,calc(env(safe-area-inset-top)+6px))]">
        <button type="button" aria-label="Back" onClick={onClose} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-wall-paper p-0 text-wall-ink"><ChevronLeft size={20} /></button>
        <span className="flex flex-col"><span className="text-phone-detail text-wall-ink-2">Settings</span><h1 className="m-0 font-display text-phone-title font-bold leading-none text-wall-ink">Send to Tabor House</h1></span>
      </div>
      <div className="flex flex-1 flex-col gap-[14px] overflow-y-auto overscroll-contain px-[16px] py-[14px] pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] text-phone-body">
        <div className="px-[4px] text-phone-detail text-wall-ink-2">Share a post, a page, a text or a photo from any app — or double-tap the back of your iPhone to send what’s on the screen. A place goes to Places worth trying, a recipe to Recipes, and dates wait for your yes.</div>

        <div className={card}>
          <div className={label}>1 · YOUR KEY</div>
          {key ? (
            <>
              <div aria-label="Your key" className="select-all break-all rounded-[12px] bg-wall-on-pigment px-[12px] py-[10px] font-mono text-phone-detail text-wall-ink">{key}</div>
              <div className="flex items-center gap-[10px]"><CopyButton text={key} name="your key" /><span className="text-phone-detail text-wall-ink-2">Shown once. It goes in the Shortcut, step 4.</span></div>
              {/* The ready-made Shortcut asks for this when it's added: the address with the key in it. */}
              <div className="flex items-center gap-[10px]"><CopyButton text={`${SHARE_URL}?key=${key}`} name="your address" label="Copy your address" /><span className="text-phone-detail text-wall-ink-2">For the ready-made Shortcut.</span></div>
            </>
          ) : (
            <>
              <div className="text-phone-detail text-wall-ink-2">
                {status === undefined ? 'Looking…' : status ? `You have one, made ${day(status.created_at)}${status.last_used_at ? `, last used ${day(status.last_used_at)}` : ', not used yet'}. A new one stops the old.` : 'It tells the house the shares are yours.'}
              </div>
              <button type="button" disabled={busy || status === undefined} onClick={() => void makeKey()} className={`${pill} border-0 bg-wall-ink text-wall-on-pigment disabled:opacity-40`}>{busy ? 'Making it…' : status ? 'Make a new key' : 'Make my key'}</button>
            </>
          )}
          {error && <div role="alert" className="text-phone-detail font-semibold text-wall-rust">{error}</div>}
        </div>

        <div className={card}>
          <div className={label}>2 · THE SHORTCUT, ONCE</div>
          <ol className="m-0 flex list-none flex-col gap-[10px] p-0">
            {steps.map(([title, how], i) => (
              <li key={title} className="flex gap-[10px]">
                <span className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-wall-ink text-phone-detail font-bold text-wall-on-pigment">{i + 1}</span>
                <span className="flex flex-col"><span className="font-semibold">{title}</span><span className="text-phone-detail text-wall-ink-2">{how}</span></span>
              </li>
            ))}
          </ol>
          <div className="break-all rounded-[12px] bg-wall-on-pigment px-[12px] py-[10px] font-mono text-phone-detail text-wall-ink">{SHARE_URL}</div>
          <div><CopyButton text={SHARE_URL} name="the address" /></div>
        </div>

        <div className={card}>
          <div className={label}>3 · DOUBLE-TAP TO SEND THE SCREEN</div>
          <div className="text-phone-detail text-wall-ink-2">iPhone Settings › Accessibility › Touch › Back Tap › Double Tap › Send to Tabor House. Then a double tap on the back of the phone sends whatever’s on screen — nothing lands in your Photos.</div>
        </div>
      </div>
    </section>
  )
}
