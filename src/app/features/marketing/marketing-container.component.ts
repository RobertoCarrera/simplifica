import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarketingPanelComponent } from './marketing-panel.component';
import { CampaignListComponent } from './campaign-list.component';

@Component({
  selector: 'app-marketing-container',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe, MarketingPanelComponent, CampaignListComponent],
  template: `
    <div class="h-full bg-slate-50 dark:bg-slate-900/40 flex flex-col">
      <!-- Sticky top bar -->
      <div class="sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 shadow-sm">
        <div class="flex items-center gap-4 px-4 md:px-6 py-3">
          <h1 class="text-lg font-bold text-gray-900 dark:text-white">{{ 'marketing.title' | transloco }}</h1>
          <nav class="flex gap-1 ml-auto" role="tablist">
            <button
              (click)="activeTab.set('panel')"
              class="px-3 py-1.5 text-sm rounded-md transition-colors"
              [class.bg-blue-100]="activeTab() === 'panel'"
              [class.text-blue-700]="activeTab() === 'panel'"
              [class.dark:bg-blue-900/40]="activeTab() === 'panel'"
              [class.dark:text-blue-300]="activeTab() === 'panel'"
              [class.text-gray-600]="activeTab() !== 'panel'"
              [class.dark:text-gray-400]="activeTab() !== 'panel'"
              [class.hover:text-gray-900]="activeTab() !== 'panel'"
              [class.dark:hover:text-white]="activeTab() !== 'panel'"
            >
              {{ 'marketing.panel' | transloco }}
            </button>
            <button
              (click)="activeTab.set('campaigns')"
              class="px-3 py-1.5 text-sm rounded-md transition-colors"
              [class.bg-blue-100]="activeTab() === 'campaigns'"
              [class.text-blue-700]="activeTab() === 'campaigns'"
              [class.dark:bg-blue-900/40]="activeTab() === 'campaigns'"
              [class.dark:text-blue-300]="activeTab() === 'campaigns'"
              [class.text-gray-600]="activeTab() !== 'campaigns'"
              [class.dark:text-gray-400]="activeTab() !== 'campaigns'"
              [class.hover:text-gray-900]="activeTab() !== 'campaigns'"
              [class.dark:hover:text-white]="activeTab() !== 'campaigns'"
            >
              {{ 'marketing.campaigns' | transloco }}
            </button>
          </nav>
        </div>
      </div>

      <!-- Content area -->
      <div class="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-20 md:pb-6 no-scrollbar">
        @if (activeTab() === 'panel') {
          <app-marketing-panel />
        } @else {
          <app-campaign-list />
        }
      </div>
    </div>
  `,
})
export class MarketingContainerComponent {
  activeTab = signal<'panel' | 'campaigns'>('panel');
}
