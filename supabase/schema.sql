-- Pixel Bishkek — optional persistence schema.
-- The live multiplayer uses Supabase Realtime channels (presence + broadcast),
-- which need NO tables. These tables are only if you want to persist rooms,
-- scores, or karaoke ratings beyond a session. Safe to skip for the demo.
--
-- Run in the Supabase SQL editor.

create table if not exists rooms (
  code text primary key,
  location_key text not null,
  host_id text,
  status text not null default 'lobby',
  created_at timestamptz not null default now()
);

create table if not exists scores (
  id bigint generated always as identity primary key,
  room_code text references rooms(code) on delete cascade,
  player_id text not null,
  player_name text not null,
  avatar text,
  game text not null,
  points int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists karaoke_ratings (
  id bigint generated always as identity primary key,
  room_code text references rooms(code) on delete cascade,
  round int not null,
  singer_id text not null,
  rater_id text not null,
  score int not null check (score between 1 and 5),
  created_at timestamptz not null default now()
);

-- Demo-friendly RLS: open read/write. TIGHTEN before any real deployment.
alter table rooms enable row level security;
alter table scores enable row level security;
alter table karaoke_ratings enable row level security;

create policy "demo all rooms" on rooms for all using (true) with check (true);
create policy "demo all scores" on scores for all using (true) with check (true);
create policy "demo all ratings" on karaoke_ratings for all using (true) with check (true);
