import { useState, useEffect, useRef, useCallback } from "react";

export default function useWebSocket() {
  const [scanData, setScanData] = useState(null);
  const [presenceStatus, setPresenceStatus] = useState(null);
  const [connected, setConnected] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [scanCount, setScanCount] = useState(0);
  const [connectedSince, setConnectedSince] = useState(null);
  const [presenceEvents, setPresenceEvents] = useState([]);
  const wsRef = useRef(null);
  const shouldReconnectRef = useRef(true);

  useEffect(() => {
    function connect() {
      if (!shouldReconnectRef.current) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setConnectedSince(Date.now());
        setScanning(true);
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        setScanData(msg.scan);
        setPresenceStatus(msg.presence);
        setScanCount((c) => c + 1);

        if (msg.presence.event) {
          setPresenceEvents((prev) => [
            ...prev.slice(-99),
            {
              time: Date.now(),
              type: msg.presence.event,
              confidence: msg.presence.confidence,
            },
          ]);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setConnectedSince(null);
        if (shouldReconnectRef.current) {
          setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      shouldReconnectRef.current = false;
      wsRef.current?.close();
    };
  }, []);

  const stopScanning = useCallback(() => {
    shouldReconnectRef.current = false;
    wsRef.current?.close();
    setScanning(false);
  }, []);

  const startScanning = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    shouldReconnectRef.current = true;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setConnectedSince(Date.now());
      setScanning(true);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      setScanData(msg.scan);
      setPresenceStatus(msg.presence);
      setScanCount((c) => c + 1);

      if (msg.presence.event) {
        setPresenceEvents((prev) => [
          ...prev.slice(-99),
          {
            time: Date.now(),
            type: msg.presence.event,
            confidence: msg.presence.confidence,
          },
        ]);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      setConnectedSince(null);
      if (shouldReconnectRef.current) {
        setTimeout(startScanning, 2000);
      }
    };

    ws.onerror = () => ws.close();
  }, []);

  return {
    scanData,
    presenceStatus,
    connected,
    scanning,
    scanCount,
    connectedSince,
    presenceEvents,
    startScanning,
    stopScanning,
  };
}
