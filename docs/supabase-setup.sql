-- Photo Gallery SDK — Supabase setup.
-- Run ONCE in your Supabase project: Dashboard → SQL Editor → New query → paste → Run.
-- Creates the metadata tables + permissive demo RLS policies + anon upload policy for the
-- public `media` storage bucket. NOTE: these policies are open (no auth) for the demo —
-- add Supabase Auth and tighten the policies (e.g. `auth.uid()`) before production.

create table if not exists public.gallery_media (
  id text primary key,
  data jsonb not null,
  taken_at bigint,
  deleted_at bigint,
  updated_at timestamptz not null default now()
);
create table if not exists public.gallery_albums (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.gallery_people (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.gallery_media  enable row level security;
alter table public.gallery_albums  enable row level security;
alter table public.gallery_people  enable row level security;

-- Demo policies: allow the anon role full access. Replace with auth-scoped policies for production.
drop policy if exists "demo_all" on public.gallery_media;
drop policy if exists "demo_all" on public.gallery_albums;
drop policy if exists "demo_all" on public.gallery_people;
create policy "demo_all" on public.gallery_media  for all to anon using (true) with check (true);
create policy "demo_all" on public.gallery_albums  for all to anon using (true) with check (true);
create policy "demo_all" on public.gallery_people  for all to anon using (true) with check (true);

-- Storage: CREATE the public `media` bucket (this is the linchpin — without it every
-- upload fails and images fall back to non-durable blob:/data: URLs). Public = reads
-- work via getPublicUrl. Re-running is safe (idempotent) and re-asserts public + limits.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true, 209715200,
  array['image/jpeg','image/png','image/gif','image/webp','image/avif','image/bmp','image/tiff',
        'video/mp4','video/quicktime','video/webm','video/x-matroska','video/3gpp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Allow anon to read/upload/update objects in the `media` bucket.
drop policy if exists "media_read"   on storage.objects;
drop policy if exists "media_insert" on storage.objects;
drop policy if exists "media_update" on storage.objects;
create policy "media_read"   on storage.objects for select to anon using (bucket_id = 'media');
create policy "media_insert" on storage.objects for insert to anon with check (bucket_id = 'media');
create policy "media_update" on storage.objects for update to anon using (bucket_id = 'media') with check (bucket_id = 'media');
