import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

interface DevUser {
  email: string;
  name: string;
  role: string;
  is_dev: boolean;
  permissions: any;
}

@Injectable({
  providedIn: 'root'
})
export class DevRoleService {
  private supabase: SupabaseClient;
  private currentDevUser = new BehaviorSubject<DevUser | null>(null);
  
  // Usuario dev hardcodeado para desarrollo local
  private localDevUser: DevUser = {
    email: 'dev@simplifica.com',
    name: 'Developer User',
    role: 'owner',
    is_dev: true,
    permissions: {
      moduloFacturas: true,
      moduloMaterial: true,
      moduloServicios: true,
      moduloPresupuestos: true,
      isDev: true,
      canSeeAllCompanies: true,
      canSeeDevTools: true,
      canManageUsers: true
    }
  };

  currentDevUser$ = this.currentDevUser.asObservable();

  constructor(private sbClient: SupabaseClientService) {
    this.supabase = this.sbClient.instance;
    
    // No establecer usuario dev automáticamente - solo para desarrollo manual
    // Si se quiere activar dev, usar el método setDevUser() manualmente
  }

  setDevUser(user: DevUser) {
    this.currentDevUser.next(user);
    console.log('🔧 Dev user set:', user.email, 'Role:', user.role);
  }

  isDev(): boolean {
    const user = this.currentDevUser.value;
    return user?.is_dev === true;
  }

  canSeeDevTools(): boolean {
    const user = this.currentDevUser.value;
    // Solo mostrar herramientas dev si hay un usuario dev activo O en modo desarrollo con dev user explícito
    return user?.permissions?.canSeeDevTools === true || user?.permissions?.isDev === true;
  }

  canSeeAllCompanies(): boolean {
    const user = this.currentDevUser.value;
    // Solo permitir ver todas las compañías si hay un usuario dev activo
    return user?.permissions?.canSeeAllCompanies === true;
  }

  getUserRole(): string {
    const user = this.currentDevUser.value;
    return user?.role || 'member';
  }

  hasPermission(permission: string): boolean {
    const user = this.currentDevUser.value;
    return user?.permissions?.[permission] === true || !environment.production;
  }

  // Verificar usuario en Supabase usando tabla users
  async verifyUserRole(email: string): Promise<DevUser | null> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('active', true)
        .single();

      if (error || !data) {
        console.log('Usuario no encontrado en users table');
        return null;
      }

      const devUser: DevUser = {
        email: data.email,
        name: data.name || 'Usuario',
        role: data.role,
        is_dev: data.permissions?.isDev === true || data.role === 'owner',
        permissions: data.permissions
      };

      this.setDevUser(devUser);
      return devUser;
    } catch (error) {
      console.error('Error verificando rol de usuario:', error);
      return null;
    }
  }
}
