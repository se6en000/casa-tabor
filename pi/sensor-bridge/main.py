#!/usr/bin/env python3
"""
Casa Tabor — Sensor Bridge
Reads the AS7343 spectral/color sensor via I²C and exposes a local HTTP endpoint
that the kiosk browser polls for Room Tone data (CCT + lux).

Architecture:
  AS7343 (I²C 0x39, bus 1) → this daemon → GET http://127.0.0.1:8765/room-tone
  useRoomTone.ts polls every 3s; falls back to time-of-day proxy on error.

Wiring (direct, no mux needed for AS7343 alone):
  Pi Pin 1  (3.3 V) → VCC
  Pi Pin 6  (GND)   → GND
  Pi Pin 3  (SDA1)  → SDA
  Pi Pin 5  (SCL1)  → SCL

Run manually:
  cd ~/sensor-bridge && python3 main.py

Autostart: launched by start-casa.sh before Chromium.
"""

import math
import time
import threading
import logging
import subprocess
import json
import os
import re
from contextlib import asynccontextmanager

try:
    import requests as _requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

try:
    import smbus2
    I2C_AVAILABLE = True
except ImportError:
    I2C_AVAILABLE = False
    logging.warning("smbus2 not installed — running in simulation mode")

try:
    import evdev
    EVDEV_AVAILABLE = True
except ImportError:
    EVDEV_AVAILABLE = False
    logging.warning("evdev not installed — touch-to-wake disabled")

try:
    import spidev as _spidev
    SPI_AVAILABLE = True
except ImportError:
    SPI_AVAILABLE = False
    logging.warning("spidev not installed — LED strip disabled")

try:
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False
    class FastAPI:
        def __init__(self, *args, **kwargs): pass
        def get(self, *args, **kwargs): return lambda f: f
        def post(self, *args, **kwargs): return lambda f: f
        def add_middleware(self, *args, **kwargs): pass
    class Request:
        pass
    class CORSMiddleware:
        pass
    uvicorn = None
    logging.warning("FastAPI/uvicorn not installed — running in headless/test mode")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sensor-bridge")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://sjiejymuuuqzqukyeagk.supabase.co")
SUPABASE_SERVICE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    os.environ.get(
        "SUPABASE_SERVICE_KEY",
        os.environ.get(
            "SUPABASE_ANON_KEY",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTkxNjczMiwiZXhwIjoyMDk1NDkyNzMyfQ._w1wgyA8hhJVb6URdgbJkSuMyazxdoydk8WNmSO32m8",
        ),
    ),
)
SUPABASE_SENSOR_ID  = "00000000-0000-0000-0000-000000000001"  # fixed row for latest reading

_push_enabled           = False
_push_checked_at        = 0.0
PUSH_CHECK_INTERVAL     = 3     # check Supabase display_config every 3s
SUPABASE_SETTINGS_KEY   = "display_config"

# Auto-sleep config (overridden from Supabase display_config)
_auto_sleep_enabled     = True
_sleep_lux_threshold    = 0.5   # lux below which display sleeps
_wake_lux_threshold     = 3.0   # lux above which display wakes
_sleep_delay_s          = 30    # seconds in darkness before sleeping

def _disable_push_remotely():
    """Set sensor_push_enabled=false in Supabase display_config + clear sensor row."""
    if not REQUESTS_AVAILABLE:
        return
    try:
        # Read current config
        res = _requests.get(
            f"{SUPABASE_URL}/rest/v1/settings",
            params={"key": f"eq.{SUPABASE_SETTINGS_KEY}", "select": "value"},
            headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
            timeout=3,
        )
        rows = res.json() if res.ok else []
        cfg = (rows[0].get("value", {}) if rows else {}) or {}
        cfg["sensor_push_enabled"] = False
        # Patch back
        _requests.patch(
            f"{SUPABASE_URL}/rest/v1/settings",
            params={"key": f"eq.{SUPABASE_SETTINGS_KEY}"},
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={"value": cfg},
            timeout=3,
        )
        # Delete the realtime sensor row so Casa app stops showing stale data
        _requests.delete(
            f"{SUPABASE_URL}/rest/v1/sensor_readings",
            params={"id": f"eq.{SUPABASE_SENSOR_ID}"},
            headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
            timeout=3,
        )
        log.info("Push disabled and sensor_readings row cleared")
    except Exception as exc:
        log.warning("Disable failed: %s", exc)

def _is_push_enabled() -> bool:
    """Return True if sensor_push_enabled is set in display_config. Caches for 3s.
    Also refreshes brightness_min/brightness_max and auto-sleep config."""
    global _push_enabled, _push_checked_at
    global _brightness_min, _brightness_max, _user_brightness_min, _user_brightness_max
    global _auto_sleep_enabled, _sleep_lux_threshold, _wake_lux_threshold, _sleep_delay_s
    now = time.time()
    if now - _push_checked_at < PUSH_CHECK_INTERVAL:
        return _push_enabled
    try:
        res = _requests.get(
            f"{SUPABASE_URL}/rest/v1/settings",
            params={"key": f"eq.{SUPABASE_SETTINGS_KEY}", "select": "value"},
            headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
            timeout=3,
        )
        if not res.ok:
            log.warning("Push config fetch returned HTTP %d: %s", res.status_code, res.text[:200])
            _push_checked_at = now + 15  # back off for 15s on error
            return _push_enabled
        rows = res.json()
        if rows and isinstance(rows, list):
            cfg = rows[0].get("value", {})
            new_push_enabled     = bool(cfg.get("sensor_push_enabled", False))
            if not new_push_enabled and _push_enabled:
                # User disabled — clear the row
                threading.Thread(target=_disable_push_remotely, daemon=True).start()
            _push_enabled        = new_push_enabled
            _user_brightness_min = int(cfg.get("brightness_min", BRIGHTNESS_MIN_DEFAULT))
            _user_brightness_max = int(cfg.get("brightness_max", BRIGHTNESS_MAX_DEFAULT))
            _brightness_min      = _user_brightness_min
            _brightness_max      = _user_brightness_max
            _auto_sleep_enabled  = bool(cfg.get("auto_sleep_enabled", True))
            _sleep_lux_threshold = float(cfg.get("sleep_lux_threshold", 0.5))
            _wake_lux_threshold  = float(cfg.get("wake_lux_threshold", 3.0))
            _sleep_delay_s       = int(cfg.get("sleep_delay_s", 30))
        log.info("Push config refreshed — sensor_push_enabled=%s min=%d max=%d auto_sleep=%s",
                 _push_enabled, _brightness_min, _brightness_max, _auto_sleep_enabled)
    except Exception as exc:
        log.warning("Push config check failed: %s", exc)
    _push_checked_at = now
    return _push_enabled


def _push_to_supabase(cct, lux, zone, brightness, rgb):
    """Upsert the latest sensor reading to Supabase so any device can see it."""
    if not REQUESTS_AVAILABLE:
        return
    if not _is_push_enabled():
        return
    try:
        res = _requests.post(
            f"{SUPABASE_URL}/rest/v1/sensor_readings",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            },
            json={
                "id": SUPABASE_SENSOR_ID,
                "cct": cct,
                "lux": lux,
                "zone": zone,
                "brightness": brightness,
                "rgb": rgb,
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            timeout=3,
        )
        if res.status_code >= 400:
            log.warning("Supabase push HTTP %s: %s", res.status_code, res.text[:200])
        else:
            log.info("Pushed to Supabase: cct=%d lux=%.1f zone=%s", cct, lux, zone)
    except Exception as exc:
        log.warning("Supabase push failed: %s", exc)

