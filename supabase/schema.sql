-- Memberships: one row per team member, tied to their auth.users account.
-- Single-team app, so no separate `teams` table. Email is denormalized here
-- because the client API can't read the `auth.users` table directly.
create table memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null check (role in ('host', 'editor', 'member')),
  created_at timestamptz not null default now()
);

alter table memberships enable row level security;

-- Checks the caller's role while bypassing RLS internally (security definer).
-- Needed because a policy on `memberships` can't query `memberships` itself
-- without triggering infinite recursion of that same policy.
create function public.is_host()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships where user_id = auth.uid() and role = 'host'
  );
$$;

-- Everyone signed in can see the team roster.
create policy "memberships are readable by any signed-in user"
  on memberships for select
  to authenticated
  using (true);

-- Only a host can change roles (insert/update/delete) for other people.
create policy "hosts can manage memberships"
  on memberships for all
  to authenticated
  using (public.is_host())
  with check (public.is_host());

-- Invites: a host pre-assigns a role to an email address before that person
-- ever signs in. When they eventually sign in with Google, the trigger below
-- looks up their email here instead of defaulting them to 'member'.
create table invites (
  email text primary key,
  role text not null check (role in ('editor', 'member')),
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table invites enable row level security;

create policy "hosts can manage invites"
  on invites for all
  to authenticated
  using (public.is_host())
  with check (public.is_host());

-- Auto-create a membership row whenever someone signs in for the first time.
-- The very first user ever becomes host. Everyone else gets the role from a
-- matching invite, or 'member' if there isn't one.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  invited_role text;
begin
  if (select count(*) from public.memberships) = 0 then
    insert into public.memberships (user_id, email, role) values (new.id, new.email, 'host');
    return new;
  end if;

  select role into invited_role from public.invites where email = new.email;

  insert into public.memberships (user_id, email, role)
  values (new.id, new.email, coalesce(invited_role, 'member'));

  delete from public.invites where email = new.email;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- One-time backfill for anyone who signed in before this table existed.
-- Earliest account becomes host; everyone else starts as member.
insert into public.memberships (user_id, email, role)
select
  id,
  email,
  case when row_number() over (order by created_at) = 1 then 'host' else 'member' end
from auth.users
on conflict (user_id) do nothing;

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
  artist text,
  musical_key text,
  storage_path text not null,
  archived boolean not null default false,
  ready_for_week boolean not null default false,
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table charts enable row level security;

create policy "charts are readable by any signed-in user"
  on charts for select
  to authenticated
  using (true);

-- Uploading (insert) is open to hosts and editors alike, but archiving and
-- deleting a chart is host-only — a more consequential action than adding
-- one, and restricted at the RLS level, not just hidden in the UI.
create policy "hosts and editors can upload charts"
  on charts for insert
  to authenticated
  with check (public.is_host_or_editor());

create policy "hosts can update charts"
  on charts for update
  to authenticated
  using (public.is_host())
  with check (public.is_host());

create policy "hosts can delete charts"
  on charts for delete
  to authenticated
  using (public.is_host());

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

create policy "hosts can delete chart files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'charts' and public.is_host());

-- Annotations: one row per finished pen stroke or text note on a chart page.
-- `points` is a normalized [[x,y], ...] path (0..1 coordinates, relative to
-- the page's width/height) for a stroke, or a single [[x,y]] anchor point
-- for a text note — this keeps annotations aligned with the PDF regardless
-- of zoom level or screen size.
create table annotations (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references charts (id) on delete cascade,
  page_number integer not null,
  type text not null default 'stroke' check (type in ('stroke', 'text')),
  visibility text not null check (visibility in ('shared', 'personal')),
  points jsonb not null,
  text text,
  color text not null default '#e63946',
  size integer not null default 2,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint text_annotations_have_text check (type <> 'text' or text is not null)
);

alter table annotations enable row level security;

-- Shared strokes are visible to the whole team; personal strokes are only
-- visible to whoever drew them.
create policy "annotations are readable by owner or if shared"
  on annotations for select
  to authenticated
  using (visibility = 'shared' or created_by = auth.uid());

-- Anyone can manage their own strokes, but only hosts/editors may create
-- (or keep) a stroke marked 'shared' — matches who can manage charts.
create policy "users can manage their own annotations"
  on annotations for all
  to authenticated
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and (visibility = 'personal' or public.is_host_or_editor())
  );

-- Broadcast inserts/updates/deletes on this table so PdfViewer can render
-- other people's finished strokes without a page reload.
alter publication supabase_realtime add table annotations;

-- Manually drag-selected rectangular regions per chart page (like a
-- screenshot tool), defining the pingable sections of a chart. Automatic
-- text-based detection doesn't work on charts whose musical content
-- (chords, lyrics, measure numbers) is rendered as vector shapes or
-- custom-font glyphs rather than extractable text — common with sheet
-- music exported from notation software. Coordinates are normalized 0..1,
-- matching the annotation coordinate system.
create table chart_sections (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references charts (id) on delete cascade,
  page_number integer not null,
  x0 numeric not null,
  y0 numeric not null,
  x1 numeric not null,
  y1 numeric not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint chart_sections_valid_box check (x0 < x1 and y0 < y1)
);

alter table chart_sections enable row level security;

create policy "chart_sections are readable by any signed-in user"
  on chart_sections for select
  to authenticated
  using (true);

create policy "hosts and editors can manage chart_sections"
  on chart_sections for all
  to authenticated
  using (public.is_host_or_editor())
  with check (public.is_host_or_editor());
