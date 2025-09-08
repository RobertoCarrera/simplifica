import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseTicketsService, Ticket, TicketStage, TicketStats } from '../../services/supabase-tickets.service';

@Component({
  selector: 'app-supabase-tickets',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './supabase-tickets.component.html',
  styleUrl: './supabase-tickets.component.scss'
})
export class SupabaseTicketsComponent implements OnInit {
  
  // Company selector for development
  selectedCompanyId: string = '1'; // Default to SatPCGo
  
  // Core data
  tickets: Ticket[] = [];
  filteredTickets: Ticket[] = [];
  stages: TicketStage[] = [];
  stats: TicketStats = {
    total: 0,
    open: 0,
    inProgress: 0,
    completed: 0,
    overdue: 0,
    avgResolutionTime: 0,
    totalRevenue: 0
  };
  
  loading = false;
  error: string | null = null;
  
  // Filters and search
  searchTerm = '';
  filterStage = '';
  filterPriority = '';
  filterStatus = '';
  viewMode: 'list' | 'board' = 'list';
  
  // Form management
  showForm = false;
  editingTicket: Ticket | null = null;
  formData: Partial<Ticket> = {};
  
  // Form validation
  formErrors: Record<string, string> = {};
  
  private ticketsService = inject(SupabaseTicketsService);
  private router = inject(Router);

  ngOnInit() {
    this.loadTickets();
    this.loadStages();
  }

  onCompanyChange() {
    console.log(`Cambiando a empresa ID: ${this.selectedCompanyId}`);
    this.loadTickets();
    this.loadStages();
  }

  async loadTickets() {
    this.loading = true;
    this.error = null;
    
    try {
      console.log(`Cargando tickets para empresa ID: ${this.selectedCompanyId}`);
      this.tickets = await this.ticketsService.getTickets(parseInt(this.selectedCompanyId));
      this.updateFilteredTickets();
      this.loadStats();
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error loading tickets:', error);
    } finally {
      this.loading = false;
    }
  }

  async loadStages() {
    try {
      this.stages = await this.ticketsService.getTicketStages(parseInt(this.selectedCompanyId));
    } catch (error: any) {
      console.error('❌ Error loading stages:', error);
    }
  }

  async loadStats() {
    try {
      this.stats = await this.ticketsService.getTicketStats(parseInt(this.selectedCompanyId));
    } catch (error: any) {
      console.error('❌ Error loading stats:', error);
    }
  }

  updateFilteredTickets() {
    let filtered = [...this.tickets];

    // Filter by search term
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(ticket => 
        ticket.title.toLowerCase().includes(term) ||
        ticket.description.toLowerCase().includes(term) ||
        ticket.ticket_number.toLowerCase().includes(term) ||
        ticket.client?.name?.toLowerCase().includes(term)
      );
    }

    // Filter by stage
    if (this.filterStage) {
      filtered = filtered.filter(ticket => ticket.stage_id === this.filterStage);
    }

    // Filter by priority
    if (this.filterPriority) {
      filtered = filtered.filter(ticket => ticket.priority === this.filterPriority);
    }

    // Filter by status
    if (this.filterStatus === 'open') {
      filtered = filtered.filter(ticket => ticket.stage?.name !== 'Completado');
    } else if (this.filterStatus === 'completed') {
      filtered = filtered.filter(ticket => ticket.stage?.name === 'Completado');
    } else if (this.filterStatus === 'overdue') {
      filtered = filtered.filter(ticket => 
        ticket.due_date && new Date(ticket.due_date) < new Date()
      );
    }

