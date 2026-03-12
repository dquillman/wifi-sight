function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function PresenceIndicator({ presence }) {
  const detected = presence?.detected ?? false;
  const confidence = presence?.confidence ?? 0;
  const duration = formatDuration(presence?.detection_duration);
  const contributing = presence?.contributing_bssids?.length ?? 0;

  // SVG confidence ring
  const ringRadius = 52;
  const circumference = 2 * Math.PI * ringRadius;
  const dashOffset = circumference * (1 - confidence);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        borderRadius: "1rem",
        background: detected
          ? "rgba(239, 68, 68, 0.08)"
          : "rgba(34, 197, 94, 0.05)",
        border: `1px solid ${
          detected ? "rgba(239, 68, 68, 0.25)" : "rgba(34, 197, 94, 0.15)"
        }`,
        transition: "all 0.5s ease",
      }}
    >
      {/* Confidence ring with icon */}
      <svg width={130} height={130} style={{ marginBottom: "0.75rem" }}>
        {/* Background ring */}
        <circle
          cx={65}
          cy={65}
          r={ringRadius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={4}
        />
        {/* Confidence arc */}
        <circle
          cx={65}
          cy={65}
          r={ringRadius}
          fill="none"
          stroke={detected ? "#ef4444" : "#22c55e"}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 65 65)"
          style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.5s ease" }}
        />
        {/* Concentric pulse circles */}
        {detected && (
          <>
            <circle cx={65} cy={65} r={30} fill="none" stroke="rgba(239,68,68,0.15)" strokeWidth={1}>
              <animate attributeName="r" from="20" to="45" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.6" to="0" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={65} cy={65} r={30} fill="none" stroke="rgba(239,68,68,0.1)" strokeWidth={1}>
              <animate attributeName="r" from="20" to="45" dur="2s" begin="0.7s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.4" to="0" dur="2s" begin="0.7s" repeatCount="indefinite" />
            </circle>
          </>
        )}
        {/* Center icon */}
        <circle
          cx={65}
          cy={65}
          r={22}
          fill={detected ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.1)"}
          style={{ transition: "fill 0.5s ease" }}
        />
        <text
          x={65}
          y={70}
          textAnchor="middle"
          fontSize="20"
          fill={detected ? "#ef4444" : "#22c55e"}
        >
          {detected ? "⦿" : "○"}
        </text>
      </svg>

      <div
        style={{
          fontSize: "1.3rem",
          fontWeight: 700,
          color: detected ? "#ef4444" : "#22c55e",
          transition: "color 0.5s ease",
        }}
      >
        {detected ? "PRESENCE DETECTED" : "AREA CLEAR"}
      </div>

      <div
        style={{
          display: "flex",
          gap: "1.5rem",
          marginTop: "0.5rem",
          fontSize: "0.75rem",
          fontFamily: "monospace",
          color: "#666",
        }}
      >
        <span>
          {Math.round(confidence * 100)}% confidence
        </span>
        {contributing > 0 && <span>{contributing} APs</span>}
        {duration && (
          <span style={{ color: "#ef4444" }}>
            {duration}
          </span>
        )}
      </div>
    </div>
  );
}
