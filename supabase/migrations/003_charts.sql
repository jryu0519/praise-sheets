-- Extends is_host() to also allow editors. Charts/sessions can be managed by
-- hosts and editors alike; only plain members are read-only.
create function public.is_host_or_editor()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid() and role in ('host', 'editor')
  );
$$;

-- Private bucket for chart PDFs. Not public — access goes through the
-- storage.objects policies below, same as every other table here.
insert into storage.buckets (id, name, public)
values ('charts', 'charts', false);

-- Charts: one row per uploaded PDF chart. storage_path points at the file
-- inside the 'charts' bucket.
create table charts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  musical_key text,
  storage_path text not null,
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table charts enable row level security;

create policy "charts are readable by any signed-in user"
  on charts for select
  to authenticated
  using (true);

create policy "hosts and editors can manage charts"
  on charts for all
  to authenticated
  using (public.is_host_or_editor())
  with check (public.is_host_or_editor());

-- Sessions: a setlist for a particular gathering.
create table sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table sessions enable row level security;

create policy "sessions are readable by any signed-in user"
  on sessions for select
  to authenticated
  using (true);

create policy "hosts and editors can manage sessions"
  on sessions for all
  to authenticated
  using (public.is_host_or_editor())
  with check (public.is_host_or_editor());

-- Session_charts: ordered join between a session and its charts.
create table session_charts (
  session_id uuid not null references sessions (id) on delete cascade,
  chart_id uuid not null references charts (id) on delete cascade,
  position integer not null,
  primary key (session_id, chart_id)
);

alter table session_charts enable row level security;

create policy "session_charts are readable by any signed-in user"
  on session_charts for select
  to authenticated
  using (true);

create policy "hosts and editors can manage session_charts"
  on session_charts for all
  to authenticated
  using (public.is_host_or_editor())
  with check (public.is_host_or_editor());

-- Storage policies: any signed-in user can read chart files; only
-- hosts/editors can upload, replace, or delete them.
create policy "chart files are readable by any signed-in user"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'charts');

create policy "hosts and editors can upload chart files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'charts' and public.is_host_or_editor());

create policy "hosts and editors can update chart files"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'charts' and public.is_host_or_editor())
  with check (bucket_id = 'charts' and public.is_host_or_editor());

create policy "hosts and editors can delete chart files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'charts' and public.is_host_or_editor());
