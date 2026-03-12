import { useState } from "react";
import useWebSocket from "./hooks/useWebSocket.js";
import StatusBar from "./components/StatusBar.jsx";
import PresenceIndicator from "./components/PresenceIndicator.jsx";
import RadarMap from "./components/RadarMap.jsx";
import ActivityTimeline from "./components/ActivityTimeline.jsx";
import SignalChart from "./components/SignalChart.jsx";
import NetworkList from "./components/NetworkList.jsx";
import BSSIDDetail from "./components/BSSIDDetail.jsx";

export default function App() {
  const {
    scanData,
    presenceStatus,
    connected,
    scanning,
    scanCount,
    connectedSince,
    presenceEvents,
    startScanning,
    stopScanning,
  } = useWebSocket();

  const [selectedBSSID, setSelectedBSSID] = useState(null);
  const [positionVersion, setPositionVersion] = useState(0);
  const handlePositionChange = () => setPositionVersion((v) => v + 1);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem 1rem" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h1
          style={{
            fontSize: "1.4rem",
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: "#22c55e",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <img src="/favicon.svg" alt="" width={32} height={32} style={{ borderRadius: 6 }} />
          WiFi Sight
        </h1>
      </div>

      {/* Status bar */}
      <StatusBar
        connected={connected}
        scanning={scanning}
        scanCount={scanCount}
        connectedSince={connectedSince}
        networkCount={scanData?.readings?.length ?? 0}
        onStart={startScanning}
        onStop={stopScanning}
      />

      {/* Main grid: radar (left) + sidebar (right) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "3fr 2fr",
          gap: "1.5rem",
          marginBottom: "1.5rem",
        }}
      >
        {/* Radar */}
        <RadarMap
          scanData={scanData}
          presence={presenceStatus}
          onSelectBSSID={setSelectedBSSID}
          positionVersion={positionVersion}
        />

        {/* Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <PresenceIndicator presence={presenceStatus} />
          <ActivityTimeline
            events={presenceEvents}
            detectionDuration={presenceStatus?.detection_duration ?? 0}
          />
        </div>
      </div>

      {/* Bottom section */}
      <SignalChart scanData={scanData} />
      <NetworkList
        scanData={scanData}
        presenceStatus={presenceStatus}
        onSelectBSSID={setSelectedBSSID}
      />

      {/* BSSID detail modal */}
      {selectedBSSID && (
        <BSSIDDetail
          bssid={selectedBSSID}
          onClose={() => setSelectedBSSID(null)}
          onPositionChange={handlePositionChange}
        />
      )}
    </div>
  );
}
