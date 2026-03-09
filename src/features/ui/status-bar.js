const STATUS_ROW_COLLAPSE_MS = 3000;
const STATUS_ROW_TRANSITION_MS = 300;

let getDom = () => ({
    statusMsg: document.getElementById('statusMsg'),
    footerStatusRow: document.getElementById('footerStatusRow'),
});
let escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
let createIcons = null;
let icons = null;

let statusFadeClearTimeout = null;
let statusAutoCollapseTimeout = null;
let statusListenerInstalled = false;

export function configureStatusBar(options = {}) {
    if (typeof options.getDom === 'function') {
        getDom = options.getDom;
    }
    if (typeof options.escapeHtml === 'function') {
        escapeHtml = options.escapeHtml;
    }
    if (typeof options.createIcons === 'function') {
        createIcons = options.createIcons;
    }
    if (options.icons !== undefined) {
        icons = options.icons;
    }
}

export function clearStatusAfter(delayMs = STATUS_ROW_COLLAPSE_MS) {
    if (statusAutoCollapseTimeout) {
        clearTimeout(statusAutoCollapseTimeout);
    }
    statusAutoCollapseTimeout = setTimeout(() => {
        setStatus('');
        statusAutoCollapseTimeout = null;
    }, delayMs);
}

export function setStatus(msg, type = 'normal') {
    const dom = getDom();
    const statusMsg = dom?.statusMsg;
    if (!statusMsg) return;

    if (statusFadeClearTimeout) {
        clearTimeout(statusFadeClearTimeout);
        statusFadeClearTimeout = null;
    }
    if (statusAutoCollapseTimeout) {
        clearTimeout(statusAutoCollapseTimeout);
        statusAutoCollapseTimeout = null;
    }

    const row = dom?.footerStatusRow;

    if (!msg) {
        statusMsg.style.opacity = '0';
        statusMsg.classList.remove('status-error', 'status-success', 'status-normal');
        if (row) {
            row.classList.remove('is-expanded');
        }
        statusFadeClearTimeout = setTimeout(() => {
            statusMsg.textContent = '';
            statusFadeClearTimeout = null;
        }, STATUS_ROW_TRANSITION_MS);
        return;
    }

    if (row) {
        row.classList.remove('is-expanded');
        void row.offsetHeight;
        row.classList.add('is-expanded');
    }
    requestAnimationFrame(() => {
        statusMsg.classList.remove('status-error', 'status-success', 'status-normal');
        statusMsg.classList.add(type === 'error' ? 'status-error' : (type === 'success' ? 'status-success' : 'status-normal'));
        if (type === 'success') {
            statusMsg.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 inline-block align-middle shrink-0 mr-1"></i>${escapeHtml(msg.replace(/^✅\s*/, ''))}`;
            if (createIcons && icons) {
                createIcons({ icons });
            }
        } else {
            statusMsg.innerText = msg;
        }
        statusMsg.style.opacity = '1';
    });

    clearStatusAfter();
}

export function installStatusEventListener() {
    if (statusListenerInstalled) return;
    statusListenerInstalled = true;
    document.addEventListener('app:status', (e) => {
        const { message, type } = e.detail || {};
        if (typeof message !== 'string') return;
        setStatus(message, type || 'normal');
    });
}
