import json, logging, math, struct, subprocess, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
import websocket

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('stt-bridge')

ALSA_DEVICE   = 'plughw:2,0'
RATE          = 16000
WARMUP_CHUNKS = 2   # discard first 200ms (mic click / DC offset only)

DEEPGRAM_KEY  = 'f76cd9fb7e118eebb9f99e8d6673fce38ab8e4fa'
DG_URL = (
    'wss://api.deepgram.com/v1/listen'
    '?encoding=linear16'
    f'&sample_rate={RATE}'
    '&channels=1'
    '&model=nova-2'
    '&interim_results=true'
    '&endpointing=800'
    '&utterance_end_ms=1000'
    '&vad_events=true'
)

# Wake word — "alexa" is the closest built-in model to "casa" (2-syllable, open vowel).
# To use a custom "casa" model: train with openWakeWord and set WAKE_MODEL to its path.
WAKE_MODEL    = 'alexa'
WAKE_SCORE    = 0.3    # confidence threshold
WAKE_COOLDOWN = 2.0    # seconds between triggers

# Watchdog: if no audio chunk processed for this many seconds while idle, restart arecord.
WAKE_WATCHDOG_SECS = 90

# ── STT state ────────────────────────────────────────────────────────────────
_state      = dict(recording=False, ready=False, volume=0, transcript=None,
                   interim_transcript='', error=None)
_state_lock = threading.Lock()
_rec_proc   = None
_ws         = None
_finals     = []

def _set(**kw):
    with _state_lock:
        _state.update(kw)

def _get():
    with _state_lock:
        return dict(_state)

# ── Wake word state ──────────────────────────────────────────────────────────
_wake_triggered      = False
_wake_ts             = 0.0
_wake_lock           = threading.Lock()
_wake_proc           = None
_wake_last_chunk_ts  = time.time()   # updated every audio chunk; watchdog uses this


# ── Display sleep/wake ───────────────────────────────────────────────────────
_DISPLAY = ':0'

def _display_off():
    subprocess.Popen(['xset', '-display', _DISPLAY, 'dpms', 'force', 'off'],
                     env={**__import__('os').environ, 'DISPLAY': _DISPLAY})

def _display_on():
    subprocess.Popen(['xset', '-display', _DISPLAY, 'dpms', 'force', 'on'],
                     env={**__import__('os').environ, 'DISPLAY': _DISPLAY})


# ── Wake word watchdog ────────────────────────────────────────────────────────
def _wake_watchdog():
    """Kill stale arecord if no audio chunk received for WAKE_WATCHDOG_SECS while idle.
    The wake_word_loop outer while-True will restart arecord automatically."""
    global _wake_proc, _wake_last_chunk_ts
    while True:
        time.sleep(15)
        if _get()['recording']:
            # STT owns the mic; reset timer so we don't immediately restart after STT ends
            _wake_last_chunk_ts = time.time()
            continue
        age = time.time() - _wake_last_chunk_ts
        if age > WAKE_WATCHDOG_SECS:
            log.warning(f'[wake] watchdog: no audio for {age:.0f}s — restarting arecord')
            _wake_last_chunk_ts = time.time()  # prevent rapid re-triggers
            proc = _wake_proc
            if proc:
                try:
                    proc.terminate()
                    proc.wait(timeout=2)
                except Exception:
                    pass


