import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { SimpleSupabaseService } from '../../services/simple-supabase.service';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-50 py-8">
      <div class="max-w-4xl mx-auto px-4">
        
        <!-- Header con navegación -->
        <div class="mb-6">
          <button (click)="goBack()" 
                  class="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
            ← Volver a Tickets
          </button>
        </div>

        <!-- Loading State -->
        <div *ngIf="loading" class="text-center py-12">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p class="mt-4 text-gray-600">Cargando ticket...</p>
        </div>

        <!-- Error State -->
        <div *ngIf="error" class="bg-red-50 border border-red-200 rounded-lg p-6">
          <div class="flex">
            <div class="flex-shrink-0">
              <span class="text-red-600 text-xl">❌</span>
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-red-800">Error</h3>
              <p class="mt-1 text-sm text-red-700">{{ error }}</p>
            </div>
          </div>
        </div>

        <!-- Ticket Detail -->
        <div *ngIf="!loading && !error && ticket" class="space-y-6">
          
          <!-- Ticket Header -->
          <div class="bg-white shadow rounded-lg p-6">
            <div class="flex justify-between items-start">
              <div>
                <h1 class="text-2xl font-bold text-gray-900">
                  🎫 Ticket #{{ ticket.ticket_number }}
                </h1>
                <h2 class="text-xl text-gray-700 mt-1">{{ ticket.title }}</h2>
              </div>
              <span [class]="getStageClasses(ticket.stage?.color)"
                    class="px-3 py-1 rounded-full text-sm font-medium">
                {{ ticket.stage?.name || 'Sin estado' }}
              </span>
            </div>
            
            <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <span class="text-sm font-medium text-gray-500">Cliente</span>
                <p class="mt-1 text-sm text-gray-900">{{ ticket.client?.name || 'N/A' }}</p>
                <p class="text-sm text-gray-600">{{ ticket.client?.email || '' }}</p>
              </div>
              <div>
                <span class="text-sm font-medium text-gray-500">Prioridad</span>
                <p class="mt-1">
                  <span [class]="getPriorityClasses(ticket.priority)"
                        class="px-2 py-1 rounded text-xs font-medium">
                    {{ ticket.priority || 'Normal' }}
                  </span>
                </p>
              </div>
              <div>
                <span class="text-sm font-medium text-gray-500">Fecha límite</span>
                <p class="mt-1 text-sm text-gray-900">{{ formatDate(ticket.due_date) }}</p>
              </div>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="bg-white shadow rounded-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Progreso del Ticket</h3>
            <div class="flex items-center justify-between">
              <div *ngFor="let stage of allStages; let i = index" 
                   class="flex flex-col items-center flex-1">
                <div [class]="getProgressStepClasses(stage, ticket.stage)"
                     class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium">
                  {{ i + 1 }}
                </div>
                <span class="mt-2 text-xs text-center max-w-20">{{ stage.name }}</span>
                <div *ngIf="i < allStages.length - 1" 
                     [class]="getProgressLineClasses(stage, ticket.stage)"
                     class="absolute h-0.5 w-16 mt-4 ml-16"></div>
              </div>
            </div>
          </div>

          <!-- Description -->
          <div *ngIf="ticket.description" class="bg-white shadow rounded-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-3">Descripción</h3>
            <p class="text-gray-700">{{ ticket.description }}</p>
          </div>

          <!-- Services -->
          <div class="bg-white shadow rounded-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Servicios</h3>
            <div *ngIf="services.length === 0" class="text-center py-6 text-gray-500">
              📭 No hay servicios asignados a este ticket
            </div>
            <div *ngIf="services.length > 0" class="space-y-4">
              <div *ngFor="let service of services" 
                   class="border border-gray-200 rounded-lg p-4">
                <div class="flex justify-between items-start">
                  <div class="flex-1">
                    <h4 class="font-medium text-gray-900">{{ service.work?.name || 'Trabajo no especificado' }}</h4>
                    <p *ngIf="service.product" class="text-sm text-gray-600 mt-1">
                      📦 Producto: {{ service.product.name }}
                    </p>
                    <p class="text-sm text-gray-600 mt-1">
                      Cantidad: {{ service.quantity || 1 }}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="font-medium text-gray-900">{{ service.total_price || service.unit_price || 0 }} €</p>
                    <span [class]="service.is_completed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'"
                          class="inline-block px-2 py-1 text-xs font-medium rounded mt-1">
                      {{ service.is_completed ? '✅ Completado' : '🔄 En progreso' }}
                    </span>
                  </div>
                </div>
                <p *ngIf="service.notes" class="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                  {{ service.notes }}
                </p>
              </div>
            </div>
          </div>

          <!-- Comments -->
          <div class="bg-white shadow rounded-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Comentarios</h3>
            <div *ngIf="!ticket.comments || ticket.comments.length === 0" 
                 class="text-center py-6 text-gray-500">
              💬 No hay comentarios
            </div>
            <div *ngIf="ticket.comments && ticket.comments.length > 0" class="space-y-3">
              <div *ngFor="let comment of ticket.comments; let i = index" 
                   class="bg-gray-50 rounded-lg p-3">
                <p class="text-sm text-gray-700">{{ comment }}</p>
                <p class="text-xs text-gray-500 mt-1">Comentario #{{ i + 1 }}</p>
              </div>
            </div>
          </div>

          <!-- Total -->
          <div class="bg-white shadow rounded-lg p-6">
            <div class="flex justify-between items-center">
              <h3 class="text-lg font-medium text-gray-900">Total del Ticket</h3>
              <span class="text-2xl font-bold text-green-600">
                {{ calculateTotal() }} €
              </span>
            </div>
            <p class="text-sm text-gray-500 mt-1">
              Creado el {{ formatDate(ticket.created_at) }}
            </p>
          </div>
        </div>
      </div>
    </div>
  `
})
export class TicketDetailComponent implements OnInit {
  loading = true;
  error: string | null = null;
  ticket: any = null;
  services: any[] = [];
  allStages: any[] = [];
  ticketId: string | null = null;
  
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabase = inject(SimpleSupabaseService);

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.ticketId = params['id'];
      if (this.ticketId) {
        this.loadTicketDetail();
      } else {
        this.error = 'ID de ticket no válido';
        this.loading = false;
      }
    });
  }

  async loadTicketDetail() {
    try {
      // Cargar ticket con relaciones
      const { data: ticketData, error: ticketError } = await this.supabase.getClient()
        .from('tickets')
        .select(`
          *,
          client:clients(id, name, email),
          stage:ticket_stages(id, name, position, color),
          company:companies(id, name)
        `)
        .eq('id', this.ticketId)
        .single();

      if (ticketError) throw new Error('Error cargando ticket: ' + ticketError.message);
      this.ticket = ticketData;

      // Cargar servicios del ticket
      const { data: servicesData, error: servicesError } = await this.supabase.getClient()
        .from('services')
        .select(`
          *,
          work:works(id, name, description, estimated_hours, base_price),
          product:products(id, name, category, brand, price)
        `)
        .eq('ticket_id', this.ticketId);

      if (servicesError) throw new Error('Error cargando servicios: ' + servicesError.message);
      this.services = servicesData || [];

      // Cargar todos los estados para el progreso
      const { data: stagesData, error: stagesError } = await this.supabase.getClient()
        .from('ticket_stages')
        .select('*')
        .order('position');

      if (stagesError) throw new Error('Error cargando estados: ' + stagesError.message);
      this.allStages = stagesData || [];

    } catch (error: any) {
      this.error = error.message;
    } finally {
      this.loading = false;
    }
  }

  goBack() {
    this.router.navigate(['/tickets']);
  }

  getStageClasses(color?: string): string {
    return `bg-gray-100 text-gray-800`;
  }

  getPriorityClasses(priority?: string): string {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  getProgressStepClasses(stage: any, currentStage: any): string {
    if (currentStage && stage.position <= currentStage.position) {
      return 'bg-blue-600 text-white';
    }
    return 'bg-gray-300 text-gray-600';
  }

  getProgressLineClasses(stage: any, currentStage: any): string {
    if (currentStage && stage.position < currentStage.position) {
      return 'bg-blue-600';
    }
    return 'bg-gray-300';
  }

  calculateTotal(): number {
    const servicesTotal = this.services.reduce((sum, service) => 
      sum + (service.total_price || service.unit_price || 0), 0);
    return servicesTotal || this.ticket?.total_amount || 0;
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
