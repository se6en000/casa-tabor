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
REG_ATIME    = 0x81   # integration time steps (0xFF = max ~182ms/cycle)
REG_ASTEP    = 0xD4   # integration time step size (LSB=2.78µs, 0x3E7 = ~2.8ms/step)
REG_CFG1     = 0xAA   # gain
REG_STATUS2  = 0xA3   # data-ready flag
REG_CH0_LOW  = 0x95   # first of 18 channel bytes (9 × 16-bit LE pairs)

GAIN_512X    = 0x0A   # sufficient indoors, adjust if saturating

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


# ── CCT + lux math ──────────────────────────────────────────────────────────

def channels_to_cct_lux(ch: dict) -> tuple[float, float]:
    """
    Estimate CCT and lux from AS7343 channel counts.

    CCT: uses the ratio of short-wave blue (F1/F2) to long-wave red (FXL).
    The mapping is empirically calibrated to typical indoor lighting:
      high ratio → cool (6500K), low ratio → warm (2700K).

    Lux: approximated from the photopic-weighted visible channels.
    These are coarse estimates; a full calibration requires known light sources,
    but the mapping is accurate enough to drive smooth Room Tone transitions.
    """
    f1  = max(ch.get("F1",  1), 1)
    f2  = max(ch.get("F2",  1), 1)
    fxl = max(ch.get("FXL", 1), 1)
    fy  = max(ch.get("FY",  1), 1)
    f5  = max(ch.get("F5",  1), 1)
    nir = max(ch.get("NIR", 1), 1)

    # Blue-to-red ratio → CCT
    blue = (f1 + f2) / 2
    red  = fxl
    ratio = blue / red

    # Empirical sigmoid mapping: ratio ~0.1 → 2700K, ratio ~2.0+ → 6500K
    cct = 2700 + 3800 * (1 - 1 / (1 + ratio * 2))
    cct = max(2700, min(6500, cct))

    # Approximate lux: photopic weighting (green/yellow dominant for human eye)
    # Subtract NIR which doesn't contribute to visible brightness perception
    visible = fy + f5 - 0.2 * nir
    lux = max(0.0, visible * 0.001)  # scale factor; adjust with known-lux calibration

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
        # Power on + enable spectral measurement (PON=1, SP_EN=1)
        self.bus.write_byte_data(AS7343_ADDR, REG_ENABLE, 0x03)
        # Integration time: ATIME=29 steps, ASTEP=599 → ~50ms cycle
        self.bus.write_byte_data(AS7343_ADDR, REG_ATIME, 29)
        self.bus.write_word_data(AS7343_ADDR, REG_ASTEP, 599)
        # Gain 512×
        self.bus.write_byte_data(AS7343_ADDR, REG_CFG1, GAIN_512X)
        log.info("AS7343 initialised on I2C bus %d at 0x%02X", I2C_BUS, AS7343_ADDR)

    def _wait_data_ready(self, timeout=0.5):
        deadline = time.time() + timeout
        while time.time() < deadline:
            status = self.bus.read_byte_data(AS7343_ADDR, REG_STATUS2)
            if status & 0x40:  # AVALID bit
                return True
            time.sleep(0.01)
        return False

    def read(self) -> dict:
        if self.bus is None:
            self._open()

        if not self._wait_data_ready():
            raise RuntimeError("AS7343 data-ready timeout")

        # Read 18 bytes = 9 × 16-bit channels
        raw = self.bus.read_i2c_block_data(AS7343_ADDR, REG_CH0_LOW, 18)
        channels = {}
        for i, name in enumerate(CH_NAMES):
            lo = raw[i * 2]
            hi = raw[i * 2 + 1]
            channels[name] = (hi << 8) | lo

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
