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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sensor-bridge")

SUPABASE_URL = "https://sjiejymuuuqzqukyeagk.supabase.co"
SUPABASE_SERVICE_KEY = "sb_secret_HpkjyskE55sDH_hLNKEK1g_BVrA7f2U"
SUPABASE_SENSOR_ID  = "00000000-0000-0000-0000-000000000001"  # fixed row for latest reading

_push_enabled       = False   # cached value of display_config.sensor_push_enabled
_push_checked_at    = 0.0     # epoch time of last config check
PUSH_CHECK_INTERVAL = 15      # re-read Supabase config every 15s

def _is_push_enabled() -> bool:
    """Return True if sensor_push_enabled is set in display_config. Caches for 15s.
    Also refreshes brightness_min/brightness_max from config."""
    global _push_enabled, _push_checked_at, _brightness_min, _brightness_max
    now = time.time()
    if now - _push_checked_at < PUSH_CHECK_INTERVAL:
        return _push_enabled
    try:
        res = _requests.get(
            f"{SUPABASE_URL}/rest/v1/settings",
            params={"key": "eq.display_config", "select": "value"},
            headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
            timeout=3,
        )
        rows = res.json()
        if rows and isinstance(rows, list):
            cfg = rows[0].get("value", {})
            _push_enabled   = bool(cfg.get("sensor_push_enabled", False))
            _brightness_min = int(cfg.get("brightness_min", BRIGHTNESS_MIN_DEFAULT))
            _brightness_max = int(cfg.get("brightness_max", BRIGHTNESS_MAX_DEFAULT))
        log.info("Push config refreshed — sensor_push_enabled=%s min=%d max=%d",
                 _push_enabled, _brightness_min, _brightness_max)
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

# ── Layer 1: DDC/CI monitor brightness ───────────────────────────────────────
# Two dedicated threads:
#   _brightness_loop — runs every 250 ms, rubber-bands toward _target_brightness
#   _color_loop      — runs every 750 ms, steps RGB gains toward _target_rgb
#
# Brightness is computed continuously from lux using a power-law curve
# (approximates human eye perception) — no zone step-table.
#   brightness = min_b + (max_b - min_b) × (lux / LUX_REF) ^ LUX_EXPONENT
#   LUX_REF=1000, EXPONENT=0.35 → lux=0.3→~3%, lux=30→~20%, lux=200→~45%, lux=1000→max_b

LUX_REF      = 1000.0   # lux at which brightness reaches max_b
LUX_EXPONENT = 0.35     # power-law exponent (0.35 ≈ human eye response)

# Defaults — overridden by display_config.brightness_min / brightness_max from Supabase
BRIGHTNESS_MIN_DEFAULT = 2
BRIGHTNESS_MAX_DEFAULT = 90

# Cached min/max read from Supabase alongside push-enabled config
_brightness_min = BRIGHTNESS_MIN_DEFAULT
_brightness_max = BRIGHTNESS_MAX_DEFAULT

BRIGHTNESS_INTERVAL = 0.25   # seconds between brightness DDC ticks
COLOR_INTERVAL      = 0.75   # seconds between color DDC ticks

# Rubber-band step: gap ≥ 20 → jump 8 pts; gap ≥ 5 → jump 4; else 1
# This gives fast catch-up when light changes a lot, smooth glide near target.
def _brightness_step(current: int, target: int) -> int:
    gap = abs(target - current)
    if gap >= 20:
        step = 8
    elif gap >= 5:
        step = 4
    else:
        step = 1
    delta = step if target > current else -step
    nxt = current + delta
    if (delta > 0 and nxt > target) or (delta < 0 and nxt < target):
        nxt = target
    return nxt

_ddc_lock           = threading.Lock()
_current_brightness = None   # last brightness value written to monitor
_target_brightness  = None   # desired brightness based on current zone

# RGB gain state (VCP 0x16=R, 0x18=G, 0x1A=B; range 0–100, neutral=50)
_current_rgb = None            # (r, g, b) last written
_target_rgb  = None            # (r, g, b) desired


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


def _ddc_write_single(vcp: str, value: int):
    """Write one VCP code via ddcutil (blocking ~200 ms)."""
    subprocess.run(
        ["sudo", "ddcutil", "setvcp", vcp, str(value)],
        timeout=5, capture_output=True
    )


def _ddc_write(value: int):
    """Write brightness (VCP 0x10) to monitor."""
    _ddc_write_single("10", value)


def _ddc_write_rgb(r: int, g: int, b: int):
    """Write RGB gains to monitor (3 sequential DDC calls ~600 ms total)."""
    _ddc_write_single("16", r)
    _ddc_write_single("18", g)
    _ddc_write_single("1a", b)


def set_brightness_target(lux: float):
    """Compute target brightness from lux using power-law curve and update target."""
    global _target_brightness
    ratio = min(lux / LUX_REF, 1.0)
    mapped = _brightness_min + (_brightness_max - _brightness_min) * (ratio ** LUX_EXPONENT)
    _target_brightness = max(_brightness_min, min(_brightness_max, round(mapped)))


def set_color_target(cct: float):
    """Called by sensor poll — converts CCT to RGB gains and updates target."""
    global _target_rgb
    if cct is not None:
        _target_rgb = cct_to_rgb_gains(cct)


def _brightness_loop():
    """Dedicated thread: rubber-bands monitor brightness toward _target_brightness every 250 ms."""
    global _current_brightness
    while True:
        time.sleep(BRIGHTNESS_INTERVAL)
        with _ddc_lock:
            b_target  = _target_brightness
            b_current = _current_brightness

        if b_target is None:
            continue

        if b_current is None:
            try:
                _ddc_write(b_target)
                with _ddc_lock:
                    _current_brightness = b_target
                log.info("DDC brightness init → %d", b_target)
            except Exception as exc:
                log.warning("DDC brightness init failed: %s", exc)
            continue

        if b_current != b_target:
            next_val = _brightness_step(b_current, b_target)
            try:
                _ddc_write(next_val)
                with _ddc_lock:
                    _current_brightness = next_val
                log.debug("DDC brightness %d → %d (target %d)", b_current, next_val, b_target)
            except Exception as exc:
                log.warning("DDC brightness step failed: %s", exc)


def _color_loop():
    """Dedicated thread: steps RGB gains toward _target_rgb every 750 ms."""
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
        time.sleep(COLOR_INTERVAL)
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

        self._wait_data_ready()

        # Read 18 bytes = 9 × 16-bit channels (LE pairs)
        raw = self.bus.read_i2c_block_data(AS7343_ADDR, REG_CH0_LOW, 18)
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
            self.bus.close()
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
    while True:
        try:
            data = reader.read()
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
            log.error("Sensor read error: %s", exc)
            with _lock:
                _latest["error"] = str(exc)
        time.sleep(POLL_INTERVAL)


# ── FastAPI app ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    reader = AS7343Reader() if I2C_AVAILABLE else SimulatedReader()
    thread = threading.Thread(target=_poll_loop, args=(reader,), daemon=True)
    thread.start()
    brightness_thread = threading.Thread(target=_brightness_loop, daemon=True)
    brightness_thread.start()
    color_thread = threading.Thread(target=_color_loop, daemon=True)
    color_thread.start()
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
    return {
        "cct":        data["cct"],
        "lux":        data["lux"],
        "zone":       data["zone"],
        "error":      data["error"],
        "timestamp":  data["timestamp"],
        "brightness": brightness,
        "rgb":        rgb,
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


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
