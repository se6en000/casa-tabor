/**
 * MusicPage
 * Unified Household Music Hub with dual-engine streaming:
 *  1. YouTube Music Cast Engine (Option A - Casa LAN Bridge & Supabase Realtime)
 *  2. Spotify Connect Engine (OAuth PKCE)
 *
 * Optimized for full-viewport touch scrolling, auto-discovery of speakers
 * & multi-room groups, and 3-click kiosk navigation.
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Monitor, Speaker, Smartphone, Tv, Music,
  ChevronLeft, RefreshCw, LogOut, Search, Plus, ListMusic, Cast, Check,
  Layers, Coffee, ChefHat, Headphones, Flame, Sparkles
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button, Heading, IconButton, Progress, Input, Chip } from '../components/ui'
import { useSpotify } from '../hooks/useSpotify'
import { useYouTubeCast } from '../hooks/useYouTubeCast'
import {
  getClientId, setClientId, startAuthFlow, handleOAuthCallback,
  clearTokens, isAuthenticated
} from '../lib/spotifyAuth'
import { MOOD_PRESETS, type MoodPreset } from '../lib/youtubeMusicApi'
import type { CastDevice } from '../utils/youtubeCastSync'
import { cn } from '../utils/cn'

// ── Helpers ───────────────────────────────────────────────────────

function fmtTime(ms: number): string {
  if (!ms || isNaN(ms)) return '0:00'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function deviceIcon(device: CastDevice | { type: string; model?: string }) {
  if ('type' in device && device.type === 'group') return Layers
  const t = (('model' in device ? device.model : '') || device.type || '').toLowerCase()
  if (t.includes('computer')) return Monitor
  if (t.includes('speaker') || t.includes('nest') || t.includes('point') || t.includes('cast')) return Speaker
  if (t.includes('phone') || t.includes('mobile')) return Smartphone
  if (t.includes('tv') || t.includes('hub') || t.includes('display')) return Tv
  return Speaker
}

function MoodIcon({ name }: { name: string }) {
  switch (name) {
    case 'Coffee': return <Coffee size={14} className="shrink-0 text-amber-600" />
    case 'ChefHat': return <ChefHat size={14} className="shrink-0 text-amber-500" />
    case 'Headphones': return <Headphones size={14} className="shrink-0 text-indigo-500" />
    case 'Flame': return <Flame size={14} className="shrink-0 text-orange-500" />
    case 'Sparkles': return <Sparkles size={14} className="shrink-0 text-casa-gold" />
    default: return <Music size={14} className="shrink-0 text-casa-gold" />
  }
}

// ── Page Component ────────────────────────────────────────────────

export default function MusicPage() {
  const navigate = useNavigate()
  const [activeEngine, setActiveEngine] = useState<'youtube' | 'spotify'>('youtube')

  // Spotify Auth state
  const authed = isAuthenticated()
  const [callbackDone, setCallbackDone] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      handleOAuthCallback(code).then(ok => {
        window.history.replaceState({}, '', '/music')
        setCallbackDone(ok)
        setActiveEngine('spotify')
      })
    }
  }, [])

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-casa-bg px-4 sm:px-6 pt-4 pb-36 max-w-xl mx-auto w-full flex flex-col select-none">
      {/* Top Header */}
      <header className="flex items-center justify-between pt-2 pb-3 shrink-0">
        <Button type="button" onClick={() => navigate(-1)} variant="ghost" leadingIcon={<ChevronLeft size={20} />}>
          Back
        </Button>
        <Heading role="heading">Music</Heading>
        <div className="w-10" />
      </header>

      {/* Engine Switcher */}
      <div className="flex bg-casa-surface border border-casa-border rounded-xl p-1 mb-5 shadow-sm shrink-0">
        <Button
          type="button"
          variant={activeEngine === 'youtube' ? 'primary' : 'ghost'}
          onClick={() => setActiveEngine('youtube')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-body-sm font-semibold transition-all',
            activeEngine === 'youtube'
              ? 'bg-casa-navy text-white shadow-sm'
              : 'text-casa-muted hover:text-casa-navy'
          )}
          leadingIcon={<Cast size={15} className={activeEngine === 'youtube' ? 'text-casa-gold' : 'text-casa-muted'} />}
        >
          YouTube Cast
        </Button>
        <Button
          type="button"
          variant={activeEngine === 'spotify' ? 'primary' : 'ghost'}
          onClick={() => setActiveEngine('spotify')}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-body-sm font-semibold transition-all',
            activeEngine === 'spotify'
              ? 'bg-casa-navy text-white shadow-sm'
              : 'text-casa-muted hover:text-casa-navy'
          )}
          leadingIcon={<Music size={15} className={activeEngine === 'spotify' ? 'text-emerald-400' : 'text-casa-muted'} />}
        >
          Spotify
        </Button>
      </div>

      {/* Active Engine View */}
      {activeEngine === 'youtube' ? (
        <YouTubeCastPlayerScreen />
      ) : (
        !authed && !callbackDone ? <SpotifySetupScreen /> : <SpotifyPlayerScreen />
      )}
    </div>
  )
}

