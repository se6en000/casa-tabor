import json, logging, math, os, struct, subprocess, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib import request as _urlrequest
import websocket
from websockets.sync.server import serve as ws_serve
from stt_flux_shadow import FluxShadow

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('stt-bridge')

ALSA_DEVICE   = 'plughw:2,0'
RATE          = 16000
WARMUP_CHUNKS = 2

DEEPGRAM_KEY  = os.environ.get('DEEPGRAM_API_KEY', '').strip()
if not DEEPGRAM_KEY:
    raise RuntimeError('DEEPGRAM_API_KEY is required')
DG_URL = (
    'wss://api.deepgram.com/v1/listen'
    '?encoding=linear16'
    f'&sample_rate={RATE}'
    '&channels=1'
    '&model=nova-2'
    '&interim_results=true'
    '&endpointing=500'
    '&utterance_end_ms=1800'
    '&vad_events=true'
)

WAKE_MODEL    = 'alexa'
WAKE_SCORE    = 0.12           # Reliable trigger without excessive false positives
WAKE_COOLDOWN = 2.0
WAKE_MISFIRE_COOLDOWN = 6.0
WAKE_WATCHDOG_SECS = 90
WAKE_AUDIO_GAIN   = 2.0        # Amplify mic input before wake detection
WAKE_SCORE_MIN = 0.08
WAKE_SCORE_MAX = 0.90
POST_FINAL_WAKE_COOLDOWN_SECS = 3.0
POST_FINAL_WAKE_DISARM_SECS = 5.0
START_DEBOUNCE_SECS = 0.8
STT_CLIENT_GRACE_SECS = 2.5
STT_CLIENT_DISCONNECT_GRACE_SECS = 0.7
WAKE_CONSECUTIVE_HITS_REQUIRED = 3
WAKE_HIT_MAX_GAP_SECS = 0.35
WAKE_SCORE_LOG_THROTTLE_SECS = 0.8
MISFIRE_SUPPRESS_AFTER_SPEECH_STARTED_SECS = 8.0
POST_STOP_WAKE_DISARM_SECS = 2.0
SENSOR_BRIDGE  = 'http://127.0.0.1:8765'

# ── Audio buffering for wake word ─────────────────────────────────────────────
# Keep a true pre-roll so users can speak naturally in one breath.
# We still strip leading "Alexa" from transcript text in _strip_wake().
BUFFER_SECS = 2.0

# ── STT state ────────────────────────────────────────────────────────────────
_state      = dict(recording=False, ready=False, volume=0, transcript=None,
                   interim_transcript='', error=None)
_state_lock = threading.Lock()
_rec_proc   = None
_ws         = None          # current DeepGram WebSocketApp
_ws_gen     = 0             # incremented on each start_recording(); guards stale _on_close
_finals     = []
_final_conf = []
_recording_lock = threading.Lock()
_recording_started_at = 0.0

