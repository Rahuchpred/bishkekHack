import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured =
  !!url && !!anon && !url.includes("YOUR-PROJECT") && !anon.includes("YOUR-ANON");

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anon!, { realtime: { params: { eventsPerSecond: 20 } } })
  : null;
