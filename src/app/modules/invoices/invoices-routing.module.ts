import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { InvoiceListComponent } from './invoice-list/invoice-list.component';
import { InvoiceDetailComponent } from './invoice-detail/invoice-detail.component';
import { VerifactuSettingsComponent } from './verifactu-settings/verifactu-settings.component';
import { VerifactuRegistryComponent } from './verifactu-registry/verifactu-registry.component';
import { RecurringQuotesComponent } from './recurring-quotes/recurring-quotes.component';
import { InvoicesContainerComponent } from './invoices-container/invoices-container.component';

const routes: Routes = [
  {
    path: '',
    component: InvoicesContainerComponent,
    children: [
      { path: '', component: InvoiceListComponent },
      { path: 'recurrente', component: RecurringQuotesComponent }
    ]
  },
  { path: 'verifactu-settings', component: VerifactuSettingsComponent },
  { path: 'verifactu-registry', component: VerifactuRegistryComponent },
  { path: ':id', component: InvoiceDetailComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class InvoicesRoutingModule {}
