import { Routes } from '@angular/router';
import { DashboardCustomersComponent } from './components/dashboard-customers/dashboard-customers.component';

export const routes: Routes = [
    {path: 'clientes', component: DashboardCustomersComponent},
    {path: '', redirectTo: '/inicio', pathMatch: 'full'}
];
