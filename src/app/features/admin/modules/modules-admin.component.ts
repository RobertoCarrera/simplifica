import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '../../../services/auth.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { ToastService } from '../../../services/toast.service';

/** All known sidebar navigation items with their display labels and icons */
const SIDEBAR_CATALOG: { key: string; label: string; icon: string; category: 'core' | 'production' }[] = [
  { key: 'core_/inicio',        label: 'Inicio',           icon: 'fa-home',            category: 'core' },
  { key: 'core_/notifications', label: 'Notificaciones',   icon: 'fa-bell',            category: 'core' },
  { key: 'core_/clientes',      label: 'Clientes',        icon: 'fa-users',           category: 'core' },
  { key: 'core_/gdpr',          label: 'RGPD',             icon: 'fa-shield-alt',      category: 'core' },
  { key: 'core_/webmail',       label: 'Webmail',          icon: 'fa-envelope',        category: 'core' },
  { key: 'core_/webmail-admin', label: 'Admin Webmail',    icon: 'fa-shield-alt',      category: 'core' },
  { key: 'core_/admin/modulos', label: 'Gestión Módulos',  icon: 'fa-sliders-h',       category: 'core' },
  { key: 'moduloSAT',            label: 'Dispositivos / Tickets', icon: 'fa-mobile-alt', category: 'production' },
  { key: 'moduloChat',           label: 'Chat',             icon: 'fa-comments',        category: 'production' },
  { key: 'moduloPresupuestos',  label: 'Presupuestos',     icon: 'fa-file-alt',        category: 'production' },
  { key: 'moduloFacturas',      label: 'Facturación',      icon: 'fa-file-invoice-dollar', category: 'production' },
  { key: 'moduloAnaliticas',    label: 'Analíticas',       icon: 'fa-chart-line',      category: 'production' },
  { key: 'moduloProductos',     label: 'Productos',         icon: 'fa-box-open',        category: 'production' },
  { key: 'moduloServicios',     label: 'Servicios',         icon: 'fa-tools',           category: 'production' },
  { key: 'moduloReservas',      label: 'Reservas',          icon: 'fa-calendar-alt',    category: 'production' },
  { key: 'moduloProyectos',     label: 'Proyectos',         icon: 'fa-project-diagram', category: 'production' },
];

export interface SidebarOrderItem {
  key: string;
  label: string;
  icon: string;
  category: 'core' | 'production';
  order: number;
  visible: boolean;
  devMode: boolean;
}

@Component({
  selector: 'app-modules-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './modules-admin.component.html',
  styleUrls: ['./modules-admin.component.scss']
})
export class ModulesAdminComponent implements OnInit {
  private sb: SupabaseClient = inject(SupabaseClientService).instance;
  private auth = inject(AuthService);
  private modulesService = inject(SupabaseModulesService);
  private toast = inject(ToastService);

  loading = signal(false);
  companies: any[] = [];
  companyQuery: string = '';

  // Sidebar order management
  sidebarOrderLoading = signal(false);
  sidebarOrderSaving = signal(false);
  sidebarOrderItems = signal<SidebarOrderItem[]>([]);
  activeTab = signal<'companies' | 'sidebar'>('companies');

  // Drag & drop state
  draggedKey = signal<string | null>(null);
  dragOverKey = signal<string | null>(null);

  ngOnInit(): void {
    this.loadCompanies();
  }

