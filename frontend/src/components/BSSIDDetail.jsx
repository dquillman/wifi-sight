import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from "recharts";

const STORAGE_KEY = "wifi-sight-ap-positions";

const COMPASS_OPTIONS = [
  { label: "N", deg: 0 },
  { label: "NNE", deg: 22.5 },
  { label: "NE", deg: 45 },
  { label: "ENE", deg: 67.5 },
  { label: "E", deg: 90 },
  { label: "ESE", deg: 112.5 },
  { label: "SE", deg: 135 },
  { label: "SSE", deg: 157.5 },
  { label: "S", deg: 180 },
  { label: "SSW", deg: 202.5 },
  { label: "SW", deg: 225 },
  { label: "WSW", deg: 247.5 },
  { label: "W", deg: 270 },
  { label: "WNW", deg: 292.5 },
  { label: "NW", deg: 315 },
  { label: "NNW", deg: 337.5 },
];

function loadPositions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function savePositions(positions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

// Convert distance (meters) + bearing (degrees) to normalized x,y
// bearing: 0=N (up), 90=E (right), 180=S (down), 270=W (left)
// Canvas: x-right, y-down. N = -y, E = +x
function polarToNormalized(distanceM, bearingDeg, maxRange) {
  const r = distanceM / maxRange; // normalized 0..1
  const radians = (bearingDeg - 90) * (Math.PI / 180); // convert compass to math angle
  return {
    nx: Math.cos(radians) * r,
    ny: Math.sin(radians) * r,
  };
}

// Reverse: normalized x,y to distance + bearing
function normalizedToPolar(nx, ny, maxRange) {
  const r = Math.sqrt(nx * nx + ny * ny);
  const distanceM = r * maxRange;
  let bearingDeg = (Math.atan2(ny, nx) * 180 / Math.PI) + 90;
  if (bearingDeg < 0) bearingDeg += 360;
  return { distanceM: Math.round(distanceM * 10) / 10, bearingDeg: Math.round(bearingDeg) };
}

function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString();
}

