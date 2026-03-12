from pydantic import BaseModel


class BSSIDReading(BaseModel):
    ssid: str
    bssid: str
    signal_pct: int
    band: str
    channel: int


class ScanResult(BaseModel):
    timestamp: float
    readings: list[BSSIDReading]


class BSSIDVariance(BaseModel):
    bssid: str
    std_dev: float
    above_threshold: bool


class PresenceStatus(BaseModel):
    detected: bool
    confidence: float
    contributing_bssids: list[str]
    event: str | None = None
    bssid_variances: list[BSSIDVariance] = []
    detection_duration: float = 0.0


class WSMessage(BaseModel):
    scan: ScanResult
    presence: PresenceStatus


class BSSIDPresenceEvent(BaseModel):
    timestamp: float
    event: str  # "entered" or "left"


class BSSIDSignalPoint(BaseModel):
    timestamp: float
    signal_pct: int
    presence: bool


class BSSIDHistory(BaseModel):
    bssid: str
    ssid: str
    band: str
    channel: int
    presence_events: list[BSSIDPresenceEvent]
    signal_history: list[BSSIDSignalPoint]
    total_presence_time: float
    presence_count: int
    current_signal: int
    avg_signal: float
