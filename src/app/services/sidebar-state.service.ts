import { Injectable, signal, computed } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SidebarStateService {
  private _isCollapsed = signal(false);
  private _isOpen = signal(false); // Para móvil

  readonly isCollapsed = this._isCollapsed.asReadonly();
  readonly isOpen = this._isOpen.asReadonly();

  // Computed para el ancho del sidebar
  readonly sidebarWidth = computed(() => {
    if (this._isCollapsed()) {
      return '4rem'; // w-16 = 64px = 4rem
    }
    return '16rem'; // w-64 = 256px = 16rem
  });

  toggleCollapse() {
    this._isCollapsed.update(current => !current);
    // Guardar estado en localStorage
    localStorage.setItem('sidebar-collapsed', JSON.stringify(this._isCollapsed()));
  }

  setCollapsed(collapsed: boolean) {
    this._isCollapsed.set(collapsed);
    localStorage.setItem('sidebar-collapsed', JSON.stringify(collapsed));
  }

  toggleOpen() {
    this._isOpen.update(current => !current);
  }

  setOpen(open: boolean) {
    this._isOpen.set(open);
  }

  loadSavedState() {
    const savedState = localStorage.getItem('sidebar-collapsed');
    if (savedState !== null) {
      this._isCollapsed.set(JSON.parse(savedState));
    }
  }
}
