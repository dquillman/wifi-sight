import asyncio
import time
from collections import deque

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from scanner import scan_networks
from detector import PresenceDetector
from models import ScanResult, WSMessage

app = FastAPI(title="WiFi Sight")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

detector = PresenceDetector()
scan_history: deque[dict] = deque(maxlen=200)


@app.get("/api/scan")
def one_shot_scan():
    """Single scan for testing."""
    readings = scan_networks()
    return ScanResult(timestamp=time.time(), readings=readings)


@app.get("/api/history")
def get_history(limit: int = 60):
    """Return recent scan history for chart hydration on page load."""
    items = list(scan_history)
    return items[-limit:]


@app.get("/api/bssid/{bssid}")
def get_bssid_history(bssid: str):
    """Return presence history for a specific BSSID."""
    history = detector.get_bssid_history(bssid)
    if not history:
        return {"error": "BSSID not found"}
    return history


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            readings = await asyncio.to_thread(scan_networks)
            scan_result = ScanResult(timestamp=time.time(), readings=readings)
            presence = detector.update(readings)
            msg = WSMessage(scan=scan_result, presence=presence)
            scan_history.append(msg.model_dump())
            await ws.send_text(msg.model_dump_json())
            await asyncio.sleep(1.5)
    except WebSocketDisconnect:
        pass
