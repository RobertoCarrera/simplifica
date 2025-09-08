import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { getCurrentSupabaseConfig, devLog, devError, devSuccess } from '../../config/supabase.config';

interface SystemUser {
  id: string;
  name: string;
  email: string;
  company_id: string;
  role: string;
  customerCount?: number;
}

@Component({
  selector: 'app-dev-user-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dev-user-selector" style="background: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: 600; color: #0c4a6e;">👤 Usuario Activo:</span>
          <select 
            [(ngModel)]="selectedUserId" 
            (change)="onUserChange()"
            style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; min-width: 300px;">
            <option value="">{{ users().length > 0 ? 'Seleccionar usuario' : 'Cargando usuarios...' }}</option>
            <option *ngFor="let user of users()" [value]="user.id">
              {{ user.name }} - {{ user.email }} ({{ user.customerCount || 0 }} clientes)
            </option>
          </select>
        </div>
        
        <button 
          (click)="refreshUsers()"
          style="padding: 8px 16px; background: #0ea5e9; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
          🔄 Actualizar
        </button>
        
        <button 
          (click)="createTestCustomers()"
          style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
          ➕ Crear Clientes Test
        </button>
      </div>
      
      <div *ngIf="selectedUserId" style="margin-top: 12px; padding: 8px 12px; background: #e0f2fe; border-radius: 4px; font-size: 14px; color: #0c4a6e;">
        📍 Viendo como: <strong>{{ getCurrentUser()?.name }}</strong> ({{ getCurrentUser()?.email }})
      </div>
      
      <div *ngIf="lastDiagnostic()" style="margin-top: 8px; padding: 6px 8px; background: #fff3cd; border-radius: 4px; font-size: 12px; color: #856404;">
        🔧 {{ lastDiagnostic() }}
      </div>
    </div>
  `
})
export class DevUserSelectorComponent implements OnInit {
  private supabase: SupabaseClient;
  public config = getCurrentSupabaseConfig();
  lastDiagnostic = signal<string>('');
  
  // Array dinámico que se cargará desde la base de datos
  private systemUsers: SystemUser[] = [];
  
  users = signal<SystemUser[]>([]);
  selectedUserId: string = '';

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );
  }

  ngOnInit() {
    if (!this.config.enableDevUserSelector) {
      devLog('Selector de usuario DEV deshabilitado por configuración');
      return;
    }
    
    devLog('Iniciando DEV User Selector');
    this.loadSystemUsers();
    
    // Activar diagnóstico automáticamente en desarrollo
    if (this.config.enableDiagnosticLogging) {
      this.diagnosticTest();
    }
  }
  
  // Método de diagnóstico para ver qué está pasando
  async diagnosticTest() {
    if (!this.config.enableDiagnosticLogging) {
      return;
    }
    
    try {
      devLog('=== DIAGNÓSTICO COMPLETO DEV MODE ===');
      
      // Test 1: Ver TODOS los datos sin filtros (usando tabla real 'clients')
      devLog('Test 1: Consultando TODOS los clientes de la tabla REAL...');
      const { data: allCustomers, error: allError } = await this.supabase
        .from('clients')
        .select('id, name, email, company_id, created_at');
      
      devLog('Total clientes en la tabla CLIENTS:', allCustomers?.length || 0);
      if (allError) devError('Error:', allError);
      
      if (allCustomers && allCustomers.length > 0) {
        // Mostrar algunos ejemplos
        devLog('Ejemplos de clientes REALES:', allCustomers.slice(0, 3));
        
        // Ver todas las company_id únicas que existen
        const uniqueCompanyIds = [...new Set(allCustomers.map(c => c.company_id))];
        devLog('Company IDs únicos en clients:', uniqueCompanyIds);
        
        // Verificar si nuestros usuarios del sistema tienen clientes
        devLog('=== CONTEO POR COMPANY DE USUARIO DEL SISTEMA ===');
        for (const systemUser of this.systemUsers) {
          const clientsForCompany = allCustomers.filter(c => c.company_id === systemUser.company_id);
          devLog(`${systemUser.name} (company: ${systemUser.company_id}): ${clientsForCompany.length} clientes`);
          if (clientsForCompany.length > 0) {
            devLog('  Ejemplos:', clientsForCompany.slice(0, 2).map(c => c.name));
          }
        }
      } else {
        devLog('❌ La tabla clients está vacía o hay un problema de permisos');
      }
      
      devLog('=== FIN DIAGNÓSTICO ===');
      
    } catch (error) {
      devError('Error en diagnóstico:', error);
      this.lastDiagnostic.set(`Error: ${error}`);
    }
  }

  async loadSystemUsers() {
    try {
      devLog('Cargando usuarios del sistema desde la base de datos...');
      
      // Obtener todos los usuarios activos de la tabla 'users'
      const { data: usersData, error } = await this.supabase
        .from('users')
        .select(`
          id,
          name,
          email,
          company_id,
          role,
          active
        `)
        .eq('active', true)
        .is('deleted_at', null);

      if (error) {
        devError('Error al cargar usuarios:', error);
        this.lastDiagnostic.set(`❌ Error al cargar usuarios: ${error.message}`);
        return;
      }

      if (!usersData || usersData.length === 0) {
        devLog('⚠️ No se encontraron usuarios activos en la base de datos');
        this.lastDiagnostic.set('⚠️ No hay usuarios activos disponibles');
        return;
      }

      // Convertir datos a formato SystemUser
      this.systemUsers = usersData.map(user => ({
        id: user.id,
        name: user.name || 'Sin nombre',
        email: user.email,
        company_id: user.company_id,
        role: user.role || 'member'
      }));

      devLog(`✅ Se cargaron ${this.systemUsers.length} usuarios:`, this.systemUsers);
      this.lastDiagnostic.set(`✅ Cargados ${this.systemUsers.length} usuarios del sistema`);
      
      // Ahora cargar los conteos de clientes
      await this.loadUsers();

    } catch (error) {
      devError('Error al cargar usuarios del sistema:', error);
      this.lastDiagnostic.set(`❌ Error: ${error}`);
    }
  }

  async loadUsers() {
    try {
      devLog('Calculando conteos de clientes para usuarios...');
      
      if (this.systemUsers.length === 0) {
        devLog('⚠️ No hay usuarios del sistema cargados');
        return;
      }
      
      // Contar clientes por cada usuario del sistema - usando la tabla 'clients' real
      const usersWithCounts: SystemUser[] = [];
      
      for (const systemUser of this.systemUsers) {
        try {
          // Query a la tabla 'clients' real filtrando por company_id
          const { count: directCount } = await this.supabase
            .from('clients')
            .select('*', { count: 'exact', head: true })
            .eq('company_id', systemUser.company_id)
            .is('deleted_at', null);
          
          usersWithCounts.push({
            id: systemUser.id,
            name: systemUser.name,
            email: systemUser.email,
            company_id: systemUser.company_id,
            role: systemUser.role,
            customerCount: directCount || 0
          });
        } catch (userError) {
          console.warn('Error contando clientes para:', systemUser.name, userError);
          usersWithCounts.push({
            id: systemUser.id,
            name: systemUser.name,
            email: systemUser.email,
            company_id: systemUser.company_id,
            role: systemUser.role,
            customerCount: 0
          });
        }
      }

      console.log('✅ Usuarios cargados con conteos:', usersWithCounts);
      this.users.set(usersWithCounts);
      this.lastDiagnostic.set(`✅ ${usersWithCounts.length} usuarios activos con conteos actualizados`);

    } catch (error) {
      console.error('❌ Error al cargar usuarios:', error);
      this.lastDiagnostic.set(`❌ Error al calcular conteos: ${error}`);
    }
  }

  onUserChange() {
    console.log('🔄 DEV: Cambiando a usuario:', this.selectedUserId);
    console.log('🔄 DEV: Usuario seleccionado:', this.getCurrentUser());
    
    // Emitir evento para que el componente padre lo escuche
    const customEvent = new CustomEvent('devUserChanged', {
      detail: { userId: this.selectedUserId }
    });
    
    console.log('🔄 DEV: Emitiendo evento devUserChanged:', customEvent.detail);
    window.dispatchEvent(customEvent);
  }

  async refreshUsers() {
    console.log('🔄 Refrescando lista de usuarios...');
    await this.loadSystemUsers();
  }

  async createTestCustomers() {
    if (!this.selectedUserId) {
      alert('Por favor selecciona un usuario primero');
      return;
    }

    try {
      devLog('Creando clientes de prueba para usuario:', this.selectedUserId);
      
      const testCustomers = [
        {
          nombre: 'Juan Carlos',
          apellidos: 'García López',
          email: `juan.garcia.${Date.now()}@test.com`,
          telefono: '+34 666 123 456',
          dni: '12345678A',
          usuario_id: this.selectedUserId
        },
        {
          nombre: 'María',
          apellidos: 'Rodríguez Martín',
          email: `maria.rodriguez.${Date.now()}@test.com`,
          telefono: '+34 666 789 012',
          dni: '87654321B',
          usuario_id: this.selectedUserId
        },
        {
          nombre: 'Carlos',
          apellidos: 'Fernández Ruiz',
          email: `carlos.fernandez.${Date.now()}@test.com`,
          telefono: '+34 666 345 678',
          dni: '11223344C',
          usuario_id: this.selectedUserId
        }
      ];

      for (const customer of testCustomers) {
        // Convertir de Customer a estructura de clients
        const selectedUser = this.systemUsers.find(u => u.id === this.selectedUserId);
        const clientData = {
          name: customer.nombre,
          apellidos: customer.apellidos,
          dni: customer.dni,
          email: customer.email,
          phone: customer.telefono,
          company_id: selectedUser?.company_id || 1
        };
        
        const { error } = await this.supabase
          .from('clients')
          .insert([clientData]);
        
        if (error) {
          devError('Error al crear cliente:', error);
        } else {
          devSuccess('Cliente creado:', customer.nombre);
        }
      }

      devSuccess('Clientes de prueba creados exitosamente');
      this.lastDiagnostic.set(`✅ Se crearon ${testCustomers.length} clientes de prueba`);
      
      // Actualizar contadores
      await this.loadUsers();
      
      // Refrescar lista de clientes
      window.dispatchEvent(new CustomEvent('devUserChanged', {
        detail: { userId: this.selectedUserId }
      }));

    } catch (error) {
      devError('Error al crear clientes de prueba:', error);
      this.lastDiagnostic.set(`❌ Error al crear clientes: ${error}`);
    }
  }

  getCurrentUser(): SystemUser | null {
    return this.users().find(user => user.id === this.selectedUserId) || null;
  }
}
