import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '../../../services/auth.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { ToastService } from '../../../services/toast.service';

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

  loading = false;
  companies: any[] = [];
  companyQuery: string = '';

  ngOnInit(): void {
    this.loadCompanies();
  }

  async loadCompanies() {
    this.loading = true;
    try {
      const res = await this.modulesService.adminListCompanies().toPromise();
      this.companies = (res?.companies || []);
    } catch (e) {
      console.warn('Error loading companies', e);
      this.toast.error('Error', 'No se pudieron cargar las empresas.');
    } finally {
      this.loading = false;
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
      await this.modulesService.adminSetCompanyModule(company.id, moduleKey, newStatus).toPromise();
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
}
