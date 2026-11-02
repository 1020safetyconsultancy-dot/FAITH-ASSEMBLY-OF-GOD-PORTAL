-- Apply after database/schema.sql; protects financial entries from modification after posting.
revoke all on function public.fin_audit_trigger() from public, anon, authenticated;
revoke all on function public.is_staff(text[]) from public, anon;
grant execute on function public.is_staff(text[]) to authenticated;
create or replace function public.fin_audit_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if tg_op='DELETE' then raise exception 'Financial records cannot be deleted'; end if;
 if tg_op='UPDATE' then
   if old.voided_at is not null then raise exception 'Voided entries cannot be altered'; end if;
   if new.voided_at is null then raise exception 'Financial record can only be voided, not edited'; end if;
   if coalesce(trim(new.void_reason),'') = '' then raise exception 'Void reason required'; end if;
   if (to_jsonb(new) - 'voided_at' - 'void_reason') is distinct from (to_jsonb(old) - 'voided_at' - 'void_reason') then
      raise exception 'Voiding must not modify other fields';
   end if;
 end if;
 insert into public.finance_audit(table_name,record_id,old_data,new_data,actor)
 values(tg_table_name,new.id,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid());
 return new;
end $$;
revoke all on function public.fin_audit_trigger() from public, anon, authenticated;
