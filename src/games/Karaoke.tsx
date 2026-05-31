import { useEffect, useMemo, useRef, useState } from "react";
import { pickKaraokeSong } from "../data/karaokeSongs";
import { useKaraokeAudio } from "../lib/karaokeAudio";
import type { RoomConnection } from "../lib/net";
import type { KaraokeState, Player } from "../lib/types";

const ROUND_MS = 10000;

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
  const ratingPhaseSent = useRef(false);
  const resultsPhaseSent = useRef(false);
  const scoredRound = useRef(-1);

  useEffect(() => {
    const offState = conn.onEvent("karaoke:state", (payload: KaraokeState) => {
      setSt(payload);
      if (payload.phase === "singing") {
        setRatings({});
        setMyRating(null);
        ratingPhaseSent.current = false;
        resultsPhaseSent.current = false;
      }
      if (payload.phase === "rating") {
        setRatings({});
        setMyRating(null);
        resultsPhaseSent.current = false;
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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const singer = players.find((p) => p.id === st.singerId) || null;
  const iAmSinger = st.singerId === conn.me.id;
  const secondsLeft = st.endsAt ? Math.max(0, Math.ceil((st.endsAt - now) / 1000)) : 0;

  const expectedRaters = useMemo(
    () => players.filter((p) => p.id !== st.singerId),
    [players, st.singerId]
  );
  const ratingsDone = expectedRaters.length === 0 || expectedRaters.every((p) => ratings[p.id] != null);
  const ratingCount = expectedRaters.filter((p) => ratings[p.id] != null).length;

  const ratingVals = Object.values(ratings);
  const avg = ratingVals.length ? ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length : 0;

  // Host: singing timer ended → open rating phase
  useEffect(() => {
    if (!isHost) return;
    if (st.phase === "singing" && st.endsAt && now >= st.endsAt && !ratingPhaseSent.current) {
      ratingPhaseSent.current = true;
      conn.send("karaoke:state", { ...st, phase: "rating", endsAt: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, st, isHost]);

  // Host: everyone rated → show results
  useEffect(() => {
    if (!isHost || st.phase !== "rating" || !ratingsDone || resultsPhaseSent.current) return;
    resultsPhaseSent.current = true;
    conn.send("karaoke:state", { ...st, phase: "results", endsAt: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.phase, ratingsDone, ratings, isHost]);

  useEffect(() => {
    if (st.phase === "results" && iAmSinger && scoredRound.current !== st.round) {
      scoredRound.current = st.round;
      const delta = Math.round(avg * 20);
      conn.updateMe({ score: conn.me.score + delta });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.phase, st.round, iAmSinger, avg]);

  function startRound(roundIndex: number) {
    if (players.length === 0) return;
    const singerId = players[roundIndex % players.length].id;
    conn.send("karaoke:state", {
      phase: "singing",
      singerId,
      song: pickKaraokeSong(),
      endsAt: Date.now() + ROUND_MS,
      round: roundIndex,
    });
  }

  function rate(score: number) {
    if (st.phase !== "rating" || iAmSinger || myRating !== null) return;
    setMyRating(score);
    conn.send("karaoke:rate", { raterId: conn.me.id, score });
  }

  const leaderboard = useMemo(
    () => [...players].sort((a, b) => b.score - a.score),
    [players]
  );

  const peerIds = useMemo(() => players.map((p) => p.id), [players]);
  const audio = useKaraokeAudio(conn, {
    phase: st.phase,
    singerId: st.singerId,
    peerIds,
  });

  return (
    <div className="screen map-wrap">
      <audio
        ref={audio.setAudioRef}
        autoPlay
        playsInline
        style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
      />
      <div className="panel kara">
        <div className="row spread">
          <h1>🎤 Karaoke Battle</h1>
          <button className="btn secondary" onClick={onLeave}>
            ← Map
          </button>
        </div>

        {st.phase === "idle" && (
          <>
            <p>Sing your song, then everyone rates 1–5. We only move on once all votes are in.</p>
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
              <>
                <p style={{ color: "var(--accent)" }}>YOU'RE UP. Belt it out! 🎶</p>
                {!audio.hasRtc && (
                  <p>Live voice needs a browser with microphone support (Chrome, Firefox, Edge).</p>
                )}
                {audio.hasRtc && audio.micStatus === "requesting" && (
                  <p style={{ color: "var(--accent)" }}>Starting microphone…</p>
                )}
                {audio.hasRtc && audio.micStatus === "denied" && (
                  <button className="btn big" onClick={() => void audio.enableMicrophone()}>
                    Microphone blocked — tap to allow 🎤
                  </button>
                )}
                {audio.micStatus === "live" && (
                  <p style={{ color: "var(--accent)" }}>Mic live — others can hear you.</p>
                )}
                {audio.micError && <p>{audio.micError}</p>}
                <p style={{ opacity: 0.7 }}>Ratings open when your time is up.</p>
              </>
            ) : (
              <>
                <p style={{ color: "var(--accent)" }}>🔊 Listening to {singer?.name}</p>
                <p style={{ opacity: 0.7 }}>Audio connects automatically — rate after the timer.</p>
              </>
            )}
          </>
        )}

        {st.phase === "rating" && (
          <>
            <p>
              {singer?.avatar} {singer?.name} finished “{st.song}”
            </p>
            {iAmSinger ? (
              <p style={{ color: "var(--accent)" }}>
                Waiting for {expectedRaters.length} rating(s)… ({ratingCount}/{expectedRaters.length})
              </p>
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
                {myRating !== null ? (
                  <p>Locked in: {myRating} ⭐ — waiting for others…</p>
                ) : (
                  <p style={{ color: "var(--accent)" }}>Pick a score 1–5</p>
                )}
              </>
            )}
            <p style={{ opacity: 0.7 }}>
              {ratingCount}/{expectedRaters.length} vote(s) in
            </p>
          </>
        )}

        {st.phase === "results" && (
          <>
            <p>
              {singer?.avatar} {singer?.name} — “{st.song}”
            </p>
            <div className="big-num">{avg.toFixed(1)} ⭐</div>
            <p>
              avg from {ratingVals.length} rater(s) · +{Math.round(avg * 20)} pts
            </p>
            {isHost ? (
              <button className="btn big" onClick={() => startRound(st.round + 1)} disabled={!ratingsDone}>
                Next singer ▶
              </button>
            ) : (
              <p style={{ color: "var(--accent)" }}>Waiting for the host to pick the next singer…</p>
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
