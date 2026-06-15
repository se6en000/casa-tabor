import { useState, useEffect, useRef } from 'react'
import { CheckCircle, MessageSquare, Bell, Clock, Send, ExternalLink, Copy, Smartphone, RefreshCw } from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import { usePushNotifications } from '../hooks/usePushNotifications'

interface SmsConfig {
  enabled: boolean
  twilio_account_sid: string
  twilio_auth_token: string
  twilio_from_number: string
  briefing_time: string          // e.g. "07:00"
  briefing_enabled: boolean
  conflict_alerts: boolean       // SMS on new conflict
  prep_alerts: boolean           // SMS on upcoming prep item
  quiet_hours_enabled: boolean
  quiet_hours_start: string      // HH:mm local
  quiet_hours_end: string        // HH:mm local
  push_quiet_hours_enabled: boolean
  sms_escalation_only: boolean
  escalation_enabled: boolean
  escalation_minutes: number
  notify_members: string[]       // family_member ids to text
}

const DEFAULTS: SmsConfig = {
  enabled: false,
  twilio_account_sid: '',
  twilio_auth_token: '',
  twilio_from_number: '',
  briefing_time: '07:00',
  briefing_enabled: false,
  conflict_alerts: false,
  prep_alerts: false,
  quiet_hours_enabled: true,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  push_quiet_hours_enabled: true,
  sms_escalation_only: true,
  escalation_enabled: true,
  escalation_minutes: 90,
  notify_members: [],
}

function Toggle({ checked, onChange, label, desc, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string; disabled?: boolean
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-3', disabled && 'opacity-40 pointer-events-none')}>
      <div>
        <p className="text-body-sm font-medium text-casa-navy">{label}</p>
        {desc && <p className="text-caption text-casa-muted mt-0.5">{desc}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none',
          checked ? 'bg-casa-navy' : 'bg-casa-border'
        )}
      >
        <span className={cn(
          'inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5',
          checked ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
        )} />
      </button>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; disabled?: boolean
}) {
  return (
    <div className={cn(disabled && 'opacity-40 pointer-events-none')}>
      <label className="block text-caption font-medium text-casa-muted mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-casa-border rounded-lg px-3 py-2 text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20 placeholder:text-casa-muted/50"
      />
    </div>
  )
}

