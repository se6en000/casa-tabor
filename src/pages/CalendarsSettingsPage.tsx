import { useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import { Check, ChevronLeft, RefreshCw, Unlink, AlertCircle } from 'lucide-react'
import {
  useCalendarConnections,
  useStartConnect,
  useSyncNow,
  useDisconnect,
  type MemberWithConnection,
} from '../hooks/useCalendarConnections'
import { cn } from '../utils/cn'

export default function CalendarsSettingsPage() {
  const { data: members, isLoading, refetch } = useCalendarConnections()
  const startConnect = useStartConnect()
  const syncNow = useSyncNow()
  const disconnect = useDisconnect()
  const [params, setParams] = useSearchParams()

  const connected = params.get('connected')
  const errorParam = params.get('error')

  // Clear OAuth return params from the URL after we've reacted to them.
  useEffect(() => {
    if (connected || errorParam) {
      refetch()
      const t = setTimeout(() => {
        params.delete('connected')
        params.delete('error')
        setParams(params, { replace: true })
      }, 4000)
      return () => clearTimeout(t)
    }
  }, [connected, errorParam, params, refetch, setParams])

  return (
    <div className="flex-1 overflow-y-auto">
    <div className="max-w-2xl mx-auto p-6">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-body-sm text-casa-muted hover:text-casa-navy mb-4"
      >
        <ChevronLeft size={16} /> Settings
      </Link>

      <h1 className="font-display text-display-md text-casa-navy mb-2">Google Calendars</h1>
      <p className="text-body text-casa-muted mb-6">
        Connect each family member's Google account. Events sync automatically every 5 minutes.
      </p>

      {connected && (
        <Banner tone="success">
          <Check size={16} /> Connected successfully — syncing now.
        </Banner>
      )}
      {errorParam && (
        <Banner tone="error">
          <AlertCircle size={16} /> Couldn't connect: {errorParam.replace(/_/g, ' ')}
        </Banner>
      )}
      {startConnect.isError && (
        <Banner tone="error">
          <AlertCircle size={16} /> Connect failed: {(startConnect.error as Error)?.message ?? 'Unknown error'}
        </Banner>
      )}

      {isLoading ? (
        <div className="text-casa-muted text-body animate-breathe">Loading members…</div>
      ) : (
        <div className="space-y-2">
          {members?.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              onConnect={() => startConnect.mutate(m.id)}
              onSync={() => syncNow.mutate(m.id)}
              onDisconnect={() => disconnect.mutate(m.id)}
              isBusy={
                (startConnect.isPending && startConnect.variables === m.id) ||
                (syncNow.isPending && syncNow.variables === m.id) ||
                (disconnect.isPending && disconnect.variables === m.id)
              }
            />
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => syncNow.mutate(undefined)}
          disabled={syncNow.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-button border border-casa-border text-body-sm font-semibold text-casa-navy hover:bg-casa-surface disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={cn(syncNow.isPending && 'animate-spin')} />
          Sync all now
        </button>
      </div>
    </div>
    </div>
  )
}

function MemberRow({
  member,
  onConnect,
  onSync,
  onDisconnect,
  isBusy,
}: {
  member: MemberWithConnection
  onConnect: () => void
  onSync: () => void
  onDisconnect: () => void
  isBusy: boolean
}) {
  const c = member.connection
  return (
    <div className="flex items-center justify-between bg-casa-surface rounded-card border border-casa-border p-4 shadow-card">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-body-sm shrink-0"
          style={{ backgroundColor: member.color_hex }}
        >
          {member.name[0]}
        </span>
        <div className="min-w-0">
          <p className="font-display text-heading text-casa-navy leading-none">{member.name}</p>
          <p className="text-caption text-casa-muted mt-1 truncate">
            {c ? (
              <>
                {c.google_email}
                {' · '}
                {c.last_sync_at
                  ? `synced ${formatDistanceToNow(new Date(c.last_sync_at))} ago`
                  : `connected ${format(new Date(c.connected_at), 'MMM d, h:mm a')}`}
                {c.last_sync_error && (
                  <span className="text-casa-error"> · {c.last_sync_error}</span>
                )}
              </>
            ) : (
              'Not connected'
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {c ? (
          <>
            <button
              onClick={onSync}
              disabled={isBusy}
              className="p-2 rounded-button border border-casa-border text-casa-navy hover:bg-casa-bg disabled:opacity-50 transition-colors"
              title="Sync now"
            >
              <RefreshCw size={14} className={cn(isBusy && 'animate-spin')} />
            </button>
            <button
              onClick={onDisconnect}
              disabled={isBusy}
              className="p-2 rounded-button border border-casa-border text-casa-error hover:bg-red-50 disabled:opacity-50 transition-colors"
              title="Disconnect"
            >
              <Unlink size={14} />
            </button>
          </>
        ) : (
          <button
            onClick={onConnect}
            disabled={isBusy}
            className="px-3 py-1.5 rounded-button bg-casa-navy text-white text-body-sm font-semibold hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {isBusy ? 'Connecting…' : 'Connect Google'}
          </button>
        )}
      </div>
    </div>
  )
}

function Banner({ tone, children }: { tone: 'success' | 'error'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 rounded-button mb-4 text-body-sm font-medium',
        tone === 'success'
          ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
          : 'bg-red-50 border border-red-200 text-casa-error',
      )}
    >
      {children}
    </div>
  )
}
