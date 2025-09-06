import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          slug: string | null;
          settings: any;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          slug?: string | null;
          settings?: any;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string | null;
          settings?: any;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      users: {
        Row: {
          id: string;
          company_id: string;
          email: string;
          name: string | null;
          role: 'owner' | 'admin' | 'member';
          active: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          email: string;
          name?: string | null;
          role?: 'owner' | 'admin' | 'member';
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          email?: string;
          name?: string | null;
          role?: 'owner' | 'admin' | 'member';
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      clients: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          address: any;
          metadata: any;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          address?: any;
          metadata?: any;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          address?: any;
          metadata?: any;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      services: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          description: string | null;
          price_cents: number | null;
          duration_minutes: number | null;
          active: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          description?: string | null;
          price_cents?: number | null;
          duration_minutes?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          description?: string | null;
          price_cents?: number | null;
          duration_minutes?: number | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      jobs: {
        Row: {
          id: string;
          company_id: string;
          client_id: string;
          service_id: string | null;
          type: 'service' | 'repair';
          title: string;
          description: string | null;
          status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
          scheduled_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          assigned_to: string | null;
          metadata: any;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          client_id: string;
          service_id?: string | null;
          type: 'service' | 'repair';
          title: string;
          description?: string | null;
          status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
          scheduled_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          assigned_to?: string | null;
          metadata?: any;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          client_id?: string;
          service_id?: string | null;
          type?: 'service' | 'repair';
          title?: string;
          description?: string | null;
          status?: 'pending' | 'in_progress' | 'completed' | 'cancelled';
          scheduled_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          assigned_to?: string | null;
          metadata?: any;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      attachments: {
        Row: {
          id: string;
          company_id: string;
          job_id: string | null;
          file_name: string;
          file_path: string;
          file_size: number | null;
          mime_type: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          company_id: string;
          job_id?: string | null;
          file_name: string;
          file_path: string;
          file_size?: number | null;
          mime_type?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          company_id?: string;
          job_id?: string | null;
          file_name?: string;
          file_path?: string;
          file_size?: number | null;
          mime_type?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
      };
    };
    Functions: {
      set_current_company_context: {
        Args: { company_uuid: string | null };
        Returns: void;
      };
      get_current_company_id: {
        Args: {};
        Returns: string | null;
      };
    };
  };
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient<Database>;
  private currentUser = new BehaviorSubject<User | null>(null);
  private currentCompany = new BehaviorSubject<string | null>(null);

  constructor() {
    // Configuración con environment
    this.supabase = createClient<Database>(
      environment.supabase.url,
      environment.supabase.anonKey
    );

    // Inicializar auth state
    this.supabase.auth.onAuthStateChange((event: any, session: any) => {
      this.currentUser.next(session?.user ?? null);
    });
  }

  // === AUTH METHODS ===
  get user$(): Observable<User | null> {
    return this.currentUser.asObservable();
  }

  get currentUserValue(): User | null {
    return this.currentUser.value;
  }

  async signUp(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password
    });
    return { data, error };
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });
    return { data, error };
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    this.currentCompany.next(null);
    return { error };
  }

  // === MULTI-TENANT METHODS ===
  get company$(): Observable<string | null> {
    return this.currentCompany.asObservable();
  }

  get currentCompanyId(): string | null {
    return this.currentCompany.value;
  }

  async setCompanyContext(companyId: string): Promise<void> {
    try {
      // Establecer contexto en Supabase
      const { error } = await this.supabase.rpc('set_current_company_context', {
        company_uuid: companyId
      } as any);

      if (error) throw error;

      // Actualizar estado local
      this.currentCompany.next(companyId);
    } catch (error) {
      console.error('Error setting company context:', error);
      throw error;
    }
  }

  async clearCompanyContext(): Promise<void> {
    try {
      const { error } = await this.supabase.rpc('set_current_company_context', {
        company_uuid: null
      } as any);

      if (error) throw error;
      this.currentCompany.next(null);
    } catch (error) {
      console.error('Error clearing company context:', error);
      throw error;
    }
  }

  // === DATABASE METHODS ===
  get db() {
    return this.supabase;
  }

  from<T extends keyof Database['public']['Tables']>(table: T) {
    return this.supabase.from(table);
  }

  // === STORAGE METHODS ===
  get storage() {
    return this.supabase.storage;
  }

  async uploadFile(
    bucket: string,
    path: string,
    file: File
  ): Promise<{ data: any; error: any }> {
    return await this.supabase.storage.from(bucket).upload(path, file);
  }

  async getFileUrl(bucket: string, path: string): Promise<string | null> {
    const { data } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 5); // 5 minutos

    return data?.signedUrl || null;
  }

  // === HELPER METHODS ===
  async executeFunction(functionName: string, params: any = {}) {
    return await this.supabase.rpc(functionName, params);
  }

  // === REALTIME METHODS ===
  subscribe(table: string, callback: (payload: any) => void) {
    return this.supabase
      .channel(`public:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
      .subscribe();
  }
}
