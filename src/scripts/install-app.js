import { getMountedModal, mountModal } from './modals.js';

const INTERACTED_KEY = 'aldeapucela_install_app_interacted';
const LEGACY_DISMISS_KEY = 'aldeapucela_install_app_dismissed_until';
const PROMOTION_SCROLL_THRESHOLD = 240;
const diagnosticMode = new URLSearchParams(window.location.search).get('pwa-debug') === '1';
const diagnostics = { nativeEvents: 0, promptCalls: 0, error: '', outcome: '', worker: 'comprobando', manifest: 'comprobando' };

function updateDiagnostics(modal) {
  if (!diagnosticMode || !modal) return;
  let panel = modal.querySelector('[data-install-diagnostics]');
  if (!panel) {
    panel = document.createElement('pre');
    panel.dataset.installDiagnostics = '';
    panel.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.4 monospace;margin-top:16px;max-height:35vh;overflow:auto;';
    modal.querySelector('.install-app-modal-body')?.append(panel);
  }
  panel.textContent = JSON.stringify({
    version: 'pwa-diagnostic-2',
    browser: navigator.userAgent,
    nativeReady: Boolean(deferredInstallPrompt),
    earlyCapture: Boolean(window.__PWA_INSTALL_PROMPT__),
    installed: isInstalled(),
    relatedInstalled,
    installCheckPending,
    ...diagnostics,
    worker: navigator.serviceWorker?.controller?.state || diagnostics.worker,
    workerError: window.__PWA_WORKER_ERROR__ || '',
    pageState: document.readyState
  }, null, 2);
}

if (diagnosticMode) {
  const trackRegistration = (registration) => {
    const refresh = () => {
      const worker = registration?.active || registration?.waiting || registration?.installing;
      diagnostics.worker = worker?.state || 'sin registro activo';
      updateDiagnostics(getModal());
    };
    refresh();
    registration?.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', refresh);
      refresh();
    });
    registration?.installing?.addEventListener('statechange', refresh);
  };
  (window.__PWA_WORKER_REGISTRATION__ || navigator.serviceWorker?.getRegistration())?.then(trackRegistration)
    .catch((error) => { diagnostics.worker = error.message; updateDiagnostics(getModal()); });
  navigator.serviceWorker?.ready.then(trackRegistration);
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    updateDiagnostics(getModal());
  });
  fetch('/manifest.webmanifest', { cache: 'no-store' }).then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const manifest = await response.json();
    const icons = await Promise.all((manifest.icons || []).map(async (icon) => {
      const response = await fetch(icon.src, { cache: 'no-store' });
      return `${icon.sizes}: HTTP ${response.status}`;
    }));
    diagnostics.manifest = `${manifest.display}; ${icons.join('; ')}`;
    updateDiagnostics(getModal());
  }).catch((error) => { diagnostics.manifest = error.message; updateDiagnostics(getModal()); });
}

// El modal se inyecta al abrirlo (ver modals.js), así que sus nodos se resuelven
// cuando existen. Los <li> de pasos los pinta updateModalCopy() como antes.
const getModal = () => getMountedModal('install');
const previewMode = (() => {
  const isLocalPreview = /^(?:localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  const mode = new URLSearchParams(window.location.search).get('pwa-preview');
  return isLocalPreview && (mode === 'android' || mode === 'ios') ? mode : '';
})();
let deferredInstallPrompt = window.__PWA_INSTALL_PROMPT__ || null;
let nativeInstallSupported = Boolean(deferredInstallPrompt);
let promptInProgress = false;
let relatedInstalled = false;
let installCheckPending = typeof window.navigator.getInstalledRelatedApps === 'function';
let interacted = (() => {
  try {
    return Boolean(window.localStorage.getItem(INTERACTED_KEY) || window.localStorage.getItem(LEGACY_DISMISS_KEY));
  } catch {
    return false;
  }
})();

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
  relatedInstalled ||
  window.__PWA_INSTALLED__ === true ||
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true
);

const hasNativeInstallPrompt = () => previewMode ? previewMode === 'android' : Boolean(deferredInstallPrompt);

function markInteracted() {
  interacted = true;
  try {
    window.localStorage.setItem(INTERACTED_KEY, '1');
    window.localStorage.removeItem(LEGACY_DISMISS_KEY);
  } catch {}
  syncInstallUi();
}

