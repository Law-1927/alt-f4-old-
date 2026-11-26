(function () {
    'use strict';

    const toggle = document.getElementById('menuToggle');
    const nav = document.getElementById('mainNav');
    const authModal = document.getElementById('authModal');
    const authFrame = document.getElementById('authFrame');
    const authClose = authModal.querySelector('.auth-close');
    const accountLink = document.getElementById('homepageAccountLink');
    const primaryAction = document.getElementById('homepagePrimaryAction');
    const footerRegister = document.getElementById('footerRegister');
    const footerPortal = document.getElementById('footerPortal');
    const authStatus = document.getElementById('authStatus');
    const authLinks = Array.from(document.querySelectorAll('[data-auth]'));
    const originalHrefs = new Map(authLinks.map((link) => [link, link.getAttribute('href')]));
    let previouslyFocused = null;
    let authFrameObserver = null;
    let authSequence = 0;
    let authState = {
        signedIn: false,
        accountHref: null,
        actionHref: null,
    };

    function showAuthStatus(message) {
        authStatus.textContent = message;
        authStatus.hidden = !message;
    }

    function setSignedOut() {
        authState = { signedIn: false, accountHref: null, actionHref: null };
        authLinks.forEach((link) => { link.href = originalHrefs.get(link); });
        accountLink.textContent = 'Log in';
        primaryAction.textContent = 'Create account';
        footerRegister.textContent = 'Create an account';
        footerPortal.textContent = 'Client portal';
    }

    function setSignedIn(role) {
        const isStaff = role ? window.ALT.isStaff(role) : false;
        const accountHref = role ? (isStaff ? 'dashboard.html' : 'history.html') : 'home.html';
        const actionHref = isStaff ? 'dashboard.html' : 'book-service.html';

        authState = { signedIn: true, accountHref, actionHref };
        authLinks.forEach((link) => {
            link.href = link.dataset.auth === 'login' ? accountHref : actionHref;
        });
        accountLink.textContent = isStaff ? 'Dashboard' : role ? 'My bookings' : 'My account';
        primaryAction.textContent = 'Sign out';
        primaryAction.href = '#signout';
        footerRegister.textContent = isStaff ? 'Staff dashboard' : 'Book an appointment';
        footerPortal.textContent = isStaff ? 'Staff dashboard' : role ? 'My bookings' : 'My account';
    }

    async function applySession(session) {
        const sequence = ++authSequence;
        showAuthStatus('');
        if (!session) {
            setSignedOut();
            return;
        }

        setSignedIn(null);
        try {
            const profile = await window.ALT.getMyProfile(session.user.id);
            if (sequence !== authSequence) return;
            if (!profile) {
                showAuthStatus('Your account profile could not be found.');
                return;
            }
            setSignedIn(profile.role);
        } catch (error) {
            if (sequence !== authSequence) return;
            showAuthStatus('Could not load your account role. ' + error.message);
        }
    }

    async function signOut() {
        try {
            await window.ALT.signOut();
        } catch (error) {
            showAuthStatus('Could not sign out. ' + error.message);
        }
    }

    function resizeAuthFrame() {
        const content = authFrame.contentDocument?.querySelector('main');
        if (!content) return;

        const panel = authFrame.closest('.auth-panel');
        const header = panel.querySelector('.auth-panel-header');
        const panelStyle = getComputedStyle(panel);
        const maxPanelHeight = parseFloat(panelStyle.maxHeight);
        const panelBorders = parseFloat(panelStyle.borderTopWidth) +
            parseFloat(panelStyle.borderBottomWidth);
        const maxFrameHeight = Math.max(0, maxPanelHeight - header.offsetHeight - panelBorders);
        const contentHeight = Math.ceil(content.getBoundingClientRect().height);

        authFrame.style.height = Math.min(contentHeight, maxFrameHeight) + 'px';
    }

    function observeAuthFrameContent() {
        authFrameObserver?.disconnect();
        const content = authFrame.contentDocument?.querySelector('main');
        if (!content) return;

        authFrameObserver = new ResizeObserver(resizeAuthFrame);
        authFrameObserver.observe(content);
        resizeAuthFrame();
    }

    function setMenuOpen(open) {
        nav.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    }

    toggle.addEventListener('click', () => {
        setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    nav.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => setMenuOpen(false));
    });

    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', (event) => {
            if (event.defaultPrevented || event.button !== 0 ||
                event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

            const hash = anchor.getAttribute('href').slice(1);
            if (!hash) return;

            let targetId;
            try {
                targetId = decodeURIComponent(hash);
            } catch {
                return;
            }

            const target = document.getElementById(targetId);
            if (!target) return;

            event.preventDefault();
            target.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? 'auto'
                    : 'smooth',
                block: 'start',
            });
            if (window.location.hash !== anchor.getAttribute('href')) {
                window.history.pushState(null, '', anchor.getAttribute('href'));
            }
        });
    });

    function openAuth(mode) {
        previouslyFocused = document.activeElement;
        authFrame.style.height = '0px';
        authFrame.src = 'login.html?mode=' + encodeURIComponent(mode) + '&embed=1';
        authModal.classList.add('open');
        authModal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('auth-open');
        authClose.focus();
    }

    function closeAuth() {
        authModal.classList.remove('open');
        authModal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('auth-open');
        authFrameObserver?.disconnect();
        authFrameObserver = null;
        if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    }

    authFrame.addEventListener('load', () => {
        observeAuthFrameContent();
        authFrame.contentWindow.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && authModal.classList.contains('open')) closeAuth();
        });
    });

    window.addEventListener('resize', resizeAuthFrame);

    document.querySelectorAll('[data-auth]').forEach((trigger) => {
        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            if (authState.signedIn) {
                if (trigger === primaryAction) {
                    signOut();
                    return;
                }
                window.location.assign(trigger.dataset.auth === 'login'
                    ? authState.accountHref
                    : authState.actionHref);
                return;
            }
            openAuth(trigger.dataset.auth);
        });
    });

    window.ALT.db.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => applySession(session), 0);
    });

    window.ALT.db.auth.getSession().then(({ data, error }) => {
        if (error) {
            showAuthStatus('Could not check your sign-in status. ' + error.message);
            return;
        }
        applySession(data.session);
    }).catch((error) => {
        showAuthStatus('Could not check your sign-in status. ' + error.message);
    });

    authModal.querySelectorAll('[data-auth-close]').forEach((button) => {
        button.addEventListener('click', closeAuth);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setMenuOpen(false);
            if (authModal.classList.contains('open')) closeAuth();
        }
    });
})();