def _push_voice_level(level: int):
    try:
        payload = json.dumps({'level': max(0, min(100, int(level)))}).encode('utf-8')
        req = _urlrequest.Request(
            f'{SENSOR_BRIDGE}/led/voice-level',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        _urlrequest.urlopen(req, timeout=0.25).read()
    except Exception:
        pass

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
_stt_missing_since = 0.0
_stt_disconnect_seq = 0
_stt_protocol = 'legacy'
_turn_id = ''
_turn_index = 0

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
    global _stt_client, _stt_disconnect_seq, _stt_protocol, _turn_id, _turn_index, _finals, _final_conf
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
                    _stt_disconnect_seq += 1
                    _stt_protocol = msg.get('turn_protocol', 'legacy')
                    _turn_id = str(msg.get('utterance_id', ''))
                    _turn_index = 0
                started = start_recording(reason='ws_start')
                if not started and _get().get('recording') and _get().get('ready'):
                    _ws_push_stt({'type': 'ready'})
            elif cmd == 'commit':
                committed_turn_id = _turn_id
                _flux_shadow.observe_primary_commit(_turn_index, committed_turn_id, _turn_text())
                _turn_index += 1
                _finals = []
                _final_conf = []
                _turn_id = str(msg.get('next_utterance_id', ''))
                _set(transcript=None, interim_transcript='')
                _ws_push_stt({
                    'type': 'committed',
                    'utterance_id': committed_turn_id,
                    'next_utterance_id': _turn_id,
                })
            elif cmd == 'discard':
                discarded_turn_id = _turn_id
                _flux_shadow.observe_primary_discard(_turn_index)
                _turn_index += 1
                _finals = []
                _final_conf = []
                _turn_id = str(msg.get('next_utterance_id', ''))
                _set(transcript=None, interim_transcript='')
                _ws_push_stt({
                    'type': 'discarded',
                    'utterance_id': discarded_turn_id,
                    'next_utterance_id': _turn_id,
                })
            elif cmd == 'finalize':
                current_ws = _ws
                if current_ws:
                    try:
                        current_ws.send(json.dumps({'type': 'Finalize'}))
                    except Exception as e:
                        _ws_push_stt({'type': 'error', 'msg': f'Finalize failed: {e}'})
            elif cmd == 'stop':
                with _stt_lock:
                    if _stt_client is ws:
                        _stt_client = None
                stop_recording()
    except Exception as e:
        log.error(f'[WS] browser client error: {e}')
    finally:
        should_stop = False
        with _ws_clients_lock:
            _ws_clients.discard(ws)
        stop_seq = 0
        with _stt_lock:
            if _stt_client is ws:
                _stt_client = None
                should_stop = True
                _stt_disconnect_seq += 1
                stop_seq = _stt_disconnect_seq
        if should_stop:
            # Give the browser a short grace window to reconnect before tearing
            # down STT; this avoids stop/start churn on transient WS reconnects.
            def _delayed_stop(expected_seq: int):
                time.sleep(STT_CLIENT_DISCONNECT_GRACE_SECS)
                with _stt_lock:
                    should_teardown = (_stt_client is None and _stt_disconnect_seq == expected_seq)
                if should_teardown:
                    stop_recording()
            threading.Thread(target=_delayed_stop, args=(stop_seq,), daemon=True).start()
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
_wake_cooldown_until = 0.0
_wake_lock           = threading.Lock()
_wake_proc           = None
_wake_last_chunk_ts  = time.time()
_wake_disarmed_until = 0.0
_wake_last_score_log_ts = 0.0
_last_speech_started_ts = 0.0
_audio_buffer        = []  # Circular buffer of audio chunks
_audio_buffer_lock   = threading.Lock()
WAKE_CHUNK_SECS      = 0.08  # 2560 bytes @ 16kHz, 16-bit mono

# ── Display sleep/wake ───────────────────────────────────────────────────────
_DISPLAY = ':0'

def _add_to_buffer(raw_bytes):
    """Add audio chunk to circular buffer, maintaining BUFFER_SECS of audio."""
    with _audio_buffer_lock:
        _audio_buffer.append(raw_bytes)
        max_chunks = int(BUFFER_SECS / WAKE_CHUNK_SECS) + 1
        while len(_audio_buffer) > max_chunks:
            _audio_buffer.pop(0)

def _get_buffer_copy():
    """Get a copy of current buffer as single bytes object."""
    with _audio_buffer_lock:
        if not _audio_buffer:
            return b''
        return b''.join(_audio_buffer)

def _clear_buffer():
    """Clear the audio buffer."""
    with _audio_buffer_lock:
        _audio_buffer.clear()

def _display_off():
    try:
        subprocess.run(
            ['xset', '-display', _DISPLAY, 'dpms', 'force', 'off'],
            env={**__import__('os').environ, 'DISPLAY': _DISPLAY},
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=0.8,
        )
    except Exception:
        pass

def _display_on():
    try:
        subprocess.run(
            ['xset', '-display', _DISPLAY, 'dpms', 'force', 'on'],
            env={**__import__('os').environ, 'DISPLAY': _DISPLAY},
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=0.8,
        )
    except Exception:
        pass
    # Fallback wake signal for servers without DPMS extension.
    try:
        subprocess.run(
            ['xset', '-display', _DISPLAY, 's', 'reset'],
            env={**__import__('os').environ, 'DISPLAY': _DISPLAY},
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=0.8,
        )
    except Exception:
        pass

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

def _make_recorder_cmd():
    """Return best available audio capture command for this platform.
    Uses arecord -D pulse which routes through PipeWire's PulseAudio
    compatibility layer — coexists with Chromium and provides proper levels.
    Falls back to pw-record then arecord direct ALSA.
    """
    import shutil, os
    os.environ.setdefault('XDG_RUNTIME_DIR', f'/run/user/{os.getuid()}')
    # arecord -D pulse routes via PipeWire PulseAudio compat — shared access + correct gain
    if shutil.which('arecord'):
        log.info('[recorder] using arecord -D pulse (PipeWire PulseAudio)')
        return ['arecord', '-D', 'pulse', '-f', 'S16_LE', '-r', str(RATE), '-c', '1', '-']
    if shutil.which('pw-record'):
        log.info('[recorder] using pw-record (PipeWire native)')
        return ['pw-record', f'--rate={RATE}', '--channels=1', '--format=s16', '-']
    log.info('[recorder] falling back to arecord direct ALSA')
    return ['arecord', '-D', ALSA_DEVICE, '-f', 'S16_LE', '-r', str(RATE), '-c', '1', '-']

def _wake_word_loop():
    global _wake_triggered, _wake_ts, _wake_last_chunk_ts, _wake_cooldown_until, _stt_missing_since, _wake_disarmed_until, _wake_last_score_log_ts
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

    rec_cmd = _make_recorder_cmd()
    log.info(f'[wake] ready — listening for wake word... (recorder: {rec_cmd[0]})')

    CHUNK_BYTES = 1280 * 2
    WARMUP_CHUNKS = 3  # skip initial chunks (arecord startup pop)

    while True:
        while _get()['recording']:
            with _stt_lock:
                has_stt_client = _stt_client is not None
            if not has_stt_client:
                if _stt_missing_since == 0.0:
                    _stt_missing_since = time.time()
                missing_for = time.time() - _stt_missing_since
                if missing_for >= STT_CLIENT_GRACE_SECS:
                    log.warning(f'[wake] recording=true with no STT client for {missing_for:.1f}s — forcing stop')
                    stop_recording()
                    _stt_missing_since = 0.0
                    break
            else:
                _stt_missing_since = 0.0
            time.sleep(0.2)

        _wake_last_chunk_ts = time.time()
        _clear_buffer()
        proc = subprocess.Popen(
            rec_cmd,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
        )
        global _wake_proc
        _wake_proc = proc
        log.info('[wake] recorder started (pid=%d)', proc.pid)
        try:
            high_score_streak = 0
            last_hit_ts = 0.0
            # Drain warmup chunks to skip startup pop/noise
            for _ in range(WARMUP_CHUNKS):
                proc.stdout.read(CHUNK_BYTES)
            while True:
                rec_state = _get()['recording']
                if rec_state:
                    high_score_streak = 0
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
                
                # Add to rolling buffer
                _add_to_buffer(raw)
                
                # Amplify audio before wake word detection to compensate for quiet mic
                audio_np = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
                audio_np = np.clip(audio_np * WAKE_AUDIO_GAIN, -32768, 32767).astype(np.int16)
                prediction = model.predict(audio_np)
                score = max(prediction.get(WAKE_MODEL, 0),
                            prediction.get(f'{WAKE_MODEL}_v0.1', 0))
                now = time.time()
                if score > 0.05 and (now - _wake_last_score_log_ts) >= WAKE_SCORE_LOG_THROTTLE_SECS:
                    log.info(f'[wake] score={score:.3f}')
                    _wake_last_score_log_ts = now
                if now < _wake_disarmed_until:
                    high_score_streak = 0
                    continue
                if score >= WAKE_SCORE:
                    if now < _wake_cooldown_until:
                        high_score_streak = 0
                        continue
                    if now - last_hit_ts <= WAKE_HIT_MAX_GAP_SECS:
                        high_score_streak += 1
                    else:
                        high_score_streak = 1
                    last_hit_ts = now
                    if high_score_streak < WAKE_CONSECUTIVE_HITS_REQUIRED:
                        continue
                    if now - _wake_ts >= WAKE_COOLDOWN:
                        log.info(f'[wake] triggered! score={score:.2f}')
                        _display_on()
                        _wake_disarmed_until = max(_wake_disarmed_until, now + 0.8)
                        high_score_streak = 0
                        
                        # Capture buffer for pre-fill
                        buffer_audio = _get_buffer_copy()
                        log.info(f'[wake] buffer size: {len(buffer_audio)} bytes')
                        
                        with _wake_lock:
                            _wake_triggered = True
                            _wake_ts = now
                        
                        # Send wake event with buffered audio
                        msg = {
                            'type': 'wake',
                            'buffer': len(buffer_audio),
                            'score': float(score),
                            'threshold': float(WAKE_SCORE),
                        }
                        _ws_push_all(msg)
                        
                        # If an STT client gets created immediately, the buffer will be
                        # sent as initial audio before any new chunks
                else:
                    high_score_streak = 0
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
import re as _re
_WAKE_STRIP = _re.compile(r'^(alexa[\s,\.!?]*)+', _re.IGNORECASE)

def _strip_wake(text: str) -> str:
    """Remove leading 'Alexa' (and any variant) from transcript."""
    return _WAKE_STRIP.sub('', text).strip()

FLUX_SHADOW_ENABLED = os.environ.get('STT_FLUX_SHADOW_ENABLED', '0').lower() in {'1', 'true', 'yes'}
try:
    FLUX_SHADOW_SAMPLE_PERCENT = int(os.environ.get('STT_FLUX_SHADOW_SAMPLE_PERCENT', '0'))
except ValueError:
    FLUX_SHADOW_SAMPLE_PERCENT = 0
_flux_shadow = FluxShadow(
    api_key=DEEPGRAM_KEY,
    websocket_module=websocket,
    emit=lambda message: _ws_push_stt(message),
    enabled=FLUX_SHADOW_ENABLED,
    sample_percent=FLUX_SHADOW_SAMPLE_PERCENT,
    sample_rate=RATE,
    normalize_transcript=_strip_wake,
)

def _turn_text():
    return _strip_wake(' '.join(_finals).strip())

def _turn_confidence(fallback=None):
    return (sum(_final_conf) / len(_final_conf)) if _final_conf else fallback

def _emit_turn_candidate(reason, fallback_confidence=None):
    global _finals, _final_conf, _wake_cooldown_until, _wake_disarmed_until
    full = _turn_text()
    if not full:
        return
    conf = _turn_confidence(fallback_confidence)
    now = time.time()
    _wake_cooldown_until = max(_wake_cooldown_until, now + POST_FINAL_WAKE_COOLDOWN_SECS)
    _wake_disarmed_until = max(_wake_disarmed_until, now + POST_FINAL_WAKE_DISARM_SECS)
    _set(transcript=full, interim_transcript='')
    if _stt_protocol == 'candidate-v1':
        _ws_push_stt({
            'type': 'turn_candidate',
            'text': full,
            'confidence': conf,
            'endpoint_reason': reason,
            'utterance_id': _turn_id,
        })
        return
    _finals = []
    _final_conf = []
    _ws_push_stt({
        'type': 'final',
        'text': full,
        'confidence': conf,
        'endpoint_reason': reason,
    })

def _on_message(ws_arg, message):
    global _finals, _final_conf, _wake_cooldown_until, _wake_disarmed_until, _last_speech_started_ts
    try:
        data = json.loads(message)
        msg_type = data.get('type', '')

        if msg_type == 'SpeechStarted':
            _last_speech_started_ts = time.time()
            log.info('[DG] SpeechStarted')
            if _stt_protocol == 'candidate-v1':
                _ws_push_stt({
                    'type': 'speech_started',
                    'provider_timestamp': data.get('timestamp'),
                    'utterance_id': _turn_id,
                })
            return

        if msg_type == 'UtteranceEnd':
            full = _turn_text()
            if full and data.get('last_word_end') != -1:
                log.info(f'[DG] UtteranceEnd -> "{full}"')
                _emit_turn_candidate('utterance_end')
            return

        if msg_type != 'Results':
            return

        alt        = data['channel']['alternatives'][0]
        text       = alt.get('transcript', '').strip()
        confidence = alt.get('confidence')
        is_final   = data.get('is_final', False)
        spch_final = data.get('speech_final', False)
        from_finalize = data.get('from_finalize', False)
        words      = alt.get('words', [])

        if is_final or spch_final:
            if text:
                _finals.append(text)
                if isinstance(confidence, (int, float)):
                    _final_conf.append(float(confidence))
            full = _turn_text()
            conf = _turn_confidence(confidence)
            if full:
                _set(interim_transcript=full)
                _ws_push_stt({
                    'type': 'transcript',
                    'text': full,
                    'committed': full,
                    'interim': '',
                    'confidence': conf,
                    'is_final': True,
                    'speech_final': spch_final,
                    'words': words,
                    'utterance_id': _turn_id,
                })
                if _stt_protocol != 'candidate-v1' and not spch_final:
                    _ws_push_stt({'type': 'interim', 'text': full})
            if (spch_final or from_finalize) and full:
                endpoint_reason = 'manual_finalize' if from_finalize else 'speech_final'
                log.info(f'[DG] {endpoint_reason} candidate -> "{full}"')
                if _stt_protocol == 'candidate-v1':
                    _ws_push_stt({
                        'type': 'segment_final',
                        'text': full,
                        'confidence': conf,
                        'words': words,
                        'utterance_id': _turn_id,
                    })
                _emit_turn_candidate(endpoint_reason, confidence)
        elif text:
            committed = _turn_text()
            interim = _strip_wake((committed + ' ' + text).strip())
            _set(interim_transcript=interim)
            if _stt_protocol == 'candidate-v1':
                _ws_push_stt({
                    'type': 'transcript',
                    'text': interim,
                    'committed': committed,
                    'interim': text,
                    'confidence': confidence,
                    'is_final': False,
                    'speech_final': False,
                    'words': words,
                    'utterance_id': _turn_id,
                })
            else:
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

def _stream_audio(proc, ws_arg, gen, initial_buffer=None):
    chunk_bytes = (RATE // 10) * 2   # 100ms of S16_LE mono
    warmup = 0
    
    # Send initial buffer if available (pre-wake audio)
    if initial_buffer:
        try:
            log.info(f'[stream_audio] sending initial buffer ({len(initial_buffer)} bytes)')
            ws_arg.send(initial_buffer, websocket.ABNF.OPCODE_BINARY)
        except Exception as e:
            log.error(f'send initial buffer failed: {e}')
    
    last_voice_push = 0.0
    short_reads = 0
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
                short_reads += 1
                if short_reads <= 5:
                    time.sleep(0.03)
                    continue
                break
            short_reads = 0
            warmup += 1
            if warmup <= WARMUP_CHUNKS:
                continue
            samples = struct.unpack(f'<{len(raw)//2}h', raw)
            rms = math.sqrt(sum(s*s for s in samples) / len(samples))
            vol = int(min(rms / 70, 100))
            _set(volume=vol)
            _ws_push_stt({'type': 'volume', 'level': vol})
            now = time.time()
            if now - last_voice_push >= 0.08:
                _push_voice_level(vol)
                last_voice_push = now
            try:
                ws_arg.send(raw, websocket.ABNF.OPCODE_BINARY)
            except Exception as e:
                log.error(f'send_binary failed: {e}')
                break
            shadow_offer_us = _flux_shadow.offer_audio(raw)
            if shadow_offer_us > 1000:
                _ws_push_stt({
                    'type': 'shadow_metric',
                    'provider': 'flux',
                    'status': 'primary_offer_slow',
                    'offer_us': shadow_offer_us,
                })
    finally:
        # Release ALSA device as soon as audio stream ends — allows wake word arecord to open it
        global _rec_proc
        if _rec_proc is proc:
            _rec_proc = None
            try: proc.terminate(); proc.wait(timeout=1)
            except: pass
        _set(volume=0)
        _ws_push_stt({'type': 'volume', 'level': 0})
        _push_voice_level(0)
        log.info('[stream_audio] thread exited')

def start_recording(force_restart=False, reason='manual'):
    global _rec_proc, _ws, _finals, _final_conf, _wake_proc, _ws_gen, _recording_started_at, _turn_index

    now = time.time()
    state = _get()
    with _stt_lock:
        has_stt_client = _stt_client is not None

    if state.get('recording') and not force_restart:
        if now - _recording_started_at < START_DEBOUNCE_SECS:
            log.info(f'[start_recording] duplicate start suppressed (reason={reason}, debounce={START_DEBOUNCE_SECS}s)')
            return False
        if has_stt_client and _ws is not None and _rec_proc is not None:
            log.info(f'[start_recording] already active; ignoring duplicate start (reason={reason})')
            return False

    # Capture buffer for pre-fill before starting new recording
    initial_buffer = _get_buffer_copy()
    log.info(f'[start_recording] captured {len(initial_buffer)} bytes for pre-fill')
    
    _finals = []
    _final_conf = []
    _turn_index = 0
    _ws_gen += 1          # invalidate any in-flight _on_close / _stream_audio from old session
    current_gen = _ws_gen
    # Set recording=True NOW so the wake word loop immediately yields the mic.
    # ready=False still — browser waits for {type:'ready'} before showing listening state.
    _set(recording=True, ready=False, transcript=None, interim_transcript='', error=None, volume=0)
    _recording_started_at = now
    # Give wake loop a brief moment to release the recorder cleanly before
    # we open the STT recorder. This avoids rc=1 churn during handoff.
    time.sleep(0.08)

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
        if (
            _stt_protocol == 'candidate-v1'
            and _flux_shadow.start(f'nova-{current_gen}')
            and initial_buffer
        ):
            shadow_chunk_bytes = (RATE // 10) * 2
            for offset in range(0, len(initial_buffer), shadow_chunk_bytes):
                _flux_shadow.offer_audio(initial_buffer[offset:offset + shadow_chunk_bytes])
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

    with _recording_lock:
        proc = subprocess.Popen(
            _make_recorder_cmd(),
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
        )
    _rec_proc = proc

    threading.Thread(target=ws.run_forever, daemon=True).start()

    def _deferred_stream():
        if ws_ready.wait(timeout=5):
            log.info('[stream] WS ready, streaming audio...')
            _stream_audio(proc, ws, current_gen, initial_buffer=initial_buffer)
        else:
            log.error('[stream] WS did not connect within 5s')
            _set(error='WS connect timeout', recording=False, ready=False)
            _ws_push_stt({'type': 'error', 'msg': 'WS connect timeout'})

    threading.Thread(target=_deferred_stream, daemon=True).start()
    log.info('[bridge] started — waiting for WS...')
    return True

def stop_recording():
    global _rec_proc, _ws, _wake_disarmed_until
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
    _flux_shadow.stop()
    _wake_disarmed_until = max(_wake_disarmed_until, time.time() + POST_STOP_WAKE_DISARM_SECS)
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
        global WAKE_SCORE, _wake_cooldown_until, _wake_ts, _wake_disarmed_until, _last_speech_started_ts
        if self.path == '/start':
            start_recording(reason='http_start')
            self.send_response(200); self._cors()
            self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(b'{"ok":true}')
        elif self.path == '/wake-sensitivity':
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                length = 0
            raw = self.rfile.read(length) if length > 0 else b'{}'
            try:
                body = json.loads(raw.decode('utf-8'))
                score = float(body.get('score'))
            except (ValueError, TypeError, json.JSONDecodeError):
                self.send_response(400); self._cors()
                self.send_header('Content-Type', 'application/json'); self.end_headers()
                self.wfile.write(b'{"ok":false,"error":"invalid score"}')
                return
            score = max(WAKE_SCORE_MIN, min(WAKE_SCORE_MAX, score))
            WAKE_SCORE = score
            log.info(f'[wake] sensitivity updated: {WAKE_SCORE:.2f}')
            self.send_response(200); self._cors()
            self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'score': WAKE_SCORE}).encode())
        elif self.path == '/wake-misfire':
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                length = 0
            raw = self.rfile.read(length) if length > 0 else b'{}'
            try:
                body = json.loads(raw.decode('utf-8'))
            except (ValueError, TypeError, json.JSONDecodeError):
                body = {}
            try:
                seconds = float(body.get('seconds', WAKE_MISFIRE_COOLDOWN))
            except (ValueError, TypeError):
                seconds = WAKE_MISFIRE_COOLDOWN
            seconds = max(1.0, min(15.0, seconds))
            now = time.time()
            state = _get()
            recent_speech_started = (now - _last_speech_started_ts) <= MISFIRE_SUPPRESS_AFTER_SPEECH_STARTED_SECS
            if state.get('recording') or recent_speech_started:
                remaining = max(0.0, _wake_cooldown_until - now)
                reason = 'recording_active' if state.get('recording') else 'recent_speech_started'
                log.info(f'[wake] misfire cooldown ignored ({reason})')
                self.send_response(200); self._cors()
                self.send_header('Content-Type', 'application/json'); self.end_headers()
                self.wfile.write(json.dumps({
                    'ok': True,
                    'applied': False,
                    'reason': reason,
                    'cooldown_seconds': round(remaining, 2),
                }).encode())
                return
            _wake_ts = now
            _wake_cooldown_until = max(_wake_cooldown_until, now + seconds)
            _wake_disarmed_until = max(_wake_disarmed_until, now + seconds)
            remaining = max(0.0, _wake_cooldown_until - now)
            log.info(f'[wake] misfire cooldown set ({remaining:.1f}s)')
            self.send_response(200); self._cors()
            self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'applied': True, 'cooldown_seconds': round(remaining, 2)}).encode())
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
            now = time.time()
            s['wake_cooldown_remaining'] = max(0.0, _wake_cooldown_until - time.time())
            s['wake_disarmed_remaining'] = max(0.0, _wake_disarmed_until - time.time())
            s['speech_started_recently'] = (now - _last_speech_started_ts) <= MISFIRE_SUPPRESS_AFTER_SPEECH_STARTED_SECS
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
        elif self.path == '/wake-sensitivity':
            self.send_response(200); self._cors()
            self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(json.dumps({'score': WAKE_SCORE}).encode())
        else:
            self.send_response(404); self.end_headers()

if __name__ == '__main__':
    threading.Thread(target=_wake_word_loop, daemon=True).start()
    threading.Thread(target=_wake_watchdog, daemon=True).start()
    threading.Thread(target=_run_ws_server, daemon=True).start()
    log.info('DeepGram STT bridge on :8766')
    ReuseHTTPServer(('127.0.0.1', 8766), Handler).serve_forever()
