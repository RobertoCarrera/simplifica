import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { SupabaseClientService } from './supabase-client.service';
import type { Database } from './supabase-db.types';
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
  Functions: { };
  };
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient<Database>;
  private currentUser = new BehaviorSubject<User | null>(null);
  private currentCompany = new BehaviorSubject<string | null>(null);

  constructor(private sbClient: SupabaseClientService) {
    // Usar instancia singleton en lugar de crear nueva
    this.supabase = this.sbClient.instance;

    // NO configurar auth state aquí - AuthService se encarga de eso
    // Solo mantener estado local para compatibilidad
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

  // Contexto de compañía ahora sólo se mantiene local (RLS se basa en joins, no en función mutadora)
  async setCompanyContext(companyId: string): Promise<void> {
    this.currentCompany.next(companyId);
  }

  async clearCompanyContext(): Promise<void> {
    this.currentCompany.next(null);
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
