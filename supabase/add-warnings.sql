-- Upgrade: community warnings on apps (2026-07-10).
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
--
-- Warnings are deliberately PRIVATE: there is no select policy, so nothing on
-- the site can display them. The curator reads them with the secret key (the
-- notifier emails each one immediately and opens an app-warning GitHub issue)
-- and acts from a safe machine: remove the listing, or dismiss by setting
-- processed = true in the dashboard.

create table public.warnings (
  app_slug   text        not null,
  device_id  uuid        not null,
  created_at timestamptz not null default now(),
  -- what kind of problem (checkboxes in the report form)
  reasons    text[]      not null default '{}',
  -- commentary is required: friction deters drive-by malicious flags
  comment    text        not null check (char_length(comment) between 10 and 500),
  processed  boolean     not null default false,
  primary key (app_slug, device_id) -- one warning per device per app
);

alter table public.warnings enable row level security;

-- Anyone may file a warning; the primary key blocks duplicates. No select,
-- update, or delete for anon: warnings are write-only from the site.
create policy "anon can warn"
  on public.warnings for insert to anon
  with check (true);

-- Aggregate-only view driving immediate suspension: any app with an
-- unprocessed warning is suspended (listing rows hidden, Open button
-- replaced by a "pending review" notice) until the curator sets
-- processed = true (or deletes the row) — no site rebuild needed either way.
-- Exposes only slugs and counts; never comments or device ids.
create view public.suspended_apps as
  select app_slug, count(*)::int as open_warnings
  from public.warnings
  where processed = false
  group by app_slug;

grant select on public.suspended_apps to anon;
