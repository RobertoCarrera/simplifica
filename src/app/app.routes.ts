import { Routes } from '@angular/router';
import { UltraSimpleComponent } from './components/ultra-simple/ultra-simple.component';
import { SetupDbComponent } from './components/setup-db/setup-db.component';
import { TicketsComponent } from './components/tickets/tickets.component';
import { TicketDetailComponent } from './components/ticket-detail/ticket-detail.component';
import { ProductsComponent } from './components/products/products.component';
import { WorksComponent } from './components/works/works.component';
import { DemoComponentsComponent } from './components/demo-components/demo-components.component';
import { DashboardAnalyticsComponent } from './components/dashboard-analytics/dashboard-analytics.component';
import { AdvancedSearchComponent } from './components/advanced-search/advanced-search.component';
import { NotificationCenterComponent } from './components/notification-center/notification-center.component';
import { NotificationDemoComponent } from './components/notification-demo/notification-demo.component';

export const routes: Routes = [
    {path: 'clientes', component: UltraSimpleComponent},
    {path: 'tickets', component: TicketsComponent},
    {path: 'ticket/:id', component: TicketDetailComponent},
    {path: 'productos', component: ProductsComponent},
    {path: 'trabajos', component: WorksComponent},
    {path: 'analytics', component: DashboardAnalyticsComponent},
    {path: 'search', component: AdvancedSearchComponent},
    {path: 'notifications', component: NotificationCenterComponent},
    {path: 'demo', component: DemoComponentsComponent},
    {path: 'notification-demo', component: NotificationDemoComponent},
    {path: 'setup-db', component: SetupDbComponent},
    {path: '', redirectTo: '/clientes', pathMatch: 'full'}
];
