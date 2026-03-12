import math
import time
from collections import deque
from models import BSSIDReading, BSSIDVariance, PresenceStatus, BSSIDHistory, BSSIDPresenceEvent, BSSIDSignalPoint


class PresenceDetector:
    """Detect human presence via RSSI signal fluctuation analysis."""

    def __init__(self, window_size: int = 20, threshold: float = 3.0):
        self.window_size = window_size
        self.threshold = threshold
        self._history: dict[str, deque[int]] = {}
        self._prev_detected = False
        self._detection_start: float | None = None

        # Per-BSSID tracking
        self._prev_contributing: set[str] = set()
        self._bssid_events: dict[str, list[BSSIDPresenceEvent]] = {}
        self._bssid_signals: dict[str, list[BSSIDSignalPoint]] = {}
        self._bssid_info: dict[str, dict] = {}  # ssid, band, channel
        self._bssid_presence_starts: dict[str, float] = {}
        self._bssid_total_presence: dict[str, float] = {}
        self._bssid_presence_count: dict[str, int] = {}

    def update(self, readings: list[BSSIDReading]) -> PresenceStatus:
        contributing = []
        variances = []
        now = time.time()

        for r in readings:
            if r.bssid not in self._history:
                self._history[r.bssid] = deque(maxlen=self.window_size)
            self._history[r.bssid].append(r.signal_pct)

            # Store latest info
            self._bssid_info[r.bssid] = {
                "ssid": r.ssid, "band": r.band, "channel": r.channel,
            }

        for bssid, signals in self._history.items():
            if len(signals) < 5:
                continue
            std = _std_dev(signals)
            above = std >= self.threshold
            variances.append(BSSIDVariance(
                bssid=bssid, std_dev=round(std, 2), above_threshold=above
            ))
            if above:
                contributing.append(bssid)

        contributing_set = set(contributing)

        # Per-BSSID presence events
        for bssid in contributing_set - self._prev_contributing:
            self._bssid_events.setdefault(bssid, []).append(
                BSSIDPresenceEvent(timestamp=now, event="entered")
            )
            self._bssid_presence_starts[bssid] = now
            self._bssid_presence_count[bssid] = self._bssid_presence_count.get(bssid, 0) + 1

        for bssid in self._prev_contributing - contributing_set:
            self._bssid_events.setdefault(bssid, []).append(
                BSSIDPresenceEvent(timestamp=now, event="left")
            )
            start = self._bssid_presence_starts.pop(bssid, now)
            self._bssid_total_presence[bssid] = self._bssid_total_presence.get(bssid, 0) + (now - start)

        self._prev_contributing = contributing_set

        # Record signal history per BSSID
        for r in readings:
            self._bssid_signals.setdefault(r.bssid, []).append(
                BSSIDSignalPoint(
                    timestamp=now,
                    signal_pct=r.signal_pct,
                    presence=r.bssid in contributing_set,
                )
            )
            # Keep last 500 points per BSSID
            if len(self._bssid_signals[r.bssid]) > 500:
                self._bssid_signals[r.bssid] = self._bssid_signals[r.bssid][-500:]

        detected = len(contributing) > 0

        if detected:
            total_tracked = sum(1 for s in self._history.values() if len(s) >= 5)
            weights = []
            for bssid in contributing:
                latest = self._history[bssid][-1]
                weights.append(latest / 100.0)
            confidence = min(sum(weights) / max(total_tracked, 1), 1.0)
        else:
            confidence = 0.0

        event = None
        if detected and not self._prev_detected:
            event = "entered"
            self._detection_start = time.time()
        elif not detected and self._prev_detected:
            event = "left"
            self._detection_start = None
        self._prev_detected = detected

        duration = 0.0
        if detected and self._detection_start:
            duration = round(time.time() - self._detection_start, 1)

        return PresenceStatus(
            detected=detected,
            confidence=round(confidence, 2),
            contributing_bssids=contributing,
            event=event,
            bssid_variances=variances,
            detection_duration=duration,
        )

    def get_bssid_history(self, bssid: str) -> BSSIDHistory | None:
        info = self._bssid_info.get(bssid)
        if not info:
            return None

        now = time.time()

        # Calculate total presence including current active session
        total = self._bssid_total_presence.get(bssid, 0)
        if bssid in self._bssid_presence_starts:
            total += now - self._bssid_presence_starts[bssid]

        signals = self._bssid_signals.get(bssid, [])
        current = signals[-1].signal_pct if signals else 0
        avg = sum(s.signal_pct for s in signals) / len(signals) if signals else 0

        return BSSIDHistory(
            bssid=bssid,
            ssid=info["ssid"],
            band=info["band"],
            channel=info["channel"],
            presence_events=self._bssid_events.get(bssid, []),
            signal_history=signals,
            total_presence_time=round(total, 1),
            presence_count=self._bssid_presence_count.get(bssid, 0),
            current_signal=current,
            avg_signal=round(avg, 1),
        )

    def reset(self):
        self._history.clear()
        self._prev_detected = False
        self._detection_start = None
        self._prev_contributing.clear()
        self._bssid_events.clear()
        self._bssid_signals.clear()
        self._bssid_info.clear()
        self._bssid_presence_starts.clear()
        self._bssid_total_presence.clear()
        self._bssid_presence_count.clear()


def _std_dev(values) -> float:
    n = len(values)
    if n < 2:
        return 0.0
    mean = sum(values) / n
    variance = sum((x - mean) ** 2 for x in values) / (n - 1)
    return math.sqrt(variance)
