import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KanbanBoardComponent } from '../kanban-board/kanban-board.component';
import { TimelineViewComponent } from '../components/timeline-view/timeline-view.component';
import { ListViewComponent } from '../components/list-view/list-view.component';
import { ProjectDialogComponent } from '../components/project-dialog/project-dialog.component';
import { ProjectsService } from '../../../core/services/projects.service';
import { Project } from '../../../models/project';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, KanbanBoardComponent, TimelineViewComponent, ListViewComponent, ProjectDialogComponent],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss'
})
export class ProjectsComponent implements OnInit {
  currentView: 'kanban' | 'timeline' | 'list' = 'kanban';
  projects: any[] = [];

  // Dialog state
  isProjectDialogVisible = false;
  selectedProject: Project | null = null;
  stages: any[] = []; // We might need stages for the dialog

  constructor(private projectsService: ProjectsService) { }

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.projectsService.getProjects().subscribe(projects => {
      this.projects = projects;
    });

    // Load stages for the dialog
    this.projectsService.getStages().subscribe(stages => {
      this.stages = stages;
    });
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
}