def _wake_word_loop():
    """Always-on wake word detection using arecord subprocess.
    plughw handles rate conversion so 16kHz works with the 48kHz INMP441.
    Stops arecord when STT is recording to avoid ALSA device contention."""
    global _wake_triggered, _wake_ts, _wake_last_chunk_ts
    try:
        import numpy as np
        from openwakeword.model import Model as WakeModel
    except ImportError as e:
        log.warning(f'[wake] dependencies missing ({e}) — wake word disabled')
        return

    log.info(f'[wake] loading model "{WAKE_MODEL}"...')
    try:
        model = WakeModel(wakeword_models=[WAKE_MODEL], inference_framework='onnx')
    except Exception as e:
        log.error(f'[wake] failed to load model: {e}')
        return
    log.info('[wake] ready — listening for wake word...')

    CHUNK_BYTES = 1280 * 2  # 1280 S16_LE samples = 80ms @ 16kHz

    while True:
        # Wait until STT is idle before grabbing the mic
        while _get()['recording']:
            time.sleep(0.2)

        _wake_last_chunk_ts = time.time()  # reset on fresh arecord start
        proc = subprocess.Popen(
            ['arecord', '-D', ALSA_DEVICE, '-f', 'S16_LE', '-r', str(RATE), '-c', '1', '-'],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
        )
        global _wake_proc
        _wake_proc = proc
        log.info('[wake] arecord started')
        try:
            while True:
                if _get()['recording']:
                    break  # STT started — yield mic
                raw = proc.stdout.read(CHUNK_BYTES)
                if not raw or len(raw) < CHUNK_BYTES:
                    time.sleep(0.1)
                    break
                _wake_last_chunk_ts = time.time()  # heartbeat: audio is flowing
                audio_np = np.frombuffer(raw, dtype=np.int16)
                prediction = model.predict(audio_np)
                score = max(prediction.get(WAKE_MODEL, 0),
                            prediction.get(f'{WAKE_MODEL}_v0.1', 0))

                if score > 0.05:
                    log.info(f'[wake] score={score:.3f}')
                if score >= WAKE_SCORE:
                    now = time.time()
                    if now - _wake_ts >= WAKE_COOLDOWN:
                        log.info(f'[wake] triggered! score={score:.2f}')
                        _display_on()
                        with _wake_lock:
                            _wake_triggered = True
                            _wake_ts = now
        except Exception as e:
            log.error(f'[wake] inner error: {e}')
        finally:
            _wake_proc = None
            try:
                proc.terminate()
                proc.wait(timeout=1)
            except Exception:
                pass
        log.info('[wake] arecord stopped — restarting...')
        time.sleep(0.5)  # brief pause before restarting to avoid tight crash loops

# ── STT functions ─────────────────────────────────────────────────────────────
def _on_message(ws, message):
    global _finals
    try:
        data = json.loads(message)
        msg_type = data.get('type', '')

        if msg_type == 'SpeechStarted':
            log.info('[DG] SpeechStarted')
            return

        if msg_type == 'UtteranceEnd':
            full = ' '.join(_finals).strip()
            if full:
                log.info(f'[DG] UtteranceEnd -> "{full}"')
                _finals = []
                _set(transcript=full, interim_transcript='', recording=False)
            return

        if msg_type != 'Results':
            return

        alt        = data['channel']['alternatives'][0]
        text       = alt.get('transcript', '').strip()
        is_final   = data.get('is_final', False)
        spch_final = data.get('speech_final', False)

        if spch_final:
            if text:
                _finals.append(text)
            full = ' '.join(_finals).strip()
            _finals = []
            if full:
                log.info(f'[DG] speech_final -> "{full}"')
                _set(transcript=full, interim_transcript='', recording=False)
        elif is_final and text:
            _finals.append(text)
            _set(interim_transcript=' '.join(_finals))
        elif text:
            _set(interim_transcript=(' '.join(_finals) + ' ' + text).strip())
    except Exception as e:
        log.error(f'on_message: {e}')

def _on_error(ws, error):
    log.error(f'ws error: {error}')
    _set(error=str(error), recording=False, ready=False)

def _on_close(ws, code, msg):
    log.info(f'ws closed {code}')
    stop_recording()

