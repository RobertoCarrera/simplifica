import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
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
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, FormsModule, KanbanBoardComponent, TimelineViewComponent, ListViewComponent, ProjectDialogComponent, ColumnDialogComponent],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss'
})
export class ProjectsComponent implements OnInit, OnDestroy {
  currentView: 'kanban' | 'timeline' | 'list' = 'kanban';
  projects: any[] = [];

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

  // Realtime subscriptions
  private sbService = inject(SupabaseClientService);
  private projectsChannel: RealtimeChannel | null = null;
  private tasksChannel: RealtimeChannel | null = null;

  constructor(
    private projectsService: ProjectsService,
    private customersService: SupabaseCustomersService,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.loadData();
    this.setupRealtimeSubscriptions();

    this.customersService.getCustomers().subscribe(clients => {
      this.clients = clients;
    });

    // Check for openProject query param
    this.route.queryParams.subscribe(params => {
      const projectId = params['openProject'];
      if (projectId) {
        // Wait for projects to load if not already loaded, or load specific
        // For simplicity, we'll try to find it in the loaded list or fetch it
        this.projectsService.getProjectById(projectId).then(project => {
          if (project) {
            this.selectedProject = project;
            this.isProjectDialogVisible = true;
          }
        }).catch(err => console.error('Error opening project from notification', err));
      }
    });
  }

  ngOnDestroy() {
    this.cleanupRealtimeSubscriptions();
  }

  private setupRealtimeSubscriptions() {
    const supabase = this.sbService.instance;

    // Subscribe to projects changes
    this.projectsChannel = supabase
      .channel('projects-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        (payload) => {
          console.log('🔄 Projects realtime event:', payload.eventType);
          this.loadData();
        }
      )
      .subscribe();

    // Subscribe to project_tasks changes
    this.tasksChannel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'project_tasks' },
        (payload) => {
          console.log('🔄 Tasks realtime event:', payload.eventType);
          // Wait a bit database triggers might be running
          setTimeout(() => this.loadData(), 500);
        }
      )
      .subscribe();

    console.log('📡 Realtime subscriptions active for projects and tasks');
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
    this.projectsService.getProjects(this.showArchived, this.showHidden).subscribe(projects => {
      this.projects = projects;
      this.applyFilters(); // Apply filters when data loads
    });

    // Load stages for the dialog
    this.projectsService.getStages().subscribe(stages => {
      this.stages = stages;
    });
  }

  applyFilters() {
    this.filteredProjects = this.projects.filter(project => {
      const matchesSearch = !this.searchText ||
        project.name.toLowerCase().includes(this.searchText.toLowerCase()) ||
        (project.description && project.description.toLowerCase().includes(this.searchText.toLowerCase()));

      const matchesClient = !this.selectedClientId || project.client_id === this.selectedClientId;
      const matchesStage = !this.selectedStageId || project.stage_id === this.selectedStageId;
      const matchesPriority = !this.selectedPriority || project.priority === this.selectedPriority;
      const matchesDeadline = !this.selectedDeadline || this.checkDeadline(project, this.selectedDeadline);


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

