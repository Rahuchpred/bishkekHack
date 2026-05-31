import { useEffect, useMemo, useRef, useState } from "react";
import type { RoomConnection } from "../lib/net";
import type { KaraokeState, Player } from "../lib/types";

const SONGS = [
  "Кайрат Нуртас — Айкатима",
  "ABBA — Dancing Queen",
  "Любэ — Конь",
  "a song about your marshrutka",
  "Queen — Bohemian Rhapsody",
  "anything by Ziruza",
  "the Kyrgyz national anthem (bold)",
  "Imagine Dragons — Believer",
];

const ROUND_MS = 30000;

export function Karaoke({
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
  const [st, setSt] = useState<KaraokeState>({
    phase: "idle",
    singerId: null,
    song: null,
    endsAt: null,
    round: 0,
  });
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [myRating, setMyRating] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const resultsSent = useRef(false);
  const scoredRound = useRef(-1);

  // wire events
  useEffect(() => {
    const offState = conn.onEvent("karaoke:state", (payload: KaraokeState) => {
      setSt(payload);
      if (payload.phase === "singing") {
        setRatings({});
        setMyRating(null);
        resultsSent.current = false;
      }
    });
    const offRate = conn.onEvent("karaoke:rate", (p: { raterId: string; score: number }) => {
      setRatings((r) => ({ ...r, [p.raterId]: p.score }));
    });
    return () => {
      offState();
      offRate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const singer = players.find((p) => p.id === st.singerId) || null;
  const iAmSinger = st.singerId === conn.me.id;
  const secondsLeft = st.endsAt ? Math.max(0, Math.ceil((st.endsAt - now) / 1000)) : 0;

  const ratingVals = Object.values(ratings);
  const avg = ratingVals.length ? ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length : 0;

  // host drives the end-of-round transition
  useEffect(() => {
    if (!isHost) return;
    if (st.phase === "singing" && st.endsAt && now >= st.endsAt && !resultsSent.current) {
      resultsSent.current = true;
      conn.send("karaoke:state", { ...st, phase: "results", endsAt: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, st, isHost]);

  // singer banks their own score once results land
  useEffect(() => {
    if (st.phase === "results" && iAmSinger && scoredRound.current !== st.round) {
      scoredRound.current = st.round;
      const delta = Math.round(avg * 20); // up to 100 pts
      conn.updateMe({ score: conn.me.score + delta });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.phase, st.round, iAmSinger]);

  function startRound(roundIndex: number) {
    if (players.length === 0) return;
    const singerId = players[roundIndex % players.length].id;
    const song = SONGS[Math.floor(Math.random() * SONGS.length)];
    conn.send("karaoke:state", {
      phase: "singing",
      singerId,
      song,
      endsAt: Date.now() + ROUND_MS,
      round: roundIndex,
    });
  }

  function rate(score: number) {
    if (iAmSinger || myRating !== null) return;
    setMyRating(score);
    conn.send("karaoke:rate", { raterId: conn.me.id, score });
  }

  const leaderboard = useMemo(
    () => [...players].sort((a, b) => b.score - a.score),
    [players]
  );

  return (
    <div className="screen map-wrap">
      <div className="panel kara">
        <div className="row spread">
          <h1>🎤 Karaoke Battle</h1>
          <button className="btn secondary" onClick={onLeave}>
            ← Map
          </button>
        </div>

        {st.phase === "idle" && (
          <>
            <p>Sing out loud. Everyone else rates you 1–5. Highest average wins the crown.</p>
            {isHost ? (
              <button className="btn big" onClick={() => startRound(0)}>
                Start round 1 ▶
              </button>
            ) : (
              <p style={{ color: "var(--accent)" }}>Waiting for the host to start round 1…</p>
            )}
          </>
        )}

        {st.phase === "singing" && (
          <>
            <p>
              Now singing: <b style={{ color: "var(--accent-2)" }}>{singer?.avatar} {singer?.name}</b>
            </p>
            <div className="song">“{st.song}”</div>
            <div className="timer">{secondsLeft}s</div>
            {iAmSinger ? (
              <p style={{ color: "var(--accent)" }}>YOU'RE UP. Belt it out! 🎶</p>
            ) : (
              <>
                <p>Rate the performance:</p>
                <div className="rate-row">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      className={myRating === n ? "sel" : ""}
                      disabled={myRating !== null}
                      onClick={() => rate(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {myRating !== null && <p>Locked in: {myRating} ⭐</p>}
              </>
            )}
            <p style={{ opacity: 0.7 }}>{ratingVals.length} rating(s) in</p>
          </>
        )}

        {st.phase === "results" && (
          <>
            <p>
              {singer?.avatar} {singer?.name} sang “{st.song}”
            </p>
            <div className="big-num">{avg.toFixed(1)} ⭐</div>
            <p>avg from {ratingVals.length} rater(s) · +{Math.round(avg * 20)} pts</p>
            {isHost && (
              <button className="btn big" onClick={() => startRound(st.round + 1)}>
                Next singer ▶
              </button>
            )}
          </>
        )}

        <h2>🏆 Leaderboard</h2>
        <ul className="players">
          {leaderboard.map((p) => (
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
