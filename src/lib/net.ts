import { supabase } from "./supabase";
import type { Player } from "./types";

export interface RoomConnection {
  code: string;
  backend: "supabase" | "local";
  me: Player;
  onPlayers(cb: (players: Player[]) => void): () => void;
  onEvent(event: string, cb: (payload: any, fromId?: string) => void): () => void;
  send(event: string, payload: any): void;
  updateMe(patch: Partial<Player>): void;
  leave(): void;
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

export function randomRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export function makePlayerId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Stable id per tab+room so React strict-mode remounts do not spawn ghost peers. */
export function stablePlayerId(roomCode: string): string {
  const code = normalizeRoomCode(roomCode);
  const key = `pixelbishkek:pid:${code}`;
  try {
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = makePlayerId();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return makePlayerId();
  }
}

export function clearStablePlayerId(roomCode: string): void {
  try {
    sessionStorage.removeItem(`pixelbishkek:pid:${normalizeRoomCode(roomCode)}`);
  } catch {
    /* ignore */
  }
}

function presenceToPlayer(meta: unknown): Player | null {
  if (!meta || typeof meta !== "object") return null;
  const o = meta as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  return {
    id: o.id,
    name: o.name,
    avatar: typeof o.avatar === "string" ? o.avatar : "🎮",
    score: typeof o.score === "number" ? o.score : 0,
    isHost: !!o.isHost,
  };
}

function playersFromPresenceState(state: Record<string, unknown>): Player[] {
  const byId = new Map<string, Player>();
  for (const metas of Object.values(state)) {
    if (!Array.isArray(metas)) continue;
    for (const meta of metas) {
      const p = presenceToPlayer(meta);
      if (p) byId.set(p.id, p);
    }
  }
  return [...byId.values()];
}

function sortPlayers(players: Player[]): Player[] {
  return [...players].sort(
    (a, b) => Number(b.isHost) - Number(a.isHost) || a.name.localeCompare(b.name)
  );
}

/** Pick the right backend: real Supabase realtime, or a same-machine multi-tab fallback. */
export function joinRoom(code: string, me: Player): RoomConnection {
  const normalized = normalizeRoomCode(code);
  return supabase ? new SupabaseRoom(normalized, me) : new LocalRoom(normalized, me);
}

class SupabaseRoom implements RoomConnection {
  backend = "supabase" as const;
  code: string;
  me: Player;
  private channel;
  private playerCbs = new Set<(p: Player[]) => void>();
  private subscribed = false;

  constructor(code: string, me: Player) {
    this.code = code;
    this.me = me;
    this.channel = supabase!.channel(`room:${code}`, {
      config: { presence: { key: me.id }, broadcast: { self: true } },
    });
    this.channel.on("presence", { event: "sync" }, () => this.emitPlayers());
    this.channel.on("presence", { event: "join" }, () => this.emitPlayers());
    this.channel.on("presence", { event: "leave" }, () => this.emitPlayers());
    this.channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        this.subscribed = true;
        void this.channel.track(this.me).then(() => this.emitPlayers());
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("[room] Supabase channel error:", status, err);
      }
    });
  }

  private emitPlayers() {
    const state = this.channel.presenceState() as Record<string, unknown>;
    let players = playersFromPresenceState(state);

    const hasSelf = players.some((p) => p.id === this.me.id);
    if (this.subscribed && !hasSelf) {
      void this.channel.track(this.me);
    }

    if (!players.some((p) => p.id === this.me.id)) {
      players = [...players, this.me];
    }

    players = sortPlayers(players);
    this.playerCbs.forEach((cb) => cb(players));
  }

  onPlayers(cb: (players: Player[]) => void) {
    this.playerCbs.add(cb);
    this.emitPlayers();
    return () => this.playerCbs.delete(cb);
  }

  onEvent(event: string, cb: (payload: any, fromId?: string) => void) {
    const handler = (msg: { payload?: { data?: unknown; from?: string } }) =>
      cb(msg.payload?.data, msg.payload?.from);
    this.channel.on("broadcast", { event }, handler);
    return () => {
      /* supabase has no off per-handler; channel torn down on leave */
    };
  }

  send(event: string, payload: any) {
    void this.channel.send({
      type: "broadcast",
      event,
      payload: { data: payload, from: this.me.id },
    });
  }

  async updateMe(patch: Partial<Player>) {
    this.me = { ...this.me, ...patch };
    if (this.subscribed) await this.channel.track(this.me);
    this.emitPlayers();
  }

  leave() {
    void this.channel.untrack();
    this.channel.unsubscribe();
    supabase!.removeChannel(this.channel);
  }
}

