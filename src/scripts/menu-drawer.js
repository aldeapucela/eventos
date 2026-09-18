// Abrir/cerrar el drawer de navegación móvil (hamburguesa). Único para todo el
// sitio: antes había el partial más cuatro copias inline en archivo/tipos/
// guardados/espacios. El markup se inyecta al primer clic desde modals.js.
import { activeNavFromPath, getMountedModal, mountModal } from './modals.js';

export function setupMenuDrawer() {
  // Los filtros del drawer solo tienen sentido donde hay listado filtrable
  // (portada y páginas temporales, que son las que traen los chips de filtro).
  // Antes lo decidía la plantilla con hideDrawerFilters.
  const showFilters = Boolean(document.querySelector('[data-filter-modal-open], .mobile-chip-row'));

  const open = () => {
    const drawer = mountModal('menuDrawer', { activeNav: activeNavFromPath(), showFilters });
    if (!drawer) return;
    drawer.hidden = false;
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    const drawer = getMountedModal('menuDrawer');
    if (!drawer) return;
    drawer.hidden = true;
    document.body.style.overflow = '';
  };
  const openAddEvent = () => {
    close();
    const modal = mountModal('addEvent');
    if (!modal) return;
    const details = modal.querySelector('[data-add-event-chat-details]');
    const chatButton = modal.querySelector('[data-add-event-chat]');
    if (details) details.hidden = true;
    chatButton?.setAttribute('aria-expanded', 'false');
    const arrow = chatButton?.querySelector('.add-event-choice-arrow');
    if (arrow) arrow.className = 'add-event-choice-arrow fa-solid fa-chevron-down';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('[data-add-event-chat]')?.focus();
  };
  const closeAddEvent = ({ restoreFocus = true } = {}) => {
    const modal = getMountedModal('addEvent');
    if (!modal) return;
    modal.hidden = true;
    const details = modal.querySelector('[data-add-event-chat-details]');
    const chatButton = modal.querySelector('[data-add-event-chat]');
    if (details) details.hidden = true;
    chatButton?.setAttribute('aria-expanded', 'false');
    const arrow = chatButton?.querySelector('.add-event-choice-arrow');
    if (arrow) arrow.className = 'add-event-choice-arrow fa-solid fa-chevron-down';
    document.body.style.overflow = '';
    if (restoreFocus) document.querySelector('[data-add-event-open]')?.focus();
  };
  const toggleAddEventChat = () => {
    const modal = getMountedModal('addEvent');
    if (!modal || modal.hidden) return;
    const details = modal.querySelector('[data-add-event-chat-details]');
    const chatButton = modal.querySelector('[data-add-event-chat]');
    if (!details || !chatButton) return;
    const open = details.hidden;
    details.hidden = !open;
    chatButton.setAttribute('aria-expanded', String(open));
    const arrow = chatButton.querySelector('.add-event-choice-arrow');
    if (arrow) arrow.className = `add-event-choice-arrow fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`;
  };

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-add-event-open]')) {
      event.preventDefault();
      openAddEvent();
      return;
    }
    if (event.target.closest('[data-add-event-close]')) {
      event.preventDefault();
      closeAddEvent();
      return;
    }
    if (event.target.closest('[data-add-event-chat]')) {
      event.preventDefault();
      toggleAddEventChat();
      return;
    }
    if (event.target.closest('[data-menu-open]')) {
      event.preventDefault();
      open();
      return;
    }
    if (event.target.closest('[data-menu-close]')) {
      event.preventDefault();
      close();
      return;
    }
    // Al navegar desde un enlace del drawer, ciérralo.
    if (event.target.closest('[data-menu-drawer] a[href]')) close();
  });

  window.addEventListener('keydown', (event) => {
    const addEvent = getMountedModal('addEvent');
    if (event.key === 'Escape' && addEvent && !addEvent.hidden) {
      closeAddEvent();
      return;
    }
    const drawer = getMountedModal('menuDrawer');
    if (event.key === 'Escape' && drawer && !drawer.hidden) close();
  });
}
