import { useEffect, useRef, useState } from "react";
import { joinRoom, makePlayerId, type RoomConnection } from "../lib/net";
import type { Player } from "../lib/types";
import { landmarkByKey } from "../data/landmarks";
import { Lobby } from "./Lobby";
import { Karaoke } from "../games/Karaoke";
import { Drive } from "../games/Drive";
import { Cosmopark } from "../games/Cosmopark";

export function RoomScreen({
  code,
  locKey,
  host,
  identity,
  onLeave,
}: {
  code: string;
  locKey: string;
  host: boolean;
  identity: { name: string; avatar: string };
  onLeave: () => void;
}) {
  const landmark = landmarkByKey(locKey)!;
  const connRef = useRef<RoomConnection | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const me: Player = {
      id: makePlayerId(),
      name: identity.name,
      avatar: identity.avatar,
      score: 0,
      isHost: host,
    };
    const conn = joinRoom(code, me);
    connRef.current = conn;
    const offP = conn.onPlayers(setPlayers);
    const offStart = conn.onEvent("game:start", () => setStarted(true));
    setReady(true);
    return () => {
      offP();
      offStart();
      conn.leave();
      connRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready || !connRef.current) {
    return (
      <div className="screen map-wrap">
        <div className="panel">
          <h1>Connecting…</h1>
        </div>
      </div>
    );
  }

  const conn = connRef.current;

  if (!started) {
    return (
      <Lobby
        conn={conn}
        players={players}
        landmark={landmark}
        isHost={host}
        onStart={() => conn.send("game:start", { game: landmark.game })}
        onLeave={onLeave}
      />
    );
  }

  const common = { conn, players, isHost: host, onLeave };
  if (landmark.game === "karaoke") return <Karaoke {...common} />;
  if (landmark.game === "drive") return <Drive {...common} />;
  return <Cosmopark {...common} />;
}
