import { useState, useEffect } from "react";

function formatUptime(ms) {
  if (!ms) return "--:--";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

const btnStyle = (active) => ({
  background: active ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
  border: `1px solid ${active ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.4)"}`,
  color: active ? "#ef4444" : "#22c55e",
  borderRadius: 4,
  padding: "3px 10px",
  cursor: "pointer",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: "0.7rem",
  fontWeight: 700,
  letterSpacing: "0.05em",
  transition: "all 0.2s",
});

export default function StatusBar({
  connected,
  scanning,
  scanCount,
  connectedSince,
  networkCount,
  onStart,
  onStop,
}) {
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    if (!connectedSince) return;
    const interval = setInterval(() => {
      setUptime(Date.now() - connectedSince);
    }, 1000);
    return () => clearInterval(interval);
  }, [connectedSince]);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.6rem 1.2rem",
        background: "#0d0d14",
        borderRadius: "0.5rem",
        marginBottom: "1.5rem",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "0.75rem",
        color: "#666",
        border: "1px solid #1a1a2a",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: scanning ? "#22c55e" : connected ? "#eab308" : "#ef4444",
              display: "inline-block",
              boxShadow: scanning
                ? "0 0 8px rgba(34, 197, 94, 0.6)"
                : "0 0 8px rgba(239, 68, 68, 0.6)",
              animation: scanning ? "pulse 2s infinite" : "none",
            }}
          />
          <span style={{
            color: scanning ? "#22c55e" : connected ? "#eab308" : "#ef4444",
            fontWeight: 700,
          }}>
            {scanning ? "SCANNING" : "PAUSED"}
          </span>
        </div>

        {scanning ? (
          <button style={btnStyle(true)} onClick={onStop}>
            ■ STOP
          </button>
        ) : (
          <button style={btnStyle(false)} onClick={onStart}>
            ▶ START
          </button>
        )}
      </div>

      <span>SCAN #{scanCount.toString().padStart(4, "0")}</span>
      <span>UPTIME {formatUptime(uptime)}</span>
      <span>{networkCount} APs</span>
      <span>WiFi Sight v0.1</span>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
