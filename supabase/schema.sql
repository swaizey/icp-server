create extension if not exists pgcrypto;
create extension if not exists citext;

create sequence if not exists public.member_number_seq start 1240;

create type public.role_name as enum ('Administrator', 'Manager', 'Staff');
create type public.member_status as enum ('Active', 'Inactive');
create type public.registration_status as enum ('pending', 'approved', 'rejected');

create table public.roles (
  name text primary key,
  description text not null default '',
  created_at timestamptz not null default now()
);
insert into public.roles (name, description) values
  ('Administrator', 'Full access to all features and settings.'),
  ('Manager', 'Moderate access for operations and review tasks.'),
  ('Staff', 'Limited access for day-to-day tasks.')
on conflict (name) do nothing;

create table public.role_permissions (
  role text not null references public.roles(name) on update cascade on delete cascade,
  permission_key text not null,
  primary key (role, permission_key)
);
insert into public.role_permissions (role, permission_key)
select 'Administrator', permission_key from unnest(array[
  'dashboard.read','members.read','members.write','members.delete','schedule.read','schedule.write','sacraments.read','groups.read','groups.write','events.write','reports.read','reports.write','finance.read','users.read','users.write','settings.write'
]) as permissions(permission_key)
on conflict do nothing;
insert into public.role_permissions (role, permission_key)
select 'Manager', permission_key from unnest(array[
  'dashboard.read','members.read','members.write','schedule.read','schedule.write','sacraments.read','groups.read','events.write','reports.read','finance.read','users.read'
]) as permissions(permission_key)
on conflict do nothing;
insert into public.role_permissions (role, permission_key)
select 'Staff', permission_key from unnest(array[
  'dashboard.read','members.read','schedule.read','sacraments.read','groups.read','reports.read'
]) as permissions(permission_key)
on conflict do nothing;

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null unique,
  role text not null references public.roles(name),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  middle_name text not null default '',
  surname text not null,
  gender text not null check (gender in ('female','male','prefer-not-to-say')),
  group_name text,
  sacrament_received text[] not null default '{}',
  family_name text not null,
  mother_name text not null default '',
  father_name text not null default '',
  house_address text not null,
  email citext not null,
  phone text not null,
  occupation text not null default '',
  image_key text,
  image_url text,
  status registration_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  member_id text not null unique default ('CP' || lpad(nextval('member_number_seq')::text, 6, '0')),
  first_name text not null,
  middle_name text not null default '',
  surname text not null,
  member_type text not null default 'Adult' check (member_type in ('Adult','Youth','Senior Citizen')),
  gender text not null check (gender in ('female','male','prefer-not-to-say')),
  family_name text not null,
  mother_name text not null default '',
  father_name text not null default '',
  house_address text not null,
  email citext not null unique,
  phone text not null,
  occupation text not null default '',
  group_name text,
  status member_status not null default 'Active',
  image_key text,
  image_url text,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.member_sacraments (
  member_id uuid not null references public.members(id) on delete cascade,
  sacrament_id text not null check (sacrament_id in ('baptism','first-communion','confirmation','marriage')),
  received_at timestamptz not null default now(),
  primary key (member_id, sacrament_id)
);

create table public.masses (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  title text not null,
  description text not null default '',
  location text not null,
  is_recurring boolean not null default false,
  is_cancelled boolean not null default false,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now()
);
create table public.parish_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null,
  tag text not null,
  description text not null default '',
  is_cancelled boolean not null default false,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now()
);

create table public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  format text not null default 'PDF',
  object_key text,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subgroup text not null default '',
  unique (name, subgroup),
  description text not null default '',
  leader_name text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now()
);

insert into public.groups (name, description, leader_name, is_active)
values
  ('Choir', 'Parish choir ministry', '', true),
  ('Lectors', 'Lectors and proclamation ministry', '', true),
  ('CYON', 'Youth ministry group', '', true),
  ('Legion of Mary', 'Parish Legion of Mary ministry', '', true),
  ('CMO', 'Catholic Men''s Organisation', '', true),
  ('CWO', 'Catholic Women''s Organisation', '', true),
  ('St. Vincent de Paul', 'Charity and outreach ministry', '', true),
  ('Sacred Heart', 'Devotion and prayer ministry', '', true),
  ('Altar Boys', 'Altar serving ministry', '', true),
  ('7am Mass Choir (St. Cecilia Choir)', 'Choir for the 7am Mass', '', true),
  ('9am Mass Choir (St. Gregory Choir)', 'Choir for the 9am Mass', '', true),
  ('Legion of Mary - Presidium 1', 'First Legion of Mary presidium', '', true),
  ('Legion of Mary - Presidium 2', 'Second Legion of Mary presidium', '', true),
  ('Legion of Mary - Presidium 3', 'Third Legion of Mary presidium', '', true)
