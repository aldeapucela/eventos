// Modal de suscripción (calendario / RSS). Autocontenido y usado por todas las
// páginas: el markup se inyecta al primer clic desde modals.js.
import { getMountedModal, mountModal } from './modals.js';

export function setupSubscribe() {
  let pickerReady = false;

  const open = (section = 'calendar') => {
    const modal = mountModal('subscribe');
    if (!modal) return;
    if (!pickerReady) {
      setupCategoryPicker(modal);
      pickerReady = true;
    }
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    scrollSubscribePanel(modal, section);
    modal.querySelector('[data-subscribe-close]')?.focus({ preventScroll: true });
  };

  const close = () => {
    const modal = getMountedModal('subscribe');
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    const panel = modal.querySelector('.subscribe-modal-panel') || modal;
    panel.scrollTop = 0;
  };

  document.addEventListener('click', async (event) => {
    const openBtn = event.target.closest('[data-subscribe-open]');
    if (openBtn) {
      event.preventDefault();
      // Los disparadores viven dentro del drawer móvil: ciérralo antes de abrir
      // para no apilar dos capas (lo hacía home.js antes de compartir módulo).
      const drawer = openBtn.closest('[data-menu-drawer]');
      if (drawer) {
        drawer.hidden = true;
        document.body.style.overflow = '';
      }
      open(openBtn.dataset.subscribeOpen || 'calendar');
      return;
    }
    if (event.target.closest('[data-subscribe-close]')) {
      event.preventDefault();
      close();
      return;
    }
    const copyBtn = event.target.closest('[data-copy-url]');
    if (copyBtn) {
      event.preventDefault();
      await copySubscribeUrl(copyBtn);
    }
  });

  window.addEventListener('keydown', (event) => {
    const modal = getMountedModal('subscribe');
    if (event.key === 'Escape' && modal && !modal.hidden) close();
  });
}

function scrollSubscribePanel(modal, section = 'calendar') {
  const panel = modal.querySelector('.subscribe-modal-panel') || modal;
  const syncScroll = () => {
    const target = modal.querySelector(`[data-subscribe-section="${section}"]`);
    const shouldPinCalendar = section === 'calendar' && window.matchMedia('(max-width: 640px)').matches;
    panel.scrollTop = 0;
    if (!target || (section === 'calendar' && !shouldPinCalendar)) {
      return;
    }
    const panelTop = panel.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    panel.scrollTop = Math.max(0, panel.scrollTop + targetTop - panelTop - 16);
  };
  syncScroll();
  window.requestAnimationFrame(() => window.requestAnimationFrame(syncScroll));
}

async function copySubscribeUrl(button) {
  const key = button.dataset.copyUrl;
  const input = document.querySelector(`[data-copy-source="${key}"]`);
  if (!input) return;
  const value = input.value;
  const originalLabel = button.textContent;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      input.removeAttribute('readonly');
      input.focus();
      input.select();
      document.execCommand('copy');
      input.setAttribute('readonly', 'readonly');
    }
    button.textContent = 'Copiado';
    window.setTimeout(() => {
      button.textContent = originalLabel;
    }, 1200);
  } catch {
    input.focus();
    input.select();
  }
}

function setupCategoryPicker(modal) {
  const picker = modal.querySelector('[data-category-picker]');
  const select = modal.querySelector('[data-category-select]');
  const urlInput = modal.querySelector('[data-category-url]');
  if (!picker || !select || !urlInput) return;
  const googleLink = modal.querySelector('[data-category-google]');
  const appleLink = modal.querySelector('[data-category-apple]');
  const feeds = Array.isArray(window.__CATEGORY_FEEDS__) ? window.__CATEGORY_FEEDS__ : [];
  const syncFeed = () => {
    const selected = feeds.find((feed) => feed.slug === select.value) || feeds[0];
    if (!selected) return;
    urlInput.value = selected.url;
    urlInput.setAttribute('value', selected.url);
    if (googleLink) {
      googleLink.href = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(selected.webcalUrl)}`;
    }
    if (appleLink) {
      appleLink.href = selected.webcalUrl;
    }
  };
  select.addEventListener('change', syncFeed);
  syncFeed();
}
