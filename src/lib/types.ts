export type GameKey = "karaoke" | "drive" | "cosmopark";

export interface Landmark {
  key: string;
  name: string;
  nameRu: string;
  game: GameKey;
  blurb: string;
  /** position on the overworld image, in percent (0-100) */
  x: number;
  y: number;
  emoji: string;
  status: "live" | "soon";
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  score: number;
  isHost: boolean;
}

export type NetEvent =
  | { event: "karaoke:state"; payload: KaraokeState }
  | { event: "karaoke:rate"; payload: { raterId: string; score: number } }
  | { event: "karaoke:signal"; payload: KaraokeSignalPayload }
  | { event: "karaoke:need-offer"; payload: { listenerId: string; singerId: string } }
  | { event: "karaoke:mic-live"; payload: { singerId: string } }
  | { event: "score:add"; payload: { playerId: string; delta: number } }
  | { event: "game:start"; payload: { game: GameKey } }
  | { event: string; payload: unknown };

export interface KaraokeState {
  phase: "idle" | "singing" | "rating" | "results";
  singerId: string | null;
  song: string | null;
  endsAt: number | null;
  round: number;
}

export type KaraokeSignalPayload =
  | { type: "offer"; sdp: RTCSessionDescriptionInit; from: string; to: string }
  | { type: "answer"; sdp: RTCSessionDescriptionInit; from: string; to: string }
  | { type: "ice"; candidate: RTCIceCandidateInit; from: string; to: string };
