import { Component, Input, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Project, ProjectPermissions } from '../../../../models/project';
import { ProjectsService } from '../../../../core/services/projects.service';
import { AuthService } from '../../../../services/auth.service';

@Component({
  selector: 'app-project-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="group project-card bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-500/30 transition-all duration-200 cursor-grab active:cursor-grabbing relative overflow-hidden">
      
      <!-- Unread Badge -->
      <div *ngIf="unreadCount() > 0" class="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm z-10 animate-pulse">
        {{ unreadCount() }}
      </div>

      <!-- Priority Badge & Options -->
      <div class="flex justify-between items-start mb-3">
        <span 
          class="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border"
          [ngClass]="{
            'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20': !project.priority || project.priority === 'low',
            'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20': project.priority === 'medium',
            'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20': project.priority === 'high',
            'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20': project.priority === 'critical'
          }"
        >
          {{ getPriorityLabel(project.priority) }}
        </span>
        
        <!-- More options (dots) could go here -->
      </div>
      
      <!-- Project Title -->
      <h3 class="font-bold text-gray-900 dark:text-white text-base mb-1 leading-tight line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
        {{ project.name || 'Sin nombre' }}
      </h3>
      
      <!-- Client Name -->
      <div class="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 mr-1.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <span class="truncate">{{ getClientName(project) }}</span>
      </div>

      <!-- Progress Bar -->
      <div class="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 mb-4 overflow-hidden">
        <div class="bg-blue-500 h-1.5 rounded-full transition-all duration-500" [style.width.%]="getProgress()"></div>
      </div>

      <!-- Subtasks -->
      <div class="mb-3 space-y-1.5" *ngIf="topTasks.length > 0">
        <div *ngFor="let task of topTasks" 
             class="flex items-start group/task" 
             [class.cursor-pointer]="canCompleteTask(task)"
             [class.cursor-not-allowed]="!canCompleteTask(task)"
             [class.opacity-50]="!canCompleteTask(task)"
             (click)="toggleTask($event, task)">
          <div class="mt-0.5 mr-2 flex-shrink-0 text-gray-400 dark:text-gray-500 group-hover/task:text-blue-500 transition-colors">
            <svg *ngIf="!task.is_completed" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L9 17l-4-4m6 2l6-6L14 11l-6 6" opacity="0" /> <!-- Empty box visual needed? Using simpler circle/square -->
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-width="2" />
            </svg>
            <svg *ngIf="task.is_completed" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
          </div>
          <span class="text-xs text-gray-600 dark:text-gray-300 line-through-hover decoration-gray-400 truncate">{{ task.title }}</span>
        </div>
      </div>

      <!-- Footer: Tasks & Date -->
      <div class="flex items-center justify-between pt-2 border-t border-gray-50 dark:border-gray-700/50">
        <!-- Tasks Count -->
        <div class="flex items-center text-xs font-medium" 
             [ngClass]="getTaskStatusClass()">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{{ project.completed_tasks_count || 0 }}/{{ project.tasks_count || 0 }}</span>
        </div>
        
        <!-- Days Remaining -->
        <div class="flex items-center text-xs" *ngIf="project.end_date">
           <span [ngClass]="getDaysRemaining().class">
             {{ getDaysRemaining().text }}
           </span>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class ProjectCardComponent implements OnInit {
  @Input() project!: Project;
  private projectsService = inject(ProjectsService);
  private authService = inject(AuthService);
  unreadCount = signal(0);
  currentUser: any = null;

  ngOnInit() {
    // Subscribe to current user
    this.authService.userProfile$.subscribe(u => this.currentUser = u);

    if (this.project?.id) {
      this.projectsService.getUnreadCount(this.project.id).then(count => {
        this.unreadCount.set(count);
      });
    }
  }

  // Permission helpers
  private get permissions(): ProjectPermissions {
    return this.project?.permissions || {
      client_can_create_tasks: false,
      client_can_edit_tasks: false,
      client_can_delete_tasks: false,
      client_can_assign_tasks: false,
      client_can_complete_tasks: false,
      client_can_comment: true,
      client_can_view_all_comments: true,
      client_can_edit_project: false,
      client_can_move_stage: false
    };
  }

  private isClient(): boolean {
    return this.currentUser?.auth_user_id === this.project?.client?.auth_user_id;
  }

  private isOwnerOrAdmin(): boolean {
    if (!this.currentUser) return false;
    if (this.currentUser.is_super_admin) return true;
    const hasRole = this.currentUser.role === 'owner' || this.currentUser.role === 'admin';
    if (!hasRole) return false;
    if (this.project?.company_id && this.currentUser.company_id) {
      return this.project.company_id === this.currentUser.company_id;
    }
    return hasRole;
  }

  canCompleteTask(task: any): boolean {
    if (!this.currentUser) return false;
    if (this.isOwnerOrAdmin()) return true;
    if (this.isClient()) return this.permissions.client_can_complete_tasks;
    return true; // Team members can
  }

  get topTasks() {
    if (!this.project.tasks) return [];
    return this.project.tasks
      .filter((t: any) => !t.is_completed)
      .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
      .slice(0, 5);
  }

  getClientName(project: Project): string {
    if (!project.client) return 'Cliente sin asignar';
    return project.client.business_name ||
      ((project.client.name || '') + ' ' + (project.client.apellidos || '')).trim() ||
      'Cliente sin nombre';
  }

  getProgress(): number {
    if (!this.project.tasks_count || this.project.tasks_count === 0) return 0;
    return Math.round(((this.project.completed_tasks_count || 0) / this.project.tasks_count) * 100);
  }

  getTaskStatusClass(): string {
    const progress = this.getProgress();
    if (progress === 100) return 'text-green-600 dark:text-green-400';
    if (progress > 0) return 'text-blue-600 dark:text-blue-400';
    return 'text-gray-400 dark:text-gray-500';
  }

  getPriorityLabel(priority?: string): string {
    switch (priority) {
      case 'low': return 'Baja';
      case 'medium': return 'Media';
      case 'high': return 'Alta';
      case 'critical': return 'Crítica';
      default: return 'Normal';
    }
  }

  getDaysRemaining(): { text: string; class: string } {
    if (!this.project.end_date) return { text: '', class: '' };

    const end = new Date(this.project.end_date);
    const start = this.project.start_date ? new Date(this.project.start_date) : new Date(this.project.created_at || new Date());
    const today = new Date();

    // Reset hours for accurate day calc
    end.setHours(23, 59, 59, 999);
    start.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    // Calc diffs in milliseconds
    const totalDuration = end.getTime() - start.getTime();
    const elapsedTime = today.getTime() - start.getTime();
    const timeRemaining = end.getTime() - today.getTime();

    // Days remaining (ceil to show "1 day" if any time left today)
    const diffDays = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

    // 1. LATE (Overdue) - Wine Color
    if (diffDays < 0) {
      return {
        text: `${Math.abs(diffDays)}d retraso`,
        class: 'text-white bg-[#722F37] dark:bg-[#5D242B] px-2 py-0.5 rounded font-bold'
      };
    }

    // 2. Not started or invalid duration
    if (totalDuration <= 0) {
      // Fallback for weird dates (start > end or same day)
      if (diffDays === 0) return { text: 'Hoy', class: 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded font-bold' };
      return { text: `${diffDays} días`, class: 'text-gray-500 bg-gray-50 dark:bg-gray-700/50 px-2 py-0.5 rounded' };
    }

    // 3. Percentage Calculation
    // If today is before start, we are at 0% used (100% remaining).
    // If today is after end, we handled it above.
    const percentUsed = Math.max(0, Math.min(100, (elapsedTime / totalDuration) * 100));
    const percentRemaining = 100 - percentUsed;

    // Thresholds:
    // Wine: Late (Already handled)
    // Red: < 10% remaining (Critical)
    // Orange: < 25% remaining (Urgent)
    // Yellow: < 50% remaining (Caution)
    // Green: >= 50% remaining (Safe)

    let colorClass = '';

    if (diffDays === 0) {
      // Last day is always Red/Critical unless it was a 1-day project? 
      // Let's treat "Today" as Critical Red.
      colorClass = 'text-red-600 bg-red-50 dark:bg-red-900/30 font-bold';
      return { text: 'Hoy', class: `${colorClass} px-2 py-0.5 rounded` };
    }

    if (percentRemaining < 10) { // < 10% left -> Red
      colorClass = 'text-red-600 bg-red-50 dark:bg-red-900/30 font-bold';
    } else if (percentRemaining < 25) { // < 25% left -> Orange
      colorClass = 'text-orange-600 bg-orange-50 dark:bg-orange-900/30 font-medium';
    } else if (percentRemaining < 50) { // < 50% left -> Yellow/Amber
      colorClass = 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 font-medium';
    } else { // > 50% left -> Green
      colorClass = 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 font-medium';
    }

    return { text: `${diffDays} días`, class: `${colorClass} px-2 py-0.5 rounded` };
  }

  toggleTask(event: MouseEvent, task: any) {
    event.stopPropagation(); // Prevent opening modal

    // Permission check - reject if user cannot complete tasks
    if (!this.canCompleteTask(task)) {
      console.log('⛔ Permission denied: cannot complete task');
      return;
    }

    // Optimistic update
    task.is_completed = !task.is_completed;

    // Update counters locally
    if (task.is_completed) {
      this.project.completed_tasks_count = (this.project.completed_tasks_count || 0) + 1;
    } else {
      this.project.completed_tasks_count = (this.project.completed_tasks_count || 0) - 1;
    }

    this.projectsService.updateTask(task.id, { is_completed: task.is_completed }).subscribe({
      error: (err) => {
        console.error('Error toggling task', err);
        // Revert on error
        task.is_completed = !task.is_completed;
        if (task.is_completed) {
          this.project.completed_tasks_count = (this.project.completed_tasks_count || 0) + 1;
        } else {
          this.project.completed_tasks_count = (this.project.completed_tasks_count || 0) - 1;
        }
      }
    });
  }
}
