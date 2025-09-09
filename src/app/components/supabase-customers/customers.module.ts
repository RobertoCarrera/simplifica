import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { SupabaseCustomersComponent } from './supabase-customers.component';

const routes: Routes = [
  {
    path: '',
    component: SupabaseCustomersComponent
  }
];

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule.forChild(routes),
    SupabaseCustomersComponent
  ]
})
export class CustomersModule { }
