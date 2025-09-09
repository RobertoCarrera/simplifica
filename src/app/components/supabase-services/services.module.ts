import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { SupabaseServicesComponent } from './supabase-services.component';

const routes: Routes = [
  {
    path: '',
    component: SupabaseServicesComponent
  }
];

@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    RouterModule.forChild(routes),
    SupabaseServicesComponent
  ]
})
export class ServicesModule { }
