// ALTF4 — staff dashboard: today's bookings, status changes, live updates.
// Staff/admin only. The page check is for convenience; the database policies
// are what actually stop a client from reading or changing other people's data.
(async function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const shop = window.ALT_SHOP;
    const S = window.ALT_SLOTS;
    const OPS = window.ALT_OPS;

    const BADGE = {
        Pending:   'bg-zinc-800 text-zinc-300 border-zinc-700',
        Ongoing:   'bg-yellow-900/30 text-yellow-500 border-yellow-900',
        Completed: 'bg-green-900/30 text-green-500 border-green-900',
        Cancelled: 'bg-red-900/30 text-red-400 border-red-900',
    };

    function showMessage(text, kind) {
        const msg = $('msg');
        msg.textContent = text; // textContent, never innerHTML
        msg.className = 'text-xs p-3 mb-4 border ' + (kind === 'ok'
            ? 'border-green-700 text-green-400 bg-green-950/30'
            : 'border-red-700 text-red-400 bg-red-950/30');
    }
    function clearMessage() { $('msg').className = 'hidden'; $('msg').textContent = ''; }

    const peso = (n) => '₱ ' + Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 });

    function databaseErrorHint(error) {
        if (error && error.code === '42501') {
            return ' Apply pending Supabase migrations, including supabase/migrations/20261127000000_authenticated_api_grants.sql and supabase/migrations/20261127050000_staff_appointment_deletion.sql, in the project configured for this app.';
        }
        if (error && error.code === '42703' && /resolved_parts/i.test(error.message || '')) {
            return ' Apply supabase/migrations/20261127020000_appointment_resolved_parts.sql before using car-part labels.';
        }
        return '';
    }

    function td(className) {
        const cell = document.createElement('td');
        cell.className = className;
        return cell;
    }

    function requestResolvedParts(row, initialParts) {
        return new Promise((resolve) => {
            const dialog = $('resolved-parts-dialog');
            const form = $('resolved-parts-form');
            const input = $('resolved-parts-input');
            const error = $('resolved-parts-error');
            const parts = OPS.normalizeResolvedParts(initialParts);
            const isEditing = row.status === 'Completed';

            $('resolved-parts-title').textContent = isEditing ? 'Edit resolved car parts' : 'Complete appointment';
            $('resolved-parts-context').textContent = row.ref_id + ': enter the areas worked on.';
            $('resolved-parts-save').textContent = isEditing ? 'Save labels' : 'Save and complete';
            input.value = parts.join(', ');
            error.textContent = '';
            error.classList.add('hidden');

            function finish(result) {
                form.removeEventListener('submit', onSubmit);
                $('resolved-parts-cancel').removeEventListener('click', onCancel);
                dialog.removeEventListener('cancel', onCancel);
                dialog.close();
                resolve(result);
            }
            function onCancel(event) {
                if (event) event.preventDefault();
                finish(null);
            }
            function onSubmit(event) {
                event.preventDefault();
                const labels = OPS.normalizeResolvedParts(input.value);
                if (!labels.length) {
                    error.textContent = 'Enter at least one car part or area.';
                } else if (labels.length > 12) {
                    error.textContent = 'Use no more than 12 labels.';
                } else if (labels.some((label) => label.length > 60)) {
                    error.textContent = 'Each label must be 60 characters or fewer.';
                } else {
                    finish(labels);
                    return;
                }
                error.classList.remove('hidden');
            }

            form.addEventListener('submit', onSubmit);
            $('resolved-parts-cancel').addEventListener('click', onCancel);
            dialog.addEventListener('cancel', onCancel);
            dialog.showModal();
            input.focus();
        });
    }

    async function editResolvedParts(row) {
        const parts = await requestResolvedParts(row, row.resolved_parts || []);
        if (!parts) return;
        clearMessage();
        const { error } = await ALT.db.from('appointments')
            .update({ resolved_parts: parts })
            .eq('id', row.id)
            .select('id')
            .single();
        if (error) showMessage('Could not update labels for ' + row.ref_id + '. ' + error.message + databaseErrorHint(error));
        else showMessage('Resolved areas updated for ' + row.ref_id + '.', 'ok');
        await load();
    }

    function resolvedPartsCell(row) {
        const cell = td('py-3 pr-3');
        const labels = OPS.normalizeResolvedParts(row.resolved_parts || []);
        const text = document.createElement('div');
        text.className = 'text-[11px] text-zinc-400';
        text.textContent = labels.length ? labels.join(', ') : (row.status === 'Completed' ? 'No labels yet' : '—');
        cell.append(text);

        if (row.status === 'Completed') {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'mt-1 text-[10px] uppercase text-altRed hover:text-red-400';
            button.textContent = labels.length ? 'Edit labels' : 'Add labels';
            button.setAttribute('aria-label', (labels.length ? 'Edit' : 'Add') + ' resolved areas for ' + row.ref_id);
            button.addEventListener('click', () => editResolvedParts(row));
            cell.append(button);
        }
        return cell;
    }

    function statusCell(row) {
        const cell = td('py-3');
        const options = OPS.nextStatuses(row.status);
        const cls = 'p-1 px-2 border text-[10px] font-bold ' + (BADGE[row.status] || BADGE.Pending);

        if (options.length === 0) {           // final state: plain badge
            const badge = document.createElement('span');
            badge.className = cls;
            badge.textContent = row.status;
            cell.append(badge);
            return cell;
        }

        const select = document.createElement('select');
        select.className = cls + ' outline-none';
        select.setAttribute('aria-label', 'Status for ' + row.ref_id);
        [row.status, ...options].forEach((s) => select.append(new Option(s, s)));
        select.value = row.status;
        select.addEventListener('change', () => changeStatus(row, select));
        cell.append(select);
        return cell;
    }

    async function changeStatus(row, select) {
        const to = select.value;
        clearMessage();
        if (to === 'Cancelled' && !window.confirm('Cancel booking ' + row.ref_id + '? The client will be notified.')) {
            select.value = row.status;
            return;
        }
        let resolvedParts;
        if (to === 'Completed') {
            resolvedParts = await requestResolvedParts(row, []);
            if (!resolvedParts) {
                select.value = row.status;
                return;
            }
        }
        select.disabled = true;
        const updates = { status: to };
        if (to === 'Completed') updates.resolved_parts = resolvedParts;
        const { error } = await ALT.db.from('appointments')
            .update(updates)
            .eq('id', row.id)
            .select('id')
            .single();
        if (error) showMessage('Could not update ' + row.ref_id + '. ' + error.message + databaseErrorHint(error));
        else showMessage(row.ref_id + ' is now ' + to + '.', 'ok');
        await load(); // always re-read so the table shows the real saved state
    }

    async function deleteBooking(row, button) {
        clearMessage();
        const ok = window.confirm(
            'Permanently delete booking ' + row.ref_id + '? It will be removed from booking history and reports, its time slot will be freed, and the client will be notified. The notice will remain in their history. This cannot be undone.'
        );
        if (!ok) return;

        button.disabled = true;
        const { error } = await ALT.db.from('appointments')
            .delete()
            .eq('id', row.id)
            .select('id')
            .single();
        if (error) {
            showMessage('Could not delete ' + row.ref_id + '. ' + error.message + databaseErrorHint(error));
            button.disabled = false;
            return;
        }

        showMessage(row.ref_id + ' was permanently deleted.', 'ok');
        await load();
    }

    function actionsCell(row) {
        const cell = td('py-3 pr-3');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'border border-red-900/60 text-red-400 hover:bg-red-950/40 px-2 py-1 text-[10px] uppercase font-bold transition-colors';
        button.textContent = 'Delete';
        button.setAttribute('aria-label', 'Permanently delete booking ' + row.ref_id);
        button.addEventListener('click', () => deleteBooking(row, button));
        cell.append(button);
        return cell;
    }

    function render(rows) {
        const body = $('rows');
        body.replaceChildren();
        $('empty').classList.toggle('hidden', rows.length > 0);

        rows.forEach((r) => {
            const tr = document.createElement('tr');
            const dim = r.status === 'Cancelled' ? ' text-zinc-600 line-through' : '';
            tr.className = 'border-b border-zinc-900' + dim;

            const time = td('py-3 pr-3 font-bold whitespace-nowrap');
            time.textContent = S.fmtTime(new Date(r.starts_at));
            const end = document.createElement('div');
            end.className = 'text-[10px] font-normal text-zinc-500';
            end.textContent = 'until ' + S.fmtTime(new Date(r.ends_at));
            time.append(end);

            const who = td('py-3 pr-3');
            const c = r.client || {};
            const v = r.vehicle || {};
            who.textContent = c.full_name || '(no name)';
            const sub = document.createElement('div');
            sub.className = 'text-[10px] text-zinc-500';
            sub.textContent = [(v.make || '') + ' ' + (v.model || ''), v.plate_number, c.phone]
                .filter((x) => x && x.trim()).join(' · ');
            who.append(sub);

            const svc = td('py-3 pr-3');
            svc.textContent = r.service ? r.service.name : '';
            const ref = document.createElement('div');
            ref.className = 'text-[10px] text-zinc-500';
            ref.textContent = r.ref_id;
            svc.append(ref);

            const total = td('py-3 pr-3 text-right whitespace-nowrap');
            total.textContent = peso(r.total_due_php);

            tr.append(time, who, svc, total, resolvedPartsCell(r), statusCell(r), actionsCell(r));
            body.append(tr);
        });

        const sum = OPS.summarize(rows);
        $('st-active').textContent = String(sum.active);
        $('st-completed').textContent = String(sum.completed);
        $('st-revenue').textContent = peso(sum.revenue);
    }

    function renderAnalytics(rows, endDate) {
        const dates = Array.from({ length: 7 }, (_, index) => S.addDays(endDate, index - 6));
        const days = new Map(dates.map((date) => [date, { bookings: 0, cents: 0 }]));
        const counts = { Pending: 0, Ongoing: 0, Completed: 0, Cancelled: 0 };
        let totalCents = 0;
        let completed = 0;

        rows.forEach((row) => {
            const date = S.todayInManila(new Date(row.starts_at));
            const day = days.get(date);
            if (day) {
                day.bookings += 1;
                if (row.status === 'Completed') {
                    day.cents += Math.round(Number(row.total_due_php) * 100);
                }
            }
            if (Object.prototype.hasOwnProperty.call(counts, row.status)) counts[row.status] += 1;
            if (row.status === 'Completed') {
                completed += 1;
                totalCents += Math.round(Number(row.total_due_php) * 100);
            }
        });

        $('analytics-range').textContent = dates[0] + ' to ' + endDate;
        $('analytics-total').textContent = String(rows.length);
        $('analytics-completed').textContent = String(completed);
        $('analytics-revenue').textContent = peso(totalCents / 100);
        $('analytics-cancelled').textContent = String(counts.Cancelled);

        const chart = $('analytics-chart');
        chart.replaceChildren();
        const values = Array.from(days.values());
        const maxCents = Math.max(0, ...values.map((day) => day.cents));
        const maxBookings = Math.max(0, ...values.map((day) => day.bookings));
        chart.setAttribute('aria-label', 'Booking counts and completed revenue for each of the seven selected days');
        dates.forEach((date) => {
            const day = days.get(date);
            const column = document.createElement('div');
            column.className = 'flex min-w-0 flex-col items-center justify-end gap-1';
            column.title = date + ': ' + day.bookings + ' bookings, ' + peso(day.cents / 100) + ' completed revenue';

            const bookingCount = document.createElement('span');
            bookingCount.className = 'text-[9px] text-zinc-500';
            bookingCount.textContent = String(day.bookings);

            const amount = document.createElement('span');
            amount.className = 'text-[9px] text-zinc-400 truncate w-full text-center';
            amount.textContent = day.cents ? peso(day.cents / 100) : '—';

            const barTrack = document.createElement('div');
            barTrack.className = 'w-full h-12 flex items-end justify-center gap-1';
            const bookingBar = document.createElement('div');
            bookingBar.className = 'w-2/5 rounded-t bg-zinc-500';
            bookingBar.style.height = maxBookings && day.bookings
                ? Math.max(4, Math.round(day.bookings / maxBookings * 100)) + '%'
                : '0%';
            bookingBar.setAttribute('aria-label', day.bookings + ' bookings');
            const revenueBar = document.createElement('div');
            revenueBar.className = 'w-2/5 rounded-t bg-altRed';
            revenueBar.style.height = maxCents && day.cents
                ? Math.max(4, Math.round(day.cents / maxCents * 100)) + '%'
                : '0%';
            revenueBar.setAttribute('aria-label', peso(day.cents / 100) + ' completed revenue');
            barTrack.append(bookingBar, revenueBar);

            const label = document.createElement('span');
            label.className = 'text-[9px] text-zinc-500';
            label.textContent = date.slice(5);
            column.append(bookingCount, amount, barTrack, label);
            chart.append(column);
        });

        const statusList = $('analytics-status');
        statusList.replaceChildren();
        Object.entries(counts).forEach(([status, count]) => {
            const item = document.createElement('li');
            item.className = 'flex justify-between gap-2 border-b border-zinc-800 py-1';
            const name = document.createElement('span');
            name.className = 'text-zinc-400';
            name.textContent = status;
            const value = document.createElement('span');
            value.className = 'font-mono font-bold';
            value.textContent = String(count);
            item.append(name, value);
            statusList.append(item);
        });

        renderResolvedPartAnalytics(rows);
        updateResolvedPartSuggestions(rows);
    }

    function renderResolvedPartAnalytics(rows) {
        const chart = $('analytics-parts');
        const empty = $('analytics-parts-empty');
        chart.replaceChildren();
        const parts = OPS.countResolvedParts(rows);
        empty.classList.toggle('hidden', parts.length > 0);

        const maxCount = Math.max(0, ...parts.map((part) => part.count));
        parts.forEach((part) => {
            const item = document.createElement('div');
            item.className = 'bg-black/50 border border-zinc-800 p-3';
            const heading = document.createElement('div');
            heading.className = 'flex justify-between gap-3 text-xs';
            const label = document.createElement('span');
            label.className = 'text-zinc-300 truncate';
            label.textContent = part.label;
            const count = document.createElement('span');
            count.className = 'font-mono font-bold text-altRed whitespace-nowrap';
            count.textContent = part.count + (part.count === 1 ? ' job' : ' jobs');
            heading.append(label, count);

            const track = document.createElement('div');
            track.className = 'h-1 bg-zinc-800 mt-2';
            const bar = document.createElement('div');
            bar.className = 'h-full bg-altRed';
            bar.style.width = Math.round(part.count / maxCount * 100) + '%';
            track.append(bar);
            item.append(heading, track);
            chart.append(item);
        });
    }

    function updateResolvedPartSuggestions(rows) {
        const datalist = $('resolved-parts-suggestions');
        datalist.replaceChildren();
        OPS.countResolvedParts(rows).forEach((part) => {
            const option = document.createElement('option');
            option.value = part.label;
            datalist.append(option);
        });
    }

    function showAnalyticsError(error) {
        $('analytics-range').textContent = 'Analytics unavailable';
        ['analytics-total', 'analytics-completed', 'analytics-revenue', 'analytics-cancelled'].forEach((id) => {
            $(id).textContent = '—';
        });
        $('analytics-chart').replaceChildren();
        $('analytics-status').replaceChildren();
        $('analytics-parts').replaceChildren();
        $('analytics-parts-empty').textContent = 'Car-part analytics could not be loaded.';
        $('analytics-parts-empty').classList.remove('hidden');
        showMessage('Could not load 7-day analytics. ' + error.message + databaseErrorHint(error));
    }

    let loadSeq = 0;
    async function load() {
        const date = $('date').value;
        if (!date) return;
        const seq = ++loadSeq;
        const day = S.dayBounds(date, shop.TZ_OFFSET);
        const weekStart = S.dayBounds(S.addDays(date, -6), shop.TZ_OFFSET);

        const [daily, weekly] = await Promise.all([
            ALT.db.from('appointments')
                .select('id, ref_id, status, starts_at, ends_at, total_due_php, resolved_parts, ' +
                        'client:profiles!appointments_client_id_fkey(full_name, phone), ' +
                        'vehicle:vehicles(make, model, plate_number), ' +
                        'service:services(name)')
                .gte('starts_at', day.start.toISOString())
                .lt('starts_at', day.end.toISOString())
                .order('starts_at'),
            ALT.db.from('appointments')
                .select('status, starts_at, total_due_php, resolved_parts')
                .gte('starts_at', weekStart.start.toISOString())
                .lt('starts_at', day.end.toISOString()),
        ]);

        if (seq !== loadSeq) return; // a newer request replaced this one
        if (daily.error) return showMessage('Could not load bookings. ' + daily.error.message + databaseErrorHint(daily.error));
        render(daily.data || []);
        if (weekly.error) return showAnalyticsError(weekly.error);
        renderAnalytics(weekly.data || [], date);
    }

    // ---- start-up -------------------------------------------------------
    const session = await ALT.requireSession();
    if (!session) return;

    let profile;
    try { profile = await ALT.getMyProfile(session.user.id); }
    catch (err) {
        showMessage('Could not load your profile. ' + err.message);
        if (window.ALT_PAGE_LOADING) window.ALT_PAGE_LOADING.hide();
        return;
    }
    if (!profile || !ALT.isStaff(profile.role)) {
        window.location.replace('history.html');
        return;
    }

    const { error: auditError } = await ALT.db.rpc('record_staff_access', {
        p_action: 'dashboard_view',
    });
    if (auditError) {
        showMessage('Could not write the staff access audit record. ' + auditError.message);
        if (window.ALT_PAGE_LOADING) window.ALT_PAGE_LOADING.hide();
        return;
    }

    $('signout').addEventListener('click', () => ALT.signOut());
    $('date').value = S.todayInManila();
    $('date').addEventListener('change', load);
    $('prev').addEventListener('click', () => { $('date').value = S.addDays($('date').value || S.todayInManila(), -1); load(); });
    $('next').addEventListener('click', () => { $('date').value = S.addDays($('date').value || S.todayInManila(), 1); load(); });
    $('today').addEventListener('click', () => { $('date').value = S.todayInManila(); load(); });
    await load();
    if (window.ALT_PAGE_LOADING) window.ALT_PAGE_LOADING.hide();

    // Live updates: any booking change refreshes the table (debounced so a
    // burst of changes causes one reload).
    let timer = null;
    ALT.db.channel('dashboard-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
            clearTimeout(timer);
            timer = setTimeout(load, 300);
        })
        .subscribe();
})();
