import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectsService } from '../../../core/services/projects.service';
import { ToastService } from '../../../services/toast.service';
import { ProjectPermissions } from '../../../models/project';

@Component({
    selector: 'app-project-permissions-template',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './project-permissions-template.component.html',
})
export class ProjectPermissionsTemplateComponent implements OnInit {
    private projectsService = inject(ProjectsService);
    private toast = inject(ToastService);

    permissions: ProjectPermissions = this.defaultPermissions();
    isLoading = true;
    isSaving = false;

    ngOnInit() {
        this.loadTemplate();
    }

    private defaultPermissions(): ProjectPermissions {
        return {
            client_can_create_tasks: false,
            client_can_edit_tasks: false,
            client_can_delete_tasks: false,
            client_can_assign_tasks: false,
            client_can_complete_tasks: false,
            client_can_comment: true,
            client_can_view_all_comments: true,
            client_can_edit_project: false,
            client_can_move_stage: false,
        };
    }

    async loadTemplate() {
        this.isLoading = true;
        try {
            this.permissions = await this.projectsService.getProjectPermissionTemplate();
        } catch (err) {
            console.error('Error loading permission template:', err);
            this.toast.error('Error', 'No se pudo cargar la plantilla de permisos.');
        } finally {
            this.isLoading = false;
        }
    }

    async saveTemplate() {
        this.isSaving = true;
        try {
            await this.projectsService.saveProjectPermissionTemplate(this.permissions);
            this.toast.success('Plantilla', 'Permisos globales guardados correctamente.');
        } catch (err) {
            console.error('Error saving permission template:', err);
            this.toast.error('Error', 'No se pudieron guardar los permisos globales.');
        } finally {
            this.isSaving = false;
        }
    }
}
