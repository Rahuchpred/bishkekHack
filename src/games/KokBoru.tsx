import { useEffect, useRef, useState } from "react";
import type { RoomConnection } from "../lib/net";
import type { Player } from "../lib/types";
import { HandTracker } from "../lib/handTracker";

// Play field is normalized 0..1; canvas scales it. 3:2 to match the field art.
const W = 720;
const H = 480;
const ROUND_MS = 45000;
// Goal = the central stone "kazan" pit in the field art. Spawn = the left circle.
const GOAL = { x: 0.5, y: 0.47, r: 0.075 };
const SPAWN = { x: 0.2, y: 0.5 };
const GRAB_R = 0.08;
const STEAL_R = 0.085; // how close another player must be to snatch the goat
const STEAL_COOLDOWN = 600; // ms the carrier is safe right after grabbing

type Phase = "idle" | "playing" | "over";

interface Ulak {
  x: number;
  y: number;
  heldBy: string | null;
  grabbedAt: number;
}
interface Hand {
  x: number;
  y: number;
  fist: boolean;
  last: number;
}
interface GameState {
  phase: Phase;
  ulak: Ulak;
  scores: Record<string, number>;
  endsAt: number | null;
  round: number;
}

export function KokBoru({
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const fieldImg = useRef<HTMLImageElement | null>(null);
  const handsRef = useRef<Record<string, Hand>>({});
  const stateRef = useRef<GameState>({
    phase: "idle",
    ulak: { ...SPAWN, heldBy: null, grabbedAt: 0 },
    scores: {},
    endsAt: null,
    round: 0,
  });
  const playersRef = useRef<Player[]>(players);
  const lastHandSent = useRef(0);
  const lastStateSent = useRef(0);
  const lastMyScore = useRef(0);

  const [mode, setMode] = useState<"loading" | "camera" | "mouse">("loading");
  const [phase, setPhase] = useState<Phase>("idle");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  // start camera/mouse tracker
  useEffect(() => {
    const tracker = new HandTracker();
    trackerRef.current = tracker;
    tracker.start().then((m) => setMode(m));
    return () => tracker.stop();
  }, []);

  // load the generated Kyrgyz field background
  useEffect(() => {
    const img = new Image();
    img.src = "/art/kokboru-field.png";
    img.onload = () => {
      fieldImg.current = img;
    };
  }, []);

  // network: receive hands from others + state from host
  useEffect(() => {
    const offHand = conn.onEvent(
      "kb:hand",
      (p: { id: string; x: number; y: number; fist: boolean }, from?: string) => {
        const id = p.id || from || "?";
        if (id === conn.me.id) return;
        handsRef.current[id] = { x: p.x, y: p.y, fist: p.fist, last: Date.now() };
      }
    );
    const offState = conn.onEvent("kb:state", (s: GameState) => {
      if (isHost) return; // host is the source of truth
      stateRef.current = s;
      setPhase(s.phase);
      setScores(s.scores);
    });
    return () => {
      offHand();
      offState();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // main loop: read local hand, broadcast it, (host) simulate, render
  useEffect(() => {
    const ctx = canvasRef.current!.getContext("2d")!;
    let raf = 0;

    const loop = () => {
      const now = Date.now();
      const tracker = trackerRef.current;

      // local hand
      if (tracker) {
        const me = {
          x: tracker.state.x,
          y: tracker.state.y,
          fist: tracker.state.fist,
          last: now,
        };
        handsRef.current[conn.me.id] = me;
        if (now - lastHandSent.current > 60) {
          lastHandSent.current = now;
          conn.send("kb:hand", { id: conn.me.id, x: me.x, y: me.y, fist: me.fist });
        }
      }

      // prune stale remote hands
      for (const id of Object.keys(handsRef.current)) {
        if (id !== conn.me.id && now - handsRef.current[id].last > 1500) {
          delete handsRef.current[id];
        }
      }

      if (isHost) {
        simulate(now);
        if (now - lastStateSent.current > 66) {
          lastStateSent.current = now;
          conn.send("kb:state", stateRef.current);
        }
      }

      // bank my own score into presence (keeps the shared leaderboard working)
      const myScore = stateRef.current.scores[conn.me.id] ?? 0;
      if (myScore !== lastMyScore.current) {
        lastMyScore.current = myScore;
        conn.updateMe({ score: myScore });
      }

      render(ctx, now);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- host simulation ----
  function simulate(now: number) {
    const s = stateRef.current;
    if (s.phase !== "playing") return;

    if (s.endsAt && now >= s.endsAt) {
      s.phase = "over";
      s.ulak.heldBy = null;
      pushHud(s);
      return;
    }

    const hands = handsRef.current;
    if (s.ulak.heldBy) {
      const h = hands[s.ulak.heldBy];
      if (!h || now - h.last > 1500) {
        s.ulak.heldBy = null; // holder vanished
      } else {
        s.ulak.x = h.x;
        s.ulak.y = h.y;
        if (!h.fist) {
          // released
          if (dist(s.ulak, GOAL) < GOAL.r) {
            const who = s.ulak.heldBy;
            s.scores[who] = (s.scores[who] ?? 0) + 1;
            s.ulak = { ...SPAWN, heldBy: null, grabbedAt: 0 };
          } else {
            s.ulak.heldBy = null; // dropped in the field
          }
          pushHud(s);
        } else if (now - s.ulak.grabbedAt > STEAL_COOLDOWN) {
          // STEAL: another player whose fist reaches the goat snatches it
          for (const [id, oh] of Object.entries(hands)) {
            if (id === s.ulak.heldBy) continue;
            if (now - oh.last > 1500) continue;
            if (oh.fist && dist(oh, s.ulak) < STEAL_R) {
              s.ulak.heldBy = id;
              s.ulak.grabbedAt = now;
              break;
            }
          }
        }
      }
    } else {
      // free ulak: first fist within reach grabs it
      for (const [id, h] of Object.entries(hands)) {
        if (now - h.last > 1500) continue;
        if (h.fist && dist(h, s.ulak) < GRAB_R) {
          s.ulak.heldBy = id;
          s.ulak.grabbedAt = now;
          break;
        }
      }
    }
  }

  function pushHud(s: GameState) {
    setPhase(s.phase);
    setScores({ ...s.scores });
  }

  function startRound() {
    const s = stateRef.current;
    s.phase = "playing";
    s.round += 1;
    s.scores = {};
    s.ulak = { ...SPAWN, heldBy: null, grabbedAt: 0 };
    s.endsAt = Date.now() + ROUND_MS;
    pushHud(s);
    conn.send("kb:state", s);
  }

  // timer tick for HUD
  useEffect(() => {
    const t = setInterval(() => {
      const e = stateRef.current.endsAt;
      setSecondsLeft(e ? Math.max(0, Math.ceil((e - Date.now()) / 1000)) : 0);
    }, 250);
    return () => clearInterval(t);
  }, []);

  // ---- render ----
  function render(ctx: CanvasRenderingContext2D, now: number) {
    const s = stateRef.current;
    ctx.imageSmoothingEnabled = false;
    // field background: generated Kyrgyz kök-börü field (green fallback while loading)
    if (fieldImg.current) {
      ctx.drawImage(fieldImg.current, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#2f8f3e";
      ctx.fillRect(0, 0, W, H);
    }

    // goal = the central kazan pit; pulsing gold ring marks the target
    const pulse = 0.5 + 0.5 * Math.sin(now / 250);
    ctx.beginPath();
    ctx.arc(GOAL.x * W, GOAL.y * H, GOAL.r * W, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 210, 63, ${0.15 + 0.18 * pulse})`;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffd23f";
    ctx.stroke();
    ctx.textAlign = "center";

    // ulak
    ctx.font = "40px serif";
    ctx.fillText("🐐", s.ulak.x * W, s.ulak.y * H + 14);

    // hands
    const pmap = new Map(playersRef.current.map((p) => [p.id, p]));
    for (const [id, h] of Object.entries(handsRef.current)) {
      if (now - h.last > 1500) continue;
      const p = pmap.get(id);
      const px = h.x * W;
      const py = h.y * H;
      ctx.font = "30px serif";
      ctx.fillText(h.fist ? "✊" : "✋", px, py + 10);
      if (p) {
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.fillStyle = id === conn.me.id ? "#ffd23f" : "#fff";
        ctx.fillText(`${p.avatar}${id === conn.me.id ? " YOU" : ""}`, px, py - 24);
      }
    }

    // timer
    if (s.phase === "playing") {
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.fillStyle = "#1a1330";
      ctx.textAlign = "left";
      ctx.fillText(`${secondsLeft}s`, 12, 26);
    }
  }

  const leaderboard = [...players]
    .map((p) => ({ p, n: scores[p.id] ?? 0 }))
    .sort((a, b) => b.n - a.n);

  return (
    <div className="screen map-wrap">
      <div className="panel kara">
        <div className="row spread">
          <h1>🐐 Kök-börü Grab-Off</h1>
          <button className="btn secondary" onClick={onLeave}>
            ← Map
          </button>
        </div>
        <p>
          {mode === "camera"
            ? "Make a FIST over the goat 🐐 to grab it, carry it to the glowing kazan (gold ring) and open your hand to score. Reach a carrier and grab to STEAL it!"
            : mode === "mouse"
            ? "No camera — move the mouse to aim, hold the button to grab the goat, release in the glowing kazan to score. Grab near a carrier to STEAL it!"
            : "Starting camera…"}
        </p>

        <canvas ref={canvasRef} className="game" width={W} height={H} />

        {phase !== "playing" &&
          (isHost ? (
            <button className="btn big" onClick={startRound} style={{ marginTop: 12 }}>
              {phase === "over" ? "Play again ▶" : "Start round ▶"}
            </button>
          ) : (
            <p style={{ color: "var(--accent)", marginTop: 12 }}>
              Waiting for the host to start…
            </p>
          ))}

        {phase === "over" && leaderboard[0] && (
          <div className="big-num" style={{ marginTop: 8 }}>
            {leaderboard[0].p.avatar} wins with {leaderboard[0].n}!
          </div>
        )}

        <h2>🏆 Goals</h2>
        <ul className="players">
          {leaderboard.map(({ p, n }) => (
            <li key={p.id}>
              <span className="em">{p.avatar}</span>
              <span className="nm">{p.name}</span>
              {p.id === conn.me.id && <span className="tag you">YOU</span>}
              <span className="sc">{n}</span>
            </li>
          ))}
        </ul>

        <p className="backend-note">
          {conn.backend === "supabase"
            ? "Live via Supabase realtime · your camera never leaves your device."
            : "Local mode · open the invite link in another tab to play together."}
        </p>
      </div>
    </div>
  );
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
