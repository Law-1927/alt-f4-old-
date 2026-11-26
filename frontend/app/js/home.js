// ALTF4 — role-aware dashboard router kept for old bookmarks.
(async function () {
    'use strict';

    const session = await ALT.requireSession();
    if (!session) return;

    const status = document.getElementById('status');
    try {
        const profile = await ALT.getMyProfile(session.user.id);
        if (!profile) {
            await ALT.signOut('local');
            return;
        }

        window.location.replace(ALT.isStaff(profile.role) ? 'dashboard.html' : 'history.html');
    } catch (err) {
        status.textContent = 'Could not load your profile. ' + err.message;
        if (window.ALT_PAGE_LOADING) window.ALT_PAGE_LOADING.hide();
    }
})();
