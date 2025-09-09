import { Routes } from '@angular/router';
import { UltraSimpleComponent } from './components/ultra-simple/ultra-simple.component';
import { SetupDbComponent } from './components/setup-db/setup-db.component';
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
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { ConfiguracionComponent } from './components/configuracion/configuracion.component';
import { SidebarTestComponent } from './components/sidebar-test/sidebar-test.component';
import { DevSetupComponent } from './components/dev-setup/dev-setup.component';
import { EmergencyLoginComponent } from './components/emergency-login/emergency-login.component';
import { AuthGuard, AdminGuard, GuestGuard } from './guards/auth.guard';
import { AuthCallbackComponent } from './components/auth-callback/auth-callback.component';

export const routes: Routes = [
    // Rutas principales con guards apropiados
    {path: '', redirectTo: '/inicio', pathMatch: 'full'},
    {path: 'inicio', component: SupabaseCustomersComponent, canActivate: [AuthGuard]},
    {path: 'clientes', component: SupabaseCustomersComponent, canActivate: [AuthGuard]},
    {path: 'taller', component: SupabaseTicketsComponent, canActivate: [AuthGuard]},
    {path: 'servicios', component: SupabaseServicesComponent, canActivate: [AuthGuard]},
    {path: 'configuracion', component: ConfiguracionComponent, canActivate: [AuthGuard]},
    // Ruta de invitaciones eliminada (modelo de auto-registro activo)
    
    // Rutas de autenticación (sin guards)
    {path: 'login', component: LoginComponent, canActivate: [GuestGuard]},
    {path: 'register', component: RegisterComponent, canActivate: [GuestGuard]},
    {path: 'emergency-login', component: EmergencyLoginComponent},
    {path: 'auth/callback', component: AuthCallbackComponent}, // Callback de Supabase
    
    // Rutas de desarrollo (requieren autenticación y permisos dev)
    {path: 'sidebar-test', component: SidebarTestComponent, canActivate: [AuthGuard]},
    {path: 'analytics', component: DashboardAnalyticsComponent, canActivate: [AuthGuard]},
    {path: 'advanced-features', component: AdvancedFeaturesDashboardComponent, canActivate: [AuthGuard]},
    {path: 'workflows', component: WorkflowBuilderComponent, canActivate: [AuthGuard]},
    {path: 'export-import', component: ExportImportManagerComponent, canActivate: [AuthGuard]},
    {path: 'demo', component: DemoComponentsComponent, canActivate: [AuthGuard]},
    {path: 'notification-demo', component: NotificationDemoComponent, canActivate: [AuthGuard]},
    {path: 'search', component: AdvancedSearchComponent, canActivate: [AuthGuard]},
    {path: 'notifications', component: NotificationCenterComponent, canActivate: [AuthGuard]}
];
