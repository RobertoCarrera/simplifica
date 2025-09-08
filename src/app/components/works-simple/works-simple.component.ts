import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-works',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding: 20px; font-family: Arial; background: lightcoral;">
      <h1>🔧 SERVICIOS</h1>
      
      <div style="background: #f0f0f0; padding: 10px; margin: 10px 0;">
        <p><strong>Loading:</strong> {{ loading }}</p>
        <p><strong>Servicios:</strong> {{ works.length }}</p>
        <p><strong>Error:</strong> {{ error || 'Ninguno' }}</p>
      </div>
      
      <!-- Navegación -->
      <div style="margin: 10px 0;">
        <a href="/clientes" style="background: blue; color: white; padding: 8px; margin: 5px; text-decoration: none;">← Clientes</a>
        <a href="/tickets" style="background: orange; color: white; padding: 8px; margin: 5px; text-decoration: none;">Tickets</a>
        <a href="/productos" style="background: green; color: white; padding: 8px; margin: 5px; text-decoration: none;">Productos</a>
      </div>
      
      <!-- Loading -->
      <div *ngIf="loading" style="background: yellow; padding: 10px;">
        ⏳ Cargando servicios...
      </div>
      
      <!-- Error -->
      <div *ngIf="error" style="background: red; color: white; padding: 10px;">
        ❌ {{ error }}
      </div>
      
      <!-- Servicios -->
      <div *ngIf="!loading && !error">
        <h3>🔧 Catálogo de Servicios ({{ works.length }}):</h3>
        
        <div *ngFor="let work of works" style="border: 2px solid #333; margin: 10px 0; padding: 15px; background: white; border-radius: 5px;">
          <h4 style="margin: 0 0 10px 0; color: #333;">{{ work.name }}</h4>
          
          <div style="margin-bottom: 10px;">
            <strong>Tiempo estimado:</strong> {{ work.estimated_hours || 0 }} horas<br>
            <strong>Precio base:</strong> <span style="color: green; font-weight: bold;">{{ work.base_price || 0 }} €</span>
          </div>
          
          <div *ngIf="work.description" style="background: #f9f9f9; padding: 8px; border-radius: 3px; font-size: 12px; margin-bottom: 10px;">
            <strong>Descripción:</strong><br>
            {{ work.description }}
          </div>
          
          <div style="font-size: 11px; color: #666;">
            Agregado: {{ formatDate(work.created_at) }}
          </div>
        </div>
        
        <div *ngIf="works.length === 0" style="background: orange; padding: 10px; margin-top: 20px;">
          📭 No hay servicios definidos
        </div>
      </div>
    </div>
  `
})
export class WorksComponent implements OnInit {
  loading = false;
  error: string | null = null;
  works: any[] = [];
  
  private supabase = inject(SimpleSupabaseService);

  ngOnInit() {
    console.log('🔧 Works Component iniciado');
    this.loadWorks();
  }

  async loadWorks() {
    console.log('🔧 Cargando servicios...');
    this.loading = true;
    this.error = null;
    
    try {
      const { data: works, error } = await this.supabase.getClient()
        .from('works')
        .select('*')
        .is('deleted_at', null)
        .order('base_price', { ascending: false });
      
      if (error) throw new Error('Error servicios: ' + error.message);
      
      this.works = works || [];
      console.log('✅ Servicios cargados:', this.works.length);
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error:', error);
    } finally {
      this.loading = false;
    }
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-ES');
  }
}
