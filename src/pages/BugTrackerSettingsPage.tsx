import { useCallback, useEffect, useRef, useState } from 'react'
import { Bug, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { AIBugReport } from '../types'
import { Button, Chip, SegmentedControl, SkeletonRow, Switch, Input, Textarea } from '../components/ui'
import { SettingsPageHeader } from '../components/settings'

interface AIMemoryCaptureConfig {
  enabled: boolean
  passiveSignalsEnabled: boolean
  autoCaptureBugs: boolean
}

const DEFAULT_MEMORY_CAPTURE_CONFIG: AIMemoryCaptureConfig = {
  enabled: false,
  passiveSignalsEnabled: false,
  autoCaptureBugs: false,
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'wont_fix', label: "Won't fix" },
 ] as const

const SEVERITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const

export default function BugTrackerSettingsPage() {
  const [bugs, setBugs] = useState<AIBugReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [severity, setSeverity] = useState<AIBugReport['severity']>('medium')
  const [memoryCapture, setMemoryCapture] = useState<AIMemoryCaptureConfig>(DEFAULT_MEMORY_CAPTURE_CONFIG)
  const hydratedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [bugRows, configRow] = await Promise.all([
      supabase.from('ai_bug_reports').select('*').order('discovered_at', { ascending: false }).limit(40),
      supabase.from('settings').select('value').eq('key', 'ai_memory_capture_config').maybeSingle(),
    ])
    if (bugRows.error) setError(bugRows.error.message)
    else setBugs((bugRows.data ?? []) as AIBugReport[])
    if (configRow.data?.value && typeof configRow.data.value === 'object') {
      setMemoryCapture({
        ...DEFAULT_MEMORY_CAPTURE_CONFIG,
        ...(configRow.data.value as Partial<AIMemoryCaptureConfig>),
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true
      return
    }
    setSaveState('saving')
    const timer = setTimeout(async () => {
      const { error: persistError } = await supabase.from('settings').upsert(
        { key: 'ai_memory_capture_config', value: memoryCapture, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
      setSaveState(persistError ? 'error' : 'idle')
    }, 450)
    return () => clearTimeout(timer)
  }, [memoryCapture])

  async function addBug() {
    const bugTitle = title.trim()
    if (!bugTitle) return
    setError(null)
    const { error: insertError } = await supabase.from('ai_bug_reports').insert({
      title: bugTitle,
      details: details.trim() || null,
      severity,
      status: 'open',
      source: 'user',
    })
    if (insertError) {
      setError(insertError.message)
      return
    }
    setTitle('')
    setDetails('')
    setSeverity('medium')
    await load()
  }

  async function updateBugStatus(id: string, status: AIBugReport['status']) {
    setError(null)
    const patch = status === 'resolved'
      ? { status, resolved_at: new Date().toISOString() }
      : { status, resolved_at: null }
    const { error: updateError } = await supabase.from('ai_bug_reports').update(patch).eq('id', id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setBugs((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  return (
    <>
      <SettingsPageHeader title="Bug Tracker" description="Capture defects, triage status, and review resolved work." />

      <div className="mt-6 space-y-4">
        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3">
          <div className="flex items-center gap-2">
            <Bug size={15} className="text-casa-gold" />
            <p className="text-body-sm font-semibold text-casa-navy">Bug intake controls</p>
          </div>
          <Switch
            label="Auto-capture bug drafts from failures"
            description="When Casa detects a probable defect, create a draft bug report for your review."
            checked={memoryCapture.autoCaptureBugs}
            onCheckedChange={(autoCaptureBugs) => setMemoryCapture((current) => ({ ...current, autoCaptureBugs }))}
          />
          {saveState === 'saving' && <p className="text-caption text-casa-muted">Saving preference…</p>}
          {saveState === 'error' && <p className="text-caption text-casa-error">Could not save bug intake preference.</p>}
        </div>

        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-body-sm font-semibold text-casa-navy">Add bug report</p>
            <Button variant="secondary" size="sm" onClick={() => void load()} leadingIcon={<RefreshCw size={14} />}>
              Refresh
            </Button>
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Example: Reminder card closes but linked actions remain open"
          />
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={4}
            placeholder="Repro steps, expected result, and actual result"
            className="resize-y"
          />
          <SegmentedControl
            aria-label="Bug severity"
            value={severity}
            options={SEVERITY_OPTIONS}
            onChange={(next) => setSeverity(next as AIBugReport['severity'])}
            fullWidth
          />
          <Button variant="secondary" size="sm" disabled={!title.trim()} onClick={() => void addBug()}>
            Save bug
          </Button>
          {error && <p className="text-caption text-casa-error">{error}</p>}
        </div>

        <div className="bg-casa-surface rounded-card border border-casa-border p-4 shadow-card space-y-3">
          <p className="text-body-sm font-semibold text-casa-navy">Tracked bugs</p>
          <div className="space-y-2 max-h-[32rem] overflow-y-auto">
            {loading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : bugs.length === 0 ? (
              <p className="text-caption text-casa-muted">No bugs logged yet.</p>
            ) : bugs.map((bug) => (
              <div key={bug.id} className="rounded-button border border-casa-border bg-white p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-body-sm font-semibold text-casa-navy">{bug.title}</p>
                  <Chip size="sm" tone={bug.severity === 'critical' || bug.severity === 'high' ? 'warning' : 'neutral'}>
                    {bug.severity}
                  </Chip>
                  <Chip size="sm" tone={bug.status === 'resolved' ? 'success' : 'neutral'}>
                    {bug.status}
                  </Chip>
                </div>
                {bug.details && <p className="text-caption text-casa-muted whitespace-pre-wrap">{bug.details}</p>}
                <SegmentedControl
                  aria-label={`Status for ${bug.title}`}
                  value={bug.status}
                  options={STATUS_OPTIONS}
                  onChange={(value) => void updateBugStatus(bug.id, value as AIBugReport['status'])}
                  fullWidth
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
