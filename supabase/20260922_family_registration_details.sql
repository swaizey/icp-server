-- Add household phone numbers and preserve family selections on pending registrations.

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

alter table public.families
  add column if not exists father_phone text not null default '',
  add column if not exists mother_phone text not null default '',
  add column if not exists children_count integer not null default 0 check (children_count >= 0),
  add column if not exists grandchildren_count integer not null default 0 check (grandchildren_count >= 0),
  add column if not exists deceased_loved_ones_count integer not null default 0 check (deceased_loved_ones_count >= 0);

alter table public.registration_requests
  add column if not exists family_id uuid references public.families(id) on delete set null,
  add column if not exists father_phone text not null default '',
  add column if not exists mother_phone text not null default '',
  add column if not exists family_phone text not null default '',
  add column if not exists children_count integer,
  add column if not exists grandchildren_count integer,
  add column if not exists deceased_loved_ones_count integer;

create index if not exists families_family_name_idx on public.families(family_name);
create index if not exists families_father_phone_idx on public.families(father_phone);
create index if not exists families_mother_phone_idx on public.families(mother_phone);

alter table public.families enable row level security;
drop policy if exists "active staff read families" on public.families;
create policy "active staff read families" on public.families
for select to authenticated using (public.has_permission('members.read'));
drop policy if exists "authorized staff write families" on public.families;
create policy "authorized staff write families" on public.families
for all to authenticated
using (public.has_permission('members.write'))
with check (public.has_permission('members.write'));

create or replace function public.assign_member_family() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  resolved_family_id uuid;
  identity_value text;
begin
  if new.family_id is not null then
    return new;
  end if;

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