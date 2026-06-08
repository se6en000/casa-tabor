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
from contextlib import asynccontextmanager

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

POLL_INTERVAL = 3.0  # seconds between readings

# ── Layer 1: DDC/CI monitor brightness ───────────────────────────────────────
# Target brightness (0-100) per zone — applied via ddcutil to the physical
# monitor backlight. Transitions feel smooth because we step ±2 per poll.

ZONE_BRIGHTNESS = {
    "day":        80,
    "afternoon":  65,
    "evening":    45,
    "night":      25,
    "late-night": 10,
}

_ddc_lock           = threading.Lock()
_current_brightness = None   # last value we set; None = unknown


def _ddc_set_brightness(target: int):
    """Set monitor brightness via ddcutil. Runs in background thread."""
    global _current_brightness
    with _ddc_lock:
        if _current_brightness == target:
            return
        try:
            import subprocess
            subprocess.run(
                ["sudo", "ddcutil", "setvcp", "10", str(target)],
                timeout=5, capture_output=True
            )
            _current_brightness = target
            log.info("DDC brightness → %d", target)
        except Exception as exc:
            log.warning("DDC set failed: %s", exc)


def _smooth_brightness(zone: str):
    """Step toward target brightness by at most 5 points per poll."""
    global _current_brightness
    target = ZONE_BRIGHTNESS.get(zone)
    if target is None:
        return
    if _current_brightness is None:
        _current_brightness = target
        _ddc_set_brightness(target)
        return
    step = max(-5, min(5, target - _current_brightness))
    if step != 0:
        _ddc_set_brightness(_current_brightness + step)


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
            # Layer 1: adjust monitor backlight to match zone
            _smooth_brightness(data["zone"])
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
    return {
        "cct":       data["cct"],
        "lux":       data["lux"],
        "zone":      data["zone"],
        "error":     data["error"],
        "timestamp": data["timestamp"],
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
