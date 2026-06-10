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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sensor-bridge")

SUPABASE_URL = "https://sjiejymuuuqzqukyeagk.supabase.co"
SUPABASE_SERVICE_KEY = "sb_secret_HpkjyskE55sDH_hLNKEK1g_BVrA7f2U"
SUPABASE_SENSOR_ID  = "00000000-0000-0000-0000-000000000001"  # fixed row for latest reading

_push_enabled           = False
_push_checked_at        = 0.0
_push_enabled_since     = 0.0   # when push was last turned on (0 = not active)
PUSH_CHECK_INTERVAL     = 15
PUSH_AUTO_DISABLE_S     = 600   # auto-disable push after 10 minutes
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
        log.info("Push auto-disabled and sensor_readings row cleared")
    except Exception as exc:
        log.warning("Auto-disable failed: %s", exc)

def _is_push_enabled() -> bool:
    """Return True if sensor_push_enabled is set in display_config. Caches for 15s.
    Also refreshes brightness_min/brightness_max and auto-sleep config.
    Auto-disables push after PUSH_AUTO_DISABLE_S to limit DB writes."""
    global _push_enabled, _push_checked_at, _push_enabled_since
    global _brightness_min, _brightness_max
    global _auto_sleep_enabled, _sleep_lux_threshold, _wake_lux_threshold, _sleep_delay_s
    now = time.time()
    if now - _push_checked_at < PUSH_CHECK_INTERVAL:
        # Still apply auto-disable timer between fetches
        if _push_enabled and _push_enabled_since and (now - _push_enabled_since) > PUSH_AUTO_DISABLE_S:
            log.info("Push auto-disabled after %ds — clearing DB", PUSH_AUTO_DISABLE_S)
            _push_enabled = False
            _push_enabled_since = 0.0
            threading.Thread(target=_disable_push_remotely, daemon=True).start()
        return _push_enabled
    try:
        res = _requests.get(
            f"{SUPABASE_URL}/rest/v1/settings",
            params={"key": f"eq.{SUPABASE_SETTINGS_KEY}", "select": "value"},
            headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
            timeout=3,
        )
        rows = res.json()
        if rows and isinstance(rows, list):
            cfg = rows[0].get("value", {})
            new_push_enabled     = bool(cfg.get("sensor_push_enabled", False))
            # Track when push was turned on (for auto-disable timer)
            if new_push_enabled and not _push_enabled:
                _push_enabled_since = now
                log.info("Push enabled — will auto-disable in %ds", PUSH_AUTO_DISABLE_S)
            elif not new_push_enabled and _push_enabled:
                _push_enabled_since = 0.0
                # User disabled — clear the row
                threading.Thread(target=_disable_push_remotely, daemon=True).start()
            _push_enabled        = new_push_enabled
            _brightness_min      = int(cfg.get("brightness_min", BRIGHTNESS_MIN_DEFAULT))
            _brightness_max      = int(cfg.get("brightness_max", BRIGHTNESS_MAX_DEFAULT))
            _auto_sleep_enabled  = bool(cfg.get("auto_sleep_enabled", True))
            _sleep_lux_threshold = float(cfg.get("sleep_lux_threshold", 0.5))
            _wake_lux_threshold  = float(cfg.get("wake_lux_threshold", 3.0))
            _sleep_delay_s       = int(cfg.get("sleep_delay_s", 30))
        # Auto-disable check
        if _push_enabled and _push_enabled_since and (now - _push_enabled_since) > PUSH_AUTO_DISABLE_S:
            log.info("Push auto-disabled after %ds — clearing DB", PUSH_AUTO_DISABLE_S)
            _push_enabled = False
            _push_enabled_since = 0.0
            threading.Thread(target=_disable_push_remotely, daemon=True).start()
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

# Channel layout returned starting at REG_CH0_LOW (9 channels × 2 bytes):
# 0:F1(405nm) 1:F2(425nm) 2:FZ(450nm) 3:F3(475nm) 4:F4(515nm)
# 5:FY(555nm) 6:F5(550nm) 7:FXL(600nm) 8:NIR(855nm)
CH_NAMES = ["F1","F2","FZ","F3","F4","FY","F5","FXL","NIR"]

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
# Brightness formula (power-law, mirrors human eye):
#   brightness = min_b + (max_b - min_b) × (lux / LUX_REF) ^ LUX_EXPONENT

DDC_I2C_BUS  = 14      # /dev/i2c-14 is the HDMI DDC bus on this Pi
DDC_ADDR     = 0x37    # DDC/CI slave address (standard)
DDC_SRC      = 0x51    # host source address (standard DDC/CI)

LUX_REF      = 1000.0  # lux at which brightness reaches max_b
LUX_EXPONENT = 0.35    # power-law exponent (0.35 ≈ human eye response)

BRIGHTNESS_MIN_DEFAULT = 2
BRIGHTNESS_MAX_DEFAULT = 90

