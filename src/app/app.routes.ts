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
import { WorkflowBuilderComponent } from './components/workflow-builder/workflow-builder.component';
import { ExportImportManagerComponent } from './components/export-import-manager/export-import-manager.component';
import { AdvancedFeaturesDashboardComponent } from './components/advanced-features-dashboard/advanced-features-dashboard.component';
import { OnboardingCenterComponent } from './components/onboarding-center/onboarding-center.component';
import { MobileDashboardComponent } from './components/mobile-dashboard/mobile-dashboard.component';
import { AnimationShowcaseComponent } from './components/animation-showcase/animation-showcase.component';
import { SupabaseCustomersComponent } from './components/supabase-customers/supabase-customers.component';
import { TestSupabaseComponent } from './components/test-supabase/test-supabase.component';
import { SupabaseServicesComponent } from './components/supabase-services/supabase-services.component';
import { SupabaseTicketsComponent } from './components/supabase-tickets/supabase-tickets.component';

export const routes: Routes = [
    {path: '', component: UltraSimpleComponent}, // Ruta por defecto
    {path: 'test-supabase', component: TestSupabaseComponent}, // Test de Supabase
    {path: 'clientes', component: SupabaseCustomersComponent}, // Nueva versión con Supabase
    {path: 'customers', component: SupabaseCustomersComponent}, // Alias para móvil
    {path: 'animaciones', component: AnimationShowcaseComponent}, // Demostración de animaciones
    {path: 'animations', component: AnimationShowcaseComponent}, // Alias para móvil
    {path: 'tickets-old', component: TicketsComponent}, // Versión antigua
    {path: 'tickets', component: SupabaseTicketsComponent}, // Nueva versión con Supabase
    {path: 'ticket/:id', component: TicketDetailComponent},
    {path: 'productos', component: ProductsComponent},
    {path: 'products', component: ProductsComponent}, // Alias para móvil
    {path: 'servicios', component: SupabaseServicesComponent}, // Nueva versión con Supabase
    {path: 'services', component: SupabaseServicesComponent}, // Alias para móvil
    {path: 'servicios', component: SupabaseServicesComponent}, // Redirección del antiguo nombre
    {path: 'works', component: SupabaseServicesComponent}, // Alias para móvil
    {path: 'mobile', component: MobileDashboardComponent},
    {path: 'onboarding', component: OnboardingCenterComponent},
    {path: 'advanced-features', component: AdvancedFeaturesDashboardComponent},
    {path: 'analytics', component: DashboardAnalyticsComponent},
    {path: 'search', component: AdvancedSearchComponent},
    {path: 'notifications', component: NotificationCenterComponent},
    {path: 'workflows', component: WorkflowBuilderComponent},
    {path: 'export-import', component: ExportImportManagerComponent},
    {path: 'demo', component: DemoComponentsComponent},
    {path: 'notification-demo', component: NotificationDemoComponent},
    {path: 'setup-db', component: SetupDbComponent},
    {path: '', redirectTo: '/clientes', pathMatch: 'full'}
];
