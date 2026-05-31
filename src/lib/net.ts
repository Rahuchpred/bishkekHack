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

export function randomRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export function makePlayerId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Pick the right backend: real Supabase realtime, or a same-machine multi-tab fallback. */
export function joinRoom(code: string, me: Player): RoomConnection {
  return supabase ? new SupabaseRoom(code, me) : new LocalRoom(code, me);
}

class SupabaseRoom implements RoomConnection {
  backend = "supabase" as const;
  code: string;
  me: Player;
  private channel;
  private playerCbs = new Set<(p: Player[]) => void>();

  constructor(code: string, me: Player) {
    this.code = code;
    this.me = me;
    this.channel = supabase!.channel(`room:${code}`, {
      config: { presence: { key: me.id }, broadcast: { self: true } },
    });
    this.channel.on("presence", { event: "sync" }, () => this.emitPlayers());
    this.channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await this.channel.track(this.me);
    });
  }

  private emitPlayers() {
    const state = this.channel.presenceState() as Record<string, Player[]>;
    const players = Object.values(state)
      .map((arr) => arr[0])
      .filter(Boolean) as Player[];
    players.sort((a, b) => Number(b.isHost) - Number(a.isHost) || a.name.localeCompare(b.name));
    this.playerCbs.forEach((cb) => cb(players));
  }

  onPlayers(cb: (players: Player[]) => void) {
    this.playerCbs.add(cb);
    this.emitPlayers();
    return () => this.playerCbs.delete(cb);
  }

  onEvent(event: string, cb: (payload: any, fromId?: string) => void) {
    const handler = (msg: any) => cb(msg.payload?.data, msg.payload?.from);
    this.channel.on("broadcast", { event }, handler);
    return () => {
      /* supabase has no off per-handler; channel torn down on leave */
    };
  }

  send(event: string, payload: any) {
    this.channel.send({ type: "broadcast", event, payload: { data: payload, from: this.me.id } });
  }

  async updateMe(patch: Partial<Player>) {
    this.me = { ...this.me, ...patch };
    await this.channel.track(this.me);
  }

  leave() {
    this.channel.unsubscribe();
    supabase!.removeChannel(this.channel);
  }
}

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

  constructor(code: string, me: Player) {
    this.code = code;
    this.me = me;
    this.bc = new BroadcastChannel(`pixelbishkek:room:${code}`);
    this.peers.set(me.id, { player: me, last: Date.now() });
    this.bc.onmessage = (e) => this.handle(e.data);
    this.announce();
    this.bc.postMessage({ kind: "hello", from: me.id });
    this.hb = window.setInterval(() => this.announce(), 2000);
    this.prune = window.setInterval(() => this.pruneStale(), 2500);
  }

  private announce() {
    this.peers.set(this.me.id, { player: this.me, last: Date.now() });
    this.bc.postMessage({ kind: "presence", player: this.me });
    this.emitPlayers();
  }

  private pruneStale() {
    const now = Date.now();
    let changed = false;
    for (const [id, v] of this.peers) {
      if (id !== this.me.id && now - v.last > 6500) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitPlayers();
  }

  private handle(msg: any) {
    if (msg.kind === "presence") {
      this.peers.set(msg.player.id, { player: msg.player, last: Date.now() });
      this.emitPlayers();
    } else if (msg.kind === "hello" && msg.from !== this.me.id) {
      this.bc.postMessage({ kind: "presence", player: this.me });
    } else if (msg.kind === "leave") {
      this.peers.delete(msg.from);
      this.emitPlayers();
    } else if (msg.kind === "event") {
      this.eventCbs.get(msg.event)?.forEach((cb) => cb(msg.payload, msg.from));
    }
  }

  private emitPlayers() {
    const players = [...this.peers.values()].map((v) => v.player);
    players.sort((a, b) => Number(b.isHost) - Number(a.isHost) || a.name.localeCompare(b.name));
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
    // deliver to self too, so host UI updates like remote peers
    this.eventCbs.get(event)?.forEach((cb) => cb(payload, this.me.id));
    this.bc.postMessage({ kind: "event", event, payload, from: this.me.id });
  }

  updateMe(patch: Partial<Player>) {
    this.me = { ...this.me, ...patch };
    this.announce();
  }

  leave() {
    this.bc.postMessage({ kind: "leave", from: this.me.id });
    clearInterval(this.hb);
    clearInterval(this.prune);
    this.bc.close();
  }
}
