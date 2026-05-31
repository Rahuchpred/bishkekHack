import { useState } from "react";
import type { RoomConnection } from "../lib/net";
import type { Landmark, Player } from "../lib/types";

export function Lobby({
  conn,
  players,
  landmark,
  isHost,
  onStart,
  onLeave,
}: {
  conn: RoomConnection;
  players: Player[];
  landmark: Landmark;
  isHost: boolean;
  onStart: () => void;
  onLeave: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${location.origin}${location.pathname}?room=${conn.code}&loc=${landmark.key}`;

  function copy() {
    navigator.clipboard?.writeText(shareUrl).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => {}
    );
  }

  return (
    <div className="screen map-wrap">
      <div className="panel">
        <div className="row spread">
          <h1>
            {landmark.emoji} {landmark.name}
          </h1>
          <button className="btn secondary" onClick={onLeave}>
            ← Map
          </button>
        </div>
        <p>{landmark.blurb}</p>

        <h2>Room code</h2>
        <div className="row spread">
          <span className="code-chip">{conn.code}</span>
          <button className="btn" onClick={copy}>
            {copied ? "Copied!" : "Copy invite link"}
          </button>
        </div>

        <h2>Players ({players.length})</h2>
        <ul className="players">
          {players.map((p) => (
            <li key={p.id}>
              <span className="em">{p.avatar}</span>
              <span className="nm">{p.name}</span>
              {p.isHost && <span className="tag">HOST</span>}
              {p.id === conn.me.id && <span className="tag you">YOU</span>}
            </li>
          ))}
        </ul>

        {isHost ? (
          <button className="btn big" onClick={onStart} disabled={players.length < 1}>
            Start game ▶
          </button>
        ) : (
          <p style={{ textAlign: "center", color: "var(--accent)" }}>
            Waiting for the host to start…
          </p>
        )}

        <p className="backend-note">
          {conn.backend === "supabase"
            ? "Live multiplayer via Supabase realtime."
            : "Local mode (no Supabase configured): open this URL in another tab/window to play together on this machine."}
        </p>
      </div>
    </div>
  );
}
