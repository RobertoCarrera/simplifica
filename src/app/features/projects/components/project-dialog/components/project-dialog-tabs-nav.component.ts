import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-project-dialog-tabs-nav',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="px-6 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex space-x-6"
    >
      <button
        (click)="tabChange.emit('details')"
        class="py-3 text-sm font-medium border-b-2 transition-colors relative"
        [ngClass]="
          activeTab === 'details'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
        "
      >
        Detalles
      </button>
      @if (canViewComments) {
        <button
          (click)="tabChange.emit('comments')"
          class="py-3 text-sm font-medium border-b-2 transition-colors relative flex items-center space-x-2"
          [ngClass]="
            activeTab === 'comments'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          "
        >
          <span>Comentarios</span>
          @if (commentsCount > 0) {
            <span
              class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs py-0.5 px-2 rounded-full"
              >{{ commentsCount }}</span
            >
          }
        </button>
      }
      @if (isOwnerOrAdmin) {
        <button
          (click)="tabChange.emit('permissions')"
          class="py-3 text-sm font-medium border-b-2 transition-colors"
          [ngClass]="
            activeTab === 'permissions'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          "
        >
          Permisos
        </button>
      }
      <button
        (click)="tabChange.emit('notifications')"
        class="py-3 text-sm font-medium border-b-2 transition-colors"
        [ngClass]="
          activeTab === 'notifications'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
        "
      >
        Notificaciones
      </button>
      <button
        (click)="tabChange.emit('documents')"
        class="py-3 text-sm font-medium border-b-2 transition-colors relative flex items-center space-x-2"
        [ngClass]="
          activeTab === 'documents'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
        "
      >
        <span>Documentos</span>
        @if (filesCount > 0) {
          <span
            class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs py-0.5 px-2 rounded-full"
            >{{ filesCount }}</span
          >
        }
      </button>
    </div>
  `,
})
export class ProjectDialogTabsNavComponent {
  @Input() activeTab: string = 'details';
  @Input() canViewComments = false;
  @Input() isOwnerOrAdmin = false;
  @Input() commentsCount = 0;
  @Input() filesCount = 0;
  @Output() tabChange = new EventEmitter<string>();
}