_brightness_min = BRIGHTNESS_MIN_DEFAULT
_brightness_max = BRIGHTNESS_MAX_DEFAULT

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
    for i in range(1, BURST_STEPS + 1):
        val = round(target_brightness * i / BURST_STEPS)
        val = max(_brightness_min, min(_brightness_max, val))
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
    """Map lux → DDC brightness % using power-law curve."""
    ratio = min(max(lux, 0.0) / LUX_REF, 1.0)
    mapped = _brightness_min + (_brightness_max - _brightness_min) * (ratio ** LUX_EXPONENT)
    return max(_brightness_min, min(_brightness_max, round(mapped)))


def set_brightness_target(lux: float):
    """Called every 500 ms by sensor poll — updates brightness target from lux."""
    global _target_brightness
    _target_brightness = lux_to_brightness(lux)


def set_color_target(cct: float):
    """Called by sensor poll — converts CCT to RGB gains and updates target."""
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
        for i in range(1, BURST_STEPS + 1):
            t = i / BURST_STEPS
            val = round(start + (end - start) * t)
            val = max(_brightness_min, min(_brightness_max, val))
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

        if delta >= round((_brightness_max - _brightness_min) * LUX_BURST_THRESH / LUX_REF ** LUX_EXPONENT / 10):
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
    Estimate CCT and lux from AS7343 channel counts.

    CCT: uses the ratio of short-wave violet/blue (F1/F2, ~405-425nm) to
    mid-green/yellow (FY, ~555nm). Cool white light has more blue relative
    to green; warm incandescent has much less blue vs green.

    Lux: dominated by the photopic peak at ~555nm (FY channel).

    Note: FXL (600nm red) and NIR may read zero until full SMUX configuration
    is confirmed — FY-based CCT is robust for typical indoor lighting.
    """
    f1  = max(ch.get("F1",  1), 1)
    f2  = max(ch.get("F2",  1), 1)
    fz  = max(ch.get("FZ",  1), 1)
    fy  = max(ch.get("FY",  1), 1)
    fxl = ch.get("FXL", 0)
    nir = ch.get("NIR", 0)

    # Blue/violet to green ratio → CCT
    # If FXL (red) is available, use it for better warm-end accuracy
    blue   = (f1 + f2 + fz) / 3
    anchor = fxl if fxl > 10 else fy  # prefer red; fall back to green
    ratio  = blue / max(anchor, 1)

    # Empirical mapping: low ratio (warm/dim) → 2700K, high ratio → 6500K
    if fxl > 10:
        # blue-to-red ratio: ~0.05 = 2700K, ~1.5+ = 6500K
        cct = 2700 + 3800 * (1 - 1 / (1 + ratio * 3))
    else:
        # blue-to-green ratio: ~0.01 = 2700K, ~0.3+ = 6500K
        cct = 2700 + 3800 * (1 - 1 / (1 + ratio * 10))

    cct = max(2700, min(6500, cct))

    # Lux: FY is the best single photopic proxy; scale factor needs calibration
    visible = fy - 0.2 * max(nir, 0)
    lux = max(0.0, visible * 0.001)

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

            # Read 18 bytes = 9 × 16-bit channels (LE pairs)
            raw = self.bus.read_i2c_block_data(AS7343_ADDR, REG_CH0_LOW, 18)
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
            # Push to Supabase so any device (not just localhost) can read it
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
    allow_methods=["GET"],
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
    """DEV ONLY: kill kiosk Chromium and relaunch in windowed mode."""
    import os, signal
    try:
        # Find and kill all chromium processes
        result = subprocess.run(["pgrep", "-f", "chromium"], capture_output=True, text=True)
        pids = [int(p) for p in result.stdout.strip().split() if p.isdigit()]
        for pid in pids:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        # Relaunch after a short delay with KIOSK=0
        def _relaunch():
            import time
            time.sleep(1.5)
            env = os.environ.copy()
            env["KIOSK"] = "0"
            env["DISPLAY"] = ":0"
            env["WAYLAND_DISPLAY"] = "wayland-1"
            subprocess.Popen(
                ["bash", "/home/jake/start-casa.sh"],
                env=env,
                stdout=open("/home/jake/casa.log", "a"),
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        threading.Thread(target=_relaunch, daemon=True).start()
        return {"ok": True, "msg": "Relaunching in windowed mode..."}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ---------------------------------------------------------------------------
# LED Strip (WS2812B via SPI MOSI — GPIO 10, /dev/spidev0.0)
# ---------------------------------------------------------------------------
NUM_LEDS      = 60
LED_MAX_BRIGHT = 128   # hard cap to protect Pi 5V rail (50% = ~1.8A max)
_led_lock     = threading.Lock()
_led_stop     = threading.Event()
_led_thread: threading.Thread | None = None

def _spi_open():
    spi = _spidev.SpiDev()
    spi.open(0, 0)
    spi.max_speed_hz = 3_200_000
    spi.mode = 0
    return spi

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

def _stop_led_animation():
    global _led_thread
    _led_stop.set()
    if _led_thread and _led_thread.is_alive():
        _led_thread.join(timeout=1.0)
    _led_stop.clear()

def _comet(spi, stop_event, r: int, g: int, b: int, speed: float = 1.2, tail: int = 12):
    """Bouncing comet — travels from one end to the other and back."""
    pos = 0.0
    direction = 1
    while not stop_event.is_set():
        pixels = []
        for i in range(NUM_LEDS):
            dist = (pos - i) if direction == 1 else (i - pos)
            if 0 <= dist < tail:
                frac = 1 - dist / tail
                pixels.append((_clamp(int(r * frac)), _clamp(int(g * frac)), _clamp(int(b * frac))))
            else:
                pixels.append((0, 0, 0))
        _write_pixels(spi, pixels)
        pos += speed * direction
        if pos >= NUM_LEDS - 1:
            pos = NUM_LEDS - 1
            direction = -1
        elif pos <= 0:
            pos = 0
            direction = 1
        stop_event.wait(0.03)

def _run_listening():
    """Rolling blue comet."""
    if not SPI_AVAILABLE:
        return
    try:
        spi = _spi_open()
        _comet(spi, _led_stop, r=0, g=0, b=70)
        _write_pixels(spi, [(0, 0, 0)] * NUM_LEDS)
        spi.close()
    except Exception as e:
        log.warning(f"LED listening error: {e}")

def _run_processing():
    """Rolling amber comet while AI is thinking."""
    if not SPI_AVAILABLE:
        return
    try:
        spi = _spi_open()
        _comet(spi, _led_stop, r=80, g=35, b=0, speed=1.0)
        _write_pixels(spi, [(0, 0, 0)] * NUM_LEDS)
        spi.close()
    except Exception as e:
        log.warning(f"LED processing error: {e}")

def _run_confirm():
    """Green burst: dim→bright→dim over ~2s, then return to listening."""
    if not SPI_AVAILABLE:
        return
    import math
    try:
        spi = _spi_open()
        steps = 60
        for i in range(steps):
            if _led_stop.is_set():
                break
            # sine envelope: 0→1→0 over the burst
            frac = math.sin(math.pi * i / steps)
            brightness = _clamp(int(100 * frac))
            _write_pixels(spi, [(0, brightness, 0)] * NUM_LEDS)
            _led_stop.wait(2.0 / steps)
        _write_pixels(spi, [(0, 0, 0)] * NUM_LEDS)
        spi.close()
    except Exception as e:
        log.warning(f"LED confirm error: {e}")
    # Chain back to listening unless something else stopped us
    if not _led_stop.is_set():
        _start_led_nowait(_run_listening)

def _run_cancel():
    """Red sine burst dim→bright→dim over 2s, then return to listening."""
    if not SPI_AVAILABLE:
        return
    import math
    try:
        spi = _spi_open()
        steps = 60
        for i in range(steps):
            if _led_stop.is_set():
                break
            frac = math.sin(math.pi * i / steps)
            brightness = _clamp(int(100 * frac))
            _write_pixels(spi, [(brightness, 0, 0)] * NUM_LEDS)
            _led_stop.wait(2.0 / steps)
        _write_pixels(spi, [(0, 0, 0)] * NUM_LEDS)
        spi.close()
    except Exception as e:
        log.warning(f"LED cancel error: {e}")
    if not _led_stop.is_set():
        _start_led_nowait(_run_listening)

def _start_led_nowait(target, *args):
    """Start a new LED animation from within an animation thread (no lock, no join)."""
    global _led_thread, _led_stop
    _led_stop = threading.Event()
    t = threading.Thread(target=target, args=args, daemon=True)
    _led_thread = t
    t.start()

def _start_led(target, *args):
    global _led_thread
    with _led_lock:
        _stop_led_animation()
        _led_thread = threading.Thread(target=target, args=args, daemon=True)
        _led_thread.start()

@app.post("/led/listening")
def led_listening():
    """Start rolling blue comet — AI is listening."""
    _start_led(_run_listening)
    return {"ok": True, "mode": "listening"}

@app.post("/led/processing")
def led_processing():
    """Rolling amber comet — AI is thinking."""
    _start_led(_run_processing)
    return {"ok": True, "mode": "processing"}

@app.post("/led/confirm")
def led_confirm():
    """Green burst dim→bright→dim, then back to listening."""
    _start_led(_run_confirm)
    return {"ok": True, "mode": "confirm"}

@app.post("/led/cancel")
def led_cancel():
    """Red flash, then back to listening."""
    _start_led(_run_cancel)
    return {"ok": True, "mode": "cancel"}

@app.post("/led/off")
def led_off():
    """Turn all LEDs off."""
    _stop_led_animation()
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
