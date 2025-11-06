import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService, AppUser } from '../../services/auth.service';
import { SupabaseModulesService } from '../../services/supabase-modules.service';

interface CompanyUser {
  id: string;
  email: string;
  name: string | null;
  role: 'owner' | 'admin' | 'member' | 'client' | 'none';
  active: boolean;
}

interface ModuleToggle {
  key: string;
  label: string;
  state: 'activado' | 'desactivado' | 'heredado';
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

  loading = false;
  users: CompanyUser[] = [];
  modules = signal<Array<{ key: string; label: string }>>([]);
  // assignments map: userId -> moduleKey -> state
  private assignments = signal<Map<string, Map<string, ModuleToggle['state']>>>(new Map());
  saveStatus: string | null = null;

  ngOnInit(): void {
    this.loadMatrix();
  }

  async loadMatrix() {
    this.loading = true;
    try {
  const res: any = await this.modulesService.adminListUserModules().toPromise();
  this.users = (res?.users || []) as CompanyUser[];
  const mods = (res?.modules || []).map((m: any) => ({ key: m.key, label: m.name }));
      this.modules.set(mods);
      const map = new Map<string, Map<string, ModuleToggle['state']>>();
  for (const asg of (res?.assignments || [])) {
        const u = asg.user_id as string;
        const k = asg.module_key as string;
        const s = (asg.status as string) as ModuleToggle['state'];
        if (!map.has(u)) map.set(u, new Map());
        map.get(u)!.set(k, s);
      }
      this.assignments.set(map);
    } catch (e) {
      console.warn('Error loading matrix', e);
    } finally {
      this.loading = false;
    }
  }

  stateFor(userId: string, modKey: string): ModuleToggle['state'] {
    return this.assignments().get(userId)?.get(modKey) || 'heredado';
  }

  async setState(userId: string, modKey: string, state: ModuleToggle['state']) {
    try {
      if (state === 'heredado') {
        // delete explicit override
        await this.sb.from('user_modules').delete().eq('user_id', userId).eq('module_key', modKey);
      } else {
        this.saveStatus = 'saving';
        await this.modulesService.adminSetUserModule(userId, modKey, state).toPromise();
      }
      // refresh local map
      const map = new Map(this.assignments());
      if (!map.has(userId)) map.set(userId, new Map());
      if (state === 'heredado') map.get(userId)!.delete(modKey); else map.get(userId)!.set(modKey, state);
      this.assignments.set(map);
      this.saveStatus = 'ok';
      setTimeout(() => this.saveStatus = null, 1200);
    } catch (e) {
      console.warn('Error updating state', e);
      this.saveStatus = 'error';
      setTimeout(() => this.saveStatus = null, 2000);
    }
  }
}