on conflict (name) do nothing;

create or replace view public.dashboard_overview with (security_invoker = true) as
select
  (select count(*)::int from public.members where status = 'Active') as total_members,
  (select count(distinct family_name)::int from public.members where status = 'Active') as active_families,
  (select count(*) filter (where gender = 'male')::int from public.members where status = 'Active') as male_members,
  (select count(*) filter (where gender = 'female')::int from public.members where status = 'Active') as female_members,
  (select count(*)::int from public.parish_events where starts_at >= now() and starts_at < now() + interval '7 days' and is_cancelled = false) as upcoming_events;

create or replace view public.sacrament_summary with (security_invoker = true) as
select sacrament_id, count(*)::int as total from public.member_sacraments group by sacrament_id;
create or replace view public.sacrament_breakdown with (security_invoker = true) as
select sacrament_id, count(*)::int as total, count(*) filter (where received_at >= date_trunc('month', now()))::int as this_month, count(*) filter (where received_at >= date_trunc('month', now() - interval '1 month') and received_at < date_trunc('month', now()))::int as last_month from public.member_sacraments group by sacrament_id;
create or replace view public.group_summary with (security_invoker = true) as
select group_name, count(*)::int as member_count from public.members where group_name is not null and status = 'Active' group by group_name;
create or replace view public.minister_summary with (security_invoker = true) as
select group_name as ministry, count(*)::int as count from public.members where group_name is not null and status = 'Active' group by group_name;
create or replace view public.report_summary with (security_invoker = true) as
select count(*)::int as total_members, count(*) filter (where status = 'Active')::int as active_members, count(*) filter (where joined_at >= date_trunc('year', now()))::int as new_members from public.members;
create or replace view public.membership_trend with (security_invoker = true) as
select date_trunc('month', joined_at)::date as month, count(*)::int as new_members, count(*) over (order by date_trunc('month', joined_at))::int as total_members from public.members group by date_trunc('month', joined_at) order by month;

alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.app_users enable row level security;
alter table public.members enable row level security;
alter table public.member_sacraments enable row level security;
alter table public.masses enable row level security;
alter table public.parish_events enable row level security;
alter table public.generated_reports enable row level security;
alter table public.registration_requests enable row level security;
alter table public.groups enable row level security;

create or replace function public.current_app_user() returns public.app_users language sql stable security definer set search_path = public as $$ select * from public.app_users where auth_user_id = auth.uid() and is_active = true limit 1 $$;
create or replace function public.has_permission(permission text) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.current_app_user() u join public.role_permissions p on p.role = u.role where p.permission_key = permission) $$;
revoke all on function public.current_app_user() from public;
revoke all on function public.has_permission(text) from public;
grant execute on function public.current_app_user() to authenticated;
grant execute on function public.has_permission(text) to authenticated;

create policy "active staff read members" on public.members for select to authenticated using (public.has_permission('members.read'));
create policy "authorized staff write members" on public.members for all to authenticated using (public.has_permission('members.write')) with check (public.has_permission('members.write'));
create policy "authorized staff read schedule" on public.masses for select to authenticated using (public.has_permission('schedule.read'));
create policy "authorized staff write schedule" on public.masses for all to authenticated using (public.has_permission('schedule.write')) with check (public.has_permission('schedule.write'));
create policy "authorized staff read events" on public.parish_events for select to authenticated using (public.has_permission('schedule.read'));
create policy "authorized staff write events" on public.parish_events for all to authenticated using (public.has_permission('events.write')) with check (public.has_permission('events.write'));
create policy "authorized staff read sacraments" on public.member_sacraments for select to authenticated using (public.has_permission('sacraments.read'));
create policy "authorized staff read roles" on public.roles for select to authenticated using (public.has_permission('users.read'));
create policy "authorized admins write roles" on public.roles for all to authenticated using (public.has_permission('users.write')) with check (public.has_permission('users.write'));
create policy "authorized staff read reports" on public.generated_reports for select to authenticated using (public.has_permission('reports.read'));
create policy "authorized staff read groups" on public.groups for select to authenticated using (public.has_permission('groups.read'));
create policy "authorized admins write groups" on public.groups for all to authenticated using (public.has_permission('groups.write')) with check (public.has_permission('groups.write'));
create policy "public can submit registration" on public.registration_requests for insert to anon, authenticated with check (status = 'pending');
create policy "admins read registration" on public.registration_requests for select to authenticated using (public.has_permission('members.write'));
create policy "admins update registration" on public.registration_requests for update to authenticated using (public.has_permission('members.write')) with check (public.has_permission('members.write'));

