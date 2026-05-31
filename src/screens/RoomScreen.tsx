import { useEffect, useRef, useState } from "react";
import {
  clearStablePlayerId,
  joinRoom,
  normalizeRoomCode,
  stablePlayerId,
  type RoomConnection,
} from "../lib/net";
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
  const peerCount = Math.max(0, players.length - 1);

  const roomCode = normalizeRoomCode(code);

  function leaveRoom() {
    clearStablePlayerId(roomCode);
    onLeave();
  }

  useEffect(() => {
    const me: Player = {
      id: stablePlayerId(roomCode),
      name: identity.name,
      avatar: identity.avatar,
      score: 0,
      isHost: host,
    };
    const conn = joinRoom(roomCode, me);
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
  }, [roomCode, identity.name, identity.avatar, host]);

  // If the host already started, re-broadcast so late joiners leave the lobby.
  useEffect(() => {
    if (!started || !host || !connRef.current || peerCount === 0) return;
    connRef.current.send("game:start", { game: landmark.game });
  }, [started, host, peerCount, landmark.game]);

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
        onLeave={leaveRoom}
      />
    );
  }

  const common = { conn, players, isHost: host, onLeave: leaveRoom };
  if (landmark.game === "karaoke") return <Karaoke {...common} />;
  if (landmark.game === "drive") return <Drive {...common} />;
  return <Cosmopark {...common} />;
}
