import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Vite only exposes VITE_* to the client; also accept common Next.js names from .env.local. */
function readEnv(...keys: string[]): string | undefined {
  const env = import.meta.env as Record<string, string | undefined>;
  for (const key of keys) {
    const v = env[key]?.trim();
    if (v) return v;
  }
  return undefined;
}

const url = readEnv("VITE_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const anon = readEnv(
  "VITE_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY"
);

export const supabaseConfigured =
  !!url &&
  !!anon &&
  !url.includes("YOUR-PROJECT") &&
  !anon.includes("YOUR-ANON") &&
  !anon.includes("YOUR-PUBLISHABLE");

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anon!, { realtime: { params: { eventsPerSecond: 20 } } })
  : null;
