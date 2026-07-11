/**
 * MiniPlayer
 * Compact now-playing widget for the Home screen.
 * Shows album art, track/artist, progress bar, and play/pause + next controls.
 * Clicking the track area navigates to /music for the full player.
 */

import { Link } from 'react-router-dom'
import { Play, Pause, SkipForward, Music } from 'lucide-react'
import { useSpotify } from '../../hooks/useSpotify'
import { Button, Progress } from '../ui'

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
          <Button variant="ghost"
            type="button"
            onClick={() => isPlaying ? pause() : play()}
            className="size-control rounded-button flex items-center justify-center text-casa-navy hover:bg-casa-bg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-casa-gold"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying
              ? <Pause size={16} fill="currentColor" />
              : <Play size={16} fill="currentColor" />
            }
          </Button>
          <Button variant="ghost"
            type="button"
            onClick={() => next()}
            className="size-control rounded-button flex items-center justify-center text-casa-muted hover:text-casa-navy hover:bg-casa-bg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-casa-gold"
            aria-label="Next"
          >
            <SkipForward size={16} />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {track && (
        <Progress value={progress} aria-label="Current track progress" className="[&_.casa-progress]:h-0.5" />
      )}
    </div>
  )
}
