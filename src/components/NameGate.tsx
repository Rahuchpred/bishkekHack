import { useState } from "react";

const AVATARS = ["🦊", "🐼", "🐯", "🐸", "🐵", "🦉", "🐲", "🐱", "🐺", "🦁"];

export function NameGate({
  title,
  onDone,
}: {
  title: string;
  onDone: (name: string, avatar: string) => void;
}) {
  const saved = loadIdentity();
  const [name, setName] = useState(saved?.name ?? "");
  const [avatar, setAvatar] = useState(saved?.avatar ?? AVATARS[0]);

  function submit() {
    const n = name.trim().slice(0, 14) || "Player";
    saveIdentity(n, avatar);
    onDone(n, avatar);
  }

  return (
    <div className="overlay">
      <div className="panel">
        <h1>{title}</h1>
        <label className="field">Your name</label>
        <input
          className="pix"
          value={name}
          maxLength={14}
          placeholder="e.g. Aibek"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          autoFocus
        />
        <label className="field">Pick a pixel pal</label>
        <div className="avatar-pick">
          {AVATARS.map((a) => (
            <button key={a} className={a === avatar ? "sel" : ""} onClick={() => setAvatar(a)}>
              {a}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 20 }}>
          <button className="btn big" onClick={submit}>
            Let's go
          </button>
        </div>
      </div>
    </div>
  );
}

export function loadIdentity(): { name: string; avatar: string } | null {
  try {
    const raw = localStorage.getItem("pb_identity");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(name: string, avatar: string) {
  localStorage.setItem("pb_identity", JSON.stringify({ name, avatar }));
}
