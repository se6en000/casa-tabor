import { Link } from 'react-router-dom'
import { Users, Sun, MessageSquare, Bot, ChevronRight, Music2, Home, Activity, BookmarkCheck, Layers, Lock } from 'lucide-react'
import BounceScroll from '../components/shared/BounceScroll'

const sections = [
  { to: '/settings/display', icon: Sun,           label: 'Display & Art Mode',      desc: 'Theme colors, room tone, brightness, art mode, sensors' },
  { to: '/settings/home',   icon: Home,           label: 'Home & Profile',          desc: 'Home address and home screen layout configuration' },
  { to: '/settings/google',  icon: Layers,        label: 'Google Services',         desc: 'Calendar sync + Gmail inbox scan — one auth per member' },
  { to: '/settings/ai',      icon: Bot,           label: 'AI Settings',             desc: 'Vendor, model, and API key for briefings' },
  { to: '/settings/family',  icon: Users,         label: 'Family',                  desc: 'Members, colors, roles' },
  { to: '/settings/places',  icon: BookmarkCheck, label: 'Saved Places & Contacts', desc: 'Favorite locations and people the AI can look up by nickname' },
  { to: '/settings/sms',     icon: MessageSquare, label: 'Notifications',           desc: 'Twilio SMS, briefing time' },
  { to: '/settings/music',   icon: Music2,        label: 'Spotify / Music',         desc: 'Connect and control music playback' },
  { to: '/settings/admin-ops', icon: Lock,        label: 'Admin Operations',        desc: 'Mass calendar operations (delete, add, edit) — admin-only' },
  { to: '/settings/status',  icon: Activity,      label: 'Status Dashboard',        desc: 'AI usage, tokens, and cost monitoring' },
]

export default function SettingsPage() {
  return (
    <BounceScroll className="flex-1">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="font-display text-display-md text-casa-navy mb-6">Settings</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sections.map(({ to, icon: Icon, label, desc }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-4 bg-casa-surface rounded-card border border-casa-border p-4 shadow-card hover:shadow-card-hover transition-shadow"
            >
              <span className="w-10 h-10 rounded-full bg-casa-bg flex items-center justify-center text-casa-gold flex-shrink-0">
                <Icon size={18} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-display text-heading text-casa-navy leading-none">{label}</p>
                <p className="text-caption text-casa-muted mt-1">{desc}</p>
              </div>
              <ChevronRight size={18} className="text-casa-muted flex-shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </BounceScroll>
  )
}