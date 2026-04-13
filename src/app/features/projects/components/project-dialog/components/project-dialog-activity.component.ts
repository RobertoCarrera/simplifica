import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-project-dialog-activity',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .no-scrollbar::-webkit-scrollbar { display: none; }
    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `],
  template: `
    <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
      <div class="flex items-center justify-between mb-3">
        <label
          class="block text-xs font-semibold text-gray-400 uppercase tracking-wider"
          >Historial</label
        >
      </div>
      <div
        class="max-h-48 overflow-y-auto space-y-2 pr-1 no-scrollbar scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
      >
        @if (isLoading) {
          <div class="flex justify-center py-4">
            <div
              class="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"
            ></div>
          </div>
        }
        @if (!isLoading && activities.length === 0) {
          <div class="text-center py-4">
            <p class="text-xs text-gray-400">Sin actividad registrada</p>
          </div>
        }
        @for (activity of activities; track activity) {
          <div
            class="flex items-start space-x-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span class="text-base flex-shrink-0">{{ getActivityIcon(activity.activity_type) }}</span>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-gray-700 dark:text-gray-300 leading-snug">
                {{ getActivityMessage(activity) }}
              </p>
              <p class="text-[10px] text-gray-400 mt-0.5">
                {{ activity.created_at | date: 'short' }}
                @if (activity.user) {
                  <span> • {{ activity.user.name || activity.user.email }}</span>
                }
                @if (activity.client) {
                  <span> • {{ activity.client.name || 'Cliente' }}</span>
                }
              </p>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class ProjectDialogActivityComponent {
  @Input() activities: any[] = [];
  @Input() isLoading = false;

  getActivityIcon(type: string): string {
    const icons: Record<string, string> = {
      project_created: '🚀', project_updated: '✏️', project_archived: '📦',
      project_restored: '↩️', project_stage_changed: '🔄', project_completed_early: '🎉',
      project_overdue: '⚠️', task_created: '➕', task_completed: '✅',
      task_reopened: '🔓', task_deleted: '🗑️', task_assigned: '👤',
      comment_added: '💬', permission_changed: '🔐',
    };
    return icons[type] || '📝';
  }

  getActivityMessage(activity: any): string {
    const messages: Record<string, (a: any) => string> = {
      project_created: () => 'Proyecto creado',
      project_updated: () => 'Proyecto actualizado',
      project_archived: () => 'Proyecto archivado',
      project_restored: () => 'Proyecto restaurado',
      project_stage_changed: (a) => `Etapa cambiada de "${a.details?.from_stage_name || 'anterior'}" a "${a.details?.to_stage_name || 'nueva'}"`,
      project_completed_early: (a) => `¡Proyecto completado ${a.details?.days_early || 0} días antes!`,
      project_overdue: (a) => `Proyecto vencido hace ${a.details?.days_overdue || 0} días`,
      task_created: (a) => `Tarea creada: "${a.details?.task_title || 'Sin título'}"`,
      task_completed: (a) => `Tarea completada: "${a.details?.task_title || 'Sin título'}"`,
      task_reopened: (a) => `Tarea reabierta: "${a.details?.task_title || 'Sin título'}"`,
      task_deleted: (a) => `Tarea eliminada: "${a.details?.task_title || 'Sin título'}"`,
      task_assigned: (a) => `Tarea "${a.details?.task_title || 'Sin título'}" asignada a ${a.details?.assigned_name || 'usuario'}`,
      comment_added: () => 'Nuevo comentario añadido',
      permission_changed: () => 'Permisos del proyecto modificados',
    };
    const fn = messages[activity.activity_type];
    return fn ? fn(activity) : 'Evento desconocido';
  }
}
