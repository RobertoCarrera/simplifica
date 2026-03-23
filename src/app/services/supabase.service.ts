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

  private static readonly MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
  private static readonly BLOCKED_EXTENSIONS = new Set([
    'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'pif', 'vbs', 'js', 'wsh', 'wsf',
    'ps1', 'sh', 'bash', 'csh', 'jar', 'php', 'pl', 'py', 'rb', 'jsp', 'asp', 'aspx',
  ]);

  async uploadFile(
    bucket: string,
    path: string,
    file: File
  ): Promise<{ data: any; error: any }> {
    if (file.size > SupabaseService.MAX_FILE_SIZE) {
      return { data: null, error: { message: 'El archivo supera el tamaño máximo permitido (20 MB)' } };
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (SupabaseService.BLOCKED_EXTENSIONS.has(ext)) {
      return { data: null, error: { message: 'Tipo de archivo no permitido' } };
    }
    return await this.supabase.storage.from(bucket).upload(path, file);
  }

  async getFileUrl(bucket: string, path: string, expiresInSeconds: number = 120): Promise<string | null> {
    const { data } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds); // Default 2 min, caller can override

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
