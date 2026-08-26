#!/usr/bin/env python3
"""
Casa Tabor - Realtime Google Cast Bridge Daemon
Maintains persistent connection to Supabase Realtime 'casa-music-cast'
and controls local Google Nest / Chromecast devices via CastV2 & YouTube Controller.
"""

import os
import sys
import time
import json
import uuid
import ssl
import logging
import threading
import websocket
import pychromecast
from pychromecast.controllers.youtube import YouTubeController

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

class CastRelay:
    def __init__(self):
        self.cast = None
        self.youtube_controller = None
        self.ws = None
        self.lock = threading.Lock()
        self.connected_speaker = False
        
        self.state = {
            "isPlaying": False,
            "track": None,
            "progressMs": 0,
            "durationMs": 0,
            "volumePct": 50,
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
            
            yt = YouTubeController()
            cast.register_handler(yt)
            
            with self.lock:
                self.cast = cast
                self.youtube_controller = yt
                self.connected_speaker = True
                if cast.status and cast.status.volume_level is not None:
                    self.state["volumePct"] = int(cast.status.volume_level * 100)
            
            logger.info(f"Successfully connected to '{cast.name}' ({cast.model_name}) | Initial Volume: {self.state['volumePct']}%")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Cast speaker at {ip}: {e}")
            return False

    def handle_command(self, action: str, payload: dict):
        logger.info(f"Received command: '{action}' with payload: {payload}")
        
        if action == "cast:play":
            video_id = payload.get("videoId") or (payload.get("track") or {}).get("videoId") or payload.get("id") or "KJEzFvXx3Xw"
            track = payload.get("track") or {
                "id": video_id,
                "videoId": video_id,
                "name": payload.get("name") or "YouTube Music Track",
                "artists": payload.get("artists") or ["Artist"],
                "durationMs": payload.get("durationMs") or 240000,
                "albumArtUrl": payload.get("albumArtUrl") or ""
            }
            
            if not self.connected_speaker or not self.cast:
                self.connect_speaker()
                
            if self.youtube_controller:
                try:
                    logger.info(f"Starting playback for video [{video_id}]...")
                    self.youtube_controller.play_video(video_id)
                    with self.lock:
                        self.state["isPlaying"] = True
                        self.state["track"] = track
                        self.state["progressMs"] = 0
                        self.state["durationMs"] = track.get("durationMs", 240000)
                    self.broadcast_state()
                    logger.info(f"Now playing: {track.get('name')} on {self.state['activeDeviceName']}")
                except Exception as e:
                    logger.error(f"Error launching video {video_id}: {e}")

        elif action == "cast:pause":
            if self.cast and self.cast.media_controller:
                try:
                    self.cast.media_controller.pause()
                    with self.lock:
                        self.state["isPlaying"] = False
                    self.broadcast_state()
                    logger.info("Playback paused.")
                except Exception as e:
                    logger.error(f"Error pausing: {e}")

        elif action == "cast:resume":
            if self.cast and self.cast.media_controller:
                try:
                    self.cast.media_controller.play()
                    with self.lock:
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
                    with self.lock:
                        self.state["isPlaying"] = False
                        self.state["track"] = None
                        self.state["progressMs"] = 0
                    self.broadcast_state()
                    logger.info("Playback stopped.")
                except Exception as e:
                    logger.error(f"Error stopping: {e}")

        elif action == "cast:set_volume":
            vol = payload.get("volumePct", 50)
            vol_clamped = max(0, min(100, int(vol)))
            if self.cast:
                try:
                    self.cast.set_volume(vol_clamped / 100.0)
                    with self.lock:
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
                    with self.lock:
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
            with self.lock:
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
                                    threading.Thread(target=self.handle_command, args=(action, cmd_payload)).start()
                    except websocket.WebSocketTimeoutException:
                        pass
            except Exception as e:
                logger.error(f"WebSocket error: {e}. Reconnecting in 3s...")
                time.sleep(3)

if __name__ == "__main__":
    relay = CastRelay()
    relay.connect_speaker()
    relay.run_websocket()
