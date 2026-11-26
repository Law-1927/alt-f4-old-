// ALTF4 — pure helpers for the staff dashboard (no page access, unit tested).
(function (root) {
    'use strict';

    // Allowed status moves. Completed and Cancelled are final in the UI so a
    // misclick cannot silently change revenue figures. (An admin can still
    // correct a record directly in the database.)
    const NEXT = {
        Pending: ['Ongoing', 'Cancelled'],
        Ongoing: ['Completed', 'Cancelled'],
        Completed: [],
        Cancelled: [],
    };

    function nextStatuses(status) {
        return NEXT[status] ? NEXT[status].slice() : [];
    }

    // Totals for one day's bookings. Money is summed in centavos so floating
    // point never creates odd values like 0.30000000000000004.
    function summarize(rows) {
        let active = 0, completed = 0, centavos = 0;
        rows.forEach((r) => {
            if (r.status !== 'Cancelled') active += 1;
            if (r.status === 'Completed') {
                completed += 1;
                centavos += Math.round(Number(r.total_due_php) * 100);
            }
        });
        return { active, completed, revenue: centavos / 100 };
    }

    function normalizeResolvedParts(value) {
        const values = Array.isArray(value) ? value : String(value || '').split(/[,\n;]/);
        const seen = new Set();
        return values.reduce((parts, item) => {
            const label = String(item || '').trim().replace(/\s+/g, ' ');
            const key = label.toLocaleLowerCase();
            if (label && !seen.has(key)) {
                seen.add(key);
                parts.push(label);
            }
            return parts;
        }, []);
    }

    function countResolvedParts(rows) {
        const counts = new Map();
        rows.forEach((row) => {
            if (row.status !== 'Completed') return;
            normalizeResolvedParts(row.resolved_parts).forEach((label) => {
                const key = label.toLocaleLowerCase();
                const current = counts.get(key);
                if (current) current.count += 1;
                else counts.set(key, { label, count: 1 });
            });
        });
        return Array.from(counts.values())
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    }

    const api = { nextStatuses, summarize, normalizeResolvedParts, countResolvedParts };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ALT_OPS = api;
})(typeof window !== 'undefined' ? window : globalThis);
