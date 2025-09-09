import { Injectable, inject } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Observable, from, throwError, BehaviorSubject, combineLatest } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { Customer, CreateCustomer, CreateCustomerDev, UpdateCustomer } from '../models/customer';
import { Address } from '../models/address';
import { environment } from '../../environments/environment';
import { getCurrentSupabaseConfig, devLog, devError, devSuccess } from '../config/supabase.config';
import { AuthService } from './auth.service';

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
  newThisWeek: number;
  newThisMonth: number;
  byLocality: { [key: string]: number };
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseCustomersService {
  private supabase: SupabaseClient;
  private config = getCurrentSupabaseConfig();
  private authService = inject(AuthService);
  
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
    
    // Cargar cache de usuarios al inicializar
    if (this.config.enableDevUserSelector) {
      this.loadSystemUsersCache();
    }
    
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

    // MULTI-TENANT: Filtrar por company_id del usuario autenticado
    const companyId = this.authService.companyId();
    if (companyId) {
      query = query.eq('company_id', companyId);
    }

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
      
      // Buscar la empresa del usuario seleccionado (ahora sincrónico)
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

    return this.executeCustomersQuery(query, filters);
  }

  private executeCustomersQuery(query: any, filters: CustomerFilters): Observable<Customer[]> {
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
    return from(query as Promise<{ data: any; error: any }>).pipe(
      map(({ data, error }: { data: any; error: any }) => {
        console.log('DEV: Respuesta de query:', { data: data?.length || 0, error });
        if (error) {
          console.error('DEV: Error en query:', error);
          throw error;
        }
        
        if (data && data.length > 0) {
          console.log('DEV: Primeros 3 clientes encontrados:', data.slice(0, 3).map((c: any) => ({
            name: c.name,
            email: c.email,
            company_id: c.company_id
          })));
        }
        
        // Convertir la estructura de 'clients' a 'Customer' esperada por la aplicación
        const customers = data?.map((client: any) => ({
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

  // Cache de usuarios del sistema cargados dinámicamente
  private systemUsersCache: Array<{id: string, company_id: string, name: string, email: string, role: string}> = [];

  // Método auxiliar para obtener usuario del sistema (ahora sincrónico usando cache)
  private getCurrentUserFromSystemUsers(userId: string) {
    return this.systemUsersCache.find(user => user.id === userId);
  }

  // Cargar usuarios desde la base de datos para el cache
  private async loadSystemUsersCache() {
    try {
      const { data: usersData, error } = await this.supabase
        .from('users')
        .select(`
          id,
          name,
          email,
          company_id,
          role
        `)
        .eq('active', true)
        .is('deleted_at', null);

      if (error) {
        devError('Error al cargar cache de usuarios:', error);
        return;
      }

      if (usersData) {
        this.systemUsersCache = usersData.map(user => ({
          id: user.id,
          name: user.name || 'Sin nombre',
          email: user.email,
          company_id: user.company_id,
          role: user.role || 'member'
        }));
        devLog('Cache de usuarios actualizado:', this.systemUsersCache.length);
      }
    } catch (error) {
      devError('Error al cargar usuarios del sistema:', error);
    }
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
    // MULTI-TENANT: Usar company_id del usuario autenticado
    const companyId = this.authService.companyId();
    if (!companyId) {
      return throwError(() => new Error('Usuario no tiene empresa asignada'));
    }

    // Convertir de Customer a estructura de clients
    const clientData = {
      name: customer.nombre || '',
      apellidos: customer.apellidos || '',
      dni: customer.dni || '',
      email: customer.email || '',
      phone: customer.telefono || '',
      company_id: companyId, // Usar company_id del usuario autenticado
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
          newThisWeek: data.new_this_week || 0,
          newThisMonth: data.new_this_month || 0,
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
    
    // Inicio de este mes (día 1 a las 00:00:00)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Inicio de esta semana (lunes a las 00:00:00)
    const startOfWeek = new Date(now);
    const dayOfWeek = now.getDay();
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Si es domingo (0), restar 6; si no, restar (día - 1)
    startOfWeek.setDate(now.getDate() - daysToSubtract);
    startOfWeek.setHours(0, 0, 0, 0);

    console.log('📊 Calculando estadísticas:');
    console.log('   Inicio del mes:', startOfMonth.toLocaleDateString());
    console.log('   Inicio de la semana:', startOfWeek.toLocaleDateString());

    return from(
      Promise.all([
        // Total de clientes
        this.applyDevFilter(this.buildClientQuery().select('id', { count: 'exact', head: true })),
        
        // Clientes nuevos esta semana
        this.applyDevFilter(this.buildClientQuery()
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startOfWeek.toISOString())
          .is('deleted_at', null)),
        
        // Clientes nuevos este mes
        this.applyDevFilter(this.buildClientQuery()
          .select('id', { count: 'exact', head: true })
          .gte('created_at', startOfMonth.toISOString())
          .is('deleted_at', null)),
        
        // Por localidad - simplificado por ahora debido a diferente estructura
        this.applyDevFilter(this.buildClientQuery().select('id'))
      ])
    ).pipe(
      map(([totalResult, weekResult, monthResult, localityResult]) => {
        // Procesar datos de localidad - simplificado por estructura diferente de clients
        const byLocality: { [key: string]: number } = {
          'Total': localityResult.data?.length || 0
        };

        const stats: CustomerStats = {
          total: totalResult.count || 0,
          newThisWeek: weekResult.count || 0,
          newThisMonth: monthResult.count || 0,
          byLocality
        };

        console.log('📈 Estadísticas calculadas:', stats);
        devSuccess('Estadísticas obtenidas via método estándar', stats);
        return stats;
      }),
      tap(stats => this.statsSubject.next(stats)),
      catchError(error => {
        devError('Error al obtener estadísticas', error);
        // Devolver estadísticas vacías en caso de error
        const emptyStats: CustomerStats = {
          total: 0,
          newThisWeek: 0,
          newThisMonth: 0,
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
        // Agregar BOM (Byte Order Mark) para UTF-8 para mejorar compatibilidad con Excel
        const csvWithBOM = '\uFEFF' + csvContent;
        return new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
      })
    );
  }

  /**
   * Importar clientes desde CSV
   * Límite recomendado: 500 clientes por archivo para evitar timeouts
   */
  importFromCSV(file: File): Observable<Customer[]> {
    const MAX_RECORDS = 500; // Límite para evitar problemas de rendimiento
    
    return new Observable(observer => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const csv = e.target?.result as string;
          const customers = this.parseCSV(csv);
          
          // Validar límite de registros
          if (customers.length > MAX_RECORDS) {
            observer.error(new Error(`El archivo contiene ${customers.length} registros. El límite máximo es ${MAX_RECORDS} clientes por archivo.`));
            return;
          }
          
          // Validar que hay datos
          if (customers.length === 0) {
            observer.error(new Error('El archivo CSV está vacío o no tiene un formato válido.'));
            return;
          }
          
          console.log(`📂 Procesando ${customers.length} clientes del CSV...`);
          
          // Obtener usuario actual para asignar company_id
          const selectedUser = this.getCurrentUserFromSystemUsers(this.currentDevUserId || 'default-user');
          if (!selectedUser) {
            observer.error(new Error('No se pudo determinar el usuario actual. Por favor, refresca la página.'));
            return;
          }
          
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
                company_id: selectedUser.company_id
              })))
              .select()
          ).pipe(
            map(({ data, error }) => {
              if (error) {
                console.error('Error en la inserción:', error);
                throw new Error(`Error al importar clientes: ${error.message}`);
              }
              
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
              devSuccess(`Importación completada: ${newCustomers.length} clientes creados`);
              this.updateStats();
            })
          ).subscribe({
            next: (result) => observer.next(result),
            error: (error) => observer.error(error),
            complete: () => observer.complete()
          });
        } catch (error) {
          console.error('Error al procesar CSV:', error);
          observer.error(new Error('Error al procesar el archivo CSV. Verifica que el formato sea correcto.'));
        }
      };
      
      reader.onerror = () => {
        observer.error(new Error('Error al leer el archivo.'));
      };
      
      // Leer con encoding UTF-8
      reader.readAsText(file, 'UTF-8');
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
    const lines = csv.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      throw new Error('El archivo CSV debe contener al menos una fila de cabeceras y una fila de datos.');
    }
    
    // Remover BOM si existe
    const firstLine = lines[0].replace(/^\uFEFF/, '');
    const headers = this.parseCSVLine(firstLine).map(h => h.trim().toLowerCase());
    
    // Validar headers requeridos
    const requiredHeaders = ['nombre', 'apellidos', 'email'];
    const missingHeaders = requiredHeaders.filter(header => 
      !headers.some(h => h.includes(header))
    );
    
    if (missingHeaders.length > 0) {
      throw new Error(`Faltan las siguientes columnas requeridas: ${missingHeaders.join(', ')}`);
    }
    
    return lines.slice(1)
      .filter(line => line.trim())
      .map((line, index) => {
        try {
          const values = this.parseCSVLine(line);
          
          // Mapear por posición o nombre de columna
          const customer: Partial<Customer> = {
            nombre: this.findValueByHeader(headers, values, ['nombre', 'name']) || '',
            apellidos: this.findValueByHeader(headers, values, ['apellidos', 'apellido', 'lastname']) || '',
            email: this.findValueByHeader(headers, values, ['email', 'correo']) || '',
            dni: this.findValueByHeader(headers, values, ['dni', 'nif', 'documento']) || '',
            telefono: this.findValueByHeader(headers, values, ['telefono', 'teléfono', 'phone', 'movil']) || ''
          };
          
          // Validar email requerido
          if (!customer.email || !customer.email.includes('@')) {
            throw new Error(`Fila ${index + 2}: Email inválido o faltante`);
          }
          
          return customer;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
          throw new Error(`Error en fila ${index + 2}: ${errorMessage}`);
        }
      });
  }

  // Método auxiliar para parsear líneas CSV con comillas
  private parseCSVLine(line: string): string[] {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Doble comilla dentro de comillas = comilla literal
          current += '"';
          i++; // saltar la siguiente comilla
        } else {
          // Cambiar estado de comillas
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Separador fuera de comillas
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current);
    return result.map(value => value.trim());
  }

  // Método auxiliar para encontrar valores por nombre de cabecera
  private findValueByHeader(headers: string[], values: string[], possibleNames: string[]): string {
    for (const name of possibleNames) {
      const index = headers.findIndex(h => h.includes(name));
      if (index !== -1 && values[index]) {
        return values[index];
      }
    }
    return '';
  }
}
