import { Routes } from '@angular/router';
import { DashboardCustomersComponent } from './components/dashboard-customers/dashboard-customers.component';
import { DashboardHomeComponent } from './components/dashboard-home/dashboard-home.component';

export const routes: Routes = [
    {path: 'inicio', component: DashboardHomeComponent},
    {path: 'clientes', component: DashboardCustomersComponent},
    {path: '', redirectTo: '/inicio', pathMatch: 'full'}
];
