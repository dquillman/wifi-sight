import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const COLORS = [
  "#8884d8", "#82ca9d", "#ffc658", "#ff7300", "#00c49f",
  "#0088fe", "#ff6b6b", "#a29bfe", "#fd79a8", "#6c5ce7",
];

const MAX_POINTS = 60;

export default function SignalChart({ scanData }) {
  const [history, setHistory] = useState([]);
  const [bssids, setBssids] = useState([]);

  useEffect(() => {
    if (!scanData) return;

    const point = { time: new Date(scanData.timestamp * 1000).toLocaleTimeString() };
    for (const r of scanData.readings) {
      point[r.bssid] = r.signal_pct;
    }

    setHistory((prev) => {
      const next = [...prev, point];
      return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
    });

    setBssids((prev) => {
      const seen = new Set(prev);
      for (const r of scanData.readings) {
        seen.add(r.bssid);
      }
      return [...seen];
    });
  }, [scanData]);

  return (
    <div style={{ background: "#12121a", borderRadius: "1rem", padding: "1.5rem", marginBottom: "1.5rem" }}>
      <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Signal Strength Over Time</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={history}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="time" stroke="#666" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} stroke="#666" tick={{ fontSize: 11 }} label={{ value: "%", position: "insideLeft" }} />
          <Tooltip contentStyle={{ background: "#1a1a2a", border: "1px solid #333" }} />
          {bssids.map((bssid, i) => (
            <Line
              key={bssid}
              type="monotone"
              dataKey={bssid}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
