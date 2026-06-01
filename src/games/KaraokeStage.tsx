// 2D scene of the Park Yntymak karaoke amphitheatre (the real spot the karaoke
// landmark maps to): tan parabolic arches crossing into a vault, a glowing round
// chandelier with hanging crystal strands, and stone steps — at night.
// Pure inline SVG so it needs no asset / API key and scales crisply.

const BEADS = Array.from({ length: 11 }, (_, i) => 116 + i * 8); // x positions
const STARS = [
  [22, 18], [54, 30], [90, 14], [250, 22], [284, 40], [300, 16],
  [12, 52], [40, 70], [296, 70], [270, 54], [150, 10], [200, 12],
] as const;

export function KaraokeStage({ active = false }: { active?: boolean }) {
  return (
    <svg
      className="kstage"
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ksSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#241a55" />
          <stop offset="0.55" stopColor="#140d33" />
          <stop offset="1" stopColor="#0a0720" />
        </linearGradient>
        <linearGradient id="ksArch" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9d6a3" />
          <stop offset="1" stopColor="#a9894f" />
        </linearGradient>
        <linearGradient id="ksArchSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c2a468" />
          <stop offset="1" stopColor="#7d6336" />
        </linearGradient>
        <linearGradient id="ksFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3360" />
          <stop offset="1" stopColor="#1b1740" />
        </linearGradient>
        <radialGradient id="ksGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffdf8a" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#ffbf57" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffbf57" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ksFloorGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd86b" stopOpacity="0.4" />
          <stop offset="1" stopColor="#ffd86b" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* sky + stars */}
      <rect x="0" y="0" width="320" height="180" fill="url(#ksSky)" />
      {STARS.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="1.6" height="1.6" fill="#fff6d8" opacity={0.5 + (i % 3) * 0.15} />
      ))}

      {/* plaza floor + steps */}
      <polygon points="36,150 284,150 320,180 0,180" fill="url(#ksFloor)" />
      <ellipse cx="160" cy="150" rx="74" ry="11" fill="url(#ksFloorGlow)" />
      {[0, 1, 2, 3].map((i) => {
        const y = 150 + i * 7;
        const inset = 70 - i * 14;
        return (
          <polygon
            key={i}
            points={`${160 - inset},${y} ${160 + inset},${y} ${160 + inset + 8},${y + 7} ${160 - inset - 8},${y + 7}`}
            fill={i % 2 ? "#2a2552" : "#332c63"}
            stroke="#0a0720"
            strokeWidth="0.6"
          />
        );
      })}

      {/* arch vault — back to front for depth */}
      <g strokeLinecap="round" fill="none">
        <path d="M52 150 Q160 22 268 150" stroke="url(#ksArchSide)" strokeWidth="9" opacity="0.85" />
        <path d="M122 150 Q160 30 198 150" stroke="url(#ksArchSide)" strokeWidth="9" opacity="0.9" />
        <path d="M84 150 Q160 14 236 150" stroke="url(#ksArch)" strokeWidth="12" />
        <path d="M40 150 Q160 40 280 150" stroke="url(#ksArch)" strokeWidth="10" />
        {/* highlight edges */}
        <path d="M84 150 Q160 14 236 150" stroke="#fff1cf" strokeWidth="2" opacity="0.5" />
      </g>
      {/* arch bases / plinths */}
      {[40, 84, 122, 198, 236, 280].map((x, i) => (
        <rect key={i} x={x - 4} y="146" width="8" height="8" fill="#8d723f" stroke="#0a0720" strokeWidth="0.6" />
      ))}

      {/* chandelier */}
      <circle cx="160" cy="58" r="58" fill="url(#ksGlow)" className={active ? "kstage-glow on" : "kstage-glow"} />
      <line x1="160" y1="18" x2="160" y2="47" stroke="#caa75f" strokeWidth="1.4" />
      {/* hanging crystal strands */}
      <g className="kstage-veil">
        {BEADS.map((x, i) => {
          const len = 22 + (i % 2 === 0 ? 8 : 0) - Math.abs(i - 5);
          return (
            <g key={x}>
              <line x1={x} y1="60" x2={x} y2={60 + len} stroke="#ffe6a0" strokeWidth="0.7" opacity="0.6" />
              <circle cx={x} cy={60 + len} r="1.1" fill="#fff2c2" className="kstage-bead" style={{ animationDelay: `${i * 0.18}s` }} />
            </g>
          );
        })}
      </g>
      {/* ring */}
      <ellipse cx="160" cy="58" rx="38" ry="9" fill="none" stroke="#ffcf6a" strokeWidth="3.5" />
      <ellipse cx="160" cy="58" rx="30" ry="6.5" fill="none" stroke="#ffe7a6" strokeWidth="1.6" opacity="0.8" />
      {/* bulbs around the ring */}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <circle
            key={i}
            cx={160 + Math.cos(a) * 38}
            cy={58 + Math.sin(a) * 9}
            r="1.7"
            fill="#fff6d2"
            className="kstage-bead"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        );
      })}

      {/* flipchart on the right (as in the photo) */}
      <g>
        <rect x="244" y="116" width="22" height="16" fill="#f4f1e8" stroke="#0a0720" strokeWidth="0.8" />
        <line x1="248" y1="132" x2="246" y2="146" stroke="#9a9a9a" strokeWidth="1.4" />
        <line x1="262" y1="132" x2="264" y2="146" stroke="#9a9a9a" strokeWidth="1.4" />
      </g>

      {/* mic stand on stage */}
      <g>
        <line x1="150" y1="148" x2="150" y2="126" stroke="#cfcad8" strokeWidth="1.4" />
        <circle cx="150" cy="124" r="2.6" fill="#1a1330" stroke="#cfcad8" strokeWidth="1" />
      </g>
    </svg>
  );
}
