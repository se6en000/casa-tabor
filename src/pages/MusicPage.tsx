/**
 * MusicPage
 * Full Spotify player. Also handles the OAuth PKCE callback (?code=...).
 *
 * Sections:
 *  - Setup screen (if not authenticated)
 *  - Now Playing: album art, controls, progress, volume
 *  - Devices: list all Spotify Connect devices (including Chromecast Audio)
 *  - Playlists: tap to start playing
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Monitor, Speaker, Smartphone, Tv, Music,
  ChevronLeft, RefreshCw, LogOut
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSpotify } from '../hooks/useSpotify'
import {
  getClientId, setClientId, startAuthFlow, handleOAuthCallback,
  clearTokens, isAuthenticated
} from '../lib/spotifyAuth'
import { cn } from '../utils/cn'

// ── Helpers ───────────────────────────────────────────────────────

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function deviceIcon(type: string) {
  const t = type.toLowerCase()
  if (t.includes('computer')) return Monitor
  if (t.includes('speaker') || t.includes('cast')) return Speaker
  if (t.includes('phone') || t.includes('mobile')) return Smartphone
  if (t.includes('tv')) return Tv
  return Speaker
}

// ── Page ──────────────────────────────────────────────────────────

export default function MusicPage() {
  const navigate = useNavigate()
  const authed = isAuthenticated()

  // Handle OAuth callback (?code=...)
  const [callbackDone, setCallbackDone] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      handleOAuthCallback(code).then(ok => {
        // Clean up the URL
        window.history.replaceState({}, '', '/music')
        setCallbackDone(ok)
      })
    }
  }, [])

  if (!authed && !callbackDone) {
    return <SetupScreen />
  }

  return <PlayerScreen onBack={() => navigate(-1)} />
}

// ── Setup screen ─────────────────────────────────────────────────

function SetupScreen() {
  const [clientId, setLocalClientId] = useState(getClientId)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  // Spotify rejects HTTP redirects to LAN IPs — must use localhost
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
    <div className="min-h-screen bg-casa-bg flex flex-col px-6 pt-12 pb-24 max-w-md mx-auto">
      <div className="flex items-center gap-3 mb-10">
        <div className="w-12 h-12 rounded-2xl bg-[#1DB954] flex items-center justify-center shadow-md">
          <Music size={24} className="text-white" />
        </div>
        <div>
          <h1 className="font-display text-display-md text-casa-navy leading-none">Spotify</h1>
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
              className="text-[#1DB954] underline"
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
          <input
            value={clientId}
            onChange={e => setLocalClientId(e.target.value)}
            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full bg-casa-bg border border-casa-border rounded-lg px-3 py-2.5 text-body-sm text-casa-navy placeholder:text-casa-muted focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
          />
          {error && <p className="text-caption text-red-500 mt-1">{error}</p>}
        </div>

        <button
          type="button"
          onClick={connect}
          disabled={connecting}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-[#1DB954] text-white font-semibold text-body-sm hover:bg-[#1aa34a] active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {connecting ? 'Redirecting to Spotify…' : 'Connect Spotify →'}
        </button>
      </div>

      <p className="text-caption text-casa-muted text-center mt-6">
        Requires Spotify Premium · PKCE auth · no secrets stored
      </p>
    </div>
  )
}

// ── Player screen ─────────────────────────────────────────────────

function PlayerScreen({ onBack }: { onBack: () => void }) {
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
    <div className="min-h-screen bg-casa-bg pb-28 flex flex-col max-w-lg mx-auto px-5">
      {/* Header */}
      <header className="flex items-center justify-between pt-8 pb-4">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-casa-muted hover:text-casa-navy transition-colors">
          <ChevronLeft size={20} />
          <span className="text-body-sm">Back</span>
        </button>
        <h1 className="font-display text-heading text-casa-navy">Music</h1>
        <button type="button" onClick={disconnect} className="text-casa-muted hover:text-red-500 transition-colors" title="Disconnect Spotify">
          <LogOut size={18} />
        </button>
      </header>

      {/* Album art */}
      <motion.div
        className="mx-auto mb-6 mt-2"
        animate={{ scale: isPlaying ? 1 : 0.92 }}
        transition={{ duration: 0.5, ease: 'easeInOut' }}
      >
        {track?.albumArtUrl ? (
          <img
            src={track.albumArtUrl}
            alt={track.album}
            className="w-64 h-64 rounded-2xl shadow-xl object-cover"
          />
        ) : (
          <div className="w-64 h-64 rounded-2xl bg-casa-surface border border-casa-border flex items-center justify-center shadow-xl">
            <Music size={64} className="text-casa-muted" />
          </div>
        )}
      </motion.div>

      {/* Track info */}
      <div className="text-center mb-5 px-2">
        <AnimatePresence mode="wait">
          <motion.div key={track?.id ?? 'empty'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
            <p className="font-display text-display-md text-casa-navy leading-tight truncate">
              {track?.name ?? (spotify.ready ? 'Play something on Spotify' : 'Connecting…')}
            </p>
            <p className="text-body text-casa-muted mt-1 truncate">
              {track ? track.artists.join(', ') : ''}
            </p>
            {track && <p className="text-caption text-casa-muted/70 mt-0.5 truncate">{track.album}</p>}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress / seek */}
      {track && (
        <div className="mb-5 px-1">
          <div
            ref={progressBarRef}
            className="h-1.5 bg-casa-divider rounded-full cursor-pointer group relative"
            onClick={handleSeekClick}
          >
            <div
              className="h-full bg-casa-navy rounded-full transition-all duration-1000 ease-linear relative"
              style={{ width: `${progressPct}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-casa-navy rounded-full opacity-0 group-hover:opacity-100 transition-opacity translate-x-1/2" />
            </div>
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-caption text-casa-muted tabular-nums">{fmtTime(progress)}</span>
            <span className="text-caption text-casa-muted tabular-nums">{fmtTime(duration)}</span>
          </div>
        </div>
      )}

      {/* Playback controls */}
      <div className="flex items-center justify-between mb-6 px-2">
        <button
          type="button"
          onClick={() => setShuffle(!state?.shuffle)}
          className={cn('p-2 rounded-full transition-colors', state?.shuffle ? 'text-casa-gold' : 'text-casa-muted hover:text-casa-navy')}
        >
          <Shuffle size={20} />
        </button>

        <button type="button" onClick={previous} className="p-2 text-casa-navy hover:text-casa-gold transition-colors">
          <SkipBack size={28} fill="currentColor" />
        </button>

        <button
          type="button"
          onClick={() => isPlaying ? pause() : play()}
          className="w-16 h-16 rounded-full bg-casa-navy text-white flex items-center justify-center shadow-lg hover:bg-casa-navy/90 active:scale-95 transition-all"
        >
          {isPlaying
            ? <Pause size={28} fill="currentColor" />
            : <Play size={28} fill="currentColor" className="translate-x-0.5" />
          }
        </button>

        <button type="button" onClick={next} className="p-2 text-casa-navy hover:text-casa-gold transition-colors">
          <SkipForward size={28} fill="currentColor" />
        </button>

        <button
          type="button"
          onClick={() => setRepeat(state?.repeatMode === 0 ? 1 : state?.repeatMode === 1 ? 2 : 0)}
          className={cn('p-2 rounded-full transition-colors', (state?.repeatMode ?? 0) > 0 ? 'text-casa-gold' : 'text-casa-muted hover:text-casa-navy')}
        >
          {state?.repeatMode === 2 ? <Repeat1 size={20} /> : <Repeat size={20} />}
        </button>
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
        <button
          type="button"
          onClick={() => { setShowDevices(v => !v); void refreshDevices() }}
          className="flex items-center gap-2 text-body-sm text-casa-muted hover:text-casa-navy transition-colors w-full text-left"
        >
          <Speaker size={15} className="text-casa-gold" />
          <span className="font-semibold">
            {devices.find(d => d.isActive)?.name ?? 'No active device'}
          </span>
          <RefreshCw size={13} className="ml-auto" />
        </button>

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
                  const DevIcon = deviceIcon(device.type)
                  return (
                    <button
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
                    </button>
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
              <button
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
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
