import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DevRoleService } from '../../services/dev-role.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-dev-setup',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container-fluid p-4">
      <div class="row">
        <div class="col-12">
          <h2>🔧 Configuración de Desarrollo</h2>
          <p class="text-muted">Herramientas para configurar roles y accesos de desarrollo</p>
          
          <div class="card mb-4">
            <div class="card-header">
              <h5>Estado del Sistema</h5>
            </div>
            <div class="card-body">
              <div class="row">
                <div class="col-md-6">
                  <p><strong>Modo:</strong> 
                    <span class="badge" [ngClass]="!isProduction ? 'bg-warning' : 'bg-success'">
                      {{ !isProduction ? 'Desarrollo' : 'Producción' }}
                    </span>
                  </p>
                  <p><strong>Usuario Dev:</strong> 
                    <span class="badge" [ngClass]="isDev ? 'bg-success' : 'bg-secondary'">
                      {{ isDev ? 'Activo' : 'No activo' }}
                    </span>
                  </p>
                  <p><strong>Role actual:</strong> {{ currentRole }}</p>
                </div>
                <div class="col-md-6">
                  <p><strong>Puede ver herramientas dev:</strong> 
                    <span class="badge" [ngClass]="canSeeDevTools ? 'bg-success' : 'bg-danger'">
                      {{ canSeeDevTools ? 'Sí' : 'No' }}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="card mb-4">
            <div class="card-header">
              <h5>Configurar Base de Datos</h5>
            </div>
            <div class="card-body">
              <button 
                class="btn btn-primary me-2"
                (click)="setupDatabase()"
                [disabled]="isSettingUp">
                {{ isSettingUp ? 'Configurando...' : '⚙️ Crear Sistema de Roles' }}
              </button>
              
              <button 
                class="btn btn-success me-2"
                (click)="testDevUser()"
                [disabled]="isSettingUp">
                🧪 Probar Usuario Dev
              </button>
            </div>
          </div>

          <div class="card" *ngIf="messages.length > 0">
            <div class="card-header">
              <h5>Log de Operaciones</h5>
            </div>
            <div class="card-body">
              <div 
                *ngFor="let message of messages" 
                class="alert"
                [ngClass]="{
                  'alert-success': message.type === 'success',
                  'alert-danger': message.type === 'error',
                  'alert-info': message.type === 'info'
                }">
                <small class="text-muted">{{ message.timestamp | date:'short' }}</small><br>
                {{ message.text }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .card {
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .badge {
      font-size: 0.8em;
    }
    .alert {
      margin-bottom: 0.5rem;
    }
  `]
})
export class DevSetupComponent implements OnInit {
  isProduction = environment.production;
  isDev = false;
  canSeeDevTools = false;
  currentRole = 'user';
  isSettingUp = false;
  messages: Array<{type: string, text: string, timestamp: Date}> = [];

  private supabase: SupabaseClient;

  constructor(public devRoleService: DevRoleService) {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );
  }

  ngOnInit() {
    this.devRoleService.currentDevUser$.subscribe(user => {
      this.isDev = user?.is_dev || false;
      this.canSeeDevTools = this.devRoleService.canSeeDevTools();
      this.currentRole = this.devRoleService.getUserRole();
    });
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
    this.addMessage('info', 'Probando usuario dev...');
    try {
      const devUser = await this.devRoleService.verifyUserRole('dev@simplifica.com');
      if (devUser) {
        this.addMessage('success', `✅ Usuario dev verificado: ${devUser.role}`);
      } else {
        this.addMessage('error', '❌ Usuario dev no encontrado en la base de datos');
      }
    } catch (error) {
      this.addMessage('error', `❌ Error verificando usuario dev: ${error}`);
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
