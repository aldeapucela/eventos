import { getMountedModal, mountModal } from './modals.js';

const DISMISS_UNTIL_KEY = 'aldeapucela_install_app_dismissed_until';
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const PROMOTION_SCROLL_THRESHOLD = 240;

// El modal se inyecta al abrirlo (ver modals.js), así que sus nodos se resuelven
// cuando existen. Los <li> de pasos los pinta updateModalCopy() como antes.
const getModal = () => getMountedModal('install');
const previewMode = (() => {
  const isLocalPreview = /^(?:localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  const mode = new URLSearchParams(window.location.search).get('pwa-preview');
  return isLocalPreview && (mode === 'android' || mode === 'ios') ? mode : '';
})();
let deferredInstallPrompt = null;

const isIos = () => {
  if (previewMode) return previewMode === 'ios';
  const userAgent = window.navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(userAgent) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
};

const isMobileDevice = () => {
  if (previewMode) return true;
  const userAgent = window.navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(userAgent) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1) ||
    window.matchMedia?.('(max-width: 640px)').matches;
};

const isInstalled = () => (
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true
);

function isPromotionDismissed() {
  try {
    return Number(window.localStorage.getItem(DISMISS_UNTIL_KEY) || 0) > Date.now();
  } catch {
    return false;
  }
}

const hasNativeInstallPrompt = () => Boolean(deferredInstallPrompt) || previewMode === 'android';

function dismissPromotion() {
  try {
    window.localStorage.setItem(DISMISS_UNTIL_KEY, String(Date.now() + DISMISS_DURATION_MS));
  } catch {}
  syncInstallUi();
}

function canOfferInstall() {
  return isMobileDevice() && !isInstalled();
}

function hasScrolledEnough() {
  return window.scrollY >= PROMOTION_SCROLL_THRESHOLD;
}

function updateModalCopy() {
  const modal = getModal();
  if (!modal) return;
  const modalCopy = modal.querySelector('[data-install-app-copy]');
  const modalSteps = modal.querySelector('[data-install-app-steps]');
  const modalConfirmButton = modal.querySelector('[data-install-app-confirm]');
  if (!modalCopy || !modalSteps || !modalConfirmButton) return;
  modalCopy.hidden = true;
  modalCopy.textContent = '';

  if (isIos()) {
    modalSteps.innerHTML = [
      '<li class="install-app-step"><span class="install-app-step-icon" aria-hidden="true"><i class="fa-solid fa-arrow-up-from-bracket"></i></span><span>Abre <strong>Compartir</strong>.</span></li>',
      '<li class="install-app-step"><span class="install-app-step-icon" aria-hidden="true"><i class="fa-solid fa-square-plus"></i></span><span>Elige <strong>Añadir a inicio</strong>.</span></li>'
    ].join('');
    modalConfirmButton.hidden = true;
    return;
  }

  if (hasNativeInstallPrompt()) {
    modalSteps.innerHTML = [
      '<li class="install-app-step"><span class="install-app-step-icon" aria-hidden="true"><i class="fa-solid fa-mobile-screen-button"></i></span><span>Confirma la instalación.</span></li>'
    ].join('');
    modalConfirmButton.hidden = false;
    return;
  }

  modalSteps.innerHTML = [
    '<li class="install-app-step"><span class="install-app-step-icon" aria-hidden="true"><i class="fa-solid fa-ellipsis-vertical"></i></span><span>Abre el menú.</span></li>',
    '<li class="install-app-step"><span class="install-app-step-icon" aria-hidden="true"><i class="fa-solid fa-download"></i></span><span>Elige <strong>Instalar aplicación</strong>.</span></li>'
  ].join('');
  modalConfirmButton.hidden = true;
}

function syncInstallUi() {
  const canOffer = canOfferInstall();
  const shouldShow = canOffer && hasScrolledEnough() && !isPromotionDismissed();

  document.querySelectorAll('[data-install-app-open]').forEach((trigger) => {
    trigger.classList.toggle('hidden', !shouldShow);
  });
  document.querySelectorAll('[data-install-app-label]').forEach((label) => {
    label.textContent = hasNativeInstallPrompt() ? 'Instalar app' : 'Añadir al inicio';
  });
  updateModalCopy();
}

function openInstallModal() {
  const modal = mountModal('install');
  if (!modal) return;
  updateModalCopy();
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  modal.querySelector('[data-install-app-close]')?.focus({ preventScroll: true });
}

function closeInstallModal({ snooze = false } = {}) {
  const modal = getModal();
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
  if (snooze) dismissPromotion();
}

async function promptNativeInstall() {
  if (!deferredInstallPrompt) return;
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  syncInstallUi();
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice?.catch(() => null);
  if (choice?.outcome === 'dismissed') dismissPromotion();
  syncInstallUi();
}

async function handleInstallAction() {
  if (deferredInstallPrompt) {
    dismissPromotion();
    await promptNativeInstall();
    return;
  }
  if (previewMode === 'android') return;
  openInstallModal();
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  syncInstallUi();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  closeInstallModal();
  syncInstallUi();
});

window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', syncInstallUi);

let scrollSyncPending = false;
window.addEventListener('scroll', () => {
  if (scrollSyncPending) return;
  scrollSyncPending = true;
  window.requestAnimationFrame(() => {
    scrollSyncPending = false;
    syncInstallUi();
  });
}, { passive: true });

document.addEventListener('click', async (event) => {
  if (event.target.closest('[data-install-app-open]')) {
    event.preventDefault();
    await handleInstallAction();
    return;
  }
  if (event.target.closest('[data-install-app-close]')) {
    event.preventDefault();
    closeInstallModal({ snooze: true });
    return;
  }
  if (event.target.closest('[data-install-app-confirm]')) {
    event.preventDefault();
    await promptNativeInstall();
  }
});

window.addEventListener('keydown', (event) => {
  const modal = getModal();
  if (event.key === 'Escape' && modal && !modal.hidden) closeInstallModal({ snooze: true });
});

// El botón [data-install-app-open] vive dentro del drawer, que se inyecta al
// abrirlo: hay que volver a decidir si mostrarlo cuando aparece.
document.addEventListener('modal:mounted', (event) => {
  if (event.detail?.key === 'menuDrawer') syncInstallUi();
});

syncInstallUi();
