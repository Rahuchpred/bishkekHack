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
  | { event: "score:add"; payload: { playerId: string; delta: number } }
  | { event: "game:start"; payload: { game: GameKey } }
  | { event: string; payload: unknown };

export interface KaraokeState {
  phase: "idle" | "singing" | "results";
  singerId: string | null;
  song: string | null;
  endsAt: number | null;
  round: number;
}
