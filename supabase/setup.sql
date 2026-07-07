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

-- There is deliberately NO select policy on this table: device ids stay
-- unlistable. That also means a direct DELETE can never match rows, so vote
-- withdrawal goes through a security-definer function that deletes only the
-- exact (app, device) pair it is given.
create or replace function public.unvote(p_app_slug text, p_device_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.votes
  where app_slug = p_app_slug and device_id = p_device_id;
$$;

revoke all on function public.unvote(text, uuid) from public;
grant execute on function public.unvote(text, uuid) to anon;

-- Public, aggregate-only view for displaying counts (no device ids exposed).
create view public.vote_counts as
  select app_slug, count(*)::int as votes
  from public.votes
  group by app_slug;

grant select on public.vote_counts to anon;
