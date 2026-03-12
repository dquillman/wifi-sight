import { useState } from "react";

const cellStyle = {
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid #1a1a22",
  textAlign: "left",
  fontSize: "0.8rem",
};

const headerStyle = {
  ...cellStyle,
  fontWeight: 600,
  borderBottom: "2px solid #2a2a3a",
  color: "#888",
  fontSize: "0.7rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  cursor: "pointer",
  userSelect: "none",
};

function SignalBar({ value }) {
  const color =
    value > 70 ? "#22c55e" : value > 40 ? "#eab308" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div
        style={{
          width: 60,
          height: 4,
          background: "#1a1a2a",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: "100%",
            background: color,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span style={{ color, fontFamily: "monospace", fontSize: "0.8rem" }}>
        {value}%
      </span>
    </div>
  );
}

function VarianceIndicator({ variance }) {
  if (!variance) return <span style={{ color: "#333" }}>—</span>;
  const bars = Math.min(5, Math.round(variance.std_dev));
  return (
    <span
      style={{
        fontFamily: "monospace",
        fontSize: "0.7rem",
        color: variance.above_threshold ? "#ef4444" : "#444",
      }}
    >
      {"▮".repeat(bars)}{"▯".repeat(5 - bars)}
      <span style={{ marginLeft: 4 }}>{variance.std_dev.toFixed(1)}</span>
    </span>
  );
}

export default function NetworkList({ scanData, presenceStatus, onSelectBSSID }) {
  const [sortKey, setSortKey] = useState("signal_pct");
  const [sortAsc, setSortAsc] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const readings = scanData?.readings ?? [];
  const varianceMap = {};
  for (const v of presenceStatus?.bssid_variances ?? []) {
    varianceMap[v.bssid] = v;
  }
  const contributing = new Set(presenceStatus?.contributing_bssids ?? []);

  const sorted = [...readings].sort((a, b) => {
    let av = a[sortKey] ?? "";
    let bv = b[sortKey] ?? "";
    if (typeof av === "number") return sortAsc ? av - bv : bv - av;
    return sortAsc
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortArrow = (key) =>
    sortKey === key ? (sortAsc ? " ↑" : " ↓") : "";

  return (
    <div
      style={{
        background: "#12121a",
        borderRadius: "1rem",
        padding: "1.5rem",
        border: "1px solid #1a1a2a",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: collapsed ? 0 : "1rem",
          cursor: "pointer",
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <h2 style={{ fontSize: "1.1rem", color: "#e0e0e0" }}>
          Visible Networks
          <span style={{ fontSize: "0.75rem", color: "#555", marginLeft: "0.5rem" }}>
            ({readings.length})
          </span>
        </h2>
        <span
          style={{
            color: "#555",
            fontSize: "0.8rem",
            fontFamily: "monospace",
            transition: "transform 0.2s",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0)",
            display: "inline-block",
          }}
        >
          ▼
        </span>
      </div>

      {!collapsed && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headerStyle} onClick={() => handleSort("ssid")}>
                  SSID{sortArrow("ssid")}
                </th>
                <th style={headerStyle} onClick={() => handleSort("bssid")}>
                  BSSID{sortArrow("bssid")}
                </th>
                <th style={headerStyle} onClick={() => handleSort("signal_pct")}>
                  Signal{sortArrow("signal_pct")}
                </th>
                <th style={headerStyle}>Variance</th>
                <th style={headerStyle} onClick={() => handleSort("channel")}>
                  CH{sortArrow("channel")}
                </th>
                <th style={headerStyle} onClick={() => handleSort("band")}>
                  Band{sortArrow("band")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const isActive = contributing.has(r.bssid);
                const rowBg = isActive
                  ? "rgba(239, 68, 68, 0.05)"
                  : "transparent";
                return (
                  <tr
                    key={r.bssid}
                    style={{
                      background: rowBg,
                      transition: "background 0.2s",
                      cursor: "pointer",
                    }}
                    onClick={() => onSelectBSSID?.(r.bssid)}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = isActive
                        ? "rgba(239, 68, 68, 0.1)"
                        : "rgba(255,255,255,0.03)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = rowBg)
                    }
                  >
                    <td style={cellStyle}>
                      {isActive && (
                        <span style={{ color: "#ef4444", marginRight: 6 }}>●</span>
                      )}
                      {r.ssid || "(hidden)"}
                    </td>
                    <td
                      style={{
                        ...cellStyle,
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                        color: "#777",
                      }}
                    >
                      {r.bssid}
                    </td>
                    <td style={cellStyle}>
                      <SignalBar value={r.signal_pct} />
                    </td>
                    <td style={cellStyle}>
                      <VarianceIndicator variance={varianceMap[r.bssid]} />
                    </td>
                    <td style={cellStyle}>{r.channel}</td>
                    <td style={cellStyle}>{r.band}</td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{ ...cellStyle, textAlign: "center", color: "#444" }}
                  >
                    No networks detected
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