type LocalMsg =
  | { kind: "presence"; room: string; player: Player }
  | { kind: "hello"; room: string; from: string }
  | { kind: "leave"; room: string; from: string }
  | { kind: "event"; room: string; event: string; payload: unknown; from: string };

/** BroadcastChannel fallback: works across tabs/windows on one machine, no network. */
class LocalRoom implements RoomConnection {
  backend = "local" as const;
  code: string;
  me: Player;
  private bc: BroadcastChannel;
  private peers = new Map<string, { player: Player; last: number }>();
  private playerCbs = new Set<(p: Player[]) => void>();
  private eventCbs = new Map<string, Set<(payload: any, fromId?: string) => void>>();
  private hb: number;
  private prune: number;
  private helloBurst: number[] = [];

  constructor(code: string, me: Player) {
    this.code = code;
    this.me = me;
    this.bc = new BroadcastChannel(`pixelbishkek:room:${code}`);
    this.peers.set(me.id, { player: me, last: Date.now() });
    this.bc.onmessage = (e) => this.handle(e.data as LocalMsg);
    this.announce();
    this.requestPeers();
    this.hb = window.setInterval(() => this.announce(), 2000);
    this.prune = window.setInterval(() => this.pruneStale(), 2500);
  }

  private requestPeers() {
    for (let i = 0; i < 6; i++) {
      this.helloBurst.push(
        window.setTimeout(() => {
          this.bc.postMessage({ kind: "hello", room: this.code, from: this.me.id } satisfies LocalMsg);
        }, i * 350)
      );
    }
  }

  private announce() {
    this.peers.set(this.me.id, { player: this.me, last: Date.now() });
    this.bc.postMessage({ kind: "presence", room: this.code, player: this.me } satisfies LocalMsg);
    this.emitPlayers();
  }

  private pruneStale() {
    const now = Date.now();
    let changed = false;
    for (const [id, v] of this.peers) {
      if (id !== this.me.id && now - v.last > 12000) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitPlayers();
  }

  private handle(msg: LocalMsg) {
    if (!msg || typeof msg !== "object" || msg.room !== this.code) return;

    if (msg.kind === "presence") {
      const isNew = !this.peers.has(msg.player.id);
      this.peers.set(msg.player.id, { player: msg.player, last: Date.now() });
      if (isNew && msg.player.id !== this.me.id) {
        this.bc.postMessage({ kind: "presence", room: this.code, player: this.me } satisfies LocalMsg);
      }
      this.emitPlayers();
    } else if (msg.kind === "hello" && msg.from !== this.me.id) {
      this.bc.postMessage({ kind: "presence", room: this.code, player: this.me } satisfies LocalMsg);
    } else if (msg.kind === "leave") {
      this.peers.delete(msg.from);
      this.emitPlayers();
    } else if (msg.kind === "event") {
      this.eventCbs.get(msg.event)?.forEach((cb) => cb(msg.payload, msg.from));
    }
  }

  private emitPlayers() {
    const players = sortPlayers([...this.peers.values()].map((v) => v.player));
    this.playerCbs.forEach((cb) => cb(players));
  }

  onPlayers(cb: (players: Player[]) => void) {
    this.playerCbs.add(cb);
    this.emitPlayers();
    return () => this.playerCbs.delete(cb);
  }

  onEvent(event: string, cb: (payload: any, fromId?: string) => void) {
    if (!this.eventCbs.has(event)) this.eventCbs.set(event, new Set());
    this.eventCbs.get(event)!.add(cb);
    return () => this.eventCbs.get(event)?.delete(cb);
  }

  send(event: string, payload: any) {
    this.eventCbs.get(event)?.forEach((cb) => cb(payload, this.me.id));
    this.bc.postMessage({
      kind: "event",
      room: this.code,
      event,
      payload,
      from: this.me.id,
    } satisfies LocalMsg);
  }

  updateMe(patch: Partial<Player>) {
    this.me = { ...this.me, ...patch };
    this.announce();
  }

  leave() {
    this.bc.postMessage({ kind: "leave", room: this.code, from: this.me.id } satisfies LocalMsg);
    for (const t of this.helloBurst) clearTimeout(t);
    clearInterval(this.hb);
    clearInterval(this.prune);
    this.bc.close();
  }
}
