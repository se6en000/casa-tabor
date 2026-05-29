import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import NotificationDrawer from './NotificationDrawer'
import { cn } from '../../utils/cn'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { unreadCount } = useNotifications()

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'relative flex items-center justify-center w-10 h-10 rounded-full transition-colors',
          open ? 'text-casa-gold' : 'text-casa-muted hover:text-casa-navy',
        )}
        aria-label="Notifications"
      >
        <Bell size={22} strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}
