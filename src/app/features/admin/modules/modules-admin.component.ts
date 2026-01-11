import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { ToastService } from '../../../services/toast.service';
import {
  LucideAngularModule,
  LUCIDE_ICONS,
  LucideIconProvider,
  Smartphone,
  Package,
  Wrench,
  MessageCircle,
  TrendingUp,
  FileText,
  Receipt,
  Calendar,
  Sparkles,
  Box
} from 'lucide-angular';

interface CompanyModule {
  key: string;
  label: string;
  status: 'active' | 'inactive';
}

@Component({
  selector: 'app-modules-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  providers: [
    {
      provide: LUCIDE_ICONS,
      useValue: new LucideIconProvider({
        Smartphone,
        Package,
        Wrench,
        MessageCircle,
        TrendingUp,
        FileText,
        Receipt,
        Calendar,
        Sparkles,
        Box
      })
    }
  ],
  templateUrl: './modules-admin.component.html',
  styleUrls: ['./modules-admin.component.scss']
})
export class ModulesAdminComponent implements OnInit {
  private auth = inject(AuthService);
  private modulesService = inject(SupabaseModulesService);
  private toastService = inject(ToastService);

  loading = false;

  // Companies
  companies: Array<{ id: string, name: string, subscription_tier: string, is_active: boolean }> = [];
  selectedCompanyId: string | null = null;
  companyQuery: string = '';

  // Company Modules
  companyModules = signal<CompanyModule[]>([]);
  saveStatus: string | null = null;

  ngOnInit(): void {
    this.loadCompanies();
  }

  async loadCompanies() {
    try {
      const companiesRes = await this.modulesService.adminListCompanies().toPromise();
      this.companies = (companiesRes && companiesRes.companies) ? companiesRes.companies : [];

      // Try to preselect my company if present (for convenience)
      const me = this.auth.userProfile;
      const myCompany = this.companies.find(c => c.id === me?.company_id) || null;
      this.selectedCompanyId = myCompany?.id || null;

      if (this.selectedCompanyId) {
        await this.loadMatrix();
      }
    } catch (e) {
      console.error('Error loading companies', e);
    }
  }

  async loadMatrix() {
    if (!this.selectedCompanyId) return;
    this.loading = true;
    try {
      const res = await this.modulesService.adminListCompanyModules(this.selectedCompanyId).toPromise();
      this.companyModules.set(res?.modules || []);
    } catch (e) {
      console.warn('Error loading company modules', e);
    } finally {
      this.loading = false;
    }
  }

  onCompanyChange() {
    this.loadMatrix();
  }

  onCompanyChangeSelect(event: Event) {
    const value = (event.target as HTMLSelectElement | null)?.value || '';
    this.selectedCompanyId = value || null;
    this.onCompanyChange();
  }



  // ... (existing code)

  async toggleModule(modKey: string, currentStatus: string) {
    if (!this.selectedCompanyId) return;
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const currentModules = this.companyModules();

    // VALIDATION: moduloReservas requires moduloServicios
    if (modKey === 'moduloReservas' && newStatus === 'active') {
      const servicesActive = currentModules.find(m => m.key === 'moduloServicios')?.status === 'active';
      if (!servicesActive) {
        this.toastService.warning('Dependencia requerida', 'Para activar el módulo de Reservas, primero debes activar el módulo de Servicios.');
        return;
      }
    }

    // VALIDATION: Cannot disable moduloServicios if moduloReservas is active
    if (modKey === 'moduloServicios' && newStatus === 'inactive') {
      const bookingsActive = currentModules.find(m => m.key === 'moduloReservas')?.status === 'active';
      if (bookingsActive) {
        this.toastService.warning('Dependencia activa', 'No puedes desactivar Servicios mientras el módulo de Reservas esté activo. Desactiva Reservas primero.');
        return;
      }
    }

    // Optimistic update
    this.companyModules.update(list =>
      list.map(m => m.key === modKey ? { ...m, status: newStatus } : m)
    );
    this.saveStatus = 'saving';

    try {
      await this.modulesService.adminToggleCompanyModule(this.selectedCompanyId, modKey, newStatus).toPromise();
      this.saveStatus = 'ok';
      setTimeout(() => this.saveStatus = null, 1200);
    } catch (e) {
      console.error('Error toggling module', e);
      // Revert
      this.companyModules.update(list =>
        list.map(m => m.key === modKey ? { ...m, status: currentStatus as 'active' | 'inactive' } : m)
      );
      this.saveStatus = 'error';
      setTimeout(() => this.saveStatus = null, 2000);
      this.toastService.error('Error', 'No se pudo actualizar el módulo.');
    }
  }

  // ... (existing code)

  getModuleIcon(key: string): string {
    const map: Record<string, string> = {
      'moduloSAT': 'smartphone',
      'moduloProductos': 'package',
      'moduloServicios': 'wrench',
      'moduloChat': 'message-circle',
      'moduloAnaliticas': 'trending-up',
      'moduloPresupuestos': 'file-text',
      'moduloFacturas': 'receipt',
      'moduloReservas': 'calendar',
      'moduloIA': 'sparkles'
    };
    return map[key] || 'box';
  }

  get filteredCompanies() {
    const q = (this.companyQuery || '').toLowerCase().trim();
    if (!q) return this.companies;
    return this.companies.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.id || '').toLowerCase().includes(q)
    );
  }
}
