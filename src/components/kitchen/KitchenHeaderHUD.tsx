import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  Clock,
  Mic,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Sparkles,
  Timer as TimerIcon,
  X,
} from 'lucide-react'
import { Button, IconButton } from '../ui'
import { cn } from '../../utils/cn'

export interface KitchenTimer {
  id: string
  label: string
  durationSeconds: number
  remainingSeconds: number
  isRunning: boolean
  isCompleted: boolean
}

interface KitchenHeaderHUDProps {
  recipeName: string
  cookTime?: string | null
  servings?: string | null
  currentStepIndex: number
  totalSteps: number
  timers: KitchenTimer[]
  onAddTimer: (label: string, seconds: number) => void
  onToggleTimer: (id: string) => void
  onResetTimer: (id: string) => void
  onRemoveTimer: (id: string) => void
  onExit: () => void
  onToggleSousChef: () => void
  isSousChefOpen: boolean
  isVoiceActive?: boolean
  wakeDetected?: boolean
  isSpeaking?: boolean
  onEditRecipe?: () => void
  className?: string
}

function playKitchenChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const now = ctx.currentTime

    // Pleasant two-tone chime (E5 -> G#5 -> B5)
    const notes = [659.25, 830.61, 987.77]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + i * 0.15)
      gain.gain.setValueAtTime(0.2, now + i * 0.15)
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.6)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.15)
      osc.stop(now + i * 0.15 + 0.65)
    })
  } catch {
    // Audio context may be restricted before user gesture
  }
}

