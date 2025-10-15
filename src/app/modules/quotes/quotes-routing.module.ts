import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { QuoteListComponent } from './quote-list/quote-list.component';
import { QuoteFormComponent } from './quote-form/quote-form.component';
import { QuoteDetailComponent } from './quote-detail/quote-detail.component';
import { QuoteClientViewComponent } from './quote-client-view/quote-client-view.component';

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
  {
    path: 'client/:id/:token',
    component: QuoteClientViewComponent
  },
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
