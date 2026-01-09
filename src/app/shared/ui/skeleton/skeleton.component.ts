import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SkeletonType = 'text' | 'circle' | 'rect' | 'card' | 'card-grid' | 'list' | 'table' | 'avatar' | 'button';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Skeleton individual -->
    @if (type !== 'card' && type !== 'card-grid' && type !== 'list' && type !== 'table') {
      <div 
        class="skeleton-item"
        [class]="getSkeletonClasses()"
        [style.width]="width"
        [style.height]="height"
      ></div>
    }

    <!-- Skeleton Card -->
    @if (type === 'card') {
      <div class="skeleton-card" [style.width]="width">
        <!-- Header -->
        <div class="skeleton-item h-48 w-full rounded-t-lg mb-4"></div>
        
        <!-- Content -->
        <div class="p-4 space-y-3">
          <div class="skeleton-item h-6 w-3/4 rounded"></div>
          <div class="skeleton-item h-4 w-full rounded"></div>
          <div class="skeleton-item h-4 w-5/6 rounded"></div>
          
          <!-- Footer -->
          <div class="flex justify-between items-center pt-4">
            <div class="skeleton-item h-8 w-20 rounded"></div>
            <div class="skeleton-item h-8 w-16 rounded"></div>
          </div>
        </div>
      </div>
    }

    <!-- Skeleton Card Grid -->
    @if (type === 'card-grid') {
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        @for (item of getArray(count); track $index) {
          <div class="skeleton-card w-full">
            <div class="skeleton-item h-48 w-full rounded-t-lg mb-4"></div>
            <div class="p-4 space-y-3">
              <div class="skeleton-item h-6 w-3/4 rounded"></div>
              <div class="skeleton-item h-4 w-full rounded"></div>
              <div class="skeleton-item h-4 w-5/6 rounded"></div>
              <div class="flex justify-between items-center pt-4">
                <div class="skeleton-item h-8 w-20 rounded"></div>
                <div class="skeleton-item h-8 w-16 rounded"></div>
              </div>
            </div>
          </div>
        }
      </div>
    }

    <!-- Skeleton List -->
    @if (type === 'list') {
      <div class="skeleton-list space-y-3">
        @for (item of getArray(count); track $index) {
          <div class="flex items-center space-x-3 p-3">
            <!-- Avatar -->
            <div class="skeleton-item h-10 w-10 rounded-full flex-shrink-0"></div>
            
            <!-- Content -->
            <div class="flex-1 space-y-2">
              <div class="skeleton-item h-4 w-1/4 rounded"></div>
              <div class="skeleton-item h-3 w-3/4 rounded"></div>
            </div>
            
            <!-- Action -->
            <div class="skeleton-item h-8 w-16 rounded"></div>
          </div>
        }
      </div>
    }

    <!-- Skeleton Table -->
    @if (type === 'table') {
      <div class="skeleton-table">
        <!-- Header -->
        <div class="flex space-x-4 p-4 border-b border-gray-200 dark:border-gray-700">
          @for (col of getArray(columns); track $index) {
            <div class="skeleton-item h-4 flex-1 rounded"></div>
          }
        </div>
        
        <!-- Rows -->
        @for (row of getArray(count); track $index) {
          <div class="flex space-x-4 p-4 border-b border-gray-200 dark:border-gray-700">
            @for (col of getArray(columns); track $index) {
              <div class="skeleton-item h-4 flex-1 rounded"></div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .skeleton-item {
      @apply bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700;
      background-size: 200% 100%;
      animation: skeleton-loading 1.5s ease-in-out infinite;
    }

    .skeleton-card {
      @apply bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden;
    }

    .skeleton-list {
      @apply bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden;
    }

    .skeleton-table {
      @apply bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden;
    }

    @keyframes skeleton-loading {
      0% {
        background-position: 200% 0;
      }
      100% {
        background-position: -200% 0;
      }
    }

    /* Reduced motion support */
    @media (prefers-reduced-motion: reduce) {
      .skeleton-item {
        animation: none;
        @apply bg-gray-300 dark:bg-gray-600;
      }
    }

    /* Responsive adjustments */
    @media (max-width: 640px) {
      .skeleton-card {
        @apply mx-2;
      }
      
      .skeleton-list .flex {
        @apply flex-col space-x-0 space-y-2 items-start;
      }
    }
  `]
})
export class SkeletonComponent {
  @Input() type: SkeletonType = 'text';
  @Input() width: string = '100%';
  @Input() height: string = '1rem';
  @Input() count: number = 3;
  @Input() columns: number = 4;
  @Input() animated: boolean = true;

  getSkeletonClasses(): string {
    const baseClasses = 'skeleton-item';

    switch (this.type) {
      case 'text':
        return `${baseClasses} h-4 rounded`;
      case 'circle':
        return `${baseClasses} rounded-full`;
      case 'rect':
        return `${baseClasses} rounded`;
      case 'avatar':
        return `${baseClasses} h-10 w-10 rounded-full`;
      case 'button':
        return `${baseClasses} h-10 rounded-md`;
      default:
        return `${baseClasses} rounded`;
    }
  }

  getArray(length: number): number[] {
    return Array.from({ length }, (_, i) => i);
  }
}
