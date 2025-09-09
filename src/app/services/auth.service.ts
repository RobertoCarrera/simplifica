import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

// AppUser refleja la fila de public.users + datos de compañía
export interface AppUser {
  id: string;              // id interno de public.users (no auth id)
  auth_user_id: string;    // id de auth.users
  email: string;
  name?: string | null;
  role: 'owner' | 'admin' | 'member';
  active: boolean;
  company_id?: string | null;
  permissions?: any;
  // Campos derivados
  full_name?: string | null; // compatibilidad legacy (sidebar, etc.)
  company?: Company | null;
}

export interface Company {
  id: string;
  name: string;
  slug: string | null;
  is_active: boolean;
  settings?: any;
  subscription_tier?: string | null;
  max_users?: number | null;
  logo_url?: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  full_name: string;
  company_name?: string;
  autoLogin?: boolean; // por si se quiere desactivar en algún flujo futuro
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;
  private router = inject(Router);

  // Signals para estado reactivo
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private userProfileSubject = new BehaviorSubject<AppUser | null>(null);
  private loadingSubject = new BehaviorSubject<boolean>(true);

  // Observables públicos
  currentUser$ = this.currentUserSubject.asObservable();
  userProfile$ = this.userProfileSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();

  // Signals
  isAuthenticated = signal<boolean>(false);
  isAdmin = signal<boolean>(false);
  userRole = signal<string>('');
  companyId = signal<string>('');

  constructor() {
    // Validar que las variables de entorno estén configuradas
    if (!environment.supabase.url || !environment.supabase.anonKey) {
      console.error('❌ SUPABASE CONFIGURATION ERROR:');
      console.error('Las variables de entorno de Supabase no están configuradas.');
      console.error('En Vercel Dashboard, configura:');
      console.error('- SUPABASE_URL: Tu URL de Supabase');
      console.error('- SUPABASE_ANON_KEY: Tu Anon Key de Supabase');
      throw new Error('Supabase configuration missing');
    }

    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );

    // Inicializar estado de autenticación
    this.initializeAuth();

