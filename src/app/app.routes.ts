import { Routes } from '@angular/router';
import { UltraSimpleComponent } from './components/ultra-simple/ultra-simple.component';
import { SetupDbComponent } from './components/setup-db/setup-db.component';
import { TicketsComponent } from './components/tickets/tickets.component';
import { TicketDetailComponent } from './components/ticket-detail/ticket-detail.component';
import { ProductsComponent } from './components/products/products.component';
import { WorksComponent } from './components/works/works.component';

export const routes: Routes = [
    {path: 'clientes', component: UltraSimpleComponent},
    {path: 'tickets', component: TicketsComponent},
    {path: 'ticket/:id', component: TicketDetailComponent},
    {path: 'productos', component: ProductsComponent},
    {path: 'trabajos', component: WorksComponent},
    {path: 'setup-db', component: SetupDbComponent},
    {path: '', redirectTo: '/clientes', pathMatch: 'full'}
];
