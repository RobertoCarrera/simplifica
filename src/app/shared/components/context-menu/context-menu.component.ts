import { Component, Input, Output, EventEmitter, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface MenuAction {
    label: string;
    action: string;
    icon?: string;
    class?: string;
    divider?: boolean;
}

@Component({
    selector: 'app-context-menu',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div 
      class="fixed z-50 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-100 dark:border-gray-700 py-1 min-w-[160px] transform transition-all duration-75"
      [style.left.px]="position.x"
      [style.top.px]="position.y">
      
      @for (item of actions; track item.label) {
        @if (item.divider) {
          <div class="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
        } @else {
          <button
            (click)="onAction(item)"
            class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center space-x-2 transition-colors"
            [ngClass]="item.class || ''">
            @if (item.icon) {
              <span [innerHTML]="item.icon"></span>
            }
            <span>{{ item.label }}</span>
          </button>
        }
      }
    </div>
  `,
    styles: [`
    :host {
      display: block;
    }
  `]
})
export class ContextMenuComponent {
    @Input() position = { x: 0, y: 0 };
    @Input() actions: MenuAction[] = [];

    @Output() actionClick = new EventEmitter<MenuAction>();
    @Output() close = new EventEmitter<void>();

    constructor(private elementRef: ElementRef) { }

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent) {
        if (!this.elementRef.nativeElement.contains(event.target)) {
            this.close.emit();
        }
    }

    onAction(item: MenuAction) {
        this.actionClick.emit(item);
        this.close.emit();
    }
}