    // Escuchar cambios de sesión
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.handleAuthStateChange(event, session);
    });
  }

  private async initializeAuth() {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session?.user) {
        await this.setCurrentUser(session.user);
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
    } finally {
      this.loadingSubject.next(false);
    }
  }

  private async handleAuthStateChange(event: string, session: Session | null) {
    if (event === 'SIGNED_IN' && session?.user) {
      await this.setCurrentUser(session.user);
    } else if (event === 'SIGNED_OUT') {
      this.clearUserData();
    }
  }

  private async setCurrentUser(user: User) {
    this.currentUserSubject.next(user);
    this.isAuthenticated.set(true);

    // Aseguramos existencia de fila app
    await this.ensureAppUser(user);
    // Cargar datos finales
    const appUser = await this.fetchAppUserByAuthId(user.id);
    if (appUser) {
      this.userProfileSubject.next(appUser);
      this.userRole.set(appUser.role);
      if (appUser.company_id) this.companyId.set(appUser.company_id);
      this.isAdmin.set(['owner', 'admin'].includes(appUser.role));
    }
  }

  private clearUserData() {
    this.currentUserSubject.next(null);
    this.userProfileSubject.next(null);
    this.isAuthenticated.set(false);
    this.isAdmin.set(false);
    this.userRole.set('');
    this.companyId.set('');
  }

  // Obtiene la fila de public.users + compañía
  private async fetchAppUserByAuthId(authId: string): Promise<AppUser | null> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select(`id, auth_user_id, email, name, role, active, company_id, permissions, company:companies(id, name, slug, is_active, settings)`) // company join via foreign key name assumption
        .eq('auth_user_id', authId)
        .single();
      if (error) return null;
      if (!data) return null;
      const company = Array.isArray((data as any).company) ? (data as any).company[0] : (data as any).company;
      const appUser: AppUser = {
        id: (data as any).id,
        auth_user_id: (data as any).auth_user_id,
        email: (data as any).email,
        name: (data as any).name,
        role: (data as any).role,
        active: (data as any).active,
        company_id: (data as any).company_id,
        permissions: (data as any).permissions,
        full_name: (data as any).name || (data as any).email,
        company: company || null
      };
      return appUser;
    } catch (e) {
      return null;
    }
  }

  // Asegura que existe fila en public.users y enlaza auth_user_id
  private async ensureAppUser(authUser: User): Promise<void> {
    // 1. Buscar por auth_user_id
    const existing = await this.supabase
      .from('users')
      .select('id, auth_user_id, email, role, company_id')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();
    if (existing.data) return; // ya está enlazado

  // (Se eliminó lógica de invitaciones previas: auto-registro solamente)

    // 3. Crear empresa y usuario si es el primer usuario del sistema
    const { count } = await this.supabase
      .from('users')
      .select('id', { count: 'exact', head: true });
    let companyId: string | null = null;
    if (!count || count === 0) {
      // Crear empresa inicial
      const companyName = (authUser.email || 'Mi Empresa').split('@')[0];
      const { data: company, error: compErr } = await this.supabase
        .from('companies')
        .insert({ name: companyName, slug: this.generateSlug(companyName) })
        .select()
        .single();
      if (!compErr && company) companyId = company.id;
    }

    // 4. Crear fila usuario
    await this.supabase.from('users').insert({
      email: authUser.email,
  name: (authUser.user_metadata && (authUser.user_metadata as any)['full_name']) || authUser.email?.split('@')[0] || 'Usuario',
      role: companyId ? 'owner' : 'member',
      active: true,
      company_id: companyId,
      auth_user_id: authUser.id,
      permissions: {}
    });
  }

  // ==========================================
  // MÉTODOS PÚBLICOS DE AUTENTICACIÓN
  // ==========================================

  async login(credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password
      });

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: this.getErrorMessage(error.message) 
      };
    }
  }

  async register(registerData: RegisterData): Promise<{ success: boolean; pendingConfirmation?: boolean; error?: string }> {
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email: registerData.email,
        password: registerData.password,
        options: {
          data: { full_name: registerData.full_name }
        }
      });
      if (error) throw error;
      const autoLogin = registerData.autoLogin !== false; // por defecto true

      // Si el proyecto requiere confirmación de email, data.session será null
      const requiresEmailConfirm = !data.session;

      if (data.user) {
        // Crear fila app y empresa si procede (aunque no haya sesión todavía)
        await this.ensureAppUser(data.user);
        if (registerData.company_name) {
          await this.createCompanyForUser(data.user.id, registerData.company_name);
        }
      }

      if (requiresEmailConfirm) {
        return { success: true, pendingConfirmation: true };
      }

      if (autoLogin) {
        // Si ya hay sesión onAuthStateChange disparará setCurrentUser
        // En algunos casos raros: intentar login explícito si no hay session
        if (!data.session) {
          const { error: loginErr } = await this.supabase.auth.signInWithPassword({
            email: registerData.email,
            password: registerData.password
          });
          if (loginErr && loginErr.message !== 'Email not confirmed') throw loginErr;
        }
      }

      return { success: true, pendingConfirmation: false };
    } catch (e: any) {
      return { success: false, error: this.getErrorMessage(e.message) };
    }
  }

  async logout(): Promise<void> {
    try {
      await this.supabase.auth.signOut();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }

  async resetPassword(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: this.getErrorMessage(error.message) 
      };
    }
  }

  async updatePassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: this.getErrorMessage(error.message) 
      };
    }
  }

  // ==========================================
  // GESTIÓN DE EMPRESA
  // ==========================================

  private async createCompanyForUser(authUserId: string, companyName: string) {
    try {
      const { data: company, error: companyError } = await this.supabase
        .from('companies')
        .insert({ name: companyName, slug: this.generateSlug(companyName) })
        .select()
        .single();
      if (companyError) throw companyError;

      // Actualizar fila de users
      await this.supabase
        .from('users')
        .update({ company_id: company.id, role: 'owner' })
        .eq('auth_user_id', authUserId);
    } catch (e) {
      console.error('Error creating company for user:', e);
    }
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') + '-' + Date.now();
  }

  // ==========================================
  // UTILIDADES
  // ==========================================

  private getErrorMessage(error: string): string {
    const errorMessages: { [key: string]: string } = {
      'Invalid login credentials': 'Credenciales incorrectas',
      'Email not confirmed': 'Email no confirmado',
      'User already registered': 'El usuario ya está registrado',
      'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres',
      'Password should be at least 6 characters long': 'La contraseña debe tener al menos 6 caracteres',
      'Invalid email': 'Email inválido'
    };

    return errorMessages[error] || error;
  }

  // Getters para acceso directo
  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  // Exponer cliente Supabase de forma controlada (solo lectura)
  get client(): SupabaseClient {
    return this.supabase;
  }

  get userProfile(): AppUser | null {
    return this.userProfileSubject.value;
  }

  get isLoading(): boolean {
    return this.loadingSubject.value;
  }

  // Método para verificar permisos
  hasPermission(requiredRole: string): boolean {
    const roleHierarchy = ['member', 'admin', 'owner'];
    const userRoleIndex = roleHierarchy.indexOf(this.userRole());
    const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);
    return userRoleIndex >= requiredRoleIndex;
  }

  // Forzar recarga (callback auth)
  async refreshCurrentUser() {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (session?.user) await this.setCurrentUser(session.user);
  }
}
