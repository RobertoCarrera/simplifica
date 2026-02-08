import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CdkDragDrop,
  moveItemInArray,
  transferArrayItem,
  DragDropModule
} from '@angular/cdk/drag-drop';
import { ProjectsService } from '../../../core/services/projects.service';
import { Project, ProjectStage } from '../../../models/project';
import { ProjectCardComponent } from '../components/project-card/project-card.component';
import { ProjectDialogComponent } from '../components/project-dialog/project-dialog.component';
import { ColumnDialogComponent } from '../components/column-dialog/column-dialog.component';
import { Observable, forkJoin } from 'rxjs';

interface KanbanColumn {
  stage: ProjectStage;
  projects: Project[];
}

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [CommonModule, DragDropModule, ProjectCardComponent, ProjectDialogComponent, ColumnDialogComponent],
  templateUrl: './kanban-board.component.html',
  styleUrl: './kanban-board.component.scss'
})
export class KanbanBoardComponent implements OnInit {
  columns: KanbanColumn[] = [];
  isLoading = true;

  constructor(private projectsService: ProjectsService) { }

  ngOnInit() {
    this.loadBoardData();
  }

  loadBoardData() {
    this.isLoading = true;
    forkJoin({
      stages: this.projectsService.getStages(),
      projects: this.projectsService.getProjects()
    }).subscribe({
      next: ({ stages, projects }) => {
        this.stages = stages;
        this.columns = stages.map((stage: ProjectStage) => ({
          stage,
          projects: projects
            .filter((p: Project) => p.stage_id === stage.id)
            .sort((a: Project, b: Project) => (a.position - b.position))
        }));
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading board data:', err);
        this.isLoading = false;
      }
    });
  }

  drop(event: CdkDragDrop<Project[]>) {
    if (event.previousContainer === event.container) {
      // Reordering within the same column
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      this.updatePositions(event.container.data);
    } else {
      // Moving to another column
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );

      const movedProject = event.container.data[event.currentIndex];
      const newStageId = event.container.id; // We bind the stage ID to the container ID

      // Update project stage in DB
      this.projectsService.updateProject(movedProject.id, {
        stage_id: newStageId
      }).subscribe();

      // Update positions in new column
      this.updatePositions(event.container.data);
    }
  }

  updatePositions(projects: Project[]) {
    projects.forEach((project, index) => {
      project.position = index;
      // Ideally debounce this or save all positions at once
      this.projectsService.updateProject(project.id, { position: index }).subscribe();
    });
  }

  // Dialog state
  isProjectDialogVisible = false;
  selectedProject: Project | null = null;
  stages: ProjectStage[] = []; // Store stages flat for dialog

  openNewProject() {
    this.selectedProject = null;
    this.isProjectDialogVisible = true;
  }

  openEditProject(project: Project) {
    this.selectedProject = project;
    this.isProjectDialogVisible = true;
  }

  onProjectDialogClose(refresh: boolean) {
    this.isProjectDialogVisible = false;
    this.selectedProject = null;
    if (refresh) {
      this.loadBoardData();
    }
  }

  // Column Dialog
  isColumnDialogVisible = false;
  selectedStage: ProjectStage | null = null; // New property

  openNewColumn() {
    this.selectedStage = null; // Reset for new column
    this.isColumnDialogVisible = true;
  }

  openEditColumn(stage: ProjectStage) { // New method
    this.selectedStage = stage;
    this.isColumnDialogVisible = true;
  }

  onColumnDialogClose(refresh: boolean) {
    this.isColumnDialogVisible = false;
    this.selectedStage = null; // Reset selected stage
    if (refresh) {
      this.loadBoardData();
    }
  }

  getConnectedListIds(): string[] {
    return this.columns.map(c => c.stage.id);
  }
}