revoke all on public.dashboard_overview from anon, authenticated;
revoke all on public.sacrament_summary from anon, authenticated;
revoke all on public.sacrament_breakdown from anon, authenticated;
revoke all on public.group_summary from anon, authenticated;
revoke all on public.minister_summary from anon, authenticated;
revoke all on public.report_summary from anon, authenticated;
revoke all on public.membership_trend from anon, authenticated;

grant select on public.dashboard_overview to authenticated;
grant select on public.sacrament_summary to authenticated;
grant select on public.sacrament_breakdown to authenticated;
grant select on public.group_summary to authenticated;
grant select on public.minister_summary to authenticated;
grant select on public.report_summary to authenticated;
grant select on public.membership_trend to authenticated;


alter table public.groups add column if not exists subgroup text not null default '';

alter table public.groups drop constraint if exists groups_name_key;
alter table public.groups drop constraint if exists groups_name_subgroup_key;
alter table public.groups add constraint groups_name_subgroup_key unique (name, subgroup);


-- Family normalization for new installations.
-- Apply this migration to an existing Supabase project after the bootstrap schema.
-- It creates normalized families and backfills existing member records.

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  family_name text not null,
  father_name text not null default '',
  mother_name text not null default '',
  family_identity text not null unique,
  member_count integer not null default 0 check (member_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.members
  add column if not exists family_id uuid references public.families(id) on delete restrict;
create index if not exists members_family_id_idx on public.members(family_id);

create or replace function public.assign_member_family() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  resolved_family_id uuid;
  identity_value text;
begin
  if btrim(new.family_name) = '' then
    raise exception 'A family name is required';
  end if;

  identity_value := regexp_replace(lower(btrim(new.family_name)), '\s+', ' ', 'g') || chr(31) ||
    regexp_replace(lower(btrim(coalesce(new.father_name, ''))), '\s+', ' ', 'g') || chr(31) ||
    regexp_replace(lower(btrim(coalesce(new.mother_name, ''))), '\s+', ' ', 'g');

  insert into public.families (family_name, father_name, mother_name, family_identity)
  values (btrim(new.family_name), btrim(coalesce(new.father_name, '')), btrim(coalesce(new.mother_name, '')), identity_value)
  on conflict (family_identity) do update set family_identity = excluded.family_identity
  returning id into resolved_family_id;

  new.family_id := resolved_family_id;
  return new;
end;
$$;

create or replace function public.update_family_member_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.families set member_count = member_count + 1, updated_at = now() where id = new.family_id;
  elsif tg_op = 'DELETE' then
    update public.families set member_count = greatest(member_count - 1, 0), updated_at = now() where id = old.family_id;
  elsif new.family_id is distinct from old.family_id then
    update public.families
    set member_count = greatest(member_count + case when id = new.family_id then 1 else -1 end, 0), updated_at = now()
    where id in (old.family_id, new.family_id);
  end if;
  return null;
end;
$$;

drop trigger if exists assign_member_family on public.members;
create trigger assign_member_family
before insert or update of family_name, father_name, mother_name, family_id on public.members
for each row execute function public.assign_member_family();

drop trigger if exists update_family_member_count on public.members;
create trigger update_family_member_count
after insert or update of family_id or delete on public.members
for each row execute function public.update_family_member_count();

update public.members set family_id = null where family_id is null;

alter table public.families enable row level security;
drop policy if exists "active staff read families" on public.families;
create policy "active staff read families" on public.families for select to authenticated using (public.has_permission('members.read'));
drop policy if exists "authorized staff write families" on public.families;
create policy "authorized staff write families" on public.families for all to authenticated using (public.has_permission('members.write')) with check (public.has_permission('members.write'));

create or replace view public.dashboard_overview with (security_invoker = true) as
select
  (select count(*)::int from public.members where status = 'Active') as total_members,
  (select count(distinct family_id)::int from public.members where status = 'Active') as active_families,
  (select count(*) filter (where gender = 'male')::int from public.members where status = 'Active') as male_members,
  (select count(*) filter (where gender = 'female')::int from public.members where status = 'Active') as female_members,
  (select count(*)::int from public.parish_events where starts_at >= now() and starts_at < now() + interval '7 days' and is_cancelled = false) as upcoming_events;

revoke all on function public.assign_member_family() from public;
revoke all on function public.update_family_member_count() from public;