-- Replaces chart_lines (single tap-marked line-starts) with chart_sections
-- (drag-selected rectangular regions, like a screenshot tool) — a more
-- precise, visually-checkable way for a host/editor to define the pingable
-- regions of a chart page. Never went live successfully as chart_lines, so
-- it's dropped outright rather than migrated.
drop table if exists chart_lines;

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
