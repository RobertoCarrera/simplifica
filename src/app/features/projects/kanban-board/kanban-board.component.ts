import { Component, Input, OnChanges, EventEmitter, Output } from '@angular/core';
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
import { ColumnDialogComponent } from '../components/column-dialog/column-dialog.component';

interface KanbanColumn {
  stage: ProjectStage;
  projects: Project[];
}

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [CommonModule, DragDropModule, ProjectCardComponent, ColumnDialogComponent], // Removed ProjectDialogComponent
  templateUrl: './kanban-board.component.html',
  styleUrl: './kanban-board.component.scss'
})
export class KanbanBoardComponent implements OnChanges {
  @Input() projects: Project[] = [];
  @Input() stages: ProjectStage[] = [];
  @Output() editProject = new EventEmitter<Project>();
  @Output() refresh = new EventEmitter<void>();

  columns: KanbanColumn[] = [];

  constructor(private projectsService: ProjectsService) { }

  ngOnChanges() {
    this.updateColumns();
  }

  updateColumns() {
    if (!this.stages || !this.projects) return;

    this.columns = this.stages.map((stage: ProjectStage) => ({
      stage,
      projects: this.projects
        .filter((p: Project) => p.stage_id === stage.id)
        .sort((a: Project, b: Project) => (a.position - b.position))
    }));
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
      }).subscribe(() => {
        this.refresh.emit();
      });

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

  openEditProject(project: Project) {
    this.editProject.emit(project);
  }

  // Column Dialog
  isColumnDialogVisible = false;
  selectedStage: ProjectStage | null = null;

  openNewColumn() {
    this.selectedStage = null;
    this.isColumnDialogVisible = true;
  }

  openEditColumn(stage: ProjectStage) {
    this.selectedStage = stage;
    this.isColumnDialogVisible = true;
  }

  onColumnDialogClose(refresh: boolean) {
    this.isColumnDialogVisible = false;
    this.selectedStage = null;
    if (refresh) {
      this.refresh.emit();
    }
  }

  getConnectedListIds(): string[] {
    return this.columns.map(c => c.stage.id);
  }
}
