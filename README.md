# 🎮 Pixel Bishkek

A pixel-art map of Bishkek where every landmark is a portal into a multiplayer mini-game.
Tap a place → invite friends → play together. Built for a hackathon. Summer activity, the
fun way.

## The map

| Place | Game | What it is |
|---|---|---|
| 🎤 Park Yntymak | **Karaoke Battle** | One person sings, everyone rates 1–5, highest average wins |
| 🚗 Ala-Archa Mountains | **Mini-Drive** | Endless dodge down the mountain road, grab boorsok 🥟 |
| 🎮 Cosmopark | **Tap Brawl** | 15s mash-off, most taps wins |
| ⛲ Ala-Too Square | *coming soon* | more games |

## Run it

```bash
npm install
npm run dev
```

Open the URL it prints. To play multiplayer right now with **zero setup**, open the room
link in a second browser tab/window — it uses a local fallback that works across tabs on
one machine.

## Multiplayer over the network (Supabase)

For real multiplayer across devices, add Supabase:

1. Create a project at supabase.com.
2. Copy `.env.example` → `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (Project Settings → API).
3. (Optional) Run `supabase/schema.sql` in the SQL editor if you want persistence. The live
   game uses Realtime channels and needs no tables.
4. Restart `npm run dev`. The lobby will say "Live multiplayer via Supabase realtime."

## Pixel art (OpenAI)

The app ships with a placeholder `public/art/overworld.svg`. To generate nicer AI pixel art:

1. Put `OPENAI_API_KEY=sk-...` in `.env.local` (server-side only, never shipped to the browser).
2. `npm run gen:art` → writes PNGs to `public/art/`.
3. Swap `overworld.svg` for `overworld.png` in `src/screens/MapScreen.tsx`.

## Stack

Vite + React + TypeScript · Supabase (realtime presence + broadcast) · OpenAI image API
(build-time art) · pixel everything.

## How multiplayer works

- Each landmark click creates a **room** with a 4-letter code + share link.
- Players join via the link; **presence** drives the live player list.
- Game state (karaoke rounds, ratings, taps) is sent over **broadcast** events.
- Scores live on each player's presence record — every client owns its own score, so there's
  no central server to break on stage.
