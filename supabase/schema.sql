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
