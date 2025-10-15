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
import { HomeComponent } from './components/home/home.component';
import { HelpComponent } from './components/help/help.component';
import { SupabaseServicesComponent } from './components/supabase-services/supabase-services.component';
import { SupabaseTicketsComponent } from './components/supabase-tickets/supabase-tickets.component';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { ConfiguracionComponent } from './components/configuracion/configuracion.component';
import { SidebarTestComponent } from './components/sidebar-test/sidebar-test.component';
import { DevSetupComponent } from './components/dev-setup/dev-setup.component';
import { EmergencyLoginComponent } from './components/emergency-login/emergency-login.component';
import { DebugDashboardComponent } from './components/debug-dashboard/debug-dashboard.component';
import { AuthGuard, AdminGuard, GuestGuard, DevGuard, OwnerAdminGuard } from './guards/auth.guard';
import { AuthCallbackComponent } from './components/auth-callback/auth-callback.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { AuthDebugComponent } from './components/auth-debug/auth-debug.component';
import { EmailConfirmationComponent } from './components/email-confirmation/email-confirmation.component';
import { CompanyAdminComponent } from './components/company-admin/company-admin.component';
import { ConsentPortalComponent } from './components/consent-portal/consent-portal.component';
import { GdprCustomerManagerComponent } from './components/gdpr-customer-manager/gdpr-customer-manager.component';
import { AnychatComponent } from './components/anychat/anychat.component';

export const routes: Routes = [
    // Rutas principales con guards apropiados
    {path: '', redirectTo: '/inicio', pathMatch: 'full'},
    {path: 'inicio', component: HomeComponent, canActivate: [AuthGuard]},
    {path: 'clientes', component: SupabaseCustomersComponent, canActivate: [AuthGuard]},
    {path: 'clientes-gdpr', component: GdprCustomerManagerComponent, canActivate: [AuthGuard]},
    {path: 'tickets', component: SupabaseTicketsComponent, canActivate: [AuthGuard]},
    {path: 'ticket/:id', component: TicketDetailComponent, canActivate: [AuthGuard]},
    {path: 'servicios', component: SupabaseServicesComponent, canActivate: [AuthGuard]},
    {path: 'chat', component: AnychatComponent, canActivate: [AuthGuard]},
    {path: 'ayuda', component: HelpComponent, canActivate: [AuthGuard]},
    {path: 'configuracion', component: ConfiguracionComponent, canActivate: [AuthGuard]},
    {path: 'empresa', component: CompanyAdminComponent, canActivate: [AuthGuard, OwnerAdminGuard]},
    // Ruta de invitaciones eliminada (modelo de auto-registro activo)
    
    // Módulo de presupuestos (lazy loading)
    {
        path: 'presupuestos',
        loadChildren: () => import('./modules/quotes/quotes.module').then(m => m.QuotesModule),
        canActivate: [AuthGuard]
    },
    
    // Rutas de autenticación (sin guards)
    {path: 'login', component: LoginComponent, canActivate: [GuestGuard]},
    {path: 'register', component: RegisterComponent, canActivate: [GuestGuard]},
    {path: 'auth/callback', component: AuthCallbackComponent}, // Callback de Supabase
    {path: 'auth/confirm', component: EmailConfirmationComponent}, // Confirmación de email
    {path: 'reset-password', component: ResetPasswordComponent}, // Recuperación de contraseña
    // Public GDPR consent portal (no guard)
    {path: 'consent', component: ConsentPortalComponent},
    
    // Rutas de desarrollo (requieren autenticación y permisos dev)
    {path: 'sidebar-test', component: SidebarTestComponent, canActivate: [DevGuard]},
    {path: 'analytics', component: DashboardAnalyticsComponent, canActivate: [DevGuard]},
    {path: 'advanced-features', component: AdvancedFeaturesDashboardComponent, canActivate: [DevGuard]},
    {path: 'workflows', component: WorkflowBuilderComponent, canActivate: [DevGuard]},
    {path: 'export-import', component: ExportImportManagerComponent, canActivate: [DevGuard]},
    {path: 'demo', component: DemoComponentsComponent, canActivate: [DevGuard]},
    {path: 'notification-demo', component: NotificationDemoComponent, canActivate: [DevGuard]},
    {path: 'search', component: AdvancedSearchComponent, canActivate: [DevGuard]},
    {path: 'notifications', component: NotificationCenterComponent, canActivate: [DevGuard]}
];
