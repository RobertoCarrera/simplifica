import { Injectable, inject, signal } from '@angular/core';
import { from, Observable } from 'rxjs';
import { SupabaseClientService } from './supabase-client.service';
import { environment } from '../../environments/environment';

export interface EffectiveModule {
  key: string;
  name: string;
  description?: string | null;
  category?: string | null;
  position?: number;
  enabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class SupabaseModulesService {
  private supabaseClient = inject(SupabaseClientService);
  private get fnBase() { return (environment.edgeFunctionsBaseUrl || '').replace(/\/+$/, ''); }

  // Cache in-memory to avoid repeated calls during a session
  private _modules = signal<EffectiveModule[] | null>(null);

  get modulesSignal() { return this._modules.asReadonly(); }

  fetchEffectiveModules(): Observable<EffectiveModule[]> {
    return from(this.executeFetchEffectiveModules());
  }

  private async executeFetchEffectiveModules(): Promise<EffectiveModule[]> {
    const client = this.supabaseClient.instance;
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${this.fnBase}/get-effective-modules`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token ?? ''}`,
        'apikey': environment.supabase.anonKey,
      }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'No se pudieron obtener los módulos');
    const list = (json?.modules || []) as EffectiveModule[];
    this._modules.set(list);
    return list;
  }

  adminSetUserModule(targetUserId: string, moduleKey: string, status: 'activado' | 'desactivado'): Observable<{ success: boolean }>{
    return from(this.executeAdminSetUserModule(targetUserId, moduleKey, status));
  }

  private async executeAdminSetUserModule(targetUserId: string, moduleKey: string, status: 'activado' | 'desactivado'): Promise<{ success: boolean }>{
    const client = this.supabaseClient.instance;
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${this.fnBase}/admin-set-user-module`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token ?? ''}`,
        'Content-Type': 'application/json',
        'apikey': environment.supabase.anonKey,
      },
      body: JSON.stringify({ target_user_id: targetUserId, module_key: moduleKey, status })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'No se pudo actualizar el módulo del usuario');
    return { success: true };
  }

  // Admin list matrix of users, modules and assignments
  adminListUserModules(): Observable<{ users: any[]; modules: any[]; assignments: any[] }> {
    return from(this.executeAdminListUserModules());
  }

  private async executeAdminListUserModules(): Promise<{ users: any[]; modules: any[]; assignments: any[] }> {
    const client = this.supabaseClient.instance;
    const { data: { session } } = await client.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${this.fnBase}/admin-list-user-modules`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token ?? ''}`,
        'apikey': environment.supabase.anonKey,
      }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || 'No se pudo obtener la matriz de módulos por usuario');
    return { users: json?.users || [], modules: json?.modules || [], assignments: json?.assignments || [] };
  }
}
