import { Routes } from '@angular/router';
import { DashboardCustomersComponent } from './components/dashboard-customers/dashboard-customers.component';
import { DashboardHomeComponent } from './components/dashboard-home/dashboard-home.component';
import { DashboardWorkshopComponent } from './components/dashboard-workshop/dashboard-workshop.component';
import { DashboardSatComponent } from './components/dashboard-sat/dashboard-sat.component';

export const routes: Routes = [
    {path: 'inicio', component: DashboardHomeComponent},
    {path: 'sat', component: DashboardSatComponent},
    {path: 'taller', component: DashboardWorkshopComponent},
    {path: 'clientes', component: DashboardCustomersComponent},
    {path: '', redirectTo: '/inicio', pathMatch: 'full'}
];
