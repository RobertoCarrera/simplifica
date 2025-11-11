import { Routes } from '@angular/router';
import { UltraSimpleComponent } from './components/ultra-simple/ultra-simple.component';
import { SetupDbComponent } from './components/setup-db/setup-db.component';
import { TicketDetailComponent } from './components/ticket-detail/ticket-detail.component';
import { ProductsComponent } from './components/products/products.component';
import { WorksComponent } from './components/works/works.component';
import { DemoComponentsComponent } from './components/demo-components/demo-components.component';
import { DashboardAnalyticsComponent } from './components/dashboard-analytics/dashboard-analytics.component';
import { AdvancedSearchComponent } from './components/advanced-search/advanced-search.component';
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
import { ClientRoleGuard } from './guards/client-role.guard';
import { AuthCallbackComponent } from './components/auth-callback/auth-callback.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { AuthDebugComponent } from './components/auth-debug/auth-debug.component';
import { EmailConfirmationComponent } from './components/email-confirmation/email-confirmation.component';
import { CompanyAdminComponent } from './components/company-admin/company-admin.component';
import { ConsentPortalComponent } from './components/consent-portal/consent-portal.component';
import { GdprCustomerManagerComponent } from './components/gdpr-customer-manager/gdpr-customer-manager.component';
import { AnychatComponent } from './components/anychat/anychat.component';
import { AnychatContactsComponent } from './components/anychat-contacts/anychat-contacts.component';
import { StagesManagementComponent } from './components/stages-management/stages-management.component';
import { UnitsManagementComponent } from './components/units-management/units-management.component';
import { PortalInviteComponent } from './components/portal-invite/portal-invite.component';
import { PortalDashboardComponent } from './components/portal-dashboard/portal-dashboard.component';
import { ClientPortalAdminComponent } from './components/client-portal-admin/client-portal-admin.component';
import { ClientPasswordSetupComponent } from './components/client-password-setup/client-password-setup.component';
import { PortalQuotesComponent } from './components/portal-quotes/portal-quotes.component';
import { PortalInvoicesComponent } from './components/portal-invoices/portal-invoices.component';
import { PortalInvoiceDetailComponent } from './components/portal-invoice-detail/portal-invoice-detail.component';
import { PortalQuoteDetailComponent } from './components/portal-quote-detail/portal-quote-detail.component';
import { ModulesAdminComponent } from './components/modules-admin/modules-admin.component';