function timeAgo(ts) {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function nearestCompass(deg) {
  let best = COMPASS_OPTIONS[0];
  let bestDiff = 999;
  for (const c of COMPASS_OPTIONS) {
    let diff = Math.abs(c.deg - deg);
    if (diff > 180) diff = 360 - diff;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best.label;
}

const inputStyle = {
  background: "#1a1a2a",
  border: "1px solid #333",
  borderRadius: 6,
  color: "#e0e0e0",
  padding: "6px 10px",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: "0.85rem",
  width: "100%",
  outline: "none",
};

export default function BSSIDDetail({ bssid, onClose, onPositionChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Position form state
  const positions = loadPositions();
  const existing = positions[bssid];
  const maxRange = existing?.maxRange || 20;

  const existingPolar = existing
    ? normalizedToPolar(existing.nx, existing.ny, existing.maxRange || 20)
    : null;

  const [distance, setDistance] = useState(existingPolar ? String(existingPolar.distanceM) : "");
  const [bearing, setBearing] = useState(existingPolar ? String(existingPolar.bearingDeg) : "");
  const [compassDir, setCompassDir] = useState(
    existingPolar ? nearestCompass(existingPolar.bearingDeg) : "N"
  );
  const [range, setRange] = useState(String(maxRange));
  const [positionSaved, setPositionSaved] = useState(false);

  useEffect(() => {
    if (!bssid) return;
    setLoading(true);
    setError(null);

    const encoded = encodeURIComponent(bssid);
    fetch(`/api/bssid/${encoded}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });

    const interval = setInterval(() => {
      fetch(`/api/bssid/${encoded}`)
        .then((r) => r.json())
        .then((d) => { if (!d.error) setData(d); })
        .catch(() => {});
    }, 3000);

    return () => clearInterval(interval);
  }, [bssid]);

  // Sync bearing input with compass dropdown
  const handleCompassChange = (dir) => {
    setCompassDir(dir);
    const match = COMPASS_OPTIONS.find((c) => c.label === dir);
    if (match) setBearing(String(match.deg));
  };

  const handleBearingChange = (val) => {
    setBearing(val);
    const deg = parseFloat(val);
    if (!isNaN(deg)) setCompassDir(nearestCompass(deg));
  };

  const handleSavePosition = () => {
    const d = parseFloat(distance);
    const b = parseFloat(bearing);
    const r = parseFloat(range);
    if (isNaN(d) || isNaN(b) || isNaN(r) || r <= 0) return;

    const { nx, ny } = polarToNormalized(d, b, r);
    const positions = loadPositions();
    positions[bssid] = { nx, ny, maxRange: r, distanceM: d, bearingDeg: b };
    savePositions(positions);

    setPositionSaved(true);
    setTimeout(() => setPositionSaved(false), 2000);

    if (onPositionChange) onPositionChange();
  };

  const handleClearPosition = () => {
    const positions = loadPositions();
    delete positions[bssid];
    savePositions(positions);
    setDistance("");
    setBearing("");
    setPositionSaved(false);

    if (onPositionChange) onPositionChange();
  };

  if (!bssid) return null;

  const chartData = (data?.signal_history ?? []).map((p) => ({
    time: formatTime(p.timestamp),
    signal: p.signal_pct,
    presence: p.presence ? p.signal_pct : null,
  }));

  const isPlaced = !!loadPositions()[bssid];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#0d0d18",
          border: "1px solid rgba(34,197,94,0.2)",
          borderRadius: "1rem",
          padding: "2rem",
          width: "90%",
          maxWidth: 800,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "1.5rem",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.3rem", color: "#e0e0e0", marginBottom: 4 }}>
              {data?.ssid || bssid}
            </h2>
            <div style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#555" }}>
              {bssid}
              {data && (
                <span style={{ marginLeft: 12 }}>CH {data.channel} · {data.band}</span>
              )}
              {isPlaced && (
                <span style={{ marginLeft: 12, color: "#3b82f6" }}>📌 Positioned</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid #333",
              color: "#888",
              borderRadius: 6,
              padding: "4px 12px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: "0.85rem",
            }}
          >
            ESC
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", color: "#555", padding: "2rem" }}>Loading...</div>
        )}
        {error && (
          <div style={{ textAlign: "center", color: "#ef4444", padding: "2rem" }}>{error}</div>
        )}

        {data && !loading && (
          <>
            {/* Position editor */}
            <div
              style={{
                background: "#12121a",
                borderRadius: "0.75rem",
                padding: "1.25rem",
                marginBottom: "1.5rem",
                border: "1px solid rgba(59,130,246,0.2)",
              }}
            >
              <h3 style={{ fontSize: "0.9rem", color: "#60a5fa", marginBottom: "1rem" }}>
                AP Position
              </h3>
              <p style={{ fontSize: "0.75rem", color: "#666", marginBottom: "1rem", lineHeight: 1.5 }}>
                Set this AP's real-world position relative to you. This enables accurate
                person location estimation on the radar.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                {/* Distance */}
                <div>
                  <label style={{ fontSize: "0.65rem", color: "#888", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                    Distance (meters)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    placeholder="e.g. 8"
                    style={inputStyle}
                  />
                </div>

                {/* Bearing */}
                <div>
                  <label style={{ fontSize: "0.65rem", color: "#888", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                    Direction (degrees)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="360"
                    step="1"
                    value={bearing}
                    onChange={(e) => handleBearingChange(e.target.value)}
                    placeholder="0-360"
                    style={inputStyle}
                  />
                </div>

                {/* Compass shortcut */}
                <div>
                  <label style={{ fontSize: "0.65rem", color: "#888", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                    Compass
                  </label>
                  <select
                    value={compassDir}
                    onChange={(e) => handleCompassChange(e.target.value)}
                    style={{ ...inputStyle, cursor: "pointer" }}
                  >
                    {COMPASS_OPTIONS.map((c) => (
                      <option key={c.label} value={c.label}>
                        {c.label} ({c.deg}°)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Radar range */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ fontSize: "0.65rem", color: "#888", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                  Radar range (meters) — sets the scale for the outer ring
                </label>
                <input
                  type="number"
                  min="5"
                  max="200"
                  step="5"
                  value={range}
                  onChange={(e) => setRange(e.target.value)}
                  style={{ ...inputStyle, maxWidth: 200 }}
                />
              </div>

              {/* Mini compass preview */}
              <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
                <MiniCompass bearing={parseFloat(bearing) || 0} distance={parseFloat(distance) || 0} range={parseFloat(range) || 20} />

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    onClick={handleSavePosition}
                    disabled={!distance || !bearing}
                    style={{
                      background: positionSaved ? "rgba(34,197,94,0.2)" : "rgba(59,130,246,0.2)",
                      border: `1px solid ${positionSaved ? "rgba(34,197,94,0.5)" : "rgba(59,130,246,0.5)"}`,
                      color: positionSaved ? "#22c55e" : "#60a5fa",
                      borderRadius: 6,
                      padding: "6px 16px",
                      cursor: distance && bearing ? "pointer" : "not-allowed",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: "0.8rem",
                      opacity: distance && bearing ? 1 : 0.4,
                    }}
                  >
                    {positionSaved ? "Saved!" : "Save Position"}
                  </button>

                  {isPlaced && (
                    <button
                      onClick={handleClearPosition}
                      style={{
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "#ef4444",
                        borderRadius: 6,
                        padding: "6px 16px",
                        cursor: "pointer",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: "0.8rem",
                      }}
                    >
                      Clear Position
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <StatCard
                label="Current Signal"
                value={`${data.current_signal}%`}
                color={data.current_signal > 60 ? "#22c55e" : data.current_signal > 30 ? "#eab308" : "#ef4444"}
              />
              <StatCard label="Avg Signal" value={`${data.avg_signal}%`} color="#8884d8" />
              <StatCard label="Presence Events" value={data.presence_count} color="#ef4444" />
              <StatCard label="Total Presence" value={formatDuration(data.total_presence_time)} color="#ef4444" />
            </div>

            {/* Signal chart */}
            <div
              style={{
                background: "#12121a",
                borderRadius: "0.75rem",
                padding: "1.25rem",
                marginBottom: "1.5rem",
              }}
            >
              <h3 style={{ fontSize: "0.9rem", color: "#aaa", marginBottom: "1rem" }}>Signal History</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2a" />
                    <XAxis dataKey="time" stroke="#444" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} stroke="#444" tick={{ fontSize: 10 }} label={{ value: "%", position: "insideLeft", fill: "#444" }} />
                    <Tooltip contentStyle={{ background: "#1a1a2a", border: "1px solid #333", fontFamily: "monospace", fontSize: "0.75rem" }} />
                    <Area type="monotone" dataKey="presence" fill="rgba(239, 68, 68, 0.15)" stroke="none" isAnimationActive={false} />
                    <Line type="monotone" dataKey="signal" stroke="#22c55e" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: "#444", textAlign: "center", padding: "2rem" }}>No signal data yet</div>
              )}
            </div>

            {/* Presence event log */}
            <div style={{ background: "#12121a", borderRadius: "0.75rem", padding: "1.25rem" }}>
              <h3 style={{ fontSize: "0.9rem", color: "#aaa", marginBottom: "1rem" }}>Presence Event Log</h3>
              {data.presence_events.length === 0 ? (
                <div style={{ color: "#444", textAlign: "center", padding: "1rem", fontSize: "0.8rem" }}>
                  No presence events recorded for this network
                </div>
              ) : (
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                  {[...data.presence_events].reverse().map((ev, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "0.4rem 0",
                        borderBottom: "1px solid #1a1a22",
                        fontSize: "0.8rem",
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: ev.event === "entered" ? "#ef4444" : "#22c55e", flexShrink: 0 }} />
                      <span style={{ color: ev.event === "entered" ? "#ef4444" : "#22c55e", fontWeight: 600, width: 80 }}>
                        {ev.event === "entered" ? "ENTERED" : "LEFT"}
                      </span>
                      <span style={{ color: "#666", fontFamily: "monospace", fontSize: "0.75rem" }}>{formatTime(ev.timestamp)}</span>
                      <span style={{ color: "#444", fontFamily: "monospace", fontSize: "0.7rem" }}>{timeAgo(ev.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Mini compass preview showing where the AP will be placed
function MiniCompass({ bearing, distance, range }) {
  const size = 80;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) - 8;

  const rad = (bearing - 90) * (Math.PI / 180);
  const norm = Math.min(distance / range, 1);
  const px = cx + Math.cos(rad) * norm * r;
  const py = cy + Math.sin(rad) * norm * r;

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      {/* Ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(59,130,246,0.2)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={r / 2} fill="none" stroke="rgba(59,130,246,0.1)" strokeWidth={1} />
      {/* Cross */}
      <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="rgba(59,130,246,0.1)" strokeWidth={1} />
      <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="rgba(59,130,246,0.1)" strokeWidth={1} />
      {/* N label */}
      <text x={cx} y={6} textAnchor="middle" fill="#3b82f6" fontSize="8" fontFamily="monospace">N</text>
      {/* Center (you) */}
      <circle cx={cx} cy={cy} r={3} fill="#22c55e" />
      {/* AP position */}
      {distance > 0 && (
        <>
          <line x1={cx} y1={cy} x2={px} y2={py} stroke="rgba(59,130,246,0.3)" strokeWidth={1} strokeDasharray="2 2" />
          <circle cx={px} cy={py} r={4} fill="#3b82f6" />
        </>
      )}
    </svg>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "#12121a", borderRadius: "0.75rem", padding: "1rem", textAlign: "center", border: "1px solid #1a1a22" }}>
      <div style={{ fontSize: "0.65rem", color: "#666", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: "1.3rem", fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
