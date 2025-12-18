import { Routes } from '@angular/router';
import { SetupDbComponent } from './components/setup-db/setup-db.component';
import { TicketDetailComponent } from './components/ticket-detail/ticket-detail.component';
import { ProductsComponent } from './components/products/products.component';
import { WorksComponent } from './components/works/works.component';
import { DashboardAnalyticsComponent } from './components/dashboard-analytics/dashboard-analytics.component';
import { AdvancedSearchComponent } from './components/advanced-search/advanced-search.component';
import { OnboardingCenterComponent } from './components/onboarding-center/onboarding-center.component';
import { SupabaseCustomersComponent } from './components/supabase-customers/supabase-customers.component';
import { HomeComponent } from './components/home/home.component';
import { HelpComponent } from './components/help/help.component';
import { SupabaseServicesComponent } from './components/supabase-services/supabase-services.component';
import { SupabaseTicketsComponent } from './components/supabase-tickets/supabase-tickets.component';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { ConfiguracionComponent } from './components/configuracion/configuracion.component';
import { EmergencyLoginComponent } from './components/emergency-login/emergency-login.component';
import { AuthGuard, AdminGuard, GuestGuard, DevGuard, OwnerAdminGuard } from './guards/auth.guard';
import { ModuleGuard } from './guards/module.guard';
import { ClientRoleGuard } from './guards/client-role.guard';
import { AuthCallbackComponent } from './components/auth-callback/auth-callback.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { EmailConfirmationComponent } from './components/email-confirmation/email-confirmation.component';
import { CompanyAdminComponent } from './components/company-admin/company-admin.component';
import { ConsentPortalComponent } from './components/consent-portal/consent-portal.component';
import { GdprCustomerManagerComponent } from './components/gdpr-customer-manager/gdpr-customer-manager.component';
import { AnychatComponent } from './components/anychat/anychat.component';
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
import { TestSimpleComponent } from './components/test-simple/test-simple.component';
import { TestMultitenantComponent } from './components/test-multitenant/test-multitenant.component';
import { NotificationDemoComponent } from './components/notification-demo/notification-demo.component';
import { CustomerFormComponent } from './components/customer-form_old/customer-form.component';
import { MigrateClientsComponent } from './components/migrate-clients/migrate-clients.component';
import { VerifactuSettingsComponent } from './modules/invoices/verifactu-settings/verifactu-settings.component';
import { InvoiceSeriesSettingsComponent } from './modules/invoices/invoice-series-settings/invoice-series-settings.component';
import { QuotesSettingsComponent } from './components/quotes-settings/quotes-settings.component';
import { BillingSettingsComponent } from './components/billing-settings/billing-settings.component';
import { AutomationSettingsComponent } from './components/automation-settings/automation-settings.component';
import { DevicesManagerComponent } from './components/devices-manager/devices-manager.component';

import { PublicPaymentComponent } from './components/public-payment/public-payment.component';
import { PaymentSuccessComponent } from './components/payment-success/payment-success.component';
import { PaymentCancelledComponent } from './components/payment-cancelled/payment-cancelled.component';

