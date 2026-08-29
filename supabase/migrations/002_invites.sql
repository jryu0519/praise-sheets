alter table memberships add column email text;

update memberships
set email = auth.users.email
from auth.users
where memberships.user_id = auth.users.id;

alter table memberships alter column email set not null;

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

create or replace function public.handle_new_user()
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
