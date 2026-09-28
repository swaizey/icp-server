create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  leader_name text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now()
);

alter table public.groups enable row level security;

drop policy if exists "authorized staff read groups" on public.groups;
drop policy if exists "authorized admins write groups" on public.groups;
create policy "authorized staff read groups" on public.groups for select to authenticated using (public.has_permission('groups.read'));
create policy "authorized admins write groups" on public.groups for all to authenticated using (public.has_permission('groups.write')) with check (public.has_permission('groups.write'));

insert into public.role_permissions (role, permission_key)
values ('Administrator', 'groups.write')
on conflict do nothing;
-- Compatibility migration: deployed projects created groups before subgroups existed.
alter table public.groups add column if not exists subgroup text not null default '';

alter table public.groups drop constraint if exists groups_name_key;
alter table public.groups drop constraint if exists groups_name_subgroup_key;
alter table public.groups add constraint groups_name_subgroup_key unique (name, subgroup);