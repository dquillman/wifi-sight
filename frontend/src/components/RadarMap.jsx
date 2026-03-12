import { useState, useEffect, useRef } from "react";

const RING_COUNT = 4;
const SWEEP_SPEED = 4;
const TRAIL_LENGTH = 8;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3.0;
const STORAGE_KEY = "wifi-sight-ap-positions";

function signalToDistance(signalPct) {
  return 1 - signalPct / 100;
}

function bssidToAngle(bssid) {
  let hash = 0;
  for (let i = 0; i < bssid.length; i++) {
    hash = (hash * 31 + bssid.charCodeAt(i)) & 0xffffffff;
  }
  return (hash % 360) * (Math.PI / 180);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function formatAge(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

// Load saved AP positions from localStorage
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

export default function RadarMap({ scanData, presence, onSelectBSSID, positionVersion }) {
  const canvasRef = useRef(null);
  const sweepAngleRef = useRef(0);
  const blipsRef = useRef([]);
  const blipPosRef = useRef({});
  const animFrameRef = useRef(null);
  const zoomRef = useRef(1.0);
  const panRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const hoveredBlipRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const pulsePhaseRef = useRef({});
  const frameCountRef = useRef(0);
  const onSelectRef = useRef(onSelectBSSID);
  onSelectRef.current = onSelectBSSID;

  // AP placement state
  const [placementMode, setPlacementMode] = useState(false);
  const apPositionsRef = useRef(loadPositions()); // { bssid: { nx, ny } } normalized -1..1
  const draggingBlipRef = useRef(null); // bssid being dragged for placement
  const estimatedPosRef = useRef(null); // { x, y } estimated person position (canvas coords)
  const personTrailRef = useRef([]); // trail for person marker
  const personPulseRef = useRef(0);

  // Pinned detection markers — persist until user deletes them
  // Each: { id, nx, ny, timestamp, distance, direction, apCount, confidence, active }
  const [pinnedMarkers, setPinnedMarkers] = useState([]);
  const pinnedMarkersRef = useRef([]);
  pinnedMarkersRef.current = pinnedMarkers;
  const selectedMarkerRef = useRef(null); // id of marker being hovered
  const lastPinTimeRef = useRef(0); // debounce: don't pin too often
  const setPinnedMarkersRef = useRef(null);
  setPinnedMarkersRef.current = setPinnedMarkers;

  // Refs for draw loop to read canvas center/radius
  const canvasGeomRef = useRef({ cx: 0, cy: 0, radius: 1 });
  const maxRangeRef = useRef(20); // meters for outer ring

  // Reload positions when they change externally (e.g. from BSSIDDetail modal)
  useEffect(() => {
    apPositionsRef.current = loadPositions();
    // Compute max range from saved positions
    const positions = apPositionsRef.current;
    let maxR = 20;
    for (const pos of Object.values(positions)) {
      if (pos.maxRange && pos.maxRange > maxR) maxR = pos.maxRange;
    }
    maxRangeRef.current = maxR;
  }, [positionVersion]);

  // Update blips when scan data changes
  useEffect(() => {
    if (!scanData) return;
    const contributing = new Set(presence?.contributing_bssids ?? []);
    const positions = apPositionsRef.current;

    blipsRef.current = scanData.readings.map((r) => {
      const placed = positions[r.bssid];
      return {
        bssid: r.bssid,
        ssid: r.ssid,
        signal: r.signal_pct,
        band: r.band,
        channel: r.channel,
        // If placed, use placed position; otherwise use signal-based default
        nx: placed ? placed.nx : null,
        ny: placed ? placed.ny : null,
        distance: signalToDistance(r.signal_pct),
        angle: bssidToAngle(r.bssid),
        active: contributing.has(r.bssid),
        placed: !!placed,
      };
    });
  }, [scanData, presence]);

  // Canvas event handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY * -0.002;
      zoomRef.current = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current + delta));
    };

    const onMouseDown = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      mouseRef.current = { x: mx, y: my };

      // Check if we're clicking a blip in placement mode
      if (placementModeRef.current) {
        const { cx, cy, radius } = canvasGeomRef.current;
        for (const blip of blipsRef.current) {
          const pos = blipPosRef.current[blip.bssid];
          if (!pos) continue;
          const dist = Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2);
          if (dist < 20) {
            draggingBlipRef.current = blip.bssid;
            canvas.style.cursor = "move";
            return;
          }
        }
      }

      isDraggingRef.current = true;
      dragStartRef.current = { x: mx, y: my };
      panStartRef.current = { ...panRef.current };
      canvas.style.cursor = "grabbing";
    };

    const onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      mouseRef.current = { x: mx, y: my };

      if (draggingBlipRef.current) {
        // Move the blip being placed
        const { cx, cy, radius } = canvasGeomRef.current;
        const nx = (mx - cx) / radius;
        const ny = (my - cy) / radius;
        apPositionsRef.current[draggingBlipRef.current] = { nx, ny };
        return;
      }

      if (isDraggingRef.current) {
        panRef.current = {
          x: panStartRef.current.x + (mx - dragStartRef.current.x),
          y: panStartRef.current.y + (my - dragStartRef.current.y),
        };
      }
    };

    const onMouseUp = () => {
      if (draggingBlipRef.current) {
        savePositions(apPositionsRef.current);
        draggingBlipRef.current = null;
      }
      isDraggingRef.current = false;
      canvas.style.cursor = placementModeRef.current ? "move" : "crosshair";
    };

    const onDblClick = () => {
      if (!placementModeRef.current) {
        zoomRef.current = 1.0;
        panRef.current = { x: 0, y: 0 };
      }
    };

    const onClick = (e) => {
      if (draggingBlipRef.current) return;
      // Check if clicking a pinned marker to dismiss it
      if (selectedMarkerRef.current != null) {
        setPinnedMarkersRef.current(prev => prev.filter(m => m.id !== selectedMarkerRef.current));
        selectedMarkerRef.current = null;
        return;
      }
      if (hoveredBlipRef.current && onSelectRef.current && !placementModeRef.current) {
        onSelectRef.current(hoveredBlipRef.current.bssid);
      }
    };

    const onContextMenu = (e) => {
      e.preventDefault();
      // Right-click on a blip to quick-place it
      if (hoveredBlipRef.current) {
        const { cx, cy, radius } = canvasGeomRef.current;
        const pos = blipPosRef.current[hoveredBlipRef.current.bssid];
        if (pos) {
          const nx = (pos.x - cx) / radius;
          const ny = (pos.y - cy) / radius;
          apPositionsRef.current[hoveredBlipRef.current.bssid] = { nx, ny };
          savePositions(apPositionsRef.current);
        }
      }
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mouseleave", onMouseUp);
    canvas.addEventListener("dblclick", onDblClick);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("contextmenu", onContextMenu);

    return () => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mouseleave", onMouseUp);
      canvas.removeEventListener("dblclick", onDblClick);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  // Keep a ref to placement mode so the draw loop and handlers can read it
  const placementModeRef = useRef(false);
  placementModeRef.current = placementMode;

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let lastTime = performance.now();

    function draw(now) {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      frameCountRef.current++;
      sweepAngleRef.current += (dt / SWEEP_SPEED) * Math.PI * 2;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;
      const baseCx = w / 2;
      const baseCy = h / 2;
      const cx = baseCx + panRef.current.x;
      const cy = baseCy + panRef.current.y;
      const baseRadius = Math.min(baseCx, baseCy) - 45;
      const radius = baseRadius * zoomRef.current;

      canvasGeomRef.current = { cx, cy, radius };

      const inPlacement = placementModeRef.current;

      // Background
      ctx.fillStyle = "#080c08";
      ctx.fillRect(0, 0, w, h);

      // Placement mode tint
      if (inPlacement) {
        ctx.fillStyle = "rgba(59, 130, 246, 0.03)";
        ctx.fillRect(0, 0, w, h);
      }

      // Outer glow
      const outerGlow = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.1);
      outerGlow.addColorStop(0, "transparent");
      outerGlow.addColorStop(1, "rgba(34, 197, 94, 0.03)");
      ctx.fillStyle = outerGlow;
      ctx.fillRect(0, 0, w, h);

      // Distance rings
      for (let i = 1; i <= RING_COUNT; i++) {
        const r = (radius / RING_COUNT) * i;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = i === RING_COUNT
          ? "rgba(34, 197, 94, 0.3)"
          : "rgba(34, 197, 94, 0.12)";
        ctx.lineWidth = i === RING_COUNT ? 1.5 : 1;
        ctx.stroke();

        // Ring labels — show meters based on configured range
        const meters = Math.round((i / RING_COUNT) * maxRangeRef.current);
        const label = `${meters}m`;
        ctx.fillStyle = "rgba(34, 197, 94, 0.25)";
        ctx.font = "10px 'JetBrains Mono', monospace";
        ctx.fillText(label, cx + 4, cy - r + 12);
      }

      // Cross hairs (8 lines at 45-degree intervals)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
        ctx.strokeStyle = i % 2 === 0
          ? "rgba(34, 197, 94, 0.12)"
          : "rgba(34, 197, 94, 0.06)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Tick marks
      for (let deg = 0; deg < 360; deg += 10) {
        const a = (deg * Math.PI) / 180;
        const inner = deg % 30 === 0 ? radius - 8 : radius - 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
        ctx.strokeStyle = deg % 30 === 0
          ? "rgba(34, 197, 94, 0.35)"
          : "rgba(34, 197, 94, 0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Compass rose
      const cardinals = [
        { label: "N", angle: -Math.PI / 2, primary: true },
        { label: "E", angle: 0, primary: false },
        { label: "S", angle: Math.PI / 2, primary: false },
        { label: "W", angle: Math.PI, primary: false },
      ];
      for (const c of cardinals) {
        const lx = cx + Math.cos(c.angle) * (radius + 18);
        const ly = cy + Math.sin(c.angle) * (radius + 18);
        ctx.fillStyle = c.primary ? "#22c55e" : "rgba(34, 197, 94, 0.4)";
        ctx.font = c.primary
          ? "bold 14px 'JetBrains Mono', monospace"
          : "12px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(c.label, lx, ly);
      }

      // North triangle
      const nTriY = cy - radius - 28;
      ctx.beginPath();
      ctx.moveTo(cx, nTriY - 6);
      ctx.lineTo(cx - 5, nTriY + 4);
      ctx.lineTo(cx + 5, nTriY + 4);
      ctx.closePath();
      ctx.fillStyle = "#22c55e";
      ctx.fill();

      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";

      // Sweep trail
      const sweepAngle = sweepAngleRef.current;
      for (let i = 0; i < 40; i++) {
        const a = sweepAngle - (i / 40) * 1.0;
        const opacity = (1 - i / 40) * 0.1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
        ctx.strokeStyle = `rgba(34, 197, 94, ${opacity})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Sweep cone fill
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, sweepAngle - 0.8, sweepAngle);
      ctx.closePath();
      const sweepGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      sweepGrad.addColorStop(0, "rgba(34, 197, 94, 0.08)");
      sweepGrad.addColorStop(1, "rgba(34, 197, 94, 0.02)");
      ctx.fillStyle = sweepGrad;
      ctx.fill();

      // Main sweep line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(sweepAngle) * radius,
        cy + Math.sin(sweepAngle) * radius
      );
      ctx.strokeStyle = "rgba(34, 197, 94, 0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Center dot with glow
      const centerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 15);
      centerGlow.addColorStop(0, "rgba(34, 197, 94, 0.3)");
      centerGlow.addColorStop(1, "transparent");
      ctx.beginPath();
      ctx.arc(cx, cy, 15, 0, Math.PI * 2);
      ctx.fillStyle = centerGlow;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#22c55e";
      ctx.fill();

      // --- Blips ---
      let newHovered = null;
      const activeBlipPositions = []; // for person estimation

      for (const blip of blipsRef.current) {
        let targetX, targetY;

        if (blip.placed || apPositionsRef.current[blip.bssid]) {
          // Use placed position
          const pos = apPositionsRef.current[blip.bssid];
          if (pos) {
            targetX = cx + pos.nx * radius;
            targetY = cy + pos.ny * radius;
          } else {
            targetX = cx + Math.cos(blip.angle) * blip.distance * radius;
            targetY = cy + Math.sin(blip.angle) * blip.distance * radius;
          }
        } else {
          // Default: signal-based position
          targetX = cx + Math.cos(blip.angle) * blip.distance * radius;
          targetY = cy + Math.sin(blip.angle) * blip.distance * radius;
        }

        // Initialize or update position
        if (!blipPosRef.current[blip.bssid]) {
          blipPosRef.current[blip.bssid] = {
            x: targetX,
            y: targetY,
            trail: [],
          };
        }

        const pos = blipPosRef.current[blip.bssid];

        // If being dragged, snap to mouse
        if (draggingBlipRef.current === blip.bssid) {
          pos.x = mouseRef.current.x;
          pos.y = mouseRef.current.y;
        } else {
          pos.x = lerp(pos.x, targetX, 0.08);
          pos.y = lerp(pos.y, targetY, 0.08);
        }

        if (frameCountRef.current % 4 === 0) {
          pos.trail.push({ x: pos.x, y: pos.y });
          if (pos.trail.length > TRAIL_LENGTH) pos.trail.shift();
        }

        const bx = pos.x;
        const by = pos.y;

        // Collect active blip positions for person estimation
        if (blip.active && apPositionsRef.current[blip.bssid]) {
          const variance = presence?.bssid_variances?.find(v => v.bssid === blip.bssid);
          activeBlipPositions.push({
            x: bx,
            y: by,
            nx: apPositionsRef.current[blip.bssid].nx,
            ny: apPositionsRef.current[blip.bssid].ny,
            weight: variance ? variance.std_dev : 1,
          });
        }

        // Draw trail
        for (let i = 0; i < pos.trail.length; i++) {
          const t = pos.trail[i];
          const alpha = ((i + 1) / pos.trail.length) * 0.3;
          const trailSize = 1 + (i / pos.trail.length) * 2;
          ctx.beginPath();
          ctx.arc(t.x, t.y, trailSize, 0, Math.PI * 2);
          ctx.fillStyle = blip.active
            ? `rgba(239, 68, 68, ${alpha})`
            : `rgba(34, 197, 94, ${alpha})`;
          ctx.fill();
        }

        // Pulse animation for active blips
        if (blip.active) {
          if (!pulsePhaseRef.current[blip.bssid]) pulsePhaseRef.current[blip.bssid] = 0;
          pulsePhaseRef.current[blip.bssid] =
            (pulsePhaseRef.current[blip.bssid] + 0.015) % 1.0;
          const phase = pulsePhaseRef.current[blip.bssid];

          ctx.beginPath();
          ctx.arc(bx, by, 6 + phase * 30, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(239, 68, 68, ${(1 - phase) * 0.5})`;
          ctx.lineWidth = 2;
          ctx.stroke();

          const glow = ctx.createRadialGradient(bx, by, 0, bx, by, 22);
          glow.addColorStop(0, "rgba(239, 68, 68, 0.35)");
          glow.addColorStop(1, "rgba(239, 68, 68, 0)");
          ctx.beginPath();
          ctx.arc(bx, by, 22, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Placement mode: draw drag handle ring
        if (inPlacement) {
          ctx.beginPath();
          ctx.arc(bx, by, 12, 0, Math.PI * 2);
          ctx.strokeStyle = apPositionsRef.current[blip.bssid]
            ? "rgba(59, 130, 246, 0.6)"
            : "rgba(255, 255, 255, 0.2)";
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);

          // "Placed" indicator
          if (apPositionsRef.current[blip.bssid]) {
            ctx.fillStyle = "rgba(59, 130, 246, 0.7)";
            ctx.font = "8px 'JetBrains Mono', monospace";
            ctx.fillText("📌", bx - 5, by - 14);
          }
        }

        // Blip dot
        const isPlaced = !!apPositionsRef.current[blip.bssid];
        ctx.beginPath();
        ctx.arc(bx, by, blip.active ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = blip.active ? "#ef4444" : (isPlaced ? "#3b82f6" : "#22c55e");
        ctx.fill();

        // Blip outer ring
        ctx.beginPath();
        ctx.arc(bx, by, blip.active ? 7 : 5, 0, Math.PI * 2);
        ctx.strokeStyle = blip.active
          ? "rgba(239, 68, 68, 0.4)"
          : (isPlaced ? "rgba(59, 130, 246, 0.3)" : "rgba(34, 197, 94, 0.3)");
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label
        ctx.fillStyle = blip.active
          ? "rgba(239, 68, 68, 0.85)"
          : (isPlaced ? "rgba(59, 130, 246, 0.6)" : "rgba(34, 197, 94, 0.5)");
        ctx.font = "10px 'JetBrains Mono', monospace";
        const label = blip.ssid || blip.bssid.slice(-8);
        ctx.fillText(label, bx + 10, by + 3);

        // Hover detection
        const mx = mouseRef.current.x;
        const my = mouseRef.current.y;
        const dist = Math.sqrt((mx - bx) ** 2 + (my - by) ** 2);
        if (dist < 18) newHovered = blip;
      }

      hoveredBlipRef.current = newHovered;

      // --- Estimated person location ---
      if (activeBlipPositions.length > 0) {
        let totalWeight = 0;
        let estX = 0;
        let estY = 0;

        for (const ap of activeBlipPositions) {
          const w = ap.weight;
          const px = cx + ap.nx * radius * 0.4;
          const py = cy + ap.ny * radius * 0.4;
          estX += px * w;
          estY += py * w;
          totalWeight += w;
        }

        if (totalWeight > 0) {
          estX /= totalWeight;
          estY /= totalWeight;
        }

        if (!estimatedPosRef.current) {
          estimatedPosRef.current = { x: estX, y: estY };
        } else {
          estimatedPosRef.current.x = lerp(estimatedPosRef.current.x, estX, 0.06);
          estimatedPosRef.current.y = lerp(estimatedPosRef.current.y, estY, 0.06);
        }

        // Pin a new marker every 5 seconds while presence is active
        const nowMs = Date.now();
        if (nowMs - lastPinTimeRef.current > 5000) {
          lastPinTimeRef.current = nowMs;
          const enx = (estimatedPosRef.current.x - cx) / radius;
          const eny = (estimatedPosRef.current.y - cy) / radius;
          const distFromCenter = Math.sqrt((estimatedPosRef.current.x - cx) ** 2 + (estimatedPosRef.current.y - cy) ** 2);
          const metersEst = Math.round((distFromCenter / radius) * maxRangeRef.current);
          const angleFromCenter = Math.atan2(estimatedPosRef.current.y - cy, estimatedPosRef.current.x - cx);
          const brg = ((angleFromCenter * 180 / Math.PI) + 90 + 360) % 360;
          const confPct = Math.min(100, Math.round(activeBlipPositions.length / Math.max(blipsRef.current.length, 1) * 100));

          // Update existing active marker or create new one
          const existing = pinnedMarkersRef.current.find(m => m.active);
          if (existing) {
            // Update position of active marker
            setPinnedMarkersRef.current(prev => prev.map(m =>
              m.id === existing.id
                ? { ...m, nx: enx, ny: eny, distance: metersEst, direction: bearingToCompass(brg), apCount: activeBlipPositions.length, confidence: confPct, lastUpdate: nowMs }
                : m
            ));
          } else {
            // Create new pinned marker
            const marker = {
              id: nowMs,
              nx: enx,
              ny: eny,
              timestamp: nowMs,
              lastUpdate: nowMs,
              distance: metersEst,
              direction: bearingToCompass(brg),
              apCount: activeBlipPositions.length,
              confidence: confPct,
              active: true,
            };
            setPinnedMarkersRef.current(prev => [...prev, marker]);
          }
        }
      } else {
        estimatedPosRef.current = null;
        personTrailRef.current = [];
        // Mark all active markers as inactive (but keep them on the radar)
        if (pinnedMarkersRef.current.some(m => m.active)) {
          setPinnedMarkers(prev => prev.map(m => m.active ? { ...m, active: false } : m));
        }
      }

      // --- Draw all pinned markers ---
      let hoveredMarkerId = null;
      for (const marker of pinnedMarkersRef.current) {
        const mpx = cx + marker.nx * radius;
        const mpy = cy + marker.ny * radius;
        const isActive = marker.active;
        const age = (Date.now() - marker.timestamp) / 1000;

        // Check if mouse is hovering this marker
        const mmx = mouseRef.current.x;
        const mmy = mouseRef.current.y;
        const mdist = Math.sqrt((mmx - mpx) ** 2 + (mmy - mpy) ** 2);
        if (mdist < 20) hoveredMarkerId = marker.id;

        const isHovered = hoveredMarkerId === marker.id;

        if (isActive) {
          // Active: animate trail and pulse
          if (estimatedPosRef.current) {
            // Person trail for active marker
            if (frameCountRef.current % 6 === 0) {
              personTrailRef.current.push({ x: estimatedPosRef.current.x, y: estimatedPosRef.current.y });
              if (personTrailRef.current.length > 12) personTrailRef.current.shift();
            }
            for (let i = 0; i < personTrailRef.current.length; i++) {
              const t = personTrailRef.current[i];
              const alpha = ((i + 1) / personTrailRef.current.length) * 0.25;
              ctx.beginPath();
              ctx.arc(t.x, t.y, 2 + (i / personTrailRef.current.length) * 3, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(255, 165, 0, ${alpha})`;
              ctx.fill();
            }
          }

          // Pulse rings
          personPulseRef.current = (personPulseRef.current + 0.012) % 1.0;
          const pp = personPulseRef.current;
          for (let ring = 0; ring < 2; ring++) {
            const phase = (pp + ring * 0.5) % 1.0;
            ctx.beginPath();
            ctx.arc(mpx, mpy, 8 + phase * 40, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 165, 0, ${(1 - phase) * 0.4})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // Uncertainty zone
          const uncertainty = Math.max(20, 60 - marker.apCount * 15);
          const uncGrad = ctx.createRadialGradient(mpx, mpy, 0, mpx, mpy, uncertainty);
          uncGrad.addColorStop(0, "rgba(255, 165, 0, 0.12)");
          uncGrad.addColorStop(0.7, "rgba(255, 165, 0, 0.05)");
          uncGrad.addColorStop(1, "rgba(255, 165, 0, 0)");
          ctx.beginPath();
          ctx.arc(mpx, mpy, uncertainty, 0, Math.PI * 2);
          ctx.fillStyle = uncGrad;
          ctx.fill();

          // Lines to contributing APs
          for (const ap of activeBlipPositions) {
            ctx.beginPath();
            ctx.moveTo(mpx, mpy);
            ctx.lineTo(ap.x, ap.y);
            ctx.strokeStyle = "rgba(255, 165, 0, 0.15)";
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } else {
          // Inactive: dimmer static glow
          const uncGrad = ctx.createRadialGradient(mpx, mpy, 0, mpx, mpy, 15);
          uncGrad.addColorStop(0, "rgba(255, 165, 0, 0.08)");
          uncGrad.addColorStop(1, "rgba(255, 165, 0, 0)");
          ctx.beginPath();
          ctx.arc(mpx, mpy, 15, 0, Math.PI * 2);
          ctx.fillStyle = uncGrad;
          ctx.fill();
        }

        // Diamond marker
        ctx.save();
        ctx.translate(mpx, mpy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = isActive ? "#ff8c00" : "rgba(255, 140, 0, 0.5)";
        if (isActive) {
          ctx.shadowColor = "#ff8c00";
          ctx.shadowBlur = 12;
        }
        const sz = isHovered ? 8 : 6;
        ctx.fillRect(-sz, -sz, sz * 2, sz * 2);
        ctx.shadowBlur = 0;
        ctx.restore();

        // Inner dot
        ctx.beginPath();
        ctx.arc(mpx, mpy, isActive ? 3 : 2, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? "#fff" : "rgba(255,255,255,0.5)";
        ctx.fill();

        // Label
        ctx.fillStyle = isActive ? "rgba(255, 165, 0, 0.9)" : "rgba(255, 165, 0, 0.5)";
        ctx.font = "bold 10px 'JetBrains Mono', monospace";
        ctx.fillText(isActive ? "PERSON" : "DETECTED", mpx + 12, mpy - 8);

        ctx.fillStyle = isActive ? "rgba(255, 165, 0, 0.6)" : "rgba(255, 165, 0, 0.35)";
        ctx.font = "9px 'JetBrains Mono', monospace";
        ctx.fillText(`~${marker.distance}m ${marker.direction}`, mpx + 12, mpy + 4);

        // Time info
        const timeStr = isActive ? "LIVE" : formatAge(age);
        ctx.fillText(`${marker.apCount} AP${marker.apCount > 1 ? 's' : ''} · ${timeStr}`, mpx + 12, mpy + 16);

        // Hover: show delete hint
        if (isHovered) {
          ctx.fillStyle = "rgba(239, 68, 68, 0.7)";
          ctx.font = "9px 'JetBrains Mono', monospace";
          ctx.fillText("CLICK TO DISMISS", mpx + 12, mpy + 28);
        }
      }

      selectedMarkerRef.current = hoveredMarkerId;

      // Hover tooltip
      if (hoveredBlipRef.current && !isDraggingRef.current && !draggingBlipRef.current) {
        const blip = hoveredBlipRef.current;
        const mx = mouseRef.current.x;
        const my = mouseRef.current.y;
        const isPlaced = !!apPositionsRef.current[blip.bssid];

        const lines = [
          blip.ssid || "(hidden)",
          `BSSID: ${blip.bssid}`,
          `Signal: ${blip.signal}%`,
          `Channel: ${blip.channel}`,
          `Band: ${blip.band}`,
          isPlaced ? "📌 Position set" : "⚙ Enter PLACE MODE to position",
          blip.active ? "⚠ PRESENCE DETECTED" : "",
          inPlacement ? "🖱 Drag to reposition" : "🖱 Click for details",
        ].filter(Boolean);

        const padding = 10;
        const lineHeight = 16;
        const boxW = 220;
        const boxH = lines.length * lineHeight + padding * 2;
        let tx = mx + 15;
        let ty = my - boxH / 2;
        if (tx + boxW > w) tx = mx - boxW - 15;
        if (ty < 0) ty = 5;
        if (ty + boxH > h) ty = h - boxH - 5;

        ctx.fillStyle = "rgba(10, 15, 10, 0.92)";
        ctx.strokeStyle = blip.active
          ? "rgba(239, 68, 68, 0.6)"
          : isPlaced
          ? "rgba(59, 130, 246, 0.4)"
          : "rgba(34, 197, 94, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tx, ty, boxW, boxH, 6);
        ctx.fill();
        ctx.stroke();

        ctx.font = "11px 'JetBrains Mono', monospace";
        for (let i = 0; i < lines.length; i++) {
          const isAlert = lines[i].startsWith("⚠");
          const isHint = lines[i].startsWith("⚙") || lines[i].startsWith("🖱") || lines[i].startsWith("📌");
          ctx.fillStyle = isAlert
            ? "#ef4444"
            : isHint
            ? "rgba(255,255,255,0.35)"
            : i === 0
            ? "#e0e0e0"
            : "rgba(34, 197, 94, 0.7)";
          if (i === 0) ctx.font = "bold 11px 'JetBrains Mono', monospace";
          else ctx.font = "11px 'JetBrains Mono', monospace";
          ctx.fillText(lines[i], tx + padding, ty + padding + 12 + i * lineHeight);
        }
      }

      // "YOU" label
      ctx.fillStyle = "rgba(34, 197, 94, 0.4)";
      ctx.font = "bold 10px 'JetBrains Mono', monospace";
      ctx.fillText("YOU", cx + 8, cy + 14);

      // Zoom indicator
      const zoomPct = Math.round(zoomRef.current * 100);
      ctx.fillStyle = "rgba(34, 197, 94, 0.3)";
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.fillText(`ZOOM ${zoomPct}%`, 10, h - 10);

      // Placement mode indicator
      if (inPlacement) {
        ctx.fillStyle = "rgba(59, 130, 246, 0.8)";
        ctx.font = "bold 11px 'JetBrains Mono', monospace";
        ctx.fillText("PLACE MODE — Drag APs to their real positions", 10, 20);

        const placedCount = Object.keys(apPositionsRef.current).length;
        ctx.fillStyle = "rgba(59, 130, 246, 0.5)";
        ctx.font = "10px 'JetBrains Mono', monospace";
        ctx.fillText(`${placedCount} AP${placedCount !== 1 ? 's' : ''} positioned`, 10, 35);
      }

      animFrameRef.current = requestAnimationFrame(draw);
    }

    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const placedCount = Object.keys(apPositionsRef.current).length;

  return (
    <div
      style={{
        background: "#080c08",
        borderRadius: "1rem",
        padding: "1.5rem",
        marginBottom: "1.5rem",
        border: `1px solid ${placementMode ? "rgba(59,130,246,0.3)" : "rgba(34,197,94,0.15)"}`,
        transition: "border-color 0.3s",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", color: "#e0e0e0" }}>Radar</h2>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <button
            onClick={() => setPlacementMode(!placementMode)}
            style={{
              background: placementMode ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${placementMode ? "rgba(59,130,246,0.5)" : "#333"}`,
              color: placementMode ? "#60a5fa" : "#888",
              borderRadius: 6,
              padding: "4px 12px",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.7rem",
              transition: "all 0.2s",
            }}
          >
            {placementMode ? "EXIT PLACE MODE" : "PLACE APs"}
          </button>
          {placedCount > 0 && !placementMode && (
            <span style={{ fontSize: "0.7rem", color: "#3b82f6", fontFamily: "monospace" }}>
              {placedCount} placed
            </span>
          )}
          <span style={{ fontSize: "0.65rem", color: "rgba(34,197,94,0.35)", fontFamily: "monospace" }}>
            SCROLL ZOOM · DRAG PAN · DBL-CLICK RESET
          </span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: 500,
          borderRadius: "0.5rem",
          cursor: placementMode ? "move" : "crosshair",
        }}
      />
      <div
        style={{
          display: "flex",
          gap: "1.5rem",
          marginTop: "0.75rem",
          fontSize: "0.75rem",
          color: "#666",
          fontFamily: "monospace",
          flexWrap: "wrap",
        }}
      >
        <span><span style={{ color: "#22c55e" }}>●</span> Network</span>
        <span><span style={{ color: "#3b82f6" }}>●</span> Placed AP</span>
        <span><span style={{ color: "#ef4444" }}>●</span> Presence</span>
        <span><span style={{ color: "#ff8c00" }}>◆</span> Est. person ({pinnedMarkers.length})</span>
        {pinnedMarkers.length > 0 && (
          <button
            onClick={() => setPinnedMarkers([])}
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#ef4444",
              borderRadius: 4,
              padding: "2px 8px",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.7rem",
            }}
          >
            CLEAR ALL
          </button>
        )}
        {placedCount === 0 && pinnedMarkers.length === 0 && (
          <span style={{ color: "#555" }}>
            Place APs on the radar to enable location estimation
          </span>
        )}
      </div>
    </div>
  );
}

function bearingToCompass(deg) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}
