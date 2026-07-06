-- PWA Finder community voting schema.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table public.votes (
  app_slug   text        not null,
  device_id  uuid        not null,
  created_at timestamptz not null default now(),
  primary key (app_slug, device_id) -- one vote per device per app
);

alter table public.votes enable row level security;

-- Anyone may cast a vote; the primary key blocks duplicates.
create policy "anon can vote"
  on public.votes for insert to anon
  with check (true);

-- A device may withdraw a vote. There is deliberately NO select policy on
-- this table: device ids stay unlistable, so a vote can only be deleted by
-- the device that knows its own random id.
create policy "anon can unvote"
  on public.votes for delete to anon
  using (true);

-- Public, aggregate-only view for displaying counts (no device ids exposed).
create view public.vote_counts as
  select app_slug, count(*)::int as votes
  from public.votes
  group by app_slug;

grant select on public.vote_counts to anon;
