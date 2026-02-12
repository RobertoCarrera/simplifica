import { Component, Input, OnChanges, OnInit, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CdkDragDrop,
  moveItemInArray,
  transferArrayItem,
  DragDropModule
} from '@angular/cdk/drag-drop';
import { ProjectsService } from '../../../core/services/projects.service';
import { Project, ProjectStage, ProjectPermissions } from '../../../models/project';
import { ProjectCardComponent } from '../components/project-card/project-card.component';
import { AuthService } from '../../../services/auth.service';

interface KanbanColumn {
  stage: ProjectStage;
  projects: Project[];
}

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [CommonModule, DragDropModule, ProjectCardComponent, FormsModule],
  templateUrl: './kanban-board.component.html',
  styleUrl: './kanban-board.component.scss'
})
export class KanbanBoardComponent implements OnChanges, OnInit {
  @Input() projects: Project[] = [];
  @Input() stages: ProjectStage[] = [];
  @Output() editProject = new EventEmitter<Project>();
  @Output() editStage = new EventEmitter<ProjectStage | null>();
  @Output() refresh = new EventEmitter<void>();

  columns: KanbanColumn[] = [];

  private authService = inject(AuthService);
  currentUser: any = null;

  constructor(private projectsService: ProjectsService) { }

  ngOnInit() {
    this.authService.userProfile$.subscribe(u => this.currentUser = u);
  }

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

  // Permission helpers
  private isClient(project: Project): boolean {
    return this.currentUser?.auth_user_id === project?.client?.auth_user_id;
  }

  private isOwnerOrAdmin(): boolean {
    if (!this.currentUser) return false;
    if (this.currentUser.is_super_admin) return true;
    return this.currentUser.role === 'owner' || this.currentUser.role === 'admin';
  }

  canMoveProject(project: Project): boolean {
    if (!this.currentUser) return false;
    if (this.isOwnerOrAdmin()) return true;
    if (this.isClient(project)) {
      const perms = project.permissions || {} as ProjectPermissions;
      return perms.client_can_move_stage || false;
    }
    return true; // Team members can
  }

  drop(event: CdkDragDrop<Project[]>) {
    if (event.previousContainer === event.container) {
      // Reordering within the same column
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      this.updatePositions(event.container.data);
    } else {
      // Moving to another column - check permission
      const movedProject = event.previousContainer.data[event.previousIndex];

      if (!this.canMoveProject(movedProject)) {
        console.log('⛔ Permission denied: cannot move project between stages');
        return;
      }

      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );

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

  openNewColumn() {
    this.editStage.emit(null);
  }

  openEditColumn(stage: ProjectStage) {
    this.editStage.emit(stage);
  }

  editingStageId: string | null = null;
  editingStageName: string = '';

  getConnectedListIds(): string[] {
    return this.columns.map(c => c.stage.id);
  }

  startEditingStage(stage: ProjectStage) {
    if (!this.canEditStage()) return;
    this.editingStageId = stage.id;
    this.editingStageName = stage.name;
  }

  stopEditingStage() {
    this.editingStageId = null;
    this.editingStageName = '';
  }

  saveStageName(stage: ProjectStage) {
    if (!this.editingStageId || !this.editingStageName.trim() || this.editingStageName.trim() === stage.name) {
      this.stopEditingStage();
      return;
    }

    const newName = this.editingStageName.trim();
    this.projectsService.updateStage(stage.id, { name: newName }).subscribe({
      next: () => {
        stage.name = newName; // Optimistic update
        this.stopEditingStage();
      },
      error: (err) => {
        console.error('Error updating stage name', err);
        // Revert or show toast
        this.stopEditingStage();
      }
    });
  }

  private canEditStage(): boolean {
    // Only owners/admins should edit stage names? Or maybe everyone?
    // Let's restrict to owner/admin for now as per "Configuration" logic usually
    return this.isOwnerOrAdmin();
  }
}
