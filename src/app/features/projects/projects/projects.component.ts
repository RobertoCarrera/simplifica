import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { FormsModule } from '@angular/forms';
import { KanbanBoardComponent } from '../kanban-board/kanban-board.component';
import { TimelineViewComponent } from '../components/timeline-view/timeline-view.component';
import { ListViewComponent } from '../components/list-view/list-view.component';
import { ProjectDialogComponent } from '../components/project-dialog/project-dialog.component';
import { ColumnDialogComponent } from '../components/column-dialog/column-dialog.component';
import { ProjectsService } from '../../../core/services/projects.service';
import { Project, ProjectStage } from '../../../models/project';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { AuthService } from '../../../services/auth.service';
import { getClientDisplayName } from '../../../models/quote.model';
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [
    FormsModule,
    KanbanBoardComponent,
    TimelineViewComponent,
    ListViewComponent,
    ProjectDialogComponent,
    ColumnDialogComponent,
  ],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss',
})
export class ProjectsComponent implements OnInit, OnDestroy {
  currentView: 'kanban' | 'timeline' | 'list' = 'kanban';
  projects: any[] = [];

  // Expose helper for template usage
  protected readonly getClientDisplayName = getClientDisplayName;

  // Dialog state
  isProjectDialogVisible = false;
  selectedProject: Project | null = null;

  // Stage Dialog state
  isColumnDialogVisible = false;

  clients: any[] = [];
  stages: any[] = [];
  showArchived = false;
  showHidden = false;

  searchText: string = '';
  selectedClientId: string | null = null;
  selectedStageId: string | null = null; // helper if needed, though not in UI yet
  selectedPriority: string | null = null;
  selectedDeadline: string | null = null; // 'overdue', 'today', 'week', 'month'

  filteredProjects: Project[] = []; // Changed to property
  unreadCounts: Record<string, number> = {}; // Batched from getUnreadCountsBatch

  // Realtime subscriptions
  private sbService = inject(SupabaseClientService);
  private authService = inject(AuthService);
  private projectsChannel: RealtimeChannel | null = null;
  private tasksChannel: RealtimeChannel | null = null;

  constructor(
    private projectsService: ProjectsService,
    private customersService: SupabaseCustomersService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    this.loadData();
    this.setupRealtimeSubscriptions();

    this.customersService.getCustomers().subscribe((clients) => {
      this.clients = clients;
    });

    // Check for openProject query param
    this.route.queryParams.subscribe((params) => {
      const projectId = params['openProject'];
      if (projectId) {
        // Wait for projects to load if not already loaded, or load specific
        // For simplicity, we'll try to find it in the loaded list or fetch it
        this.projectsService
          .getProjectById(projectId)
          .then((project) => {
            if (project) {
              this.selectedProject = project;
              this.isProjectDialogVisible = true;
            }
          })
          .catch((err) => console.error('Error opening project from notification', err));
      }
    });
  }

  ngOnDestroy() {
    this.cleanupRealtimeSubscriptions();
  }

  private setupRealtimeSubscriptions() {
    const supabase = this.sbService.instance;
    const companyId = this.authService.currentCompanyId?.();
    const filter = companyId ? `company_id=eq.${companyId}` : undefined;

    // Subscribe to projects changes (scoped to the current company).
    // Without this filter, any project change in any tenant triggers a
    // full refetch — which on a busy multi-tenant DB fires constantly.
    this.projectsChannel = supabase
      .channel('projects-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projects',
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          // Surgical patch: apply the new row to the local list instead of
          // refetching the whole project list. This avoids a full reload
          // per realtime event.
          this.applyRealtimePatch(payload);
        },
      )
      .subscribe();

