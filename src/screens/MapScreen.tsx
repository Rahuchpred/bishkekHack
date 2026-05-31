import { useState } from "react";
import { LANDMARKS } from "../data/landmarks";
import { randomRoomCode } from "../lib/net";

// ---- Little 2D pixel cars cruising the Bishkek avenue (Kyrgyz traffic) ----

function CamrySprite({ flip }: { flip?: boolean }) {
  // White Toyota Camry — low sedan silhouette.
  return (
    <svg
      className={`car-svg${flip ? " flip" : ""}`}
      viewBox="0 0 120 50"
      width="112"
      height="47"
      shapeRendering="crispEdges"
      aria-label="Toyota Camry"
    >
      <ellipse cx="60" cy="46" rx="50" ry="4" fill="rgba(0,0,0,0.28)" />
      <polygon points="6,26 16,22 104,22 114,26" fill="#eef2f6" />
      <rect x="6" y="26" width="108" height="14" fill="#e3e9f0" />
      <rect x="6" y="36" width="108" height="4" fill="#c0c8d3" />
      <polygon points="30,22 42,11 80,11 92,22" fill="#dfe6ee" />
      <polygon points="44,21 49,14 76,14 84,21" fill="#3a5170" />
      <rect x="62" y="14" width="3" height="7" fill="#dfe6ee" />
      <rect x="60" y="26" width="2" height="10" fill="#c0c8d3" />
      <rect x="108" y="27" width="6" height="5" fill="#ffe27a" />
      <rect x="6" y="27" width="5" height="5" fill="#ff5c5c" />
      <circle cx="28" cy="40" r="9" fill="#15171c" />
      <circle cx="28" cy="40" r="4" fill="#7a828c" />
      <circle cx="92" cy="40" r="9" fill="#15171c" />
      <circle cx="92" cy="40" r="4" fill="#7a828c" />
    </svg>
  );
}

function LexusSprite({ flip }: { flip?: boolean }) {
  // Black Lexus LX 570 — tall boxy SUV.
  return (
    <svg
      className={`car-svg${flip ? " flip" : ""}`}
      viewBox="0 0 122 56"
      width="116"
      height="53"
      shapeRendering="crispEdges"
      aria-label="Lexus LX 570"
    >
      <ellipse cx="61" cy="52" rx="52" ry="4" fill="rgba(0,0,0,0.28)" />
      <rect x="22" y="8" width="78" height="18" fill="#2b2f38" />
      <rect x="24" y="6" width="74" height="3" fill="#3a3f49" />
      <rect x="27" y="11" width="68" height="11" fill="#37496a" />
      <rect x="48" y="11" width="3" height="11" fill="#2b2f38" />
      <rect x="71" y="11" width="3" height="11" fill="#2b2f38" />
      <rect x="6" y="24" width="110" height="20" fill="#23262e" />
      <rect x="6" y="38" width="110" height="6" fill="#15171c" />
      <rect x="6" y="33" width="110" height="2" fill="#9aa1ad" />
      <rect x="110" y="26" width="6" height="12" fill="#c8ccd3" />
      <rect x="107" y="26" width="5" height="4" fill="#fff0b0" />
      <rect x="6" y="26" width="5" height="6" fill="#ff5c5c" />
      <circle cx="30" cy="44" r="10" fill="#15171c" />
      <circle cx="30" cy="44" r="4.5" fill="#8a929c" />
      <circle cx="92" cy="44" r="10" fill="#15171c" />
      <circle cx="92" cy="44" r="4.5" fill="#8a929c" />
    </svg>
  );
}

function Car({ kind, flip }: { kind: "camry" | "lexus"; flip?: boolean }) {
  return (
    <div className="car-inner">
      <span className="car-tag">{kind === "camry" ? "Camry" : "LX 570"}</span>
      {kind === "camry" ? <CamrySprite flip={flip} /> : <LexusSprite flip={flip} />}
    </div>
  );
}

// Ambient traffic: a few looping cars at different lanes / speeds / sizes.
const TRAFFIC = [
  { kind: "camry", flip: false, bottom: "7%", dur: "10s", delay: "0s", scale: 1 },
  { kind: "lexus", flip: true, bottom: "12%", dur: "13s", delay: "-4s", scale: 0.82 },
  { kind: "lexus", flip: false, bottom: "3%", dur: "8s", delay: "-5s", scale: 1.18 },
  { kind: "camry", flip: true, bottom: "9.5%", dur: "15s", delay: "-9s", scale: 0.7 },
  { kind: "camry", flip: false, bottom: "5%", dur: "12s", delay: "-2s", scale: 0.92 },
] as const;

export function MapScreen({ onHost }: { onHost: (locKey: string, code: string) => void }) {
  const [toast, setToast] = useState<string | null>(null);

  function clickLandmark(key: string, live: boolean) {
    if (!live) {
      setToast("That portal opens soon. Try Park Yntymak or the mountains!");
      setTimeout(() => setToast(null), 2600);
      return;
    }
    onHost(key, randomRoomCode());
  }

  return (
    <div className="screen map-wrap">
      <div className="map-stage">
        <div className="title-banner">
          PIXEL BISHKEK
          <small>tap a place · invite friends · play</small>
        </div>
        <img
          className="overworld avenue"
          src="/art/avenue-pixel.png"
          alt="Pixel-art Bishkek avenue at sunset"
          onError={(e) => {
            // Fall back gracefully if the avenue PNG is missing.
            const img = e.currentTarget;
            if (img.src.endsWith("avenue-pixel.png")) img.src = "/art/overworld.png";
            else if (!img.src.endsWith("overworld.svg")) img.src = "/art/overworld.svg";
          }}
        />

        <div className="avenue-traffic" aria-hidden="true">
          {TRAFFIC.map((c, i) => (
            <div
              key={i}
              className={`lane-car${c.flip ? " rev" : ""}`}
              style={{
                bottom: c.bottom,
                animationDuration: c.dur,
                animationDelay: c.delay,
                transform: `scale(${c.scale})`,
              }}
            >
              <Car kind={c.kind} flip={c.flip} />
            </div>
          ))}
        </div>

        {LANDMARKS.map((l) => (
          <button
            key={l.key}
            className={`hotspot ${l.status === "soon" ? "soon" : ""}`}
            style={{ left: `${l.x}%`, top: `${l.y}%` }}
            onClick={() => clickLandmark(l.key, l.status === "live")}
            title={l.blurb}
          >
            <span className="pin">{l.emoji}</span>
            <span className="label">
              {l.name} <span className="badge">{l.status === "live" ? "▶ PLAY" : "SOON"}</span>
            </span>
          </button>
        ))}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
