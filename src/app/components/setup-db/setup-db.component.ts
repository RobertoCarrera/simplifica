import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-setup-db',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-yellow-50 p-6">
      <div class="max-w-4xl mx-auto">
        <h1 class="text-3xl font-bold text-gray-900 mb-6">🚀 SETUP BASE DE DATOS</h1>
        
        <div class="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p class="text-sm font-medium text-gray-700">Estado:</p>
              <p class="text-lg text-gray-900">{{ status }}</p>
            </div>
            <div>
              <p class="text-sm font-medium text-gray-700">Progreso:</p>
              <p class="text-lg text-gray-900">{{ progress }}</p>
            </div>
          </div>
        </div>
        
        <div class="flex flex-wrap gap-4 mb-6">
          <button (click)="setupDatabase()" [disabled]="loading" 
                  class="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200">
            {{ loading ? '⏳ Creando...' : '🏗️ Crear Estructura Completa' }}
          </button>
          
          <button (click)="createSampleData()" [disabled]="loading" 
                  class="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200">
            {{ loading ? '⏳ Insertando...' : '📝 Crear Datos de Ejemplo' }}
          </button>
        </div>
        
        <div *ngIf="results.length > 0" class="mt-6">
          <h3 class="text-xl font-semibold text-gray-900 mb-4">📋 Resultados:</h3>
          <div *ngFor="let result of results" class="bg-white mb-3 p-4 border-l-4 border-green-500 rounded-r-lg shadow-sm">
          {{ result }}
        </div>
      </div>
      
      <div *ngIf="errors.length > 0" style="margin-top: 20px;">
        <h3>❌ Errores:</h3>
        <div *ngFor="let error of errors" style="background: #ffcccc; margin: 5px; padding: 10px; border-left: 4px solid red;">
          {{ error }}
        </div>
      </div>
      
      <div style="margin-top: 20px;">
        <a href="/clientes" style="background: gray; color: white; padding: 8px; text-decoration: none;">← Volver a Clientes</a>
      </div>
    </div>
  `
})
export class SetupDbComponent implements OnInit {
  loading = false;
  status = 'Esperando...';
  progress = '';
  results: string[] = [];
  errors: string[] = [];
  
  private supabase = inject(SimpleSupabaseService);

  ngOnInit() {
    console.log('🚀 Setup DB Component iniciado');
  }

  async setupDatabase() {
    this.loading = true;
    this.status = 'Creando estructura...';
    this.results = [];
    this.errors = [];

    try {
      // 1. Crear tabla de estados de tickets
      await this.createTicketStages();
      
      // 2. Crear tabla de trabajos
      await this.createWorks();
      
      // 3. Crear tabla de productos
      await this.createProducts();
      
      // 4. Crear tabla de tickets
      await this.createTickets();
      
      // 5. Crear tabla de servicios
      await this.createServices();
      
      this.status = '✅ Estructura creada exitosamente';
      
    } catch (error: any) {
      this.status = '❌ Error creando estructura';
      this.errors.push('Error general: ' + error.message);
    } finally {
      this.loading = false;
    }
  }

  async createTicketStages() {
    this.progress = 'Creando estados de tickets...';
    
    const { error } = await this.supabase.getClient().rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS ticket_stages (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          position INTEGER NOT NULL,
          color VARCHAR(7) DEFAULT '#6b7280',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          deleted_at TIMESTAMP WITH TIME ZONE NULL
        );
        
        -- Insertar estados por defecto
        INSERT INTO ticket_stages (name, position, color) VALUES
        ('Recibido', 1, '#ef4444'),
        ('En Diagnóstico', 2, '#f59e0b'),
        ('Esperando Piezas', 3, '#8b5cf6'),
        ('En Reparación', 4, '#3b82f6'),
        ('Listo para Entrega', 5, '#10b981'),
        ('Entregado', 6, '#6b7280')
        ON CONFLICT DO NOTHING;
      `
    });
    
    if (error) {
      this.errors.push('Error creando ticket_stages: ' + error.message);
    } else {
      this.results.push('✅ Estados de tickets creados');
    }
  }

  async createWorks() {
    this.progress = 'Creando tipos de trabajos...';
    
    const { error } = await this.supabase.getClient().rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS works (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          name VARCHAR(200) NOT NULL,
          description TEXT,
          estimated_hours DECIMAL(4,2) DEFAULT 1.0,
          base_price DECIMAL(10,2) DEFAULT 0.00,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          deleted_at TIMESTAMP WITH TIME ZONE NULL
        );
        
        -- Insertar trabajos típicos
        INSERT INTO works (name, description, estimated_hours, base_price) VALUES
        ('Diagnóstico General', 'Revisión completa del equipo', 1.0, 25.00),
        ('Limpieza Interna', 'Limpieza de ventiladores y componentes', 0.5, 15.00),
        ('Reinstalación SO', 'Formateo e instalación de sistema operativo', 2.0, 50.00),
        ('Cambio de Pasta Térmica', 'Aplicación de pasta térmica nueva', 1.0, 20.00),
        ('Reparación Placa Base', 'Soldadura y reparación de componentes', 4.0, 80.00),
        ('Recuperación de Datos', 'Extracción de archivos de disco dañado', 3.0, 100.00),
        ('Actualización Hardware', 'Instalación de nuevos componentes', 1.5, 30.00),
        ('Eliminación de Virus', 'Limpieza completa de malware', 2.0, 40.00)
        ON CONFLICT DO NOTHING;
      `
    });
    
    if (error) {
      this.errors.push('Error creando works: ' + error.message);
    } else {
      this.results.push('✅ Trabajos creados');
    }
  }

  async createProducts() {
    this.progress = 'Creando productos...';
    
    const { error } = await this.supabase.getClient().rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS products (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          name VARCHAR(200) NOT NULL,
          category VARCHAR(100),
          brand VARCHAR(100),
          model VARCHAR(100),
          description TEXT,
          price DECIMAL(10,2) DEFAULT 0.00,
          stock_quantity INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          deleted_at TIMESTAMP WITH TIME ZONE NULL
        );
        
        -- Insertar productos típicos
        INSERT INTO products (name, category, brand, model, price, stock_quantity) VALUES
        ('RAM DDR4 8GB', 'Memoria', 'Kingston', 'ValueRAM', 45.00, 10),
        ('SSD 500GB', 'Almacenamiento', 'Samsung', '980 EVO', 65.00, 5),
        ('Fuente 650W', 'Alimentación', 'Corsair', 'CV650', 75.00, 3),
        ('Ventilador CPU', 'Refrigeración', 'Cooler Master', 'Hyper 212', 35.00, 8),
        ('Pasta Térmica', 'Refrigeración', 'Arctic', 'MX-4', 8.00, 15),
        ('Cable SATA', 'Conectividad', 'Genérico', 'SATA III', 5.00, 20),
        ('Disco HDD 1TB', 'Almacenamiento', 'WD', 'Blue', 50.00, 4),
        ('Tarjeta Gráfica GTX 1650', 'Gráficos', 'MSI', 'Ventus XS', 180.00, 2)
        ON CONFLICT DO NOTHING;
      `
    });
    
    if (error) {
      this.errors.push('Error creando products: ' + error.message);
    } else {
      this.results.push('✅ Productos creados');
    }
  }

  async createTickets() {
    this.progress = 'Creando tickets...';
    
    const { error } = await this.supabase.getClient().rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS tickets (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          ticket_number SERIAL UNIQUE,
          client_id UUID REFERENCES clients(id),
          company_id UUID REFERENCES companies(id),
          stage_id UUID REFERENCES ticket_stages(id),
          title VARCHAR(200) NOT NULL,
          description TEXT,
          priority VARCHAR(20) DEFAULT 'normal',
          due_date DATE,
          comments TEXT[],
          total_amount DECIMAL(10,2) DEFAULT 0.00,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          deleted_at TIMESTAMP WITH TIME ZONE NULL
        );
        
        -- Índices para mejor rendimiento
        CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON tickets(client_id);
        CREATE INDEX IF NOT EXISTS idx_tickets_company_id ON tickets(company_id);
        CREATE INDEX IF NOT EXISTS idx_tickets_stage_id ON tickets(stage_id);
      `
    });
    
    if (error) {
      this.errors.push('Error creando tickets: ' + error.message);
    } else {
      this.results.push('✅ Tickets tabla creada');
    }
  }

  async createServices() {
    this.progress = 'Creando servicios...';
    
    const { error } = await this.supabase.getClient().rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS services (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          ticket_id UUID REFERENCES tickets(id),
          work_id UUID REFERENCES works(id),
          product_id UUID REFERENCES products(id) NULL,
          quantity INTEGER DEFAULT 1,
          unit_price DECIMAL(10,2) DEFAULT 0.00,
          total_price DECIMAL(10,2) DEFAULT 0.00,
          is_completed BOOLEAN DEFAULT false,
          notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          deleted_at TIMESTAMP WITH TIME ZONE NULL
        );
        
        -- Índices
        CREATE INDEX IF NOT EXISTS idx_services_ticket_id ON services(ticket_id);
        CREATE INDEX IF NOT EXISTS idx_services_work_id ON services(work_id);
        CREATE INDEX IF NOT EXISTS idx_services_product_id ON services(product_id);
      `
    });
    
    if (error) {
      this.errors.push('Error creando services: ' + error.message);
    } else {
      this.results.push('✅ Servicios tabla creada');
    }
  }

  async createSampleData() {
    this.loading = true;
    this.status = 'Creando datos de ejemplo...';
    this.results = [];
    this.errors = [];

    try {
      // Obtener IDs necesarios
      const { data: companies } = await this.supabase.getClient()
        .from('companies')
        .select('id, name')
        .in('name', ['SatPCGo', 'Michinanny']);

      const { data: clients } = await this.supabase.getClient()
        .from('clients')
        .select('id, name, company_id');

      const { data: stages } = await this.supabase.getClient()
        .from('ticket_stages')
        .select('id, name, position');

      if (!companies || !clients || !stages) {
        throw new Error('No se pudieron obtener los datos base');
      }

      // Crear tickets de ejemplo
      await this.createSampleTickets(companies, clients, stages);
      
      this.status = '✅ Datos de ejemplo creados';
      
    } catch (error: any) {
      this.status = '❌ Error creando datos';
      this.errors.push('Error: ' + error.message);
    } finally {
      this.loading = false;
    }
  }

  async createSampleTickets(companies: any[], clients: any[], stages: any[]) {
    const satpcgo = companies.find(c => c.name === 'SatPCGo');
    const michinanny = companies.find(c => c.name === 'Michinanny');
    
    const satClients = clients.filter(c => c.company_id === satpcgo?.id);
    const michiClients = clients.filter(c => c.company_id === michinanny?.id);
    
    const sampleTickets = [
      {
        client_id: satClients[0]?.id,
        company_id: satpcgo?.id,
        stage_id: stages.find(s => s.position === 2)?.id,
        title: 'PC no enciende',
        description: 'El ordenador no da señales de vida, posible problema de fuente',
        priority: 'high',
        due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        comments: ['Cliente reporta que se oyó un ruido antes de apagarse', 'Revisar fuente de alimentación']
      },
      {
        client_id: satClients[1]?.id,
        company_id: satpcgo?.id,
        stage_id: stages.find(s => s.position === 4)?.id,
        title: 'Laptop lenta',
        description: 'El equipo va muy lento, posible virus o falta de mantenimiento',
        priority: 'normal',
        due_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        comments: ['Realizar diagnóstico completo', 'Cliente menciona muchos programas al inicio']
      },
      {
        client_id: michiClients[0]?.id,
        company_id: michinanny?.id,
        stage_id: stages.find(s => s.position === 1)?.id,
        title: 'Pantalla azul recurrente',
        description: 'BSOD frecuentes, posible problema de RAM o drivers',
        priority: 'high',
        due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        comments: ['Error: MEMORY_MANAGEMENT']
      }
    ];

    for (const ticket of sampleTickets) {
      if (ticket.client_id && ticket.company_id && ticket.stage_id) {
        const { error } = await this.supabase.getClient()
          .from('tickets')
          .insert(ticket);
          
        if (error) {
          this.errors.push('Error insertando ticket: ' + error.message);
        } else {
          this.results.push(`✅ Ticket creado: ${ticket.title}`);
        }
      }
    }
  }
}