export const routes: Routes = [
    // Rutas principales con guards apropiados
    {path: '', redirectTo: '/inicio', pathMatch: 'full'},
    {path: 'inicio', component: HomeComponent, canActivate: [AuthGuard]},
    {path: 'clientes', component: SupabaseCustomersComponent, canActivate: [AuthGuard, OwnerAdminGuard]},
    {path: 'clientes-gdpr', component: GdprCustomerManagerComponent, canActivate: [AuthGuard, OwnerAdminGuard]},
    {path: 'tickets', component: SupabaseTicketsComponent, canActivate: [AuthGuard]},
    {path: 'ticket/:id', component: TicketDetailComponent, canActivate: [AuthGuard]},
    {path: 'productos', component: ProductsComponent, canActivate: [AuthGuard, OwnerAdminGuard]},
    {path: 'servicios', component: SupabaseServicesComponent, canActivate: [AuthGuard, OwnerAdminGuard]},
    {path: 'chat', component: AnychatComponent, canActivate: [AuthGuard, OwnerAdminGuard]},
    {path: 'anychat/contacts', component: AnychatContactsComponent, canActivate: [AuthGuard, OwnerAdminGuard]},
    {path: 'ayuda', component: HelpComponent, canActivate: [AuthGuard]},
    {path: 'analytics', component: DashboardAnalyticsComponent, canActivate: [AuthGuard]},
    {path: 'configuracion/estados', component: StagesManagementComponent, canActivate: [AuthGuard, OwnerAdminGuard]},
    {path: 'configuracion/unidades', component: UnitsManagementComponent, canActivate: [AuthGuard, OwnerAdminGuard]},
    {path: 'configuracion', component: ConfiguracionComponent, canActivate: [AuthGuard], pathMatch: 'full'},
    {path: 'empresa', component: CompanyAdminComponent, canActivate: [AuthGuard, OwnerAdminGuard]},
    // Admin modules management (solo admin)
    {path: 'admin/modulos', component: ModulesAdminComponent, canActivate: [AuthGuard, AdminGuard]},
    // Client portal admin (owner/admin only)
    {path: 'empresa/portal-clientes', component: ClientPortalAdminComponent, canActivate: [AuthGuard, OwnerAdminGuard]},
    // Ruta de invitaciones eliminada (modelo de auto-registro activo)
    
    // Módulo de presupuestos (lazy loading)
    {
        path: 'presupuestos',
        loadChildren: () => import('./modules/quotes/quotes.module').then(m => m.QuotesModule),
        canActivate: [AuthGuard, OwnerAdminGuard]
    },
    // Módulo de facturación (lazy loading)
    {
        path: 'facturacion',
        loadChildren: () => import('./modules/invoices/invoices.module').then(m => m.InvoicesModule),
        canActivate: [AuthGuard, OwnerAdminGuard]
    },
    // Compatibilidad: rutas antiguas
    { path: 'invoices', redirectTo: 'facturacion', pathMatch: 'full' },
    { path: 'invoices/:id', redirectTo: 'facturacion/:id', pathMatch: 'full' },
    
    // Rutas de autenticación (sin guards)
    {path: 'login', component: LoginComponent, canActivate: [GuestGuard]},
    {path: 'register', component: RegisterComponent, canActivate: [GuestGuard]},
    {path: 'auth/callback', component: AuthCallbackComponent}, // Callback de Supabase
    {path: 'auth/confirm', component: EmailConfirmationComponent}, // Confirmación de email
    {path: 'reset-password', component: ResetPasswordComponent}, // Recuperación de contraseña
    // Public GDPR consent portal (no guard)
    {path: 'consent', component: ConsentPortalComponent},
    // Client portal public/semi-public invite accept (NO AUTH REQUIRED)
    {path: 'invite', component: PortalInviteComponent},
    {path: 'client/set-password', component: ClientPasswordSetupComponent},
    // Client portal dashboard (requires login as invited user)
    {path: 'portal', component: PortalDashboardComponent, canActivate: [AuthGuard, ClientRoleGuard]},
    // Client portal quotes list (client users only)
    {path: 'portal/presupuestos', component: PortalQuotesComponent, canActivate: [AuthGuard, ClientRoleGuard]},
    // Client portal quote detail
    {path: 'portal/presupuestos/:id', component: PortalQuoteDetailComponent, canActivate: [AuthGuard, ClientRoleGuard]},
    // Client portal invoices list and detail
    {path: 'portal/facturas', component: PortalInvoicesComponent, canActivate: [AuthGuard, ClientRoleGuard]},
    {path: 'portal/facturas/:id', component: PortalInvoiceDetailComponent, canActivate: [AuthGuard, ClientRoleGuard]},
    
    // Rutas de desarrollo (requieren autenticación y permisos dev)
    {path: 'sidebar-test', component: SidebarTestComponent, canActivate: [DevGuard]},
    {path: 'advanced-features', component: AdvancedFeaturesDashboardComponent, canActivate: [DevGuard]},
    {path: 'workflows', component: WorkflowBuilderComponent, canActivate: [DevGuard]},
    {path: 'export-import', component: ExportImportManagerComponent, canActivate: [DevGuard]},
    {path: 'demo', component: DemoComponentsComponent, canActivate: [DevGuard]},
    // Eliminado: notification-demo (usamos solo sistema de toasts)
    {path: 'search', component: AdvancedSearchComponent, canActivate: [DevGuard]},
    // Eliminado: notifications (centro de notificaciones personalizado)
];
