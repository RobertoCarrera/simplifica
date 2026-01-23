import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DevRoleService } from '../../../services/dev-role.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-dev-setup',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="w-full p-4">
      <div class="grid grid-cols-12 gap-6">
        <div class="col-span-12">
          <h2 class="text-2xl font-bold mb-2">🔧 Configuración de Desarrollo</h2>
          <p class="text-gray-500 mb-6">Herramientas para configurar roles y accesos de desarrollo</p>
          
          <div class="bg-white rounded-lg shadow mb-6">
            <div class="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
              <h5 class="text-lg font-medium text-gray-900">Estado del Sistema</h5>
            </div>
            <div class="p-6">
              <div class="grid grid-cols-12 gap-6">
                <div class="col-span-12 md:col-span-6">
                  <p class="mb-2"><strong>Modo:</strong> 
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ml-2" 
                      [ngClass]="!isProduction ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'">
                      {{ !isProduction ? 'Desarrollo' : 'Producción' }}
                    </span>
                  </p>
                  <p class="mb-2"><strong>Usuario Dev:</strong> 
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ml-2" 
                      [ngClass]="isDev ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'">
                      {{ isDev ? 'Activo' : 'No activo' }}
                    </span>
                  </p>
                  <p><strong>Role actual:</strong> {{ currentRole }}</p>
                </div>
                <div class="col-span-12 md:col-span-6">
                  <p><strong>Puede ver herramientas dev:</strong> 
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ml-2" 
                      [ngClass]="canSeeDevTools ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'">
                      {{ canSeeDevTools ? 'Sí' : 'No' }}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow mb-6">
            <div class="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
              <h5 class="text-lg font-medium text-gray-900">Configurar Base de Datos</h5>
            </div>
            <div class="p-6">
              <button 
                class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 mr-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                (click)="setupDatabase()"
                [disabled]="isSettingUp">
                {{ isSettingUp ? 'Configurando...' : '⚙️ Crear Sistema de Roles' }}
              </button>
              
              <button 
                class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 mr-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                (click)="testDevUser()"
                [disabled]="isSettingUp">
                🧪 Probar Usuario Dev
              </button>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow" *ngIf="messages.length > 0">
            <div class="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
              <h5 class="text-lg font-medium text-gray-900">Log de Operaciones</h5>
            </div>
            <div class="p-6">
              <div 
                *ngFor="let message of messages" 
                class="rounded-md p-4 mb-2 border-l-4"
                [ngClass]="{
                  'bg-green-50 text-green-700 border-green-400': message.type === 'success',
                  'bg-red-50 text-red-700 border-red-400': message.type === 'error',
                  'bg-blue-50 text-blue-700 border-blue-400': message.type === 'info'
                }">
                <small class="text-gray-500 block mb-1">{{ message.timestamp | date:'short' }}</small>
                {{ message.text }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class DevSetupComponent implements OnInit {
  isProduction = environment.production;
  isDev = false;
  canSeeDevTools = false;
  currentRole = 'user';
  isSettingUp = false;
  messages: Array<{ type: string, text: string, timestamp: Date }> = [];

  private supabase: SupabaseClient;

  constructor(
    public devRoleService: DevRoleService,
    public authService: AuthService,
    private supabaseClientService: SupabaseClientService
  ) {
    this.supabase = this.supabaseClientService.instance;
  }

  ngOnInit() {
    // Usar datos del usuario autenticado directamente
    this.isDev = this.devRoleService.isDev();
    this.canSeeDevTools = this.devRoleService.canSeeDevTools();
    this.currentRole = this.devRoleService.getUserRole();
  }

  async setupDatabase() {
    this.isSettingUp = true;
    this.addMessage('info', 'Configurando usuario dev en tabla users...');

    try {
      // 1. Crear company para desarrollo
      const createCompanySQL = `
        INSERT INTO companies (id, name, slug, settings, website, subscription_tier, max_users, is_active)
        VALUES (
          '00000000-0000-0000-0000-000000000001',
          'Simplifica Dev Company',
          'dev-company',
          '{"isDev": true, "environment": "development"}',
          'https://dev.simplifica.com',
          'enterprise',
          999,
          true
        ) ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          settings = EXCLUDED.settings;
      `;

      await this.executeSQL(createCompanySQL, 'Company dev creada');

      // 2. Crear usuario dev en tabla users
      const createUserSQL = `
        INSERT INTO users (id, company_id, email, name, role, active, permissions)
        VALUES (
          '00000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000001',
          'dev@simplifica.com',
          'Developer User',
          'superadmin',
          true,
          '{
            "moduloFacturas": true,
            "moduloMaterial": true,
            "moduloServicios": true,
            "moduloPresupuestos": true,
            "isDev": true,
            "canSeeAllCompanies": true,
            "canSeeDevTools": true,
            "canManageUsers": true
          }'::jsonb
        ) ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          permissions = EXCLUDED.permissions;
      `;

      await this.executeSQL(createUserSQL, 'Usuario dev@simplifica.com configurado');

      // 3. Crear funciones de utilidad
      const functionsSQL = `
        CREATE OR REPLACE FUNCTION is_dev_user(user_email TEXT)
        RETURNS BOOLEAN AS $function$
        BEGIN
          RETURN EXISTS (
            SELECT 1 FROM users 
            WHERE email = user_email 
            AND role = 'superadmin'
            AND active = true
            AND (permissions->>'isDev')::boolean = true
          );
        END;
        $function$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

        CREATE OR REPLACE FUNCTION get_user_permissions(user_email TEXT)
        RETURNS JSONB AS $function$
        DECLARE
          user_perms JSONB;
        BEGIN
          SELECT permissions INTO user_perms
          FROM users 
          WHERE email = user_email AND active = true;
          
          RETURN COALESCE(user_perms, '{}');
        END;
        $function$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
      `;

      await this.executeSQL(functionsSQL, 'Funciones de utilidad creadas');

      this.addMessage('success', '✅ Sistema de desarrollo configurado correctamente');

    } catch (error) {
      this.addMessage('error', `❌ Error configurando sistema: ${error}`);
    } finally {
      this.isSettingUp = false;
    }
  }

  async testDevUser() {
    this.addMessage('info', 'Verificando permisos de desarrollo del usuario actual...');
    try {
      const currentUser = this.authService.userProfile;
      if (currentUser) {
        this.addMessage('success', `✅ Usuario: ${currentUser.full_name} (${currentUser.role})`);
        this.addMessage('info', `📧 Email: ${currentUser.email}`);
        this.addMessage('info', `🏢 Empresa: ${currentUser.company?.name || 'No asignada'}`);

        if (this.devRoleService.canSeeDevTools()) {
          this.addMessage('success', '🛠️ Herramientas de desarrollo disponibles');
        }
        if (this.devRoleService.canSeeAllCompanies()) {
          this.addMessage('success', '🏢 Acceso a todas las empresas disponible');
        }
        if (this.devRoleService.canManageUsers()) {
          this.addMessage('success', '👥 Gestión de usuarios disponible');
        }
      } else {
        this.addMessage('error', '❌ No hay usuario autenticado');
      }
    } catch (error) {
      this.addMessage('error', `❌ Error verificando usuario: ${error}`);
    }
  }

  private async executeSQL(sql: string, successMessage: string) {
    const { error } = await this.supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      throw new Error(`SQL Error: ${error.message}`);
    }

    this.addMessage('success', successMessage);
  }

  private addMessage(type: string, text: string) {
    this.messages.unshift({
      type,
      text,
      timestamp: new Date()
    });

    // Mantener solo los últimos 10 mensajes
    if (this.messages.length > 10) {
      this.messages = this.messages.slice(0, 10);
    }
  }
}
