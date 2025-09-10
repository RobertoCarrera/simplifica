import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class DevRoleService {
  
  constructor(private authService: AuthService) {
    // Sin configuración automática - todo se basa en el rol del usuario autenticado
  }

  isDev(): boolean {
    const userRole = this.authService.userProfile?.role;
  // Considered "dev" only if explicitly admin
  return userRole === 'admin';
  }

  canSeeDevTools(): boolean {
    const userRole = this.authService.userProfile?.role;
  // Solo usuarios admin pueden ver herramientas de desarrollo
  return userRole === 'admin';
  }

  canSeeAllCompanies(): boolean {
    const userRole = this.authService.userProfile?.role;
  // Solo admin puede ver todas las compañías
  return userRole === 'admin';
  }

  getUserRole(): string {
    return this.authService.userProfile?.role || 'member';
  }

  hasPermission(permission: string): boolean {
    const userRole = this.authService.userProfile?.role;
  // Only admin has elevated implicit permissions here
  return userRole === 'admin';
  }

  canManageUsers(): boolean {
    const userRole = this.authService.userProfile?.role;
  return userRole === 'admin';
  }
}
