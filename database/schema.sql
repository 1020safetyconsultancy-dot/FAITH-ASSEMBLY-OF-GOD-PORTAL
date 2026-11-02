-- Faith Assembly of God: run in a NEW Supabase project SQL Editor.
-- Only assign roles to trusted staff. Default access is DENIED.
create extension if not exists pgcrypto;
create table if not exists public.staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('admin','pastor','secretary','attendance','treasurer')),
  created_at timestamptz not null default now()
);
create or replace function public.is_staff(allowed text[])
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists(select 1 from public.staff_roles s
 where s.user_id = (select auth.uid()) and s.role = any(allowed))
$$;
revoke all on function public.is_staff(text[]) from public;
grant execute on function public.is_staff(text[]) to authenticated;
create table if not exists public.members (
 id uuid primary key default gen_random_uuid(),
 full_name text not null,
 member_since date not null default current_date,
 phone text, email text, address text,
 birthday date, baptism_date date, ministry text,
 status text not null default 'active' check(status in ('active','inactive','transferred')),
 consent_recorded boolean not null default false,
 notes text, created_at timestamptz not null default now()
);
create table if not exists public.church_events (
 id uuid primary key default gen_random_uuid(),
 title text not null, event_date date not null,
 event_type text not null default 'Sunday Service',
 created_at timestamptz not null default now()
);
create table if not exists public.attendance (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.church_events(id) on delete restrict,
 member_id uuid not null references public.members(id) on delete restrict,
 checked_in_at timestamptz not null default now(),
 unique(event_id, member_id)
);
create table if not exists public.offerings (
 id uuid primary key default gen_random_uuid(),
 entry_date date not null default current_date,
 member_id uuid references public.members(id) on delete restrict,
 anonymous boolean not null default false,
 category text not null check (category in ('Tithes','General Offering','Missions','Building Fund','Special Offering','Other')),
 amount numeric(14,2) not null check(amount>0),
 payment_method text not null default 'Cash',
 reference_no text, note text,
 recorded_by uuid not null default auth.uid() references auth.users(id),
 voided_at timestamptz, void_reason text,
 created_at timestamptz not null default now(),
 constraint anonymous_member_rule check (not anonymous or member_id is null)
);
create table if not exists public.expenses (
 id uuid primary key default gen_random_uuid(),
 entry_date date not null default current_date,
 category text not null, description text not null,
 payee text, amount numeric(14,2) not null check(amount>0),
 fund text not null default 'General Offering',
 reference_no text,
 recorded_by uuid not null default auth.uid() references auth.users(id),
 voided_at timestamptz, void_reason text,
 created_at timestamptz not null default now()
);
create table if not exists public.finance_audit (
 id bigint generated always as identity primary key,
 table_name text not null, record_id uuid not null,
 old_data jsonb, new_data jsonb, actor uuid default auth.uid(),
 changed_at timestamptz not null default now()
);
create or replace function public.fin_audit_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if tg_op='DELETE' then raise exception 'Financial records cannot be deleted'; end if;
 if tg_op='UPDATE' then
   if old.voided_at is not null then raise exception 'Voided entries cannot be altered'; end if;
   if new.id <> old.id or new.amount <> old.amount or new.entry_date <> old.entry_date then
     raise exception 'Amount and date corrections require voiding and recording a new entry';
   end if;
   if new.voided_at is not null and coalesce(trim(new.void_reason),'') = '' then
     raise exception 'Provide reason for voiding';
   end if;
 end if;
 insert into public.finance_audit(table_name,record_id,old_data,new_data,actor)
 values(tg_table_name,new.id,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid());
 return new;
end $$;
drop trigger if exists offerings_audit on public.offerings;
create trigger offerings_audit before insert or update or delete on public.offerings
for each row execute function public.fin_audit_trigger();
drop trigger if exists expenses_audit on public.expenses;
create trigger expenses_audit before insert or update or delete on public.expenses
for each row execute function public.fin_audit_trigger();
alter table public.staff_roles enable row level security;
alter table public.members enable row level security;
alter table public.church_events enable row level security;
alter table public.attendance enable row level security;
alter table public.offerings enable row level security;
alter table public.expenses enable row level security;
alter table public.finance_audit enable row level security;
create policy staff_self on public.staff_roles for select to authenticated using(user_id = (select auth.uid()) or public.is_staff(array['admin']));
create policy staff_admin_insert on public.staff_roles for insert to authenticated with check(public.is_staff(array['admin']));
create policy staff_admin_update on public.staff_roles for update to authenticated using(public.is_staff(array['admin'])) with check(public.is_staff(array['admin']));
create policy members_read on public.members for select to authenticated using(public.is_staff(array['admin','pastor','secretary','attendance','treasurer']));
create policy members_add on public.members for insert to authenticated with check(public.is_staff(array['admin','secretary']));
create policy members_change on public.members for update to authenticated using(public.is_staff(array['admin','secretary'])) with check(public.is_staff(array['admin','secretary']));
create policy events_read on public.church_events for select to authenticated using(public.is_staff(array['admin','pastor','secretary','attendance','treasurer']));
create policy events_add on public.church_events for insert to authenticated with check(public.is_staff(array['admin','secretary','attendance']));
create policy attendance_read on public.attendance for select to authenticated using(public.is_staff(array['admin','pastor','secretary','attendance']));
create policy attendance_add on public.attendance for insert to authenticated with check(public.is_staff(array['admin','secretary','attendance']));
create policy attendance_remove on public.attendance for delete to authenticated using(public.is_staff(array['admin','secretary','attendance']));
create policy offerings_read on public.offerings for select to authenticated using(public.is_staff(array['admin','treasurer']));
create policy offerings_add on public.offerings for insert to authenticated with check(public.is_staff(array['admin','treasurer']) and recorded_by=(select auth.uid()));
create policy offerings_void on public.offerings for update to authenticated using(public.is_staff(array['admin','treasurer'])) with check(public.is_staff(array['admin','treasurer']));
create policy expenses_read on public.expenses for select to authenticated using(public.is_staff(array['admin','treasurer']));
create policy expenses_add on public.expenses for insert to authenticated with check(public.is_staff(array['admin','treasurer']) and recorded_by=(select auth.uid()));
create policy expenses_void on public.expenses for update to authenticated using(public.is_staff(array['admin','treasurer'])) with check(public.is_staff(array['admin','treasurer']));
create policy audit_read on public.finance_audit for select to authenticated using(public.is_staff(array['admin','treasurer']));
-- Bootstrap: after creating first staff user in Authentication > Users,
-- run this ONE TIME replacing the placeholder UUID with that user's actual UUID:
-- insert into public.staff_roles(user_id,role)
-- values ('00000000-0000-0000-0000-000000000000','admin');
-- Afterwards role assignments may be made only by an admin.
