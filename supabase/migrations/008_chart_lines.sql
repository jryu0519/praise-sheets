-- Manually-marked line/staff boundaries per chart page. Automatic
-- text-based detection doesn't work on charts whose musical content
-- (chords, lyrics, measure numbers) is rendered as vector shapes or
-- custom-font glyphs rather than extractable text — common with sheet
-- music exported from notation software. A host/editor marks each line's
-- start position once; `y_position` is normalized 0..1 down the page,
-- matching the annotation coordinate system.
create table chart_lines (
  id uuid primary key default gen_random_uuid(),
  chart_id uuid not null references charts (id) on delete cascade,
  page_number integer not null,
  y_position numeric not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table chart_lines enable row level security;

create policy "chart_lines are readable by any signed-in user"
  on chart_lines for select
  to authenticated
  using (true);

create policy "hosts and editors can manage chart_lines"
  on chart_lines for all
  to authenticated
  using (public.is_host_or_editor())
  with check (public.is_host_or_editor());
