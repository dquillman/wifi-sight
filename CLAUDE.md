# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WiFi Sight uses standard consumer WiFi RSSI (signal strength) fluctuations to detect human presence. When a person moves near a WiFi signal path, they cause measurable signal variations. The app monitors these variations in real time via a sliding-window standard deviation algorithm.

## Architecture

Monorepo with two apps:

- **`backend/`** — Python FastAPI server. Scans WiFi via `netsh wlan show networks mode=bssid` (Windows-only, no admin required), runs presence detection, and pushes results over WebSocket every 1.5s.
- **`frontend/`** — React (Vite) dashboard. Connects to the backend WebSocket and renders a presence indicator, RSSI time-series chart (recharts), and network list.

**Data flow:** `netsh` → `scanner.py` (parse) → `detector.py` (sliding window std-dev) → `main.py` (WebSocket) → `useWebSocket.js` hook → React components

## Commands

### Backend
```bash
cd backend
python -m venv .venv
.venv/Scripts/activate    # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```
Runs on http://localhost:8000. Test endpoint: `GET /api/scan`.

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Runs on http://localhost:5173. Proxies `/api` and `/ws` to the backend via Vite config.

### Both at once
```bash
start.bat
```

## Key Design Decisions

- **`netsh` over `pywifi`**: More reliable on Windows, zero extra dependencies, doesn't need admin.
- **Signal percentage, not dBm**: `netsh` reports 0-100%. The detector works with percentages directly; the mapping to dBm is non-linear but unnecessary for variance detection.
- **Scan interval ~1.5s**: `netsh` takes 1-2s to run. Don't try to scan faster.
- **Presence threshold**: `detector.py` flags presence when RSSI std-dev exceeds 3% over a 20-reading window. These are tunable via `PresenceDetector(window_size=, threshold=)`.
