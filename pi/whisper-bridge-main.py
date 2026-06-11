import json, logging, math, struct, subprocess, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
import websocket
from websockets.sync.server import serve as ws_serve

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('stt-bridge')

ALSA_DEVICE   = 'plughw:2,0'
RATE          = 16000
WARMUP_CHUNKS = 2

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

WAKE_MODEL    = 'alexa'
WAKE_SCORE    = 0.3
WAKE_COOLDOWN = 2.0
WAKE_WATCHDOG_SECS = 90

# ── STT state ────────────────────────────────────────────────────────────────
_state      = dict(recording=False, ready=False, volume=0, transcript=None,
                   interim_transcript='', error=None)
_state_lock = threading.Lock()
_rec_proc   = None
_ws         = None          # current DeepGram WebSocketApp
_ws_gen     = 0             # incremented on each start_recording(); guards stale _on_close
_finals     = []

def _set(**kw):
    with _state_lock:
        _state.update(kw)

def _get():
    with _state_lock:
        return dict(_state)

# ── WebSocket server state ───────────────────────────────────────────────────
_ws_clients: set = set()
_ws_clients_lock = threading.Lock()
_stt_client = None   # browser WS that owns the current STT session
_stt_lock   = threading.Lock()

def _ws_push_all(msg: dict):
    data = json.dumps(msg)
    with _ws_clients_lock:
        dead = set()
        for c in _ws_clients:
            try:
                c.send(data)
            except Exception:
                dead.add(c)
        _ws_clients.difference_update(dead)

def _ws_push_stt(msg: dict):
    global _stt_client
    with _stt_lock:
        client = _stt_client
    if client is None:
        return
    data = json.dumps(msg)
    try:
        client.send(data)
    except Exception:
        with _stt_lock:
            _stt_client = None

def _handle_ws_client(ws):
    global _stt_client
    with _ws_clients_lock:
        _ws_clients.add(ws)
    log.info('[WS] browser client connected')
    try:
        for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            cmd = msg.get('type', '')
            if cmd == 'start':
                with _stt_lock:
                    _stt_client = ws
                stop_recording()
                start_recording()
            elif cmd == 'stop':
                with _stt_lock:
                    if _stt_client is ws:
                        _stt_client = None
                stop_recording()
    except Exception as e:
        log.error(f'[WS] browser client error: {e}')
    finally:
        with _ws_clients_lock:
            _ws_clients.discard(ws)
        with _stt_lock:
            if _stt_client is ws:
                _stt_client = None
        log.info('[WS] browser client disconnected')

def _run_ws_server():
    log.info('WebSocket bridge on :8767')
    while True:
        try:
            with ws_serve(_handle_ws_client, '127.0.0.1', 8767) as server:
                server.serve_forever()
        except OSError as e:
            log.error(f'[WS server] error: {e} — retrying in 2s')
            time.sleep(2)

# ── Wake word state ──────────────────────────────────────────────────────────
_wake_triggered      = False
_wake_ts             = 0.0
_wake_lock           = threading.Lock()
_wake_proc           = None
_wake_last_chunk_ts  = time.time()

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
    global _wake_proc, _wake_last_chunk_ts
    while True:
        time.sleep(15)
        if _get()['recording']:
            _wake_last_chunk_ts = time.time()
            continue
        age = time.time() - _wake_last_chunk_ts
        if age > WAKE_WATCHDOG_SECS:
            log.warning(f'[wake] watchdog: no audio for {age:.0f}s — restarting arecord')
            _wake_last_chunk_ts = time.time()
            proc = _wake_proc
            if proc:
                try:
                    proc.terminate()
                    proc.wait(timeout=2)
                except Exception:
                    pass

def _wake_word_loop():
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

    CHUNK_BYTES = 1280 * 2

    while True:
        while _get()['recording']:
            time.sleep(0.2)

        # Also wait if a browser STT client is actively connected (drawer is open)
        with _stt_lock:
            client_active = _stt_client is not None
        while client_active:
            time.sleep(0.2)
            with _stt_lock:
                client_active = _stt_client is not None

        _wake_last_chunk_ts = time.time()
        proc = subprocess.Popen(
            ['arecord', '-D', ALSA_DEVICE, '-f', 'S16_LE', '-r', str(RATE), '-c', '1', '-'],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
        )
        global _wake_proc
        _wake_proc = proc
        log.info('[wake] arecord started (pid=%d)', proc.pid)
        try:
            while True:
                rec_state = _get()['recording']
                if rec_state:
                    log.info('[wake] yielding mic — STT recording=True')
                    # Wait here until recording is done before letting outer while grab proc again
                    while _get()['recording']:
                        time.sleep(0.2)
                    break
                raw = proc.stdout.read(CHUNK_BYTES)
                ret = proc.poll()
                if ret is not None:
                    log.warning(f'[wake] arecord exited early (rc={ret})')
                    break
                if not raw or len(raw) < CHUNK_BYTES:
                    log.warning(f'[wake] short read ({len(raw) if raw else 0} bytes, expected {CHUNK_BYTES}) — restarting')
                    time.sleep(0.1)
                    break
                _wake_last_chunk_ts = time.time()
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
                        _ws_push_all({'type': 'wake'})
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
        time.sleep(0.5)

