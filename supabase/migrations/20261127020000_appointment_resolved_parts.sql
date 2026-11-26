alter table public.appointments
    add column if not exists resolved_parts text[] not null default array[]::text[];

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'appointments_resolved_parts_valid'
          and conrelid = 'public.appointments'::regclass
    ) then
        alter table public.appointments
            add constraint appointments_resolved_parts_valid
            check (
                cardinality(resolved_parts) <= 12
                and array_position(resolved_parts, ''::text) is null
                and array_position(resolved_parts, null::text) is null
            );
    end if;
end;
$$;

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

create or replace function public.audit_appointment_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' then
        insert into public.audit_log (actor_id, action, entity, entity_id, details)
        values (
            (select auth.uid()),
            'appointment_created',
            'appointments',
            new.id::text,
            jsonb_build_object('status', new.status, 'resolved_parts', new.resolved_parts)
        );
        return new;
    elsif tg_op = 'DELETE' then
        insert into public.audit_log (actor_id, action, entity, entity_id, details)
        values (
            (select auth.uid()),
            'appointment_deleted',
            'appointments',
            old.id::text,
            jsonb_build_object('status', old.status, 'resolved_parts', old.resolved_parts)
        );
        return old;
    end if;

    if old.status is distinct from new.status
       or old.service_id is distinct from new.service_id
       or old.client_id is distinct from new.client_id
       or old.vehicle_id is distinct from new.vehicle_id
       or old.starts_at is distinct from new.starts_at
       or old.total_due_php is distinct from new.total_due_php
       or old.resolved_parts is distinct from new.resolved_parts then
        insert into public.audit_log (actor_id, action, entity, entity_id, details)
        values (
            (select auth.uid()),
            'appointment_updated',
            'appointments',
            new.id::text,
            jsonb_build_object(
                'status_before', case when old.status is distinct from new.status then old.status end,
                'status_after', case when old.status is distinct from new.status then new.status end,
                'service_changed', old.service_id is distinct from new.service_id,
                'client_changed', old.client_id is distinct from new.client_id,
                'vehicle_changed', old.vehicle_id is distinct from new.vehicle_id,
                'start_changed', old.starts_at is distinct from new.starts_at,
                'total_changed', old.total_due_php is distinct from new.total_due_php,
                'resolved_parts_before', case when old.resolved_parts is distinct from new.resolved_parts then old.resolved_parts end,
                'resolved_parts_after', case when old.resolved_parts is distinct from new.resolved_parts then new.resolved_parts end
            )
        );
    end if;
    return new;
end;
$$;
