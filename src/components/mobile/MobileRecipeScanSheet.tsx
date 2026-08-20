import { useState, useRef } from 'react'
import {
  Camera,
  Upload,
  Link2,
  Sparkles,
  Loader2,
  ArrowRight,
  X,
} from 'lucide-react'
import { Sheet, Button, Input, IconButton } from '../ui'

interface MobileRecipeScanSheetProps {
  open: boolean
  onClose: () => void
  onCameraCapture: (files: File[]) => void
  onFileUpload: (files: File[]) => void
  onUrlSubmit: (url: string) => void
  isProcessing?: boolean
  processingStatus?: string
}

export default function MobileRecipeScanSheet({
  open,
  onClose,
  onCameraCapture,
  onFileUpload,
  onUrlSubmit,
  isProcessing = false,
  processingStatus = 'Scanning recipe with AI...',
}: MobileRecipeScanSheetProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlValue, setUrlValue] = useState('')

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (files.length > 0) {
      onCameraCapture(files)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (files.length > 0) {
      onFileUpload(files)
    }
  }

  const handleUrlSubmit = () => {
    const trimmed = urlValue.trim()
    if (trimmed) {
      onUrlSubmit(trimmed)
      setUrlValue('')
      setShowUrlInput(false)
    }
  }

  return (
    <>
      {/* Hidden File Inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <Sheet
        open={open}
        onClose={onClose}
        side="bottom"
        title="Scan or Import Recipe"
        showHeader={false}
        showHandle={true}
        panelClassName="rounded-t-3xl bg-casa-surface border-t border-casa-border p-6 shadow-2xl max-w-md mx-auto"
      >
        <div className="flex flex-col gap-4 pb-2">
          {/* ── Header Row (Screenshot 2) ── */}
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <Camera size={22} className="text-casa-gold shrink-0" strokeWidth={2.2} />
              <h2 className="text-title font-bold text-casa-navy tracking-tight">
                Scan or Import Recipe
              </h2>
            </div>
            <p className="text-caption text-casa-muted font-medium">
              Extract ingredients, cook times & steps with AI
            </p>
          </div>

          {/* ── AI Processing State ── */}
          {isProcessing ? (
            <div className="p-8 rounded-2xl bg-casa-bg border border-casa-border flex flex-col items-center justify-center text-center gap-3.5 my-2">
              <div className="w-12 h-12 rounded-2xl bg-casa-navy flex items-center justify-center text-casa-gold shadow-md">
                <Loader2 size={24} className="animate-spin text-casa-gold" />
              </div>
              <div className="space-y-1">
                <div className="text-body-sm font-bold text-casa-navy flex items-center justify-center gap-1.5">
                  <Sparkles size={16} className="text-casa-gold" />
                  <span>{processingStatus}</span>
                </div>
                <p className="text-2xs text-casa-muted">
                  Extracting ingredients, measurements, and cooking instructions...
                </p>
              </div>
            </div>
          ) : (
            /* ── Three Main Import Action Cards ── */
            <div className="flex flex-col gap-3 my-1">
              
              {/* Card 1: Camera Snapshot / Scan Card */}
              <div
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-casa-bg/60 border border-casa-border hover:border-casa-gold hover:bg-casa-bg active:scale-[0.98] transition-all cursor-pointer select-none"
              >
                <div className="w-11 h-11 rounded-xl bg-casa-navy text-casa-gold flex items-center justify-center shrink-0 shadow-xs">
                  <Camera size={20} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-bold text-casa-navy truncate">
                    Take Camera Photo / Scan Card
                  </div>
                  <div className="text-caption text-casa-muted truncate mt-0.5">
                    Scan cookbook page, handwritten note, or meal
                  </div>
                </div>
              </div>

              {/* Card 2: Upload Image or PDF */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-casa-bg/60 border border-casa-border hover:border-casa-gold hover:bg-casa-bg active:scale-[0.98] transition-all cursor-pointer select-none"
              >
                <div className="w-11 h-11 rounded-xl bg-casa-navy text-casa-gold flex items-center justify-center shrink-0 shadow-xs">
                  <Upload size={20} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-bold text-casa-navy truncate">
                    Upload Image or PDF
                  </div>
                  <div className="text-caption text-casa-muted truncate mt-0.5">
                    PNG, JPG, HEIC, or scanned recipe PDF
                  </div>
                </div>
              </div>

              {/* Card 3: Paste Recipe URL */}
              {!showUrlInput ? (
                <div
                  onClick={() => setShowUrlInput(true)}
                  className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-casa-bg/60 border border-casa-border hover:border-casa-gold hover:bg-casa-bg active:scale-[0.98] transition-all cursor-pointer select-none"
                >
                  <div className="w-11 h-11 rounded-xl bg-blue-500/15 text-blue-600 flex items-center justify-center shrink-0 shadow-xs">
                    <Link2 size={20} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-bold text-casa-navy truncate">
                      Paste Recipe URL
                    </div>
                    <div className="text-caption text-casa-muted truncate mt-0.5">
                      NYT Cooking, AllRecipes, SeriousEats, etc.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-casa-bg border border-casa-gold/60 space-y-2.5 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-2xs font-bold uppercase tracking-wider text-casa-gold">
                      Paste Web Recipe Link
                    </span>
                    <IconButton
                      icon={<X size={15} />}
                      aria-label="Close URL input"
                      onClick={() => setShowUrlInput(false)}
                      size="sm"
                      variant="ghost"
                      className="text-casa-muted hover:text-casa-navy"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="url"
                      value={urlValue}
                      onChange={(e) => setUrlValue(e.target.value)}
                      placeholder="https://cooking.nytimes.com/recipes/..."
                      className="bg-casa-surface h-10 text-body-sm rounded-xl"
                      autoFocus
                    />
                    <Button
                      variant="champagne"
                      size="sm"
                      onClick={handleUrlSubmit}
                      disabled={!urlValue.trim()}
                      className="shrink-0 h-10 px-3 font-bold text-caption rounded-xl"
                      leadingIcon={<ArrowRight size={15} />}
                    >
                      Fetch
                    </Button>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ── Cancel Button ── */}
          <Button
            variant="secondary"
            size="lg"
            onClick={onClose}
            className="w-full rounded-2xl font-bold text-body-sm min-h-control text-casa-navy bg-casa-bg border-casa-border hover:bg-casa-surface-subtle mt-1"
          >
            Cancel
          </Button>
        </div>
      </Sheet>
    </>
  )
}
