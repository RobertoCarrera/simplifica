import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { InvoicesRoutingModule } from './invoices-routing.module';
import { InvoiceListComponent } from './invoice-list/invoice-list.component';
import { InvoiceDetailComponent } from './invoice-detail/invoice-detail.component';

@NgModule({
  imports: [
    CommonModule,
    RouterModule,
    InvoicesRoutingModule,
    // Standalone components
    InvoiceListComponent,
    InvoiceDetailComponent
  ]
})
export class InvoicesModule {}
