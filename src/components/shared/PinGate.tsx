import { useState, useEffect, useRef } from 'react'
import { cn } from '../../utils/cn'

const STORAGE_KEY = 'casa_auth'
const PIN = import.meta.env.VITE_APP_PIN as string | undefined

function getStored(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === PIN } catch { return false }
}

export default function PinGate({ children }: { children: React.ReactNode }) {
  // If no PIN is configured, pass straight through
  if (!PIN) return <>{children}</>

  const [unlocked, setUnlocked] = useState(getStored)
  const [digits, setDigits] = useState<string[]>([])
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!unlocked) inputRef.current?.focus() }, [unlocked])

  function handleKey(d: string) {
    if (digits.length >= PIN!.length) return
    const next = [...digits, d]
    setDigits(next)
    if (next.length === PIN!.length) {
      const attempt = next.join('')
      if (attempt === PIN) {
        try { localStorage.setItem(STORAGE_KEY, PIN!) } catch { /* */ }
        setUnlocked(true)
      } else {
        setShake(true)
        setTimeout(() => { setDigits([]); setShake(false); inputRef.current?.focus() }, 600)
      }
    }
  }

  function handleBackspace() { setDigits(d => d.slice(0, -1)) }

  if (unlocked) return <>{children}</>

  const pinLen = PIN?.length ?? 4

  return (
    <div className="fixed inset-0 bg-casa-bg flex flex-col items-center justify-center gap-8 z-[9999]">
      <div className="flex flex-col items-center gap-2">
        <span className="text-4xl">🏠</span>
        <h1 className="font-display text-display-md text-casa-navy">Casa Tabor</h1>
        <p className="text-body text-casa-muted">Enter your PIN to continue</p>
      </div>

      {/* Dots */}
      <div className={cn('flex gap-4 transition-all', shake && 'animate-[shake_0.4s_ease]')}>
        {Array.from({ length: pinLen }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-4 h-4 rounded-full border-2 transition-all duration-150',
              i < digits.length
                ? 'bg-casa-navy border-casa-navy scale-110'
                : 'bg-transparent border-casa-border',
            )}
          />
        ))}
      </div>

      {/* Hidden input for hardware keyboard */}
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        className="absolute opacity-0 pointer-events-none w-0 h-0"
        onKeyDown={e => {
          if (e.key >= '0' && e.key <= '9') handleKey(e.key)
          if (e.key === 'Backspace') handleBackspace()
        }}
      />

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 w-64">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
          <button
            key={i}
            onClick={() => {
              if (k === '⌫') handleBackspace()
              else if (k) handleKey(k)
            }}
            disabled={!k}
            className={cn(
              'h-16 rounded-2xl text-xl font-semibold transition-all active:scale-95',
              k
                ? 'bg-casa-surface border border-casa-border text-casa-navy shadow-card hover:bg-casa-bg hover:shadow-card-hover'
                : 'invisible',
            )}
          >
            {k}
          </button>
        ))}
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0) }
          20%,60%  { transform: translateX(-8px) }
          40%,80%  { transform: translateX(8px) }
        }
      `}</style>
    </div>
  )
}
