-- RLS policies filter rows and operations; table grants allow the API role
-- to reach those policies in the first place.
grant usage on schema public to authenticated;

grant select, update on table public.profiles to authenticated;

grant select, insert, update, delete
    on table public.vehicles, public.services, public.appointments
    to authenticated;

grant select on table public.booked_slots, public.notifications, public.reports_daily
    to authenticated;
