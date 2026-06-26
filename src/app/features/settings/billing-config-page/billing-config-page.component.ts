import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { BillingDataFormComponent } from '../billing-data-form/billing-data-form.component';
import { BillingSettingsComponent } from '../billing-settings/billing-settings.component';
import { InvoiceSeriesSettingsComponent } from '../../invoices/invoice-series-settings/invoice-series-settings.component';
import { VerifactuSettingsComponent } from '../../invoices/verifactu-settings/verifactu-settings.component';

@Component({
  selector: 'app-billing-config-page',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, BillingDataFormComponent, BillingSettingsComponent, InvoiceSeriesSettingsComponent, VerifactuSettingsComponent],
  template: `
    <div class="p-6 max-w-5xl mx-auto">
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ 'billingConfigPage.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ 'billingConfigPage.subtitle' | transloco }}</p>
      </div>

      <!-- Tab strip -->
      <div class="border-b border-gray-200 dark:border-gray-700 mb-6" role="tablist">
        <nav class="flex flex-wrap gap-1" aria-label="Tabs">
          <button type="button" role="tab" [attr.aria-selected]="activeTab() === 'fiscal'"
            (click)="activeTab.set('fiscal')"
            [class.border-emerald-500]="activeTab() === 'fiscal'"
            [class.text-emerald-700]="activeTab() === 'fiscal'"
            [class.dark:text-emerald-400]="activeTab() === 'fiscal'"
            [class.border-transparent]="activeTab() !== 'fiscal'"
            [class.text-gray-500]="activeTab() !== 'fiscal'"
            class="border-b-2 px-4 py-2 text-sm font-medium transition-colors hover:text-gray-700 dark:hover:text-gray-300">
            <i class="fas fa-file-invoice-dollar mr-2"></i>{{ 'billingConfigPage.tabFiscal' | transloco }}
          </button>
          <button type="button" role="tab" [attr.aria-selected]="activeTab() === 'verifactu'"
            (click)="activeTab.set('verifactu')"
            [class.border-emerald-500]="activeTab() === 'verifactu'"
            [class.text-emerald-700]="activeTab() === 'verifactu'"
            [class.dark:text-emerald-400]="activeTab() === 'verifactu'"
            [class.border-transparent]="activeTab() !== 'verifactu'"
            [class.text-gray-500]="activeTab() !== 'verifactu'"
            class="border-b-2 px-4 py-2 text-sm font-medium transition-colors hover:text-gray-700 dark:hover:text-gray-300">
            <i class="fas fa-shield-alt mr-2"></i>{{ 'billingConfigPage.tabVerifactu' | transloco }}
          </button>
          <button type="button" role="tab" [attr.aria-selected]="activeTab() === 'integrations'"
            (click)="activeTab.set('integrations')"
            [class.border-emerald-500]="activeTab() === 'integrations'"
            [class.text-emerald-700]="activeTab() === 'integrations'"
            [class.dark:text-emerald-400]="activeTab() === 'integrations'"
            [class.border-transparent]="activeTab() !== 'integrations'"
            [class.text-gray-500]="activeTab() !== 'integrations'"
            class="border-b-2 px-4 py-2 text-sm font-medium transition-colors hover:text-gray-700 dark:hover:text-gray-300">
            <i class="fas fa-credit-card mr-2"></i>{{ 'billingConfigPage.tabIntegrations' | transloco }}
          </button>
          <button type="button" role="tab" [attr.aria-selected]="activeTab() === 'series'"
            (click)="activeTab.set('series')"
            [class.border-emerald-500]="activeTab() === 'series'"
            [class.text-emerald-700]="activeTab() === 'series'"
            [class.dark:text-emerald-400]="activeTab() === 'series'"
            [class.border-transparent]="activeTab() !== 'series'"
            [class.text-gray-500]="activeTab() !== 'series'"
            class="border-b-2 px-4 py-2 text-sm font-medium transition-colors hover:text-gray-700 dark:hover:text-gray-300">
            <i class="fas fa-list-ol mr-2"></i>{{ 'billingConfigPage.tabSeries' | transloco }}
          </button>
        </nav>
      </div>

      <!-- Tab panels -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        @if (activeTab() === 'fiscal') {
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">{{ 'billingConfigPage.fiscalData' | transloco }}</h2>
          <app-billing-data-form></app-billing-data-form>
        }
        @if (activeTab() === 'verifactu') {
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">{{ 'billingConfigPage.verifactuCertificados' | transloco }}</h2>
          <app-verifactu-settings></app-verifactu-settings>
        }
        @if (activeTab() === 'integrations') {
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">{{ 'billingConfigPage.paymentIntegrations' | transloco }}</h2>
          <app-billing-settings></app-billing-settings>
        }
        @if (activeTab() === 'series') {
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">{{ 'billingConfigPage.series' | transloco }}</h2>
          <app-invoice-series-settings></app-invoice-series-settings>
        }
      </div>
    </div>
  `,
})
export class BillingConfigPageComponent implements OnInit {
  // Tab state for the three config sections. 'series' is the least-frequently
  // touched so it is the default; users who land on this page typically want
  // to see what integrations they have.
  activeTab = signal<'fiscal' | 'verifactu' | 'integrations' | 'series'>('integrations');

  ngOnInit() {}
}
