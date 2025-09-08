import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Observable, from, throwError, BehaviorSubject, combineLatest } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { Customer, CreateCustomer, CreateCustomerDev, UpdateCustomer } from '../models/customer';
import { Address } from '../models/address';
import { environment } from '../../environments/environment';
import { getCurrentSupabaseConfig, devLog, devError, devSuccess } from '../config/supabase.config';

export interface CustomerFilters {
  search?: string;
  locality?: string;
  sortBy?: 'nombre' | 'apellidos' | 'created_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface CustomerStats {
  total: number;
  activeThisMonth: number;
  newThisWeek: number;
  byLocality: { [key: string]: number };
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseCustomersService {
  private supabase: SupabaseClient;
  private config = getCurrentSupabaseConfig();
  
  // Estado reactivo
  private customersSubject = new BehaviorSubject<Customer[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private statsSubject = new BehaviorSubject<CustomerStats | null>(null);
  
  public customers$ = this.customersSubject.asObservable();
  public loading$ = this.loadingSubject.asObservable();
  public stats$ = this.statsSubject.asObservable();

  // Usuario actual para DEV mode
  private currentDevUserId: string | null = null;

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );
    
    devLog('Servicio inicializado', {
      config: this.config,
      environment: environment.production ? 'production' : 'development'
    });
    
    // Escuchar cambios de usuario en DEV mode
    if (this.config.enableDevUserSelector) {
      window.addEventListener('devUserChanged', (event: any) => {
        console.log('DEV: Usuario cambiado a:', event.detail.userId);
        console.log('DEV: Configuración actual:', this.config);
        this.currentDevUserId = event.detail.userId;
        console.log('DEV: currentDevUserId establecido:', this.currentDevUserId);
        this.loadCustomers();
        this.updateStats();
      });
    }
    
    // Cargar datos iniciales
    this.loadCustomers();
  }

  /**
   * Método auxiliar para ejecutar consultas en modo DEV bypaseando RLS
   */
  private async executeQuery(query: any) {
    // En modo DEV, necesitamos bypasear RLS usando RPC
    return query;
  }

  /**
   * Obtener todos los clientes con filtros opcionales
   */
  getCustomers(filters: CustomerFilters = {}): Observable<Customer[]> {
    this.loadingSubject.next(true);
    
    console.log('DEV: getCustomers llamado con:', {
      filters,
      currentDevUserId: this.currentDevUserId,
      useRpcFunctions: this.config.useRpcFunctions,
      isDevelopmentMode: this.config.isDevelopmentMode
    });
    
    // Decidir qué método usar basado en la configuración
    if (this.config.useRpcFunctions && this.currentDevUserId) {
      console.log('DEV: Usando funciones RPC para obtener clientes');
      return this.getCustomersRpc(filters);
    } else if (this.config.isDevelopmentMode) {
      console.log('DEV: Usando método fallback en desarrollo');
      return this.getCustomersWithFallback(filters);
    } else {
      console.log('DEV: Usando consulta estándar para producción');
      return this.getCustomersStandard(filters);
    }
  }

  /**
   * Método RPC para desarrollo - bypasea RLS
   */
  private getCustomersRpc(filters: CustomerFilters = {}): Observable<Customer[]> {
    const rpcCall = filters.search 
      ? this.supabase.rpc('search_customers_dev', { 
          target_user_id: this.currentDevUserId,
          search_term: filters.search 
        })
      : this.supabase.rpc('get_customers_dev', { 
          target_user_id: this.currentDevUserId 
        });

    return from(rpcCall).pipe(
      map(({ data, error }) => {
        if (error) {
          devError('Error en consulta RPC', error);
          throw error;
        }
        devSuccess('Clientes obtenidos via RPC', data?.length || 0);
        return (data as Customer[]) || [];
      }),
      tap(customers => {
        this.customersSubject.next(customers);
        this.loadingSubject.next(false);
      }),
      catchError(error => {
        devError('Error RPC, intentando fallback', error);
        return this.getCustomersWithFallback(filters);
      })
    );
  }

