import { useState } from "react";
import type { RoomConnection } from "../lib/net";
import { supabaseConfigured } from "../lib/supabase";
import type { Landmark, Player } from "../lib/types";

/**
 * The base URL teammates should open. Per-deploy Vercel URLs change on every
 * deploy and can sit behind deployment protection, so hand out the stable
 * public domain instead. Override with VITE_PUBLIC_BASE_URL if you add a custom
 * domain. Falls back to the current origin (correct for localhost).
 */
function shareBaseUrl(): string {
  const override = (import.meta.env as Record<string, string | undefined>).VITE_PUBLIC_BASE_URL?.trim();
  if (override) return override.replace(/\/+$/, "");
  const { origin, hostname, pathname } = location;
  // Rewrite ephemeral "pixel-bishkek-<hash>-<team>.vercel.app" to the canonical alias.
  if (/^pixel-bishkek-[a-z0-9]+-.+\.vercel\.app$/i.test(hostname)) {
    return `https://pixel-bishkek.vercel.app${pathname}`;
  }
  return `${origin}${pathname}`;
}

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
  const shareUrl = `${shareBaseUrl()}?room=${conn.code}&loc=${landmark.key}`;

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
            ? "Live multiplayer via Supabase — works across browsers and devices."
            : supabaseConfigured
              ? "Supabase misconfigured: restart npm run dev after fixing .env.local (need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)."
              : "Local mode only: second player must use another tab on this same browser profile. For Chrome profile A + B, add VITE_SUPABASE_* to .env.local and restart."}
        </p>
      </div>
    </div>
  );
}
