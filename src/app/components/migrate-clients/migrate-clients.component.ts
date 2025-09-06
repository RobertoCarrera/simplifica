import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-migrate-clients',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="migration-container">
      <h2>🔄 Migración de Clientes por Tenant</h2>
      
      <div class="info-box">
        <h3>📋 ¿Qué hace esta migración?</h3>
        <ul>
          <li><strong>SatPCGo:</strong> Clientes originales de reparación de PC (Ana, Luis, Sofía, Manolo, "POR FAVOR FUNCIONA")</li>
          <li><strong>Michinanny:</strong> Clientes para servicios de mascotas (Carmen, Mikimiau, Isabel)</li>
          <li><strong>Libera Tus Creencias:</strong> Clientes de coaching/terapia (Elena, Mamerto, Alberto)</li>
        </ul>
        <p><em>Total: 11 clientes distribuidos entre 3 tenants para probar la separación multi-tenant</em></p>
      </div>
      
      <button (click)="executeClientMigration()" [disabled]="loading" class="migrate-btn">
        {{ loading ? '⏳ Ejecutando...' : '🚀 Ejecutar Migración Distribuida' }}
      </button>
      
      @if (result) {
        <div class="result">
          <h3>✅ Resultado:</h3>
          <pre>{{ result }}</pre>
        </div>
      }
      
      @if (error) {
        <div class="error">
          <h3>❌ Error:</h3>
          <pre>{{ error }}</pre>
        </div>
      }
      
      @if (result && !error) {
        <div class="next-steps">
          <h3>🎯 Siguientes pasos:</h3>
          <ol>
            <li><a href="/clientes?tenant=satpcgo" target="_blank">Ver clientes de SatPCGo</a></li>
            <li><a href="/clientes?tenant=michinanny" target="_blank">Ver clientes de Michinanny</a></li>
            <li><a href="/clientes?tenant=admin" target="_blank">Ver clientes de Libera Tus Creencias</a></li>
          </ol>
        </div>
      }
    </div>
  `,
  styles: [`
    .migration-container {
      padding: 20px;
      max-width: 900px;
      margin: 0 auto;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    
    .info-box {
      background: #f8f9fa;
      border: 2px solid #dee2e6;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    
    .info-box h3 {
      color: #495057;
      margin-top: 0;
    }
    
    .info-box ul {
      margin: 10px 0;
    }
    
    .info-box li {
      margin: 8px 0;
    }
    
    .migrate-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 30px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 16px;
      font-weight: 600;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .migrate-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.3);
    }
    
    .migrate-btn:disabled {
      background: #6c757d;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    
    .result {
      margin-top: 20px;
      padding: 20px;
      background: #d1ecf1;
      border: 1px solid #bee5eb;
      border-radius: 8px;
    }
    
    .error {
      margin-top: 20px;
      padding: 20px;
      background: #f8d7da;
      border: 1px solid #f5c6cb;
      border-radius: 8px;
    }
    
    .next-steps {
      margin-top: 20px;
      padding: 20px;
      background: #d4edda;
      border: 1px solid #c3e6cb;
      border-radius: 8px;
    }
    
    .next-steps a {
      color: #155724;
      text-decoration: none;
      font-weight: 500;
    }
    
    .next-steps a:hover {
      text-decoration: underline;
    }
    
    pre {
      white-space: pre-wrap;
      font-family: 'Courier New', monospace;
      font-size: 14px;
      line-height: 1.4;
      margin: 10px 0;
    }
  `]
})
export class MigrateClientsComponent {
  loading = false;
  result: string = '';
  error: string = '';

  constructor(private supabase: SimpleSupabaseService) {}

  async executeClientMigration() {
    this.loading = true;
    this.result = '';
    this.error = '';

    try {
      console.log('🔄 Iniciando migración distribuida de clientes...');
      
      // Ejecutar la función de migración distribuida
      const { data, error } = await this.supabase.getClient()
        .rpc('migrate_clients_by_tenant');

      if (error) {
        console.error('❌ Error en migración:', error);
        this.error = `Error: ${error.message}\n\nDetalles técnicos:\n${JSON.stringify(error, null, 2)}`;
      } else {
        console.log('✅ Migración exitosa:', data);
        this.result = data || 'Migración completada sin datos de retorno';
        
        // Verificar los datos migrados
        await this.verifyMigratedData();
      }
    } catch (err: any) {
      console.error('❌ Error ejecutando migración:', err);
      this.error = `Error: ${err.message || 'Error desconocido'}`;
    } finally {
      this.loading = false;
    }
  }

  private async verifyMigratedData() {
    try {
      console.log('🔍 Verificando datos migrados...');
      
      const { data: clients, error } = await this.supabase.getClient()
        .from('clients')
        .select(`
          id,
          name,
          email,
          phone,
          metadata,
          companies:company_id (name)
        `)
        .eq('metadata->migration_source', 'legacy_data')
        .order('companies(name)', { ascending: true });

      if (error) {
        this.result += `\n\n❌ Error verificando datos: ${error.message}`;
        return;
      }

      this.result += `\n\n=== 📊 VERIFICACIÓN POR TENANT ===`;
      
      if (clients && clients.length > 0) {
        // Agrupar por empresa
        const clientsByCompany: { [key: string]: any[] } = {};
        
        clients.forEach((client: any) => {
          const companyName = client.companies?.name || 'Sin empresa';
          if (!clientsByCompany[companyName]) {
            clientsByCompany[companyName] = [];
          }
          clientsByCompany[companyName].push(client);
        });

        // Mostrar resultados por empresa
        Object.keys(clientsByCompany).forEach(companyName => {
          const companyClients = clientsByCompany[companyName];
          this.result += `\n\n🏢 ${companyName} (${companyClients.length} clientes):`;
          
          companyClients.forEach((client: any) => {
            const tipoCliente = client.metadata?.tipo_cliente || 'general';
            this.result += `\n  • ${client.name} (${client.email}) - ${tipoCliente}`;
          });
        });

        this.result += `\n\n✅ Total verificado: ${clients.length} clientes distribuidos correctamente`;
      } else {
        this.result += `\n\n⚠️ No se encontraron clientes migrados`;
      }
    } catch (err: any) {
      this.result += `\n\n❌ Error en verificación: ${err.message}`;
    }
  }
}
