#!/usr/bin/env python3
"""
Casa Tabor - YouTube Music Google Cast Bridge Daemon
Runs on Raspberry Pi or home LAN host to bridge Supabase Realtime events
with Google Cast / Nest speakers via CastV2 TLS and YouTube MDX.
"""

import os
import sys
import time
import json
import logging
import threading
from typing import Dict, Any, List, Optional

try:
    import pychromecast
    from pychromecast.controllers.youtube import YouTubeController
except ImportError:
    print("[CasaCastBridge] Error: pychromecast not installed. Run: pip install pychromecast casttube requests")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [CasaCastBridge] %(message)s")
logger = logging.getLogger("CasaCastBridge")

REALTIME_CHANNEL = "casa-music-cast"

class CasaCastBridge:
    def __init__(self):
        self.devices: Dict[str, Any] = {}
        self.active_device_id: Optional[str] = None
        self.active_chromecast: Optional[Any] = None
        self.youtube_controller: Optional[Any] = None
        self.browser: Optional[Any] = None
        self.lock = threading.Lock()
        
        self.state = {
            "isPlaying": False,
            "track": None,
            "progressMs": 0,
            "durationMs": 0,
            "volumePct": 50,
            "activeDeviceId": None,
            "activeDeviceName": None,
            "queue": []
        }
        self.running = True

    def start_discovery(self):
        logger.info("Starting Google Cast mDNS discovery...")
        try:
            chromecasts, browser = pychromecast.get_chromecasts()
            self.browser = browser
            for cc in chromecasts:
                self._register_device(cc)
            logger.info(f"Initial discovery completed. Found {len(self.devices)} Cast devices.")
        except Exception as e:
            logger.error(f"Error during Cast discovery: {e}")

    def _register_device(self, cc: Any):
        dev_id = str(cc.cast_info.uuid or cc.cast_info.host)
        dev_name = str(cc.cast_info.friendly_name or cc.name)
        dev_model = str(cc.cast_info.model_name or "Google Cast Speaker")
        host = str(cc.cast_info.host)
        port = int(cc.cast_info.port or 8009)
        
        with self.lock:
            self.devices[dev_id] = {
                "id": dev_id,
                "name": dev_name,
                "model": dev_model,
                "ip": host,
                "port": port,
                "cc": cc
            }
        logger.info(f"Registered Cast device: '{dev_name}' ({dev_model}) at {host}:{port}")

    def get_device_list(self) -> List[Dict[str, Any]]:
        with self.lock:
            return [
                {
                    "id": d["id"],
                    "name": d["name"],
                    "model": d["model"],
                    "ip": d["ip"],
                    "port": d["port"],
                    "isActive": (d["id"] == self.active_device_id)
                }
                for d in self.devices.values()
            ]

    def select_device(self, device_id_or_name: str) -> bool:
        with self.lock:
            target = None
            if device_id_or_name in self.devices:
                target = self.devices[device_id_or_name]
            else:
                for d in self.devices.values():
                    if d["name"].lower() == device_id_or_name.lower():
                        target = d
                        break
            
            if not target:
                logger.warning(f"Device '{device_id_or_name}' not found.")
                return False

            cc = target["cc"]
            logger.info(f"Connecting to Cast target: {target['name']} ({target['ip']})...")
            try:
                cc.wait()
                yt = YouTubeController()
                cc.register_handler(yt)
                
                self.active_device_id = target["id"]
                self.active_chromecast = cc
                self.youtube_controller = yt
                
                self.state["activeDeviceId"] = target["id"]
                self.state["activeDeviceName"] = target["name"]
                
                if cc.status and cc.status.volume_level is not None:
                    self.state["volumePct"] = int(cc.status.volume_level * 100)
                
                logger.info(f"Connected to {target['name']} with YouTube controller ready.")
                return True
            except Exception as e:
                logger.error(f"Failed to connect to device {target['name']}: {e}")
                return False

    def play_track(self, video_id: str, track_meta: Optional[Dict[str, Any]] = None, device_id: Optional[str] = None):
        if device_id and device_id != self.active_device_id:
            self.select_device(device_id)
        elif not self.active_chromecast:
            with self.lock:
                if self.devices:
                    first_id = list(self.devices.keys())[0]
                    self.select_device(first_id)
                else:
                    logger.error("No Cast devices available to play.")
                    return False

        if not self.youtube_controller:
            logger.error("YouTube controller not initialized.")
            return False

        logger.info(f"Playing YouTube track [{video_id}] on '{self.state.get('activeDeviceName')}'...")
        try:
            self.youtube_controller.play_video(video_id)
            self.state["isPlaying"] = True
            self.state["track"] = track_meta or {"id": video_id, "name": "YouTube Music Track", "videoId": video_id}
            self.state["progressMs"] = 0
            if track_meta and "durationMs" in track_meta:
                self.state["durationMs"] = track_meta["durationMs"]
            return True
        except Exception as e:
            logger.error(f"Error launching playback for {video_id}: {e}")
            return False

    def pause(self):
        if self.active_chromecast and self.active_chromecast.media_controller:
            try:
                self.active_chromecast.media_controller.pause()
                self.state["isPlaying"] = False
                logger.info("Paused playback.")
                return True
            except Exception as e:
                logger.error(f"Error pausing: {e}")
        return False

    def resume(self):
        if self.active_chromecast and self.active_chromecast.media_controller:
            try:
                self.active_chromecast.media_controller.play()
                self.state["isPlaying"] = True
                logger.info("Resumed playback.")
                return True
            except Exception as e:
                logger.error(f"Error resuming: {e}")
        return False

    def stop(self):
        if self.active_chromecast:
            try:
                if self.active_chromecast.media_controller:
                    self.active_chromecast.media_controller.stop()
                self.active_chromecast.quit_app()
                self.state["isPlaying"] = False
                self.state["track"] = None
                logger.info("Stopped playback and released speaker.")
                return True
            except Exception as e:
                logger.error(f"Error stopping: {e}")
        return False

    def seek(self, position_ms: int):
        if self.active_chromecast and self.active_chromecast.media_controller:
            try:
                pos_sec = position_ms / 1000.0
                self.active_chromecast.media_controller.seek(pos_sec)
                self.state["progressMs"] = position_ms
                logger.info(f"Seeked to {pos_sec:.1f}s.")
                return True
            except Exception as e:
                logger.error(f"Error seeking: {e}")
        return False

    def set_volume(self, volume_pct: int):
        if self.active_chromecast:
            try:
                clamped = max(0, min(100, volume_pct))
                vol_level = clamped / 100.0
                self.active_chromecast.set_volume(vol_level)
                self.state["volumePct"] = clamped
                logger.info(f"Set volume to {clamped}%.")
                return True
            except Exception as e:
                logger.error(f"Error setting volume: {e}")
        return False

    def add_to_queue(self, track: Dict[str, Any]):
        video_id = track.get("videoId") or track.get("id")
        if self.youtube_controller and video_id:
            try:
                self.youtube_controller.add_to_queue(video_id)
                self.state["queue"].append(track)
                logger.info(f"Added {video_id} to queue.")
                return True
            except Exception as e:
                logger.error(f"Error adding to queue: {e}")
        return False

    def clear_queue(self):
        if self.youtube_controller:
            try:
                self.youtube_controller.clear_playlist()
                self.state["queue"] = []
                logger.info("Cleared queue.")
                return True
            except Exception as e:
                logger.error(f"Error clearing queue: {e}")
        return False

    def handle_command(self, action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        logger.info(f"Processing command '{action}' with payload: {payload}")
        res = {"action": action, "success": False}
        if action == "cast:play":
            vid = payload.get("videoId") or payload.get("id")
            dev_id = payload.get("deviceId")
            res["success"] = self.play_track(vid, payload.get("track") or payload, dev_id)
        elif action == "cast:pause":
            res["success"] = self.pause()
        elif action == "cast:resume":
            res["success"] = self.resume()
        elif action == "cast:stop":
            res["success"] = self.stop()
        elif action == "cast:seek":
            pos = payload.get("positionMs", 0)
            res["success"] = self.seek(pos)
        elif action == "cast:set_volume":
            vol = payload.get("volumePct", 50)
            res["success"] = self.set_volume(vol)
        elif action == "cast:select_device":
            dev = payload.get("deviceId") or payload.get("deviceName")
            res["success"] = self.select_device(dev)
        elif action == "cast:queue_add":
            res["success"] = self.add_to_queue(payload.get("track", {}))
        elif action == "cast:queue_clear":
            res["success"] = self.clear_queue()
        elif action == "cast:discover_devices":
            res["success"] = True
            res["devices"] = self.get_device_list()
        
        res["state"] = self.state
        return res

if __name__ == "__main__":
    bridge = CasaCastBridge()
    bridge.start_discovery()
    logger.info("Casa Cast Bridge running. Ready for incoming commands.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down Casa Cast Bridge.")
        if bridge.browser:
            pychromecast.discovery.stop_discovery(bridge.browser)