def _stream_audio(proc, ws):
    chunk_bytes = (RATE // 10) * 2   # 100ms of S16_LE mono
    warmup = 0
    try:
        while True:
            with _state_lock:
                still_recording = _state['recording']
            if not still_recording:
                break
            raw = proc.stdout.read(chunk_bytes)
            if not raw or len(raw) < chunk_bytes:
                break
            warmup += 1
            if warmup <= WARMUP_CHUNKS:
                continue
            samples = struct.unpack(f'<{len(raw)//2}h', raw)
            rms = math.sqrt(sum(s*s for s in samples) / len(samples))
            _set(volume=int(min(rms / 70, 100)))
            try:
                ws.send(raw, websocket.ABNF.OPCODE_BINARY)
            except Exception as e:
                log.error(f'send_binary failed: {e}')
                break
    finally:
        _set(volume=0)
        log.info('[stream_audio] thread exited')

def start_recording():
    global _rec_proc, _ws, _finals, _wake_proc
    if _wake_proc:
        try:
            _wake_proc.terminate()
            _wake_proc.wait(timeout=1)
        except Exception:
            pass
        _wake_proc = None
    _finals = []
    _set(recording=False, ready=False, transcript=None, interim_transcript='', error=None, volume=0)

    ws_ready = threading.Event()

    def _on_open(ws):
        log.info('[WS] connected — starting audio stream')
        _set(recording=True, ready=True)
        ws_ready.set()

    ws = websocket.WebSocketApp(
        DG_URL,
        header={'Authorization': f'Token {DEEPGRAM_KEY}'},
        on_open=_on_open,
        on_message=_on_message,
        on_error=_on_error,
        on_close=_on_close,
    )
    _ws = ws

    proc = subprocess.Popen(
        ['arecord', '-D', ALSA_DEVICE, '-f', 'S16_LE', '-r', str(RATE), '-c', '1', '-'],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
    )
    _rec_proc = proc

    threading.Thread(target=ws.run_forever, daemon=True).start()

    def _deferred_stream():
        if ws_ready.wait(timeout=5):
            log.info('[stream] WS ready, streaming audio...')
            _stream_audio(proc, ws)
        else:
            log.error('[stream] WS did not connect within 5s')
            _set(error='WS connect timeout', recording=False, ready=False)

    threading.Thread(target=_deferred_stream, daemon=True).start()
    log.info('[bridge] started — waiting for WS...')

def stop_recording():
    global _rec_proc, _ws
    if _rec_proc:
        try:
            _rec_proc.terminate()
            _rec_proc.wait(timeout=2)
        except Exception:
            try: _rec_proc.kill()
            except Exception: pass
        _rec_proc = None
    if _ws:
        try: _ws.close()
        except: pass
        _ws = None
    _set(recording=False, ready=False, volume=0)
    log.info('[bridge] stopped')

# ── HTTP server ───────────────────────────────────────────────────────────────
class ReuseHTTPServer(HTTPServer):
    allow_reuse_address = True

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200); self._cors(); self.end_headers()

    def do_POST(self):
        if self.path == '/start':
            stop_recording(); start_recording()
            self.send_response(200); self._cors()
            self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(b'{"ok":true}')
        elif self.path == '/display/off':
            _display_off()
            self.send_response(200); self._cors()
            self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(b'{"ok":true}')
        elif self.path == '/stop':
            stop_recording()
            self.send_response(200); self._cors()
            self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(b'{"ok":true}')
        else:
            self.send_response(404); self.end_headers()

    def do_GET(self):
        if self.path.startswith('/status'):
            s = _get()
            self.send_response(200); self._cors()
            self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(json.dumps(s).encode())
        elif self.path == '/wake-poll':
            # Returns {triggered: true} once if wake word fired within last 3s, then clears
            global _wake_triggered
            with _wake_lock:
                triggered = _wake_triggered and (time.time() - _wake_ts < 3.0)
                if triggered:
                    _wake_triggered = False
            self.send_response(200); self._cors()
            self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(json.dumps({'triggered': triggered}).encode())
        else:
            self.send_response(404); self.end_headers()

if __name__ == '__main__':
    threading.Thread(target=_wake_word_loop, daemon=True).start()
    threading.Thread(target=_wake_watchdog, daemon=True).start()
    log.info('DeepGram STT bridge on :8766')
    ReuseHTTPServer(('127.0.0.1', 8766), Handler).serve_forever()
