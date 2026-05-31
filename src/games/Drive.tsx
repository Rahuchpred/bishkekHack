import { useEffect, useRef, useState } from "react";
import type { RoomConnection } from "../lib/net";
import type { Player } from "../lib/types";
import { buildTrack, FINISH_DIST, LANES, type Obstacle } from "./driveTrack";

const W = 360;
const H = 520;
const CAR_Y = H - 90;
const COUNTDOWN_MS = 3200;
const GRACE_MS = 7000;

// driving feel (units are ~pixels of track)
const BASE_SPEED = 210;
const ACCEL = 8;
const MAX_SPEED = 440;
const SPIN_SPEED = 70;
const SPIN_MS = 1100;
const BOOST = 130;
const HIT_DIST = 28;

type Phase = "idle" | "countdown" | "racing" | "finished" | "podium";
type ResultRow = { id: string; name: string; avatar: string; ms: number | null };
type Ghost = { dist: number; lane: number; state: string; vel: number; lastT: number };

const MEDAL = ["🥇", "🥈", "🥉"];

export function Drive({
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
  const [phase, setPhase] = useState<Phase>("idle");
  const [podium, setPodium] = useState<ResultRow[]>([]);
  const [best, setBest] = useState(0);

  const phaseRef = useRef<Phase>("idle");
  const laneRef = useRef(1);
  const playersRef = useRef<Player[]>(players);
  const ghostsRef = useRef<Map<string, Ghost>>(new Map());
  const resultsRef = useRef<Map<string, number>>(new Map());
  const rosterRef = useRef<string[]>([]);
  const graceRef = useRef<number | undefined>(undefined);
  const goAtRef = useRef(0);
  const raceStartRef = useRef(0);
  const shakeRef = useRef(0);
  const lastPosRef = useRef(0);
  const simRef = useRef({
    track: [] as Obstacle[],
    consumed: new Set<number>(),
    myDist: 0,
    speed: BASE_SPEED,
    spinUntil: 0,
    finished: false,
  });

  useEffect(() => {
    playersRef.current = players;
  }, [players]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  function laneX(roadX: number, roadW: number, l: number) {
    return roadX + (roadW / LANES) * l + roadW / (LANES * 2);
  }

  function move(dir: -1 | 1) {
    if (phaseRef.current !== "racing") return;
    if (performance.now() < simRef.current.spinUntil) return;
    laneRef.current = Math.max(0, Math.min(LANES - 1, laneRef.current + dir));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" || e.key === "a") move(-1);
      if (e.key === "ArrowRight" || e.key === "d") move(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function beginCountdown(seed: number) {
    simRef.current = {
      track: buildTrack(seed),
      consumed: new Set<number>(),
      myDist: 0,
      speed: BASE_SPEED,
      spinUntil: 0,
      finished: false,
    };
    laneRef.current = 1;
    ghostsRef.current.clear();
    resultsRef.current.clear();
    rosterRef.current = playersRef.current.map((p) => p.id);
    if (graceRef.current) {
      clearTimeout(graceRef.current);
      graceRef.current = undefined;
    }
    goAtRef.current = performance.now() + COUNTDOWN_MS;
    raceStartRef.current = 0;
    setPodium([]);
    setPhase("countdown");
    requestAnimationFrame(() => canvasRef.current?.focus());
  }

  function hostStart() {
    const seed = Math.floor(Math.random() * 1e9);
    conn.send("drive:start", { seed }); // self:true delivers back to us too
  }

  function finalizeResults() {
    if (!isHost) return;
    const ps = playersRef.current;
    const finished = [...resultsRef.current.entries()].sort((a, b) => a[1] - b[1]);
    const finishedIds = new Set(finished.map((e) => e[0]));
    const order: ResultRow[] = finished.map(([id, ms]) => {
      const pl = ps.find((p) => p.id === id);
      return { id, name: pl?.name ?? "?", avatar: pl?.avatar ?? "🚗", ms };
    });
    for (const pl of ps) {
      if (!finishedIds.has(pl.id)) order.push({ id: pl.id, name: pl.name, avatar: pl.avatar, ms: null });
    }
    conn.send("drive:result", { order });
  }

  function maybeFinalize() {
    if (!isHost) return;
    if (resultsRef.current.size >= rosterRef.current.length) {
      if (graceRef.current) {
        clearTimeout(graceRef.current);
        graceRef.current = undefined;
      }
      finalizeResults();
      return;
    }
    if (graceRef.current === undefined) {
      graceRef.current = window.setTimeout(() => {
        graceRef.current = undefined;
        finalizeResults();
      }, GRACE_MS);
    }
  }

  // Network wiring (registered once).
  useEffect(() => {
    const offStart = conn.onEvent("drive:start", (p: { seed?: number }) => {
      if (typeof p?.seed === "number") beginCountdown(p.seed);
    });
    const offPos = conn.onEvent(
      "drive:pos",
      (p: { dist?: number; lane?: number; state?: string }, from?: string) => {
        if (!from || from === conn.me.id || typeof p?.dist !== "number") return;
        const now = performance.now();
        const g = ghostsRef.current.get(from) ?? {
          dist: p.dist,
          lane: p.lane ?? 1,
          state: "race",
          vel: 0,
          lastT: now,
        };
        const dt = (now - g.lastT) / 1000;
        if (dt > 0) g.vel = (p.dist - g.dist) / Math.max(dt, 0.05);
        g.dist = p.dist;
        g.lane = p.lane ?? g.lane;
        g.state = p.state ?? "race";
        g.lastT = now;
        ghostsRef.current.set(from, g);
      }
    );
    const offFin = conn.onEvent("drive:finish", (p: { ms?: number }, from?: string) => {
      if (!from || typeof p?.ms !== "number") return;
      if (!resultsRef.current.has(from)) resultsRef.current.set(from, p.ms);
      maybeFinalize();
    });
    const offRes = conn.onEvent("drive:result", (p: { order?: ResultRow[] }) => {
      if (Array.isArray(p?.order)) {
        setPodium(p.order);
        setPhase("podium");
      }
    });
    return () => {
      offStart();
      offPos();
      offFin();
      offRes();
      if (graceRef.current) clearTimeout(graceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finishLocal(now: number) {
    const s = simRef.current;
    s.finished = true;
    s.myDist = FINISH_DIST;
    const ms = Math.max(0, now - raceStartRef.current);
    setPhase("finished");
    conn.send("drive:finish", { ms });
    if (!resultsRef.current.has(conn.me.id)) resultsRef.current.set(conn.me.id, ms);
    maybeFinalize();
    const sc = Math.max(0, Math.round(100000 - ms / 10));
    setBest((b) => {
      const nb = Math.max(b, sc);
      if (nb > conn.me.score) conn.updateMe({ score: nb });
      return nb;
    });
  }

  // Main loop: runs through countdown -> racing -> finished (so ghosts + countdown animate).
  useEffect(() => {
    if (phase !== "countdown" && phase !== "racing" && phase !== "finished") return;
    const ctx = canvasRef.current!.getContext("2d")!;
    let raf = 0;
    let prev = performance.now();

    function frame() {
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const s = simRef.current;

      if (phaseRef.current === "countdown" && now >= goAtRef.current) {
        raceStartRef.current = now;
        setPhase("racing");
      }

      if (phaseRef.current === "racing" && !s.finished) {
        const spun = now < s.spinUntil;
        if (!spun) s.speed = Math.min(MAX_SPEED, s.speed + ACCEL * dt);
        const eff = spun ? SPIN_SPEED : s.speed;
        s.myDist += eff * dt;

        for (const o of s.track) {
          if (s.consumed.has(o.id)) continue;
          if (o.lane === laneRef.current && Math.abs(o.dist - s.myDist) < HIT_DIST) {
            s.consumed.add(o.id);
            if (o.kind === "boorsok") {
              s.speed = Math.min(MAX_SPEED, s.speed + BOOST);
            } else {
              s.spinUntil = now + SPIN_MS;
              s.speed = Math.max(SPIN_SPEED, s.speed * 0.4);
              shakeRef.current = now + 300;
            }
          }
        }
        if (s.myDist >= FINISH_DIST) finishLocal(now);
      }

      // broadcast my position ~10Hz
      if (now - lastPosRef.current > 100) {
        lastPosRef.current = now;
        const state = s.finished ? "done" : now < s.spinUntil ? "spin" : "race";
        conn.send("drive:pos", { dist: s.myDist, lane: laneRef.current, state });
      }

      draw(ctx, now);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function predict(g: Ghost, now: number) {
    const d = g.dist + g.vel * ((now - g.lastT) / 1000);
    return Math.max(0, Math.min(FINISH_DIST, d));
  }

  function computeRank(now: number) {
    const my = simRef.current.myDist;
    let rank = 1;
    for (const g of ghostsRef.current.values()) {
      if (predict(g, now) > my) rank++;
    }
    return rank;
  }

  function draw(ctx: CanvasRenderingContext2D, now: number) {
    const s = simRef.current;
    let sx = 0;
    let sy = 0;
    if (now < shakeRef.current) {
      sx = (Math.random() - 0.5) * 7;
      sy = (Math.random() - 0.5) * 7;
    }
    ctx.save();
    ctx.translate(sx, sy);

    // dawn sky over Ala-Archa
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#241a5e");
    sky.addColorStop(0.55, "#7a3f93");
    sky.addColorStop(1, "#f3a35a");
    ctx.fillStyle = sky;
    ctx.fillRect(-10, -10, W + 20, H + 20);
    drawMountains(ctx, s.myDist);

    // road
    const roadW = W * 0.78;
    const roadX = (W - roadW) / 2;
    ctx.fillStyle = "#241a38";
    ctx.fillRect(roadX, 0, roadW, H);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(roadX, 0, 6, H);
    ctx.fillRect(roadX + roadW - 6, 0, 6, H);

    // scrolling lane dashes
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 16]);
    const off = (s.myDist % 34) - 34;
    for (let i = 1; i < LANES; i++) {
      const x = roadX + (roadW / LANES) * i;
      ctx.beginPath();
      ctx.moveTo(x, off);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // finish line
    const fy = CAR_Y - (FINISH_DIST - s.myDist);
    if (fy > -24 && fy < H) {
      const c = 12;
      for (let i = 0; i * c < roadW; i++) {
        ctx.fillStyle = i % 2 ? "#fff" : "#111";
        ctx.fillRect(roadX + i * c, fy, c, c);
        ctx.fillStyle = i % 2 ? "#111" : "#fff";
        ctx.fillRect(roadX + i * c, fy + c, c, c);
      }
    }

    // obstacles
    ctx.textAlign = "center";
    ctx.font = "26px serif";
    for (const o of s.track) {
      if (s.consumed.has(o.id)) continue;
      const y = CAR_Y - (o.dist - s.myDist);
      if (y < -40 || y > H + 40) continue;
      ctx.fillText(o.kind === "rock" ? "🪨" : o.kind === "heat" ? "☀️" : "🥟", laneX(roadX, roadW, o.lane), y);
    }

    // ghost cars (other players)
    for (const [id, g] of ghostsRef.current) {
      const y = CAR_Y - (predict(g, now) - s.myDist);
      if (y < -30 || y > H + 30) continue;
      const pl = playersRef.current.find((p) => p.id === id);
      const x = laneX(roadX, roadW, g.lane);
      ctx.globalAlpha = g.state === "done" ? 0.5 : 0.85;
      ctx.font = "24px serif";
      ctx.fillText(pl?.avatar ?? "🚙", x, y);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.font = '7px "Press Start 2P", monospace';
      ctx.fillText((pl?.name ?? "").slice(0, 8), x, y - 18);
    }

    // my car
    const cx = laneX(roadX, roadW, laneRef.current);
    ctx.save();
    ctx.translate(cx, CAR_Y);
    if (now < s.spinUntil) {
      const p = 1 - (s.spinUntil - now) / SPIN_MS;
      ctx.rotate(p * Math.PI * 4);
    }
    ctx.font = "32px serif";
    ctx.textAlign = "center";
    ctx.fillText("🚗", 0, 11);
    ctx.restore();

    // speed lines
    if (s.speed > 320 && phaseRef.current === "racing") {
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const x = roadX + Math.random() * roadW;
        const yy = Math.random() * H;
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.lineTo(x, yy + 22 + Math.random() * 26);
        ctx.stroke();
      }
    }

    // HUD
    ctx.fillStyle = "#ffd23f";
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = "left";
    ctx.fillText(`P${computeRank(now)}/${Math.max(1, playersRef.current.length)}`, 8, 18);
    const el = raceStartRef.current ? Math.max(0, now - raceStartRef.current) : 0;
    ctx.textAlign = "right";
    ctx.fillText(`${(el / 1000).toFixed(1)}s`, W - 8, 18);

    // countdown overlay
    if (phaseRef.current === "countdown") {
      const n = Math.ceil((goAtRef.current - now) / 1000);
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffd23f";
      ctx.textAlign = "center";
      ctx.font = '60px "Press Start 2P", monospace';
      ctx.fillText(n > 0 ? String(n) : "GO!", W / 2, H / 2 + 10);
    }

    // finished banner (waiting for others)
    if (phaseRef.current === "finished") {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, H / 2 - 36, W, 72);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillText("FINISHED!", W / 2, H / 2 - 6);
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText("waiting for racers…", W / 2, H / 2 + 16);
    }

    ctx.restore();
  }

  function drawMountains(ctx: CanvasRenderingContext2D, dist: number) {
    const baseY = H * 0.46;
    const layers = [
      { color: "#3a2566", h: 70, k: 0.04, step: 90 },
      { color: "#4c2f7d", h: 50, k: 0.07, step: 64 },
    ];
    for (const L of layers) {
      const shift = (dist * L.k) % L.step;
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(-10, baseY + 40);
      for (let x = -L.step; x < W + L.step; x += L.step) {
        const px = x - shift;
        ctx.lineTo(px, baseY + 40);
        ctx.lineTo(px + L.step / 2, baseY - L.h);
        ctx.lineTo(px + L.step, baseY + 40);
      }
      ctx.lineTo(W + 10, baseY + 40);
      ctx.closePath();
      ctx.fill();
    }
    // snow caps on the front ridge
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const L = layers[1];
    const shift = (dist * L.k) % L.step;
    for (let x = -L.step; x < W + L.step; x += L.step) {
      const px = x - shift + L.step / 2;
      ctx.beginPath();
      ctx.moveTo(px, baseY - L.h);
      ctx.lineTo(px - 9, baseY - L.h + 14);
      ctx.lineTo(px + 9, baseY - L.h + 14);
      ctx.closePath();
      ctx.fill();
    }
  }

  const leaderboard = [...players].sort((a, b) => b.score - a.score);
  const canStart = isHost || players.length <= 1;
  const showControls = phase === "countdown" || phase === "racing";

  return (
    <div className="screen map-wrap">
      <div className="panel kara">
        <div className="row spread">
          <h1>🏔️ Ala-Archa Live Race</h1>
          <button className="btn secondary" onClick={onLeave}>
            ← Map
          </button>
        </div>
        <p>
          Same mountain road, everyone at once. Dodge 🪨/☀️ (hit = spin-out!), grab 🥟 to boost. First to the
          checkered line wins.
        </p>
        <canvas
          ref={canvasRef}
          className="game"
          width={W}
          height={H}
          tabIndex={0}
          onPointerDown={() => canvasRef.current?.focus()}
        />

        {phase === "idle" && (
          <div style={{ marginTop: 12 }}>
            {best > 0 && <div className="big-num" style={{ fontSize: 22 }}>Best {best}</div>}
            {canStart ? (
              <button className="btn big" onClick={hostStart}>
                {players.length > 1 ? "Start race ▶" : "Start solo run ▶"}
              </button>
            ) : (
              <p>Waiting for the host to start the race…</p>
            )}
          </div>
        )}

        {showControls && (
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            <button className="btn" onClick={() => move(-1)}>
              ◀
            </button>
            <button className="btn" onClick={() => move(1)}>
              ▶
            </button>
          </div>
        )}

        {phase === "podium" && (
          <div style={{ marginTop: 12 }}>
            <h2>🏁 Results</h2>
            <ul className="players">
              {podium.map((r, i) => (
                <li key={r.id}>
                  <span className="em">{MEDAL[i] ?? "•"}</span>
                  <span className="em">{r.avatar}</span>
                  <span className="nm">{r.name}</span>
                  {r.id === conn.me.id && <span className="tag you">YOU</span>}
                  <span className="sc">{r.ms == null ? "DNF" : `${(r.ms / 1000).toFixed(2)}s`}</span>
                </li>
              ))}
            </ul>
            {canStart ? (
              <button className="btn big" onClick={hostStart}>
                Race again ▶
              </button>
            ) : (
              <p>Waiting for the host to start the next race…</p>
            )}
          </div>
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
