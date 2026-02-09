import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KanbanBoardComponent } from '../kanban-board/kanban-board.component';
import { TimelineViewComponent } from '../components/timeline-view/timeline-view.component';
import { ListViewComponent } from '../components/list-view/list-view.component';
import { ProjectDialogComponent } from '../components/project-dialog/project-dialog.component';
import { ProjectsService } from '../../../core/services/projects.service';
import { Project } from '../../../models/project';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, FormsModule, KanbanBoardComponent, TimelineViewComponent, ListViewComponent, ProjectDialogComponent],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss'
})
export class ProjectsComponent implements OnInit, OnDestroy {
  currentView: 'kanban' | 'timeline' | 'list' = 'kanban';
  projects: any[] = [];

  // Dialog state
  isProjectDialogVisible = false;
  selectedProject: Project | null = null;
  clients: any[] = [];
  stages: any[] = [];
  showArchived = false;

  searchText: string = '';
  selectedClientId: string | null = null;
  selectedStageId: string | null = null;

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
          this.loadData();
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
    this.projectsService.getProjects(this.showArchived).subscribe(projects => {
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

      return matchesSearch && matchesClient && matchesStage;
    });
  }

  toggleArchived() {
    this.showArchived = !this.showArchived;
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
}

