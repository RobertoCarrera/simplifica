import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Project, ProjectStage } from '../../../../models/project';

@Component({
    selector: 'app-list-view',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './list-view.component.html',
    styleUrl: './list-view.component.scss'
})
export class ListViewComponent {
    @Input() projects: Project[] = [];
    @Input() stages: ProjectStage[] = [];
    @Output() projectClick = new EventEmitter<Project>();

    sortColumn: string = 'updated_at';
    sortDirection: 'asc' | 'desc' = 'desc';

    get sortedProjects() {
        return [...this.projects].sort((a, b) => {
            const valA = this.getSortValue(a, this.sortColumn);
            const valB = this.getSortValue(b, this.sortColumn);

            if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    getSortValue(project: Project, column: string): any {
        switch (column) {
            case 'name': return project.name.toLowerCase();
            case 'client': return project.client?.business_name || (project.client?.name + (project.client?.surname ? ' ' + project.client.surname : '')) || '';
            case 'status': return this.getStageName(project.stage_id);
            case 'priority': return this.getPriorityWeight(project.priority);
            case 'start_date': return project.start_date || '';
            case 'end_date': return project.end_date || '';
            case 'progress': return this.getProgress(project);
            default: return project.updated_at || '';
        }
    }

    toggleSort(column: string) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
    }

    getStageName(stageId?: string): string {
        if (!stageId) return '-';
        const stage = this.stages.find(s => s.id === stageId);
        return stage ? stage.name : '-';
    }

    getPriorityWeight(priority?: string): number {
        switch (priority) {
            case 'critical': return 4;
            case 'high': return 3;
            case 'medium': return 2;
            case 'low': return 1;
            default: return 0;
        }
    }

    getPriorityLabel(priority?: string): string {
        switch (priority) {
            case 'critical': return 'Crítica';
            case 'high': return 'Alta';
            case 'medium': return 'Media';
            case 'low': return 'Baja';
            default: return '-';
        }
    }

    getPriorityColor(priority?: string): string {
        switch (priority) {
            case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
            case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
            case 'medium': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
            case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        }
    }

    getProgress(project: Project): number {
        if (!project.tasks_count) return 0;
        return Math.round(((project.completed_tasks_count || 0) / project.tasks_count) * 100);
    }
}
