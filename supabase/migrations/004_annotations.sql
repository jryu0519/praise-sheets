-- Annotations: one row per finished pen stroke drawn on a chart page.
-- `points` is a normalized [[x,y], ...] path with each coordinate in 0..1,
-- relative to the page's width/height — this keeps strokes aligned with the
-- PDF regardless of zoom level or screen size.
create table annotations (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references charts (id) on delete cascade,
  page_number integer not null,
  visibility text not null check (visibility in ('shared', 'personal')),
  points jsonb not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
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
