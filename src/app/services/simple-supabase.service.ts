import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Tipos súper simples
export interface SimpleClient {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company_id?: string;
  created_at?: string;
}

export interface SimpleCompany {
  id: string;
  name: string;
  website?: string; // Nueva propiedad
  legacy_negocio_id?: string; // Nueva propiedad
  created_at?: string;
}

export interface SimpleUser {
  id: string;
  email: string;
  name: string; // Cambiado de full_name a name
  company_id: string;
  company_name?: string;
  company_website?: string;
  permissions?: {
    moduloFacturas: boolean;
    moduloPresupuestos: boolean;
    moduloServicios: boolean;
    moduloMaterial: boolean;
  };
  created_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SimpleSupabaseService {
  private supabase: SupabaseClient;
  private currentCompany = new BehaviorSubject<string | null>(null);

  // Simple UUID validator to avoid appending bad filters like company_id=eq.1
  private isValidUuid(id: string | null | undefined): boolean {
    if (!id) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  }

  constructor(private sbClient: SupabaseClientService) {
    // Reusar instancia compartida
    this.supabase = this.sbClient.instance;
  }

  // === GETTERS ===
  get company$(): Observable<string | null> {
    return this.currentCompany.asObservable();
  }

  get currentCompanyId(): string | null {
    return this.currentCompany.value;
  }

  // === FUNCIONES BÁSICAS ===

  /**
   * Test de conexión - súper simple
   */
  async testConnection(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const { data, error } = await this.supabase
        .from('companies')
        .select('*')
        .limit(1);

      if (error) {
        return { success: false, message: error.message };
      }

      return { 
        success: true, 
        message: 'Conexión exitosa', 
        data: data 
      };
    } catch (error: any) {
      return { 
        success: false, 
        message: 'Error de conexión: ' + error.message 
      };
    }
  }

