import { useEffect, useRef, useState } from "react";
import type { RoomConnection } from "../lib/net";
import type { Player } from "../lib/types";

const LANES = 3;
const W = 360;
const H = 520;

type Obstacle = { lane: number; y: number; kind: "rock" | "heat" | "boorsok" };

export function Drive({
  conn,
  players,
  onLeave,
}: {
  conn: RoomConnection;
  players: Player[];
  isHost: boolean;
  onLeave: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const laneRef = useRef(1);
  const stateRef = useRef({ obstacles: [] as Obstacle[], score: 0, speed: 3, t: 0, alive: true });

  function move(dir: -1 | 1) {
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

  function start() {
    laneRef.current = 1;
    stateRef.current = { obstacles: [], score: 0, speed: 3, t: 0, alive: true };
    setScore(0);
    setRunning(true);
    requestAnimationFrame(() => canvasRef.current?.focus());
  }

  useEffect(() => {
    if (!running) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    let raf = 0;
    const laneX = (l: number) => (W / LANES) * l + W / LANES / 2;

    function frame() {
      const s = stateRef.current;
      s.t += 1;
      s.speed += 0.002;
      if (s.t % Math.max(18, 46 - Math.floor(s.speed * 2)) === 0) {
        const kind = Math.random() < 0.18 ? "boorsok" : Math.random() < 0.5 ? "rock" : "heat";
        s.obstacles.push({ lane: Math.floor(Math.random() * LANES), y: -40, kind });
      }
      for (const o of s.obstacles) o.y += s.speed;

      const carY = H - 70;
      for (const o of s.obstacles) {
        if (Math.abs(o.y - carY) < 34 && o.lane === laneRef.current) {
          if (o.kind === "boorsok") {
            s.score += 50;
            o.y = H + 999;
          } else {
            s.alive = false;
          }
        }
      }
      s.obstacles = s.obstacles.filter((o) => o.y < H + 40);
      s.score += 1;

      // draw
      ctx.fillStyle = "#1a1145";
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#3a2a7a";
      ctx.lineWidth = 3;
      for (let i = 1; i < LANES; i++) {
        ctx.beginPath();
        ctx.setLineDash([16, 14]);
        ctx.moveTo((W / LANES) * i, ((s.t * s.speed) % 30) - 30);
        ctx.lineTo((W / LANES) * i, H);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.font = "26px serif";
      ctx.textAlign = "center";
      for (const o of s.obstacles) {
        ctx.fillText(o.kind === "rock" ? "🪨" : o.kind === "heat" ? "☀️" : "🥟", laneX(o.lane), o.y);
      }
      ctx.font = "30px serif";
      ctx.fillText("🚗", laneX(laneRef.current), carY + 8);
      ctx.fillStyle = "#ffd23f";
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.textAlign = "left";
      ctx.fillText(`SCORE ${s.score}`, 10, 24);

      setScore(s.score);
      if (s.alive) {
        raf = requestAnimationFrame(frame);
      } else {
        setRunning(false);
        const final = s.score;
        setBest((b) => {
          const nb = Math.max(b, final);
          if (nb > conn.me.score) conn.updateMe({ score: nb });
          return nb;
        });
      }
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const leaderboard = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="screen map-wrap">
      <div className="panel kara">
        <div className="row spread">
          <h1>🚗 Ala-Archa Mini-Drive</h1>
          <button className="btn secondary" onClick={onLeave}>
            ← Map
          </button>
        </div>
        <p>Dodge 🪨 and ☀️, grab 🥟 for +50. Arrow keys or the buttons. Best score hits the board.</p>
        <canvas
          ref={canvasRef}
          className="game"
          width={W}
          height={H}
          tabIndex={0}
          onPointerDown={() => canvasRef.current?.focus()}
        />
        {!running && (
          <div style={{ marginTop: 12 }}>
            {score > 0 && (
              <div className="big-num" style={{ fontSize: 28 }}>
                Crashed! {score} pts
              </div>
            )}
            <button className="btn big" onClick={start}>
              {score > 0 ? "Drive again ▶" : "Start driving ▶"}
            </button>
          </div>
        )}
        {running && (
          <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
            <button className="btn" onClick={() => move(-1)}>
              ◀
            </button>
            <button className="btn" onClick={() => move(1)}>
              ▶
            </button>
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
