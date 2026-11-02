-- First admin account is provisioned only for the designated administrator email.
-- Supabase must require the user to verify email ownership before sign-in.
create or replace function public.faog_assign_first_admin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if lower(new.email) = 'bbillyjae@gmail.com' then
  insert into public.staff_roles(user_id,role) values (new.id,'admin')
  on conflict (user_id) do nothing;
 end if;
 return new;
end;
$$;
revoke all on function public.faog_assign_first_admin() from public, anon, authenticated;
drop trigger if exists faog_first_admin on auth.users;
create trigger faog_first_admin after insert on auth.users
for each row execute function public.faog_assign_first_admin();