    // Subscribe to project_tasks changes. The denormalized company_id
    // column (migration 20260622130005) lets us scope realtime to the
    // current company — no more cross-tenant load spikes.
    this.tasksChannel = supabase
      .channel('tasks-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_tasks',
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          // Wait a bit so database triggers have committed
          setTimeout(() => this.loadData(), 500);
        },
      )
      .subscribe();
  }

  /**
   * Surgical patch: instead of refetching the entire projects list on
   * every realtime event, mutate the local arrays in place. Falls back
   * to loadData() if the payload shape is unexpected.
   */
  private applyRealtimePatch(payload: any): void {
    try {
      const row = (payload.new ?? payload.old) as Project | undefined;
      if (!row) return;

      if (payload.eventType === 'DELETE') {
        this.filteredProjects = this.filteredProjects.filter((p) => p.id !== row.id);
        this.projects = this.projects.filter((p) => p.id !== row.id);
        return;
      }
      if (payload.eventType === 'INSERT') {
        // Add to top of list; user will see it on next render. We avoid a
        // full reload to keep things snappy.
        this.projects = [row, ...this.projects];
        this.applyFilters();
        return;
      }
      if (payload.eventType === 'UPDATE') {
        this.projects = this.projects.map((p) => (p.id === row.id ? { ...p, ...row } : p));
        this.applyFilters();
        return;
      }
    } catch {
      // Any unexpected shape: fall back to a full reload.
      this.loadData();
    }
  }

  private cleanupRealtimeSubscriptions() {
    if (this.projectsChannel) {
      this.sbService.instance.removeChannel(this.projectsChannel);
      this.projectsChannel = null;
    }
    if (this.tasksChannel) {
      this.sbService.instance.removeChannel(this.tasksChannel);
      this.tasksChannel = null;
    }
    console.log('📡 Realtime subscriptions cleaned up');
  }

  loadData() {
    this.projectsService.getProjects(this.showArchived, this.showHidden).subscribe((projects) => {
      this.projects = projects;
      this.applyFilters(); // Apply filters when data loads
      // Batched unread-counts: 1 RPC for all visible projects instead
      // of 4 queries per card. Was 320 requests for 80 cards; now 1.
      const ids = this.filteredProjects.map((p) => p.id);
      if (ids.length) {
        this.projectsService.getUnreadCountsBatch(ids).then((counts) => {
          this.unreadCounts = counts;
        });
      }
    });

    // Load stages for the dialog
    this.projectsService.getStages().subscribe((stages) => {
      this.stages = stages;
    });
  }

  applyFilters() {
    this.filteredProjects = this.projects.filter((project) => {
      const matchesSearch =
        !this.searchText ||
        project.name.toLowerCase().includes(this.searchText.toLowerCase()) ||
        (project.description &&
          project.description.toLowerCase().includes(this.searchText.toLowerCase()));

      const matchesClient = !this.selectedClientId || project.client_id === this.selectedClientId;
      const matchesStage = !this.selectedStageId || project.stage_id === this.selectedStageId;
      const matchesPriority = !this.selectedPriority || project.priority === this.selectedPriority;
      const matchesDeadline =
        !this.selectedDeadline || this.checkDeadline(project, this.selectedDeadline);

      return matchesSearch && matchesClient && matchesStage && matchesPriority && matchesDeadline;
    });
  }

  checkDeadline(project: Project, filter: string): boolean {
    if (!project.end_date) return false;
    const date = new Date(project.end_date);
    date.setHours(0, 0, 0, 0); // normalize project date to start of day for comparison if it has time, usually it's date only but good to be safe

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (filter) {
      case 'overdue':
        return date < today;
      case 'today':
        return date.getTime() === today.getTime();
      case 'week':
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        return date >= today && date <= nextWeek;
      case 'month':
        const nextMonth = new Date(today);
        nextMonth.setDate(today.getDate() + 30); // Approx month
        return date >= today && date <= nextMonth;
      default:
        return true;
    }
  }

  toggleArchived() {
    this.showArchived = !this.showArchived;
    // If we switch to archived, maybe disable hidden? Or keep independent.
    // Let's keep them independent for now.
    this.loadData();
  }

  toggleHidden() {
    this.showHidden = !this.showHidden;
    this.loadData();
  }

  toggleView(view: 'kanban' | 'timeline' | 'list') {
    this.currentView = view;
  }

  openEditProject(project: Project) {
    this.selectedProject = project;
    this.isProjectDialogVisible = true;
  }

  onProjectDialogClose(refresh: boolean) {
    this.isProjectDialogVisible = false;
    this.selectedProject = null;
    if (refresh) {
      this.loadData();
    }
  }

  openNewProject() {
    this.selectedProject = null;
    this.isProjectDialogVisible = true;
  }

  // Stage Dialog Methods
  openStageDialog() {
    this.isColumnDialogVisible = true;
  }

  onStageDialogClose(refresh: boolean) {
    this.isColumnDialogVisible = false;
    if (refresh) {
      this.loadData();
    }
  }

  archiveProjectInternal(project: Project, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    // Toggle logic: If already hidden, restore. If visible, hide.
    const isHidden = project.is_internal_archived;
    const action = isHidden ? 'mostrar (restaurar)' : 'ocultar';
    const confirmMsg = isHidden
      ? '¿Quieres volver a mostrar este proyecto en tu panel?'
      : '¿Quieres ocultar este proyecto de tu panel administrativo? Seguirá siendo visible para el cliente.';

    if (confirm(confirmMsg)) {
      if (isHidden) {
        this.projectsService.restoreProjectInternal(project.id).subscribe(() => this.loadData());
      } else {
        this.projectsService.archiveProjectInternal(project.id).subscribe(() => this.loadData());
      }
    }
  }
}
