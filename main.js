// Boot: hide loading shell, init picture matching game.
// Flashcards removed — reading + matching only.

const THEME_STORAGE_KEY = 'gwm-theme-vaporwave';

function isVaporwaveTheme() {
  return document.documentElement.classList.contains('theme-vaporwave');
}

function applyVaporwaveTheme(on) {
  document.documentElement.classList.toggle('theme-vaporwave', !!on);
  document.body.classList.toggle('theme-vaporwave', !!on);
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.classList.toggle('is-on', !!on);
  }
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', on ? '#1a0a2e' : '#c23b3b');
  try {
    localStorage.setItem(THEME_STORAGE_KEY, on ? '1' : '0');
  } catch { /* quota / private */ }
}

function initThemeToggle() {
  let on = false;
  try {
    on = localStorage.getItem(THEME_STORAGE_KEY) === '1';
  } catch { /* ignore */ }
  applyVaporwaveTheme(on);
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      applyVaporwaveTheme(!isVaporwaveTheme());
      if (typeof showAppToast === 'function') {
        showAppToast(isVaporwaveTheme() ? 'Vaporwave on 🌴' : 'Classic theme', 1800);
      }
    });
  }
}

function hideBootShell(ok, detail) {
  if (window.__bootTimer) {
    clearInterval(window.__bootTimer);
    window.__bootTimer = null;
  }
  const boot = document.getElementById('app-boot');
  const root = document.getElementById('app-root');
  if (ok) {
    if (boot) boot.hidden = true;
    if (root) root.hidden = false;
    document.body.classList.add('app-ready');
    return;
  }
  const msg = document.getElementById('app-boot-msg');
  if (msg) msg.textContent = detail || 'Could not start. Check the console and refresh.';
  if (boot) boot.classList.add('app-boot--error');
}

function showAppToast(message, ms = 3200) {
  const el = document.getElementById('app-toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.classList.add('is-visible');
  clearTimeout(showAppToast._t);
  showAppToast._t = setTimeout(() => {
    el.classList.remove('is-visible');
    el.hidden = true;
  }, ms);
}

window.showAppToast = showAppToast;

function init() {
  const vocabulary = typeof ALL_VOCABULARY !== 'undefined' ? ALL_VOCABULARY : [];
  if (!vocabulary.length) {
    hideBootShell(false, 'Vocabulary data not loaded. Serve this folder over HTTP (not file://).');
    return;
  }

  try {
    if (typeof initPictureGame !== 'function') {
      hideBootShell(false, 'Game script failed to load.');
      return;
    }
    initThemeToggle();
    initPictureGame(vocabulary);
    hideBootShell(true);
  } catch (err) {
    console.error('[boot]', err);
    hideBootShell(false, (err && err.message) || 'Startup error');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
