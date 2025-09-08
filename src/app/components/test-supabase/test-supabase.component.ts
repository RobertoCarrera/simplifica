import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BasicSupabaseService, BasicCustomer } from '../../services/basic-supabase.service';

@Component({
  selector: 'app-test-supabase',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p-6 bg-white min-h-screen">
      <h1 class="text-2xl font-bold mb-4">🧪 Test Supabase Connection</h1>
      
      <div class="space-y-4">
        <!-- Estado de conexión -->
        <div class="p-4 border rounded-lg">
          <h3 class="font-semibold mb-2">Estado de la conexión:</h3>
          <div class="text-sm">
            <p>Customers count: {{ customers().length }}</p>
            <p>Error: {{ error() || 'None' }}</p>
            <p>Status: {{ status() }}</p>
          </div>
        </div>

        <!-- Botón de prueba -->
        <div class="p-4 border rounded-lg">
          <h3 class="font-semibold mb-2">Acciones de prueba:</h3>
          <div class="space-x-2">
            <button 
              (click)="testConnection()"
              class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Test Connection
            </button>
            
            <button 
              (click)="testConfig()"
              class="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
            >
              Test Config
            </button>
            
            <button 
              (click)="createTestCustomer()"
              class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Create Test Customer
            </button>
          </div>
        </div>

        <!-- Lista de clientes -->
        <div class="p-4 border rounded-lg">
          <h3 class="font-semibold mb-2">Clientes ({{ customers().length }}):</h3>
          @if (customers().length === 0) {
            <p class="text-gray-500">No hay clientes</p>
          } @else {
            <div class="space-y-2">
              @for (customer of customers(); track customer.id) {
                <div class="p-2 border rounded bg-gray-50">
                  <strong>{{ customer.nombre }} {{ customer.apellidos }}</strong>
                  <br>
                  <small class="text-gray-600">{{ customer.email }}</small>
                  <br>
                  <small class="text-gray-400">ID: {{ customer.id }}</small>
                </div>
              }
            </div>
          }
        </div>

        <!-- Logs -->
        <div class="p-4 border rounded-lg">
          <h3 class="font-semibold mb-2">Console Logs:</h3>
          <div class="text-sm bg-gray-100 p-2 rounded font-mono">
            Abre DevTools (F12) para ver los logs detallados de la consola
          </div>
        </div>
      </div>
    </div>
  `
})
export class TestSupabaseComponent implements OnInit {
  private basicService = inject(BasicSupabaseService);
  
  customers = signal<BasicCustomer[]>([]);
  error = signal<string | null>(null);
  status = signal<string>('Initializing...');

  ngOnInit() {
    console.log('🧪 Iniciando test de Supabase...');
    this.status.set('Conectando...');
    
    // Suscribirse a los cambios de clientes
    this.basicService.customers$.subscribe(customers => {
      console.log('📊 Clientes recibidos:', customers);
      this.customers.set(customers);
      this.status.set(`Conectado - ${customers.length} clientes`);
    });
  }

  async testConfig() {
    console.log('🔧 Testing configuración...');
    this.status.set('Testing config...');
    this.error.set(null);
    
    const isValid = await this.basicService.testSupabaseConfig();
    this.status.set(isValid ? '✅ Config OK' : '❌ Config Error');
  }

  testConnection() {
    console.log('🔗 Testing Supabase connection...');
    this.status.set('Testing connection...');
    this.error.set(null);
    
    // Intentar cargar clientes
    this.basicService.getCustomers().subscribe({
      next: (customers) => {
        console.log('✅ Conexión exitosa, clientes:', customers);
        this.customers.set(customers);
        this.status.set(`✅ Connected - ${customers.length} clientes`);
      },
      error: (err) => {
        console.error('❌ Error de conexión:', err);
        this.error.set(err.message || 'Error desconocido');
        this.status.set('❌ Connection Error');
      }
    });
  }

  createTestCustomer() {
    console.log('👤 Creando cliente de prueba...');
    this.status.set('Creating customer...');
    this.error.set(null);
    
    const testCustomer = {
      nombre: 'Test',
      apellidos: 'Usuario',
      email: `test.${Date.now()}@example.com`,
      telefono: '123456789'
    };

    this.basicService.createCustomer(testCustomer).subscribe({
      next: (customer) => {
        console.log('✅ Cliente creado:', customer);
        this.status.set('✅ Customer created');
      },
      error: (err) => {
        console.error('❌ Error al crear cliente:', err);
        this.error.set(err.message || 'Error al crear cliente');
        this.status.set('❌ Create Error');
      }
    });
  }
}