// ── YouTube Cast Player ───────────────────────────────────────────

function YouTubeCastPlayerScreen() {
  const ytCast = useYouTubeCast()
  const {
    state,
    devices,
    activeDevice,
    queue,
    searching,
    searchResults,
    isDiscovering,
    discoverDevices,
    play,
    pause,
    resume,
    seek,
    setVolume,
    selectDevice,
    addToQueue,
    clearQueue,
    setShuffle,
    setRepeat,
    next,
    previous,
    search,
  } = ytCast

  const [searchQuery, setSearchQuery] = useState('')
  const [showDevices, setShowDevices] = useState(false)
  const [showQueue, setShowQueue] = useState(false)
  const [activeMood, setActiveMood] = useState<string | null>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)

  const track = state.track
  const isPlaying = state.isPlaying
  const progress = state.progressMs
  const duration = state.durationMs || track?.durationMs || 240000
  const progressPct = Math.min((progress / Math.max(1, duration)) * 100, 100)

  // Trigger auto-discovery when user taps "Switch"
  function handleToggleDeviceDrawer() {
    const nextState = !showDevices
    setShowDevices(nextState)
    if (nextState) {
      void discoverDevices()
    }
  }

  function handleSeekClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!progressBarRef.current || !track) return
    const rect = progressBarRef.current.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const posMs = Math.floor(pct * duration)
    void seek(posMs)
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (searchQuery.trim()) {
      setActiveMood(null)
      void search(searchQuery)
    }
  }

  function handleMoodClick(mood: MoodPreset) {
    setActiveMood(mood.id)
    setSearchQuery(mood.label)
    void search(mood.query)
  }

  // Partition devices into Groups and Individual Speakers
  const speakerGroups = devices.filter(d => d.type === 'group')
  const roomSpeakers = devices.filter(d => d.type !== 'group')

  return (
    <div className="space-y-6 flex-1">
      {/* ── Active Cast Speaker Banner with Auto-Discovery Drawer ─────────── */}
      <div className="bg-casa-surface border border-casa-border rounded-xl p-3.5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-casa-gold/15 flex items-center justify-center text-casa-gold shrink-0">
              {activeDevice?.type === 'group' ? <Layers size={20} /> : <Speaker size={20} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <p className="text-body font-semibold text-casa-navy truncate leading-tight">
                  {activeDevice?.name || 'Office Point (Nest Wifi)'}
                </p>
              </div>
              <p className="text-caption text-casa-muted truncate mt-0.5">
                {activeDevice?.type === 'group'
                  ? 'Multi-Room Group · Whole Home Audio'
                  : `${activeDevice?.model || 'Google Cast Speaker'} · LAN Bridge Active`}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant={showDevices ? 'secondary' : 'primary'}
            size="sm"
            onClick={handleToggleDeviceDrawer}
            className="shrink-0 text-caption font-semibold px-3 py-1.5 flex items-center gap-1.5"
            leadingIcon={isDiscovering ? <RefreshCw size={13} className="animate-spin text-casa-gold" /> : undefined}
          >
            {showDevices ? 'Close' : 'Switch'}
          </Button>
        </div>

        {/* ── Google Cast & Multi-Room Groups Discovery Sheet ─────────────── */}
        <AnimatePresence>
          {showDevices && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3.5 pt-3.5 border-t border-casa-border space-y-4 overflow-hidden"
            >
              {/* Auto-Discovery Status Bar */}
              <div className="flex items-center justify-between bg-casa-bg border border-casa-border/80 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <RefreshCw size={14} className={cn('text-casa-gold shrink-0', isDiscovering && 'animate-spin')} />
                  <span className="text-caption font-medium text-casa-navy">
                    {isDiscovering ? 'Scanning Wi-Fi for Google Nest, Chromecasts & Groups…' : 'Cast Devices & Speaker Groups'}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void discoverDevices()}
                  className="text-caption text-casa-gold hover:text-casa-navy p-1 h-auto font-semibold"
                >
                  Rescan
                </Button>
              </div>

              {/* 1. Multi-Room Speaker Groups */}
              {speakerGroups.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 px-1">
                    <Layers size={14} className="text-casa-gold" />
                    <span className="text-caption font-semibold text-casa-muted uppercase tracking-wider">
                      Multi-Room Speaker Groups
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {speakerGroups.map(group => {
                      const isCurrent = group.id === activeDevice?.id
                      return (
                        <Button
                          key={group.id}
                          type="button"
                          variant={isCurrent ? 'secondary' : 'ghost'}
                          onClick={() => {
                            void selectDevice(group.id)
                            setShowDevices(false)
                          }}
                          className={cn(
                            'w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all min-h-[3rem]',
                            isCurrent
                              ? 'border-casa-gold bg-casa-gold/15 text-casa-navy font-semibold shadow-xs'
                              : 'border-casa-border bg-casa-surface hover:border-casa-navy/30 text-casa-navy'
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-casa-gold/20 flex items-center justify-center text-casa-gold shrink-0">
                              <Layers size={16} />
                            </div>
                            <div className="min-w-0 text-left">
                              <p className="text-body-sm font-semibold truncate">{group.name}</p>
                              <p className="text-caption text-casa-muted truncate">
                                {group.groupMembers ? group.groupMembers.join(' · ') : 'Google Home Audio Group'}
                              </p>
                            </div>
                          </div>
                          {isCurrent ? (
                            <div className="flex items-center gap-1.5 shrink-0 bg-emerald-500/15 text-emerald-700 px-2 py-0.5 rounded-full text-caption font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              <span>Active</span>
                            </div>
                          ) : (
                            <Check size={16} className="text-transparent shrink-0" />
                          )}
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 2. Individual Room Speakers */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 px-1">
                  <Speaker size={14} className="text-casa-gold" />
                  <span className="text-caption font-semibold text-casa-muted uppercase tracking-wider">
                    Room Speakers & Smart Displays
                  </span>
                </div>

                <div className="space-y-1.5">
                  {roomSpeakers.map(device => {
                    const isCurrent = device.id === activeDevice?.id
                    const DevIcon = deviceIcon(device)
                    return (
                      <Button
                        key={device.id}
                        type="button"
                        variant={isCurrent ? 'secondary' : 'ghost'}
                        onClick={() => {
                          void selectDevice(device.id)
                          setShowDevices(false)
                        }}
                        className={cn(
                          'w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all min-h-[3rem]',
                          isCurrent
                            ? 'border-casa-gold bg-casa-gold/15 text-casa-navy font-semibold shadow-xs'
                            : 'border-casa-border bg-casa-surface hover:border-casa-navy/30 text-casa-navy'
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                            isCurrent ? 'bg-casa-gold/20 text-casa-gold' : 'bg-casa-bg text-casa-muted'
                          )}>
                            <DevIcon size={16} />
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="text-body-sm font-semibold truncate">{device.name}</p>
                            <p className="text-caption text-casa-muted truncate">
                              {device.model} {device.ip ? `· ${device.ip}` : ''}
                            </p>
                          </div>
                        </div>
                        {isCurrent ? (
                          <div className="flex items-center gap-1.5 shrink-0 bg-emerald-500/15 text-emerald-700 px-2 py-0.5 rounded-full text-caption font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Active</span>
                          </div>
                        ) : (
                          <Check size={16} className="text-transparent shrink-0" />
                        )}
                      </Button>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Album Artwork & Glowing Stage ───────────────────────────────── */}
      <motion.div
        className="relative mx-auto my-2"
        animate={{ scale: isPlaying ? 1 : 0.95 }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
      >
        {track?.albumArtUrl ? (
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-r from-casa-gold/30 to-amber-500/20 rounded-3xl blur-xl opacity-75 group-hover:opacity-100 transition duration-500" />
            <img
              src={track.albumArtUrl}
              alt={track.album}
              className="relative w-60 h-60 sm:w-68 sm:h-68 rounded-2xl shadow-2xl object-cover mx-auto border border-white/20"
            />
          </div>
        ) : (
          <div className="w-60 h-60 sm:w-68 sm:h-68 rounded-2xl bg-casa-surface border border-casa-border flex flex-col items-center justify-center shadow-xl mx-auto">
            <Music size={56} className="text-casa-muted mb-2" />
            <p className="text-caption text-casa-muted font-medium">Select a song below to cast</p>
          </div>
        )}
      </motion.div>

      {/* ── Track Metadata ─────────────────────────────────────────────── */}
      <div className="text-center px-2">
        <p className="font-display text-display-md text-casa-navy leading-tight truncate">
          {track?.name || 'Ready to Cast'}
        </p>
        <p className="text-body text-casa-muted mt-1 truncate">
          {track ? track.artists.join(', ') : 'Search or pick a mood below'}
        </p>
        {track && (
          <p className="text-caption text-casa-muted/70 mt-0.5 truncate">{track.album}</p>
        )}
      </div>

      {/* ── Live Seekbar ────────────────────────────────────────────────── */}
      <div className="px-1">
        <div
          ref={progressBarRef}
          className="cursor-pointer py-2"
          onClick={handleSeekClick}
        >
          <Progress
            value={progressPct}
            aria-label="Track progress"
            className="[&_.casa-progress]:h-2 rounded-full"
          />
        </div>
        <div className="flex justify-between text-caption text-casa-muted tabular-nums mt-0.5">
          <span>{fmtTime(progress)}</span>
          <span>{fmtTime(duration)}</span>
        </div>
      </div>

      {/* ── Primary Transport Controls ──────────────────────────────────── */}
      <div className="flex items-center justify-between px-3">
        <IconButton
          onClick={() => setShuffle(!state.shuffle)}
          variant={state.shuffle ? 'primary' : 'ghost'}
          size="sm"
          icon={<Shuffle size={20} />}
          aria-label="Shuffle"
        />

        <IconButton
          onClick={() => void previous()}
          variant="ghost"
          icon={<SkipBack size={26} fill="currentColor" />}
          aria-label="Previous"
        />

        <IconButton
          onClick={() => (isPlaying ? void pause() : track ? void resume() : void play(searchResults[0]))}
          variant="strong"
          size="lg"
          icon={
            isPlaying ? (
              <Pause size={28} fill="currentColor" />
            ) : (
              <Play size={28} fill="currentColor" className="translate-x-0.5" />
            )
          }
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="w-14 h-14 bg-casa-navy hover:bg-casa-navy/90 text-white rounded-full shadow-lg"
        />

        <IconButton
          onClick={() => void next()}
          variant="ghost"
          icon={<SkipForward size={26} fill="currentColor" />}
          aria-label="Next"
        />

        <IconButton
          onClick={() => setRepeat(state.repeatMode === 0 ? 1 : state.repeatMode === 1 ? 2 : 0)}
          variant={state.repeatMode > 0 ? 'primary' : 'ghost'}
          size="sm"
          icon={state.repeatMode === 2 ? <Repeat1 size={20} /> : <Repeat size={20} />}
          aria-label="Repeat"
        />
      </div>

      {/* ── Nest Speaker Hardware Volume ───────────────────────────────── */}
      <div className="bg-casa-surface border border-casa-border rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-caption font-semibold text-casa-muted uppercase tracking-wider">
            Nest Hardware Volume
          </span>
          <span className="text-caption font-semibold text-casa-navy tabular-nums">
            {state.volumePct}%
          </span>
        </div>
        <div className="flex items-center gap-3">
          <VolumeX
            size={16}
            className="text-casa-muted cursor-pointer hover:text-casa-navy"
            onClick={() => void setVolume(0)}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={state.volumePct}
            onChange={e => void setVolume(Number(e.target.value))}
            className="flex-1 h-2 accent-casa-gold bg-casa-border rounded-lg cursor-pointer"
          />
          <Volume2
            size={16}
            className="text-casa-muted cursor-pointer hover:text-casa-navy"
            onClick={() => void setVolume(80)}
          />
        </div>
      </div>

      {/* ── Search & Mood Stations ─────────────────────────────────────── */}
      <div className="space-y-3 pt-2">
        <form onSubmit={handleSearchSubmit} className="relative">
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search songs, artists, or albums…"
            className="pl-10 pr-24"
          />
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-casa-muted" />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 bg-casa-navy text-white text-caption font-semibold"
          >
            {searching ? 'Finding…' : 'Search'}
          </Button>
        </form>

        {/* Quick Mood Chips (Using Lucide SVG Icons, Zero Emojis) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {MOOD_PRESETS.map(mood => {
            const isSelected = activeMood === mood.id
            return (
              <Chip
                key={mood.id}
                selected={isSelected}
                onClick={() => handleMoodClick(mood)}
                icon={<MoodIcon name={mood.iconName} />}
              >
                <span>{mood.label}</span>
              </Chip>
            )
          })}
        </div>
      </div>

      {/* ── Up Next / Queue Drawer Toggle ───────────────────────────────── */}
      {queue.length > 0 && (
        <div className="bg-casa-surface border border-casa-border rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowQueue(v => !v)}
              className="flex items-center gap-2 text-body-sm font-semibold text-casa-navy p-0 hover:bg-transparent"
              leadingIcon={<ListMusic size={16} className="text-casa-gold" />}
            >
              Up Next ({queue.length})
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void clearQueue()}
              className="text-caption text-red-500 hover:text-red-600"
            >
              Clear
            </Button>
          </div>

          <AnimatePresence>
            {showQueue && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 space-y-2 overflow-hidden border-t border-casa-border pt-2"
              >
                {queue.map((t, i) => (
                  <div key={`${t.id}-${i}`} className="flex items-center justify-between py-1 text-left">
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-medium text-casa-navy truncate">{t.name}</p>
                      <p className="text-caption text-casa-muted truncate">{t.artists.join(', ')}</p>
                    </div>
                    <span className="text-caption text-casa-muted tabular-nums shrink-0 ml-2">
                      {fmtTime(t.durationMs)}
                    </span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Catalog & Search Results List ──────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-caption font-semibold text-casa-muted uppercase tracking-wider px-1">
          {searchQuery ? 'Search Results' : 'Recommended Stations'}
        </p>

        <div className="space-y-2">
          {searchResults.map((t, idx) => (
            <div
              key={t.id || idx}
              className="w-full flex items-center gap-3 bg-casa-surface border border-casa-border rounded-xl px-3.5 py-2.5 shadow-card hover:border-casa-navy/30 transition-all text-left group"
            >
              <Button
                type="button"
                variant="ghost"
                onClick={() => void play(t)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer p-0 h-auto hover:bg-transparent justify-start"
              >
                {t.albumArtUrl ? (
                  <img
                    src={t.albumArtUrl}
                    alt={t.name}
                    className="w-11 h-11 rounded-lg object-cover shrink-0 shadow-sm"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-lg bg-casa-bg flex items-center justify-center shrink-0">
                    <Music size={18} className="text-casa-muted" />
                  </div>
                )}

                <div className="flex-1 min-w-0 text-left">
                  <p className="text-body-sm font-semibold text-casa-navy truncate group-hover:text-casa-gold transition-colors">
                    {t.name}
                  </p>
                  <p className="text-caption text-casa-muted truncate">{t.artists.join(', ')}</p>
                </div>
              </Button>

              <div className="flex items-center gap-1 shrink-0">
                <IconButton
                  onClick={() => void addToQueue(t)}
                  variant="ghost"
                  size="sm"
                  icon={<Plus size={16} />}
                  aria-label="Add to queue"
                  title="Add to queue"
                  className="text-casa-muted hover:text-casa-navy"
                />
                <IconButton
                  onClick={() => void play(t)}
                  variant="ghost"
                  size="sm"
                  icon={<Play size={16} fill="currentColor" />}
                  aria-label="Play now"
                  title="Play now"
                  className="text-casa-navy hover:text-casa-gold"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Spotify Player Screens (Preserved) ─────────────────────────────

function SpotifySetupScreen() {
  const [clientId, setLocalClientId] = useState(getClientId)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  const isLanIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(window.location.hostname)
  const redirectUri = isLanIp
    ? `http://localhost:${window.location.port}/music`
    : `${window.location.origin}/music`

  async function connect() {
    if (!clientId.trim()) { setError('Paste your Spotify Client ID above'); return }
    if (isLanIp) {
      setError('⚠ Spotify blocks HTTP LAN IPs. Open this app via http://localhost:' + window.location.port + ' and connect from there.')
      return
    }
    setError('')
    setConnecting(true)
    setClientId(clientId.trim())
    try {
      await startAuthFlow(clientId.trim())
    } catch (e) {
      setError(String(e))
      setConnecting(false)
    }
  }

  return (
    <div className="flex flex-col max-w-md mx-auto pt-4 flex-1">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-md">
          <Music size={24} className="text-white" />
        </div>
        <div>
          <Heading role="display-md" className="leading-none">Spotify</Heading>
          <p className="text-caption text-casa-muted mt-0.5">Connect to control music</p>
        </div>
      </div>

      <div className="bg-casa-surface rounded-card border border-casa-border shadow-card p-5 space-y-5">
        <div>
          <p className="text-body font-semibold text-casa-navy mb-1">Step 1 — Create a Spotify App</p>
          <p className="text-body-sm text-casa-muted mb-3">
            Go to{' '}
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="text-emerald-600 underline font-medium"
            >
              developer.spotify.com/dashboard
            </a>
            , click <strong>Create App</strong>, set the Redirect URI to:
          </p>
          <code className="block bg-casa-bg border border-casa-border rounded-lg px-3 py-2 text-caption text-casa-navy break-all">
            {redirectUri}
          </code>
          {isLanIp && (
            <p className="text-caption text-amber-600 mt-2 font-semibold">
              ⚠ Spotify requires <code>localhost</code>, not an IP. Open the app at{' '}
              <strong>http://localhost:{window.location.port}</strong> to connect.
            </p>
          )}
          <p className="text-caption text-casa-muted mt-2">
            Copy this URI exactly — including <strong>/music</strong> at the end.
          </p>
        </div>

        <div>
          <p className="text-body font-semibold text-casa-navy mb-1">Step 2 — Paste your Client ID</p>
          <Input
            value={clientId}
            onChange={e => setLocalClientId(e.target.value)}
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          />
          {error && <p className="text-caption text-red-500 mt-1">{error}</p>}
        </div>

        <Button
          type="button"
          variant="primary"
          fullWidth
          onClick={connect}
          disabled={connecting}
          loading={connecting}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
        >
          {connecting ? 'Redirecting to Spotify…' : 'Connect Spotify →'}
        </Button>
      </div>

      <p className="text-caption text-casa-muted text-center mt-6">
        Requires Spotify Premium · PKCE auth · no secrets stored
      </p>
    </div>
  )
}

function SpotifyPlayerScreen() {
  const spotify = useSpotify()
  const { state, devices, playlists, play, pause, next, previous, seek, setVolume, setShuffle, setRepeat, transferTo, playPlaylist, refreshDevices } = spotify
  const [showDevices, setShowDevices] = useState(false)
  const progressBarRef = useRef<HTMLDivElement>(null)

  const track = state?.track
  const isPlaying = state?.isPlaying ?? false
  const progress = state?.progressMs ?? 0
  const duration = track?.durationMs ?? 1
  const progressPct = Math.min((progress / duration) * 100, 100)

  function handleSeekClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!progressBarRef.current || !track) return
    const rect = progressBarRef.current.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    const posMs = Math.floor(pct * track.durationMs)
    void seek(posMs)
  }

  function disconnect() {
    clearTokens()
    window.location.reload()
  }

  return (
    <div className="space-y-6 flex-1">
      <div className="flex justify-end">
        <IconButton
          onClick={disconnect}
          variant="danger"
          size="sm"
          icon={<LogOut size={16} />}
          aria-label="Disconnect Spotify"
          title="Disconnect Spotify"
        />
      </div>

      {/* Album art */}
      <motion.div
        className="mx-auto mb-4"
        animate={{ scale: isPlaying ? 1 : 0.92 }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
      >
        {track?.albumArtUrl ? (
          <img
            src={track.albumArtUrl}
            alt={track.album}
            className="w-60 h-60 rounded-2xl shadow-xl object-cover mx-auto"
          />
        ) : (
          <div className="w-60 h-60 rounded-2xl bg-casa-surface border border-casa-border flex items-center justify-center shadow-xl mx-auto">
            <Music size={60} className="text-casa-muted" />
          </div>
        )}
      </motion.div>

      {/* Track info */}
      <div className="text-center mb-5 px-2">
        <p className="font-display text-display-md text-casa-navy leading-tight truncate">
          {track?.name ?? (spotify.ready ? 'Play something on Spotify' : 'Connecting…')}
        </p>
        <p className="text-body text-casa-muted mt-1 truncate">
          {track ? track.artists.join(', ') : ''}
        </p>
        {track && <p className="text-caption text-casa-muted/70 mt-0.5 truncate">{track.album}</p>}
      </div>

      {/* Progress / seek */}
      {track && (
        <div className="mb-5 px-1">
          <div
            ref={progressBarRef}
            className="cursor-pointer py-1"
            onClick={handleSeekClick}
          >
            <Progress
              value={progressPct}
              aria-label="Track progress"
              className="[&_.casa-progress]:h-1.5"
            />
          </div>
          <div className="flex justify-between mt-1 text-caption text-casa-muted tabular-nums">
            <span>{fmtTime(progress)}</span>
            <span>{fmtTime(duration)}</span>
          </div>
        </div>
      )}

      {/* Playback controls */}
      <div className="flex items-center justify-between mb-6 px-2">
        <IconButton
          onClick={() => setShuffle(!state?.shuffle)}
          variant={state?.shuffle ? 'primary' : 'ghost'}
          size="sm"
          icon={<Shuffle size={20} />}
          aria-label="Shuffle"
        />

        <IconButton onClick={previous} variant="ghost" icon={<SkipBack size={28} fill="currentColor" />} aria-label="Previous track" />

        <IconButton
          onClick={() => isPlaying ? pause() : play()}
          variant="strong"
          size="lg"
          icon={isPlaying
            ? <Pause size={28} fill="currentColor" />
            : <Play size={28} fill="currentColor" className="translate-x-0.5" />
          }
          aria-label={isPlaying ? 'Pause' : 'Play'}
        />

        <IconButton onClick={next} variant="ghost" icon={<SkipForward size={28} fill="currentColor" />} aria-label="Next track" />

        <IconButton
          onClick={() => setRepeat(state?.repeatMode === 0 ? 1 : state?.repeatMode === 1 ? 2 : 0)}
          variant={(state?.repeatMode ?? 0) > 0 ? 'primary' : 'ghost'}
          size="sm"
          icon={state?.repeatMode === 2 ? <Repeat1 size={20} /> : <Repeat size={20} />}
          aria-label="Repeat"
        />
      </div>

      {/* Volume */}
      <div className="flex items-center gap-3 mb-8 px-2">
        <VolumeX size={16} className="text-casa-muted shrink-0" />
        <input
          type="range"
          min={0}
          max={100}
          value={state?.volumePct ?? 80}
          onChange={e => setVolume(Number(e.target.value))}
          className="flex-1 h-1.5 accent-casa-navy"
        />
        <Volume2 size={16} className="text-casa-muted shrink-0" />
      </div>

      {/* Device switcher */}
      <div className="mb-6">
        <Button
          type="button"
          onClick={() => { setShowDevices(v => !v); void refreshDevices() }}
          className="flex items-center gap-2 text-body-sm text-casa-muted hover:text-casa-navy transition-colors w-full text-left"
        >
          <Speaker size={15} className="text-casa-gold" />
          <span className="font-semibold">
            {devices.find(d => d.isActive)?.name ?? 'No active device'}
          </span>
          <RefreshCw size={13} className="ml-auto" />
        </Button>

        <AnimatePresence>
          {showDevices && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 space-y-2 overflow-hidden"
            >
              {devices.length === 0 ? (
                <p className="text-caption text-casa-muted px-1">
                  No devices found. Open Spotify on a device and it will appear here.
                </p>
              ) : (
                devices.map(device => {
                  const DevIcon = deviceIcon(device)
                  return (
                    <Button
                      key={device.id}
                      type="button"
                      onClick={() => transferTo(device.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-card border text-left transition-colors',
                        device.isActive
                          ? 'border-casa-gold bg-casa-gold/5 text-casa-navy'
                          : 'border-casa-border bg-casa-surface hover:border-casa-navy/30 text-casa-navy'
                      )}
                    >
                      <DevIcon size={18} className={device.isActive ? 'text-casa-gold' : 'text-casa-muted'} />
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-semibold truncate">{device.name}</p>
                        <p className="text-caption text-casa-muted">{device.type}</p>
                      </div>
                      {device.isActive && (
                        <span className="text-caption font-semibold text-casa-gold">Playing</span>
                      )}
                    </Button>
                  )
                })
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Playlists */}
      {playlists.length > 0 && (
        <div>
          <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-3">Your Playlists</p>
          <div className="space-y-2">
            {playlists.map(pl => (
              <Button
                key={pl.id}
                type="button"
                onClick={() => playPlaylist(pl.uri)}
                className="w-full flex items-center gap-3 bg-casa-surface border border-casa-border rounded-card px-4 py-3 shadow-card hover:shadow-card-hover transition-shadow text-left"
              >
                {pl.imageUrl ? (
                  <img src={pl.imageUrl} alt={pl.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-casa-bg flex items-center justify-center shrink-0">
                    <Music size={16} className="text-casa-muted" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-semibold text-casa-navy truncate">{pl.name}</p>
                  <p className="text-caption text-casa-muted">{pl.trackCount} tracks</p>
                </div>
                <Play size={16} className="text-casa-muted shrink-0" />
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
