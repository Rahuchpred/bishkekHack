import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export interface HandState {
  /** normalized 0..1, already mirrored so it feels like a mirror */
  x: number;
  y: number;
  /** true when the hand is making a fist (grab) */
  fist: boolean;
  /** true when a hand is currently detected */
  present: boolean;
}

// Pinned to the installed npm version so the wasm runtime matches the JS API.
const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/**
 * Webcam hand tracker. Detects locally; nothing leaves the device.
 * Falls back to mouse/touch if the camera is denied or the model fails to load.
 */
export class HandTracker {
  state: HandState = { x: 0.5, y: 0.5, fist: false, present: false };
  mode: "camera" | "mouse" | "loading" = "loading";
  error: string | null = null;

  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private landmarker: HandLandmarker | null = null;
  private raf = 0;
  private running = false;
  private lastVideoTime = -1;
  private fistEma = 0; // smoothed fist signal to kill jitter
  private mouseHandler: ((e: PointerEvent) => void) | null = null;
  private mouseDownHandler: ((e: PointerEvent) => void) | null = null;
  private mouseUpHandler: ((e: PointerEvent) => void) | null = null;

  /** Try camera first; on any failure, switch to mouse mode. Resolves to the active mode. */
  async start(): Promise<"camera" | "mouse"> {
    this.running = true;
    try {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      try {
        this.landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 1,
        });
      } catch {
        // Some machines/browsers lack a usable GPU delegate; CPU still works.
        this.landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          numHands: 1,
        });
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });

      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.srcObject = this.stream;
      await video.play();
      this.video = video;

      this.mode = "camera";
      this.loop();
      return "camera";
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
      this.enableMouseFallback();
      this.mode = "mouse";
      return "mouse";
    }
  }

  /** Element to draw the camera self-view into (optional). Returns the video element or null. */
  getVideoEl(): HTMLVideoElement | null {
    return this.video;
  }

  private enableMouseFallback() {
    this.mouseHandler = (e: PointerEvent) => {
      this.state.x = e.clientX / window.innerWidth;
      this.state.y = e.clientY / window.innerHeight;
      this.state.present = true;
    };
    this.mouseDownHandler = () => {
      this.state.fist = true;
    };
    this.mouseUpHandler = () => {
      this.state.fist = false;
    };
    window.addEventListener("pointermove", this.mouseHandler);
    window.addEventListener("pointerdown", this.mouseDownHandler);
    window.addEventListener("pointerup", this.mouseUpHandler);
  }

  private loop = () => {
    if (!this.running || !this.video || !this.landmarker) return;
    const now = performance.now();
    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const res = this.landmarker.detectForVideo(this.video, now);
      const lm = res.landmarks?.[0];
      if (lm && lm.length >= 21) {
        // Landmark 9 = middle-finger MCP, a stable hand-center proxy.
        const center = lm[9];
        // mirror X so moving right moves the cursor right
        this.state.x = 1 - center.x;
        this.state.y = center.y;
        this.state.present = true;
        this.fistEma = this.fistEma * 0.6 + (isFist(lm) ? 1 : 0) * 0.4;
        this.state.fist = this.fistEma > 0.5;
      } else {
        this.state.present = false;
        this.fistEma *= 0.6;
        this.state.fist = false;
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.landmarker?.close();
    this.landmarker = null;
    this.video = null;
    if (this.mouseHandler) window.removeEventListener("pointermove", this.mouseHandler);
    if (this.mouseDownHandler) window.removeEventListener("pointerdown", this.mouseDownHandler);
    if (this.mouseUpHandler) window.removeEventListener("pointerup", this.mouseUpHandler);
  }
}

/** A hand is a fist when all four fingers are curled toward the palm. */
function isFist(lm: { x: number; y: number; z: number }[]): boolean {
  const wrist = lm[0];
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  // For each finger: tip closer to wrist than the lower joint (pip) => curled.
  const fingers = [
    [8, 6], // index
    [12, 10], // middle
    [16, 14], // ring
    [20, 18], // pinky
  ];
  let curled = 0;
  for (const [tip, pip] of fingers) {
    if (dist(lm[tip], wrist) < dist(lm[pip], wrist)) curled++;
  }
  return curled >= 3;
}
