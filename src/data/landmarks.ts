import type { Landmark } from "../lib/types";

// Positions are percentages over public/art/overworld.svg.
// Tweak x/y to line hotspots up with the generated art.
export const LANDMARKS: Landmark[] = [
  {
    key: "yntymak",
    name: "Park Yntymak",
    nameRu: "Парк Ынтымак",
    game: "karaoke",
    blurb: "Karaoke battle — one sings, everyone rates.",
    x: 30,
    y: 58,
    emoji: "🎤",
    status: "live",
  },
  {
    key: "ala-archa",
    name: "Ala-Archa Mountains",
    nameRu: "Ала-Арча",
    game: "drive",
    blurb: "Mini-drive down the mountain road. Dodge everything.",
    x: 68,
    y: 22,
    emoji: "🚗",
    status: "live",
  },
  {
    key: "cosmopark",
    name: "Cosmopark",
    nameRu: "Космопарк",
    game: "cosmopark",
    blurb: "Tap Brawl — mash to win, most taps takes the crown.",
    x: 74,
    y: 66,
    emoji: "🎮",
    status: "live",
  },
  {
    key: "ala-too",
    name: "Ala-Too Square",
    nameRu: "Ала-Тоо",
    game: "cosmopark",
    blurb: "City center fountains. More games soon.",
    x: 48,
    y: 46,
    emoji: "⛲",
    status: "soon",
  },
];

export function landmarkByKey(key: string): Landmark | undefined {
  return LANDMARKS.find((l) => l.key === key);
}
