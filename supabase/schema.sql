-- Shared German word image library
-- Run once in Supabase → SQL Editor.
-- Survives Netlify / code deploys; only deleted if you drop the table.

create table if not exists public.german_word_images (
  word text primary key,               -- German headword (case-sensitive as stored)
  url text,                            -- https URL, or null = force "no picture"
  article text default '',             -- der / die / das / ''
  meaning text default '',
  note text default '',                -- optional editor note
  updated_at timestamptz not null default now(),
  updated_by text default 'anon'       -- optional nickname later
);

create index if not exists german_word_images_updated_at_idx
  on public.german_word_images (updated_at desc);

-- Keep updated_at fresh on every write
create or replace function public.set_german_word_images_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists german_word_images_set_updated_at on public.german_word_images;
create trigger german_word_images_set_updated_at
  before update on public.german_word_images
  for each row execute function public.set_german_word_images_updated_at();

-- Public collaborative library (educational app).
-- Anyone with the anon key can read/write. Tighten later if you add auth.
alter table public.german_word_images enable row level security;

drop policy if exists "Anyone can read word images" on public.german_word_images;
create policy "Anyone can read word images"
  on public.german_word_images for select
  using (true);

drop policy if exists "Anyone can insert word images" on public.german_word_images;
create policy "Anyone can insert word images"
  on public.german_word_images for insert
  with check (true);

drop policy if exists "Anyone can update word images" on public.german_word_images;
create policy "Anyone can update word images"
  on public.german_word_images for update
  using (true)
  with check (true);

drop policy if exists "Anyone can delete word images" on public.german_word_images;
create policy "Anyone can delete word images"
  on public.german_word_images for delete
  using (true);

-- Optional: seed from your app later via upsert; no seed required here.

-- ---------------------------------------------------------------------------
-- Shared readings (multi-user library of German passages)
-- ---------------------------------------------------------------------------
create table if not exists public.german_shared_readings (
  id text primary key,
  title text not null,
  description text default '',
  text text not null,
  level int default 0,
  source text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text default 'anon'
);

create index if not exists german_shared_readings_level_idx
  on public.german_shared_readings (level);
create index if not exists german_shared_readings_updated_at_idx
  on public.german_shared_readings (updated_at desc);

alter table public.german_shared_readings enable row level security;

drop policy if exists "Anyone can read shared readings" on public.german_shared_readings;
create policy "Anyone can read shared readings"
  on public.german_shared_readings for select using (true);

drop policy if exists "Anyone can insert shared readings" on public.german_shared_readings;
create policy "Anyone can insert shared readings"
  on public.german_shared_readings for insert with check (true);

drop policy if exists "Anyone can update shared readings" on public.german_shared_readings;
create policy "Anyone can update shared readings"
  on public.german_shared_readings for update using (true) with check (true);

drop policy if exists "Anyone can delete shared readings" on public.german_shared_readings;
create policy "Anyone can delete shared readings"
  on public.german_shared_readings for delete using (true);

-- ---------------------------------------------------------------------------
-- Shared word sets (lists extracted from readings, for multi-user practice)
-- ---------------------------------------------------------------------------
create table if not exists public.german_shared_word_sets (
  id text primary key,
  name text not null,
  reading_id text default '',
  reading_title text default '',
  words jsonb not null default '[]'::jsonb,
  level int default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text default 'anon'
);

create index if not exists german_shared_word_sets_updated_at_idx
  on public.german_shared_word_sets (updated_at desc);

alter table public.german_shared_word_sets enable row level security;

drop policy if exists "Anyone can read shared word sets" on public.german_shared_word_sets;
create policy "Anyone can read shared word sets"
  on public.german_shared_word_sets for select using (true);

drop policy if exists "Anyone can insert shared word sets" on public.german_shared_word_sets;
create policy "Anyone can insert shared word sets"
  on public.german_shared_word_sets for insert with check (true);

drop policy if exists "Anyone can update shared word sets" on public.german_shared_word_sets;
create policy "Anyone can update shared word sets"
  on public.german_shared_word_sets for update using (true) with check (true);

drop policy if exists "Anyone can delete shared word sets" on public.german_shared_word_sets;
create policy "Anyone can delete shared word sets"
  on public.german_shared_word_sets for delete using (true);
