// Shared full-page loading state for pages that fetch account data.
(function () {
    'use strict';

    const loader = document.getElementById('page-loader');
    const message = document.getElementById('page-loader-message');

    if (!loader) return;

    window.ALT_PAGE_LOADING = {
        show(text) {
            if (message && text) message.textContent = text;
            loader.classList.remove('is-hidden');
            loader.setAttribute('aria-hidden', 'false');
        },
        hide() {
            loader.classList.add('is-hidden');
            loader.setAttribute('aria-hidden', 'true');
        },
    };
})();
