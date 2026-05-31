import type { Landmark } from "../lib/types";

// Positions are percentages over public/art/overworld.png (16:9 Bishkek map).
// (0,0) is the top-left of the image. Tweak x/y to fine-tune hotspot alignment.
export const LANDMARKS: Landmark[] = [
  {
    key: "yntymak",
    name: "Park Yntymak",
    nameRu: "Парк Ынтымак",
    game: "karaoke",
    blurb: "Karaoke battle — one sings, everyone rates.",
    // Top-center, just above Chuy Avenue.
    x: 49,
    y: 26,
    emoji: "🎤",
    status: "live",
  },
  {
    key: "ala-archa",
    name: "Ala-Archa Mountains",
    nameRu: "Ала-Арча",
    game: "drive",
    blurb: "Mini-drive down the mountain road. Dodge everything.",
    // Snow-capped Ala-Archa / Tien Shan range across the top edge (left of the title).
    x: 26,
    y: 11,
    emoji: "🚗",
    status: "live",
  },
  {
    key: "cosmopark",
    name: "Cosmopark",
    nameRu: "Космопарк",
    game: "cosmopark",
    blurb: "Tap Brawl — mash to win, most taps takes the crown.",
    // Amusement park (ferris wheel) on the left outskirts.
    x: 12,
    y: 43,
    emoji: "🎮",
    status: "live",
  },
  {
    key: "ala-too",
    name: "Ala-Too Square",
    nameRu: "Ала-Тоо",
    game: "cosmopark",
    blurb: "City center fountains. More games soon.",
    // Dead center — the main square with the flagpole.
    x: 49,
    y: 49,
    emoji: "⛲",
    status: "soon",
  },
];

export function landmarkByKey(key: string): Landmark | undefined {
  return LANDMARKS.find((l) => l.key === key);
}
