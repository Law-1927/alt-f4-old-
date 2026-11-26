create or replace function public.guard_appointment_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if exists (
        select 1
        from unnest(new.resolved_parts) as labels(part)
        where char_length(btrim(part)) = 0 or char_length(part) > 60
    ) then
        raise exception 'Resolved car-part labels must contain 1 to 60 characters';
    end if;

    if (select auth.uid()) is null or public.is_admin() then
        return new;
    end if;

    if not public.is_staff() then
        if old.client_id = (select auth.uid())
           and old.status = 'Pending'
           and new.status = 'Cancelled'
           and old.starts_at > clock_timestamp()
           and new.id is not distinct from old.id
           and new.ref_id is not distinct from old.ref_id
           and new.client_id is not distinct from old.client_id
           and new.vehicle_id is not distinct from old.vehicle_id
           and new.service_id is not distinct from old.service_id
           and new.starts_at is not distinct from old.starts_at
           and new.ends_at is not distinct from old.ends_at
           and new.total_due_php is not distinct from old.total_due_php
           and new.created_at is not distinct from old.created_at
           and new.resolved_parts is not distinct from old.resolved_parts then
            return new;
        end if;

        raise exception 'Only staff can update appointments';
    end if;

    if new.id is distinct from old.id
       or new.ref_id is distinct from old.ref_id
       or new.client_id is distinct from old.client_id
       or new.vehicle_id is distinct from old.vehicle_id
       or new.service_id is distinct from old.service_id
       or new.starts_at is distinct from old.starts_at
       or new.ends_at is distinct from old.ends_at
       or new.total_due_php is distinct from old.total_due_php
       or new.created_at is distinct from old.created_at
       or (
           new.resolved_parts is distinct from old.resolved_parts
           and not (
               new.status = 'Completed'
               and old.status in ('Ongoing', 'Completed')
           )
       ) then
        raise exception 'Staff may only change appointment status and resolved parts';
    end if;

    if new.status is distinct from old.status
       and not (
           (old.status = 'Pending' and new.status in ('Ongoing', 'Cancelled'))
           or (old.status = 'Ongoing' and new.status in ('Completed', 'Cancelled'))
       ) then
        raise exception 'Invalid appointment status transition';
    end if;

    if new.status = 'Completed' and cardinality(new.resolved_parts) = 0 then
        raise exception 'Add at least one resolved car-part label before completing';
    end if;

    return new;
end;
$$;
