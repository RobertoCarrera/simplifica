import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { BillingDataFormComponent } from '../billing-data-form/billing-data-form.component';
import { BillingSettingsComponent } from '../billing-settings/billing-settings.component';
import { InvoiceSeriesSettingsComponent } from '../../invoices/invoice-series-settings/invoice-series-settings.component';

@Component({
  selector: 'app-billing-config-page',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, BillingDataFormComponent, BillingSettingsComponent, InvoiceSeriesSettingsComponent],
  template: `
    <div class="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ 'billingConfigPage.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ 'billingConfigPage.subtitle' | transloco }}</p>
      </div>
      <section>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">{{ 'billingConfigPage.fiscalData' | transloco }}</h2>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <app-billing-data-form></app-billing-data-form>
        </div>
      </section>
      <section>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">{{ 'billingConfigPage.paymentIntegrations' | transloco }}</h2>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <app-billing-settings></app-billing-settings>
        </div>
      </section>
      <section>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">{{ 'billingConfigPage.series' | transloco }}</h2>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <app-invoice-series-settings></app-invoice-series-settings>
        </div>
      </section>
    </div>
  `,
})
export class BillingConfigPageComponent implements OnInit {
  ngOnInit() {}
}
