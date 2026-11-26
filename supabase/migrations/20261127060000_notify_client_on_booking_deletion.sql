alter table public.notifications
    alter column appointment_id drop not null;

alter table public.notifications
    drop constraint if exists notifications_appointment_id_fkey;

alter table public.notifications
    add constraint notifications_appointment_id_fkey
    foreign key (appointment_id)
    references public.appointments (id)
    on delete set null;

create or replace function public.notify_appointment_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
    v_message text;
begin
    v_message := case old.status
        when 'Pending' then format('Your appointment %s was cancelled and deleted by staff.', old.ref_id)
        when 'Ongoing' then format('Your ongoing appointment %s was cancelled and deleted by staff.', old.ref_id)
        when 'Cancelled' then format('Your cancelled appointment %s was deleted by staff.', old.ref_id)
        when 'Completed' then format('Your completed appointment %s was deleted by staff.', old.ref_id)
    end;

    insert into public.notifications (appointment_id, recipient_id, message)
    values (old.id, old.client_id, v_message);

    return old;
end;
$$;

drop trigger if exists appointments_notify_delete on public.appointments;
create trigger appointments_notify_delete
    before delete on public.appointments
    for each row execute function public.notify_appointment_deletion();

revoke execute on function public.notify_appointment_deletion() from public, anon, authenticated;
