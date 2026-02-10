import { Routes } from '@angular/router';

import { ProductsComponent } from './features/products/products/products.component';
import { HelpComponent } from './features/help/help.component';
import { SupabaseServicesComponent } from './features/services/supabase-services/supabase-services.component';
import { LoginComponent } from './features/auth/login/login.component';

import { SupabaseTicketsComponent } from './features/tickets/list/supabase-tickets.component';
import { TicketDetailComponent } from './features/tickets/detail/ticket-detail.component';
import { ConfiguracionComponent } from './features/settings/configuracion/configuracion.component';

import { AuthGuard, AdminGuard, GuestGuard, DevGuard, OwnerAdminGuard } from './guards/auth.guard';
import { StaffGuard } from './core/guards/staff.guard';
import { ModuleGuard } from './guards/module.guard';
import { ClientRoleGuard } from './guards/client-role.guard';
import { AuthCallbackComponent } from './features/auth/auth-callback/auth-callback.component';
import { ResetPasswordComponent } from './features/auth/reset-password/reset-password.component';
import { ForgotPasswordComponent } from './features/auth/forgot-password/forgot-password.component';
import { EmailConfirmationComponent } from './features/auth/email-confirmation/email-confirmation.component';
import { CompanyAdminComponent } from './features/admin/company/company-admin.component';
import { ConsentPortalComponent } from './features/portal/consent/consent-portal.component';
import { AnychatComponent } from './features/chat/anychat/anychat.component';
import { StagesManagementComponent } from './features/settings/stages-management/stages-management.component';
import { UnitsManagementComponent } from './features/settings/units-management/units-management.component';
import { PortalInviteComponent } from './features/portal/invite/portal-invite.component';
import { PortalDashboardComponent } from './features/portal/dashboard/portal-dashboard.component';
import { ClientPortalAdminComponent } from './features/admin/client-portal/client-portal-admin.component';
import { ClientPasswordSetupComponent } from './features/portal/password-setup/client-password-setup.component';
import { PortalInvoicesComponent } from './features/invoices/portal/list/portal-invoices.component';
import { PortalInvoiceDetailComponent } from './features/invoices/portal/detail/portal-invoice-detail.component';
import { ClientContractsComponent } from './features/client-portal/pages/contracts/client-contracts.component';
import { PortalQuotesComponent } from './features/quotes/portal/list/portal-quotes.component';
import { PortalQuoteDetailComponent } from './features/quotes/portal/detail/portal-quote-detail.component';
import { ModulesAdminComponent } from './features/admin/modules/modules-admin.component';
import { VerifactuSettingsComponent } from './features/invoices/verifactu-settings/verifactu-settings.component';
import { InvoiceSeriesSettingsComponent } from './features/invoices/invoice-series-settings/invoice-series-settings.component';
import { QuotesSettingsComponent } from './features/settings/quotes-settings/quotes-settings.component';
import { BillingSettingsComponent } from './features/settings/billing-settings/billing-settings.component';
import { AutomationSettingsComponent } from './features/settings/automation-settings/automation-settings.component';
import { DevicesManagerComponent } from './features/devices/devices-manager/devices-manager.component';

import { PublicPaymentComponent } from './features/payments/public/public-payment.component';
import { NotificationsComponent } from './features/notifications/notifications.component';
import { PaymentSuccessComponent } from './features/payments/success/payment-success.component';
import { PaymentCancelledComponent } from './features/payments/cancelled/payment-cancelled.component';

