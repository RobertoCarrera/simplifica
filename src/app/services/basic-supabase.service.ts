import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { Observable, from, BehaviorSubject } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

// Interfaz básica para testing
export interface BasicCustomer {
  id?: string;
  nombre: string;
  apellidos: string;
  email: string;
  telefono?: string;
  created_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class BasicSupabaseService {
  private supabase: SupabaseClient;
  
  // Estado reactivo básico
  private customersSubject = new BehaviorSubject<BasicCustomer[]>([]);
  public customers$ = this.customersSubject.asObservable();

  constructor(private sbClient: SupabaseClientService) {
    console.log('🔧 Configurando Supabase (singleton)...');
    console.log('URL:', environment.supabase.url);
    console.log('Key (primeros 20 chars):', environment.supabase.anonKey.substring(0, 20) + '...');

    this.supabase = this.sbClient.instance;

    console.log('✅ Cliente Supabase (compartido) listo');
    this.testConnection();
  }

  // Test básico de conexión
  private async testConnection() {
    try {
      console.log('🔗 Testing conexión a Supabase...');
      
      // Test 1: Verificar que el cliente funciona
      const { data, error } = await this.supabase
        .from('clients')
        .select('count', { count: 'exact', head: true });
      
      if (error) {
        console.error('❌ Error al conectar:', error);
        return;
      }
      
      console.log('✅ Conexión exitosa. Número de clientes:', data);
      
    } catch (err) {
      console.error('❌ Error crítico:', err);
    }
  }

  // Método para obtener clientes básico
  getCustomers(): Observable<BasicCustomer[]> {
    console.log('📥 Obteniendo clientes...');
    
    return from(
      this.supabase
        .from('clients')
        .select('id, name, apellidos, email, phone, created_at')
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('❌ Error al obtener clientes:', error);
          throw error;
        }
        console.log('✅ Clientes obtenidos:', data);
        
        // Convertir de clients a BasicCustomer
        const convertedData = data?.map(client => ({
          id: client.id,
          nombre: client.name,
          apellidos: client.apellidos || '',
          email: client.email || '',
          telefono: client.phone || '',
          created_at: client.created_at
        })) || [];
        
        return convertedData;
      }),
      tap(customers => this.customersSubject.next(customers))
    );
  }

  // Método para crear cliente básico (sin RLS por ahora)
  createCustomer(customer: Omit<BasicCustomer, 'id' | 'created_at'>): Observable<BasicCustomer> {
    console.log('📤 Creando cliente:', customer);
    
    // Convertir de BasicCustomer a estructura de clients
    const customerData: any = {
      name: customer.nombre,
      apellidos: customer.apellidos,
      email: customer.email,
      phone: customer.telefono
    };
    // Do not default to numeric company ids; let DB or caller set company_id
    
    return from(
      this.supabase
        .from('clients')
        .insert([customerData])
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('❌ Error al crear cliente:', error);
          throw error;
        }
        console.log('✅ Cliente creado:', data);
        
        // Convertir de clients a BasicCustomer
        const convertedData: BasicCustomer = {
          id: data.id,
          nombre: data.name,
          apellidos: data.apellidos || '',
          email: data.email || '',
          telefono: data.phone || '',
          created_at: data.created_at
        };
        
        // Refrescar la lista
        this.getCustomers().subscribe();
        return convertedData;
      })
    );
  }

  // Test de configuración
  async testSupabaseConfig(): Promise<boolean> {
    try {
      console.log('🧪 Testing configuración de Supabase...');
      
      // Test básico de la API
      const { data, error } = await this.supabase
        .from('clients')
        .select('count', { count: 'exact', head: true });
      
      if (error) {
        console.error('❌ Error de configuración:', error.message);
        console.log('💡 Posibles causas:');
        console.log('1. Tabla "clients" no existe');
        console.log('2. RLS bloqueando acceso');
        console.log('3. Credenciales incorrectas');
        return false;
      }
      
      console.log('✅ Configuración OK');
      return true;
      
    } catch (err) {
      console.error('❌ Error crítico de configuración:', err);
      return false;
    }
  }
}
