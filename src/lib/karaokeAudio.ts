import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomConnection } from "./net";
import type { KaraokeSignalPayload } from "./types";

const ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

export type MicStatus = "idle" | "requesting" | "live" | "denied" | "unsupported";

function hasRtc(): boolean {
  return typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

function normalizeSdp(sdp: RTCSessionDescriptionInit): RTCSessionDescriptionInit {
  return { type: sdp.type, sdp: sdp.sdp };
}

/** Unlock autoplay once (any prior click on the page counts). */
function primeAudioElement(audio: HTMLAudioElement) {
  audio.muted = true;
  audio.setAttribute("playsinline", "true");
  void audio.play().finally(() => {
    audio.pause();
    audio.muted = false;
    audio.currentTime = 0;
  });
}

async function playRemoteStream(audio: HTMLAudioElement, stream: MediaStream) {
  audio.srcObject = stream;
  audio.muted = false;
  audio.volume = 1;
  for (let i = 0; i < 8; i++) {
    try {
      await audio.play();
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return false;
}

export function useKaraokeAudio(
  conn: RoomConnection,
  opts: { phase: string; singerId: string | null; peerIds: string[] }
) {
  const { phase, singerId, peerIds } = opts;
  const iAmSinger = singerId === conn.me.id;
  const singing = phase === "singing" && !!singerId;
  const listening = singing && !iAmSinger && !!singerId;

  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [micError, setMicError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const micLiveRef = useRef(false);
  const connectingRef = useRef<Set<string>>(new Set());
  const listeningLiveRef = useRef(false);
  const primedRef = useRef(false);
  const needOfferTimerRef = useRef<number | null>(null);
  const autoMicTriedRef = useRef(false);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const setAudioRef = useCallback((el: HTMLAudioElement | null) => {
    remoteAudioRef.current = el;
    if (el && !primedRef.current) {
      primedRef.current = true;
      primeAudioElement(el);
    }
  }, []);

  const attachRemoteAudio = useCallback(async (stream: MediaStream) => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    const ok = await playRemoteStream(audio, stream);
    if (ok) listeningLiveRef.current = true;
  }, []);

  const cleanup = useCallback(() => {
    micLiveRef.current = false;
    listeningLiveRef.current = false;
    autoMicTriedRef.current = false;
    connectingRef.current.clear();
    if (needOfferTimerRef.current != null) {
      clearInterval(needOfferTimerRef.current);
      needOfferTimerRef.current = null;
    }
    for (const pc of pcsRef.current.values()) pc.close();
    pcsRef.current.clear();
    pendingIceRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    const audio = remoteAudioRef.current;
    if (audio) {
      audio.srcObject = null;
    }
    setMicStatus("idle");
    setMicError(null);
  }, []);

  const sendSignal = useCallback(
    (payload: KaraokeSignalPayload) => {
      if (payload.type === "offer" || payload.type === "answer") {
        conn.send("karaoke:signal", { ...payload, sdp: normalizeSdp(payload.sdp) });
      } else {
        conn.send("karaoke:signal", payload);
      }
    },
    [conn]
  );

  const flushIce = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const queued = pendingIceRef.current.get(peerId);
    if (!queued?.length) return;
    pendingIceRef.current.delete(peerId);
    for (const c of queued) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* stale */
      }
    }
  }, []);

  const queueIce = useCallback((peerId: string, candidate: RTCIceCandidateInit) => {
    const q = pendingIceRef.current.get(peerId) ?? [];
    q.push(candidate);
    pendingIceRef.current.set(peerId, q);
  }, []);

  const closePeer = useCallback((peerId: string) => {
    pcsRef.current.get(peerId)?.close();
    pcsRef.current.delete(peerId);
    pendingIceRef.current.delete(peerId);
    connectingRef.current.delete(peerId);
  }, []);

  const connectAsSinger = useCallback(
    async (peerId: string) => {
      const stream = localStreamRef.current;
      if (!stream || !micLiveRef.current || peerId === conn.me.id) return;
      if (connectingRef.current.has(peerId)) return;

      const existing = pcsRef.current.get(peerId);
      if (existing && existing.connectionState === "connected") return;

      connectingRef.current.add(peerId);
      closePeer(peerId);

      const pc = new RTCPeerConnection({ iceServers: ICE });
      pcsRef.current.set(peerId, pc);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal({
            type: "ice",
            candidate: e.candidate.toJSON(),
            from: conn.me.id,
            to: peerId,
          });
        }
      };

      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({
          type: "offer",
          sdp: pc.localDescription!.toJSON(),
          from: conn.me.id,
          to: peerId,
        });
        await flushIce(peerId, pc);
      } catch (err) {
        console.error("[karaoke] offer failed", peerId, err);
        closePeer(peerId);
      } finally {
        connectingRef.current.delete(peerId);
      }
    },
    [closePeer, conn.me.id, flushIce, sendSignal]
  );

  const connectAsListener = useCallback(
    async (peerId: string, offer: RTCSessionDescriptionInit) => {
      if (peerId !== optsRef.current.singerId) return;
      if (listeningLiveRef.current) return;

      const existing = pcsRef.current.get(peerId);
      if (existing?.connectionState === "connected") return;
      if (connectingRef.current.has(peerId)) return;

      connectingRef.current.add(peerId);
      closePeer(peerId);

      const pc = new RTCPeerConnection({ iceServers: ICE });
      pcsRef.current.set(peerId, pc);

      pc.ontrack = (e) => {
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        void attachRemoteAudio(stream);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal({
            type: "ice",
            candidate: e.candidate.toJSON(),
            from: conn.me.id,
            to: peerId,
          });
        }
      };

      try {
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({
          type: "answer",
          sdp: pc.localDescription!.toJSON(),
          from: conn.me.id,
          to: peerId,
        });
        await flushIce(peerId, pc);
      } catch (err) {
        console.error("[karaoke] answer failed", peerId, err);
        closePeer(peerId);
      } finally {
        connectingRef.current.delete(peerId);
      }
    },
    [attachRemoteAudio, closePeer, conn.me.id, flushIce, sendSignal]
  );

  const connectToAllListeners = useCallback(async () => {
    const others = optsRef.current.peerIds.filter((id) => id !== conn.me.id);
    await Promise.all(others.map((id) => connectAsSinger(id)));
  }, [conn.me.id, connectAsSinger]);

  const requestOfferFromSinger = useCallback(() => {
    if (listeningLiveRef.current) return;
    const sid = optsRef.current.singerId;
    if (!sid || sid === conn.me.id) return;
    conn.send("karaoke:need-offer", { listenerId: conn.me.id, singerId: sid });
  }, [conn]);

  const enableMicrophone = useCallback(async () => {
    if (!hasRtc()) {
      setMicStatus("unsupported");
      return false;
    }
    if (!iAmSinger || !singing) return false;
    if (micLiveRef.current) return true;
    setMicStatus("requesting");
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      localStreamRef.current = stream;
      micLiveRef.current = true;
      setMicStatus("live");
      conn.send("karaoke:mic-live", { singerId: conn.me.id });
      await connectToAllListeners();
      return true;
    } catch (err) {
      micLiveRef.current = false;
      setMicStatus("denied");
      setMicError(err instanceof Error ? err.message : "Microphone blocked");
      return false;
    }
  }, [connectToAllListeners, conn, iAmSinger, singing]);

  // WebRTC signaling
  useEffect(() => {
    if (!hasRtc()) return;

    const onSignal = async (raw: KaraokeSignalPayload) => {
      if (raw.to !== conn.me.id) return;
      const { singerId: sid, phase: ph } = optsRef.current;
      if (ph !== "singing" || !sid) return;

      const peerId = raw.from;

      if (raw.type === "offer" && raw.from === sid && !micLiveRef.current) {
        await connectAsListener(peerId, raw.sdp);
      } else if (raw.type === "answer" && micLiveRef.current && raw.from !== conn.me.id) {
        const pc = pcsRef.current.get(peerId);
        if (!pc) return;
        try {
          await pc.setRemoteDescription(raw.sdp);
          await flushIce(peerId, pc);
        } catch (err) {
          console.error("[karaoke] set answer failed", err);
        }
      } else if (raw.type === "ice") {
        const pc = pcsRef.current.get(peerId);
        if (!pc?.remoteDescription) {
          queueIce(peerId, raw.candidate);
          return;
        }
        try {
          await pc.addIceCandidate(raw.candidate);
        } catch {
          queueIce(peerId, raw.candidate);
        }
      }
    };

    const offSignal = conn.onEvent("karaoke:signal", onSignal);
    const offNeed = conn.onEvent(
      "karaoke:need-offer",
      (p: { listenerId: string; singerId: string }) => {
        if (p.singerId !== conn.me.id || !micLiveRef.current) return;
        void connectAsSinger(p.listenerId);
      }
    );
    const offMicLive = conn.onEvent("karaoke:mic-live", (p: { singerId: string }) => {
      const { phase: ph, singerId: sid } = optsRef.current;
      if (ph !== "singing" || !sid || sid !== p.singerId || sid === conn.me.id) return;
      requestOfferFromSinger();
    });

    return () => {
      offSignal();
      offNeed();
      offMicLive();
    };
  }, [conn, connectAsListener, connectAsSinger, flushIce, queueIce, requestOfferFromSinger]);

  // Singer: turn on mic automatically when their turn starts
  useEffect(() => {
    if (!singing || !iAmSinger) {
      autoMicTriedRef.current = false;
      return;
    }
    if (autoMicTriedRef.current || micLiveRef.current) return;
    autoMicTriedRef.current = true;
    void enableMicrophone();
  }, [singing, iAmSinger, enableMicrophone]);

  // Singer: new listeners mid-round
  useEffect(() => {
    if (!singing || !iAmSinger || !micLiveRef.current) return;
    void connectToAllListeners();
  }, [singing, iAmSinger, peerIds.join(","), connectToAllListeners]);

  // Listener: request audio as soon as it's their turn to listen (no button)
  useEffect(() => {
    if (!listening || !singerId) return;
    listeningLiveRef.current = false;
    requestOfferFromSinger();
    needOfferTimerRef.current = window.setInterval(() => {
      if (!listeningLiveRef.current) requestOfferFromSinger();
    }, 3000);
    return () => {
      if (needOfferTimerRef.current != null) {
        clearInterval(needOfferTimerRef.current);
        needOfferTimerRef.current = null;
      }
    };
  }, [listening, singerId, requestOfferFromSinger]);

  useEffect(() => {
    if (!singing) cleanup();
  }, [singing, cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  // Any click in the game (Start round, rate, etc.) unlocks autoplay for listeners.
  useEffect(() => {
    const onPointer = () => {
      const el = remoteAudioRef.current;
      if (el) primeAudioElement(el);
    };
    document.addEventListener("pointerdown", onPointer, { once: true, capture: true });
    return () => document.removeEventListener("pointerdown", onPointer, { capture: true });
  }, []);

  return {
    setAudioRef,
    micStatus,
    micError,
    enableMicrophone,
    hasRtc: hasRtc(),
    listening,
  };
}
