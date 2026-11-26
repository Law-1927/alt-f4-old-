create or replace function public.cancel_appointment(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
    update public.appointments
    set status = 'Cancelled'
    where id = p_id
      and client_id = (select auth.uid())
      and status = 'Pending'
      and starts_at > clock_timestamp();

    if not found then
        raise exception 'Appointment not found or cannot be cancelled';
    end if;
end;
$$;
