import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnimationService } from '../../../services/animation.service';

export type LoadingType = 'spinner' | 'dots' | 'pulse' | 'bars' | 'skeleton' | 'progress';
export type LoadingSize = 'sm' | 'md' | 'lg' | 'xl';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loading-container" [class]="getContainerClasses()">
      
      <!-- Spinner -->
      @if (type === 'spinner') {
        <div class="loading-spinner" [class]="getSpinnerClasses()">
          <svg class="animate-spin" [class]="getSizeClasses()" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        </div>
      }

      <!-- Dots -->
      @if (type === 'dots') {
        <div class="loading-dots flex space-x-1">
          @for (dot of getArray(3); track $index) {
            <div 
              class="loading-dot"
              [class]="getDotClasses()"
              [style.animation-delay]="($index * 0.2) + 's'"
            ></div>
          }
        </div>
      }

      <!-- Pulse -->
      @if (type === 'pulse') {
        <div class="loading-pulse" [class]="getPulseClasses()">
          <div class="pulse-circle pulse-circle-1"></div>
          <div class="pulse-circle pulse-circle-2"></div>
          <div class="pulse-circle pulse-circle-3"></div>
        </div>
      }

      <!-- Bars -->
      @if (type === 'bars') {
        <div class="loading-bars flex space-x-1 items-end">
          @for (bar of getArray(4); track $index) {
            <div 
              class="loading-bar"
              [class]="getBarClasses()"
              [style.animation-delay]="($index * 0.1) + 's'"
            ></div>
          }
        </div>
      }

      <!-- Progress Bar -->
      @if (type === 'progress') {
        <div class="loading-progress w-full">
          <div class="progress-track" [class]="getProgressTrackClasses()">
            <div 
              class="progress-fill"
              [class]="getProgressFillClasses()"
              [style.width]="progress + '%'"
            ></div>
          </div>
          @if (showPercentage) {
            <div class="text-center mt-2 text-sm text-gray-600 dark:text-gray-400">
              {{ Math.round(progress) }}%
            </div>
          }
        </div>
      }

      <!-- Loading Text -->
      @if (text) {
        <div class="loading-text mt-3 text-center">
          <p [class]="getTextClasses()">{{ text }}</p>
          @if (subText) {
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{{ subText }}</p>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .loading-container {
      @apply flex flex-col items-center justify-center;
    }

    .loading-container.overlay {
      @apply fixed inset-0 bg-black bg-opacity-50 z-50;
      backdrop-filter: blur(2px);
    }

    .loading-container.inline {
      @apply py-4;
    }

    .loading-container.fullscreen {
      @apply min-h-screen;
    }

    /* Spinner Styles */
    .loading-spinner {
      @apply text-blue-500;
    }

    /* Dots Styles */
    .loading-dot {
      @apply bg-blue-500 rounded-full;
      animation: loading-bounce 1.4s ease-in-out infinite both;
    }

    .loading-dot.size-sm {
      @apply w-2 h-2;
    }

    .loading-dot.size-md {
      @apply w-3 h-3;
    }

    .loading-dot.size-lg {
      @apply w-4 h-4;
    }

    .loading-dot.size-xl {
      @apply w-5 h-5;
    }

    /* Pulse Styles */
    .loading-pulse {
      @apply relative;
    }

    .pulse-circle {
      @apply absolute rounded-full bg-blue-500 opacity-60;
      animation: loading-pulse 1.5s ease-in-out infinite;
    }

    .pulse-circle-1 {
      animation-delay: 0s;
    }

    .pulse-circle-2 {
      animation-delay: 0.3s;
    }

    .pulse-circle-3 {
      animation-delay: 0.6s;
    }

    .loading-pulse.size-sm .pulse-circle {
      @apply w-8 h-8;
    }

    .loading-pulse.size-md .pulse-circle {
      @apply w-12 h-12;
    }

    .loading-pulse.size-lg .pulse-circle {
      @apply w-16 h-16;
    }

    .loading-pulse.size-xl .pulse-circle {
      @apply w-20 h-20;
    }

    /* Bars Styles */
    .loading-bar {
      @apply bg-blue-500;
      animation: loading-bars 1.2s ease-in-out infinite;
    }

    .loading-bar.size-sm {
      @apply w-1 h-4;
    }

    .loading-bar.size-md {
      @apply w-1 h-6;
    }

    .loading-bar.size-lg {
      @apply w-2 h-8;
    }

    .loading-bar.size-xl {
      @apply w-2 h-10;
    }

    /* Progress Styles */
    .progress-track {
      @apply bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden;
    }

    .progress-track.size-sm {
      @apply h-2;
    }

    .progress-track.size-md {
      @apply h-3;
    }

    .progress-track.size-lg {
      @apply h-4;
    }

    .progress-track.size-xl {
      @apply h-6;
    }

    .progress-fill {
      @apply bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full;
      transition: width 0.3s ease-out;
    }

    .progress-fill.indeterminate {
      animation: loading-progress 2s ease-in-out infinite;
      width: 30% !important;
    }

    /* Animations */
    @keyframes loading-bounce {
      0%, 80%, 100% {
        transform: scale(0);
        opacity: 0.5;
      }
      40% {
        transform: scale(1);
        opacity: 1;
      }
    }

    @keyframes loading-pulse {
      0% {
        transform: scale(0);
        opacity: 1;
      }
      100% {
        transform: scale(1);
        opacity: 0;
      }
    }

    @keyframes loading-bars {
      0%, 40%, 100% {
        transform: scaleY(0.4);
        opacity: 0.5;
      }
      20% {
        transform: scaleY(1);
        opacity: 1;
      }
    }

    @keyframes loading-progress {
      0% {
        transform: translateX(-100%);
      }
      100% {
        transform: translateX(300%);
      }
    }

    /* Reduced Motion */
    @media (prefers-reduced-motion: reduce) {
      .loading-dot,
      .pulse-circle,
      .loading-bar,
      .progress-fill.indeterminate {
        animation: none;
      }
      
      .loading-spinner svg {
        animation: none;
      }
      
      .loading-dot {
        @apply opacity-50;
      }
    }

    /* Dark mode adjustments */
    @media (prefers-color-scheme: dark) {
      .loading-container.overlay {
        @apply bg-gray-900 bg-opacity-75;
      }
    }
  `]
})
export class LoadingComponent {
  @Input() type: LoadingType = 'spinner';
  @Input() size: LoadingSize = 'md';
  @Input() text: string = '';
  @Input() subText: string = '';
  @Input() overlay: boolean = false;
  @Input() fullscreen: boolean = false;
  @Input() progress: number = 0;
  @Input() showPercentage: boolean = false;
  @Input() indeterminate: boolean = true;

  private animationService = inject(AnimationService);

  // Math para el template
  Math = Math;

  getContainerClasses(): string {
    const classes = ['loading-container'];

    if (this.overlay) classes.push('overlay');
    else if (this.fullscreen) classes.push('fullscreen');
    else classes.push('inline');

    return classes.join(' ');
  }

  getSpinnerClasses(): string {
    return 'loading-spinner';
  }

  getSizeClasses(): string {
    switch (this.size) {
      case 'sm': return 'w-4 h-4';
      case 'md': return 'w-6 h-6';
      case 'lg': return 'w-8 h-8';
      case 'xl': return 'w-12 h-12';
      default: return 'w-6 h-6';
    }
  }

  getDotClasses(): string {
    return `loading-dot size-${this.size}`;
  }

  getPulseClasses(): string {
    return `loading-pulse size-${this.size}`;
  }

  getBarClasses(): string {
    return `loading-bar size-${this.size}`;
  }

  getProgressTrackClasses(): string {
    return `progress-track size-${this.size}`;
  }

  getProgressFillClasses(): string {
    const classes = ['progress-fill'];
    if (this.indeterminate && this.progress === 0) {
      classes.push('indeterminate');
    }
    return classes.join(' ');
  }

  getTextClasses(): string {
    switch (this.size) {
      case 'sm': return 'text-sm text-gray-600 dark:text-gray-400';
      case 'md': return 'text-base text-gray-700 dark:text-gray-300';
      case 'lg': return 'text-lg text-gray-800 dark:text-gray-200';
      case 'xl': return 'text-xl text-gray-900 dark:text-gray-100';
      default: return 'text-base text-gray-700 dark:text-gray-300';
    }
  }

  getArray(length: number): number[] {
    return Array.from({ length }, (_, i) => i);
  }
}
