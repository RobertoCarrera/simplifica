import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { InvoiceListComponent } from './invoice-list/invoice-list.component';
import { InvoiceDetailComponent } from './invoice-detail/invoice-detail.component';
import { VerifactuSettingsComponent } from './verifactu-settings/verifactu-settings.component';

const routes: Routes = [
  { path: '', component: InvoiceListComponent },
  { path: 'verifactu-settings', component: VerifactuSettingsComponent },
  { path: ':id', component: InvoiceDetailComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class InvoicesRoutingModule {}
