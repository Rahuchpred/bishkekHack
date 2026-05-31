import { useEffect, useRef, useState } from "react";
import type { RoomConnection } from "../lib/net";
import type { Player } from "../lib/types";

const BRAWL_MS = 15000;

type Brawl = { phase: "idle" | "fight" | "over"; endsAt: number | null; round: number };

export function Cosmopark({
  conn,
  players,
  isHost,
  onLeave,
}: {
  conn: RoomConnection;
  players: Player[];
  isHost: boolean;
  onLeave: () => void;
}) {
  const [brawl, setBrawl] = useState<Brawl>({ phase: "idle", endsAt: null, round: 0 });
  const [taps, setTaps] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const myTaps = useRef(0);
  const overSent = useRef(false);
  const scored = useRef(-1);

  useEffect(() => {
    const offB = conn.onEvent("brawl:state", (p: Brawl) => {
      setBrawl(p);
      if (p.phase === "fight") {
        setTaps({});
        myTaps.current = 0;
        overSent.current = false;
      }
    });
    const offT = conn.onEvent("brawl:tap", (p: { id: string; total: number }) => {
      setTaps((t) => ({ ...t, [p.id]: p.total }));
    });
    return () => {
      offB();
      offT();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  const secondsLeft = brawl.endsAt ? Math.max(0, Math.ceil((brawl.endsAt - now) / 1000)) : 0;

  useEffect(() => {
    if (isHost && brawl.phase === "fight" && brawl.endsAt && now >= brawl.endsAt && !overSent.current) {
      overSent.current = true;
      conn.send("brawl:state", { ...brawl, phase: "over", endsAt: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, brawl, isHost]);

  // each player banks own taps into score on 'over'
  useEffect(() => {
    if (brawl.phase === "over" && scored.current !== brawl.round) {
      scored.current = brawl.round;
      const mine = taps[conn.me.id] ?? myTaps.current;
      if (mine > 0) conn.updateMe({ score: conn.me.score + mine });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brawl.phase, brawl.round]);

  function tap() {
    if (brawl.phase !== "fight") return;
    myTaps.current += 1;
    setTaps((t) => ({ ...t, [conn.me.id]: myTaps.current }));
    conn.send("brawl:tap", { id: conn.me.id, total: myTaps.current });
  }

  function start(round: number) {
    conn.send("brawl:state", { phase: "fight", endsAt: Date.now() + BRAWL_MS, round });
  }

  const ranking = [...players]
    .map((p) => ({ p, n: taps[p.id] ?? 0 }))
    .sort((a, b) => b.n - a.n);

  return (
    <div className="screen map-wrap">
      <div className="panel kara">
        <div className="row spread">
          <h1>🎮 Cosmopark Tap Brawl</h1>
          <button className="btn secondary" onClick={onLeave}>
            ← Map
          </button>
        </div>
        <p>15 seconds. Mash the button. Most taps wins. Taps convert to leaderboard points.</p>

        {brawl.phase === "idle" &&
          (isHost ? (
            <button className="btn big" onClick={() => start(0)}>
              Start brawl ▶
            </button>
          ) : (
            <p style={{ color: "var(--accent)" }}>Waiting for the host…</p>
          ))}

        {brawl.phase === "fight" && (
          <>
            <div className="timer">{secondsLeft}s</div>
            <button
              className="btn big"
              style={{ fontSize: 22, padding: "28px 0" }}
              onClick={tap}
            >
              {conn.me.avatar} TAP! ({taps[conn.me.id] ?? 0})
            </button>
          </>
        )}

        {brawl.phase === "over" && (
          <>
            <div className="big-num">{ranking[0]?.p.avatar} wins!</div>
            <p>{ranking[0]?.p.name} with {ranking[0]?.n} taps</p>
            {isHost && (
              <button className="btn big" onClick={() => start(brawl.round + 1)}>
                Rematch ▶
              </button>
            )}
          </>
        )}

        <h2>🏆 Leaderboard</h2>
        <ul className="players">
          {[...players]
            .sort((a, b) => b.score - a.score)
            .map((p) => (
              <li key={p.id}>
                <span className="em">{p.avatar}</span>
                <span className="nm">{p.name}</span>
                {p.id === conn.me.id && <span className="tag you">YOU</span>}
                <span className="sc">{p.score}</span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
