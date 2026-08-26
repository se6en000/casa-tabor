/**
 * MiniPlayer
 * Compact now-playing widget for the Home screen.
 * Seamlessly supports both YouTube Music (Google Cast) and Spotify Connect.
 * Shows album art, track/artist, progress bar, and play/pause + next controls.
 * Clicking the track area navigates to /music for the full player.
 */

import { Link } from 'react-router-dom'
import { Play, Pause, SkipForward, Music, Cast } from 'lucide-react'
import { useSpotify } from '../../hooks/useSpotify'
import { useYouTubeCast } from '../../hooks/useYouTubeCast'
import { Button, Progress } from '../ui'

export default function MiniPlayer() {
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

  // If nothing is loaded anywhere, hide mini player
  if (!track && !spotify.authed) return null
  if (!track && !hasYtTrack) return null

  function handlePlayPause() {
    if (useYt) {
      if (isPlaying) void ytCast.pause()
      else if (ytCast.state.track) void ytCast.resume()
      else if (ytCast.searchResults[0]) void ytCast.play(ytCast.searchResults[0])
    } else {
      if (isPlaying) void spotify.pause()
      else void spotify.play()
    }
  }

  function handleNext() {
    if (useYt) {
      void ytCast.next()
    } else {
      void spotify.next()
    }
  }

  return (
    <div className="bg-casa-surface rounded-card border border-casa-border shadow-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Album art */}
        <Link to="/music" className="shrink-0 relative group" onClick={e => e.stopPropagation()}>
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
          {useYt && (
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-casa-navy flex items-center justify-center text-casa-gold">
              <Cast size={8} />
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
            <p className="text-caption text-casa-muted">Tap to open Music</p>
          )}
        </Link>

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
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" />
            )}
          </Button>
          <Button
            variant="ghost"
            type="button"
            onClick={handleNext}
            className="size-control rounded-button flex items-center justify-center text-casa-muted hover:text-casa-navy hover:bg-casa-bg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-casa-gold"
            aria-label="Next"
          >
            <SkipForward size={16} />
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {track && (
        <Progress
          value={progressPct}
          aria-label="Current track progress"
          className="[&_.casa-progress]:h-0.5"
        />
      )}
    </div>
  )
}
