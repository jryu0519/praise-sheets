-- Lets a host archive (hide, reversible) or permanently delete a chart.
-- Uploading stays open to hosts and editors, but archiving/deleting is
-- host-only — enforced here at the RLS level, not just hidden in the UI.
alter table charts add column archived boolean not null default false;

drop policy "hosts and editors can manage charts" on charts;

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

drop policy "hosts and editors can delete chart files" on storage.objects;

create policy "hosts can delete chart files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'charts' and public.is_host());