export const routes: Routes = [
    // Rutas principales con guards apropiados
    { path: '', redirectTo: '/inicio', pathMatch: 'full' },
    {
        path: 'inicio',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
        canActivate: [StaffGuard]
    },

    // Clientes (Lazy Load)
    {
        path: 'clientes',
        loadComponent: () => import('./features/customers/supabase-customers/supabase-customers.component').then(m => m.SupabaseCustomersComponent),
        canActivate: [StaffGuard]
    },
    {
        path: 'clientes/:id',
        loadComponent: () => import('./features/customers/profile/client-profile.component').then(m => m.ClientProfileComponent),
        canActivate: [StaffGuard]
    },
    {
        path: 'webmail-admin',
        loadComponent: () => import('./features/admin-webmail/admin-webmail.component').then(m => m.AdminWebmailComponent),
        data: { title: 'Admin Webmail' }
    },
    {
        path: 'webmail',
        loadChildren: () => import('./features/webmail/webmail.routes').then(m => m.WEBMAIL_ROUTES),
        canActivate: [StaffGuard]
    },
    {
        path: 'clientes-gdpr',
        loadComponent: () => import('./features/customers/gdpr-customer-manager/gdpr-customer-manager.component').then(m => m.GdprCustomerManagerComponent),
        canActivate: [AuthGuard, OwnerAdminGuard]
    },
    { path: 'tickets', component: SupabaseTicketsComponent, canActivate: [AuthGuard, ModuleGuard], data: { moduleKey: 'moduloSAT' } },
    { path: 'tickets/:id', component: TicketDetailComponent, canActivate: [AuthGuard] },
    { path: 'productos', component: ProductsComponent, canActivate: [AuthGuard, OwnerAdminGuard, ModuleGuard], data: { moduleKey: 'moduloProductos' } },
    { path: 'servicios', component: SupabaseServicesComponent, canActivate: [AuthGuard, OwnerAdminGuard, ModuleGuard], data: { moduleKey: 'moduloServicios' } },
    { path: 'dispositivos', component: DevicesManagerComponent, canActivate: [AuthGuard, ModuleGuard], data: { moduleKey: 'moduloSAT' } },
    { path: 'chat', component: AnychatComponent, canActivate: [AuthGuard, ModuleGuard], data: { moduleKey: 'moduloChat' } },
    { path: 'ayuda', component: HelpComponent, canActivate: [AuthGuard] },
    { path: 'notifications', component: NotificationsComponent, canActivate: [AuthGuard] },
    { path: 'analytics', loadComponent: () => import('./features/analytics/dashboard-analytics.component').then(m => m.DashboardAnalyticsComponent), canActivate: [AuthGuard, ModuleGuard], data: { moduleKey: 'moduloAnaliticas' } },
    { path: 'analytics', loadComponent: () => import('./features/analytics/dashboard-analytics.component').then(m => m.DashboardAnalyticsComponent), canActivate: [AuthGuard, ModuleGuard], data: { moduleKey: 'moduloAnaliticas' } },
    { path: 'configuracion/permisos', loadComponent: () => import('./features/settings/permissions/permissions-manager.component').then(m => m.PermissionsManagerComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/estados', component: StagesManagementComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/unidades', component: UnitsManagementComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion', component: ConfiguracionComponent, canActivate: [AuthGuard], pathMatch: 'full' },
    { path: 'configuracion/series-facturas', component: InvoiceSeriesSettingsComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/verifactu', component: VerifactuSettingsComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/presupuestos', component: QuotesSettingsComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/facturacion', component: BillingSettingsComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/automatizaciones', component: AutomationSettingsComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/etiquetas', loadComponent: () => import('./features/settings/tags-management/tags-management.component').then(m => m.TagsManagementComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/booking-types', loadComponent: () => import('./features/settings/booking/booking-settings.component').then(m => m.BookingSettingsComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'empresa', component: CompanyAdminComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    {
        path: 'projects',
        loadComponent: () => import('./features/projects/projects/projects.component').then(m => m.ProjectsComponent),
        canActivate: [AuthGuard, ModuleGuard],
        data: { moduleKey: 'moduloProyectos' }
    },
    // Admin modules management (solo admin)
    { path: 'admin/modulos', component: ModulesAdminComponent, canActivate: [AuthGuard, AdminGuard] },
    // Client portal admin (owner/admin only)
    { path: 'empresa/portal-clientes', component: ClientPortalAdminComponent, canActivate: [AuthGuard, OwnerAdminGuard] },
    // Ruta de invitaciones eliminada (modelo de auto-registro activo)

    // Módulo de presupuestos (lazy loading)
    {
        path: 'presupuestos',
        loadChildren: () => import('./features/quotes/quotes.module').then(m => m.QuotesModule),
        canActivate: [AuthGuard, OwnerAdminGuard, ModuleGuard], data: { moduleKey: 'moduloPresupuestos' }
    },
    // Módulo de facturación (lazy loading)
    {
        path: 'reservas',
        loadComponent: () => import('./features/settings/booking/booking-settings.component').then(m => m.BookingSettingsComponent),
        canActivate: [AuthGuard]
    },
    {
        path: 'facturacion',
        loadChildren: () => import('./features/invoices/invoices.module').then(m => m.InvoicesModule),
        canActivate: [AuthGuard, OwnerAdminGuard, ModuleGuard], data: { moduleKey: 'moduloFacturas' }
    },
    // Nuevas rutas (English)
    {
        path: 'invoices', canActivate: [AuthGuard, ModuleGuard], data: { module: 'invoices' },
        loadChildren: () => import('./features/invoices/invoices.module').then(m => m.InvoicesModule),
        title: 'Facturas | Simplifica'
    },
    {
        path: 'quotes', canActivate: [AuthGuard, ModuleGuard], data: { module: 'quotes' },
        loadChildren: () => import('./features/quotes/quotes.module').then(m => m.QuotesModule),
        title: 'Presupuestos | Simplifica'
    },

    // Rutas de autenticación (sin guards)
    { path: 'login', component: LoginComponent, canActivate: [GuestGuard] },
    { path: 'register', redirectTo: 'login', pathMatch: 'full' },
    { path: 'auth/callback', component: AuthCallbackComponent }, // Callback de Supabase
    { path: 'auth/confirm', component: EmailConfirmationComponent }, // Confirmación de email
    { path: 'reset-password', component: ResetPasswordComponent }, // Recuperación de contraseña
    {
        path: 'complete-profile',
        loadComponent: () => import('./features/auth/complete-profile/complete-profile.component').then(m => m.CompleteProfileComponent),
        canActivate: [AuthGuard]
    },
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
    { path: 'portal/servicios', loadComponent: () => import('./features/services/portal-services/portal-services.component').then(m => m.PortalServicesComponent), canActivate: [AuthGuard, ClientRoleGuard, ModuleGuard], data: { moduleKey: 'moduloServicios' } },
    // Client portal devices
    { path: 'portal/dispositivos', loadComponent: () => import('./features/devices/portal-devices/portal-devices.component').then(m => m.PortalDevicesComponent), canActivate: [AuthGuard, ClientRoleGuard, ModuleGuard], data: { moduleKey: 'moduloSAT' } },
    // Client portal contracts
    { path: 'portal/contratos', component: ClientContractsComponent, canActivate: [AuthGuard, ClientRoleGuard] },


    // Public payment pages (NO AUTH REQUIRED)
    { path: 'pago/:token', component: PublicPaymentComponent },
    { path: 'pago/:token/completado', component: PaymentSuccessComponent },
    { path: 'pago/:token/cancelado', component: PaymentCancelledComponent },

    // Public Privacy Policy
    {
        path: 'privacy-policy',
        loadComponent: () => import('./features/public/privacy-policy/privacy-policy.component').then(m => m.PrivacyPolicyComponent)
    },

    // Rutas de desarrollo (requieren autenticación y permisos dev)
    // Eliminado: advanced-features, workflows, export-import (consolidados en módulos/producto)
    // Eliminado: notification-demo (usamos solo sistema de toasts)
    // Eliminado: search y centro de notificaciones personalizados
    { path: '**', redirectTo: '/inicio' }
];
