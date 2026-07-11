import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'
import NotificationDrawer from './NotificationDrawer'
import { cn } from '../../utils/cn'
import { Button } from '../ui'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { unreadCount } = useNotifications()

  return (
    <>
      <Button variant="ghost"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'relative flex size-control items-center justify-center rounded-button outline-none transition-colors focus-visible:ring-2 focus-visible:ring-casa-gold',
          open ? 'text-casa-gold' : 'text-casa-muted hover:text-casa-navy',
        )}
        aria-label="Notifications"
      >
        <Bell size={22} strokeWidth={1.8} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-caption font-bold leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      <NotificationDrawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}
