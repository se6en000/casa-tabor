import json
import queue
import random
import threading
import time


def _normalized_word_distance(left, right):
    a = str(left or '').lower().split()
    b = str(right or '').lower().split()
    if not a and not b:
        return 0.0
    previous = list(range(len(b) + 1))
    for row, left_word in enumerate(a, start=1):
        current = [row]
        for column, right_word in enumerate(b, start=1):
            current.append(min(
                current[-1] + 1,
                previous[column] + 1,
                previous[column - 1] + (left_word != right_word),
            ))
        previous = current
    return round(previous[-1] / max(len(a), len(b), 1), 4)


class FluxShadow:
    def __init__(
        self,
        *,
        api_key,
        websocket_module,
        emit,
        enabled=False,
        sample_percent=0,
        sample_rate=16000,
        queue_chunks=32,
        random_value=None,
        normalize_transcript=None,
    ):
        self._api_key = api_key
        self._websocket = websocket_module
        self._emit = emit
        self._enabled = bool(enabled)
        self._sample_percent = max(0, min(100, int(sample_percent)))
        self._sample_rate = sample_rate
        self._queue_chunks = max(2, int(queue_chunks))
        self._random_value = random_value or random.random
        self._normalize_transcript = normalize_transcript or (lambda text: str(text or '').strip())
        self._active = False
        self._audio_queue = None
        self._stop_event = None
        self._ready_event = None
        self._ws = None
        self._session_id = ''
        self._queue_drops = 0
        self._max_queue_depth = 0
        self._offer_count = 0
        self._offer_total_us = 0
        self._offer_max_us = 0
        self._resumed_by_turn = {}
        self._first_update_latency = {}
        self._update_audio_ends = {}
        self._flux_turns = {}
        self._primary_turns = {}
        self._comparison_lock = threading.Lock()

    @property
    def active(self):
        return self._active

    def start(self, session_id):
        self.stop()
        sampled = self._enabled and self._sample_percent > 0 and (
            self._random_value() * 100 < self._sample_percent
        )
        if not sampled:
            return False

        self._session_id = str(session_id)
        self._audio_queue = queue.Queue(maxsize=self._queue_chunks)
        self._stop_event = threading.Event()
        self._ready_event = threading.Event()
        self._queue_drops = 0
        self._max_queue_depth = 0
        self._offer_count = 0
        self._offer_total_us = 0
        self._offer_max_us = 0
        self._resumed_by_turn = {}
        self._first_update_latency = {}
        self._update_audio_ends = {}
        self._flux_turns = {}
        self._primary_turns = {}
        self._active = True

        url = (
            'wss://api.deepgram.com/v2/listen'
            '?model=flux-general-en'
            '&encoding=linear16'
            f'&sample_rate={self._sample_rate}'
            '&eot_threshold=0.8'
            '&eot_timeout_ms=7000'
        )
        self._ws = self._websocket.WebSocketApp(
            url,
            header={'Authorization': f'Token {self._api_key}'},
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close,
        )
        threading.Thread(target=self._ws.run_forever, daemon=True).start()
        threading.Thread(target=self._send_audio, daemon=True).start()
        self._emit_metric('started')
        return True

    def offer_audio(self, raw):
        started_ns = time.perf_counter_ns()
        if not self._active or not raw or self._audio_queue is None:
            return 0
        try:
            self._audio_queue.put_nowait(bytes(raw))
            self._max_queue_depth = max(self._max_queue_depth, self._audio_queue.qsize())
        except queue.Full:
            self._queue_drops += 1
        offer_us = max(0, (time.perf_counter_ns() - started_ns) // 1000)
        self._offer_count += 1
        self._offer_total_us += offer_us
        self._offer_max_us = max(self._offer_max_us, offer_us)
        return offer_us

    def observe_primary_commit(self, turn_index, turn_id, transcript):
        if not self._active:
            return
        index = int(turn_index)
        with self._comparison_lock:
            self._primary_turns[index] = {
                'turn_id': str(turn_id),
                'transcript': str(transcript or ''),
                'word_count': len(str(transcript or '').split()),
            }
        self._emit_comparison_if_ready(index)

    def observe_primary_discard(self, turn_index):
        if not self._active:
            return
        with self._comparison_lock:
            self._primary_turns[int(turn_index)] = {'discarded': True}
        self._emit_comparison_if_ready(int(turn_index))

    def stop(self):
        if not self._active:
            return
        self._active = False
        if self._stop_event:
            self._stop_event.set()
        ws = self._ws
        self._ws = None
        if ws:
            try:
                ws.close()
            except Exception:
                self._emit_metric('close_error')
        self._emit_metric('stopped')
        self._emit_unmatched_primary_turns()

    def _on_open(self, _ws):
        if self._ready_event:
            self._ready_event.set()
        self._emit_metric('connected')

    def _on_message(self, _ws, message):
        if not self._active:
            return
        try:
            data = json.loads(message)
        except (TypeError, json.JSONDecodeError):
            return
        event = data.get('event') or data.get('type')
        if event not in {'StartOfTurn', 'Update', 'EagerEndOfTurn', 'TurnResumed', 'EndOfTurn'}:
            return
        turn_index = int(data.get('turn_index', 0))
        if event == 'StartOfTurn':
            words = data.get('words') if isinstance(data.get('words'), list) else []
            first_word_start = min(
                (float(word.get('start', 0)) for word in words if isinstance(word, dict)),
                default=0.0,
            )
            audio_window_end = float(data.get('audio_window_end', 0) or 0)
            self._first_update_latency[turn_index] = round(
                max(0.0, audio_window_end - first_word_start) * 1000
            )
            self._update_audio_ends.setdefault(turn_index, []).append(audio_window_end)
            return
        if event == 'Update':
            self._update_audio_ends.setdefault(turn_index, []).append(
                float(data.get('audio_window_end', 0) or 0)
            )
            return
        if event == 'TurnResumed':
            self._resumed_by_turn[turn_index] = self._resumed_by_turn.get(turn_index, 0) + 1
            return
        if event != 'EndOfTurn':
            return

        words = data.get('words') if isinstance(data.get('words'), list) else []
        last_word_end = max(
            (float(word.get('end', 0)) for word in words if isinstance(word, dict)),
            default=0.0,
        )
        audio_window_end = float(data.get('audio_window_end', 0) or 0)
        update_audio_ends = self._update_audio_ends.get(turn_index, [])
        update_intervals = [
            (right - left) * 1000
            for left, right in zip(update_audio_ends, update_audio_ends[1:])
            if right >= left
        ]
        confidences = [
            float(word['confidence'])
            for word in words
            if isinstance(word, dict) and isinstance(word.get('confidence'), (int, float))
        ]
        with self._comparison_lock:
            self._flux_turns[turn_index] = {
                'transcript': str(data.get('transcript', '')),
                'word_count': len(words) or len(str(data.get('transcript', '')).split()),
                'average_confidence': round(sum(confidences) / len(confidences), 4) if confidences else None,
                'end_of_turn_confidence': data.get('end_of_turn_confidence'),
                'speech_to_first_update_ms': self._first_update_latency.get(turn_index),
                'average_update_interval_ms': round(
                    sum(update_intervals) / len(update_intervals)
                ) if update_intervals else None,
                'update_count': len(update_audio_ends),
                'last_word_to_eot_ms': round(max(0.0, audio_window_end - last_word_end) * 1000),
                'turn_resumed_count': self._resumed_by_turn.get(turn_index, 0),
            }
        self._emit_comparison_if_ready(turn_index)

    def _on_error(self, _ws, _error):
        self._emit_metric('error')

    def _on_close(self, _ws, _code, _message):
        if self._active:
            self._emit_metric('closed')

    def _send_audio(self):
        if not self._ready_event or not self._ready_event.wait(timeout=5):
            self._emit_metric('connect_timeout')
            self.stop()
            return
        chunk_bytes = int(self._sample_rate * 0.08) * 2
        buffered = bytearray()
        while self._active and self._stop_event and not self._stop_event.is_set():
            try:
                buffered.extend(self._audio_queue.get(timeout=0.2))
            except queue.Empty:
                continue
            while len(buffered) >= chunk_bytes and self._active:
                chunk = bytes(buffered[:chunk_bytes])
                del buffered[:chunk_bytes]
                try:
                    self._ws.send(chunk, self._websocket.ABNF.OPCODE_BINARY)
                except Exception:
                    self._emit_metric('send_error')
                    self.stop()
                    return

    def _emit_comparison_if_ready(self, turn_index):
        with self._comparison_lock:
            primary = self._primary_turns.get(turn_index)
            flux = self._flux_turns.get(turn_index)
            if not primary or not flux:
                return
            del self._primary_turns[turn_index]
            del self._flux_turns[turn_index]
        payload = {
            'type': 'shadow_metric',
            'provider': 'flux',
            'status': 'turn_compared',
            'session_id': self._session_id,
            'turn_index': turn_index,
            'primary_discarded': primary.get('discarded') is True,
            'primary_word_count': primary.get('word_count', 0),
            'shadow_word_count': flux['word_count'],
            'average_confidence': flux['average_confidence'],
            'normalized_edit_distance': None if primary.get('discarded') else _normalized_word_distance(
                primary.get('transcript'),
                self._normalize_transcript(flux.get('transcript')),
            ),
            'end_of_turn_confidence': flux['end_of_turn_confidence'],
            'speech_to_first_update_ms': flux['speech_to_first_update_ms'],
            'average_update_interval_ms': flux['average_update_interval_ms'],
            'update_count': flux['update_count'],
            'last_word_to_eot_ms': flux['last_word_to_eot_ms'],
            'turn_resumed_count': flux['turn_resumed_count'],
            'queue_drops': self._queue_drops,
            'max_queue_depth': self._max_queue_depth,
            'average_primary_offer_us': round(self._offer_total_us / self._offer_count) if self._offer_count else 0,
            'max_primary_offer_us': self._offer_max_us,
        }
        self._emit(payload)

    def _emit_metric(self, status):
        self._emit({
            'type': 'shadow_metric',
            'provider': 'flux',
            'status': status,
            'session_id': self._session_id,
            'queue_drops': self._queue_drops,
            'max_queue_depth': self._max_queue_depth,
            'average_primary_offer_us': round(self._offer_total_us / self._offer_count) if self._offer_count else 0,
            'max_primary_offer_us': self._offer_max_us,
        })

    def _emit_unmatched_primary_turns(self):
        with self._comparison_lock:
            unmatched = list(self._primary_turns.items())
            self._primary_turns.clear()
            self._flux_turns.clear()
        for turn_index, primary in unmatched:
            self._emit({
                'type': 'shadow_metric',
                'provider': 'flux',
                'status': 'primary_committed_before_shadow_eot',
                'session_id': self._session_id,
                'turn_index': turn_index,
                'primary_discarded': primary.get('discarded') is True,
                'primary_word_count': primary.get('word_count', 0),
                'queue_drops': self._queue_drops,
                'max_queue_depth': self._max_queue_depth,
                'average_primary_offer_us': round(
                    self._offer_total_us / self._offer_count
                ) if self._offer_count else 0,
                'max_primary_offer_us': self._offer_max_us,
            })
