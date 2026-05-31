// Deterministic mountain track shared by every racer.
// Same seed -> byte-identical obstacle course on every device, so each client
// can simulate only its own car and still race fairly on the same road.

export const LANES = 3;
export const FINISH_DIST = 7200;

export type ObstacleKind = "rock" | "heat" | "boorsok";
export type Obstacle = { id: number; dist: number; lane: number; kind: ObstacleKind };

/** mulberry32 — tiny, fast, deterministic PRNG. */
export function makePRNG(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build the full obstacle course for a seed. Obstacles are keyed on DISTANCE
 * (not frame count), so devices running at different FPS still see the same road.
 * We never block all lanes at the same distance, so the course is always clearable.
 */
export function buildTrack(seed: number): Obstacle[] {
  const rnd = makePRNG(seed);
  const obstacles: Obstacle[] = [];
  let dist = 520; // a little breathing room off the start line
  let id = 0;
  let lastLane = 1;

  while (dist < FINISH_DIST - 360) {
    const gap = 150 + rnd() * 230; // 150..380 units between rows
    dist += gap;

    const r = rnd();
    const kind: ObstacleKind = r < 0.2 ? "boorsok" : r < 0.6 ? "rock" : "heat";
    // bias away from repeating the exact same lane so it reads as a winding road
    let lane = Math.floor(rnd() * LANES);
    if (lane === lastLane && rnd() < 0.5) lane = (lane + 1) % LANES;
    lastLane = lane;
    obstacles.push({ id: id++, dist, lane, kind });

    // Occasionally add a second hazard in a different lane (never the 3rd -> always an out).
    if (kind !== "boorsok" && rnd() < 0.28) {
      const open = Math.floor(rnd() * LANES);
      const second = open === lane ? (open + 1) % LANES : open;
      const blocked = new Set([lane, second]);
      if (blocked.size < LANES) {
        obstacles.push({
          id: id++,
          dist: dist + 8,
          lane: second,
          kind: rnd() < 0.5 ? "rock" : "heat",
        });
      }
    }
  }
  return obstacles;
}
