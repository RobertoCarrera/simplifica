import { Component, OnInit } from '@angular/core';
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

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, FormsModule, KanbanBoardComponent, TimelineViewComponent, ListViewComponent, ProjectDialogComponent],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss'
})
export class ProjectsComponent implements OnInit {
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

  constructor(
    private projectsService: ProjectsService,
    private customersService: SupabaseCustomersService,
    private route: ActivatedRoute
  ) { }

  ngOnInit() {
    this.loadData();
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
