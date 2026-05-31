import { useState } from "react";
import { LANDMARKS } from "../data/landmarks";
import { randomRoomCode } from "../lib/net";

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
          className="overworld"
          src="/art/overworld.png"
          alt="Pixel map of Bishkek"
          onError={(e) => {
            // Fall back to the bundled placeholder if the PNG is missing.
            const img = e.currentTarget;
            if (!img.src.endsWith("overworld.svg")) img.src = "/art/overworld.svg";
          }}
        />
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