export default function KitchenHeaderHUD({
  recipeName,
  cookTime,
  servings,
  currentStepIndex,
  totalSteps,
  timers,
  onAddTimer,
  onToggleTimer,
  onResetTimer,
  onRemoveTimer,
  onExit,
  onToggleSousChef,
  isSousChefOpen,
  isVoiceActive = false,
  wakeDetected = false,
  isSpeaking = false,
  onEditRecipe,
  className,
}: KitchenHeaderHUDProps) {
  const [timerMenuOpen, setTimerMenuOpen] = useState(false)
  const [customTimerLabel, setCustomTimerLabel] = useState('')
  const [customTimerMinutes, setCustomTimerMinutes] = useState(5)

  // Trigger audio alert when any timer completes
  useEffect(() => {
    const completedTimers = timers.filter((t) => t.isCompleted)
    if (completedTimers.length > 0) {
      playKitchenChime()
    }
  }, [timers])

  const formatTimerDigits = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }, [])

  return (
    <header
      className={cn(
        'w-full bg-casa-surface border-b border-casa-border/80 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap select-none shrink-0 shadow-xs',
        className
      )}
    >
      {/* Left side: Back to library & Recipe Metadata */}
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="md"
          onClick={onExit}
          className="font-bold text-casa-navy hover:text-casa-gold -ml-2 min-h-control px-3 flex items-center gap-1.5"
          aria-label="Back to Recipe Library"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Recipes</span>
        </Button>

        <div className="h-6 w-px bg-casa-border/80 hidden sm:block" />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-2xs font-bold uppercase tracking-widest text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              Kitchen Mode
            </span>
            <span className="text-caption text-casa-muted font-medium hidden md:inline">
              Step {currentStepIndex + 1} of {totalSteps}
            </span>
          </div>
          <h1 className="font-display text-body-lg sm:text-heading font-bold text-casa-navy truncate leading-tight mt-0.5">
            {recipeName}
          </h1>
        </div>

        {(cookTime || servings) && (
          <div className="hidden xl:flex items-center gap-2 text-caption text-casa-muted font-medium ml-2">
            {cookTime && (
              <span className="flex items-center gap-1 bg-casa-bg px-2.5 py-1 rounded-lg border border-casa-border/60">
                <Clock size={13} className="text-casa-gold" /> {cookTime}
              </span>
            )}
            {servings && (
              <span className="bg-casa-bg px-2.5 py-1 rounded-lg border border-casa-border/60">
                {servings} servings
              </span>
            )}
          </div>
        )}

        {onEditRecipe && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEditRecipe}
            className="hidden md:inline-flex text-caption font-bold text-casa-muted hover:text-casa-navy min-h-control px-2.5"
          >
            Edit recipe
          </Button>
        )}
      </div>

      {/* Right side: Parallel Timers & Sous Chef AI Trigger */}
      <div className="flex items-center gap-2.5 flex-wrap ml-auto">
        {/* Active Timers Strip */}
        <div className="flex items-center gap-2 flex-wrap">
          {timers.map((timer) => (
            <div
              key={timer.id}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono text-body-sm font-bold transition-all',
                timer.isCompleted
                  ? 'bg-red-500/15 border-red-500 text-red-700 animate-pulse ring-2 ring-red-500/30'
                  : timer.isRunning
                  ? 'bg-amber-500/15 border-amber-500 text-amber-900 shadow-xs'
                  : 'bg-casa-bg border-casa-border text-casa-muted'
              )}
            >
              <TimerIcon size={14} className={timer.isRunning ? 'text-amber-700 animate-spin-slow' : 'text-casa-muted'} />
              <span className="max-w-[5rem] sm:max-w-[7rem] truncate font-sans text-caption font-semibold">
                {timer.label}:
              </span>
              <span className="tabular-nums">
                {formatTimerDigits(timer.remainingSeconds)}
              </span>

              {/* Timer Controls */}
              <div className="flex items-center gap-0.5 ml-1 font-sans">
                {timer.isCompleted ? (
                  <IconButton
                    icon={<X size={13} />}
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveTimer(timer.id)}
                    aria-label="Dismiss timer"
                    className="text-red-700 hover:bg-red-500/20"
                  />
                ) : (
                  <>
                    <IconButton
                      icon={timer.isRunning ? <Pause size={12} /> : <Play size={12} />}
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleTimer(timer.id)}
                      aria-label={timer.isRunning ? 'Pause timer' : 'Resume timer'}
                      className="text-casa-navy hover:bg-black/5"
                    />
                    <IconButton
                      icon={<RotateCcw size={12} />}
                      variant="ghost"
                      size="sm"
                      onClick={() => onResetTimer(timer.id)}
                      aria-label="Reset timer"
                      className="text-casa-muted hover:text-casa-navy hover:bg-black/5"
                    />
                    <IconButton
                      icon={<X size={12} />}
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveTimer(timer.id)}
                      aria-label="Remove timer"
                      className="text-casa-muted hover:text-casa-navy hover:bg-black/5"
                    />
                  </>
                )}
              </div>
            </div>
          ))}

          {/* Add Timer Quick Dropdown */}
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setTimerMenuOpen((prev) => !prev)}
              className="font-bold min-h-control px-3 flex items-center gap-1.5"
              aria-label="Add kitchen timer"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Timer</span>
            </Button>

            {timerMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-popover"
                  onClick={() => setTimerMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-72 p-3 bg-casa-surface border border-casa-border rounded-2xl shadow-xl z-popover space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-casa-border/60">
                    <span className="text-caption font-bold uppercase tracking-wider text-casa-navy">
                      Quick Timers
                    </span>
                    <IconButton
                      icon={<X size={14} />}
                      variant="ghost"
                      size="sm"
                      onClick={() => setTimerMenuOpen(false)}
                      aria-label="Close timer popup"
                      className="text-casa-muted hover:text-casa-navy"
                    />
                  </div>

                  {/* Preset Buttons */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {[1, 3, 5, 10].map((mins) => (
                      <Button
                        key={mins}
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          onAddTimer(`${mins}m Timer`, mins * 60)
                          setTimerMenuOpen(false)
                        }}
                        className="font-bold text-body-sm text-casa-navy"
                      >
                        +{mins}m
                      </Button>
                    ))}
                  </div>

                  {/* Custom Timer Input */}
                  <div className="space-y-2 pt-1 border-t border-casa-border/60">
                    <span className="text-2xs font-bold uppercase tracking-wider text-casa-muted block">
                      Custom Timer
                    </span>
                    <input
                      type="text"
                      placeholder="Label (e.g. Pasta, Sauté)"
                      value={customTimerLabel}
                      onChange={(e) => setCustomTimerLabel(e.target.value)}
                      className="w-full text-body-sm px-3 py-1.5 rounded-xl border border-casa-border bg-casa-bg text-casa-navy placeholder:text-casa-muted"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={customTimerMinutes}
                        onChange={(e) => setCustomTimerMinutes(Math.max(1, Number(e.target.value)))}
                        className="w-20 text-body-sm px-3 py-1.5 rounded-xl border border-casa-border bg-casa-bg text-casa-navy font-mono"
                      />
                      <span className="text-body-sm text-casa-muted">minutes</span>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          const label = customTimerLabel.trim() || `${customTimerMinutes}m Timer`
                          onAddTimer(label, customTimerMinutes * 60)
                          setCustomTimerLabel('')
                          setTimerMenuOpen(false)
                        }}
                        className="ml-auto font-bold px-3 min-h-[38px]"
                      >
                        Start
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* AI Sous Chef Toggle Button with Hands-Free Wake-Word Indicator */}
        <Button
          variant={isSousChefOpen ? 'primary' : 'secondary'}
          size="md"
          onClick={onToggleSousChef}
          className={cn(
            'font-bold min-h-control px-3.5 flex items-center gap-2 transition-all shadow-sm',
            isSousChefOpen
              ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-casa-gold text-slate-950 shadow-md ring-2 ring-amber-400/40'
              : 'text-casa-navy hover:text-amber-900'
          )}
          aria-label={isSousChefOpen ? 'Turn off Sous Chef voice assistant' : 'Turn on Sous Chef voice assistant'}
          title={isSousChefOpen ? 'Sous Chef Voice Listening ON (Click to turn off)' : 'Sous Chef Voice Listening OFF (Click to turn on)'}
        >
          {isSousChefOpen ? (
            <>
              {wakeDetected ? (
                <Radio size={16} className="text-slate-950 animate-ping" />
              ) : isSpeaking ? (
                <Radio size={16} className="text-slate-950 animate-bounce" />
              ) : isVoiceActive ? (
                <Mic size={16} className="text-slate-950 animate-pulse" />
              ) : (
                <Sparkles size={16} className="text-slate-950 animate-pulse" />
              )}
              <span className="font-extrabold text-body-sm">
                Sous Chef AI
              </span>
              <span className="hidden md:inline-flex items-center gap-1 bg-slate-950/15 text-slate-950 text-3xs uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-md border border-slate-950/20">
                {isVoiceActive ? '🎙️ Alexa Listening' : 'Active'}
              </span>
            </>
          ) : (
            <>
              <Sparkles size={16} className="text-casa-gold" />
              <span className="hidden sm:inline">Sous Chef AI</span>
            </>
          )}
        </Button>
      </div>
    </header>
  )
}
