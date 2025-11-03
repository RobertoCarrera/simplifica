import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { QuoteListComponent } from './quote-list/quote-list.component';
import { QuoteFormComponent } from './quote-form/quote-form.component';
import { QuoteDetailComponent } from './quote-detail/quote-detail.component';
// Public client view removed for GDPR compliance

const routes: Routes = [
  {
    path: '',
    component: QuoteListComponent
  },
  {
    path: 'new',
    component: QuoteFormComponent
  },
  {
    path: 'edit/:id',
    component: QuoteFormComponent
  },
  // Public client route removed
  {
    path: ':id',
    component: QuoteDetailComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class QuotesRoutingModule { }