# ── STT functions ─────────────────────────────────────────────────────────────
def _on_message(ws_arg, message):
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
                _ws_push_stt({'type': 'final', 'text': full})
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
                _ws_push_stt({'type': 'final', 'text': full})
        elif is_final and text:
            _finals.append(text)
            interim = ' '.join(_finals)
            _set(interim_transcript=interim)
            _ws_push_stt({'type': 'interim', 'text': interim})
        elif text:
            interim = (' '.join(_finals) + ' ' + text).strip()
            _set(interim_transcript=interim)
            _ws_push_stt({'type': 'interim', 'text': interim})
    except Exception as e:
        log.error(f'on_message: {e}')

def _on_error(ws_arg, error):
    global _ws
    if _ws is not ws_arg:
        return  # stale callback — a new session has already started
    log.error(f'ws error: {error}')
    _set(error=str(error), recording=False, ready=False)
    _ws_push_stt({'type': 'error', 'msg': str(error)})

def _on_close(ws_arg, code, msg):
    global _ws
    if _ws is not ws_arg:
        return  # stale close callback — a new session has already started; ignore
    log.info(f'[DG] ws closed {code}')
    stop_recording()

def _stream_audio(proc, ws_arg, gen):
    chunk_bytes = (RATE // 10) * 2   # 100ms of S16_LE mono
    warmup = 0
    try:
        while True:
            with _state_lock:
                still_recording = _state['recording']
            if not still_recording:
                break
            # Also check generation — if a new session started, stop streaming old audio
            if _ws_gen != gen:
                break
            raw = proc.stdout.read(chunk_bytes)
            if not raw or len(raw) < chunk_bytes:
                break
            warmup += 1
            if warmup <= WARMUP_CHUNKS:
                continue
            samples = struct.unpack(f'<{len(raw)//2}h', raw)
            rms = math.sqrt(sum(s*s for s in samples) / len(samples))
            vol = int(min(rms / 70, 100))
            _set(volume=vol)
            _ws_push_stt({'type': 'volume', 'level': vol})
            try:
                ws_arg.send(raw, websocket.ABNF.OPCODE_BINARY)
            except Exception as e:
                log.error(f'send_binary failed: {e}')
                break
    finally:
        # Release ALSA device as soon as audio stream ends — allows wake word arecord to open it
        global _rec_proc
        if _rec_proc is proc:
            _rec_proc = None
            try: proc.terminate(); proc.wait(timeout=1)
            except: pass
        _set(volume=0)
        _ws_push_stt({'type': 'volume', 'level': 0})
        log.info('[stream_audio] thread exited')

def start_recording():
    global _rec_proc, _ws, _finals, _wake_proc, _ws_gen

    if _wake_proc:
        try:
            _wake_proc.terminate()
            _wake_proc.wait(timeout=1)
        except Exception:
            pass
        _wake_proc = None

    _finals = []
    _ws_gen += 1          # invalidate any in-flight _on_close / _stream_audio from old session
    current_gen = _ws_gen
    # Set recording=True NOW so the wake word loop immediately yields the mic.
    # ready=False still — browser waits for {type:'ready'} before showing listening state.
    _set(recording=True, ready=False, transcript=None, interim_transcript='', error=None, volume=0)

    # Clean up old DeepGram WS and arecord without triggering _on_close callback
    old_ws = _ws
    _ws = None
    if old_ws:
        try: old_ws.close()
        except: pass
    old_proc = _rec_proc
    _rec_proc = None
    if old_proc:
        try: old_proc.terminate(); old_proc.wait(timeout=1)
        except: pass

    ws_ready = threading.Event()

    def _on_open(ws_arg):
        log.info('[WS] connected — starting audio stream')
        _set(recording=True, ready=True)
        ws_ready.set()
        _ws_push_stt({'type': 'ready'})

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
            _stream_audio(proc, ws, current_gen)
        else:
            log.error('[stream] WS did not connect within 5s')
            _set(error='WS connect timeout', recording=False, ready=False)
            _ws_push_stt({'type': 'error', 'msg': 'WS connect timeout'})

    threading.Thread(target=_deferred_stream, daemon=True).start()
    log.info('[bridge] started — waiting for WS...')

def stop_recording():
    global _rec_proc, _ws
    old_ws = _ws
    _ws = None
    old_proc = _rec_proc
    _rec_proc = None
    if old_proc:
        try:
            old_proc.terminate()
            old_proc.wait(timeout=2)
        except Exception:
            try: old_proc.kill()
            except: pass
    if old_ws:
        try: old_ws.close()
        except: pass
    _set(recording=False, ready=False, volume=0)
    log.info('[bridge] stopped')

# ── HTTP server (kept for probeBridge /status and /display/off) ───────────────
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
    threading.Thread(target=_run_ws_server, daemon=True).start()
    log.info('DeepGram STT bridge on :8766')
    ReuseHTTPServer(('127.0.0.1', 8766), Handler).serve_forever()