  /**
   * Obtener todas las empresas - súper simple
   */
  async getCompanies(): Promise<{ success: boolean; data?: SimpleCompany[]; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('companies')
        .select('id, name, website, legacy_negocio_id, created_at')
        .is('deleted_at', null)
        .order('name');

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data || [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Establecer empresa actual - súper simple
   */
  async setCurrentCompany(companyId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Intentar establecer contexto (puede fallar pero no importa)
      await this.supabase.rpc('set_current_company_context', { company_uuid: companyId } as any);
      
      // Actualizar estado local
      this.currentCompany.next(companyId);
      
      return { success: true };
    } catch (error: any) {
      // Aunque falle la función, al menos establecemos local
      this.currentCompany.next(companyId);
      return { success: true }; // No fallar por esto
    }
  }

  /**
   * Obtener clientes de la empresa actual - súper simple
   */
  async getClients(): Promise<{ success: boolean; data?: SimpleClient[]; error?: string }> {
    try {
      let query = this.supabase
        .from('clients')
        .select('*')
        .is('deleted_at', null);

      // Si hay empresa seleccionada, filtrar
      const companyId = this.currentCompanyId;
      if (this.isValidUuid(companyId)) {
        query = query.eq('company_id', companyId);
      } else if (companyId) {
        // If there's a companyId but it's not a UUID, avoid adding the filter which would form invalid REST query
        console.warn('SimpleSupabaseService: ignoring non-UUID currentCompanyId when filtering clients:', companyId);
      }

      const { data, error } = await query;

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data || [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Crear cliente - súper simple
   */
  async createClient(name: string, email?: string): Promise<{ success: boolean; data?: SimpleClient; error?: string }> {
    try {
      const companyId = this.currentCompanyId;
      if (!companyId) {
        return { success: false, error: 'No hay empresa seleccionada' };
      }

      const { data, error } = await this.supabase
        .from('clients')
        .insert({
          name,
          email,
          company_id: companyId
        } as any)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Eliminar cliente (soft delete) - súper simple
   */
  async deleteClient(clientId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase
        .from('clients')
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq('id', clientId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Buscar clientes - súper simple
   */
  async searchClients(searchTerm: string): Promise<{ success: boolean; data?: SimpleClient[]; error?: string }> {
    try {
      let query = this.supabase
        .from('clients')
        .select('*')
        .or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .is('deleted_at', null);

      // Si hay empresa seleccionada, filtrar
      const companyId = this.currentCompanyId;
      if (this.isValidUuid(companyId)) {
        query = query.eq('company_id', companyId);
      } else if (companyId) {
        console.warn('SimpleSupabaseService: ignoring non-UUID currentCompanyId when searching clients:', companyId);
      }

      const { data, error } = await query;

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data || [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Query directa para debugging - súper simple
   */
  async rawQuery(table: string, limit: number = 5): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from(table)
        .select('*')
        .limit(limit);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data || [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener estadísticas simples
   */
  async getStats(): Promise<{ 
    success: boolean; 
    data?: { 
      companies: number; 
      clients: number; 
      users: number;
      clientsInCurrentCompany: number;
    }; 
    error?: string 
  }> {
    try {
      const companiesResult = await this.rawQuery('companies');
      const clientsResult = await this.rawQuery('clients', 1000);
      const usersResult = await this.rawQuery('users', 1000);
      
      const companies = companiesResult.data?.length || 0;
      const allClients = clientsResult.data?.length || 0;
      const users = usersResult.data?.length || 0;
      
      const currentCompanyId = this.currentCompanyId;
      const clientsInCurrentCompany = currentCompanyId 
        ? (clientsResult.data?.filter(c => c.company_id === currentCompanyId).length || 0)
        : 0;

      return {
        success: true,
        data: {
          companies,
          clients: allClients,
          users,
          clientsInCurrentCompany
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // === MÉTODO PARA ACCESO DIRECTO AL CLIENTE SUPABASE ===
  getClient(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Obtener usuarios con información de empresa
   */
  async getUsers(): Promise<{ success: boolean; data?: SimpleUser[]; error?: string }> {
    try {
      const { data, error } = await this.supabase
        .from('users_with_company')
        .select('*')
        .order('company_name, name'); // Cambiado de full_name a name

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data || [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener usuarios de la empresa actual
   */
  async getCurrentCompanyUsers(): Promise<{ success: boolean; data?: SimpleUser[]; error?: string }> {
    try {
      const currentCompanyId = this.currentCompanyId;
      if (!currentCompanyId) {
        return { success: false, error: 'No hay empresa seleccionada' };
      }

      if (!this.isValidUuid(currentCompanyId)) {
        return { success: false, error: 'company_id inválido en contexto' };
      }

      const { data, error } = await this.supabase
        .from('users_with_company')
        .select('*')
        .eq('company_id', currentCompanyId)
        .order('name'); // Cambiado de full_name a name

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data || [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener permisos de un usuario
   */
  async getUserPermissions(userEmail: string): Promise<{ 
    success: boolean; 
    data?: SimpleUser['permissions']; 
    error?: string 
  }> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_user_permissions', { user_email: userEmail });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data || {} };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Ejecutar migración de usuarios legacy
   */
  async migrateLegacyUsers(): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      console.log('🔄 Iniciando migración de usuarios legacy...');
      
      // Verificar que no existan datos ya
      const { data: existingCompanies } = await this.supabase
        .from('companies')
        .select('*')
        .limit(1);
      
      if (existingCompanies && existingCompanies.length > 0) {
        console.log('⚠️ Ya existen datos en companies, saltando migración');
        return { success: true, data: 'Migration skipped - data already exists' };
      }
      
      // Empresa 1: Michinanny
      const { data: michinanny, error: errorMichinanny } = await this.supabase
        .from('companies')
        .insert({
          name: 'Michinanny',
          website: 'https://michinanny.es/',
          legacy_negocio_id: '671da7c0ecec11a7b9bbc029'
        })
        .select()
        .single();
      
      if (errorMichinanny) throw errorMichinanny;
      
      // Usuarios de Michinanny
      const { error: errorUsersMichinanny } = await this.supabase.from('users').insert([
        {
          company_id: michinanny.id,
          email: 'marina@michinanny.es',
          name: 'Marina Casado García',
          permissions: { moduloFacturas: false, moduloPresupuestos: false, moduloServicios: true, moduloMaterial: false }
        },
        {
          company_id: michinanny.id,
          email: 'eva@michinanny.es', 
          name: 'Eva Marín',
          permissions: { moduloFacturas: false, moduloPresupuestos: false, moduloServicios: true, moduloMaterial: false }
        }
      ]);
      
      if (errorUsersMichinanny) throw errorUsersMichinanny;
      
      // Empresa 2: Anscarr
      const { data: anscarr, error: errorAnscarr } = await this.supabase
        .from('companies')
        .insert({
          name: 'Anscarr',
          website: 'https://anscarr.es/',
          legacy_negocio_id: '67f38eaeb414535e7d278c71'
        })
        .select()
        .single();
        
      if (errorAnscarr) throw errorAnscarr;
      
      const { error: errorUsersAnscarr } = await this.supabase.from('users').insert([
        {
          company_id: anscarr.id,
          email: 'roberto@anscarr.es',
          name: 'Roberto Hugo Carrera',
          permissions: { moduloFacturas: true, moduloPresupuestos: true, moduloServicios: true, moduloMaterial: true }
        },
        {
          company_id: anscarr.id,
          email: 'carlosanscarr@gmail.com',
          name: 'Carlos José Anaya Escalante', 
          permissions: { moduloFacturas: true, moduloPresupuestos: true, moduloServicios: true, moduloMaterial: true }
        }
      ]);
      
      if (errorUsersAnscarr) throw errorUsersAnscarr;
      
      // Empresa 3: Libera Tus Creencias
      const { data: libera, error: errorLibera } = await this.supabase
        .from('companies')
        .insert({
          name: 'Libera Tus Creencias',
          website: 'https://liberatuscreencias.com/',
          legacy_negocio_id: '67227971cb317c137fb1dd20'
        })
        .select()
        .single();
        
      if (errorLibera) throw errorLibera;
      
      const { error: errorUsersLibera } = await this.supabase.from('users').insert({
        company_id: libera.id,
        email: 'vanesa@liberatuscreencias.com',
        name: 'Vanesa Santa Maria Garibaldi',
        permissions: { moduloFacturas: false, moduloPresupuestos: false, moduloServicios: false, moduloMaterial: false }
      });
      
      if (errorUsersLibera) throw errorUsersLibera;
      
      // Empresa 4: SatPCGo
      const { data: satpcgo, error: errorSatpcgo } = await this.supabase
        .from('companies')
        .insert({
          name: 'SatPCGo',
          website: 'https://satpcgo.es/',
          legacy_negocio_id: '6717b325cb317c137fb1dcd5'
        })
        .select()
        .single();
        
      if (errorSatpcgo) throw errorSatpcgo;
      
      const { error: errorUsersSatpcgo } = await this.supabase.from('users').insert({
        company_id: satpcgo.id,
        email: 'jesus@satpcgo.es',
        name: 'Jesus',
        permissions: { moduloFacturas: false, moduloPresupuestos: false, moduloServicios: false, moduloMaterial: false }
      });
      
      if (errorUsersSatpcgo) throw errorUsersSatpcgo;
      
      console.log('✅ Migración completada exitosamente');
      return { 
        success: true, 
        data: {
          companies: 4,
          users: 5,
          message: 'Migration completed successfully'
        }
      };
      
    } catch (error: any) {
      console.error('❌ Error en migración:', error);
      return { 
        success: false, 
        error: error.message || 'Error desconocido en migración' 
      };
    }
  }
}
