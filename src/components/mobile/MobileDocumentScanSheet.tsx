import { useState, useRef } from 'react'
import {
  Camera,
  Upload,
  Sparkles,
  Loader2,
  Calendar,
  Bell,
  MapPin,
  Check,
  CheckSquare,
  Square,
  Layers,
  Trash2,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Sheet, Button, Input, Chip, PersonAvatarStack, Alert, IconButton, Switch } from '../ui'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase.ts'
import {
  optimizeFileForVision,
  matchSuggestedMemberIds,
  batchSaveScannedItems,
  formatScannedDate,
  formatScannedTime,
  type ScannedItem,
  type ScanDocumentResponse,
} from '../../utils/documentScanner.ts'

interface MobileDocumentScanSheetProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

type ScanStage = 'intake' | 'processing' | 'review'

export default function MobileDocumentScanSheet({
  open,
  onClose,
  onSuccess,
}: MobileDocumentScanSheetProps) {
  const queryClient = useQueryClient()
  const { data: familyMembers = [] } = useFamilyMembers()

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const multiFileInputRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<ScanStage>('intake')
  const [processingStatus, setProcessingStatus] = useState('Reading document with AI vision...')
  const [documentSummary, setDocumentSummary] = useState('')
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([])
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const handleReset = () => {
    setStage('intake')
    setProcessingStatus('Reading document with AI vision...')
    setDocumentSummary('')
    setScannedItems([])
    setExpandedItemId(null)
    setSaving(false)
    setErrorMsg('')
    setSuccessMsg('')
  }

  const triggerHaptic = (ms = 12) => {
    try {
      navigator.vibrate?.(ms)
    } catch {}
  }

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return
    triggerHaptic(15)
    setStage('processing')
    setErrorMsg('')
    setSuccessMsg('')
    setProcessingStatus('Optimizing image for AI analysis...')

    try {
      const optimizedFiles: Array<{ file_base64: string; mime_type: string }> = []
      for (let i = 0; i < files.length; i++) {
        setProcessingStatus(`Optimizing photo ${i + 1} of ${files.length}...`)
        const opt = await optimizeFileForVision(files[i])
        optimizedFiles.push({ file_base64: opt.base64, mime_type: opt.mimeType })
      }

      setProcessingStatus('Gemini Vision is extracting exact dates, times & items...')

      const { data, error } = await supabase.functions.invoke('scan-document-events', {
        body: {
          files: optimizedFiles,
          current_date_iso: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
          family_members: familyMembers.map((m) => ({ id: m.id, name: m.name, full_name: m.full_name })),
        },
      })

      if (error) throw error

      const response = data as ScanDocumentResponse
      if (!response || !response.success || !Array.isArray(response.items)) {
        throw new Error(response?.error || 'No items could be extracted from this document')
      }

      const todayIso = new Date().toISOString().slice(0, 10)
      const parsedItems: ScannedItem[] = response.items.map((item, idx) => {
        const suggestedMemberIds = matchSuggestedMemberIds(item.suggested_member_name, familyMembers)
        const dateStr = item.date || item.start_time?.slice(0, 10) || todayIso
        return {
          id: item.id || `scanned-${idx}-${Date.now()}`,
          type: item.type === 'reminder' ? 'reminder' : 'event',
          title: item.title,
          date: dateStr,
          start_time_local: item.start_time_local || null,
          end_time_local: item.end_time_local || null,
          start_time: item.start_time,
          end_time: item.end_time,
          all_day: Boolean(item.all_day),
          location_name: item.location_name ?? null,
          address: item.address ?? null,
          notes: item.notes ?? null,
          raw_text_snippet: item.raw_text_snippet ?? null,
          selectedMemberIds: suggestedMemberIds,
          confidence: item.confidence ?? 0.9,
          selected: true,
        }
      })

      if (parsedItems.length === 0) {
        throw new Error('No upcoming dates or actionable reminders detected in this photo.')
      }

      triggerHaptic(20)
      setDocumentSummary(response.document_summary || `Found ${parsedItems.length} items from document`)
      setScannedItems(parsedItems)
      setStage('review')
    } catch (err) {
      console.error('MobileDocumentScanSheet error:', err)
      setErrorMsg((err as Error).message || 'Failed to scan document. Please try a clearer photo.')
      setStage('intake')
    }
  }

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (files.length > 0) void processFiles(files)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (files.length > 0) void processFiles(files)
  }

  // Toggle selection of an individual item
  const toggleItemSelection = (id: string) => {
    triggerHaptic(8)
    setScannedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    )
  }

  // Toggle All items
  const allSelected = scannedItems.length > 0 && scannedItems.every((item) => item.selected)
  const toggleSelectAll = () => {
    triggerHaptic(10)
    const nextVal = !allSelected
    setScannedItems((prev) => prev.map((item) => ({ ...item, selected: nextVal })))
  }

  // Toggle item type (event vs reminder)
  const toggleItemType = (id: string) => {
    triggerHaptic(8)
    setScannedItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, type: item.type === 'event' ? 'reminder' : 'event' } : item
      )
    )
  }

  // Update item field
  const updateItem = (id: string, patch: Partial<ScannedItem>) => {
    setScannedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    )
  }

  // Toggle member assignment for an item
  const toggleItemMember = (itemId: string, memberId: string) => {
    triggerHaptic(6)
    setScannedItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item
        const exists = item.selectedMemberIds.includes(memberId)
        return {
          ...item,
          selectedMemberIds: exists
            ? item.selectedMemberIds.filter((id) => id !== memberId)
            : [...item.selectedMemberIds, memberId],
        }
      })
    )
  }

  // Delete an item from review list
  const deleteItem = (id: string) => {
    triggerHaptic(12)
    setScannedItems((prev) => prev.filter((item) => item.id !== id))
  }

  // Save all selected items to database
  const handleSaveSelected = async () => {
    const selectedCount = scannedItems.filter((i) => i.selected).length
    if (selectedCount === 0) return

    setSaving(true)
    setErrorMsg('')
    setSuccessMsg('')
    triggerHaptic(15)

    try {
      const { successCount, errors } = await batchSaveScannedItems(scannedItems)

      if (successCount === 0 && errors.length > 0) {
        throw new Error(errors.join(', '))
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['events'] }),
        queryClient.invalidateQueries({ queryKey: ['today-events'] }),
        queryClient.invalidateQueries({ queryKey: ['rolling-events'] }),
        queryClient.invalidateQueries({ queryKey: ['prep-items'] }),
      ])

      triggerHaptic(25)
      setSuccessMsg(`Successfully added ${successCount} ${successCount === 1 ? 'item' : 'items'} to Casa!`)
      window.setTimeout(() => {
        onSuccess?.()
        handleReset()
        onClose()
      }, 950)
    } catch (err) {
      console.error('Failed to batch save scanned items:', err)
      setErrorMsg((err as Error).message || 'Failed to save items to Casa')
      setSaving(false)
    }
  }

  const selectedCount = scannedItems.filter((i) => i.selected).length

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
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={multiFileInputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <Sheet
        open={open}
        onClose={() => {
          if (!saving) {
            handleReset()
            onClose()
          }
        }}
        side="bottom"
        title="Document Scanner"
        showHeader={false}
        showHandle={true}
        panelClassName="rounded-t-3xl bg-casa-surface border-t border-casa-border p-5 shadow-2xl max-w-lg mx-auto max-h-[92dvh] flex flex-col"
      >
        <div className="flex flex-col gap-3.5 flex-1 min-h-0">
          {/* ── Header Row ── */}
          <div className="flex items-center justify-between shrink-0 pb-1 border-b border-casa-border/50">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <Camera size={20} className="text-casa-gold shrink-0" strokeWidth={2.2} />
                <h2 className="text-title font-bold text-casa-navy tracking-tight truncate">
                  {stage === 'review' ? 'Review & Add to Casa' : 'Scan Document or Card'}
                </h2>
              </div>
              <p className="text-caption text-casa-muted font-medium truncate">
                {stage === 'review'
                  ? documentSummary || `${scannedItems.length} items detected`
                  : 'Capture invites, cards, school flyers & schedules'}
              </p>
            </div>

            {stage === 'review' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-2xs font-bold text-casa-gold hover:text-amber-600 px-2.5 py-1 rounded-lg bg-casa-gold/10 active:scale-95 transition-all shrink-0"
              >
                Scan New
              </Button>
            )}
          </div>

          {/* ── Error Banner ── */}
          {errorMsg && (
            <Alert tone="danger" title="Scanner issue">
              {errorMsg}
            </Alert>
          )}

          {/* ── Success Banner ── */}
          {successMsg && (
            <Alert tone="success" title="Added to Casa">
              {successMsg}
            </Alert>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STAGE 1: INTAKE / CAPTURE OPTIONS
             ══════════════════════════════════════════════════════════════ */}
          {stage === 'intake' && (
            <div className="flex flex-col gap-3 py-1">
              {/* Option 1: Native Phone Camera */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => cameraInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') cameraInputRef.current?.click() }}
                className="flex items-center gap-3.5 p-4 rounded-2xl bg-gradient-to-r from-casa-navy to-slate-900 text-white border border-casa-gold/40 hover:border-casa-gold active:scale-[0.98] transition-all cursor-pointer select-none shadow-md"
              >
                <div className="w-12 h-12 rounded-xl bg-casa-gold text-casa-navy flex items-center justify-center shrink-0 shadow-sm">
                  <Camera size={24} strokeWidth={2.2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-body font-bold text-white tracking-tight flex items-center gap-1.5">
                    <span>Take Camera Photo</span>
                    <Sparkles size={14} className="text-casa-gold" />
                  </div>
                  <div className="text-caption text-slate-300 truncate mt-0.5">
                    Instant shutter capture of card or flyer
                  </div>
                </div>
              </div>

              {/* Option 2: Upload Image or PDF */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
                className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-casa-bg/80 border border-casa-border hover:border-casa-gold hover:bg-casa-bg active:scale-[0.98] transition-all cursor-pointer select-none"
              >
                <div className="w-11 h-11 rounded-xl bg-casa-navy text-casa-gold flex items-center justify-center shrink-0 shadow-2xs">
                  <Upload size={20} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-bold text-casa-navy truncate">
                    Upload Photo or Screenshot
                  </div>
                  <div className="text-caption text-casa-muted truncate mt-0.5">
                    PNG, JPG, HEIC, or single-page PDF
                  </div>
                </div>
              </div>

              {/* Option 3: Multi-Page / Batch Scan */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => multiFileInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') multiFileInputRef.current?.click() }}
                className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-casa-bg/80 border border-casa-border hover:border-casa-gold hover:bg-casa-bg active:scale-[0.98] transition-all cursor-pointer select-none"
              >
                <div className="w-11 h-11 rounded-xl bg-blue-500/15 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs">
                  <Layers size={20} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-bold text-casa-navy truncate">
                    Multi-Page / Batch Scan
                  </div>
                  <div className="text-caption text-casa-muted truncate mt-0.5">
                    Scan front & back or multi-page schedules
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STAGE 2: AI PROCESSING ANIMATION
             ══════════════════════════════════════════════════════════════ */}
          {stage === 'processing' && (
            <div className="p-8 rounded-2xl bg-casa-bg border border-casa-border flex flex-col items-center justify-center text-center gap-4 my-4 animate-fadeIn">
              <div className="relative w-14 h-14 rounded-2xl bg-casa-navy flex items-center justify-center text-casa-gold shadow-md">
                <Loader2 size={28} className="animate-spin text-casa-gold" />
                <Sparkles size={14} className="absolute -top-1 -right-1 text-casa-gold animate-bounce" />
              </div>
              <div className="space-y-1.5 max-w-xs">
                <div className="text-body font-bold text-casa-navy">
                  Analyzing Document
                </div>
                <p className="text-caption text-casa-muted font-medium">
                  {processingStatus}
                </p>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              STAGE 3: 1-TO-MANY TRIAGE REVIEW
             ══════════════════════════════════════════════════════════════ */}
          {stage === 'review' && (
            <div className="flex flex-col flex-1 min-h-0 gap-3">
              {/* Review Subheader & Select All Toggle */}
              <div className="flex items-center justify-between shrink-0 px-1 pt-1">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={toggleSelectAll}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSelectAll() }}
                  className="flex items-center gap-2 text-body-sm font-bold text-casa-navy hover:text-casa-gold transition-colors cursor-pointer select-none"
                >
                  {allSelected ? (
                    <CheckSquare size={18} className="text-casa-gold" />
                  ) : (
                    <Square size={18} className="text-casa-muted" />
                  )}
                  <span>Select All ({scannedItems.length})</span>
                </div>
                <span className="text-caption font-semibold text-casa-muted">
                  {selectedCount} selected
                </span>
              </div>

              {/* Scrollable list of Extracted Items */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 overscroll-contain">
                {scannedItems.map((item) => {
                  const isExpanded = expandedItemId === item.id
                  const dateLabel = formatScannedDate(item.date, item.all_day ? 'EEEE, MMM d' : 'EEE, MMM d')
                  const timeLabel = item.all_day
                    ? 'All Day'
                    : item.start_time_local
                      ? `${formatScannedTime(item.start_time_local)}${item.end_time_local ? ` – ${formatScannedTime(item.end_time_local)}` : ''}`
                      : 'All Day'

                  return (
                    <div
                      key={item.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        item.selected
                          ? 'bg-casa-surface border-casa-gold/60 shadow-xs ring-1 ring-casa-gold/30'
                          : 'bg-casa-bg/60 border-casa-border opacity-60'
                      }`}
                    >
                      {/* Top Action Row: Checkbox + Type Switcher + Delete */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleItemSelection(item.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleItemSelection(item.id) }}
                            className="text-casa-gold hover:opacity-80 p-0.5 cursor-pointer"
                          >
                            {item.selected ? (
                              <CheckSquare size={20} className="text-casa-gold" />
                            ) : (
                              <Square size={20} className="text-casa-muted" />
                            )}
                          </div>

                          {/* Type Pill Switcher */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleItemType(item.id)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleItemType(item.id) }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              item.type === 'event'
                                ? 'bg-casa-navy text-casa-gold border border-casa-gold/30'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {item.type === 'event' ? (
                              <>
                                <Calendar size={12} strokeWidth={2.2} />
                                <span>Calendar Event</span>
                              </>
                            ) : (
                              <>
                                <Bell size={12} strokeWidth={2.2} />
                                <span>Reminder</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <IconButton
                            variant="ghost"
                            size="sm"
                            icon={isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            aria-label={isExpanded ? 'Collapse item details' : 'Edit item date & time'}
                            onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                            className="text-casa-muted hover:text-casa-navy"
                          />
                          <IconButton
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 size={15} />}
                            aria-label="Remove item"
                            onClick={() => deleteItem(item.id)}
                            className="text-casa-muted hover:text-red-500 transition-colors"
                          />
                        </div>
                      </div>

                      {/* Editable Title */}
                      <div className="space-y-2">
                        <Input
                          value={item.title}
                          onChange={(e) => updateItem(item.id, { title: e.target.value })}
                          placeholder="Event or Reminder title"
                          className="font-bold text-body-sm bg-casa-bg h-9 rounded-xl text-casa-navy"
                        />

                        {/* Date / Time Row & Quick Preview */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpandedItemId(isExpanded ? null : item.id) }}
                          className="flex items-center justify-between p-2 rounded-xl bg-casa-bg/80 border border-casa-border/60 text-caption font-medium cursor-pointer hover:border-casa-gold/60 transition-all"
                        >
                          <div className="flex items-center gap-1.5 text-casa-navy truncate min-w-0">
                            <Clock size={13} className="text-casa-gold shrink-0" />
                            <span className="font-semibold truncate">{dateLabel}</span>
                            <span className="text-casa-muted">·</span>
                            <span className="text-casa-text-secondary truncate">{timeLabel}</span>
                          </div>
                          <span className="text-3xs font-bold text-casa-gold uppercase tracking-wider shrink-0 ml-2">
                            {isExpanded ? 'Done' : 'Edit'}
                          </span>
                        </div>

                        {/* Expanded Date / Time Form Controls */}
                        {isExpanded && (
                          <div className="p-3 rounded-xl bg-casa-bg border border-casa-gold/40 space-y-2.5 animate-fadeIn">
                            <div className="flex items-center justify-between">
                              <span className="text-3xs font-bold uppercase tracking-wider text-casa-muted">
                                Date & Time Details
                              </span>
                              <Switch
                                label={<span className="text-2xs font-semibold text-casa-navy">All Day</span>}
                                checked={item.all_day}
                                onCheckedChange={(checked) => updateItem(item.id, { all_day: checked })}
                                className="min-h-0 gap-2"
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="text-3xs font-semibold text-casa-muted block mb-1">
                                  Date
                                </label>
                                <Input
                                  type="date"
                                  value={item.date}
                                  onChange={(e) => updateItem(item.id, { date: e.target.value })}
                                  className="h-8 text-caption bg-casa-surface rounded-lg"
                                />
                              </div>

                              {!item.all_day && (
                                <div className="grid grid-cols-2 gap-1.5">
                                  <div>
                                    <label className="text-3xs font-semibold text-casa-muted block mb-1">
                                      Start
                                    </label>
                                    <Input
                                      type="time"
                                      value={item.start_time_local || '09:00'}
                                      onChange={(e) => updateItem(item.id, { start_time_local: e.target.value })}
                                      className="h-8 text-caption bg-casa-surface rounded-lg"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-3xs font-semibold text-casa-muted block mb-1">
                                      End
                                    </label>
                                    <Input
                                      type="time"
                                      value={item.end_time_local || '10:00'}
                                      onChange={(e) => updateItem(item.id, { end_time_local: e.target.value })}
                                      className="h-8 text-caption bg-casa-surface rounded-lg"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Location Preview if present */}
                        {item.location_name && (
                          <div className="flex items-center gap-1.5 text-caption text-casa-muted px-1 truncate">
                            <MapPin size={13} className="text-casa-gold shrink-0" />
                            <span className="truncate">
                              {item.location_name}
                              {item.address ? ` · ${item.address}` : ''}
                            </span>
                          </div>
                        )}

                        {/* Notes / Instructions if present */}
                        {item.notes && (
                          <div className="text-2xs text-casa-muted bg-casa-bg/80 p-2 rounded-lg border border-casa-border/50">
                            {item.notes}
                          </div>
                        )}

                        {/* Raw text snippet from document if available */}
                        {item.raw_text_snippet && (
                          <div className="text-3xs text-slate-400 italic px-1 truncate">
                            Snippet: &ldquo;{item.raw_text_snippet}&rdquo;
                          </div>
                        )}

                        {/* Household Member Chips */}
                        <div className="pt-1">
                          <div className="text-3xs font-bold uppercase tracking-wider text-casa-muted mb-1 px-1">
                            Assign to
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {familyMembers.map((member) => {
                              const isSelected = item.selectedMemberIds.includes(member.id)
                              return (
                                <Chip
                                  key={member.id}
                                  size="sm"
                                  selected={isSelected}
                                  onClick={() => toggleItemMember(item.id, member.id)}
                                  icon={
                                    <PersonAvatarStack
                                      people={[{ id: member.id, name: member.name, color: member.color_hex }]}
                                      size="sm"
                                      max={1}
                                    />
                                  }
                                >
                                  {member.name}
                                </Chip>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Sticky Confirmation Action Bar */}
              <div className="shrink-0 pt-2 border-t border-casa-border/50 flex flex-col gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => void handleSaveSelected()}
                  disabled={selectedCount === 0 || saving || Boolean(successMsg)}
                  loading={saving}
                  className="w-full rounded-2xl font-bold text-body-sm min-h-[48px] bg-casa-gold text-casa-navy hover:bg-amber-400 shadow-md flex items-center justify-center gap-2"
                >
                  <Check size={18} strokeWidth={2.4} />
                  <span>
                    {saving
                      ? 'Creating in Casa...'
                      : `Add ${selectedCount} ${selectedCount === 1 ? 'Item' : 'Items'} to Casa`}
                  </span>
                </Button>

                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    handleReset()
                    onClose()
                  }}
                  disabled={saving}
                  className="w-full rounded-xl font-semibold text-caption text-casa-muted bg-casa-bg hover:text-casa-navy min-h-[40px]"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* ── Cancel Button for Intake ── */}
          {stage === 'intake' && (
            <Button
              variant="secondary"
              size="lg"
              onClick={onClose}
              className="w-full rounded-2xl font-bold text-body-sm min-h-control text-casa-navy bg-casa-bg border-casa-border hover:bg-casa-surface-subtle mt-1"
            >
              Cancel
            </Button>
          )}
        </div>
      </Sheet>
    </>
  )
}
