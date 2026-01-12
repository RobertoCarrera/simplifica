import { Injectable, inject, effect } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { Observable, from, throwError, BehaviorSubject, combineLatest, Subject, of } from 'rxjs';
import { map, catchError, tap, switchMap, concatMap } from 'rxjs/operators';
import { Customer, CreateCustomer, CreateCustomerDev, UpdateCustomer } from '../models/customer';
import { Address } from '../models/address';
import { RuntimeConfigService } from './runtime-config.service';
import { getCurrentSupabaseConfig, devLog, devError, devSuccess } from '../config/supabase.config';
import { AuthService } from './auth.service';

export interface CustomerFilters {
  search?: string;
  locality?: string;
  sortBy?: 'name' | 'apellidos' | 'created_at';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  showDeleted?: boolean; // New filter
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
  private runtimeConfig = inject(RuntimeConfigService);

  // Estado reactivo
  private customersSubject = new BehaviorSubject<Customer[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private statsSubject = new BehaviorSubject<CustomerStats | null>(null);

  public customers$ = this.customersSubject.asObservable();
  public loading$ = this.loadingSubject.asObservable();
  public stats$ = this.statsSubject.asObservable();

  // Usuario actual para DEV mode
  private currentDevUserId: string | null = null;

  constructor(private sbClient: SupabaseClientService) {
    this.supabase = this.sbClient.instance;

    devLog('Servicio inicializado', {
      config: this.config,
      environment: 'development'
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

    // Cargar datos iniciales y reaccionar a cambios de empresa
    effect(() => {
      const companyId = this.authService.companyId();
      if (companyId) { // Reload even if it changes to something else, provided it's truthy
        this.loadCustomers();
        this.updateStats(); // Update stats too
      }
    });
  }

  /**
   * Calcula si un cliente está "completo" para emisión de documentos fiscales (Verifactu)
   * y devuelve también los campos faltantes para mostrar en la UI.
   */
  computeCompleteness(c: Customer | null | undefined): { complete: boolean; missingFields: string[] } {
    if (!c) return { complete: false, missingFields: ['Cliente inexistente'] };
    const missing: string[] = [];
    const isBusiness = c.client_type === 'business';
    const nombre = c.nombre || c.name;
    const telefono = c.telefono || (c as any).phone;

    if (isBusiness) {
      if (!(c.business_name || (c as any).empresa)) missing.push('Razón social');
      if (!(c.cif_nif || c.dni)) missing.push('CIF/NIF');
    } else {
      if (!nombre) missing.push('Nombre');
      if (!c.apellidos) missing.push('Apellidos');
      if (!c.dni) missing.push('DNI');
    }
    if (!c.email) missing.push('Email');
    if (!telefono) missing.push('Teléfono');

    return { complete: missing.length === 0, missingFields: missing };
  }

  // Small UUID validator to avoid appending invalid company_id filters
  private isValidUuid(id: string | null | undefined): boolean {
    if (!id) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
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
  getCustomers(filters: CustomerFilters = {}, updateState: boolean = true): Observable<Customer[]> {
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
      return this.getCustomersWithFallback(filters, updateState);
    } else {
      console.log('DEV: Usando consulta estándar para producción');
      return this.getCustomersStandard(filters, updateState);
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
  private getCustomersStandard(filters: CustomerFilters = {}, updateState: boolean = true): Observable<Customer[]> {
    // Include direccion (addresses) relation when available
    // Nota: Usando LEFT JOIN (sin !) para permitir clientes sin dirección
    let query = this.supabase
      .from('clients')
      .select('*, direccion:addresses(*), devices!devices_client_id_fkey(id, deleted_at)');  // ← Fetch ID and deleted_at for client-side filtering

    // MULTI-TENANT: Filtrar por company_id del usuario autenticado
    const companyId = this.authService.companyId();
    if (this.isValidUuid(companyId)) {
      query = query.eq('company_id', companyId);
    } else if (companyId) {
      console.warn('SupabaseCustomersService: ignoring non-UUID companyId from authService:', companyId);
    }

    // Aplicar filtros de búsqueda
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
    }

    // Filtrar sólo activos (deleted_at IS NULL) a menos que showDeleted sea true
    // Nota: la tabla 'clients' no tiene columna is_active; usamos deleted_at para ordenar activos primero
    if (!filters.showDeleted) {
      query = query.is('deleted_at', null);
    }

    query = query
      .order('deleted_at', { ascending: true, nullsFirst: true })
      .order(filters.sortBy || 'created_at', { ascending: (filters.sortOrder || 'desc') === 'asc' });

    // Paginación
    if (filters.limit) {
      query = query.limit(filters.limit);
      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + filters.limit - 1);
      }
    }

    return from(query).pipe(
      switchMap(({ data, error }) => {
        if (!error) {
          const customers = (data || []).map((client: any) => this.toCustomerFromClient(client));

          // Fetch loyalty points for these customers
          const ids = customers.map(c => c.id);
          if (ids.length === 0) return of(customers);

          return from(this.supabase
            .from('loyalty_points')
            .select('customer_id, points')
            .in('customer_id', ids)
          ).pipe(
            map(({ data: pointsData }) => {
              const pointsMap = new Map<string, number>();
              (pointsData || []).forEach((p: any) => {
                const current = pointsMap.get(p.customer_id) || 0;
                pointsMap.set(p.customer_id, current + (p.points || 0));
              });

              customers.forEach(c => {
                c.loyalty_points_balance = pointsMap.get(c.id) || 0;
              });
              return customers;
            })
          );
        }

        // Schema cache may lack relation: fallback without embed
        if ((error as any)?.code === 'PGRST200') {
          let q2 = this.supabase.from('clients').select('*, devices!devices_client_id_fkey(id, deleted_at)');
          if (this.isValidUuid(companyId)) q2 = q2.eq('company_id', companyId!);
          if (filters.search) q2 = q2.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);

          if (!filters.showDeleted) {
            q2 = q2.is('deleted_at', null);
          }
          q2 = q2
            .order('deleted_at', { ascending: true, nullsFirst: true })
            .order(filters.sortBy || 'created_at', { ascending: (filters.sortOrder || 'desc') === 'asc' });
          if (filters.limit) {
            q2 = q2.limit(filters.limit);
            if (filters.offset) q2 = q2.range(filters.offset, filters.offset + filters.limit - 1);
          }
          return from(q2).pipe(
            map(({ data: d2, error: e2 }) => {
              if (e2) throw e2;
              return (d2 || []).map((client: any) => this.toCustomerFromClient({ ...client, direccion: null }));
            })
          );
        }
        return throwError(() => error);
      }),
      tap(customers => {
        if (updateState) {
          this.customersSubject.next(customers);
        }
        this.loadingSubject.next(false);
      }),
      catchError(error => {
        console.error('[DEBUG] Critical error in getCustomersStandard:', error);
        this.loadingSubject.next(false);
        devError('Error al cargar clientes', error);
        return throwError(() => error);
      })
    );
  }

  // Helper to convert clients row -> Customer
  private toCustomerFromClient(client: any): Customer {
    return {
      id: client.id,
      name: client.name?.split(' ')[0] || '',
      apellidos: client.apellidos || '',
      email: client.email,
      phone: client.phone,
      // Prefer the real column; fallback to metadata only if needed
      dni: client.dni || this.extractFromMetadata(client.metadata, 'dni') || '',
      client_type: client.client_type || 'individual',
      business_name: client.business_name || undefined,
      cif_nif: client.cif_nif || undefined,
      trade_name: client.trade_name || undefined,
      legal_representative_name: client.legal_representative_name || undefined,
      legal_representative_dni: client.legal_representative_dni || undefined,
      mercantile_registry_data: client.mercantile_registry_data || undefined,
      usuario_id: client.company_id,
      created_at: client.created_at,
      updated_at: client.updated_at,
      activo: client.is_active === false ? false : !client.deleted_at,
      direccion_id: client.direccion_id || null,
      direccion: client.direccion || null,
      metadata: client.metadata || undefined,
      // GDPR fields
      marketing_consent: client.marketing_consent ?? undefined,
      marketing_consent_date: client.marketing_consent_date ?? undefined,
      marketing_consent_method: client.marketing_consent_method ?? undefined,
      data_processing_consent: client.data_processing_consent ?? undefined,
      data_processing_consent_date: client.data_processing_consent_date ?? undefined,
      data_processing_legal_basis: client.data_processing_legal_basis ?? undefined,
      data_retention_until: client.data_retention_until ?? undefined,
      deletion_requested_at: client.deletion_requested_at ?? undefined,
      deletion_reason: client.deletion_reason ?? undefined,
      anonymized_at: client.anonymized_at ?? undefined,
      is_minor: client.is_minor ?? undefined,
      parental_consent_verified: client.parental_consent_verified ?? undefined,
      parental_consent_date: client.parental_consent_date ?? undefined,
      data_minimization_applied: client.data_minimization_applied ?? undefined,
      last_data_review_date: client.last_data_review_date ?? undefined,
      access_restrictions: client.access_restrictions ?? undefined,
      last_accessed_at: client.last_accessed_at ?? undefined,
      access_count: client.access_count ?? undefined,
      devices: client.devices || []
    } as Customer;
  }

  /**
   * Método fallback (desarrollo) sin embed explícito
   */
  private getCustomersWithFallback(filters: CustomerFilters = {}, updateState: boolean = true): Observable<Customer[]> {
    let query = this.supabase.from('clients').select('*');

    const companyId = this.authService.companyId();
    if (this.isValidUuid(companyId)) {
      query = query.eq('company_id', companyId);
    } else if (companyId) {
      console.warn('SupabaseCustomersService: ignoring non-UUID companyId from authService:', companyId);
    }

    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
    }

    // Ordenamiento consistente con estándar: activos (deleted_at NULL) primero
    if (!filters.showDeleted) {
      query = query.is('deleted_at', null);
    }

    query = query
      .order('deleted_at', { ascending: true, nullsFirst: true })
      .order(filters.sortBy || 'created_at', { ascending: (filters.sortOrder || 'desc') === 'asc' });

    if (filters.limit) {
      query = query.limit(filters.limit);
      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + filters.limit - 1);
      }
    }

    return from(query).pipe(
      map(({ data, error }: { data: any; error: any }) => {
        if (error) throw error;
        const customers = (data || []).map((client: any) => this.toCustomerFromClient({ ...client, direccion: null }));
        devSuccess('Clientes obtenidos via fallback', customers.length);
        return customers as Customer[];
      }),
      tap(customers => {
        if (updateState) {
          this.customersSubject.next(customers);
        }
        this.loadingSubject.next(false);
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        devError('Error en método fallback', error);
        return throwError(() => error);
      })
    );
  }

  // Método auxiliar para extraer datos del metadata JSON (acepta string u objeto)
  private extractFromMetadata(metadata: any, key: string): string | null {
    try {
      if (!metadata) return null;
      const parsed = typeof metadata === 'string' ? JSON.parse(metadata || '{}') : metadata;
      return parsed?.[key] || null;
    } catch {
      return null;
    }
  }

  // Cache de usuarios del sistema cargados dinámicamente
  private systemUsersCache: Array<{ id: string, company_id: string, name: string, email: string }> = [];

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
          company_id
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
          name: user.name || 'Sin name',
          email: user.email,
          company_id: user.company_id
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
    // Intentar cargar con relación de dirección; usando LEFT JOIN para permitir NULL
    const withRelation = this.supabase
      .from('clients')
      .select('*, direccion:addresses(*)')  // ← LEFT JOIN: permite NULL
      .eq('id', id)
      .single();

    return from(withRelation).pipe(
      switchMap(({ data, error }) => {
        if (!error) {
          return of(this.toCustomerFromClient(data));
        }
        if ((error as any)?.code === 'PGRST200') {
          return from(
            this.supabase
              .from('clients')
              .select('*')
              .eq('id', id)
              .single()
          ).pipe(
            map(({ data: d2, error: e2 }) => {
              if (e2) throw e2;
              return this.toCustomerFromClient({ ...d2, direccion: null });
            })
          );
        }
        return throwError(() => error);
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
      p_nombre: customer.name,
      p_apellidos: customer.apellidos,
      p_email: customer.email,
      p_telefono: customer.phone || null,
      p_dni: customer.dni || null,
      p_fecha_nacimiento: customer.fecha_nacimiento || null,
      p_profesion: customer.profesion || null,
      p_empresa: customer.empresa || null,
      p_avatar_url: customer.avatar_url || null,
      // No enviar p_direccion_id: el esquema actual de clients no lo soporta
      // notas and activo fields removed per UI change; free-text address handled separately
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
   * SECURITY: In production, always use Edge Function for server-side validation and normalization
   */
  /**
   * Crear cliente usando método estándar (ahora via RPC por seguridad y robustez)
   */
  private createCustomerStandard(customer: CreateCustomerDev): Observable<Customer> {
    const companyId = this.authService.companyId();
    if (!companyId) {
      return throwError(() => new Error('Usuario no tiene empresa asignada'));
    }

    devLog('Creando cliente via RPC (upsert_client)', { companyId });

    return from(this.callUpsertClientRpc(customer)).pipe(
      tap(newCustomer => {
        devSuccess('Cliente creado via RPC', newCustomer.id);
        const currentCustomers = this.customersSubject.value;
        this.customersSubject.next([newCustomer, ...currentCustomers]);
        this.loadingSubject.next(false);
        this.updateStats();
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        devError('Error al crear cliente via RPC', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * SECURITY: Call RPC for client upsert (create/update)
   * Replaces the old Edge Function logic.
   */
  private async callUpsertClientRpc(customer: CreateCustomerDev | UpdateCustomer): Promise<Customer> {
    // CRITICAL: Include company_id to prevent RPC from using auth.uid() as fallback
    const companyId = this.authService.companyId();

    const payload: any = {
      // Clean keys matching RPC expectation
      company_id: companyId, // Must be included to avoid FK violation
      client_type: (customer as any).client_type || 'individual',
      name: (customer as any).name,
      apellidos: (customer as any).apellidos ?? null,
      email: (customer as any).email ?? null,
      phone: (customer as any).phone ?? null,
      dni: (customer as any).dni ?? null,
      business_name: (customer as any).business_name ?? null,
      cif_nif: (customer as any).cif_nif ?? null,
      trade_name: (customer as any).trade_name ?? null,
      legal_representative_name: (customer as any).legal_representative_name ?? null,
      legal_representative_dni: (customer as any).legal_representative_dni ?? null,
      mercantile_registry_data: (customer as any).mercantile_registry_data ?? null,
      metadata: (customer as any).metadata ?? {},
    };

    // If updating, include ID
    if ('id' in customer && (customer as any).id) {
      payload.id = (customer as any).id;
    }

    // Add direccion_id if present
    if ('direccion_id' in customer) {
      payload.direccion_id = (customer as any).direccion_id ?? null;
    }

    const { data, error } = await this.supabase.rpc('upsert_client', { payload });

    if (error) throw error;
    if (!data) throw new Error('No data returned from upsert_client');

    // Convert response (jsonb) to Customer
    return this.toCustomerFromClient(data);
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
    devLog('Actualizando cliente via RPC', {
      id, userId: this.currentDevUserId
    });

    const rpcCall = this.supabase.rpc('update_customer_dev', {
      customer_id: id,
      target_user_id: this.currentDevUserId,
      p_nombre: updates.name,
      p_apellidos: updates.apellidos,
      p_email: updates.email,
      p_telefono: updates.phone || null,
      p_dni: updates.dni || null,
      p_fecha_nacimiento: updates.fecha_nacimiento || null,
      p_profesion: updates.profesion || null,
      p_empresa: updates.empresa || null,
      // p_notas removed
      p_avatar_url: updates.avatar_url || null,
      // p_activo removed - active state handled by default/deleted_at
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
   * SECURITY: In production, use Edge Function for server-side validation
   */
  /**
   * Actualizar cliente usando método estándar (Partial Update)
   * Replacing risky 'upsert_client' RPC call that wipes data on partial payloads.
   */
  private updateCustomerStandard(id: string, updates: UpdateCustomer): Observable<Customer> {
    devLog('Actualizando cliente via Standard Partial Update', { id, updates });

    // Prepare payload for partial update
    const payload: any = { ...updates };

    // Map aliases/legacy fields
    if (payload.nombre && !payload.name) payload.name = payload.nombre;
    if (payload.telefono && !payload.phone) payload.phone = payload.telefono;
    if (payload.usuario_id) {
      payload.company_id = payload.usuario_id;
      delete payload.usuario_id;
    }

    // Clean up non-DB fields
    delete payload.nombre;
    delete payload.telefono;
    delete payload.address;
    delete payload.devices;
    delete payload.favicon;

    // Explicitly remove undefined fields so Supabase/Postgrest ignores them
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    return from(this.supabase.from('clients').update(payload).eq('id', id).select().single()).pipe(
      map(({ data, error }) => {
        if (error) {
          devError('Error en Update Standard', error);
          throw error;
        }
        return this.toCustomerFromClient(data);
      }),
      tap(updatedCustomer => {
        devSuccess('Cliente actualizado (Standard)', updatedCustomer.id);
        const currentCustomers = this.customersSubject.value;
        const updatedList = currentCustomers.map(c => c.id === id ? updatedCustomer : c);
        this.customersSubject.next(updatedList);
        this.loadingSubject.next(false);
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        devError('Error al actualizar cliente via Standard Update', error);
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

    // Método estándar (legacy soft delete) replaced by conditional remove/deactivate
    return this.removeOrDeactivateCustomer(id);
  }

  /**
   * Eliminar cliente usando RPC en desarrollo
   */
  private deleteCustomerRpc(id: string): Observable<void> {
    devLog('Eliminando cliente via RPC', {
      id, userId: this.currentDevUserId
    });

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
    devLog('Eliminando cliente via método estándar (soft delete)', { id });

    // Realizar SOFT DELETE para evitar conflictos de FK: set deleted_at y updated_at
    return from(
      this.supabase
        .from('clients')
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select('id')
        .maybeSingle()
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      tap(() => {
        devSuccess('Cliente marcado como eliminado (soft delete)', id);
        // Actualizar lista local (remover de la vista actual)
        const currentCustomers = this.customersSubject.value;
        this.customersSubject.next(currentCustomers.filter(c => c.id !== id));
        this.loadingSubject.next(false);
        this.updateStats();
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        // Si por alguna razón el UPDATE falla por políticas/permiso, registrar claramente
        devError('Error al aplicar soft delete del cliente', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Conditionally remove (hard delete) or deactivate a customer depending on invoice presence.
   * - If no invoices: physical DELETE
   * - If invoices exist: set is_active=false and retain row
   */
  removeOrDeactivateCustomer(id: string): Observable<void> {
    devLog('Invocando Edge Function remove-or-deactivate-client', { id });
    return from((async () => {
      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('No auth token for Edge Function');
      const cfg = this.runtimeConfig.get();
      const base = (cfg.edgeFunctionsBaseUrl || `${cfg.supabase.url.replace(/\/$/, '')}/functions/v1`).replace(/\/$/, '');
      const url = `${base}/remove-or-deactivate-client`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': cfg.supabase.anonKey,
          'x-client-info': 'simplifica-app'
        },
        body: JSON.stringify({ p_id: id })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        const err = json?.error || `Edge Function error (${res.status})`;
        throw new Error(err);
      }
      return json as { action: string; invoiceCount: number; clientId: string };
    })()).pipe(
      tap(result => {
        const { action, clientId } = result;
        if (action === 'deleted') {
          devSuccess('Cliente eliminado físicamente', clientId);
          const current = this.customersSubject.value;
          this.customersSubject.next(current.filter(c => c.id !== clientId));
        } else {
          devLog('Cliente desactivado (retención de facturas)', result);
          // Update local list: mark is_active=false if we keep object
          const current = this.customersSubject.value;
          const updated = current.map(c => c.id === clientId ? { ...c, is_active: false } as any : c);
          this.customersSubject.next(updated.filter(c => c.id !== clientId)); // Remove from visible list for now
        }
        this.loadingSubject.next(false);
        this.updateStats();
      }),
      map(() => void 0),
      catchError(err => {
        this.loadingSubject.next(false);
        devError('Error en removeOrDeactivateCustomer', err);
        return throwError(() => err);
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
          name: client.name,
          apellidos: client.apellidos || '',
          dni: client.dni || '',
          email: client.email || '',
          phone: client.phone || '',
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
    devLog('Obteniendo estadísticas via RPC', {
      userId: this.currentDevUserId
    });

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
   * Parse CSV file and return headers and data for mapping
   */
  parseCSVForMapping(file: File): Observable<{ headers: string[], data: string[][] }> {
    return new Observable(observer => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          console.log('FileReader.onload fired for CSV file');
          let text = e.target?.result as string;
          const self = this;
          // Remove BOM if present
          if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
          }
          // If mojibake detected (Ã, Â, etc.), attempt Windows-1252 decode fallback using TextDecoder if ArrayBuffer available
          const looksMojibake = /Ã.|Â./.test(text);
          if (looksMojibake) {
            try {
              const reader2 = new FileReader();
              reader2.onload = (ee) => {
                try {
                  const buf = ee.target?.result as ArrayBuffer;
                  const decoder = new TextDecoder('windows-1252');
                  text = decoder.decode(buf);
                  console.debug('[CSV] Decoded using windows-1252 fallback');
                  safeProcess(text);
                } catch {
                  console.warn('[CSV] windows-1252 decode failed, using UTF-8 text');
                  safeProcess(text);
                }
              };
              reader2.onerror = () => safeProcess(text);
              reader2.readAsArrayBuffer(file);
              return; // we'll call observer in process()
            } catch {
              // ignore; proceed with UTF-8 text
            }
          }
          safeProcess(text);

          function safeProcess(csv: string) {
            try {
              // Use robust CSV-to-rows parser to support multi-line quoted fields
              const rows = self.parseCSVToRows(csv.replace(/^\uFEFF/, ''));
              if (!rows.length) {
                observer.error(new Error('El archivo CSV está vacío.'));
                return;
              }
              const headers = rows[0].map(h => self.cleanCellValue(h));
              const dataRows = rows.slice(1).map(r => r.map(c => self.cleanCellValue(c)));
              observer.next({ headers, data: [headers, ...dataRows] });
              observer.complete();
            } catch (err) {
              console.error('[CSV] Error parsing CSV', err);
              observer.error(new Error('Error al procesar el archivo CSV.'));
            }
          }
        } catch (error) {
          observer.error(new Error('Error al procesar el archivo CSV.'));
        }
      };
      reader.onerror = () => {
        console.error('FileReader.onerror fired while reading CSV file');
        observer.error(new Error('Error al leer el archivo.'));
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  /**
   * Import customers with field mappings
   */
  importFromCSVWithMapping(file: File, fieldMappings: any[]): Observable<Customer[]> {
    return this.parseCSVForMapping(file).pipe(
      switchMap(({ headers, data }) => {
        const customers = this.parseCSVWithMappings(headers, data.slice(1), fieldMappings);
        return this.processBatchImport(customers);
      })
    );
  }

  /**
   * Importar clientes desde CSV
   * Maneja v2 de Supabase y obtiene el bearer token correctamente
   */
  importFromCSV(file: File): Observable<Customer[]> {
    const MAX_RECORDS = 500;

    return new Observable(observer => {
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const csv = e.target?.result as string;
          const customers = this.parseCSV(csv);
          if (!customers.length) {
            observer.error(new Error('El archivo CSV está vacío o no tiene un formato válido.'));
            return;
          }
          if (customers.length > MAX_RECORDS) {
            observer.error(new Error(`El archivo contiene ${customers.length} registros. El límite máximo es ${MAX_RECORDS} clientes por archivo.`));
            return;
          }

          // Construcción de payload y token
          const payloadRows = customers.map(c => ({
            name: c.name,
            surname: c.apellidos, // unified field for Edge Function
            email: c.email,
            phone: c.phone,
            dni: c.dni,
            client_type: (c as any).client_type || 'individual',
            business_name: (c as any).business_name || undefined,
            cif_nif: (c as any).cif_nif || undefined,
            trade_name: (c as any).trade_name || undefined,
            metadata: (c as any).metadata,
            direccion_id: (c as any).direccion_id || null,
            company_id: (this.getCurrentUserFromSystemUsers?.(this.currentDevUserId || 'default-user')?.company_id) || this.authService.companyId() || undefined
          }));

          // Obtención del acceso (Supabase v2)
          let accessToken: string | undefined;
          try {
            const sessionRes: any = await this.authService.client.auth.getSession();
            const session = sessionRes?.data?.session || null;
            accessToken = session?.access_token || session?.accessToken || undefined;
          } catch (_) { /* Ignorar */ }

          // RefreshSession si no hubiese acceso
          if (!accessToken) {
            try {
              await this.authService.client.auth.refreshSession();
              const sessionRes2: any = await this.authService.client.auth.getSession();
              const session2 = sessionRes2?.data?.session || null;
              accessToken = session2?.access_token || session2?.accessToken || undefined;
            } catch (_) { /* Ignorar */ }
          }

          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (!accessToken) {
            observer.error(new Error('No se pudo obtener un token válido de sesión. Inicia sesión antes de importar.'));
            return;
          }
          headers['Authorization'] = `Bearer ${accessToken}`;

          const proxyUrl = '/api/import-customers';
          const cfg = this.runtimeConfig.get();
          const functionUrl = `${cfg.supabase.url.replace(/\/$/, '')}/functions/v1/import-customers`;
          headers['apikey'] = cfg.supabase.anonKey;

          // First try proxy (if configured in hosting). If it returns non-JSON, fallback to direct.
          let resp = await fetch(proxyUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ rows: payloadRows })
          });

          // Fallback directo si el proxy no responde correctamente o devuelve HTML
          const ct = resp.headers.get('content-type') || '';
          if ((!resp.ok && (resp.status === 404 || resp.status === 405)) || !ct.includes('application/json')) {
            resp = await fetch(functionUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({ rows: payloadRows })
            });
          }

          if (!resp.ok) {
            const text = await resp.text().catch(() => null);
            throw new Error(`Error en importación masiva: ${resp.status} ${text || ''}`);
          }

          const json = await resp.json();
          const inserted = Array.isArray(json.inserted) ? json.inserted : (json.inserted || []);
          const newCustomers = inserted.filter((r: any) => r && r.id).map((row: any) => ({
            id: row.id,
            name: row.name || '',
            apellidos: row.apellidos || '',
            dni: row.dni || '',
            email: row.email || '',
            phone: row.phone || '',
            usuario_id: row.company_id || this.currentDevUserId || '',
            created_at: row.created_at,
            updated_at: row.updated_at || row.created_at,
            activo: true
          })) as Customer[];

          // Actualizar caché local y finalizar
          const currentCustomers = this.customersSubject.value;
          this.customersSubject.next([...newCustomers, ...currentCustomers]);
          this.updateStats?.();

          observer.next(newCustomers);
          observer.complete();
        } catch (err) {
          observer.error(new Error('Error en la importación masiva: ' + String(err)));
        }
      };
      reader.onerror = () => {
        observer.error(new Error('Error al leer el archivo.'));
      };
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
      customer.name,
      customer.apellidos,
      customer.email,
      customer.dni,
      customer.phone,
      new Date(customer.created_at).toLocaleDateString()
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  }

  private parseCSV(csv: string): Partial<Customer>[] {
    // Use robust parser to support multiline quoted fields
    const rows = this.parseCSVToRows(csv);
    const lines = rows.map(r => r.join(','));

    if (rows.length < 2) {
      throw new Error('El archivo CSV debe contener al menos una fila de cabeceras y una fila de datos.');
    }

    // Headers from first row
    const headers = rows[0].map(h => this.cleanCellValue(h)).map(h => h.trim().toLowerCase());

    // Configurable header aliases for required fields. Edit these arrays to accept different header names.
    // You can add variants such as 'name','nombre','bill_to:name' etc.
    const headerAliases: Record<string, string[]> = {
      name: ['name', 'nombre', 'first_name', 'firstname', 'first name', 'bill_to:first_name', 'bill to first name', 'billto:first_name', 'bill_to_name', 'bill to name'],
      surname: ['surname', 'last_name', 'lastname', 'last name', 'apellidos', 'bill_to:last_name', 'bill to last name', 'billto:last_name', 'bill_to_last_name'],
      email: ['email', 'correo', 'e-mail', 'mail', 'bill_to:email', 'bill to email', 'billto:email', 'bill_to_email']
    };

    // Verify required aliases exist in headers
    const missingReq = Object.keys(headerAliases).filter(key => {
      const aliases = headerAliases[key];
      return !aliases.some(a => headers.some(h => h === a || h.includes(a)));
    });
    if (missingReq.length > 0) {
      throw new Error(`Faltan las siguientes columnas requeridas: ${missingReq.join(', ')}`);
    }

    // We'll build a metadata object with any extra columns (not required) so it's preserved
    const normalize = (s: string) => s
      .toLowerCase().trim()
      .replace(/[_:.-]+/g, ' ')
      .replace(/[^\p{L}\p{N} ]+/gu, ' ')
      .replace(/\s+/g, ' ');

    const normalizedHeaders = headers.map(h => normalize(h));

    const isRequiredHeader = (h: string) => {
      const lh = normalize(h);
      return Object.values(headerAliases).some(arr => arr.some(a => lh === normalize(a) || lh.includes(normalize(a))));
    };

    return rows.slice(1)
      .filter(row => Array.isArray(row) && row.some(c => (c ?? '').trim().length))
      .map((row, index) => {
        try {
          const values = row.map(c => this.cleanCellValue(c));

          // Mapear por posición o name de columna
          // Map required fields using headerAliases
          let name = this.findValueByHeader(headers, values, headerAliases['name']) || '';
          let surname = this.findValueByHeader(headers, values, headerAliases['surname']) || '';
          let email = this.findValueByHeader(headers, values, headerAliases['email']) || '';

          // Collect remaining columns into metadata
          const metaObj: Record<string, any> = {};
          headers.forEach((h, i) => {
            if (!isRequiredHeader(h) && !['dni', 'nif', 'documento', 'phone', 'telefono', 'movil'].some(k => h.includes(k))) {
              metaObj[h] = values[i] ?? '';
            }
          });

          // Graceful defaults and attention flags
          const attentionReasons: string[] = [];
          if (!email || !email.includes('@')) {
            email = 'corre@tudominio.es';
            attentionReasons.push('email_missing_or_invalid');
          }
          if (!name || !name.trim()) {
            name = 'Cliente';
            attentionReasons.push('name_missing');
          }
          if (!surname || !surname.trim()) {
            surname = 'Apellidos';
            attentionReasons.push('surname_missing');
          }

          const customer: Partial<Customer> = {
            name,
            apellidos: surname,
            email,
            dni: this.findValueByHeader(headers, values, ['dni', 'nif', 'documento']) || '',
            phone: this.findValueByHeader(headers, values, ['phone', 'teléfono', 'movil']) || ''
          };

          // attach metadata (as JSON string) for server-side insertion if there are any extra fields
          if (attentionReasons.length) {
            metaObj['needs_attention'] = true;
            metaObj['attention_reasons'] = attentionReasons;
          }

          if (Object.keys(metaObj).length) {
            (customer as any).metadata = JSON.stringify(metaObj);
          }
          return customer;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
          throw new Error(`Error en fila ${index + 2}: ${errorMessage}`);
        }
      });
  }

  /**
   * Parse CSV with custom field mappings
   */
  private parseCSVWithMappings(headers: string[], dataRows: string[][], fieldMappings: any[]): Partial<Customer>[] {
    const MAX_RECORDS = 500;

    if (dataRows.length > MAX_RECORDS) {
      throw new Error(`El archivo contiene ${dataRows.length} registros. El límite máximo es ${MAX_RECORDS} clientes por archivo.`);
    }

    // Create mapping lookup
    const mappingLookup = new Map<string, string>();
    fieldMappings.forEach(mapping => {
      if (mapping.targetField) {
        mappingLookup.set(mapping.csvHeader, mapping.targetField);
      }
    });

    return dataRows.filter(row => row.some(cell => cell.trim())).map((row, index) => {
      try {
        const customer: Partial<Customer> = {};
        const metadata: Record<string, any> = {};

        headers.forEach((header, i) => {
          const raw = row[i];
          const value = this.cleanCellValue(raw);
          const targetField = mappingLookup.get(header);

          if (targetField) {
            switch (targetField) {
              case 'name':
                customer.name = value;
                break;
              case 'surname':
                customer.apellidos = value;
                break;
              case 'email':
                customer.email = value;
                break;
              case 'phone':
                customer.phone = value;
                break;
              case 'dni':
                customer.dni = value;
                break;
              case 'address':
                (customer as any).address = value;
                break;
              case 'metadata':
              default:
                metadata[header] = value;
                break;
            }
          } else {
            // Unmapped fields go to metadata
            metadata[header] = value;
          }
        });

        // Graceful defaults and attention flags for required fields
        const meta2: Record<string, any> = (customer as any).metadata ? JSON.parse((customer as any).metadata) : {};
        const attentionReasons: string[] = Array.isArray(meta2['attention_reasons']) ? meta2['attention_reasons'] : [];
        if (!customer.email || !customer.email.includes('@')) {
          customer.email = 'corre@tudominio.es';
          attentionReasons.push('email_missing_or_invalid');
        }
        if (!customer.name || !customer.name.trim()) {
          customer.name = 'Cliente';
          attentionReasons.push('name_missing');
        }
        if (!customer.apellidos || !customer.apellidos.trim()) {
          customer.apellidos = 'Apellidos';
          attentionReasons.push('apellidos_missing');
        }
        if (attentionReasons.length) {
          meta2['needs_attention'] = true;
          meta2['attention_reasons'] = attentionReasons;
        }

        // Merge metadata from unmapped fields and attention meta (preserve attention)
        const finalMeta = Object.assign({}, metadata, meta2);
        if (Object.keys(finalMeta).length) {
          (customer as any).metadata = JSON.stringify(finalMeta);
        }

        return customer;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
        const rowText = Array.isArray(row) ? row.join(',') : String(row || '');
        const displayRow = rowText && rowText.trim() ? rowText : '<vacío>';
        throw new Error(`Error en fila ${index + 2}: ${errorMessage} | Contenido fila: ${displayRow}`);
      }
    });
  }

  /**
   * Process batch import with server-side function
   */
  private processBatchImport(customers: Partial<Customer>[]): Observable<Customer[]> {
    return new Observable(observer => {
      if (customers.length === 0) {
        observer.error(new Error('No hay clientes válidos para importar.'));
        return;
      }

      console.log(`📂 Procesando ${customers.length} clientes del CSV...`);

      // Build payload and call server-side batch importer. Use direccion_id (foreign key) instead of free-text address
      const payloadRows = customers.map(c => ({
        name: c.name,
        surname: c.apellidos, // Map apellidos to surname for server
        email: c.email,
        phone: c.phone,
        dni: c.dni,
        client_type: (c as any).client_type || 'individual',
        business_name: (c as any).business_name || undefined,
        cif_nif: (c as any).cif_nif || undefined,
        trade_name: (c as any).trade_name || undefined,
        metadata: (c as any).metadata,
        direccion_id: (c as any).direccion_id || null,
        company_id: (this.getCurrentUserFromSystemUsers(this.currentDevUserId || 'default-user')?.company_id) || this.authService.companyId() || undefined
      }));

      const proxyUrl = '/api/import-customers';
      const cfg = this.runtimeConfig.get();
      const functionUrl = `${cfg.supabase.url.replace(/\/$/, '')}/functions/v1/import-customers`;

      (async () => {
        try {
          // Try to get access token from AuthService-managed supabase client session
          let accessToken: string | undefined;
          try {
            const sessionRes: any = await this.authService.client.auth.getSession();
            const session = sessionRes?.data?.session || null;
            accessToken = session?.access_token || session?.accessToken || undefined;
          } catch (e) {
            // ignore
          }

          // Try refresh if we didn't get a token
          if (!accessToken) {
            try {
              console.warn('No access token found for import; attempting refreshSession...');
              await this.authService.client.auth.refreshSession();
              const sessionRes2: any = await this.authService.client.auth.getSession();
              const session2 = sessionRes2?.data?.session || null;
              accessToken = session2?.access_token || session2?.accessToken || undefined;
            } catch (err) {
              // ignore
            }
          }

          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (!accessToken) {
            throw new Error('No active session found. Please sign in before importing CSV files.');
          }
          headers['Authorization'] = `Bearer ${accessToken}`;
          headers['apikey'] = cfg.supabase.anonKey;

          // Try proxy first; if not JSON or method not allowed, fallback to direct function
          let resp = await fetch(proxyUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ rows: payloadRows })
          });

          const ct = resp.headers.get('content-type') || '';
          if ((!resp.ok && (resp.status === 404 || resp.status === 405)) || !ct.includes('application/json')) {
            resp = await fetch(functionUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify({ rows: payloadRows })
            });
          }

          if (!resp.ok) {
            const text = await resp.text().catch(() => null);
            throw new Error(`Batch import failed: ${resp.status} ${text || ''}`);
          }

          const json = await resp.json();
          const inserted = Array.isArray(json.inserted) ? json.inserted : (json.inserted || []);

          const newCustomers = inserted.filter((r: any) => r && r.id).map((row: any) => ({
            id: row.id,
            name: row.name || '',
            apellidos: row.apellidos || '',
            dni: row.dni || '',
            email: row.email || '',
            phone: row.phone || '',
            usuario_id: row.company_id || this.currentDevUserId || '',
            created_at: row.created_at,
            updated_at: row.updated_at || row.created_at,
            activo: true
          })) as Customer[];

          // Update local cache and finish
          const currentCustomers = this.customersSubject.value;
          this.customersSubject.next([...newCustomers, ...currentCustomers]);
          devSuccess(`Importación completada: ${newCustomers.length} clientes creados`);
          this.updateStats();

          observer.next(newCustomers);
          observer.complete();
        } catch (err) {
          observer.error(new Error('Batch import failed: ' + String(err)));
        }
      })();
    });
  }

  /**
   * Dev helper: Test the import endpoints (proxy and direct function) to verify availability.
   * Returns a Promise resolving with the two fetch results (proxy, direct) for easier UI debugging.
   */
  async testImportEndpoints(): Promise<{ proxy?: { status: number; text: string }, direct?: { status: number; text: string }, errors?: any[] }> {
    const proxyUrl = '/api/import-customers';
    const cfg = this.runtimeConfig.get();
    const functionUrl = `${cfg.supabase.url.replace(/\/$/, '')}/functions/v1/import-customers`;
    const samplePayload = { rows: [{ name: 'DEBUG', surname: 'USER', email: 'debug@example.com' }] };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    headers['apikey'] = cfg.supabase.anonKey;
    // Try to include auth if available using AuthService-managed client
    let accessToken: string | undefined;
    try {
      const sessionRes: any = await this.authService.client.auth.getSession();
      const session = sessionRes?.data?.session || null;
      accessToken = session?.access_token || session?.accessToken || undefined;
      if (!accessToken) {
        try {
          console.warn('No access token found for testImportEndpoints; attempting refreshSession...');
          await this.authService.client.auth.refreshSession();
          const sessionRes2: any = await this.authService.client.auth.getSession();
          const session2 = sessionRes2?.data?.session || null;
          accessToken = session2?.access_token || session2?.accessToken || undefined;
        } catch (err) {
          // ignore
        }
      }
    } catch (e) {
      // ignore
    }

    const result: any = { errors: [] };
    // If there's no access token we return an early diagnostic result instead of making unauthenticated calls
    if (!accessToken) {
      result.errors.push('No active session or access token found. Please sign in and retry.');
      result.proxy = { status: 401, text: 'No active session. Authorization required.' };
      result.direct = { status: 401, text: 'No active session. Authorization required.' };
      return result;
    }

    headers['Authorization'] = `Bearer ${accessToken}`;

    try {
      const resp = await fetch(proxyUrl, { method: 'POST', headers, body: JSON.stringify(samplePayload) });
      const ct = resp.headers.get('content-type') || '';
      const text = await resp.text().catch(() => '');
      result.proxy = { status: resp.status, text };
      if (!ct.includes('application/json')) {
        // Not JSON → treat as bad proxy
        result.errors.push('Proxy returned non-JSON');
      }
    } catch (err) {
      result.errors.push({ proxy: String(err) });
    }

    try {
      const resp2 = await fetch(functionUrl, { method: 'POST', headers, body: JSON.stringify(samplePayload) });
      const text2 = await resp2.text().catch(() => '');
      result.direct = { status: resp2.status, text: text2 };
    } catch (err) {
      result.errors.push({ direct: String(err) });
    }

    return result;
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

  // Clean a parsed CSV cell: trim, remove surrounding quotes (ASCII and common unicode), unescape doubled quotes
  private cleanCellValue(input: string | undefined | null): string {
    if (input == null) return '';
    let v = String(input).trim();
    // Replace common unicode quotes with ASCII for convenience
    v = v.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    // Remove surrounding quotes if present
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.substring(1, v.length - 1);
    }
    // Unescape doubled quotes produced by some CSV exporters
    v = v.replace(/""/g, '"');
    // Trim again after cleaning
    return v.trim();
  }

  // Robust CSV parser that supports quoted fields with embedded commas and newlines
  // Returns an array of rows, each row is an array of cell strings (raw, not yet cleaned)
  private parseCSVToRows(csv: string): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    while (i < csv.length) {
      const char = csv[i];
      if (char === '"') {
        if (inQuotes && csv[i + 1] === '"') {
          // Escaped quote inside quoted field
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
        i++;
        continue;
      }
      if (!inQuotes && char === ',') {
        currentRow.push(current);
        current = '';
        i++;
        continue;
      }
      if (!inQuotes && (char === '\n' || char === '\r')) {
        // Handle CRLF or lone CR/LF
        // If CRLF, skip the next \n
        // Push cell and row
        currentRow.push(current);
        current = '';
        // Only commit non-empty rows (at least one non-empty cell)
        if (currentRow.some(c => (c ?? '').trim().length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        // consume \r\n pair
        if (char === '\r' && csv[i + 1] === '\n') i += 2; else i++;
        continue;
      }
      // Regular char
      current += char;
      i++;
    }
    // Push last cell/row
    currentRow.push(current);
    if (currentRow.some(c => (c ?? '').trim().length > 0)) rows.push(currentRow);
    return rows;
  }

  // Método auxiliar para encontrar valores por name de cabecera
  private findValueByHeader(headers: string[], values: string[], possibleNames: string[]): string {
    const normalize = (s: string) => s
      .toLowerCase().trim()
      .replace(/[_:.-]+/g, ' ')
      .replace(/[^\p{L}\p{N} ]+/gu, ' ')
      .replace(/\s+/g, ' ');

    const normalizedHeaders = headers.map(h => normalize(h));
    const normalizedNames = possibleNames.map(n => normalize(n));

    // Prefer exact normalized match, then contains
    for (let i = 0; i < normalizedHeaders.length; i++) {
      const h = normalizedHeaders[i];
      if (normalizedNames.includes(h)) {
        const val = values[i];
        if (val != null && val !== '') return val;
      }
    }

    for (let i = 0; i < normalizedHeaders.length; i++) {
      const h = normalizedHeaders[i];
      if (normalizedNames.some(n => h.includes(n) || n.includes(h))) {
        const val = values[i];
        if (val != null && val !== '') return val;
      }
    }
    return '';
  }

  // ============================
  // Batch import with progress
  // ============================

  /**
   * Construye clientes parciales a partir de headers/datos + mappings del CSV
   */
  public buildPayloadRowsFromMapping(
    csvHeaders: string[],
    csvData: string[][],
    mappings: { field?: string; targetField?: string; csvHeader: string }[]
  ): Partial<Customer>[] {
    if (!Array.isArray(csvHeaders) || !Array.isArray(csvData) || !Array.isArray(mappings)) return [];

    const norm = (s: string) => (s || '').trim().toLowerCase();
    const headerIndex = new Map<string, number>(csvHeaders.map((h, i) => [norm(h), i]));

    const fieldToIndex = new Map<string, number>();
    for (const m of mappings) {
      const idx = headerIndex.get(norm(m.csvHeader));
      const fieldName = (m.field || m.targetField || '').trim();
      if (!fieldName) continue;
      if (typeof idx === 'number') fieldToIndex.set(fieldName, idx);
    }

    const totalCsvRows = csvData.length;
    const nonEmptyRowsArr = csvData.filter(r => Array.isArray(r) && r.some(c => (c || '').trim()));
    const nonEmptyCount = nonEmptyRowsArr.length;
    try { console.log('[CSV-MAP] Rows received:', totalCsvRows, 'non-empty:', nonEmptyCount, 'mappings:', mappings.length); } catch { }

    const rows: Partial<Customer>[] = nonEmptyRowsArr
      .map(row => {
        const pick = (field: string) => {
          const i = fieldToIndex.get(field);
          return typeof i === 'number' ? this.cleanCellValue(row[i]) : '';
        };

        const item: Partial<Customer> = {
          // Campos comunes
          email: pick('email'),
          phone: pick('phone') || pick('telefono'),

          // Campos persona física
          name: pick('name'),
          apellidos: pick('apellidos') || pick('surname'),
          dni: pick('dni') || pick('nif') || pick('documento'),

          // Campos empresa/persona jurídica
          client_type: (pick('client_type') as 'individual' | 'business') || 'individual', // default a 'individual' si no se especifica
          business_name: pick('business_name'),
          cif_nif: pick('cif_nif'),
          trade_name: pick('trade_name'),
          legal_representative_name: pick('legal_representative_name'),
          legal_representative_dni: pick('legal_representative_dni'),
          mercantile_registry_data: pick('mercantile_registry_data')
        };

        // Legacy address field (dirección completa como texto) - ahora en variable adicional
        const address = pick('address') || pick('direccion');
        if (address) (item as any).address = address;

        // Campos de dirección estructurada (si los necesitamos más adelante)
        const addressTipoVia = pick('addressTipoVia');
        const addressNombre = pick('addressNombre');
        const addressNumero = pick('addressNumero');
        if (addressTipoVia) (item as any).addressTipoVia = addressTipoVia;
        if (addressNombre) (item as any).addressNombre = addressNombre;
        if (addressNumero) (item as any).addressNumero = addressNumero;

        return item;
      });

    // Apply sensible defaults so required fields don’t drop the row silently; server still validates
    const normalized = rows.map(r => {
      const copy = { ...r } as any;
      if (!copy.email || !copy.email.includes('@')) copy.email = 'corre@tudominio.es';
      if (!copy.name || !copy.name.trim()) copy.name = 'Cliente';
      if (!copy.apellidos || !copy.apellidos.trim()) copy.apellidos = 'Apellidos';
      return copy as Partial<Customer>;
    });
    const mapped = normalized.filter(r => (r.name && r.name.trim()) || (r.email && r.email.trim()));
    try { console.log('[CSV-MAP] After mapping defaults -> candidates:', rows.length, 'kept:', mapped.length); } catch { }
    return mapped;
  }

  /**
   * Importa clientes en lotes con feedback de progreso.
   */
  public importCustomersInBatches(
    allCustomers: Partial<Customer>[],
    batchSize = 5
  ): Observable<{
    importedCount: number;
    totalCount: number;
    batchNumber: number;
    batchSize: number;
    latestImported: Customer[] | null;
    error?: any;
  }> {
    const totalCount = allCustomers.length;
    try { console.log('[IMPORT] Starting batch import. totalCount:', totalCount, 'batchSize:', batchSize); } catch { }
    let importedCount = 0;

    const batches: Partial<Customer>[][] = [];
    for (let i = 0; i < totalCount; i += batchSize) {
      batches.push(allCustomers.slice(i, i + batchSize));
    }

    const progress$ = new Subject<{
      importedCount: number;
      totalCount: number;
      batchNumber: number;
      batchSize: number;
      latestImported: Customer[] | null;
      error?: any;
    }>();

    from(batches)
      .pipe(
        concatMap((batch, index) =>
          this.callImportBatch(batch).pipe(
            tap(imported => {
              importedCount += imported.length;
              progress$.next({
                importedCount,
                totalCount,
                batchNumber: index + 1,
                batchSize: batch.length,
                latestImported: imported
              });
            }),
            catchError(error => {
              progress$.next({
                importedCount,
                totalCount,
                batchNumber: index + 1,
                batchSize: batch.length,
                latestImported: null,
                error
              });
              // Propagar el error para que el suscriptor superior pueda reaccionar y NO mostrar falso positivo
              throw error;
            })
          )
        )
      )
      .subscribe({ complete: () => progress$.complete() });

    return progress$.asObservable();
  }

  /**
   * Llama a la importación de un lote usando el mismo camino que processBatchImport
   */
  private callImportBatch(batch: Partial<Customer>[]): Observable<Customer[]> {
    return this.processBatchImport(batch);
  }
}
