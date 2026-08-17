import { Link, useNavigate } from 'react-router-dom'
import {
  ShoppingCart,
  Users,
  MapPin,
  RefreshCw,
  ChevronRight,
  Sun,
  Palette,
  Brain,
  MessageSquare,
  ChefHat,
  Cpu,
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
              Family & Members
            </div>
            <div className="text-2xs text-casa-muted truncate mt-0.5">
              {familyCount} active profiles
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

        {/* Food Profile */}
        <div
          onClick={() => navigate('/settings/food-profile')}
          className="flex flex-col p-4 rounded-2xl bg-casa-surface border border-casa-border shadow-2xs hover:border-casa-gold active:scale-[0.98] transition-all cursor-pointer min-h-[115px] justify-between"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 shrink-0">
            <ChefHat size={19} strokeWidth={1.9} />
          </div>
          <div className="mt-3">
            <div className="text-body-sm font-bold text-casa-navy truncate">
              Food & Dietary
            </div>
            <div className="text-2xs text-casa-muted truncate mt-0.5">
              Budget & meal goals
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
              Calendar & Gmail sync
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Quick System Shortcuts ── */}
      <div className="flex flex-col gap-1.5 mt-2">
        <span className="text-caption font-bold uppercase tracking-wider text-casa-muted px-1">
          Household Preferences
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
            onClick={() => navigate('/settings/memory')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-casa-bg active:bg-casa-bg transition-colors text-left rounded-none"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Brain size={17} className="text-rose-500 shrink-0" />
              <span className="text-body-sm font-semibold text-casa-navy truncate">Household Memory & Projects</span>
            </div>
            <ChevronRight size={16} className="text-casa-muted shrink-0" />
          </Button>

          <Button
            variant="ghost"
            onClick={() => navigate('/settings/sms')}
            className="w-full flex items-center justify-between p-3.5 hover:bg-casa-bg active:bg-casa-bg transition-colors text-left rounded-none"
          >
            <div className="flex items-center gap-3 min-w-0">
              <MessageSquare size={17} className="text-cyan-500 shrink-0" />
              <span className="text-body-sm font-semibold text-casa-navy truncate">SMS Briefings & Alerts</span>
            </div>
            <ChevronRight size={16} className="text-casa-muted shrink-0" />
          </Button>
        </div>
      </div>

      {/* ── 4. Advanced & Diagnostics Mode Entry ── */}
      <div className="mt-2">
        <div
          onClick={() => navigate('/settings/ai')}
          className="flex items-center justify-between p-4 rounded-2xl bg-casa-bg border border-casa-border/80 shadow-2xs hover:border-casa-gold active:scale-[0.99] transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-casa-navy/10 flex items-center justify-center text-casa-navy shrink-0">
              <Cpu size={20} strokeWidth={1.9} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-body-sm font-bold text-casa-navy truncate">
                  Advanced & Diagnostics
                </span>
                <span className="text-2xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-casa-gold/20 text-casa-navy shrink-0">
                  Dev
                </span>
              </div>
              <div className="text-caption text-casa-muted truncate">
                AI routing, token costs, telemetry & admin ops
              </div>
            </div>
          </div>
          <ChevronRight size={18} className="text-casa-muted shrink-0 ml-2" />
        </div>
      </div>
    </div>
  )
}
