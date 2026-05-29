import { formatDistanceToNow } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarPlus, CalendarCheck, Sparkles, Mail, AlertTriangle,
  Sun, X, CheckCheck, Trash2, ChevronRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useNotifications, type Notification } from '../../hooks/useNotifications'
import { cn } from '../../utils/cn'

const TYPE_CONFIG: Record<Notification['type'], { icon: React.ElementType; color: string; bg: string }> = {
  event_added:    { icon: CalendarPlus,  color: 'text-emerald-600',  bg: 'bg-emerald-50' },
  event_updated:  { icon: CalendarCheck, color: 'text-blue-600',     bg: 'bg-blue-50' },
  event_enriched: { icon: Sparkles,      color: 'text-casa-gold',    bg: 'bg-amber-50' },
  gmail_import:   { icon: Mail,          color: 'text-purple-600',   bg: 'bg-purple-50' },
  conflict:       { icon: AlertTriangle, color: 'text-red-500',      bg: 'bg-red-50' },
  briefing_ready: { icon: Sun,           color: 'text-orange-500',   bg: 'bg-orange-50' },
}

const SOURCE_LABEL: Record<string, string> = {
  ai:          'via AI',
  gmail:       'via Gmail',
  sms:         'via SMS',
  google_sync: 'via Google',
  system:      '',
  manual:      '',
}

interface Props {
  open: boolean
  onClose: () => void
}

export default function NotificationDrawer({ open, onClose }: Props) {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications()
  const navigate = useNavigate()

  function handleClick(n: Notification) {
    if (!n.read) markRead.mutate(n.id)
    if (n.event_id) {
      navigate('/calendar')
      onClose()
    } else if (n.type === 'briefing_ready') {
      navigate('/briefing')
      onClose()
    } else if (n.type === 'gmail_import') {
      navigate('/settings/gmail-scan')
      onClose()
    } else if (n.type === 'conflict') {
      navigate('/')
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />

          {/* Side panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="fixed top-0 right-0 bottom-0 z-50 bg-casa-surface shadow-2xl border-l border-casa-border w-[min(380px,90vw)] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-casa-border">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-heading text-casa-navy">Notifications</h2>
                {unreadCount > 0 && (
                  <span className="text-xs font-bold bg-red-500 text-white rounded-full px-2 py-0.5">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllRead.mutate()}
                    className="flex items-center gap-1 text-caption text-casa-muted hover:text-casa-navy transition-colors"
                  >
                    <CheckCheck size={14} />
                    <span>Mark all read</span>
                  </button>
                )}
                {notifications.some(n => n.read) && (
                  <button
                    onClick={() => clearAll.mutate()}
                    className="flex items-center gap-1 text-caption text-casa-muted hover:text-red-500 transition-colors ml-2"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <button onClick={onClose} className="ml-2 text-casa-muted hover:text-casa-navy">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Feed */}
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-casa-muted text-body">
                  No notifications yet
                </div>
              ) : (
                <ul>
                  {notifications.map((n) => {
                    const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.event_added
                    const Icon = cfg.icon
                    const sourceLabel = SOURCE_LABEL[n.source ?? ''] ?? ''
                    const isClickable = !!(n.event_id || ['briefing_ready', 'gmail_import', 'conflict'].includes(n.type))

                    return (
                      <li key={n.id}>
                        <div
                          role={isClickable ? 'button' : undefined}
                          tabIndex={isClickable ? 0 : undefined}
                          onClick={() => handleClick(n)}
                          onKeyDown={e => e.key === 'Enter' && handleClick(n)}
                          className={cn(
                            'w-full flex items-start gap-3 px-5 py-3.5 text-left transition-colors border-b border-casa-border/50 last:border-0',
                            n.read ? 'bg-transparent' : 'bg-amber-50/40',
                            isClickable ? 'hover:bg-casa-bg/60 cursor-pointer' : 'cursor-default',
                          )}
                        >
                          {/* Unread dot */}
                          <div className="mt-1 w-2 flex-shrink-0">
                            {!n.read && <span className="block w-2 h-2 rounded-full bg-red-500" />}
                          </div>

                          {/* Icon */}
                          <span className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', cfg.bg)}>
                            <Icon size={15} className={cfg.color} />
                          </span>

                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-body leading-snug', n.read ? 'text-casa-muted' : 'text-casa-navy font-medium')}>
                              {n.body ?? n.title}
                              {sourceLabel && (
                                <span className="ml-1.5 text-caption text-casa-muted font-normal">{sourceLabel}</span>
                              )}
                            </p>
                            <p className="text-caption text-casa-muted mt-0.5">
                              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                            </p>
                          </div>

                          {isClickable && (
                            <ChevronRight size={16} className="text-casa-muted flex-shrink-0 mt-1" />
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
