/**
 * MiniPlayer
 * Compact now-playing widget for the Home screen.
 * Shows album art, track/artist, progress bar, and play/pause + next controls.
 * Clicking the track area navigates to /music for the full player.
 */

import { Link } from 'react-router-dom'
import { Play, Pause, SkipForward, Music } from 'lucide-react'
import { useSpotify } from '../../hooks/useSpotify'

export default function MiniPlayer() {
  const { authed, ready, state, play, pause, next } = useSpotify()

  // Only show if authenticated and something is loaded
  if (!authed) return null
  if (!ready && !state?.track) return null

  const track = state?.track
  const isPlaying = state?.isPlaying ?? false
  const progress = track ? Math.min((state!.progressMs / track.durationMs) * 100, 100) : 0

  return (
    <div className="bg-casa-surface rounded-card border border-casa-border shadow-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Album art */}
        <Link to="/music" className="shrink-0" onClick={e => e.stopPropagation()}>
          {track?.albumArtUrl ? (
            <img
              src={track.albumArtUrl}
              alt={track.album}
              className="w-10 h-10 rounded-lg object-cover shadow-sm"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-casa-bg flex items-center justify-center">
              <Music size={18} className="text-casa-muted" />
            </div>
          )}
        </Link>

        {/* Track info */}
        <Link to="/music" className="flex-1 min-w-0" onClick={e => e.stopPropagation()}>
          {track ? (
            <>
              <p className="font-body font-semibold text-casa-navy text-body-sm truncate leading-tight">
                {track.name}
              </p>
              <p className="text-caption text-casa-muted truncate">
                {track.artists.join(', ')}
              </p>
            </>
          ) : (
            <p className="text-caption text-casa-muted">Open Spotify to start playing</p>
          )}
        </Link>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => isPlaying ? pause() : play()}
            className="w-8 h-8 rounded-full flex items-center justify-center text-casa-navy hover:bg-casa-bg transition-colors"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying
              ? <Pause size={16} fill="currentColor" />
              : <Play size={16} fill="currentColor" />
            }
          </button>
          <button
            type="button"
            onClick={() => next()}
            className="w-8 h-8 rounded-full flex items-center justify-center text-casa-muted hover:text-casa-navy hover:bg-casa-bg transition-colors"
            aria-label="Next"
          >
            <SkipForward size={16} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      {track && (
        <div className="h-0.5 bg-casa-divider">
          <div
            className="h-full bg-casa-gold transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}
