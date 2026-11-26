-- Allow an authenticated client to permanently delete only their own account.
-- This function owns auth-table cleanup so auth-admin credentials are never
-- exposed to the browser.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
    v_user_id uuid := (select auth.uid());
begin
    if v_user_id is null then
        raise exception 'Authentication required';
    end if;

    if exists (
        select 1
        from public.profiles
        where id = v_user_id
          and role <> 'client'
    ) then
        raise exception 'Staff and administrator accounts must be deleted by an administrator';
    end if;

    -- Remove client-owned records that do not cascade from profiles.
    delete from public.appointments
    where client_id = v_user_id;

    delete from public.profiles
    where id = v_user_id;

    -- The profile FK is deleted with cascade, but removing the auth identity
    -- completes account deletion and prevents future sign-in.
    delete from auth.users
    where id = v_user_id;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.delete_my_account() from authenticated;
grant execute on function public.delete_my_account() to authenticated;
