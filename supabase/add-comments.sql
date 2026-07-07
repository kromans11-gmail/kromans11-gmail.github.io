-- Upgrade: optional public comment attached to a vote (2026-07-07).
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- (Fresh installs get all of this from setup.sql; this file is only for
-- upgrading a database created before comments existed.)

alter table public.votes
  add column comment text check (char_length(comment) <= 500);

-- Public, read-only view of comments. Like vote_counts it deliberately
-- exposes no device ids.
create view public.app_comments as
  select app_slug, comment, created_at
  from public.votes
  where comment is not null and length(trim(comment)) > 0;

grant select on public.app_comments to anon;