  /**
   * Método estándar para producción - usa autenticación normal
   */
  private getCustomersStandard(filters: CustomerFilters = {}): Observable<Customer[]> {
    let query = this.supabase
      .from('clients')
      .select('*');

    // En producción, se debería usar RLS para filtrar automáticamente por usuario autenticado
    // Por ahora, aplicamos filtros básicos

    // Aplicar filtros de búsqueda
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
    }

    // Ordenamiento
    const sortBy = filters.sortBy || 'created_at';
    const sortOrder = filters.sortOrder || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Paginación
    if (filters.limit) {
      query = query.limit(filters.limit);
      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + filters.limit - 1);
      }
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        
        // Convertir estructura de 'clients' a 'Customer'
        const customers = data?.map(client => ({
          id: client.id,
          nombre: client.name?.split(' ')[0] || '',
          apellidos: client.name?.split(' ').slice(1).join(' ') || '',
          email: client.email,
          telefono: client.phone,
          dni: this.extractFromMetadata(client.metadata, 'dni') || '',
          usuario_id: client.company_id,
          created_at: client.created_at,
          updated_at: client.updated_at,
          activo: !client.deleted_at
        })) || [];
        
        devSuccess('Clientes obtenidos via consulta estándar', customers.length);
        return customers;
      }),
      tap(customers => {
        this.customersSubject.next(customers);
        this.loadingSubject.next(false);
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        devError('Error al cargar clientes', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Método fallback si las funciones RPC no están disponibles
   */
  private getCustomersWithFallback(filters: CustomerFilters = {}): Observable<Customer[]> {
    console.log('DEV: Entrando en getCustomersWithFallback');
    console.log('DEV: currentDevUserId:', this.currentDevUserId);
    console.log('DEV: isDevelopmentMode:', this.config.isDevelopmentMode);
    console.log('DEV: filters:', filters);
    
    let query = this.supabase
      .from('clients')
      .select('*');

    // FILTRO POR EMPRESA EN LUGAR DE USUARIO (adaptado a la estructura real)
    if (this.currentDevUserId && this.config.isDevelopmentMode) {
      console.log('DEV: Buscando company_id para usuario:', this.currentDevUserId);
      
      // Buscar la empresa del usuario seleccionado
      const selectedUser = this.getCurrentUserFromSystemUsers(this.currentDevUserId);
      if (selectedUser) {
        console.log('DEV: Filtrando por company_id:', selectedUser.company_id);
        query = query.eq('company_id', selectedUser.company_id);
      } else {
        console.log('DEV: Usuario no encontrado, no se aplicará filtro');
      }
    } else {
      console.log('DEV: NO se aplica filtro - traerá TODOS los clientes');
    }

    // Aplicar filtros adicionales (adaptados a la estructura real)
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
    }

    // Ordenamiento
    const sortBy = filters.sortBy || 'created_at';
    const sortOrder = filters.sortOrder || 'desc';
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // Paginación
    if (filters.limit) {
      query = query.limit(filters.limit);
      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + filters.limit - 1);
      }
    }

    console.log('DEV: Ejecutando query...');
    return from(query).pipe(
      map(({ data, error }) => {
        console.log('DEV: Respuesta de query:', { data: data?.length || 0, error });
        if (error) {
          console.error('DEV: Error en query:', error);
          throw error;
        }
        
        if (data && data.length > 0) {
          console.log('DEV: Primeros 3 clientes encontrados:', data.slice(0, 3).map(c => ({
            name: c.name,
            email: c.email,
            company_id: c.company_id
          })));
        }
        
        // Convertir la estructura de 'clients' a 'Customer' esperada por la aplicación
        const customers = data?.map(client => ({
          id: client.id,
          nombre: client.name?.split(' ')[0] || '',
          apellidos: client.name?.split(' ').slice(1).join(' ') || '',
          email: client.email,
          telefono: client.phone,
          dni: this.extractFromMetadata(client.metadata, 'dni') || '',
          usuario_id: client.company_id, // Mapear company_id a usuario_id temporalmente
          created_at: client.created_at,
          updated_at: client.updated_at,
          activo: !client.deleted_at
        })) || [];
        
        devSuccess('Clientes obtenidos via fallback', customers.length);
        return customers as Customer[];
      }),
      tap(customers => {
        console.log('DEV: Actualizando customersSubject con', customers.length, 'clientes');
        this.customersSubject.next(customers);
        this.loadingSubject.next(false);
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        console.error('DEV: Error en getCustomersWithFallback:', error);
        devError('Error en método fallback', error);
        return throwError(() => error);
      })
    );
  }

  // Método auxiliar para extraer datos del metadata JSON
  private extractFromMetadata(metadata: string, key: string): string | null {
    try {
      const parsed = JSON.parse(metadata || '{}');
      return parsed[key] || null;
    } catch {
      return null;
    }
  }

  // Método auxiliar para obtener usuario del sistema
  private getCurrentUserFromSystemUsers(userId: string) {
    const systemUsers = [
      {"id":"0c0053d2-5725-406d-b66e-64bf97d43953","company_id":"00000000-0000-4000-8000-000000000001","email":"admin@demo1.com","name":"Admin Demo 1","role":"owner"},
      {"id":"1e816ec8-4a5d-4e43-806a-6c7cf2ec6950","company_id":"c0976b79-a10a-4e94-9f1d-f78afcdbee2a","email":"alberto@satpcgo.es","name":"Alberto Dominguez","role":"member"},
      {"id":"2d2bd829-f80f-423e-b944-7bb407c08014","company_id":"1e8ade8f-4267-49fb-ae89-40ee18c8b377","email":"eva@michinanny.es","name":"Eva Marín","role":"member"},
      {"id":"4ae3c31e-9f5b-487f-81f7-e51432691058","company_id":"1e8ade8f-4267-49fb-ae89-40ee18c8b377","email":"marina@michinanny.es","name":"Marina Casado García","role":"member"},
      {"id":"667a24d4-2fb7-4f79-a5ac-a2872a30695e","company_id":"00000000-0000-4000-8000-000000000002","email":"admin@demo2.com","name":"Admin Demo 2","role":"owner"},
      {"id":"bdc51474-9269-4168-b25d-b4eb44b05d69","company_id":"c0159eb0-ecbf-465f-91ba-ee295fdc0f1a","email":"vanesa@liberatuscreencias.com","name":"Vanesa Santa Maria Garibaldi","role":"member"}
    ];
    
    return systemUsers.find(user => user.id === userId);
  }

  /**
   * Obtener un cliente por ID
   */
  getCustomer(id: string): Observable<Customer> {
    return from(
      this.supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        
        // Convertir de clients a Customer
        const convertedCustomer: Customer = {
          id: data.id,
          nombre: data.name,
          apellidos: data.apellidos || '',
          dni: data.dni || '',
          email: data.email || '',
          telefono: data.phone || '',
          usuario_id: this.currentDevUserId || 'default-user',
          created_at: data.created_at,
          updated_at: data.updated_at
        };
        
        return convertedCustomer;
      }),
      catchError(error => {
        this.handleError('Error al cargar cliente', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Crear un nuevo cliente
   */
  createCustomer(customer: CreateCustomerDev): Observable<Customer> {
    this.loadingSubject.next(true);
    
    // En modo desarrollo con RPC
    if (this.config.useRpcFunctions && this.currentDevUserId) {
      return this.createCustomerRpc(customer);
    }
    
    // Método estándar
    return this.createCustomerStandard(customer);
  }

  /**
   * Crear cliente usando RPC en desarrollo
   */
  private createCustomerRpc(customer: CreateCustomerDev): Observable<Customer> {
    devLog('Creando cliente via RPC', { userId: this.currentDevUserId });
    
    const rpcCall = this.supabase.rpc('create_customer_dev', {
      target_user_id: this.currentDevUserId,
      p_nombre: customer.nombre,
      p_apellidos: customer.apellidos,
      p_email: customer.email,
      p_telefono: customer.telefono || null,
      p_dni: customer.dni || null,
      p_fecha_nacimiento: customer.fecha_nacimiento || null,
      p_profesion: customer.profesion || null,
      p_empresa: customer.empresa || null,
      p_notas: customer.notas || null,
      p_avatar_url: customer.avatar_url || null,
      p_direccion_id: customer.direccion_id || null
    });
    
    return from(rpcCall).pipe(
      switchMap(({ data: customerId, error }) => {
        if (error) {
          devError('Error en RPC create_customer_dev', error);
          throw error;
        }
        
        // Obtener el cliente completo creado
        return this.getCustomer(customerId);
      }),
      tap(newCustomer => {
        devSuccess('Cliente creado via RPC', newCustomer.id);
        // Actualizar lista local
        const currentCustomers = this.customersSubject.value;
        this.customersSubject.next([newCustomer, ...currentCustomers]);
        this.loadingSubject.next(false);
        this.updateStats();
      }),
      catchError(error => {
        devError('Error en createCustomerRpc, usando método estándar', error);
        return this.createCustomerStandard(customer);
      })
    );
  }

  /**
   * Crear cliente usando método estándar
   */
  private createCustomerStandard(customer: CreateCustomerDev): Observable<Customer> {
    // Convertir de Customer a estructura de clients
    const selectedUser = this.getCurrentUserFromSystemUsers(this.currentDevUserId || customer.usuario_id || 'default-user');
    const clientData = {
      name: customer.nombre || '',
      apellidos: customer.apellidos || '',
      dni: customer.dni || '',
      email: customer.email || '',
      phone: customer.telefono || '',
      company_id: selectedUser?.company_id || 1,
      created_at: new Date().toISOString()
    };
    
    devLog('Creando cliente via método estándar', { companyId: clientData.company_id });
    
    return from(
      this.supabase
        .from('clients')
        .insert([clientData])
        .select('*')
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        
        // Convertir de clients a Customer
        const convertedCustomer: Customer = {
          id: data.id,
          nombre: data.name,
          apellidos: data.apellidos || '',
          dni: data.dni || '',
          email: data.email || '',
          telefono: data.phone || '',
          usuario_id: customer.usuario_id || this.currentDevUserId || 'default-user',
          created_at: data.created_at,
          updated_at: data.updated_at
        };
        
        return convertedCustomer;
      }),
      tap(newCustomer => {
        devSuccess('Cliente creado via método estándar', newCustomer.id);
        // Actualizar lista local
        const currentCustomers = this.customersSubject.value;
        this.customersSubject.next([newCustomer, ...currentCustomers]);
        this.loadingSubject.next(false);
        this.updateStats();
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        devError('Error al crear cliente', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Actualizar un cliente existente
   */
  updateCustomer(id: string, updates: UpdateCustomer): Observable<Customer> {
    this.loadingSubject.next(true);
    
    // En modo desarrollo con RPC
    if (this.config.useRpcFunctions && this.currentDevUserId) {
      return this.updateCustomerRpc(id, updates);
    }
    
    // Método estándar
    return this.updateCustomerStandard(id, updates);
  }

  /**
   * Actualizar cliente usando RPC en desarrollo
   */
  private updateCustomerRpc(id: string, updates: UpdateCustomer): Observable<Customer> {
    devLog('Actualizando cliente via RPC', { id, userId: this.currentDevUserId });
    
    const rpcCall = this.supabase.rpc('update_customer_dev', {
      customer_id: id,
      target_user_id: this.currentDevUserId,
      p_nombre: updates.nombre,
      p_apellidos: updates.apellidos,
      p_email: updates.email,
      p_telefono: updates.telefono || null,
      p_dni: updates.dni || null,
      p_fecha_nacimiento: updates.fecha_nacimiento || null,
      p_profesion: updates.profesion || null,
      p_empresa: updates.empresa || null,
      p_notas: updates.notas || null,
      p_avatar_url: updates.avatar_url || null,
      p_direccion_id: updates.direccion_id || null,
      p_activo: updates.activo !== undefined ? updates.activo : true
    });
    
    return from(rpcCall).pipe(
      switchMap(({ data: success, error }) => {
        if (error || !success) {
          devError('Error en RPC update_customer_dev', error);
          throw error || new Error('Update failed');
        }
        
        // Obtener el cliente actualizado
        return this.getCustomer(id);
      }),
      tap(updatedCustomer => {
        devSuccess('Cliente actualizado via RPC', updatedCustomer.id);
        // Actualizar lista local
        const currentCustomers = this.customersSubject.value;
        const updatedList = currentCustomers.map(c => 
          c.id === id ? updatedCustomer : c
        );
        this.customersSubject.next(updatedList);
        this.loadingSubject.next(false);
      }),
      catchError(error => {
        devError('Error en updateCustomerRpc, usando método estándar', error);
        return this.updateCustomerStandard(id, updates);
      })
    );
  }

  /**
   * Actualizar cliente usando método estándar
   */
  private updateCustomerStandard(id: string, updates: UpdateCustomer): Observable<Customer> {
    devLog('Actualizando cliente via método estándar', { id });
    
    // Convertir updates de Customer a estructura de clients
    const clientUpdates: any = {
      updated_at: new Date().toISOString()
    };
    
    if (updates.nombre) clientUpdates.name = updates.nombre;
    if (updates.apellidos) clientUpdates.apellidos = updates.apellidos;
    if (updates.dni) clientUpdates.dni = updates.dni;
    if (updates.email) clientUpdates.email = updates.email;
    if (updates.telefono) clientUpdates.phone = updates.telefono;
    
    return from(
      this.supabase
        .from('clients')
        .update(clientUpdates)
        .eq('id', id)
        .select('*')
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        
        // Convertir de clients a Customer
        const convertedCustomer: Customer = {
          id: data.id,
          nombre: data.name,
          apellidos: data.apellidos || '',
          dni: data.dni || '',
          email: data.email || '',
          telefono: data.phone || '',
          usuario_id: this.currentDevUserId || 'default-user',
          created_at: data.created_at,
          updated_at: data.updated_at
        };
        
        return convertedCustomer;
      }),
      tap(updatedCustomer => {
        devSuccess('Cliente actualizado via método estándar', updatedCustomer.id);
        // Actualizar lista local
        const currentCustomers = this.customersSubject.value;
        const updatedList = currentCustomers.map(c => 
          c.id === id ? updatedCustomer : c
        );
        this.customersSubject.next(updatedList);
        this.loadingSubject.next(false);
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        devError('Error al actualizar cliente', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Eliminar un cliente
   */
  deleteCustomer(id: string): Observable<void> {
    this.loadingSubject.next(true);
    
    // En modo desarrollo con RPC
    if (this.config.useRpcFunctions && this.currentDevUserId) {
      return this.deleteCustomerRpc(id);
    }
    
    // Método estándar
    return this.deleteCustomerStandard(id);
  }

  /**
   * Eliminar cliente usando RPC en desarrollo
   */
  private deleteCustomerRpc(id: string): Observable<void> {
    devLog('Eliminando cliente via RPC', { id, userId: this.currentDevUserId });
    
    const rpcCall = this.supabase.rpc('delete_customer_dev', {
      customer_id: id,
      target_user_id: this.currentDevUserId
    });
    
    return from(rpcCall).pipe(
      map(({ data: success, error }) => {
        if (error || !success) {
          devError('Error en RPC delete_customer_dev', error);
          throw error || new Error('Delete failed');
        }
        devSuccess('Cliente eliminado via RPC', id);
      }),
      tap(() => {
        // Actualizar lista local
        const currentCustomers = this.customersSubject.value;
        this.customersSubject.next(currentCustomers.filter(c => c.id !== id));
        this.loadingSubject.next(false);
        this.updateStats();
      }),
      catchError(error => {
        devError('Error en deleteCustomerRpc, usando método estándar', error);
        return this.deleteCustomerStandard(id);
      })
    );
  }

  /**
   * Eliminar cliente usando método estándar
   */
  private deleteCustomerStandard(id: string): Observable<void> {
    devLog('Eliminando cliente via método estándar', { id });
    
    return from(
      this.supabase
        .from('clients')
        .delete()
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      tap(() => {
        devSuccess('Cliente eliminado via método estándar', id);
        // Actualizar lista local
        const currentCustomers = this.customersSubject.value;
        this.customersSubject.next(currentCustomers.filter(c => c.id !== id));
        this.loadingSubject.next(false);
        this.updateStats();
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        devError('Error al eliminar cliente', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Búsqueda avanzada de clientes
   */
  searchCustomers(query: string): Observable<Customer[]> {
    if (!query.trim()) {
      return this.customers$;
    }

    let searchQuery = this.supabase
      .from('clients')
      .select('*')
      .or(`name.ilike.%${query}%,apellidos.ilike.%${query}%,email.ilike.%${query}%,dni.ilike.%${query}%,phone.ilike.%${query}%`)
      .order('created_at', { ascending: false });
      
    // Aplicar filtro de desarrollo si es necesario
    if (this.config.isDevelopmentMode && this.currentDevUserId) {
      const selectedUser = this.getCurrentUserFromSystemUsers(this.currentDevUserId);
      if (selectedUser) {
        searchQuery = searchQuery.eq('company_id', selectedUser.company_id);
      }
    }

    return from(searchQuery).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        
        // Convertir de clients a Customer[]
        return data.map((client: any) => ({
          id: client.id,
          nombre: client.name,
          apellidos: client.apellidos || '',
          dni: client.dni || '',
          email: client.email || '',
          telefono: client.phone || '',
          usuario_id: this.currentDevUserId || 'default-user',
          created_at: client.created_at,
          updated_at: client.updated_at
        })) as Customer[];
      }),
      catchError(error => {
        this.handleError('Error en la búsqueda', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtener estadísticas de clientes
   */
  getCustomerStats(): Observable<CustomerStats> {
    // En modo desarrollo con RPC
    if (this.config.useRpcFunctions && this.currentDevUserId) {
      return this.getCustomerStatsRpc();
    }
    
    // Método estándar
    return this.getCustomerStatsStandard();
  }

  /**
   * Obtener estadísticas usando RPC en desarrollo
   */
  private getCustomerStatsRpc(): Observable<CustomerStats> {
    devLog('Obteniendo estadísticas via RPC', { userId: this.currentDevUserId });
    
    return from(
      this.supabase.rpc('get_customer_stats_dev', {
        target_user_id: this.currentDevUserId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          devError('Error en RPC get_customer_stats_dev', error);
          throw error;
        }
        
        devSuccess('Estadísticas obtenidas via RPC', data);
        
        return {
          total: data.total || 0,
          activeThisMonth: data.active_this_month || 0,
          newThisWeek: data.new_this_week || 0,
          byLocality: data.by_locality || {}
        } as CustomerStats;
      }),
      tap(stats => this.statsSubject.next(stats)),
      catchError(error => {
        devError('Error en getCustomerStatsRpc, usando método estándar', error);
        return this.getCustomerStatsStandard();
      })
    );
  }

  /**
   * Obtener estadísticas usando método estándar
   */
  /**
   * Helper para construir query base de clientes con filtro de desarrollo
   */
  private buildClientQuery() {
    const query = this.supabase.from('clients');
    return query;
  }

  /**
   * Aplica filtro de desarrollo a una query si es necesario
   */
  private applyDevFilter(query: any) {
    if (this.config.isDevelopmentMode && this.currentDevUserId) {
      const selectedUser = this.getCurrentUserFromSystemUsers(this.currentDevUserId);
      if (selectedUser) {
        devLog('Filtrando por company DEV', selectedUser.company_id);
        return query.eq('company_id', selectedUser.company_id);
      }
    }
    return query;
  }

  private getCustomerStatsStandard(): Observable<CustomerStats> {
    devLog('Obteniendo estadísticas via método estándar');
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return from(
      Promise.all([
        // Total de clientes
        this.applyDevFilter(this.buildClientQuery().select('id', { count: 'exact', head: true })),
        
        // Clientes activos este mes
        this.applyDevFilter(this.buildClientQuery()
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startOfMonth.toISOString())
          .is('deleted_at', null)),
        
        // Clientes nuevos esta semana
        this.applyDevFilter(this.buildClientQuery()
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startOfWeek.toISOString())
          .is('deleted_at', null)),
        
        // Por localidad - simplificado por ahora debido a diferente estructura
        this.applyDevFilter(this.buildClientQuery().select('id'))
      ])
    ).pipe(
      map(([totalResult, monthResult, weekResult, localityResult]) => {
        // Procesar datos de localidad - simplificado por estructura diferente de clients
        const byLocality: { [key: string]: number } = {
          'Total': localityResult.data?.length || 0
        };

        const stats: CustomerStats = {
          total: totalResult.count || 0,
          activeThisMonth: monthResult.count || 0,
          newThisWeek: weekResult.count || 0,
          byLocality
        };

        devSuccess('Estadísticas obtenidas via método estándar', stats);
        return stats;
      }),
      tap(stats => this.statsSubject.next(stats)),
      catchError(error => {
        devError('Error al obtener estadísticas', error);
        // Devolver estadísticas vacías en caso de error
        const emptyStats: CustomerStats = {
          total: 0,
          activeThisMonth: 0,
          newThisWeek: 0,
          byLocality: {}
        };
        this.statsSubject.next(emptyStats);
        return from([emptyStats]);
      })
    );
  }

  /**
   * Subir avatar del cliente
   */
  uploadAvatar(customerId: string, file: File): Observable<string> {
    const fileName = `${customerId}-${Date.now()}.${file.name.split('.').pop()}`;
    const filePath = `avatars/${fileName}`;

    return from(
      this.supabase.storage
        .from('customer-avatars')
        .upload(filePath, file)
    ).pipe(
      switchMap(({ error }) => {
        if (error) throw error;
        
        // Obtener URL pública
        const { data } = this.supabase.storage
          .from('customer-avatars')
          .getPublicUrl(filePath);
        
        return from(Promise.resolve(data.publicUrl));
      }),
      switchMap(avatarUrl => {
        // Actualizar cliente con nueva URL
        return this.updateCustomer(customerId, { avatar_url: avatarUrl }).pipe(
          map(() => avatarUrl)
        );
      }),
      catchError(error => {
        this.handleError('Error al subir avatar', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Exportar clientes a CSV
   */
  exportToCSV(filters: CustomerFilters = {}): Observable<Blob> {
    return this.getCustomers(filters).pipe(
      map(customers => {
        const csvContent = this.generateCSV(customers);
        return new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      })
    );
  }

  /**
   * Importar clientes desde CSV
   */
  importFromCSV(file: File): Observable<Customer[]> {
    return new Observable(observer => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const csv = e.target?.result as string;
          const customers = this.parseCSV(csv);
          
          // Crear clientes en lote
          from(
            this.supabase
              .from('clients')
              .insert(customers.map(c => ({
                name: c.nombre,
                apellidos: c.apellidos,
                dni: c.dni,
                email: c.email,
                phone: c.telefono,
                company_id: this.getCurrentUserFromSystemUsers(this.currentDevUserId || 'default-user')?.company_id || 1
              })))
              .select()
          ).pipe(
            map(({ data, error }) => {
              if (error) throw error;
              
              // Convertir de clients a Customer[]
              return data.map((client: any) => ({
                id: client.id,
                nombre: client.name,
                apellidos: client.apellidos || '',
                dni: client.dni || '',
                email: client.email || '',
                telefono: client.phone || '',
                usuario_id: this.currentDevUserId || 'default-user',
                created_at: client.created_at,
                updated_at: client.updated_at
              })) as Customer[];
            }),
            tap(newCustomers => {
              const currentCustomers = this.customersSubject.value;
              this.customersSubject.next([...newCustomers, ...currentCustomers]);
              console.log(`✅ ${newCustomers.length} clientes importados exitosamente`);
              this.updateStats();
            })
          ).subscribe({
            next: (result) => observer.next(result),
            error: (error) => observer.error(error),
            complete: () => observer.complete()
          });
        } catch (error) {
          observer.error(error);
        }
      };
      reader.readAsText(file);
    });
  }

  // Métodos públicos para testing

  public loadCustomers(): void {
    this.getCustomers().subscribe();
    this.updateStats();
  }

  private updateStats(): void {
    this.getCustomerStats().subscribe();
  }

  private handleError(message: string, error: any): void {
    console.error(message, error);
    console.error('❌ Error:', message);
  }

  private generateCSV(customers: Customer[]): string {
    const headers = ['Nombre', 'Apellidos', 'Email', 'DNI', 'Teléfono', 'Fecha Creación'];
    const rows = customers.map(customer => [
      customer.nombre,
      customer.apellidos,
      customer.email,
      customer.dni,
      customer.telefono,
      new Date(customer.created_at).toLocaleDateString()
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }

  private parseCSV(csv: string): Partial<Customer>[] {
    const lines = csv.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    
    return lines.slice(1)
      .filter(line => line.trim())
      .map(line => {
        const values = line.split(',').map(v => v.replace(/"/g, '').trim());
        return {
          nombre: values[0] || '',
          apellidos: values[1] || '',
          email: values[2] || '',
          dni: values[3] || '',
          telefono: values[4] || ''
        };
      });
  }
}
