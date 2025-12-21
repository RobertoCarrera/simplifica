import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';

import { QuotesRoutingModule } from './quotes-routing.module';
import { QuoteListComponent } from './quote-list/quote-list.component';
import { QuoteFormComponent } from './quote-form/quote-form.component';
import { QuoteDetailComponent } from './quote-detail/quote-detail.component';
import { QuoteClientViewComponent } from './quote-client-view/quote-client-view.component';

@NgModule({
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    QuotesRoutingModule,
    // Los componentes standalone se importan directamente
    QuoteListComponent,
    QuoteFormComponent,
    QuoteDetailComponent,
    QuoteClientViewComponent
  ]
})
export class QuotesModule { }
