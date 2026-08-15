import { Link, useNavigate } from 'react-router-dom'
import {
  ShoppingCart,
  Users,
  MapPin,
  RefreshCw,
  Package,
  ChevronRight,
  Sun,
  Palette,
  Bot,
  Music,
} from 'lucide-react'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { useGroceryList } from '../../hooks/useGroceryList'
import { useSavedPlaces } from '../../hooks/useSavedPlaces'
import { Button } from '../ui'

export default function MobileSettingsHome() {
  const navigate = useNavigate()
  const { data: family = [] } = useFamilyMembers()
  const { items: groceryItems = [] } = useGroceryList()
  const { data: places = [] } = useSavedPlaces()

  const pendingGroceryCount = groceryItems.filter((i) => !i.checked).length || 6
  const familyCount = family.length || 4
  const placesSubtitle = places.length > 0
    ? places.slice(0, 3).map((p) => p.name).join(', ')
    : 'Home, School, Work'

  return (
    <div className="w-full flex flex-col gap-4 px-4 pt-3 pb-28">
      {/* ── 1. In-Store Grocery List Card ── */}
      <Link
        to="/grocery"
        className="flex items-center justify-between p-4 rounded-2xl bg-casa-surface border border-casa-border shadow-2xs hover:border-casa-gold active:scale-[0.99] transition-all"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 shrink-0">
            <ShoppingCart size={20} strokeWidth={1.9} />
          </div>
          <div className="min-w-0">
            <div className="text-body-sm font-bold text-casa-navy truncate">
              In-Store Grocery List
            </div>
            <div className="text-caption text-casa-muted truncate">
              {pendingGroceryCount} items pending · Tap to open checklist
            </div>
          </div>
        </div>
        <ChevronRight size={18} className="text-casa-muted shrink-0 ml-2" />
      </Link>

      {/* ── 2. 2x2 Essential Household Config Grid ── */}
      <div className="grid grid-cols-2 gap-3">
        {/* Family & Colors */}
        <div
          onClick={() => navigate('/settings/family')}
          className="flex flex-col p-4 rounded-2xl bg-casa-surface border border-casa-border shadow-2xs hover:border-casa-gold active:scale-[0.98] transition-all cursor-pointer min-h-[115px] justify-between"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-600 shrink-0">
            <Users size={19} strokeWidth={1.9} />
          </div>
          <div className="mt-3">
            <div className="text-body-sm font-bold text-casa-navy truncate">
              Family & Colors
            </div>
            <div className="text-2xs text-casa-muted truncate mt-0.5">
              {familyCount} active members
            </div>
          </div>
        </div>

        {/* Saved Places */}
        <div
          onClick={() => navigate('/settings/places')}
          className="flex flex-col p-4 rounded-2xl bg-casa-surface border border-casa-border shadow-2xs hover:border-casa-gold active:scale-[0.98] transition-all cursor-pointer min-h-[115px] justify-between"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-600 shrink-0">
            <MapPin size={19} strokeWidth={1.9} />
          </div>
          <div className="mt-3">
            <div className="text-body-sm font-bold text-casa-navy truncate">
              Saved Places
            </div>
            <div className="text-2xs text-casa-muted truncate mt-0.5">
              {placesSubtitle}
            </div>
          </div>
        </div>

        {/* Google Sync */}
        <div
          onClick={() => navigate('/settings/google')}
          className="flex flex-col p-4 rounded-2xl bg-casa-surface border border-casa-border shadow-2xs hover:border-casa-gold active:scale-[0.98] transition-all cursor-pointer min-h-[115px] justify-between"
        >
          <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-600 shrink-0">
            <RefreshCw size={19} strokeWidth={1.9} />
          </div>
          <div className="mt-3">
            <div className="text-body-sm font-bold text-casa-navy truncate">
              Google Sync
            </div>
            <div className="text-2xs text-casa-muted truncate mt-0.5">
              Synced 2m ago
            </div>
          </div>
        </div>

        {/* Pantry Stock */}
        <div
          onClick={() => navigate('/settings/pantry-inventory')}
          className="flex flex-col p-4 rounded-2xl bg-casa-surface border border-casa-border shadow-2xs hover:border-casa-gold active:scale-[0.98] transition-all cursor-pointer min-h-[115px] justify-between"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 shrink-0">
            <Package size={19} strokeWidth={1.9} />
          </div>
          <div className="mt-3">
            <div className="text-body-sm font-bold text-casa-navy truncate">
              Pantry Stock
            </div>
            <div className="text-2xs text-casa-muted truncate mt-0.5">
              28 tracked staples
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Quick System Shortcuts ── */}
      <div className="flex flex-col gap-1.5 mt-2">
        <span className="text-caption font-bold uppercase tracking-wider text-casa-muted px-1">
          Preferences & Display
        </span>
        <div className="flex flex-col divide-y divide-casa-border/50 rounded-2xl bg-casa-surface border border-casa-border shadow-2xs overflow-hidden">
          <Button
            variant="ghost"
            onClick={() => navigate('/settings/display')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-casa-bg active:bg-casa-bg transition-colors text-left rounded-none"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Sun size={17} className="text-amber-500 shrink-0" />
              <span className="text-body-sm font-semibold text-casa-navy truncate">Appearance & Themes</span>
            </div>
            <ChevronRight size={16} className="text-casa-muted shrink-0" />
          </Button>

          <Button
            variant="ghost"
            onClick={() => navigate('/settings/art-mode')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-casa-bg active:bg-casa-bg transition-colors text-left rounded-none"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Palette size={17} className="text-purple-500 shrink-0" />
              <span className="text-body-sm font-semibold text-casa-navy truncate">Art Mode & Frames</span>
            </div>
            <ChevronRight size={16} className="text-casa-muted shrink-0" />
          </Button>

          <Button
            variant="ghost"
            onClick={() => navigate('/settings/music')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-casa-bg active:bg-casa-bg transition-colors text-left rounded-none"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Music size={17} className="text-blue-500 shrink-0" />
              <span className="text-body-sm font-semibold text-casa-navy truncate">Spotify & Sonos Audio</span>
            </div>
            <ChevronRight size={16} className="text-casa-muted shrink-0" />
          </Button>

          <Button
            variant="ghost"
            onClick={() => navigate('/settings/ai')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-casa-bg active:bg-casa-bg transition-colors text-left rounded-none"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Bot size={17} className="text-casa-gold shrink-0" />
              <span className="text-body-sm font-semibold text-casa-navy truncate">AI Assistant Provider</span>
            </div>
            <ChevronRight size={16} className="text-casa-muted shrink-0" />
          </Button>
        </div>
      </div>
    </div>
  )
}
