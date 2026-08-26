/**
 * MiniPlayer
 * Compact now-playing widget for the Home screen.
 * Seamlessly supports both YouTube Music (Google Cast) and Spotify Connect.
 * Always provides an ambient, 1-click gateway to the household music hub (/music).
 */

import { useNavigate } from 'react-router-dom'
import { Play, Pause, SkipForward, Music, Cast, ChevronRight } from 'lucide-react'
import { useSpotify } from '../../hooks/useSpotify'
import { useYouTubeCast } from '../../hooks/useYouTubeCast'
import { Button, Progress } from '../ui'

export default function MiniPlayer() {
  const navigate = useNavigate()
  const spotify = useSpotify()
  const ytCast = useYouTubeCast()

  // Determine active source
  const isYtPlaying = ytCast.state.isPlaying
  const hasYtTrack = Boolean(ytCast.state.track)
  const isSpotifyPlaying = spotify.state?.isPlaying ?? false

  // Prioritize whichever engine is actively streaming
  const useYt = isYtPlaying || (hasYtTrack && !isSpotifyPlaying)
  
  const track = useYt ? ytCast.state.track : spotify.state?.track
  const isPlaying = useYt ? ytCast.state.isPlaying : isSpotifyPlaying
  const progressMs = useYt ? ytCast.state.progressMs : (spotify.state?.progressMs ?? 0)
  const durationMs = useYt ? (ytCast.state.durationMs || 240000) : (track?.durationMs ?? 1)
  const progressPct = track ? Math.min((progressMs / Math.max(1, durationMs)) * 100, 100) : 0

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

  // ── Idle / Standby State — Renders Luxury Ambient Gateway to Music ──────────
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
                Ready on {ytCast.activeDevice?.name || 'Office Point'} · Tap to play
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

  // ── Active Track Streaming State ────────────────────────────────────────────
  return (
    <div
      onClick={() => navigate('/music')}
      className="bg-casa-surface rounded-card border border-casa-border shadow-card overflow-hidden cursor-pointer hover:border-casa-navy/30 transition-colors"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Album art */}
        <div className="shrink-0 relative group">
          {track?.albumArtUrl ? (
            <img
              src={track.albumArtUrl}
              alt={track.album}
              className="w-11 h-11 rounded-lg object-cover shadow-sm"
            />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-casa-bg flex items-center justify-center">
              <Music size={18} className="text-casa-muted" />
            </div>
          )}
          {useYt && (
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-casa-navy flex items-center justify-center text-casa-gold shadow-xs">
              <Cast size={9} />
            </div>
          )}
        </div>

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <p className="font-body font-semibold text-casa-navy text-body-sm truncate leading-tight">
            {track.name}
          </p>
          <p className="text-caption text-casa-muted truncate">
            {track.artists.join(', ')}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <Button
            variant="ghost"
            type="button"
            onClick={handlePlayPause}
            className="size-control rounded-button flex items-center justify-center text-casa-navy hover:bg-casa-bg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-casa-gold"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
          </Button>
          <Button
            variant="ghost"
            type="button"
            onClick={handleNext}
            className="size-control rounded-button flex items-center justify-center text-casa-muted hover:text-casa-navy hover:bg-casa-bg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-casa-gold"
            aria-label="Next"
          >
            <SkipForward size={18} />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {track && (
        <Progress
          value={progressPct}
          aria-label="Current track progress"
          className="[&_.casa-progress]:h-1"
        />
      )}
    </div>
  )
}
