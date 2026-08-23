import { useState } from 'react'
import { format } from 'date-fns'
import { Camera, Sparkles } from 'lucide-react'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useAppStore } from '../../stores/appStore'
import { IconButton, Button } from '../ui'
import MobileDocumentScanSheet from '../mobile/MobileDocumentScanSheet'
import MaisonCrest from '../shared/MaisonCrest'

export default function MobileTopBar() {
  const now = useLiveClock(30_000)
  const { openAiInSidecar } = useAppStore()
  const [scanSheetOpen, setScanSheetOpen] = useState(false)

  return (
    <>
      <header
        role="banner"
        aria-label="Maison Tabor mobile header"
        className="lg:hidden w-full flex-shrink-0 z-sticky floating-dock-glass border-b border-casa-gold/20 shadow-[0_4px_20px_rgba(27,42,74,0.04)] px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2.5 flex items-center justify-between gap-3 select-none"
      >
        {/* Left: Brand + Realtime Pulse + Date */}
        <div className="flex items-center gap-3 min-w-0">
          <MaisonCrest size={36} isWarm={true} />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="maison-brand-title text-base font-bold text-casa-navy tracking-[0.05em] leading-none">
                Maison <span className="text-casa-gold font-normal">Tabor</span>
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0"
                title="Connected & Synced"
              />
            </div>
            <span className="text-3xs font-mono font-medium text-casa-muted/90 truncate mt-0.5">
              {format(now, 'EEEE, MMM d')}
            </span>
          </div>
        </div>

        {/* Right Action Cluster: Document Scan + Copilot Launcher */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Quick Scan Icon Button */}
          <IconButton
            variant="ghost"
            size="sm"
            onClick={() => setScanSheetOpen(true)}
            aria-label="Scan Document or Card"
            title="Scan Document or Card"
            icon={<Camera size={18} strokeWidth={2} />}
            className="w-9 h-9 rounded-xl border border-casa-border/60 bg-casa-surface/80 text-casa-navy hover:text-casa-gold hover:border-casa-gold/40 hover:bg-casa-surface active:scale-95 transition-all"
          />

          {/* Ask Casa / Copilot Sparkle Pill */}
          <Button
            variant="champagne"
            size="sm"
            onClick={() => {
              openAiInSidecar({ source: 'mobile-header', agent: 'general' })
            }}
            aria-label="Open Casa AI Copilot"
            className="h-9 px-3 rounded-xl font-semibold text-xs text-casa-navy border border-casa-gold/40 bg-gradient-to-r from-casa-gold/20 via-casa-gold/15 to-casa-gold/25 shadow-2xs hover:brightness-105 active:scale-95 transition-all flex items-center gap-1.5"
          >
            <Sparkles size={14} className="text-casa-gold fill-casa-gold/30 shrink-0" />
            <span>Copilot</span>
          </Button>
        </div>
      </header>

      {/* Global Document Scanner Sheet for Mobile */}
      <MobileDocumentScanSheet
        open={scanSheetOpen}
        onClose={() => setScanSheetOpen(false)}
      />
    </>
  )
}
