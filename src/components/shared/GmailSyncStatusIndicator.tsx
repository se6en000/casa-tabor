import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { AlertCircle, AlertTriangle, RefreshCw, ChevronRight, Settings } from 'lucide-react'
import { useGmailHealth } from '../../hooks/useGmailHealth'
import { cn } from '../../utils/cn'
import { Button } from '../ui'

export interface GmailSyncStatusIndicatorProps {
  /** Display variant: 'banner' for top of dashboard/homepage feeds; 'compact' for headers/strips */
  variant?: 'banner' | 'compact' | 'pill'
  /** Optional custom class name */
  className?: string
  /** Whether to show even if sync is healthy/off (defaults to false: only shows when isDown / delayed / error) */
  showWhenHealthy?: boolean
}

export default function GmailSyncStatusIndicator({
  variant = 'banner',
  className,
  showWhenHealthy = false,
}: GmailSyncStatusIndicatorProps) {
  const { summary, isDown, syncNow, isSyncing } = useGmailHealth()
  const [retryFeedback, setRetryFeedback] = useState<string | null>(null)

  // Don't render if sync is healthy/off unless explicitly asked
  if (!isDown && !showWhenHealthy) {
    return null
  }

  const isError = summary.status === 'error'
  const isStale = summary.status === 'stale'

  const handleRetry = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      setRetryFeedback('Syncing...')
      await syncNow()
      setRetryFeedback('Refreshed!')
      setTimeout(() => setRetryFeedback(null), 3000)
    } catch {
      setRetryFeedback('Retry failed')
      setTimeout(() => setRetryFeedback(null), 4000)
    }
  }

  const lastSyncText = summary.lastSyncAt
    ? `Last synced ${formatDistanceToNow(new Date(summary.lastSyncAt), { addSuffix: true })}`
    : 'No recent successful sync'

  if (variant === 'pill') {
    return (
      <Link
        to="/settings/google"
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-caption font-semibold transition-all shadow-2xs no-underline',
          isError
            ? 'border-casa-error/50 bg-casa-error/10 text-casa-error hover:bg-casa-error/15'
            : isStale
            ? 'border-casa-warning/50 bg-casa-warning/10 text-casa-warning hover:bg-casa-warning/15'
            : 'border-casa-border bg-casa-surface hover:bg-casa-bg text-casa-navy',
          className
        )}
      >
        {isError ? (
          <AlertCircle size={14} className="text-casa-error shrink-0" />
        ) : isStale ? (
          <AlertTriangle size={14} className="text-amber-500 shrink-0" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
        )}
        <span>{summary.label}</span>
      </Link>
    )
  }

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border text-body-sm transition-all',
          isError
            ? 'bg-casa-error/8 border-casa-error/35 text-casa-error'
            : 'bg-casa-warning/8 border-casa-warning/35 text-amber-900 dark:text-amber-200',
          className
        )}
        role="alert"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {isError ? (
            <AlertCircle size={18} className="text-casa-error shrink-0" />
          ) : (
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          )}
          <div className="min-w-0">
            <span className="font-semibold text-body-sm block truncate">
              {summary.label}
            </span>
            <span className="text-caption opacity-80 block truncate">
              {lastSyncText}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRetry}
            disabled={isSyncing}
            className="h-8 px-2.5 text-caption font-semibold gap-1"
          >
            <RefreshCw size={13} className={cn(isSyncing && 'animate-spin')} />
            <span>{retryFeedback ?? 'Retry'}</span>
          </Button>

          <Link
            to="/settings/google"
            className={cn(
              'inline-flex items-center gap-1 px-3 py-1 rounded-lg text-caption font-bold border transition-colors min-h-[32px]',
              isError
                ? 'bg-casa-error text-white border-casa-error hover:bg-rose-700'
                : 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'
            )}
          >
            <span>Fix</span>
            <ChevronRight size={13} />
          </Link>
        </div>
      </div>
    )
  }

  // Default 'banner' variant — optimized for distance-readability on kiosk & clear touch targets on mobile
  return (
    <div
      className={cn(
        'w-full rounded-2xl border p-4 sm:p-4.5 shadow-subtle transition-all duration-200',
        isError
          ? 'bg-rose-50/90 border-rose-200/80 dark:bg-rose-950/20 dark:border-rose-800/50'
          : 'bg-amber-50/90 border-amber-200/80 dark:bg-amber-950/20 dark:border-amber-800/50',
        className
      )}
      role="alert"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        <div className="flex items-start gap-3.5 min-w-0">
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0',
              isError
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
            )}
          >
            {isError ? (
              <AlertCircle size={22} strokeWidth={2} />
            ) : (
              <AlertTriangle size={22} strokeWidth={2} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4
                className={cn(
                  'text-body font-bold tracking-tight',
                  isError
                    ? 'text-rose-900 dark:text-rose-100'
                    : 'text-amber-950 dark:text-amber-100'
                )}
              >
                {isError ? 'Gmail Sync Issue Detected' : 'Gmail Sync Delayed / Not Responding'}
              </h4>
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-2xs font-bold uppercase tracking-wider',
                  isError
                    ? 'bg-rose-200/70 text-rose-800 dark:bg-rose-900/80 dark:text-rose-200'
                    : 'bg-amber-200/70 text-amber-900 dark:bg-amber-900/80 dark:text-amber-200'
                )}
              >
                {summary.label}
              </span>
            </div>

            <p
              className={cn(
                'text-body-sm mt-1 leading-normal',
                isError
                  ? 'text-rose-800/90 dark:text-rose-200/80'
                  : 'text-amber-900/90 dark:text-amber-200/80'
              )}
            >
              {summary.description ?? 'Gmail synchronization is not responding. Automatic event detection is paused.'}
              {summary.errorMessage && (
                <span className="block mt-0.5 text-caption font-mono opacity-85 truncate">
                  Error: {summary.errorMessage}
                </span>
              )}
            </p>

            <p
              className={cn(
                'text-caption mt-1 font-medium',
                isError
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-amber-700 dark:text-amber-400'
              )}
            >
              {lastSyncText}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2.5 sm:self-center shrink-0 pt-1 sm:pt-0 pl-13 sm:pl-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRetry}
            disabled={isSyncing}
            className={cn(
              'min-h-[44px] px-3.5 gap-1.5 font-semibold text-body-sm rounded-xl',
              isError
                ? 'bg-rose-100/80 text-rose-900 hover:bg-rose-200/90 border-rose-300'
                : 'bg-amber-100/80 text-amber-950 hover:bg-amber-200/90 border-amber-300'
            )}
          >
            <RefreshCw size={15} className={cn(isSyncing && 'animate-spin')} />
            <span>{retryFeedback ?? (isSyncing ? 'Syncing...' : 'Sync Now')}</span>
          </Button>

          <Link
            to="/settings/google"
            className={cn(
              'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl text-body-sm font-bold shadow-xs transition-all no-underline',
              isError
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            )}
          >
            <Settings size={15} />
            <span>Fix in Settings</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
