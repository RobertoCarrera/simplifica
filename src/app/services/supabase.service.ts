import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { SupabaseClientService } from './supabase-client.service';
import type { Database } from './supabase-db.types';

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
    return await this.supabase.rpc(functionName as any, params);
  }

  // === REALTIME METHODS ===
  subscribe(table: string, callback: (payload: any) => void) {
    return this.supabase
      .channel(`public:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
      .subscribe();
  }
}
