/**
 * MiniPlayer
 * Luxury Multi-Room Household Audio Widget for Home & Kiosk.
 * Seamlessly manages Google Cast speakers, Multi-Room groups, and Spotify.
 * Displays live now-playing metadata, speaker routing, hardware volume, and "+ Add Speakers" multi-room drawer.
 */

import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Play, Pause, SkipForward, SkipBack, Music, Cast,
  Speaker, Layers, Volume2, VolumeX, RefreshCw, Check,
  Plus, ChevronRight
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSpotify } from '../../hooks/useSpotify'
import { useYouTubeCast } from '../../hooks/useYouTubeCast'
import { Button, IconButton, Progress } from '../ui'
import type { CastDevice } from '../../utils/youtubeCastSync'
import { cn } from '../../utils/cn'

function fmtTime(ms: number): string {
  if (!ms || isNaN(ms)) return '0:00'
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function deviceIcon(device: CastDevice | { type: string; model?: string }) {
  if ('type' in device && device.type === 'group') return Layers
  return Speaker
}

export default function MiniPlayer() {
  const navigate = useNavigate()
  const spotify = useSpotify()
  const ytCast = useYouTubeCast()
  const [showMultiRoomSheet, setShowMultiRoomSheet] = useState(false)
  const progressBarRef = useRef<HTMLDivElement>(null)

  // Determine active streaming engine
  const isYtPlaying = ytCast.state.isPlaying
  const hasYtTrack = Boolean(ytCast.state.track)
  const isSpotifyPlaying = spotify.state?.isPlaying ?? false

  const useYt = isYtPlaying || (hasYtTrack && !isSpotifyPlaying)
  
  const track = useYt ? ytCast.state.track : spotify.state?.track
  const isPlaying = useYt ? ytCast.state.isPlaying : isSpotifyPlaying
  const progressMs = useYt ? ytCast.state.progressMs : (spotify.state?.progressMs ?? 0)
  const durationMs = useYt ? (ytCast.state.durationMs || 240000) : (track?.durationMs ?? 1)
  const progressPct = track ? Math.min((progressMs / Math.max(1, durationMs)) * 100, 100) : 0

  const activeDeviceName = useYt
    ? (ytCast.state.activeDeviceName || ytCast.activeDevice?.name || 'Office Point (Nest Wifi)')
    : (spotify.devices.find(d => d.isActive)?.name || 'Spotify Connect')

  const activeDeviceIds = ytCast.activeDeviceIds || []
  const speakerGroups = ytCast.devices.filter(d => d.type === 'group')
  const roomSpeakers = ytCast.devices.filter(d => d.type !== 'group')

  function handlePlayPause(e: React.MouseEvent) {
    e.stopPropagation()
    if (useYt) {
      if (isPlaying) void ytCast.pause()
      else if (ytCast.state.track) void ytCast.resume()
      else if (ytCast.searchResults[0]) void ytCast.play(ytCast.searchResults[0])
    } else {
      if (isPlaying) void spotify.pause()
      else void spotify.play()
    }
  }

  function handleNext(e: React.MouseEvent) {
    e.stopPropagation()
    if (useYt) {
      void ytCast.next()
    } else {
      void spotify.next()
    }
  }

  function handlePrevious(e: React.MouseEvent) {
    e.stopPropagation()
    if (useYt) {
      void ytCast.previous()
    } else {
      void spotify.previous()
    }
  }

  function handleSeekClick(e: React.MouseEvent<HTMLDivElement>) {
    e.stopPropagation()
    if (!progressBarRef.current || !track) return
    const rect = progressBarRef.current.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const posMs = Math.floor(pct * durationMs)
    if (useYt) {
      void ytCast.seek(posMs)
    } else {
      void spotify.seek(posMs)
    }
  }

  // ── Standby / Idle Gateway View ───────────────────────────────────────────
  if (!track) {
    return (
      <div
        onClick={() => navigate('/music')}
        className="w-full bg-casa-surface rounded-card border border-casa-border shadow-card hover:border-casa-gold/50 transition-all cursor-pointer overflow-hidden p-3.5 group"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-casa-gold/15 flex items-center justify-center text-casa-gold shrink-0 group-hover:scale-105 transition-transform">
              <Music size={20} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-body-sm font-semibold text-casa-navy truncate leading-tight group-hover:text-casa-gold transition-colors">
                  Household Audio & Cast
                </p>
              </div>
              <p className="text-caption text-casa-muted truncate mt-0.5">
                Ready on {activeDeviceName} · Google Cast & Spotify
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                if (ytCast.searchResults[0]) {
                  void ytCast.play(ytCast.searchResults[0])
                } else {
                  navigate('/music')
                }
              }}
              className="text-caption font-semibold flex items-center gap-1 px-3 py-1.5"
              leadingIcon={<Play size={13} fill="currentColor" />}
            >
              Play Music
            </Button>
            <ChevronRight size={16} className="text-casa-muted group-hover:text-casa-navy group-hover:translate-x-0.5 transition-all ml-1" />
          </div>
        </div>
      </div>
    )
  }

  // ── Active Multi-Room Streaming View ──────────────────────────────────────
  return (
    <div className="bg-casa-surface rounded-card border border-casa-border shadow-card overflow-hidden transition-all select-none">
      {/* Top Bar: Active Speaker Routing & Add Speakers */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-casa-bg border-b border-casa-border">
        <div
          onClick={() => navigate('/music')}
          className="flex items-center gap-2 min-w-0 cursor-pointer group"
        >
          <div className="w-6 h-6 rounded-md bg-casa-gold/20 flex items-center justify-center text-casa-gold shrink-0">
            {useYt ? <Cast size={13} /> : <Music size={13} />}
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-caption font-semibold text-casa-navy truncate group-hover:text-casa-gold transition-colors">
              {activeDeviceName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            variant={showMultiRoomSheet ? 'secondary' : 'ghost'}
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setShowMultiRoomSheet(!showMultiRoomSheet)
              if (!showMultiRoomSheet) {
                void ytCast.discoverDevices()
              }
            }}
            className="text-caption font-semibold px-2.5 py-1 h-auto flex items-center gap-1 text-casa-gold hover:text-casa-navy border border-casa-border/60 bg-casa-surface"
            leadingIcon={<Plus size={12} />}
          >
            Add Speakers
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/music')}
            className="text-caption font-semibold px-2 py-1 h-auto text-casa-muted hover:text-casa-navy"
          >
            Hub →
          </Button>
        </div>
      </div>

      {/* Multi-Room Speaker Selection Drawer */}
      <AnimatePresence>
        {showMultiRoomSheet && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3.5 bg-casa-surface border-b border-casa-border space-y-3 overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <span className="text-caption font-semibold text-casa-muted uppercase tracking-wider">
                Multi-Room Cast Routing
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void ytCast.discoverDevices()}
                className="text-caption text-casa-gold p-0 h-auto font-semibold flex items-center gap-1"
              >
                <RefreshCw size={11} className={ytCast.isDiscovering ? 'animate-spin' : ''} />
                <span>Rescan</span>
              </Button>
            </div>

            {/* Whole-Home Speaker Groups */}
            {speakerGroups.length > 0 && (
              <div className="space-y-1.5">
                {speakerGroups.map(group => {
                  const isCurrent = group.id === ytCast.state.activeDeviceId
                  return (
                    <Button
                      key={group.id}
                      type="button"
                      variant={isCurrent ? 'secondary' : 'ghost'}
                      onClick={() => {
                        void ytCast.selectDevice(group.id)
                        setShowMultiRoomSheet(false)
                      }}
                      className={cn(
                        'w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all',
                        isCurrent
                          ? 'border-casa-gold bg-casa-gold/15 text-casa-navy font-semibold shadow-xs'
                          : 'border-casa-border bg-casa-bg hover:border-casa-navy/30 text-casa-navy'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Layers size={16} className="text-casa-gold shrink-0" />
                        <div className="min-w-0">
                          <p className="text-body-sm font-semibold truncate">{group.name}</p>
                          <p className="text-3xs text-casa-muted truncate">{group.groupMembers?.join(' · ') || 'Multi-Room Group'}</p>
                        </div>
                      </div>
                      {isCurrent && <Check size={14} className="text-emerald-600 shrink-0" />}
                    </Button>
                  )
                })}
              </div>
            )}

            {/* Individual Room Speakers */}
            <div className="space-y-1.5">
              {roomSpeakers.map(speaker => {
                const isActive = activeDeviceIds.includes(speaker.id) || speaker.id === ytCast.state.activeDeviceId
                const DevIcon = deviceIcon(speaker)
                return (
                  <Button
                    key={speaker.id}
                    type="button"
                    variant={isActive ? 'secondary' : 'ghost'}
                    onClick={() => {
                      void ytCast.toggleSpeaker(speaker.id)
                    }}
                    className={cn(
                      'w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all',
                      isActive
                        ? 'border-casa-gold bg-casa-gold/15 text-casa-navy font-semibold shadow-xs'
                        : 'border-casa-border bg-casa-bg hover:border-casa-navy/30 text-casa-navy'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <DevIcon size={16} className={isActive ? 'text-casa-gold' : 'text-casa-muted'} />
                      <div className="min-w-0">
                        <p className="text-body-sm font-semibold truncate">{speaker.name}</p>
                        <p className="text-3xs text-casa-muted truncate">{speaker.model} {speaker.ip ? `· ${speaker.ip}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isActive ? (
                        <div className="flex items-center gap-1 bg-emerald-500/15 text-emerald-700 px-2 py-0.5 rounded-full text-3xs font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Playing</span>
                        </div>
                      ) : (
                        <span className="text-3xs font-semibold text-casa-muted hover:text-casa-navy">+ Add</span>
                      )}
                    </div>
                  </Button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Track & Transport Bar */}
      <div className="p-3.5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {/* Album Artwork */}
          <div
            onClick={() => navigate('/music')}
            className="shrink-0 relative cursor-pointer group"
          >
            {track?.albumArtUrl ? (
              <img
                src={track.albumArtUrl}
                alt={track.album}
                className="w-13 h-13 rounded-xl object-cover shadow-sm group-hover:scale-105 transition-transform"
              />
            ) : (
              <div className="w-13 h-13 rounded-xl bg-casa-bg flex items-center justify-center">
                <Music size={22} className="text-casa-muted" />
              </div>
            )}
          </div>

          {/* Track Info */}
          <div
            onClick={() => navigate('/music')}
            className="flex-1 min-w-0 cursor-pointer group"
          >
            <p className="font-body font-bold text-casa-navy text-body truncate leading-tight group-hover:text-casa-gold transition-colors">
              {track.name}
            </p>
            <p className="text-body-sm text-casa-muted truncate mt-0.5">
              {track.artists.join(', ')}
            </p>
            <p className="text-3xs text-casa-muted/70 truncate mt-0.5">
              {track.album}
            </p>
          </div>

          {/* Transport Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <IconButton
              variant="ghost"
              size="sm"
              onClick={handlePrevious}
              aria-label="Previous track"
              icon={<SkipBack size={18} fill="currentColor" />}
              className="text-casa-muted hover:text-casa-navy"
            />
            <IconButton
              variant="strong"
              size="md"
              onClick={handlePlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              icon={
                isPlaying ? (
                  <Pause size={20} fill="currentColor" />
                ) : (
                  <Play size={20} fill="currentColor" className="translate-x-0.5" />
                )
              }
              className="w-11 h-11 bg-casa-navy hover:bg-casa-navy/90 text-white rounded-full shadow-md"
            />
            <IconButton
              variant="ghost"
              size="sm"
              onClick={handleNext}
              aria-label="Next track"
              icon={<SkipForward size={18} fill="currentColor" />}
              className="text-casa-muted hover:text-casa-navy"
            />
          </div>
        </div>

        {/* Live Seekbar */}
        <div className="px-0.5">
          <div
            ref={progressBarRef}
            className="cursor-pointer py-1"
            onClick={handleSeekClick}
          >
            <Progress
              value={progressPct}
              aria-label="Track progress"
              className="[&_.casa-progress]:h-1.5 rounded-full"
            />
          </div>
          <div className="flex justify-between text-3xs text-casa-muted tabular-nums mt-0.5">
            <span>{fmtTime(progressMs)}</span>
            <span>{fmtTime(durationMs)}</span>
          </div>
        </div>

        {/* Hardware Volume Slider */}
        <div className="flex items-center gap-2 pt-1 border-t border-casa-border/50">
          <VolumeX
            size={14}
            className="text-casa-muted cursor-pointer hover:text-casa-navy shrink-0"
            onClick={() => {
              if (useYt) void ytCast.setVolume(0)
              else void spotify.setVolume(0)
            }}
          />
          <input
            type="range"
            min={0}
            max={100}
            value={useYt ? ytCast.state.volumePct : (spotify.state?.volumePct ?? 50)}
            onChange={e => {
              const val = Number(e.target.value)
              if (useYt) void ytCast.setVolume(val)
              else void spotify.setVolume(val)
            }}
            className="flex-1 h-1.5 accent-casa-gold bg-casa-border rounded-lg cursor-pointer"
          />
          <Volume2
            size={14}
            className="text-casa-muted cursor-pointer hover:text-casa-navy shrink-0"
            onClick={() => {
              if (useYt) void ytCast.setVolume(80)
              else void spotify.setVolume(80)
            }}
          />
          <span className="text-3xs font-semibold text-casa-navy tabular-nums w-8 text-right shrink-0">
            {useYt ? ytCast.state.volumePct : (spotify.state?.volumePct ?? 50)}%
          </span>
        </div>
      </div>
    </div>
  )
}