    this.filteredTickets = filtered;
  }

  onSearch() {
    this.updateFilteredTickets();
  }

  onFilterChange() {
    this.updateFilteredTickets();
  }

  clearFilters() {
    this.searchTerm = '';
    this.filterStage = '';
    this.filterPriority = '';
    this.filterStatus = '';
    this.updateFilteredTickets();
  }

  // Form methods
  openForm(ticket?: Ticket) {
    this.editingTicket = ticket || null;
    this.formData = ticket ? { ...ticket } : {
      title: '',
      description: '',
      client_id: '',
      stage_id: this.stages[0]?.id || '',
      priority: 'normal',
      estimated_hours: 1,
      company_id: this.selectedCompanyId
    };
    this.formErrors = {};
    this.showForm = true;
  }

  closeForm() {
    this.showForm = false;
    this.editingTicket = null;
    this.formData = {};
    this.formErrors = {};
  }

  validateForm(): boolean {
    this.formErrors = {};

    if (!this.formData.title?.trim()) {
      this.formErrors['title'] = 'El título es requerido';
    }

    if (!this.formData.description?.trim()) {
      this.formErrors['description'] = 'La descripción es requerida';
    }

    if (!this.formData.client_id?.trim()) {
      this.formErrors['client_id'] = 'El cliente es requerido';
    }

    if (!this.formData.stage_id?.trim()) {
      this.formErrors['stage_id'] = 'El estado es requerido';
    }

    if (this.formData.estimated_hours && this.formData.estimated_hours <= 0) {
      this.formErrors['estimated_hours'] = 'Las horas estimadas deben ser mayor a 0';
    }

    if (this.formData.total_amount && this.formData.total_amount < 0) {
      this.formErrors['total_amount'] = 'El monto no puede ser negativo';
    }

    return Object.keys(this.formErrors).length === 0;
  }

  async saveTicket() {
    if (!this.validateForm()) return;
    
    this.loading = true;
    try {
      // Add company_id to form data
      const dataWithCompany = {
        ...this.formData,
        company_id: this.selectedCompanyId
      };

      if (this.editingTicket) {
        await this.ticketsService.updateTicket(this.editingTicket.id, dataWithCompany);
      } else {
        await this.ticketsService.createTicket(dataWithCompany);
      }
      
      this.closeForm();
      await this.loadTickets();
      
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error saving ticket:', error);
    } finally {
      this.loading = false;
    }
  }

  async deleteTicket(ticket: Ticket) {
    if (!confirm(`¿Estás seguro de que deseas eliminar el ticket "${ticket.title}"?`)) {
      return;
    }

    this.loading = true;
    try {
      await this.ticketsService.deleteTicket(ticket.id);
      await this.loadTickets();
    } catch (error: any) {
      this.error = error.message;
      console.error('❌ Error deleting ticket:', error);
    } finally {
      this.loading = false;
    }
  }

  // Navigation
  viewTicketDetail(ticket: Ticket) {
    this.router.navigate(['/tickets', ticket.id]);
  }

  // Utility methods
  getPriorityColor(priority: string): string {
    return this.ticketsService.getPriorityColor(priority);
  }

  getPriorityLabel(priority: string): string {
    return this.ticketsService.getPriorityLabel(priority);
  }

  formatDate(dateString: string): string {
    return this.ticketsService.formatDate(dateString);
  }

  getStatusBadgeClass(stage: TicketStage): string {
    const baseClasses = 'px-2 py-1 text-xs font-medium rounded-full';
    
    if (stage.name === 'Completado') {
      return `${baseClasses} bg-green-100 text-green-800`;
    } else if (stage.name === 'En Progreso') {
      return `${baseClasses} bg-blue-100 text-blue-800`;
    } else if (stage.name === 'Esperando Cliente') {
      return `${baseClasses} bg-purple-100 text-purple-800`;
    } else if (stage.name === 'En Diagnóstico') {
      return `${baseClasses} bg-yellow-100 text-yellow-800`;
    } else {
      return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  }

  isOverdue(ticket: Ticket): boolean {
    return ticket.due_date ? new Date(ticket.due_date) < new Date() : false;
  }

  getCompanyName(): string {
    const companies = {
      '1': 'SatPCGo',
      '2': 'Michinanny',
      '3': 'Libera Tus Creencias'
    };
    return companies[this.selectedCompanyId as keyof typeof companies] || 'Empresa';
  }

  toggleViewMode() {
    this.viewMode = this.viewMode === 'list' ? 'board' : 'list';
  }

  getTicketsByStage(stageId: string): Ticket[] {
    return this.filteredTickets.filter(ticket => ticket.stage_id === stageId);
  }
}