function canOfferInstall() {
  return !installCheckPending && (isMobileDevice() || nativeInstallSupported || hasNativeInstallPrompt()) && !isInstalled();
}

async function checkInstalledApps() {
  if (typeof window.navigator.getInstalledRelatedApps !== 'function') return;
  // Un fallo o una API lenta no deben borrar el acceso a las instrucciones.
  const timeout = window.setTimeout(() => {
    installCheckPending = false;
    syncInstallUi();
  }, 1500);
  try {
    const apps = await window.navigator.getInstalledRelatedApps();
    const manifestUrl = new URL('/manifest.webmanifest', window.location.href).href;
    relatedInstalled = apps.some((app) => app.platform === 'webapp' && app.url && new URL(app.url, window.location.href).href === manifestUrl);
    if (relatedInstalled) closeInstallModal();
  } catch (error) {
    diagnostics.relatedAppsError = `${error.name}: ${error.message}`;
  } finally {
    window.clearTimeout(timeout);
    installCheckPending = false;
    syncInstallUi();
  }
}

function hasScrolledEnough() {
  return Boolean(previewMode) || window.scrollY >= PROMOTION_SCROLL_THRESHOLD;
}

function updateModalCopy() {
  const modal = getModal();
  if (!modal) return;
  const modalCopy = modal.querySelector('[data-install-app-copy]');
  const modalSteps = modal.querySelector('[data-install-app-steps]');
  const modalConfirmButton = modal.querySelector('[data-install-app-confirm]');
  if (!modalCopy || !modalSteps || !modalConfirmButton) return;
  updateDiagnostics(modal);
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
  document.querySelectorAll('[data-install-app-open]').forEach((trigger) => {
    const floating = trigger.classList.contains('install-app-pill');
    trigger.classList.toggle('hidden', !(canOffer && (!floating || hasScrolledEnough())));
    trigger.classList.toggle('install-app-pill-compact', floating && interacted && !hasNativeInstallPrompt());
    trigger.disabled = promptInProgress;
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

function closeInstallModal() {
  const modal = getModal();
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

async function promptNativeInstall() {
  if (!deferredInstallPrompt || promptInProgress) return;
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  window.__PWA_INSTALL_PROMPT__ = null;
  promptInProgress = true;
  diagnostics.promptCalls += 1;
  diagnostics.userActivation = window.navigator.userActivation?.isActive ?? null;
  syncInstallUi();
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    diagnostics.outcome = choice?.outcome || '';
  } catch (error) {
    diagnostics.error = `${error.name}: ${error.message}`;
    // Si el navegador retira el permiso, conserva el acceso a las instrucciones.
    openInstallModal();
  } finally {
    promptInProgress = false;
    syncInstallUi();
  }
}

async function handleInstallAction() {
  if (isInstalled() || promptInProgress) return;
  markInteracted();
  // La vista local no debe abrir un instalador real del navegador anfitrión.
  if (previewMode) {
    if (previewMode === 'ios') openInstallModal();
    return;
  }
  if (deferredInstallPrompt) {
    await promptNativeInstall();
    return;
  }
  openInstallModal();
}

window.addEventListener('beforeinstallprompt', (event) => {
  diagnostics.nativeEvents += 1;
  event.preventDefault();
  deferredInstallPrompt = event;
  nativeInstallSupported = true;
  window.__PWA_INSTALLED__ = false;
  relatedInstalled = false;
  syncInstallUi();
});

window.addEventListener('appinstalled', () => {
  window.__PWA_INSTALLED__ = true;
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
    closeInstallModal();
    return;
  }
  if (event.target.closest('[data-install-app-confirm]')) {
    event.preventDefault();
    await promptNativeInstall();
  }
});

window.addEventListener('keydown', (event) => {
  const modal = getModal();
  if (event.key === 'Escape' && modal && !modal.hidden) closeInstallModal();
});

// El botón [data-install-app-open] vive dentro del drawer, que se inyecta al
// abrirlo: hay que volver a decidir si mostrarlo cuando aparece.
document.addEventListener('modal:mounted', (event) => {
  if (event.detail?.key === 'menuDrawer') syncInstallUi();
});

syncInstallUi();
checkInstalledApps();
window.addEventListener('focus', checkInstalledApps);