# ── AS7343 I²C config ────────────────────────────────────────────────────────
I2C_BUS      = 1
AS7343_ADDR  = 0x39

# Register map (abridged — only what we need)
REG_ENABLE   = 0x80
REG_ATIME    = 0x81   # integration time steps
REG_ASTEP    = 0xD4   # integration time step size (16-bit LE)
REG_CFG1     = 0xAA   # gain
REG_STATUS   = 0x93   # bit 6 = AVALID
REG_STATUS2  = 0xA3   # bit 6 = AVALID (alternate)
REG_CH0_LOW  = 0x95   # first of 18 channel bytes (9 × 16-bit LE pairs)

GAIN_512X    = 0x0A

# Channel layout returned starting at REG_CH0_LOW (AS7343 ROM Table 0, 6 channels × 2 bytes):
# CH0:FZ(450nm) CH1:FY(555nm) CH2:FXL(600nm) CH3:NIR(855nm) CH4:CLEAR CH5:FD
CH_NAMES = ["FZ", "FY", "FXL", "NIR", "CLEAR", "FD"]

# ── Global state ─────────────────────────────────────────────────────────────
_lock        = threading.Lock()
_latest      = {
    "cct": None,      # Correlated Color Temperature in Kelvin (2700–6500 typical)
    "lux": None,      # Illuminance (approximate)
    "channels": {},   # raw channel counts keyed by name
    "zone": None,     # pre-mapped zone string for convenience
    "error": None,    # last error message, None when healthy
    "timestamp": None,
}

POLL_INTERVAL = 0.5  # seconds between sensor reads (500 ms — continuous ambient tracking)

# ── Layer 1: DDC/CI monitor control via direct I2C ───────────────────────────
# Direct I2C DDC writes (~22 ms each) vs ddcutil subprocess (~400 ms each).
# Two dedicated threads:
#   _brightness_loop — runs at 25 ms idle; on big lux change fires a 15-step
#                      burst at 25 ms/step (total ~375 ms) for butter-smooth
#                      transitions. Deadband ignores sensor noise < 3 lux.
#   _color_loop      — runs at 66 ms/step, slower glide is imperceptible.
#
# Brightness transfer curve (log-space normalization + CIE 1931 gamma expansion):
#   Perception = night_floor + (day_ceiling - night_floor) * (log10(lux_norm) ^ PERCEIVED_EXP)
#   PWM_fraction = Perception ^ GAMMA_CORRECTION

DDC_I2C_BUS  = 14      # /dev/i2c-14 is the HDMI DDC bus on this Pi
DDC_ADDR     = 0x37    # DDC/CI slave address (standard)
DDC_SRC      = 0x51    # host source address (standard DDC/CI)

LUX_MIN_NIGHT    = 0.05    # Pitch dark / dim LED threshold (0.05 lux) -> pins to panel floor (DDC 0)
LUX_MAX_DAY      = 800.0   # Bright daylight threshold (800 lux) -> approaches max brightness
PERCEIVED_EXP    = 0.65    # CIE 1931 / Stevens power law perceptual lightness curve
GAMMA_CORRECTION = 2.2     # CIE 1931 / sRGB backlight power expansion (human eye response)

BRIGHTNESS_MIN_DEFAULT = 0    # DDC level 0 (darkest possible hardware setting)
BRIGHTNESS_MAX_DEFAULT = 90

_user_brightness_min = BRIGHTNESS_MIN_DEFAULT
_user_brightness_max = BRIGHTNESS_MAX_DEFAULT
_brightness_min = BRIGHTNESS_MIN_DEFAULT
_brightness_max = BRIGHTNESS_MAX_DEFAULT
_panel_brightness_min = BRIGHTNESS_MIN_DEFAULT
_panel_brightness_max = BRIGHTNESS_MAX_DEFAULT
_art_mode_active = False
_art_dim_offset = 0.0

PANEL_CALIBRATION_PATH = "/home/jake/sensor-bridge/panel-calibration.json"

# Deadband + burst thresholds
LUX_DEADBAND       = 3.0   # ignore lux changes smaller than this (sensor noise)
LUX_BURST_THRESH   = 15.0  # lux delta that triggers burst mode
BURST_STEPS        = 15    # number of steps in a burst ramp
BURST_STEP_MS      = 25    # ms between burst steps  (~375 ms total per ramp)
IDLE_STEP_MS       = 200   # ms between idle nudges when light is stable

COLOR_STEP_MS      = 66    # ms between color DDC steps (~3 steps/200ms)

_ddc_lock           = threading.Lock()
_current_brightness = None
_target_brightness  = None
_current_rgb        = None
_target_rgb         = None
_last_lux_for_burst = None
_display_on         = True   # tracks whether monitor is powered on via VCP 0xD6

# Shared smbus2 handle for DDC bus (i2c-14). Opened once at startup.
_ddc_bus = None

def _ddc_open():
    """Open the DDC I2C bus. Called once at startup."""
    global _ddc_bus
    if not I2C_AVAILABLE:
        return
    try:
        import smbus2 as _smbus2
        _ddc_bus = _smbus2.SMBus(DDC_I2C_BUS)
        log.info("DDC bus /dev/i2c-%d opened", DDC_I2C_BUS)
    except Exception as exc:
        log.warning("DDC bus open failed — will fall back to ddcutil: %s", exc)

def _ddc_setvcp(vcp: int, value: int):
    """
    Write a DDC/CI SetVCPFeature packet directly to i2c-14.
    Packet: [SA=0x51, L=0x84, cmd=0x03, vcp, val_hi=0, val_lo, checksum]
    Checksum: XOR of dest_addr_byte(0x6E) and all payload bytes.
    Falls back to ddcutil subprocess if the bus handle isn't available.
    """
    if _ddc_bus is not None:
        payload = [DDC_SRC, 0x84, 0x03, vcp, 0x00, value & 0xFF]
        cs = 0x6E  # DDC_ADDR << 1
        for b in payload:
            cs ^= b
        payload.append(cs & 0xFF)
        _ddc_bus.write_i2c_block_data(DDC_ADDR, payload[0], payload[1:])
        time.sleep(0.01)  # DDC spec requires ≥10 ms gap after write
    else:
        # Fallback: ddcutil subprocess (slow but reliable)
        subprocess.run(
            ["sudo", "ddcutil", "setvcp", f"{vcp:02x}", str(value)],
            timeout=5, capture_output=True
        )

def _ddc_write(value: int):
    """Write VCP 0x10 (brightness) to monitor."""
    _ddc_setvcp(0x10, value)

def _ddc_write_rgb(r: int, g: int, b: int):
    """Write RGB gains (VCP 0x16/0x18/0x1A) — 3 sequential DDC writes."""
    _ddc_setvcp(0x16, r)
    _ddc_setvcp(0x18, g)
    _ddc_setvcp(0x1A, b)


