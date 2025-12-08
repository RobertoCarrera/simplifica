import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { InvoicesRoutingModule } from './invoices-routing.module';
import { InvoiceListComponent } from './invoice-list/invoice-list.component';
import { InvoiceDetailComponent } from './invoice-detail/invoice-detail.component';
import { RecurringQuotesComponent } from './recurring-quotes/recurring-quotes.component';

@NgModule({
  imports: [
    CommonModule,
    RouterModule,
    InvoicesRoutingModule,
    // Standalone components
    InvoiceListComponent,
    InvoiceDetailComponent,
    RecurringQuotesComponent
  ]
})
export class InvoicesModule {}