  async loadCompanies() {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.modulesService.adminListCompanies());
      this.companies = (res?.companies || []);
    } catch (e) {
      console.warn('Error loading companies', e);
      this.toast.error('Error', 'No se pudieron cargar las empresas.');
    } finally {
      this.loading.set(false);
    }
  }

  // Filtered companies for search box
  get filteredCompanies() {
    const q = (this.companyQuery || '').toLowerCase().trim();
    if (!q) return this.companies;
    return this.companies.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.id || '').toLowerCase().includes(q)
    );
  }

  async toggleCompanyModule(company: any, moduleKey: string) {
    // Find the module in the company's list
    const mod = company.modules.find((m: any) => m.key === moduleKey);
    if (!mod) return;

    const currentStatus = mod.status;
    const newStatus = (currentStatus === 'active' || currentStatus === 'activado') ? 'inactive' : 'active';

    // Optimistic update
    mod.status = newStatus;

    try {
      await firstValueFrom(this.modulesService.adminSetCompanyModule(company.id, moduleKey, newStatus));
      this.toast.success('Módulo actualizado', `El módulo se ha ${newStatus === 'active' ? 'activado' : 'desactivado'} correctamente.`);
    } catch (e) {
      console.error('Error toggling module:', e);
      // Revert on error
      mod.status = currentStatus;
      this.toast.error('Error', 'No se pudo actualizar el módulo.');
    }
  }

  getLabel(mod: any) {
    return mod.label || mod.key;
  }

  // ── Sidebar Order Management ────────────────────────────────────────────────

  async loadSidebarOrder() {
    this.sidebarOrderLoading.set(true);
    try {
      const { data, error } = await this.sb.rpc('get_sidebar_navigation_order');
      if (error) throw error;

      const orderMap = new Map<string, { order: number; visible: boolean; devMode: boolean }>(
        (data || []).map((r: any) => [r.module_key, { order: r.order_index, visible: r.is_visible, devMode: r.is_dev_mode ?? false }])
      );

      // Build items: start with catalog, apply saved order/visibility
      this.sidebarOrderItems.set(
        SIDEBAR_CATALOG.map((cat) => {
          const saved = orderMap.get(cat.key);
          return {
            key: cat.key,
            label: cat.label,
            icon: cat.icon,
            category: cat.category,
            order: saved?.order ?? null as any,
            visible: saved?.visible ?? true,
            devMode: saved?.devMode ?? false,
          };
        }).sort((a, b) => {
          // Sort: custom order first, then core items, then by id fallback
          if (a.order !== null && b.order !== null) return a.order - b.order;
          if (a.order !== null) return -1;
          if (b.order !== null) return 1;
          // Fallback: core before production, then by label
          if (a.category !== b.category) return a.category === 'core' ? -1 : 1;
          return a.label.localeCompare(b.label);
        })
      );
    } catch (e: any) {
      this.toast.error('Error', 'No se pudo cargar el orden del sidebar.');
    } finally {
      this.sidebarOrderLoading.set(false);
    }
  }

  async saveSidebarOrder() {
    this.sidebarOrderSaving.set(true);
    try {
      const entries = this.sidebarOrderItems().map((item, index) => ({
        module_key: item.key,
        order_index: item.order ?? index,
        is_visible: item.visible,
        is_dev_mode: item.devMode,
      }));

      await firstValueFrom(this.modulesService.adminUpdateSidebarOrder(entries));
      this.toast.success('Orden guardado', 'El orden del sidebar se ha guardado correctamente.');
    } catch (e: any) {
      this.toast.error('Error', e.message || 'No se pudo guardar el orden del sidebar.');
    } finally {
      this.sidebarOrderSaving.set(false);
    }
  }

  moveItemUp(item: SidebarOrderItem) {
    const items = [...this.sidebarOrderItems()];
    const idx = items.findIndex((i) => i.key === item.key);
    if (idx <= 0) return;
    // Swap order values with the item above
    const above = items[idx - 1];
    const tempOrder = above.order;
    above.order = item.order;
    item.order = tempOrder;
    // Re-sort and re-assign sequential orders to fill gaps
    items.sort((a, b) => {
      if (a.order !== null && b.order !== null) return a.order - b.order;
      if (a.order !== null) return -1;
      if (b.order !== null) return 1;
      return a.label.localeCompare(b.label);
    });
    // Normalize orders to be sequential starting from 0
    items.forEach((it, i) => { it.order = i; });
    this.sidebarOrderItems.set(items);
  }

  moveItemDown(item: SidebarOrderItem) {
    const items = [...this.sidebarOrderItems()];
    const idx = items.findIndex((i) => i.key === item.key);
    if (idx < 0 || idx >= items.length - 1) return;
    const below = items[idx + 1];
    const tempOrder = below.order;
    below.order = item.order;
    item.order = tempOrder;
    items.sort((a, b) => {
      if (a.order !== null && b.order !== null) return a.order - b.order;
      if (a.order !== null) return -1;
      if (b.order !== null) return 1;
      return a.label.localeCompare(b.label);
    });
    items.forEach((it, i) => { it.order = i; });
    this.sidebarOrderItems.set(items);
  }

  onDragStart(item: SidebarOrderItem) {
    this.draggedKey.set(item.key);
  }

  onDragOver(event: DragEvent, item: SidebarOrderItem) {
    event.preventDefault();
    if (this.draggedKey() !== item.key) {
      this.dragOverKey.set(item.key);
    }
  }

  onDrop(targetItem: SidebarOrderItem) {
    const dragKey = this.draggedKey();
    this.draggedKey.set(null);
    this.dragOverKey.set(null);
    if (!dragKey || dragKey === targetItem.key) return;
    const items = [...this.sidebarOrderItems()];
    const fromIdx = items.findIndex((i) => i.key === dragKey);
    const toIdx = items.findIndex((i) => i.key === targetItem.key);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    items.forEach((it, i) => { it.order = i; });
    this.sidebarOrderItems.set(items);
  }

  onDragEnd() {
    this.draggedKey.set(null);
    this.dragOverKey.set(null);
  }

  toggleItemVisible(item: SidebarOrderItem) {
    const items = [...this.sidebarOrderItems()];
    const idx = items.findIndex((i) => i.key === item.key);
    if (idx < 0) return;
    items[idx] = { ...items[idx], visible: !items[idx].visible };
    this.sidebarOrderItems.set(items);
  }

  toggleItemDevMode(item: SidebarOrderItem) {
    const items = [...this.sidebarOrderItems()];
    const idx = items.findIndex((i) => i.key === item.key);
    if (idx < 0) return;
    items[idx] = { ...items[idx], devMode: !items[idx].devMode };
    this.sidebarOrderItems.set(items);
  }

  isSuperAdmin(): boolean {
    const role = this.auth.userRole();
    return role === 'super_admin' || !!this.auth.userProfile?.is_super_admin || this.auth.isRoberto();
  }

  switchTab(tab: 'companies' | 'sidebar') {
    this.activeTab.set(tab);
    if (tab === 'sidebar') this.loadSidebarOrder();
  }
}
