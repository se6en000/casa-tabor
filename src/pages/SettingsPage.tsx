import { Link } from 'react-router-dom'
import { Calendar, Users, Sun, MessageSquare, Bot, ChevronRight, Mail, Music2, Palette } from 'lucide-react'

const sections = [
  { to: '/settings/theme',     icon: Palette,        label: 'Theme & Colors',   desc: 'Accent, background, and custom palettes' },
  { to: '/settings/calendars', icon: Calendar,       label: 'Google Calendars', desc: 'Connect each family member\'s account' },
  { to: '/settings/ai',        icon: Bot,            label: 'AI Settings',      desc: 'Vendor, model, and API key for briefings' },
  { to: '/settings/family',    icon: Users,          label: 'Family',           desc: 'Members, colors, roles' },
  { to: '/settings/display',   icon: Sun,            label: 'Display',          desc: 'Room Tone, brightness lock' },
  { to: '/settings/sms',       icon: MessageSquare,  label: 'Notifications',    desc: 'Twilio SMS, briefing time' },
  { to: '/settings/gmail-scan',icon: Mail,           label: 'Gmail Inbox Scan', desc: 'Auto-import appointments from email' },
  { to: '/music',              icon: Music2,         label: 'Spotify / Music',  desc: 'Connect and control music playback' },
]

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="font-display text-display-md text-casa-navy mb-6">Settings</h1>
      <div className="space-y-2">
        {sections.map(({ to, icon: Icon, label, desc }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-4 bg-casa-surface rounded-card border border-casa-border p-4 shadow-card hover:shadow-card-hover transition-shadow"
          >
            <span className="w-10 h-10 rounded-full bg-casa-bg flex items-center justify-center text-casa-gold">
              <Icon size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-display text-heading text-casa-navy leading-none">{label}</p>
              <p className="text-caption text-casa-muted mt-1">{desc}</p>
            </div>
            <ChevronRight size={18} className="text-casa-muted" />
          </Link>
        ))}
      </div>
    </div>
  )
}