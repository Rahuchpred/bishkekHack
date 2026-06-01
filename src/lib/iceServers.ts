// ICE servers for the karaoke WebRTC voice link.
//
// STUN alone is enough on a LAN / same machine, but it FAILS across most real
// networks (mobile data, symmetric NATs, university & corporate Wi-Fi). That is
// the classic "my mic turns on but nobody can hear me" bug on a deployed site.
// A TURN relay fixes it by bouncing the audio through a server when a direct
// peer-to-peer path can't be found.
//
// By default we fall back to the free public Open Relay TURN servers (Metered),
// which is fine for demos. For production, set your own in .env.local:
//   VITE_TURN_URL=turn:your-host:3478,turns:your-host:5349
//   VITE_TURN_USERNAME=...
//   VITE_TURN_CREDENTIAL=...

function readEnv(...keys: string[]): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>;
  for (const k of keys) {
    const v = env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

const STUN: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

/** Demo TURN relay — needed when peers are on different Wi‑Fi / mobile networks. */
const DEMO_TURN: RTCIceServer[] = [
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
      "turns:openrelay.metered.ca:443",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

function turnFromEnv(): RTCIceServer[] {
  const url = readEnv("VITE_TURN_URL");
  if (!url) return [];
  const username = readEnv("VITE_TURN_USERNAME");
  const credential = readEnv("VITE_TURN_CREDENTIAL");
  const turn: RTCIceServer = { urls: url.split(",").map((s) => s.trim()).filter(Boolean) };
  if (username) turn.username = username;
  if (credential) turn.credential = credential;
  return [turn];
}

export function getIceServers(): RTCIceServer[] {
  const custom = turnFromEnv();
  // Env TURN wins; otherwise use the free Open Relay demo servers so voice works
  // across real networks (STUN alone only works on the same LAN).
  return [...STUN, ...(custom.length ? custom : DEMO_TURN)];
}

/** True when a TURN relay is configured — needed for cross-network voice. */
export function hasTurn(): boolean {
  return turnFromEnv().length > 0;
}
