function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function ActivityTimeline({ events, detectionDuration }) {
  const reversed = [...events].reverse();

  return (
    <div
      style={{
        background: "#12121a",
        borderRadius: "1rem",
        padding: "1.5rem",
        border: "1px solid #1a1a2a",
        height: "100%",
        minHeight: 200,
      }}
    >
      <h2 style={{ fontSize: "1.1rem", marginBottom: "1rem", color: "#e0e0e0" }}>
        Activity Log
      </h2>

      {detectionDuration > 0 && (
        <div
          style={{
            padding: "0.5rem 0.75rem",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "0.5rem",
            marginBottom: "1rem",
            fontFamily: "monospace",
            fontSize: "0.8rem",
            color: "#ef4444",
          }}
        >
          Active for {formatDuration(detectionDuration)}
        </div>
      )}

      {reversed.length === 0 ? (
        <div
          style={{
            color: "#444",
            fontFamily: "monospace",
            fontSize: "0.8rem",
            textAlign: "center",
            padding: "2rem 0",
          }}
        >
          Monitoring...
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {reversed.map((ev, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "0.5rem 0",
                borderLeft: `2px solid ${
                  ev.type === "entered"
                    ? "rgba(239, 68, 68, 0.5)"
                    : "rgba(34, 197, 94, 0.5)"
                }`,
                paddingLeft: "0.75rem",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: ev.type === "entered" ? "#ef4444" : "#22c55e",
                  marginTop: 4,
                  flexShrink: 0,
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: "0.85rem",
                    color: ev.type === "entered" ? "#ef4444" : "#22c55e",
                    fontWeight: 600,
                  }}
                >
                  {ev.type === "entered" ? "Presence Detected" : "Area Clear"}
                </div>
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "#555",
                    fontFamily: "monospace",
                    marginTop: 2,
                  }}
                >
                  {timeAgo(ev.time)}
                  {ev.confidence > 0 &&
                    ` · ${Math.round(ev.confidence * 100)}% confidence`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