export const routes: Routes = [
    // Rutas principales con guards apropiados
    { path: '', redirectTo: '/inicio', pathMatch: 'full' },
    { path: 'inicio', component: HomeComponent, canActivate: [AuthGuard] },
    { path: 'clientes', component: SupabaseCustomersComponent, canActivate: [AuthGuard] },
    { path: 'clientes-gdpr', component: GdprCustomerManagerComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'tickets', component: SupabaseTicketsComponent, canActivate: [AuthGuard, ModuleGuard], data: { moduleKey: 'moduloSAT' } },
    { path: 'ticket/:id', component: TicketDetailComponent, canActivate: [AuthGuard] },
    { path: 'productos', component: ProductsComponent, canActivate: [AuthGuard, OwnerAdminGuard, ModuleGuard], data: { moduleKey: 'moduloMaterial' } },
    { path: 'servicios', component: SupabaseServicesComponent, canActivate: [AuthGuard, OwnerAdminGuard, ModuleGuard], data: { moduleKey: 'moduloServicios' } },
    { path: 'dispositivos', component: DevicesManagerComponent, canActivate: [AuthGuard, ModuleGuard], data: { moduleKey: 'moduloSAT' } },
    { path: 'chat', component: AnychatComponent, canActivate: [AuthGuard, OwnerAdminGuard, ModuleGuard], data: { moduleKey: 'moduloChat' } },
    { path: 'ayuda', component: HelpComponent, canActivate: [AuthGuard] },
    { path: 'analytics', component: DashboardAnalyticsComponent, canActivate: [AuthGuard, ModuleGuard], data: { moduleKey: 'moduloAnaliticas' } },
    { path: 'configuracion/estados', component: StagesManagementComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/unidades', component: UnitsManagementComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion', component: ConfiguracionComponent, canActivate: [AuthGuard], pathMatch: 'full' },
    { path: 'configuracion/series-facturas', component: InvoiceSeriesSettingsComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/verifactu', component: VerifactuSettingsComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/presupuestos', component: QuotesSettingsComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/facturacion', component: BillingSettingsComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/automatizaciones', component: AutomationSettingsComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'empresa', component: CompanyAdminComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    // Admin modules management (solo admin)
    { path: 'admin/modulos', component: ModulesAdminComponent, canActivate: [AuthGuard, AdminGuard] },
    // Client portal admin (owner/admin only)
    { path: 'empresa/portal-clientes', component: ClientPortalAdminComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    // Ruta de invitaciones eliminada (modelo de auto-registro activo)

    // Módulo de presupuestos (lazy loading)
    {
        path: 'presupuestos',
        loadChildren: () => import('./modules/quotes/quotes.module').then(m => m.QuotesModule),
        canActivate: [AuthGuard, OwnerAdminGuard, ModuleGuard], data: { moduleKey: 'moduloPresupuestos' }
    },
    // Módulo de facturación (lazy loading)
    {
        path: 'facturacion',
        loadChildren: () => import('./modules/invoices/invoices.module').then(m => m.InvoicesModule),
        canActivate: [AuthGuard, OwnerAdminGuard, ModuleGuard], data: { moduleKey: 'moduloFacturas' }
    },
    // Compatibilidad: rutas antiguas
    { path: 'invoices', redirectTo: 'facturacion', pathMatch: 'full' },
    { path: 'invoices/:id', redirectTo: 'facturacion/:id', pathMatch: 'full' },

    // Rutas de autenticación (sin guards)
    { path: 'login', component: LoginComponent, canActivate: [GuestGuard] },
    { path: 'register', component: RegisterComponent, canActivate: [GuestGuard] },
    { path: 'auth/callback', component: AuthCallbackComponent }, // Callback de Supabase
    { path: 'auth/confirm', component: EmailConfirmationComponent }, // Confirmación de email
    { path: 'reset-password', component: ResetPasswordComponent }, // Recuperación de contraseña
    { path: 'recuperar-password', component: ForgotPasswordComponent, canActivate: [GuestGuard] }, // Solicitud de recuperación
    // Public GDPR consent portal (no guard)
    { path: 'consent', component: ConsentPortalComponent },
    // Client portal public/semi-public invite accept (NO AUTH REQUIRED)
    { path: 'invite', component: PortalInviteComponent },
    { path: 'client/set-password', component: ClientPasswordSetupComponent },
    // Client portal dashboard (requires login as invited user)
    { path: 'portal', component: PortalDashboardComponent, canActivate: [AuthGuard, ClientRoleGuard] },
    // Client portal quotes list (client users only)
    { path: 'portal/presupuestos', component: PortalQuotesComponent, canActivate: [AuthGuard, ClientRoleGuard] },
    // Client portal quote detail
    { path: 'portal/presupuestos/:id', component: PortalQuoteDetailComponent, canActivate: [AuthGuard, ClientRoleGuard] },
    // Client portal invoices list and detail
    { path: 'portal/facturas', component: PortalInvoicesComponent, canActivate: [AuthGuard, ClientRoleGuard] },
    { path: 'portal/facturas/:id', component: PortalInvoiceDetailComponent, canActivate: [AuthGuard, ClientRoleGuard] },
    // Client portal contracted services (placeholder - to be implemented)
    { path: 'portal/servicios', loadComponent: () => import('./components/portal-services/portal-services.component').then(m => m.PortalServicesComponent), canActivate: [AuthGuard, ClientRoleGuard, ModuleGuard], data: { moduleKey: 'moduloServicios' } },
    // Client portal devices
    { path: 'portal/dispositivos', loadComponent: () => import('./components/portal-devices/portal-devices.component').then(m => m.PortalDevicesComponent), canActivate: [AuthGuard, ClientRoleGuard, ModuleGuard], data: { moduleKey: 'moduloSAT' } },

    // Public payment pages (NO AUTH REQUIRED)
    { path: 'pago/:token', component: PublicPaymentComponent },
    { path: 'pago/:token/completado', component: PaymentSuccessComponent },
    { path: 'pago/:token/cancelado', component: PaymentCancelledComponent },

    // Rutas de desarrollo (requieren autenticación y permisos dev)
    // Eliminado: advanced-features, workflows, export-import (consolidados en módulos/producto)
    // Eliminado: notification-demo (usamos solo sistema de toasts)
    // Eliminado: search y centro de notificaciones personalizados
];
