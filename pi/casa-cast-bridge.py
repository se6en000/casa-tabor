#!/usr/bin/env python3
"""
Casa Tabor - Robust Multi-Room Google Cast Bridge Daemon
Processes commands via a sequential FIFO queue to prevent socket contention,
manages Google Nest / Chromecast endpoints, and syncs live state over Supabase Realtime.
"""

import os
import sys
import time
import json
import uuid
import ssl
import queue
import logging
import threading
import websocket
import pychromecast

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [CasaCastRelay] %(message)s"
)
logger = logging.getLogger("CasaCastRelay")

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL", "https://sjiejymuuuqzqukyeagk.supabase.co")
SUPABASE_ANON_KEY = os.environ.get("VITE_SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM")
WS_URL = f"{SUPABASE_URL.replace('https://', 'wss://')}/realtime/v1/websocket?apikey={SUPABASE_ANON_KEY}&vsn=1.0.0"

DEFAULT_SPEAKER_IP = "192.168.87.244"
DEFAULT_SPEAKER_PORT = 8009
DEFAULT_SPEAKER_NAME = "Office Point (Nest Wifi)"

GENRE_STREAMS = {
    "jazz": "https://ice1.somafm.com/illstreet-128-mp3",
    "bossa": "https://ice1.somafm.com/lush-128-mp3",
    "lofi": "https://ice5.somafm.com/groovesalad-128-mp3",
    "chill": "https://ice1.somafm.com/secretagent-128-mp3",
    "pop": "https://ice1.somafm.com/poptron-128-mp3",
    "rock": "https://ice1.somafm.com/indiepop-128-mp3",
    "ambient": "https://ice5.somafm.com/dronezone-128-mp3",
    "default": "https://ice1.somafm.com/illstreet-128-mp3"
}

def resolve_stream(query_or_url: str) -> str:
    if not query_or_url:
        return GENRE_STREAMS["default"]
    if query_or_url.startswith("http://") or query_or_url.startswith("https://"):
        return query_or_url
    q = query_or_url.lower()
    for genre, url in GENRE_STREAMS.items():
        if genre in q:
            return url
    return GENRE_STREAMS["default"]

def detect_mime(url: str) -> str:
    if not url:
        return "audio/mp3"
    u = url.lower()
    if ".m4a" in u or ".aac" in u:
        return "audio/mp4"
    if ".ogg" in u:
        return "audio/ogg"
    if ".m3u8" in u:
        return "application/x-mpegURL"
    return "audio/mp3"

