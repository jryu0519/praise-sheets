-- Personal alternate parts: any signed-in member can upload their own extra
-- PDF for a song (e.g. a pianist's own piano part), private to them. Kept
-- entirely separate from `charts` — no annotations/sections/pings on these,
-- they're pure reference pages appended after the main chart's own pages
-- when that user views it. A dedicated bucket (not the shared 'charts'
-- bucket) keeps the privacy story simple: ownership is just the storage
-- path's leading folder, no need to carve exceptions into the existing
-- host/editor-oriented chart file policies.
create table chart_personal_parts (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references charts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (chart_id, user_id)
);

alter table chart_personal_parts enable row level security;

create policy "users can manage their own personal parts"
  on chart_personal_parts for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('personal_parts', 'personal_parts', false);

-- Ownership is the file path's leading folder: `${userId}/${filename}`.
create policy "users can manage their own personal part files"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'personal_parts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'personal_parts' and (storage.foldername(name))[1] = auth.uid()::text);
