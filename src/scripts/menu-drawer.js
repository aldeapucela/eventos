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

  document.addEventListener('click', (event) => {
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
    const drawer = getMountedModal('menuDrawer');
    if (event.key === 'Escape' && drawer && !drawer.hidden) close();
  });
}
