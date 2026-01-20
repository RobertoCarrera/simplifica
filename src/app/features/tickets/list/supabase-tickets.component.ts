import { Component, OnInit, OnDestroy, inject, EventEmitter, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { TicketModalService } from '../../../services/ticket-modal.service';
import { SupabaseTicketsService, Ticket, TicketStats } from '../../../services/supabase-tickets.service';
import { SupabaseTicketStagesService, TicketStage as ConfigStage } from '../../../services/supabase-ticket-stages.service';
import { DevRoleService } from '../../../services/dev-role.service';
import { AuthService } from '../../../services/auth.service';
import { PortalTicketWizardComponent } from '../../portal/ticket-wizard/portal-ticket-wizard.component';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { AiService } from '../../../services/ai.service';
import { ToastService } from '../../../services/toast.service';
import { SimpleSupabaseService, SimpleClient } from '../../../services/simple-supabase.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { TicketFormComponent } from '../ticket-form/ticket-form.component';

export interface TicketTag {
  id: string;
  name: string;
  color: string;
  description?: string;
  company_id?: string;
}

@Component({
  selector: 'app-supabase-tickets',
  standalone: true,
  imports: [CommonModule, FormsModule, PortalTicketWizardComponent, SkeletonLoaderComponent, TicketFormComponent],
  templateUrl: './supabase-tickets.component.html',
  styleUrl: './supabase-tickets.component.scss'
})
export class SupabaseTicketsComponent implements OnInit, OnDestroy {
  // Services
  private stagesSvc = inject(SupabaseTicketStagesService);
  private ticketsService = inject(SupabaseTicketsService);
  private simpleSupabase = inject(SimpleSupabaseService);
  private authService = inject(AuthService);
  private router = inject(Router);
  public devRoleService = inject(DevRoleService);
  private ticketModalService = inject(TicketModalService);
  private aiService = inject(AiService);
  private toast = inject(ToastService);

  // State
  tickets: Ticket[] = [];
  filteredTickets: Ticket[] = [];
  stages: ConfigStage[] = [];
  loading = false;
  error: string | null = null;
  selectedCompanyId: string = '';
  companies: any[] = [];

  // Realtime
  private realtimeChannel: RealtimeChannel | null = null;

  // Filtering & View
  viewMode: 'list' | 'board' = 'list';
  searchTerm = '';
  filterStage = '';
  filterPriority = '';
  showCompleted = false;
  showDeleted = false;

  // Pagination
  currentPage = 1;
  pageSize = 50;
  totalItems = 0;
  Math = Math;

  // Dropdowns
  stageDropdownOpen = false;
  priorityDropdownOpen = false;

  // Modal State
  showForm = false;
  showWizard = false;
  editingTicket: Ticket | null = null;

  // Delete Reason Modal
  showDeleteReasonModal = false;
  deleteReasonText = '';
  ticketToDelete: Ticket | null = null;

  // Audio State (FAB)
  isRecording = false;
  isProcessingAudio = false;

  // Computed
  isClient = computed(() => this.authService.userRole() === 'client');

  priorityOptions = [
    { value: '', label: 'Todas las prioridades' },
    { value: 'low', label: 'Baja' },
    { value: 'normal', label: 'Normal' },
    { value: 'high', label: 'Alta' },
    { value: 'critical', label: 'Crítica' }
  ];

  stats: TicketStats = {
    total: 0, open: 0, inProgress: 0, completed: 0, overdue: 0,
    avgResolutionTime: 0, totalRevenue: 0, totalEstimatedHours: 0, totalActualHours: 0
  };

  ngOnInit() {
    this.initializeComponent();
  }

  ngOnDestroy() {
    if (this.realtimeChannel) {
      this.simpleSupabase.getClient().removeChannel(this.realtimeChannel);
    }
  }

  ngAfterViewInit() {
    this.ticketModalService.open$.subscribe(async (ticket) => {
      // Handle programmatic open
      if (typeof ticket === 'string') {
        // fetch ticket first
        const { data } = await this.simpleSupabase.getClient().from('tickets').select('*, client:clients(*), stage:ticket_stages(*), company:companies(*)').eq('id', ticket).single();
        if (data) this.openForm(data);
      } else if (ticket) {
        this.openForm(ticket);
      } else {
        this.openForm();
      }
    });
  }

  // --- Initialization ---

  private async initializeComponent() {
    this.loading = true;
    try {
      // Load Companies (Dev Mode) or resolve current
      const { data } = await this.simpleSupabase.getCompanies();
      this.companies = data || [];

      if (!this.selectedCompanyId && this.companies.length > 0) {
        this.selectedCompanyId = this.companies[0].id;
        // Try resolve from user... (simplified for brevity, assume first or user's)
      }

      if (this.selectedCompanyId) {
        await this.simpleSupabase.setCurrentCompany(this.selectedCompanyId);
        await this.loadStages();
        await this.loadTickets(1);
        this.loadStats();
        this.setupRealtimeSubscription();
      }
    } catch (e) {
      console.error(e);
      this.error = 'Error cargando datos.';
    } finally {
      this.loading = false;
    }
  }

  setupRealtimeSubscription() {
    if (this.realtimeChannel) return;
    this.realtimeChannel = this.simpleSupabase.getClient().channel('tickets-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        this.loadTickets(this.currentPage);
        this.loadStats();
      })
      .subscribe();
  }

  // --- Data Loading ---

  async loadTickets(page = 1) {
    this.loading = true;
    this.currentPage = page;
    try {
      const from = (page - 1) * this.pageSize;
      const to = from + this.pageSize - 1;

      let query = this.simpleSupabase.getClient()
        .from('tickets')
        .select(`*, client:clients(id, name), stage:ticket_stages(*), company:companies(id, name)`, { count: 'exact' });

      if (!this.showDeleted) query = query.is('deleted_at', null);
      if (this.selectedCompanyId) query = query.eq('company_id', this.selectedCompanyId);
      if (this.isClient()) {
        const clientId = (this.authService as any).currentProfile?.client_id;
        if (clientId) query = query.eq('client_id', clientId);
      }
      if (this.filterStage) query = query.eq('stage_id', this.filterStage);
      if (this.filterPriority) query = query.eq('priority', this.filterPriority);
      if (this.searchTerm) {
        // naive search
        query = query.ilike('title', `%${this.searchTerm}%`);
      }

      query = query.order('created_at', { ascending: false }).range(from, to);

      const { data, count, error } = await query;
      if (error) throw error;

      this.tickets = data || [];
      this.totalItems = count || 0;
      this.loadTicketTagsForTickets(); // Load tags for list
      this.updateFilteredTickets();
    } catch (e: any) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  }

  async onPageChange(page: number) {
    if (page < 1 || (page > Math.ceil(this.totalItems / this.pageSize) && this.totalItems > 0)) return;
    await this.loadTickets(page);
  }

  // --- Tags for List ---
  async loadTicketTagsForTickets() {
    if (!this.tickets.length) return;
    const ids = this.tickets.map(t => t.id);
    const { data } = await this.simpleSupabase.getClient()
      .from('tickets_tags')
      .select('ticket_id, tag:global_tags(name)')
      .in('ticket_id', ids);

    const map: any = {};
    (data || []).forEach((r: any) => {
      if (!map[r.ticket_id]) map[r.ticket_id] = [];
      if (r.tag?.name) map[r.ticket_id].push(r.tag.name);
    });

    this.tickets.forEach(t => t.tags = map[t.id] || []);
  }

  // --- Modal Logic ---

  openForm(ticket?: Ticket) {
    this.editingTicket = ticket || null;
    this.showForm = true;
  }

  closeForm() {
    this.showForm = false;
    this.editingTicket = null;
  }

  onTicketSaved() {
    this.loadTickets();
    this.loadStats();
    this.closeForm(); // Or keep open? Usually close.
  }

  // --- Actions ---

  viewTicketDetail(ticket: Ticket) {
    this.router.navigate(['/tickets', ticket.id]);
  }

  deleteTicket(ticket: Ticket) {
    if (!confirm('¿Eliminar ticket?')) return;
    this.ticketsService.deleteTicket(ticket.id, 'Deleted by user').then(() => this.loadTickets());
  }

  // --- Helpers ---

  getPriorityLabel(p: string) { return this.priorityOptions.find(o => o.value === p)?.label || p; }
  getPriorityClasses(p: string) {
    // Basic mapping, can be improved or moved to shared
    return '';
  }
  getPriorityIcon(p: string) { return 'fa-flag'; }
  isOverdue(t: Ticket) { return t.due_date && new Date(t.due_date) < new Date(); }
  formatDate(d: string) { return new Date(d).toLocaleDateString(); }
  stripMarkdown(t: string | undefined) { return t || ''; } // stub

  // --- List/Board/Filter ---

  setViewMode(mode: 'list' | 'board') { this.viewMode = mode; }
  toggleShowCompleted() { this.showCompleted = !this.showCompleted; this.loadTickets(1); }
  toggleShowDeleted() { this.showDeleted = !this.showDeleted; this.loadTickets(1); }
  onSearch() { this.loadTickets(1); } // De-bounce in real app

  updateFilteredTickets() {
    // Client side filter if needed, otherwise this.tickets is already filtered by server logic
    this.filteredTickets = this.tickets;
  }

  // --- Stages ---
  async loadStages() {
    const { data } = await this.stagesSvc.getVisibleStages(this.selectedCompanyId);
    this.stages = (data || []).sort((a: any, b: any) => a.position - b.position);
  }

  getSelectedStageLabel() {
    return this.stages.find(s => s.id === this.filterStage)?.name || 'Todos los estados';
  }
  toggleStageDropdown() { this.stageDropdownOpen = !this.stageDropdownOpen; }
  selectStageFilter(id: string) { this.filterStage = id; this.stageDropdownOpen = false; this.loadTickets(1); }

  // --- Priority Filter ---

  togglePriorityDropdown() { this.priorityDropdownOpen = !this.priorityDropdownOpen; }
  getSelectedPriorityLabel() {
    return this.priorityOptions.find(p => p.value === this.filterPriority)?.label || 'Todas las prioridades';
  }
  selectPriorityFilter(p: string) { this.filterPriority = p; this.priorityDropdownOpen = false; this.loadTickets(1); }
  closeAllDropdowns() { this.stageDropdownOpen = false; this.priorityDropdownOpen = false; }
  clearFilters() {
    this.filterStage = '';
    this.filterPriority = '';
    this.searchTerm = '';
    this.loadTickets(1);
  }

  async onCompanyChange() {
    await this.simpleSupabase.setCurrentCompany(this.selectedCompanyId);
    this.loadTickets(1);
    this.loadStages();
  }

  getVisibleBoardStages() { return this.stages; }
  getTicketsByStage(stageId: string) { return this.filteredTickets.filter(t => t.stage_id === stageId); }
  getPriorityColor(p: string) { return 'gray'; } // stub

  // --- AI / Other ---
  canUseAiTicket() { return true; } // simplified
  toggleRecording() { /* implementation */ }

  async loadStats() {
    // simplified
    this.stats = { total: 0, open: 0, inProgress: 0, completed: 0, overdue: 0, avgResolutionTime: 0, totalRevenue: 0, totalEstimatedHours: 0, totalActualHours: 0 };
  }

  // Client Portal specific
  openDeleteReasonModal(ticket: Ticket) { this.ticketToDelete = ticket; this.showDeleteReasonModal = true; }
  closeDeleteReasonModal() { this.showDeleteReasonModal = false; this.ticketToDelete = null; }
  confirmDeleteWithReason() {
    if (this.ticketToDelete) {
      this.ticketsService.deleteTicket(this.ticketToDelete.id, this.deleteReasonText).then(() => {
        this.closeDeleteReasonModal();
        this.loadTickets();
      });
    }
  }

  onWizardTicketCreated() { this.loadTickets(); }
}