export default function SmsSettingsPage() {
  const [config, setConfig] = useState<SmsConfig>(DEFAULTS)
  const [saved, setSaved] = useState(false)
  const hydratedRef = useRef(false)
  const {
    supported: pushSupported,
    permission: pushPermission,
    subscribed: pushSubscribed,
    busy: pushBusy,
    error: pushError,
    deviceLabel,
    enablePush,
    refreshStatus,
  } = usePushNotifications()

  // Load family members for the notify selector
  const { data: members = [] } = useQuery<{ id: string; name: string; phone: string | null }[]>({
    queryKey: ['family-members-simple'],
    queryFn: async () => {
      const { data } = await supabase.from('family_members').select('id, name, phone').order('sort_order')
      return data ?? []
    },
  })

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'sms_config'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('value').eq('key', 'sms_config').single()
      return data?.value as SmsConfig | null
    },
  })

  useEffect(() => {
    if (data) setConfig({ ...DEFAULTS, ...data })
  }, [data])

  const saveMutation = useMutation({
    mutationFn: async (cfg: SmsConfig) => {
      const { error } = await supabase.from('settings').upsert(
        { key: 'sms_config', value: cfg, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      )
      if (error) throw error
    },
    onSuccess: () => {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const [pushTestStatus, setPushTestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')
  const sendTestBriefing = async () => {
    setTestStatus('sending')
    try {
      const { error } = await supabase.functions.invoke('morning-briefing-sms', {})
      setTestStatus(error ? 'error' : 'ok')
    } catch {
      setTestStatus('error')
    }
    setTimeout(() => setTestStatus('idle'), 4000)
  }

  const sendTestPush = async () => {
    setPushTestStatus('sending')
    try {
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          title: 'Casa Tabor test',
          body: `Push is working on ${deviceLabel}.`,
          url: '/settings/sms',
          tag: 'push-test',
        },
      })
      if (error) {
        setPushTestStatus('error')
      } else {
        const sent = Number((data as { sent?: number } | null)?.sent ?? 0)
        setPushTestStatus(sent > 0 ? 'ok' : 'error')
      }
    } catch {
      setPushTestStatus('error')
    }
    setTimeout(() => setPushTestStatus('idle'), 4000)
  }

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sms-webhook`
  const [copied, setCopied] = useState(false)
  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const set = <K extends keyof SmsConfig>(key: K, value: SmsConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: value }))

  useEffect(() => {
    if (isLoading) return
    if (!hydratedRef.current) {
      hydratedRef.current = true
      return
    }
    const t = setTimeout(() => {
      saveMutation.mutate(config)
    }, 700)
    return () => clearTimeout(t)
  }, [config, isLoading])

  const toggleMember = (id: string) =>
    set('notify_members', config.notify_members.includes(id)
      ? config.notify_members.filter(m => m !== id)
      : [...config.notify_members, id])

  if (isLoading) return <div className="text-casa-muted text-body-sm">Loading…</div>

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <span className="w-10 h-10 rounded-full bg-casa-bg border border-casa-border flex items-center justify-center text-casa-gold">
          <MessageSquare size={18} />
        </span>
        <div>
          <h1 className="font-display text-display-sm text-casa-navy">Notifications</h1>
          <p className="text-caption text-casa-muted">SMS alerts via Twilio</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Smartphone size={15} className="text-casa-gold" />
            <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide">Phone Push Notifications</p>
          </div>
          <p className="text-caption text-casa-muted mb-3">
            Enable iPhone/Android browser push for event reminders. On iOS, this must be triggered from this button.
          </p>

          {!pushSupported ? (
            <p className="text-caption text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Push notifications are not supported in this browser.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="text-caption px-2.5 py-1 rounded-full border border-casa-border text-casa-muted">
                  Permission: <span className="font-medium text-casa-navy">{pushPermission}</span>
                </span>
                <span className="text-caption px-2.5 py-1 rounded-full border border-casa-border text-casa-muted">
                  Subscription: <span className={cn('font-medium', pushSubscribed ? 'text-emerald-700' : 'text-casa-navy')}>{pushSubscribed ? 'active' : 'not active'}</span>
                </span>
              </div>

              {pushPermission === 'denied' && (
                <p className="text-caption text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                  Notifications are blocked. Re-enable them in iOS Settings → Notifications → Casa Tabor, then tap Enable again.
                </p>
              )}

              {pushError && (
                <p className="text-caption text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                  {pushError}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={enablePush}
                  disabled={pushBusy}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-body-sm font-semibold transition-colors',
                    pushBusy ? 'bg-casa-border text-casa-muted' : 'bg-casa-navy text-white hover:bg-casa-navy/90'
                  )}
                >
                  <Bell size={14} />
                  {pushBusy ? 'Enabling…' : pushSubscribed ? 'Re-subscribe push' : 'Enable push notifications'}
                </button>

                <button
                  type="button"
                  onClick={refreshStatus}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-body-sm font-semibold bg-casa-bg border border-casa-border text-casa-navy hover:border-casa-navy/30 transition-colors"
                >
                  <RefreshCw size={14} />
                  Refresh status
                </button>

                <button
                  type="button"
                  onClick={sendTestPush}
                  disabled={!pushSubscribed || pushTestStatus === 'sending'}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-body-sm font-semibold transition-colors',
                    (!pushSubscribed || pushTestStatus === 'sending') ? 'bg-casa-border text-casa-muted'
                    : pushTestStatus === 'ok' ? 'bg-green-100 text-green-700'
                    : pushTestStatus === 'error' ? 'bg-red-100 text-red-700'
                    : 'bg-casa-gold/10 text-casa-gold hover:bg-casa-gold/20'
                  )}
                >
                  <Send size={14} />
                  {pushTestStatus === 'sending' ? 'Sending test…'
                    : pushTestStatus === 'ok' ? 'Push sent!'
                    : pushTestStatus === 'error' ? 'Push failed'
                    : 'Send test push'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Master toggle + Twilio credentials */}
        <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5">
          <Toggle
            checked={config.enabled}
            onChange={v => set('enabled', v)}
            label="Enable SMS Notifications"
            desc="Requires a Twilio account — enter credentials below"
          />

          {config.enabled && (
            <div className="mt-4 space-y-3 pt-4 border-t border-casa-divider">
              <Field
                label="Twilio Account SID"
                value={config.twilio_account_sid}
                onChange={v => set('twilio_account_sid', v)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <Field
                label="Twilio Auth Token"
                value={config.twilio_auth_token}
                onChange={v => set('twilio_auth_token', v)}
                type="password"
                placeholder="••••••••••••••••••••••••••••••••"
              />
              <Field
                label="From Number"
                value={config.twilio_from_number}
                onChange={v => set('twilio_from_number', v)}
                placeholder="+15555555555"
              />
              <p className="text-caption text-casa-muted">
                Get these from{' '}
                <a href="https://console.twilio.com" target="_blank" rel="noreferrer" className="underline hover:text-casa-navy">
                  console.twilio.com
                </a>
              </p>
            </div>
          )}
        </div>

        {/* What to send */}
        <div className={cn('bg-casa-surface rounded-card border border-casa-border shadow-card p-5', !config.enabled && 'opacity-40 pointer-events-none')}>
          <div className="flex items-center gap-2 mb-1">
            <Bell size={15} className="text-casa-gold" />
            <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide">What to Send</p>
          </div>
          <div className="divide-y divide-casa-divider">
            <div>
              <Toggle
                checked={config.briefing_enabled}
                onChange={v => set('briefing_enabled', v)}
                label="Morning Briefing"
                desc="Sends the daily AI briefing as a text message"
              />
              {config.briefing_enabled && (
                <div className="pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock size={13} className="text-casa-muted" />
                    <label className="text-caption text-casa-muted">Send at</label>
                  </div>
                  <input
                    type="time"
                    value={config.briefing_time}
                    onChange={e => set('briefing_time', e.target.value)}
                    className="border border-casa-border rounded-lg px-3 py-2 text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
                  />
                </div>
              )}
            </div>
            <Toggle
              checked={config.conflict_alerts}
              onChange={v => set('conflict_alerts', v)}
              label="Conflict Alerts"
              desc="Text when a new scheduling conflict is detected"
            />
            <Toggle
              checked={config.prep_alerts}
              onChange={v => set('prep_alerts', v)}
              label="Prep Reminders"
              desc="Text when a high-priority prep item is due soon"
            />
            <div>
              <Toggle
                checked={config.quiet_hours_enabled}
                onChange={v => set('quiet_hours_enabled', v)}
                label="Quiet Hours"
                desc="Suppress non-critical SMS during overnight hours"
              />
              {config.quiet_hours_enabled && (
                <div className="pb-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-caption text-casa-muted mb-1">Quiet starts</label>
                    <input
                      type="time"
                      value={config.quiet_hours_start}
                      onChange={e => set('quiet_hours_start', e.target.value)}
                      className="border border-casa-border rounded-lg px-3 py-2 text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
                    />
                  </div>
                  <div>
                    <label className="block text-caption text-casa-muted mb-1">Quiet ends</label>
                    <input
                      type="time"
                      value={config.quiet_hours_end}
                      onChange={e => set('quiet_hours_end', e.target.value)}
                      className="border border-casa-border rounded-lg px-3 py-2 text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
                    />
                  </div>
                </div>
              )}
              <div className="pb-3">
                <Toggle
                  checked={config.push_quiet_hours_enabled}
                  onChange={v => set('push_quiet_hours_enabled', v)}
                  label="Apply quiet hours to push reminders"
                  desc="When enabled, upcoming event push reminders are also suppressed during quiet hours."
                />
              </div>
            </div>
            <div>
              <Toggle
                checked={config.sms_escalation_only}
                onChange={v => set('sms_escalation_only', v)}
                label="SMS escalation only (Recommended)"
                desc="Only send SMS for high-severity conflicts and due-soon prep items. Push remains the primary channel."
              />
              <Toggle
                checked={config.escalation_enabled}
                onChange={v => set('escalation_enabled', v)}
                label="Escalation Window"
                desc="Send SMS when prep items are close to due time"
              />
              {config.escalation_enabled && (
                <div className="pb-3">
                  <Field
                    label="Escalate when due in (minutes)"
                    value={String(config.escalation_minutes)}
                    onChange={(v) => set('escalation_minutes', Number(v) || 0)}
                    type="number"
                    placeholder="90"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Who to notify */}
        <div className={cn('bg-casa-surface rounded-card border border-casa-border shadow-card p-5', !config.enabled && 'opacity-40 pointer-events-none')}>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={15} className="text-casa-gold" />
            <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide">Who to Notify</p>
          </div>
          {members.length === 0 && (
            <p className="text-caption text-casa-muted">Add family members with phone numbers in the Family settings first.</p>
          )}
          <div className="space-y-2">
            {members.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleMember(m.id)}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors',
                  config.notify_members.includes(m.id)
                    ? 'border-casa-navy bg-casa-navy/5 text-casa-navy'
                    : 'border-casa-border bg-white text-casa-navy hover:border-casa-navy/30'
                )}
              >
                <span className="text-body-sm font-medium">{m.name}</span>
                <span className="text-caption text-casa-muted">
                  {m.phone ?? <span className="italic text-amber-600">no phone number</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Webhook URL + Test Briefing */}
      {config.enabled && (
        <div className="mt-4 bg-casa-surface rounded-card border border-casa-border shadow-card p-5 space-y-4">
          {/* Webhook URL */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ExternalLink size={15} className="text-casa-gold" />
              <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide">Inbound SMS Webhook</p>
            </div>
            <p className="text-caption text-casa-muted mb-2">
              Set this URL in{' '}
              <a href="https://console.twilio.com" target="_blank" rel="noreferrer" className="underline hover:text-casa-navy">
                Twilio Console
              </a>{' '}
              → Phone Numbers → Active Numbers → Messaging → Webhook (HTTP POST) to enable reply handling.
            </p>
            <div className="flex items-center gap-2 bg-casa-bg border border-casa-border rounded-lg px-3 py-2">
              <code className="flex-1 text-caption text-casa-navy truncate">{webhookUrl}</code>
              <button
                type="button"
                onClick={copyWebhook}
                className="text-casa-muted hover:text-casa-navy transition-colors shrink-0"
                title="Copy URL"
              >
                {copied ? <CheckCircle size={15} className="text-green-600" /> : <Copy size={15} />}
              </button>
            </div>
          </div>

          {/* Test Briefing */}
          <div className="pt-3 border-t border-casa-divider">
            <p className="text-caption text-casa-muted mb-2">
              Send the morning briefing right now to all configured members.
            </p>
            <button
              type="button"
              onClick={sendTestBriefing}
              disabled={testStatus === 'sending'}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-body-sm font-semibold transition-colors',
                testStatus === 'ok' ? 'bg-green-100 text-green-700'
                : testStatus === 'error' ? 'bg-red-100 text-red-700'
                : 'bg-casa-gold/10 text-casa-gold hover:bg-casa-gold/20'
              )}
            >
              <Send size={14} />
              {testStatus === 'sending' ? 'Sending…'
                : testStatus === 'ok' ? 'Sent!'
                : testStatus === 'error' ? 'Failed — check credentials'
                : 'Send Briefing Now'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        {saveMutation.isPending ? (
          <span className="text-caption text-casa-muted">Saving…</span>
        ) : saved ? (
          <span className="text-caption text-emerald-700 inline-flex items-center gap-1"><CheckCircle size={14} /> Saved</span>
        ) : null}
      </div>
    </>
  )
}