class CastRelay:
    def __init__(self):
        self.cast = None
        self.ws = None
        self.cmd_queue = queue.Queue()
        self.state_lock = threading.Lock()
        self.connected_speaker = False
        
        self.state = {
            "isPlaying": False,
            "track": None,
            "progressMs": 0,
            "durationMs": 0,
            "volumePct": 55,
            "activeDeviceId": "nest-office-point",
            "activeDeviceName": DEFAULT_SPEAKER_NAME,
            "activeDeviceIds": ["nest-office-point"],
            "queue": []
        }
        
    def connect_speaker(self, ip=DEFAULT_SPEAKER_IP, name="Office Point", model="Nest Wifi point"):
        logger.info(f"Connecting to Google Cast speaker at {ip}:{DEFAULT_SPEAKER_PORT}...")
        try:
            cast_info = (ip, DEFAULT_SPEAKER_PORT, uuid.uuid4(), model, name)
            cast = pychromecast.get_chromecast_from_host(cast_info)
            cast.wait(timeout=6)
            
            with self.state_lock:
                self.cast = cast
                self.connected_speaker = True
                if cast.status and cast.status.volume_level is not None:
                    self.state["volumePct"] = max(35, int(cast.status.volume_level * 100))
                if self.state["volumePct"] < 40:
                    self.state["volumePct"] = 55
                    cast.set_volume(0.55)
            
            logger.info(f"Successfully connected to '{cast.name}' ({cast.model_name}) | Volume: {self.state['volumePct']}%")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Cast speaker at {ip}: {e}")
            return False

    def process_queue(self):
        """Dedicated worker thread processing all Cast commands sequentially."""
        while True:
            try:
                action, payload = self.cmd_queue.get()
                self._execute_command(action, payload)
                self.cmd_queue.task_done()
            except Exception as e:
                logger.error(f"Unexpected error in command worker: {e}")
                time.sleep(0.5)

    def _execute_command(self, action: str, payload: dict):
        logger.info(f"Executing: '{action}'")
        
        if action == "cast:play":
            track = payload.get("track") or payload
            title = track.get("name") or payload.get("name") or "Cast Track"
            artists = track.get("artists") or ["Artist"]
            art_url = track.get("albumArtUrl") or ""
            raw_stream = track.get("streamUrl") or payload.get("streamUrl") or track.get("name") or ""
            stream_url = resolve_stream(raw_stream)
            mime_type = detect_mime(stream_url)
            
            if not self.connected_speaker or not self.cast:
                self.connect_speaker()
                
            if self.cast and self.cast.media_controller:
                try:
                    logger.info(f"Starting playback for '{title}' [{mime_type}] via {stream_url}...")
                    self.cast.set_volume_muted(False)
                    current_vol = max(0.40, self.state.get("volumePct", 55) / 100.0)
                    self.cast.set_volume(current_vol)
                    
                    mc = self.cast.media_controller
                    mc.play_media(
                        stream_url,
                        content_type=mime_type,
                        title=f"{title} - {', '.join(artists)}",
                        thumb=art_url,
                        autoplay=True
                    )
                    
                    with self.state_lock:
                        self.state["isPlaying"] = True
                        self.state["track"] = {
                            "id": str(track.get("id") or uuid.uuid4()),
                            "videoId": str(track.get("videoId") or track.get("id") or ""),
                            "name": title,
                            "artists": artists,
                            "album": track.get("album") or "Cast Audio",
                            "albumArtUrl": art_url,
                            "durationMs": track.get("durationMs", 240000),
                            "streamUrl": stream_url,
                        }
                        self.state["progressMs"] = 0
                        self.state["durationMs"] = track.get("durationMs", 240000)
                    
                    self.broadcast_state()
                    logger.info(f"Now playing on '{self.state['activeDeviceName']}': {title} (Vol: {int(current_vol*100)}%)")
                except Exception as e:
                    logger.error(f"Error starting playback for {title}: {e}")

        elif action == "cast:pause":
            if self.cast and self.cast.media_controller:
                try:
                    self.cast.media_controller.pause()
                    with self.state_lock:
                        self.state["isPlaying"] = False
                    self.broadcast_state()
                    logger.info("Playback paused.")
                except Exception as e:
                    logger.error(f"Error pausing: {e}")

        elif action == "cast:resume":
            if self.cast and self.cast.media_controller:
                try:
                    self.cast.media_controller.play()
                    with self.state_lock:
                        self.state["isPlaying"] = True
                    self.broadcast_state()
                    logger.info("Playback resumed.")
                except Exception as e:
                    logger.error(f"Error resuming: {e}")

        elif action == "cast:stop":
            if self.cast:
                try:
                    if self.cast.media_controller:
                        self.cast.media_controller.stop()
                    with self.state_lock:
                        self.state["isPlaying"] = False
                        self.state["track"] = None
                        self.state["progressMs"] = 0
                    self.broadcast_state()
                    logger.info("Playback stopped.")
                except Exception as e:
                    logger.error(f"Error stopping: {e}")

        elif action == "cast:set_volume":
            vol = payload.get("volumePct", 55)
            vol_clamped = max(0, min(100, int(vol)))
            if self.cast:
                try:
                    self.cast.set_volume_muted(False)
                    self.cast.set_volume(vol_clamped / 100.0)
                    with self.state_lock:
                        self.state["volumePct"] = vol_clamped
                    self.broadcast_state()
                    logger.info(f"Volume set to {vol_clamped}%.")
                except Exception as e:
                    logger.error(f"Error setting volume: {e}")

        elif action == "cast:seek":
            pos_ms = payload.get("positionMs", 0)
            if self.cast and self.cast.media_controller:
                try:
                    self.cast.media_controller.seek(pos_ms / 1000.0)
                    with self.state_lock:
                        self.state["progressMs"] = pos_ms
                    self.broadcast_state()
                    logger.info(f"Seeked to {pos_ms / 1000.0}s.")
                except Exception as e:
                    logger.error(f"Error seeking: {e}")

        elif action == "cast:discover_devices":
            self.broadcast_state()

    def broadcast_state(self):
        if not self.ws:
            return
        try:
            with self.state_lock:
                state_copy = dict(self.state)
            msg = {
                "topic": "realtime:casa-music-cast",
                "event": "broadcast",
                "payload": {
                    "type": "broadcast",
                    "event": "cast-state",
                    "payload": state_copy
                },
                "ref": str(int(time.time() * 1000))
            }
            self.ws.send(json.dumps(msg))
        except Exception as e:
            logger.warning(f"Failed to broadcast state: {e}")

    def run_websocket(self):
        # Start background worker thread for serial command execution
        worker = threading.Thread(target=self.process_queue, daemon=True)
        worker.start()

        while True:
            try:
                logger.info(f"Connecting to Supabase Realtime ({WS_URL[:50]}...)...")
                self.ws = websocket.WebSocket(sslopt={"cert_reqs": ssl.CERT_NONE})
                self.ws.connect(WS_URL)
                
                # Join channel
                join_msg = {
                    "topic": "realtime:casa-music-cast",
                    "event": "phx_join",
                    "payload": {"config": {"broadcast": {"self": False}}},
                    "ref": "join_1"
                }
                self.ws.send(json.dumps(join_msg))
                logger.info("Subscribed to Supabase Realtime channel 'casa-music-cast'. Ready for playback commands.")
                
                last_heartbeat = time.time()
                while True:
                    # Heartbeat every 20s
                    if time.time() - last_heartbeat > 20:
                        self.ws.send(json.dumps({"topic": "phoenix", "event": "heartbeat", "payload": {}, "ref": "hb"}))
                        last_heartbeat = time.time()
                        
                    self.ws.settimeout(2.0)
                    try:
                        raw = self.ws.recv()
                        if not raw:
                            continue
                        msg = json.loads(raw)
                        event = msg.get("event")
                        if event == "broadcast":
                            payload = msg.get("payload", {})
                            if payload.get("event") == "cast-command":
                                cmd_payload = payload.get("payload", {})
                                action = cmd_payload.get("action")
                                if action:
                                    # Enqueue command for FIFO processing (eliminates socket concurrency)
                                    self.cmd_queue.put((action, cmd_payload))
                    except websocket.WebSocketTimeoutException:
                        pass
            except Exception as e:
                logger.error(f"WebSocket error: {e}. Reconnecting in 3s...")
                time.sleep(3)

if __name__ == "__main__":
    relay = CastRelay()
    relay.connect_speaker()
    relay.run_websocket()
