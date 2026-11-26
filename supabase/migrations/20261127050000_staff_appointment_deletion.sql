drop policy if exists "appointments: admin delete" on public.appointments;
create policy "appointments: staff delete" on public.appointments
    for delete to authenticated using (public.is_staff());
