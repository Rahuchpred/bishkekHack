// Generate the pixel-art overworld + landmark icons with the OpenAI image API.
// Runs at BUILD TIME only. The key never ships to the browser.
//
// Usage:
//   1) put OPENAI_API_KEY=sk-... in .env.local (or export it)
//   2) npm run gen:art
//   3) generated PNGs land in public/art/ — commit them.
//
// The app works without this (it ships a placeholder overworld.svg). This just
// swaps in nicer AI pixel art when you have a key.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("public/art");

async function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    if (existsSync(f)) {
      const txt = await readFile(f, "utf8");
      for (const line of txt.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

const PROMPTS = {
  overworld:
    "Top-down 16-bit pixel art map of Bishkek, Kyrgyzstan as a cute video game overworld. " +
    "Snowy Ala-Too mountains across the top, a green city park with trees on the left, a " +
    "central square with a blue fountain, low city blocks, a pink shopping mall on the right, " +
    "roads with a yellow marshrutka minibus, warm summer sunset sky. Stardew Valley / Pokemon " +
    "town-map vibe. Clean readable pixels, vibrant, no text, no labels, no UI.",
  yntymak:
    "16-bit pixel art icon of a karaoke microphone with musical notes, summer park vibe, " +
    "transparent background, game asset, no text.",
  drive:
    "16-bit pixel art icon of a small car on a mountain road with snowy peaks, " +
    "transparent background, game asset, no text.",
  cosmopark:
    "16-bit pixel art icon of a game controller with neon arcade glow, " +
    "transparent background, game asset, no text.",
};

async function gen(name, prompt, size) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI ${name} failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const b64 = data.data[0].b64_json;
  const file = path.join(OUT, `${name}.png`);
  await writeFile(file, Buffer.from(b64, "base64"));
  console.log("wrote", file);
}

async function main() {
  await loadEnv();
  if (!process.env.OPENAI_API_KEY) {
    console.error("No OPENAI_API_KEY found. Add it to .env.local. Skipping.");
    process.exit(1);
  }
  await mkdir(OUT, { recursive: true });
  await gen("overworld", PROMPTS.overworld, "1536x1024");
  for (const key of ["yntymak", "drive", "cosmopark"]) {
    await gen(key, PROMPTS[key], "1024x1024");
  }
  console.log("Done. If overworld.png exists, update MapScreen to use it instead of overworld.svg.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