def _read_vcp(vcp: int) -> tuple[int | None, int | None]:
    """
    Read VCP value via ddcutil and return (current, max).
    Example output contains: "current value = 27, max value = 100"
    """
    try:
        res = subprocess.run(
            ["sudo", "ddcutil", "getvcp", f"{vcp:02x}"],
            timeout=5,
            capture_output=True,
            text=True,
        )
        if res.returncode != 0:
            return (None, None)
        m = re.search(r"current value\s*=\s*(\d+),\s*max value\s*=\s*(\d+)", res.stdout)
        if not m:
            return (None, None)
        return (int(m.group(1)), int(m.group(2)))
    except Exception:
        return (None, None)


def _save_panel_calibration(min_value: int, max_value: int):
    try:
        os.makedirs(os.path.dirname(PANEL_CALIBRATION_PATH), exist_ok=True)
        with open(PANEL_CALIBRATION_PATH, "w", encoding="utf-8") as fh:
            json.dump({"panel_min": min_value, "panel_max": max_value, "updated_at": time.time()}, fh)
    except Exception as exc:
        log.warning("Failed to save panel calibration: %s", exc)


def _load_panel_calibration():
    global _panel_brightness_min, _panel_brightness_max
    try:
        if not os.path.exists(PANEL_CALIBRATION_PATH):
            cur, maxv = _read_vcp(0x10)
            if maxv is not None:
                _panel_brightness_max = max(BRIGHTNESS_MAX_DEFAULT, min(100, maxv))
                log.info("No calibration file; detected panel max via DDC: %d", _panel_brightness_max)
            return
        with open(PANEL_CALIBRATION_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        pmin = int(data.get("panel_min", BRIGHTNESS_MIN_DEFAULT))
        pmax = int(data.get("panel_max", BRIGHTNESS_MAX_DEFAULT))
        _panel_brightness_min = max(0, min(100, pmin))
        _panel_brightness_max = max(_panel_brightness_min + 1, min(100, pmax))
        log.info("Loaded panel calibration: min=%d max=%d", _panel_brightness_min, _panel_brightness_max)
    except Exception as exc:
        log.warning("Failed to load panel calibration: %s", exc)


def _effective_brightness_bounds() -> tuple[int, int]:
    lo = max(_brightness_min, _panel_brightness_min)
    hi = min(_brightness_max, _panel_brightness_max)
    if hi <= lo:
        hi = min(100, lo + 1)
    return (lo, hi)


def _calibrate_panel_brightness() -> tuple[int, int]:
    """
    Probe real monitor brightness range via DDC.
    Uses getvcp 0x10 max + a low-end write/read probe.
    """
    global _panel_brightness_min, _panel_brightness_max

    cur, maxv = _read_vcp(0x10)
    original = cur if cur is not None else 20
    reported_max = maxv if maxv is not None else 100

    discovered_min = BRIGHTNESS_MIN_DEFAULT
    for candidate in (0, 1, 2, 3, 4, 5):
        try:
            _ddc_write(candidate)
            time.sleep(0.12)
            read_cur, _ = _read_vcp(0x10)
            if read_cur is None:
                continue
            if abs(read_cur - candidate) <= 1:
                discovered_min = max(0, read_cur)
                break
        except Exception:
            continue

    try:
        _ddc_write(original)
    except Exception:
        pass

    _panel_brightness_min = max(0, min(100, discovered_min))
    _panel_brightness_max = max(_panel_brightness_min + 1, min(100, reported_max))
    _save_panel_calibration(_panel_brightness_min, _panel_brightness_max)
    log.info("Panel calibrated: min=%d max=%d", _panel_brightness_min, _panel_brightness_max)
    return (_panel_brightness_min, _panel_brightness_max)

def _display_sleep():
    """Power off monitor via VCP 0xD6 = 0x04."""
    global _display_on, _current_brightness
    _ddc_setvcp(0xD6, 0x04)
    with _ddc_lock:
        _display_on = False
        _current_brightness = None  # force re-init on wake
    log.info("Display slept (VCP 0xD6=off)")

def _display_wake(target_brightness: int):
    """
    Power on monitor then burst-ramp brightness from 0 → target.
    Sequence: VCP 0xD6=on → set brightness=0 → burst to target.
    Monitor fades in from black to ambient level.
    """
    global _display_on, _current_brightness
    _ddc_setvcp(0xD6, 0x01)
    time.sleep(0.15)  # brief pause for monitor to accept commands after power-on
    _ddc_write(0)     # start from black
    with _ddc_lock:
        _display_on = True
        _current_brightness = 0
    log.info("Display woke — bursting 0 → %d", target_brightness)
    # Burst ramp from 0 to target
    lo, hi = _effective_brightness_bounds()
    for i in range(1, BURST_STEPS + 1):
        val = round(target_brightness * i / BURST_STEPS)
        val = max(lo, min(hi, val))
        try:
            _ddc_write(val)
            with _ddc_lock:
                _current_brightness = val
        except Exception as exc:
            log.warning("Wake burst step failed: %s", exc)
            break
        time.sleep(BURST_STEP_MS / 1000.0)
    log.info("Wake burst complete → %d", target_brightness)


def lux_to_brightness(lux: float) -> int:
    """
    Map ambient lux → DDC hardware brightness level (0–90) using:
    1. Logarithmic lux normalization (human vision dynamic range: 0.05 to 800+ lux).
    2. Uniform Perceptual Dimmer Strength: dim_offset (0.00 to 0.90) uniformly scales
       perceived lightness (CIE 1931 / Stevens Power Law) consistently across daylight,
       evening, and night without distorting the ratio.
    3. Ultra-Dark Ambient Floor: in near pitch-black rooms (< 0.8 lux), Art Mode
       decays all the way down to DDC 0 for zero-glare, dark-room museum viewing.
    4. CIE 1931 Gamma correction (perceived lightness → physical DDC PWM duty cycle).
    """
    lo, hi = _effective_brightness_bounds()
    if lux is None or lux < 0:
        lux = 0.0

    # 1. Clamp and normalize lux in log10 space (0.05 lx to 800 lx)
    lux_clamped = max(LUX_MIN_NIGHT, min(lux, LUX_MAX_DAY))
    log_min = math.log10(LUX_MIN_NIGHT)
    log_max = math.log10(LUX_MAX_DAY)
    
    # 0.0 (night / dark) -> 1.0 (bright day)
    t = (math.log10(lux_clamped) - log_min) / (log_max - log_min)
    t = max(0.0, min(1.0, t))
    
    # 2. Active Dashboard perceived lightness curve (0.06 night floor to 1.00 daytime ceiling)
    # Yields DDC 1-2 in near dark (soft glare-free dashboard) and DDC 90 in full daylight
    night_active_perceived = 0.06
    day_active_perceived = 1.00
    active_perceived = night_active_perceived + (day_active_perceived - night_active_perceived) * (t ** PERCEIVED_EXP)
    
    # 3. Art Mode ("dim below ambient"): uniform perceptual scaling
    if _art_mode_active and _art_dim_offset > 0.0:
        # User-selected offset directly scales perceived lightness by (1.0 - dim_offset)
        dim_fraction = max(0.0, min(0.95, _art_dim_offset))
        art_perceived = active_perceived * (1.0 - dim_fraction)
        
        # When in very dark ambient light (t < 0.25, i.e. < 0.8 lux), decay to 0 to reach true panel floor (DDC 0)
        if t < 0.25:
            dark_factor = t / 0.25
            art_perceived = art_perceived * (0.20 + 0.80 * dark_factor)
        perceived_target = art_perceived
    else:
        perceived_target = active_perceived
    
    perceived_target = max(0.0, min(1.0, perceived_target))
    
    # 4. Gamma expansion: convert perceived lightness to physical DDC PWM duty cycle
    # Perceived brightness = PWM^(1/gamma) ==> PWM = Perceived^gamma
    pwm_fraction = perceived_target ** GAMMA_CORRECTION
    
    # Map into effective monitor DDC range [lo, hi]
    ddc_level = lo + (hi - lo) * pwm_fraction
    return max(lo, min(hi, int(round(ddc_level))))


def set_brightness_target(lux: float):
    """Called every 500 ms by sensor poll — updates brightness target from lux."""
    global _target_brightness
    _target_brightness = lux_to_brightness(lux)


def set_color_target(cct: float):
    """Called by sensor poll — converts true spectral CCT to RGB gains and updates target."""
    global _target_rgb
    if cct is not None:
        _target_rgb = cct_to_rgb_gains(cct)


def _touch_wake_loop():
    """
    Watches all /dev/input/event* devices for touch/key events.
    If the display is sleeping, any touch immediately wakes it via _display_wake().
    Uses evdev; silently exits if evdev is unavailable.
    """
    if not EVDEV_AVAILABLE:
        log.info("Touch-to-wake disabled (evdev not installed)")
        return

    import select

    def _open_devices():
        devs = []
        for path in evdev.list_devices():
            try:
                d = evdev.InputDevice(path)
                caps = d.capabilities()
                # Keep touchscreens (EV_ABS) and keyboards/buttons (EV_KEY)
                if evdev.ecodes.EV_ABS in caps or evdev.ecodes.EV_KEY in caps:
                    devs.append(d)
                    log.info("Touch-wake watching: %s (%s)", path, d.name)
            except Exception:
                pass
        return devs

    devices = _open_devices()
    if not devices:
        log.warning("Touch-to-wake: no input devices found — will retry")

    RETRY_INTERVAL = 10  # re-scan for devices every 10s if none found

    last_scan = time.time()
    while True:
        if not devices:
            time.sleep(RETRY_INTERVAL)
            devices = _open_devices()
            continue

        # select() on all device fds with a timeout so we can re-check periodically
        fds = {d.fd: d for d in devices}
        try:
            r, _, _ = select.select(fds.keys(), [], [], RETRY_INTERVAL)
        except Exception as exc:
            log.warning("Touch-wake select error: %s", exc)
            devices = _open_devices()
            continue

        for fd in r:
            dev = fds[fd]
            try:
                for event in dev.read():
                    # Any real input event (not SYN) wakes the display
                    if event.type != evdev.ecodes.EV_SYN:
                        with _ddc_lock:
                            disp_on = _display_on
                            b_target = _target_brightness
                        if not disp_on:
                            log.info("Touch event on %s — waking display", dev.name)
                            wake_target = b_target if b_target is not None else _brightness_min
                            _display_wake(wake_target)
                        break  # one wake per batch of events is enough
            except Exception as exc:
                log.warning("Touch-wake read error on %s: %s", dev.name, exc)
                devices = [d for d in devices if d.fd != fd]
                try:
                    dev.close()
                except Exception:
                    pass

        # Periodically re-scan in case a device was added (e.g. USB reconnect)
        if time.time() - last_scan > 30:
            last_scan = time.time()
            new_devs = _open_devices()
            existing_paths = {d.path for d in devices}
            for d in new_devs:
                if d.path not in existing_paths:
                    devices.append(d)


def _brightness_loop():
    """
    Dedicated thread for brightness DDC control + auto-sleep.

    Auto-sleep: if lux stays below _sleep_lux_threshold for _sleep_delay_s seconds,
    powers off the monitor (VCP 0xD6=off). Keeps polling; when lux rises above
    _wake_lux_threshold, wakes monitor with a burst ramp from 0 → ambient.

    Idle mode:  checks every IDLE_STEP_MS. Nudges 1 DDC unit toward target.

    Burst mode: large brightness delta fires a 15-step linear ramp at 25ms/step.
    """
    global _current_brightness, _last_lux_for_burst

    _dark_since = None  # time.time() when lux first dropped below sleep threshold

    def _fire_burst(start: int, end: int):
        global _current_brightness
        if start == end:
            return
        lo, hi = _effective_brightness_bounds()
        for i in range(1, BURST_STEPS + 1):
            t = i / BURST_STEPS
            val = round(start + (end - start) * t)
            val = max(lo, min(hi, val))
            try:
                _ddc_write(val)
                with _ddc_lock:
                    _current_brightness = val
            except Exception as exc:
                log.warning("DDC burst step failed: %s", exc)
                break
            time.sleep(BURST_STEP_MS / 1000.0)
        log.info("DDC burst complete %d → %d", start, end)

    while True:
        time.sleep(IDLE_STEP_MS / 1000.0)

        with _ddc_lock:
            b_target    = _target_brightness
            b_current   = _current_brightness
            disp_on     = _display_on

        if b_target is None:
            continue

        # ── Auto-sleep logic ────────────────────────────────────────────────
        if _auto_sleep_enabled:
            # Derive current lux estimate from target brightness (inverse power law)
            # Just use raw target: if target == _brightness_min, we're in darkness
            current_lux = None
            with _lock:
                current_lux = _latest.get("lux")

            if current_lux is not None:
                if not disp_on:
                    # Display is sleeping — watch for light or motion wake
                    if current_lux >= _wake_lux_threshold:
                        _dark_since = None
                        _display_wake(b_target)
                    continue  # keep polling while asleep, skip brightness adjust

                # Display is on — track darkness duration
                if current_lux < _sleep_lux_threshold:
                    if _dark_since is None:
                        _dark_since = time.time()
                    elif time.time() - _dark_since >= _sleep_delay_s:
                        _display_sleep()
                        _dark_since = None
                        continue
                else:
                    _dark_since = None  # light came back, reset timer

        # ── Brightness control (display is on) ──────────────────────────────
        if b_current is None:
            try:
                _ddc_write(b_target)
                with _ddc_lock:
                    _current_brightness = b_target
                log.info("DDC brightness init → %d", b_target)
            except Exception as exc:
                log.warning("DDC brightness init failed: %s", exc)
            continue

        delta = abs(b_target - b_current)
        if delta == 0:
            continue

        lo, hi = _effective_brightness_bounds()
        if delta >= 3:
            _fire_burst(b_current, b_target)
        else:
            nxt = b_current + (1 if b_target > b_current else -1)
            try:
                _ddc_write(nxt)
                with _ddc_lock:
                    _current_brightness = nxt
                log.debug("DDC nudge %d → %d (target %d)", b_current, nxt, b_target)
            except Exception as exc:
                log.warning("DDC nudge failed: %s", exc)


def _color_loop():
    """
    Dedicated thread for color temperature DDC control.
    Steps each RGB gain channel by 1–3 units every COLOR_STEP_MS.
    Color shifts are slow enough that even 66 ms steps feel seamless.
    """
    global _current_rgb

    def _step(cur, tgt):
        if cur == tgt:
            return cur
        gap = abs(tgt - cur)
        step = 3 if gap >= 10 else 1
        delta = step if tgt > cur else -step
        nxt = cur + delta
        return tgt if (delta > 0 and nxt > tgt) or (delta < 0 and nxt < tgt) else nxt

    while True:
        time.sleep(COLOR_STEP_MS / 1000.0)
        with _ddc_lock:
            c_target  = _target_rgb
            c_current = _current_rgb

        if c_target is None:
            continue

        if c_current is None:
            try:
                _ddc_write_rgb(*c_target)
                with _ddc_lock:
                    _current_rgb = c_target
                log.info("DDC color init → R=%d G=%d B=%d", *c_target)
            except Exception as exc:
                log.warning("DDC color init failed: %s", exc)
            continue

        if c_current == c_target:
            continue

        next_rgb = (
            _step(c_current[0], c_target[0]),
            _step(c_current[1], c_target[1]),
            _step(c_current[2], c_target[2]),
        )
        try:
            _ddc_write_rgb(*next_rgb)
            with _ddc_lock:
                _current_rgb = next_rgb
            log.debug("DDC color → R=%d G=%d B=%d (target R=%d G=%d B=%d)", *next_rgb, *c_target)
        except Exception as exc:
            log.warning("DDC color step failed: %s", exc)


# ── CCT + lux math ──────────────────────────────────────────────────────────

def cct_to_rgb_gains(cct: float) -> tuple[int, int, int]:
    """
    Convert color temperature (K) to DDC RGB gain values (0–100 scale, neutral=50).

    Uses Tanner Helland's blackbody approximation to get relative R:G:B ratios,
    then maps them so the dominant channel sits at 50 (neutral factory point).
    Effect range: 2700 K → warm amber tint; 6500 K → near-neutral cool white.

    We keep all gains ≤ 50 to avoid clipping / brightness creep.
    """
    t = max(1000, min(40000, cct)) / 100.0

    # Red
    if t <= 66:
        r = 255.0
    else:
        r = 329.698727446 * ((t - 60) ** -0.1332047592)

    # Green
    if t <= 66:
        g = 99.4708025861 * math.log(t) - 161.1195681661
    else:
        g = 288.1221695283 * ((t - 60) ** -0.0755148492)

    # Blue
    if t >= 66:
        b = 255.0
    elif t <= 19:
        b = 0.0
    else:
        b = 138.5177312231 * math.log(t - 10) - 305.0447927307

    r = max(0.0, min(255.0, r))
    g = max(0.0, min(255.0, g))
    b = max(0.0, min(255.0, b))

    # Normalize so max channel = 50 (DDC neutral midpoint), scale others proportionally.
    # Blending 40% toward neutral (50,50,50) softens the effect for a tasteful display shift.
    peak = max(r, g, b)
    scale = 50.0 / peak
    r_gain = round(r * scale * 0.6 + 50 * 0.4)
    g_gain = round(g * scale * 0.6 + 50 * 0.4)
    b_gain = round(b * scale * 0.6 + 50 * 0.4)

    return (
        max(0, min(100, r_gain)),
        max(0, min(100, g_gain)),
        max(0, min(100, b_gain)),
    )



# ── CCT + lux math ──────────────────────────────────────────────────────────

def channels_to_cct_lux(ch: dict) -> tuple[float, float]:
    """
    Estimate true CCT (Kelvin) and Lux from AS7343 ROM Table 0 channels:
      FZ    = 450nm (Blue pump & skylight)
      FY    = 555nm (Photopic Green/Yellow peak)
      FXL   = 600nm (Amber/Red phosphor & thermal emission)
      NIR   = 855nm (Near Infrared)
      CLEAR = Broadband photopic clear
      FD    = Flicker / Ambient reference
    """
    fz    = float(max(ch.get("FZ",    0), 0))
    fy    = float(max(ch.get("FY",    0), 0))
    fxl   = float(max(ch.get("FXL",   0), 0))
    clear = float(max(ch.get("CLEAR", 0), 0))
    nir   = float(max(ch.get("NIR",   0), 0))

    # 1. Lux calculation: FY (555nm photopic peak) with NIR subtraction
    visible = max(0.0, fy - 0.05 * nir)
    # Gain 256x at 50ms integration time: ~3.5 counts per lux
    lux = max(0.0, visible / 3.5)

    # 2. Spectral Chromaticity CCT:
    # Ratio of Blue (FZ) to Warm Amber/Red (FXL)
    # Warm white LED (2700K): FXL >> FZ (ratio ~ 0.25 - 0.50) -> 2700K - 3200K
    # Neutral white (4000K): FXL > FZ (ratio ~ 0.75 - 0.85) -> ~4200K
    # Daylight (5500K): FZ ~= FXL (ratio ~ 1.05 - 1.20) -> ~5600K
    # Cool dusk / twilight (7000K+): FZ >> FXL (ratio >= 1.60) -> ~7200K+
    if fxl > 5.0 and fz > 1.0:
        ratio = fz / fxl
        cct = 2200.0 + 5800.0 * (1.0 / (1.0 + math.exp(-3.2 * (ratio - 0.95))))
    elif fxl > fz:
        cct = 2700.0
    else:
        cct = 6500.0

    cct = max(2200.0, min(8000.0, cct))
    return round(cct), round(lux, 1)


def cct_to_zone(cct: float, lux: float) -> str:
    """Map CCT + lux to a Room Tone zone name matching useRoomTone.ts zones."""
    if lux < 5:
        return "late-night"
    if lux < 30:
        return "night"
    if cct < 3200:
        return "evening"
    if cct < 4500:
        return "afternoon"
    return "day"


# ── Sensor reader ────────────────────────────────────────────────────────────

class AS7343Reader:
    def __init__(self):
        self.bus = None

    def _open(self):
        self.bus = smbus2.SMBus(I2C_BUS)

        # Step 1: Power on only (PON=1, SP_EN=0)
        self.bus.write_byte_data(AS7343_ADDR, REG_ENABLE, 0x01)
        time.sleep(0.01)

        # Verify chip is alive — WHOAMI should be non-zero after PON
        whoami = self.bus.read_byte_data(AS7343_ADDR, 0x92)
        log.info("AS7343 WHOAMI=0x%02X on I2C bus %d addr=0x%02X", whoami, I2C_BUS, AS7343_ADDR)

        # Step 2: Configure integration time and gain before SP_EN
        self.bus.write_byte_data(AS7343_ADDR, REG_ATIME, 29)
        # ASTEP as two LE bytes: 599 = 0x0257
        self.bus.write_i2c_block_data(AS7343_ADDR, REG_ASTEP, [0x57, 0x02])
        # Gain 256× (safer for typical indoor levels)
        self.bus.write_byte_data(AS7343_ADDR, REG_CFG1, 0x09)

        # Step 3: Load SMUX ROM defaults so photodiodes map to ADC channels
        # CFG6 (0xAF) bits[4:3] = SMUX_CMD=2 → load ROM table
        self.bus.write_byte_data(AS7343_ADDR, 0xAF, 0x10)
        # ENABLE: set SMUXEN (bit 4) to trigger transfer
        self.bus.write_byte_data(AS7343_ADDR, REG_ENABLE, 0x11)  # PON + SMUXEN
        # Wait for SMUXEN to self-clear (transfer complete)
        for _ in range(100):
            if not (self.bus.read_byte_data(AS7343_ADDR, REG_ENABLE) & 0x10):
                break
            time.sleep(0.002)

        # Step 4: Enable spectral measurement
        self.bus.write_byte_data(AS7343_ADDR, REG_ENABLE, 0x03)  # PON + SP_EN
        time.sleep(0.1)  # let first integration cycle complete (~50ms)
        log.info("AS7343 initialised")

    def _wait_data_ready(self, timeout=2.0):
        """Wait for AVALID on STATUS (0x93) or STATUS2 (0xA3) bit 6."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            s1 = self.bus.read_byte_data(AS7343_ADDR, REG_STATUS)
            s2 = self.bus.read_byte_data(AS7343_ADDR, REG_STATUS2)
            if (s1 | s2) & 0x40:
                return True
            time.sleep(0.02)
        # AVALID never set — read anyway (data still valid on this chip)
        log.warning("AVALID timeout — reading raw data anyway")
        return True

    def read(self) -> dict:
        if self.bus is None:
            self._open()

        try:
            # Restart spectral measurement: SP_EN off→on forces a fresh integration
            self.bus.write_byte_data(AS7343_ADDR, REG_ENABLE, 0x01)  # PON only
            time.sleep(0.005)
            self.bus.write_byte_data(AS7343_ADDR, REG_ENABLE, 0x03)  # PON + SP_EN
            self._wait_data_ready()

            # Read 12 bytes = 6 × 16-bit channels (LE pairs)
            raw = self.bus.read_i2c_block_data(AS7343_ADDR, REG_CH0_LOW, 12)
        except Exception as exc:
            # I2C bus hung (e.g. kernel timeout under CPU load) — close and
            # force a full reopen on the next poll cycle rather than spinning.
            log.warning("AS7343 I2C read failed, resetting bus: %s", exc)
            self.close()
            raise

        channels = {}
        for i, name in enumerate(CH_NAMES):
            lo = raw[i * 2]
            hi = raw[i * 2 + 1]
            channels[name] = (hi << 8) | lo

        log.debug("Raw channels: %s", channels)
        cct, lux = channels_to_cct_lux(channels)
        zone = cct_to_zone(cct, lux)
        return {"cct": cct, "lux": lux, "channels": channels, "zone": zone}

    def close(self):
        if self.bus:
            try:
                self.bus.close()
            except Exception:
                pass
            self.bus = None


class SimulatedReader:
    """Simulates realistic sensor readings when hardware isn't present."""
    def __init__(self):
        self._t = 0

    def read(self) -> dict:
        self._t += POLL_INTERVAL
        # Cycle through day/afternoon/evening over ~5 min for easy testing
        phase = (self._t % 300) / 300
        cct = 2700 + int(3800 * abs(math.sin(phase * math.pi)))
        lux = 50 + int(450 * abs(math.sin(phase * math.pi)))
        channels = {n: int(100 + 900 * abs(math.sin(phase * math.pi + i * 0.3)))
                    for i, n in enumerate(CH_NAMES)}
        zone = cct_to_zone(cct, lux)
        log.debug("SIM cct=%d lux=%d zone=%s", cct, lux, zone)
        return {"cct": cct, "lux": lux, "channels": channels, "zone": zone}

    def close(self):
        pass


# ── Background polling loop ──────────────────────────────────────────────────

def _poll_loop(reader):
    consecutive_errors = 0
    _last_supabase_push = 0.0
    while True:
        try:
            data = reader.read()
            consecutive_errors = 0
            with _lock:
                _latest.update({
                    **data,
                    "error": None,
                    "timestamp": time.time(),
                })
            # Layer 1: update DDC targets for brightness and color temperature
            set_brightness_target(data["lux"])
            set_color_target(data["cct"])
            # Push to Supabase so any device (not just localhost) can read it (throttled to 3s)
            now = time.time()
            if now - _last_supabase_push >= 3.0:
                _last_supabase_push = now
                with _ddc_lock:
                    brightness_now = _current_brightness
                    rgb_now = list(_current_rgb) if _current_rgb else None
                threading.Thread(
                    target=_push_to_supabase,
                    args=(data["cct"], data["lux"], data["zone"], brightness_now, rgb_now),
                    daemon=True,
                ).start()
        except Exception as exc:
            consecutive_errors += 1
            log.error("Sensor read error #%d: %s", consecutive_errors, exc)
            with _lock:
                _latest["error"] = str(exc)
            # Exponential backoff up to 30s so a jammed I2C bus doesn't spin hot
            backoff = min(30, 2 ** min(consecutive_errors - 1, 4))
            time.sleep(backoff)
            continue
        time.sleep(POLL_INTERVAL)


# ── FastAPI app ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    _ddc_open()
    _load_panel_calibration()
    reader = AS7343Reader() if I2C_AVAILABLE else SimulatedReader()
    thread = threading.Thread(target=_poll_loop, args=(reader,), daemon=True)
    thread.start()
    brightness_thread = threading.Thread(target=_brightness_loop, daemon=True)
    brightness_thread.start()
    color_thread = threading.Thread(target=_color_loop, daemon=True)
    color_thread.start()
    touch_wake_thread = threading.Thread(target=_touch_wake_loop, daemon=True)
    touch_wake_thread.start()
    log.info("Sensor bridge started — http://127.0.0.1:8765")
    yield
    reader.close()


app = FastAPI(title="Casa Tabor Sensor Bridge", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # localhost only — no public exposure needed
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/room-tone")
def room_tone():
    with _lock:
        data = dict(_latest)
    with _ddc_lock:
        brightness = _current_brightness
        rgb        = list(_current_rgb) if _current_rgb else None
        disp_on    = _display_on
    return {
        "cct":        data["cct"],
        "lux":        data["lux"],
        "zone":       data["zone"],
        "error":      data["error"],
        "timestamp":  data["timestamp"],
        "brightness": brightness,
        "rgb":        rgb,
        "display_on": disp_on,
    }


@app.get("/room-tone/channels")
def room_tone_channels():
    """Raw channel counts — useful for calibration and debugging."""
    with _lock:
        return {"channels": dict(_latest.get("channels", {}))}


@app.get("/health")
def health():
    with _lock:
        return {"ok": _latest["error"] is None, "error": _latest["error"]}


@app.post("/windowed")
def windowed():
    """Disabled in production to prevent kiosk/window mode conflicts."""
    return {"ok": False, "error": "Windowed relaunch is disabled on this device"}


@app.post("/display/art-mode")
async def art_mode(request: Request):
    """Enter art mode: dim monitor based on ambient light.
    
    Expects JSON: { "dim_offset": 0.0-0.95 }
    dim_offset is multiplier: 0.8 = dim by 80%
    """
    try:
        try:
            data = await request.json()
        except Exception:
            data = {}
        global _art_mode_active, _art_dim_offset, _brightness_max
        dim_offset = float(data.get("dim_offset", 0.3))
        _art_dim_offset = max(0.0, min(0.95, dim_offset))
        _art_mode_active = True
        
        orig_max = _user_brightness_max if '_user_brightness_max' in globals() else _panel_brightness_max
        _brightness_max = orig_max
        
        with _lock:
            lux_now = _latest.get("lux", 50.0)
        set_brightness_target(lux_now if lux_now is not None else 50.0)
        
        log.info("Art mode enabled: dim_offset=%.2f, brightness_max=%d, target=%d",
                 _art_dim_offset, _brightness_max, _target_brightness)
        return {"ok": True, "msg": f"Art mode: max brightness now {_brightness_max}, target {_target_brightness}"}
    except Exception as e:
        log.error("Art mode error: %s", e)
        return {"ok": False, "error": str(e)}


@app.post("/display/art-mode-off")
def art_mode_off():
    """Exit art mode: restore auto-brightness scaling."""
    try:
        global _art_mode_active, _art_dim_offset, _brightness_max
        _art_mode_active = False
        _art_dim_offset = 0.0
        _brightness_max = _user_brightness_max if '_user_brightness_max' in globals() else min(BRIGHTNESS_MAX_DEFAULT, _panel_brightness_max)
        
        with _lock:
            lux_now = _latest.get("lux", 50.0)
        set_brightness_target(lux_now if lux_now is not None else 50.0)
        
        log.info("Art mode disabled: brightness_max restored to %d, target=%d",
                 _brightness_max, _target_brightness)
        return {"ok": True, "msg": f"Auto-brightness restored to {_brightness_max}"}
    except Exception as e:
        log.error("Art mode off error: %s", e)
        return {"ok": False, "error": str(e)}


@app.post("/display/art-brightness-min")
async def art_brightness_min(request: Request):
    """Set minimum brightness for art mode (how dark it can go).
    
    Expects JSON: { "min": 0-20 }
    min=0 is darkest (absolute panel floor), min=10 allows slightly brighter.
    """
    try:
       try:
           data = await request.json()
       except Exception:
           data = {}
       min_val = int(data.get("min", 0))
       min_val = max(_panel_brightness_min, min(20, min_val))  # clamp to panel floor
        
       global _brightness_min
       _brightness_min = min_val
        
       log.info("Art mode min brightness set to %d", _brightness_min)
       return {"ok": True, "msg": f"Art mode minimum brightness: {_brightness_min}"}
    except Exception as e:
       log.error("Art brightness min error: %s", e)
       return {"ok": False, "error": str(e)}


@app.get("/display/panel-calibration")
def get_panel_calibration():
    lo, hi = _effective_brightness_bounds()
    return {
        "ok": True,
        "panel_min": _panel_brightness_min,
        "panel_max": _panel_brightness_max,
        "effective_min": lo,
        "effective_max": hi,
    }


@app.post("/display/calibrate-panel")
def calibrate_panel():
    try:
        panel_min, panel_max = _calibrate_panel_brightness()
        return {"ok": True, "panel_min": panel_min, "panel_max": panel_max}
    except Exception as exc:
        log.error("Panel calibration failed: %s", exc)
        return {"ok": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# LED Strip (WS2812B via SPI MOSI — GPIO 10, /dev/spidev0.0)
# ---------------------------------------------------------------------------
NUM_LEDS      = 60
LED_MAX_BRIGHT = 128   # hard cap to protect Pi 5V rail (50% = ~1.8A max)
_led_lock     = threading.Lock()
_led_stop     = threading.Event()        # signals the comet loop to exit
_burst_active = threading.Event()        # comet pauses while a burst plays
_led_thread: threading.Thread | None = None
_burst_thread: threading.Thread | None = None

# Live animation state
_led_current_pixels = [[0.0, 0.0, 0.0] for _ in range(NUM_LEDS)]
_led_mode = "off"  # off | listening | processing
_voice_level = 0.0
_voice_until = 0.0
_color_lock   = threading.Lock()
_spi_last_target = None

DEEP_BLUE = (30, 58, 138)      # #1E3A8A
CYAN = (34, 211, 238)          # #22D3EE
SOFT_WHITE = (224, 242, 254)   # #E0F2FE
PURPLE = (124, 58, 237)        # #7C3AED

def _mix(c1: tuple[int, int, int], c2: tuple[int, int, int], a: float) -> tuple[float, float, float]:
    a = max(0.0, min(1.0, a))
    return (
        c1[0] + (c2[0] - c1[0]) * a,
        c1[1] + (c2[1] - c1[1]) * a,
        c1[2] + (c2[2] - c1[2]) * a,
    )

def _scale(c: tuple[float, float, float], f: float) -> tuple[float, float, float]:
    return (c[0] * f, c[1] * f, c[2] * f)

def _add(c1: tuple[float, float, float], c2: tuple[float, float, float]) -> tuple[float, float, float]:
    return (c1[0] + c2[0], c1[1] + c2[1], c1[2] + c2[2])

def _set_mode(mode: str):
    global _led_mode
    with _color_lock:
        _led_mode = mode

def _set_voice_level(level: float):
    global _voice_level, _voice_until
    n = max(0.0, min(1.0, level))
    with _color_lock:
        _voice_level = max(_voice_level * 0.75, n)
        _voice_until = time.time() + 0.35

def _spi_open():
    global _spi_last_target
    targets = [(0, 0), (10, 0)]  # This strip is wired on spidev0.0; keep spidev10.0 fallback.
    last_error = None
    for bus, dev in targets:
        try:
            spi = _spidev.SpiDev()
            spi.open(bus, dev)
            spi.max_speed_hz = 3_200_000
            spi.mode = 0
            if _spi_last_target != (bus, dev):
                log.info("LED SPI target: spidev%d.%d", bus, dev)
                _spi_last_target = (bus, dev)
            return spi
        except Exception as e:
            last_error = e
    raise RuntimeError(f"Unable to open LED SPI device ({last_error})")

def _encode_byte(b: int) -> list[int]:
    """Encode one byte as 8 SPI bytes using WS2812B bit timing."""
    out = []
    for i in range(7, -1, -1):
        out.append(0b11100000 if (b >> i) & 1 else 0b10000000)
    return out

def _make_frame(pixels: list[tuple[int, int, int]]) -> bytes:
    frame = [0x00] * 50
    for r, g, b in pixels:
        for byte in [g, r, b]:   # WS2812B is GRB order
            frame += _encode_byte(byte)
    frame += [0x00] * 50
    return bytes(frame)

def _write_pixels(spi, pixels: list[tuple[int, int, int]]):
    spi.xfer2(list(_make_frame(pixels)))

def _clamp(val: int) -> int:
    return max(0, min(LED_MAX_BRIGHT, val))

def _comet_loop():
    """Breathing halo + listening sweep + reactive ripple + processing pulse."""
    if not SPI_AVAILABLE:
        return
    try:
        spi = _spi_open()
        t0 = time.time()
        voice_env = 0.0
        while not _led_stop.is_set():
            if _burst_active.is_set():
                _led_stop.wait(0.03)
                continue

            now = time.time()
            t = now - t0
            with _color_lock:
                mode = _led_mode
                voice_target = _voice_level if now < _voice_until else 0.0
            voice_env += (voice_target - voice_env) * 0.35

            targets: list[tuple[float, float, float]] = []
            breathing = 0.5 + 0.5 * math.sin((2 * math.pi * t) / 2.6)
            for i in range(NUM_LEDS):
                if mode == "listening":
                    base_color = _mix(DEEP_BLUE, CYAN, 0.22 + 0.35 * breathing)
                    base = _scale(base_color, 0.18 + 0.22 * breathing)

                    sweep_head = (t / 1.25) * NUM_LEDS
                    dist = abs(i - (sweep_head % NUM_LEDS))
                    dist = min(dist, NUM_LEDS - dist)
                    sweep = max(0.0, 1.0 - dist / 11.0)
                    sweep_color = _mix(CYAN, SOFT_WHITE, 0.45)
                    sweep_layer = _scale(sweep_color, 0.30 * sweep)

                    # Voice ripple from strip center; loudness scales amplitude.
                    center = (NUM_LEDS - 1) / 2.0
                    d = abs(i - center) / max(center, 1.0)
                    ripple = max(0.0, math.sin((d * 11.0) - (t * 16.0)))
                    ripple_layer = _scale(SOFT_WHITE, (0.45 * voice_env) * ripple)

                    targets.append(_add(_add(base, sweep_layer), ripple_layer))
                elif mode == "processing":
                    think = 0.5 + 0.5 * math.sin((2 * math.pi * t) / 0.95)
                    base_color = _mix(DEEP_BLUE, PURPLE, 0.62)
                    base = _scale(base_color, 0.18 + 0.28 * think)

                    # Tight moving highlight so "thinking" feels active.
                    head = (t / 0.85) * NUM_LEDS
                    dist = abs(i - (head % NUM_LEDS))
                    dist = min(dist, NUM_LEDS - dist)
                    highlight = max(0.0, 1.0 - dist / 7.0)
                    hl_color = _mix(PURPLE, SOFT_WHITE, 0.30)
                    hl_layer = _scale(hl_color, 0.26 * highlight)

                    targets.append(_add(base, hl_layer))
                else:
                    targets.append((0.0, 0.0, 0.0))

            # Smooth frame-to-frame transitions.
            pixels: list[tuple[int, int, int]] = []
            smooth = 0.28
            for idx, target in enumerate(targets):
                cur = _led_current_pixels[idx]
                cur[0] += (target[0] - cur[0]) * smooth
                cur[1] += (target[1] - cur[1]) * smooth
                cur[2] += (target[2] - cur[2]) * smooth
                pixels.append((
                    _clamp(int(cur[0])),
                    _clamp(int(cur[1])),
                    _clamp(int(cur[2])),
                ))

            _write_pixels(spi, pixels)
            _led_stop.wait(0.03)
        _write_pixels(spi, [(0, 0, 0)] * NUM_LEDS)
        spi.close()
    except Exception as e:
        log.warning(f"LED comet error: {e}")

def _ensure_comet_running():
    """Start the LED animation loop if it's not already running."""
    global _led_thread
    if _led_thread is not None and _led_thread.is_alive():
        return
    _led_stop.clear()
    _burst_active.clear()
    for i in range(NUM_LEDS):
        _led_current_pixels[i][0] = 0.0
        _led_current_pixels[i][1] = 0.0
        _led_current_pixels[i][2] = 0.0
    _led_thread = threading.Thread(target=_comet_loop, daemon=True)
    _led_thread.start()

def _stop_comet():
    global _led_thread
    _led_stop.set()
    if _led_thread and _led_thread.is_alive():
        _led_thread.join(timeout=1.5)
    _led_thread = None
    _led_stop.clear()
    _burst_active.clear()

def _run_burst(r: int, g: int, b: int, duration: float = 2.0):
    """Sine-envelope full-strip burst (used for confirm/cancel).
    Pauses the comet loop, draws the burst, then resumes the comet — which
    will smoothly fade back toward the current target colour."""
    if not SPI_AVAILABLE:
        return
    import math
    _burst_active.set()
    time.sleep(0.05)  # let comet loop see the flag
    try:
        spi = _spi_open()
        steps = 60
        for i in range(steps):
            if _led_stop.is_set():
                break
            frac = math.sin(math.pi * i / steps)
            color = (_clamp(int(r * frac)), _clamp(int(g * frac)), _clamp(int(b * frac)))
            _write_pixels(spi, [color] * NUM_LEDS)
            _led_stop.wait(duration / steps)
        spi.close()
    except Exception as e:
        log.warning(f"LED burst error: {e}")
    finally:
        _burst_active.clear()

def _start_burst(r: int, g: int, b: int):
    global _burst_thread
    # Make sure comet is running so we have something to fade back to
    _ensure_comet_running()
    if _burst_thread and _burst_thread.is_alive():
        # Let the previous burst finish naturally; ignore overlapping requests
        return
    _burst_thread = threading.Thread(target=_run_burst, args=(r, g, b, 2.0), daemon=True)
    _burst_thread.start()

@app.post("/led/listening")
def led_listening():
    """Listening mode: breathing halo + circular sweep + voice-reactive ripple."""
    with _led_lock:
        _set_mode("listening")
        _ensure_comet_running()
    return {"ok": True, "mode": "listening"}

@app.post("/led/processing")
def led_processing():
    """Processing mode: tighter/faster pulse with purple tint."""
    with _led_lock:
        _set_mode("processing")
        _ensure_comet_running()
    return {"ok": True, "mode": "processing"}

@app.post("/led/voice-level")
async def led_voice_level(req: Request):
    """Update reactive ripple intensity from live voice level (0..100 or 0..1)."""
    try:
        body = await req.json()
    except Exception:
        body = {}
    raw = body.get("level", 0)
    try:
        level = float(raw)
    except Exception:
        level = 0.0
    if level > 1.0:
        level = level / 100.0
    _set_voice_level(level)
    return {"ok": True, "level": max(0.0, min(1.0, level))}

@app.post("/led/confirm")
def led_confirm():
    """Green burst overlays the comet, then comet resumes with current target."""
    _start_burst(0, 100, 0)
    return {"ok": True, "mode": "confirm"}

@app.post("/led/cancel")
def led_cancel():
    """Red burst overlays the comet, then comet resumes with current target."""
    _start_burst(100, 0, 0)
    return {"ok": True, "mode": "cancel"}

@app.post("/led/off")
def led_off():
    """Soft-fade LEDs down, then stop the animation loop."""
    with _led_lock:
        _set_mode("off")
        _set_voice_level(0.0)
        time.sleep(0.65)
        _stop_comet()
        if SPI_AVAILABLE:
            try:
                spi = _spi_open()
                _write_pixels(spi, [(0, 0, 0)] * NUM_LEDS)
                spi.close()
            except Exception as e:
                log.warning(f"LED off error: {e}")
    return {"ok": True, "mode": "off"}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
