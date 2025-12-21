import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { SupabaseTicketsComponent } from './supabase-tickets.component';

const routes: Routes = [
  {
    path: '',
    component: SupabaseTicketsComponent
  }
];

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule.forChild(routes),
    SupabaseTicketsComponent
  ]
})
export class TicketsModule { }
