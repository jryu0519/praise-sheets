-- Optional artist/subtitle line for each chart, and a host-only "ready for
-- this week" flag shown as a checkmark in the song list. Update permission
-- for `ready_for_week` reuses the existing host-only update policy on
-- charts from migration 007 — no new RLS needed.
alter table charts add column artist text;
alter table charts add column ready_for_week boolean not null default false;
