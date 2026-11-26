// ALTF4 — login / register page logic.
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const msg = $('msg');
    const embedded = new URLSearchParams(window.location.search).get('embed') === '1';

    function goToDashboard(role) {
        const destination = embedded ? window.top : window;
        const page = ALT.isStaff(role) ? 'dashboard.html' : 'history.html';
        destination.location.replace(page);
    }

    async function routeSignedInUser(userId) {
        const profile = await ALT.getMyProfile(userId);
        if (!profile) {
            await ALT.signOut('local');
            showMessage('This account is no longer available. You can log in or register again.');
            return false;
        }
        goToDashboard(profile.role);
        return true;
    }

    function showMessage(text, kind) {
        // textContent (not innerHTML) so server text can never inject markup.
        msg.textContent = text;
        msg.className = 'text-xs p-3 mb-4 border ' + (kind === 'ok'
            ? 'border-green-700 text-green-400 bg-green-950/30'
            : 'border-red-700 text-red-400 bg-red-950/30');
    }
    function clearMessage() {
        msg.className = 'hidden';
        msg.textContent = '';
    }

    function setTab(which) {
        const isLogin = which === 'login';
        $('login-form').classList.toggle('hidden', !isLogin);
        $('register-form').classList.toggle('hidden', isLogin);
        $('tab-login').className = 'w-1/2 pb-2 text-center border-b-2 ' +
            (isLogin ? 'font-bold text-altRed border-altRed' : 'text-zinc-500 border-transparent');
        $('tab-register').className = 'w-1/2 pb-2 text-center border-b-2 ' +
            (isLogin ? 'text-zinc-500 border-transparent' : 'font-bold text-altRed border-altRed');
        clearMessage();
    }

    $('tab-login').addEventListener('click', () => setTab('login'));
    $('tab-register').addEventListener('click', () => setTab('register'));
    setTab(new URLSearchParams(window.location.search).get('mode') === 'register' ? 'register' : 'login');

    // Already signed in? Skip the form.
    (async function checkExistingSession() {
        try {
            const { data, error } = await ALT.db.auth.getSession();
            if (error) {
                showMessage('Could not verify your session. ' + error.message);
                return;
            }
            if (!data.session) return;

            await routeSignedInUser(data.session.user.id);
        } catch (err) {
            showMessage('Could not verify your account. ' + err.message);
        } finally {
            if (window.ALT_PAGE_LOADING) window.ALT_PAGE_LOADING.hide();
        }
    })();

    $('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessage();
        const email = $('login-email').value.trim();
        const password = $('login-password').value;
        if (!email || !password) return showMessage('Enter your email and password.');

        const btn = $('login-btn');
        btn.disabled = true;
        if (window.ALT_PAGE_LOADING) window.ALT_PAGE_LOADING.show('Signing in…');
        try {
            const { data, error } = await ALT.db.auth.signInWithPassword({ email, password });
            if (error) {
                const unconfirmed = /not confirmed/i.test(error.message);
                showMessage(unconfirmed
                    ? 'Please confirm your email first, then log in.'
                    : 'Incorrect email or password.');
                return;
            }
            await routeSignedInUser(data.user.id);
        } catch (err) {
            showMessage('Could not sign in. ' + err.message);
        } finally {
            btn.disabled = false;
            if (window.ALT_PAGE_LOADING) window.ALT_PAGE_LOADING.hide();
        }
    });

    $('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessage();
        const full_name = $('reg-name').value.trim();
        const phone = $('reg-phone').value.trim();
        const email = $('reg-email').value.trim();
        const password = $('reg-password').value;

        if (!full_name || !phone || !email) return showMessage('Please fill in every field.');
        if (password.length < 8) return showMessage('Password must be at least 8 characters.');
        if (!$('reg-terms').checked) return showMessage('Please agree to the Terms and Conditions and acknowledge the Privacy Notice.');

        const btn = $('reg-btn');
        btn.disabled = true;
        if (window.ALT_PAGE_LOADING) window.ALT_PAGE_LOADING.show('Creating your account…');
        try {
            const { data, error } = await ALT.db.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name, phone },
                    emailRedirectTo: new URL('login.html', window.location.href).href,
                },
            });
            if (error) {
                showMessage(error.message);
                return;
            }

            if (!data.session) {
                setTab('login');
                $('login-email').value = email;
                showMessage('Account created. Check your email to confirm it, then log in.', 'ok');
                return;
            }
            await routeSignedInUser(data.user.id);
        } catch (err) {
            showMessage('Could not create your account. ' + err.message);
        } finally {
            btn.disabled = false;
            if (window.ALT_PAGE_LOADING) window.ALT_PAGE_LOADING.hide();
        }
    });
})();
