import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SupabaseClientService } from './supabase-client.service';

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
  private static initializationStarted = false; // Guard para evitar múltiples inicializaciones

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

  constructor(private sbClient: SupabaseClientService) {
    // Validar que las variables de entorno estén configuradas
    if (!environment.supabase.url || !environment.supabase.anonKey) {
      console.error('❌ SUPABASE CONFIGURATION ERROR:');
      console.error('Las variables de entorno de Supabase no están configuradas.');
      console.error('En Vercel Dashboard, configura:');
      console.error('- SUPABASE_URL: Tu URL de Supabase');
      console.error('- SUPABASE_ANON_KEY: Tu Anon Key de Supabase');
      throw new Error('Supabase configuration missing');
    }

    // Usar instancia centralizada en vez de createClient local
    this.supabase = this.sbClient.instance;

    // Evitar múltiples inicializaciones
    if (!AuthService.initializationStarted) {
      AuthService.initializationStarted = true;
      console.log('🔐 AuthService: Inicializando por primera vez...');
      
      // Inicializar estado de autenticación
      this.initializeAuth();

      // Escuchar cambios de sesión (solo una vez)
      this.supabase.auth.onAuthStateChange((event, session) => {
        console.log('🔐 AuthService: Auth state change:', event);
        this.handleAuthStateChange(event, session);
      });
    } else {
      console.log('🔐 AuthService: Ya inicializado, reutilizando instancia');
      this.loadingSubject.next(false);
    }
  }

  // Exponer cliente supabase directamente para componentes de callback/reset
  get client() { return this.supabase; }

  // Método auxiliar para reintentar operaciones que fallan por NavigatorLockAcquireTimeoutError
  private async retryWithBackoff<T>(
    operation: () => Promise<T>, 
    maxRetries: number = 3, 
    baseDelay: number = 1000
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        const isLockError = error?.message?.includes('NavigatorLockAcquireTimeoutError') ||
                           error?.name?.includes('NavigatorLockAcquireTimeoutError');
        
        if (isLockError && attempt < maxRetries) {
          console.warn(`🔄 Lock error on attempt ${attempt}, retrying in ${baseDelay * attempt}ms...`);
          await new Promise(resolve => setTimeout(resolve, baseDelay * attempt));
          continue;
        }
        
        // Si no es error de lock o se agotaron los reintentos, re-lanzar el error
        throw error;
      }
    }
    
    // Esto nunca debería ejecutarse, pero TypeScript lo requiere
    throw new Error('Unexpected error in retryWithBackoff');
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

    // Aseguramos existencia de fila app (sin crear empresa, ya existe)
    await this.ensureAppUser(user);
    // Cargar datos finales
    const appUser = await this.fetchAppUserByAuthId(user.id);
    if (appUser) {
      this.userProfileSubject.next(appUser);
      this.userRole.set(appUser.role);
      if (appUser.company_id) this.companyId.set(appUser.company_id);
  // Sólo admin es considerado admin; owner es rol de negocio sin privilegios dev
  this.isAdmin.set(appUser.role === 'admin');
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
      console.log('🔍 Fetching app user for auth ID:', authId);
      const { data, error } = await this.supabase
        .from('users')
        .select(`id, auth_user_id, email, name, role, active, company_id, permissions, company:companies(id, name, slug, is_active, settings)`) // company join via foreign key name assumption
        .eq('auth_user_id', authId)
        .single();
      
      if (error) {
        console.error('❌ Error fetching app user:', error);
        return null;
      }
      if (!data) {
        console.warn('⚠️ No app user found for auth ID:', authId);
        return null;
      }
      
      console.log('✅ App user fetched successfully:', data);
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
  private async ensureAppUser(authUser: User, companyName?: string): Promise<void> {
    try {
      console.log('🔄 Ensuring app user exists for:', authUser.email);
      
      // 1. Buscar por auth_user_id
      const existing = await this.supabase
        .from('users')
        .select('id, auth_user_id, email, role, company_id')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();
      
      if (existing.error) {
        console.error('❌ Error checking existing user:', existing.error);
        throw existing.error;
      }
      
      if (existing.data) {
        console.log('✅ User already exists in app database');
        return; // ya está enlazado
      }

      console.log('➕ Creating new app user...');

      // 2. Crear empresa con el nombre proporcionado o uno por defecto
      let companyId: string | null = null;
      const finalCompanyName = companyName || (authUser.email || 'Mi Empresa').split('@')[0];
      
      console.log('🏢 Creating company:', finalCompanyName);
      
      // Usar retry para operaciones críticas que pueden fallar por locks
      const company = await this.retryWithBackoff(async () => {
        const { data, error } = await this.supabase
          .from('companies')
          .insert({ name: finalCompanyName, slug: this.generateSlug(finalCompanyName) })
          .select()
          .single();
        
        if (error) {
          console.error('❌ Error creating company:', error);
          throw error;
        }
        
        return data;
      });
      
      if (!company) {
        throw new Error('Company creation returned no data');
      }
      
      if (!company) {
        throw new Error('Company creation returned no data');
      }
      
      companyId = company.id;
      console.log('✅ Company created with ID:', companyId);

      // 4. Crear fila usuario (companyId ya tiene valor garantizado)
      if (!companyId) {
        throw new Error('Company ID is required but was not created');
      }
      
      console.log('👤 Creating user with company_id:', companyId);
      
      // Usar retry para la creación del usuario también
      await this.retryWithBackoff(async () => {
        const insertResult = await this.supabase.from('users').insert({
          email: authUser.email,
          name: (authUser.user_metadata && (authUser.user_metadata as any)['full_name']) || authUser.email?.split('@')[0] || 'Usuario',
          role: 'owner', // Siempre owner ya que cada usuario crea su propia empresa
          active: true,
          company_id: companyId, // Garantizado que no es null
          auth_user_id: authUser.id,
          permissions: {}
        });
        
        if (insertResult.error) {
          console.error('❌ Error creating app user:', insertResult.error);
          throw insertResult.error;
        }
        
        return insertResult;
      });
      
      console.log('✅ App user created successfully');
      
    } catch (e) {
      console.error('❌ Error in ensureAppUser:', e);
      throw e;
    }
  }

  // ==========================================
  // MÉTODOS PÚBLICOS DE AUTENTICACIÓN
  // ==========================================

  async login(credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🔐 Attempting login (email):', credentials.email);
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password
      });

      if (error) throw error;

      console.log('✅ Login success, session user id:', data.user?.id);
      return { success: true };
    } catch (error: any) {
      console.error('🔐 Login error raw:', error);
      return {
        success: false,
        error: this.getErrorMessage(error.message)
      };
    }
  }

  async register(registerData: RegisterData): Promise<{ success: boolean; pendingConfirmation?: boolean; error?: string }> {
    try {
      console.log('🚀 Starting registration process...', { email: registerData.email, company: registerData.company_name });
      
      // Usar retry para el signup también
      const { data, error } = await this.retryWithBackoff(async () => {
        return await this.supabase.auth.signUp({
          email: registerData.email,
          password: registerData.password,
          options: {
            data: { full_name: registerData.full_name },
            emailRedirectTo: `${window.location.origin}/auth/callback`
          }
        });
      });
      
      if (error) throw error;
      const autoLogin = registerData.autoLogin !== false; // por defecto true

      // Si el proyecto requiere confirmación de email, data.session será null
      const requiresEmailConfirm = !data.session;

      if (data.user) {
        console.log('✅ Auth user created, now creating app user...');
        // Crear fila app con empresa (si se proporciona nombre)
        await this.ensureAppUser(data.user, registerData.company_name);
        console.log('✅ App user created successfully');
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
