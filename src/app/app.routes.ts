import { Routes } from '@angular/router';

import { AuthGuard, AdminGuard, GuestGuard, DevGuard, OwnerAdminGuard, StrictAdminGuard } from './guards/auth.guard';
import { InviteTokenGuard } from './guards/invite-token.guard';
import { StaffGuard } from './core/guards/staff.guard';
import { ModuleGuard } from './guards/module.guard';
import { ClientRoleGuard } from './guards/client-role.guard';

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
        canActivate: [AuthGuard, StrictAdminGuard],
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
    { path: 'tickets', loadComponent: () => import('./features/tickets/list/supabase-tickets.component').then(m => m.SupabaseTicketsComponent), canActivate: [AuthGuard, ModuleGuard], data: { moduleKey: 'moduloSAT' } },
    { path: 'tickets/:id', loadComponent: () => import('./features/tickets/detail/ticket-detail.component').then(m => m.TicketDetailComponent), canActivate: [AuthGuard] },
    { path: 'productos', loadComponent: () => import('./features/products/products/products.component').then(m => m.ProductsComponent), canActivate: [AuthGuard, OwnerAdminGuard, ModuleGuard], data: { moduleKey: 'moduloProductos' } },
    { path: 'servicios', loadComponent: () => import('./features/services/supabase-services/supabase-services.component').then(m => m.SupabaseServicesComponent), canActivate: [AuthGuard, OwnerAdminGuard, ModuleGuard], data: { moduleKey: 'moduloServicios' } },
    { path: 'dispositivos', loadComponent: () => import('./features/devices/devices-manager/devices-manager.component').then(m => m.DevicesManagerComponent), canActivate: [AuthGuard, ModuleGuard], data: { moduleKey: 'moduloSAT' } },
    { path: 'chat', loadComponent: () => import('./features/chat/anychat/anychat.component').then(m => m.AnychatComponent), canActivate: [AuthGuard, ModuleGuard], data: { moduleKey: 'moduloChat' } },
    { path: 'ayuda', loadComponent: () => import('./features/help/help.component').then(m => m.HelpComponent), canActivate: [AuthGuard] },
    { path: 'notifications', loadComponent: () => import('./features/notifications/notifications.component').then(m => m.NotificationsComponent), canActivate: [AuthGuard] },
    { path: 'analytics', loadComponent: () => import('./features/analytics/dashboard-analytics.component').then(m => m.DashboardAnalyticsComponent), canActivate: [AuthGuard, ModuleGuard], data: { moduleKey: 'moduloAnaliticas' } },
    { path: 'facturacion', loadComponent: () => import('./features/invoices/invoice-list/invoice-list.component').then(m => m.InvoiceListComponent), canActivate: [StaffGuard] },
    { path: 'facturacion/series', loadComponent: () => import('./features/invoices/invoice-series-settings/invoice-series-settings.component').then(m => m.InvoiceSeriesSettingsComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'facturacion/:id', loadComponent: () => import('./features/invoices/invoice-detail/invoice-detail.component').then(m => m.InvoiceDetailComponent), canActivate: [StaffGuard] },
    { path: 'configuracion', loadComponent: () => import('./features/settings/configuracion/configuracion.component').then(m => m.ConfiguracionComponent), canActivate: [AuthGuard], pathMatch: 'full' },
    { path: 'configuracion/permisos', loadComponent: () => import('./features/settings/permissions/permissions-manager.component').then(m => m.PermissionsManagerComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/estados', loadComponent: () => import('./features/settings/stages-management/stages-management.component').then(m => m.StagesManagementComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/unidades', loadComponent: () => import('./features/settings/units-management/units-management.component').then(m => m.UnitsManagementComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/verifactu', loadComponent: () => import('./features/invoices/verifactu-settings/verifactu-settings.component').then(m => m.VerifactuSettingsComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/presupuestos', loadComponent: () => import('./features/settings/quotes-settings/quotes-settings.component').then(m => m.QuotesSettingsComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/facturacion', loadComponent: () => import('./features/settings/billing-settings/billing-settings.component').then(m => m.BillingSettingsComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/automatizaciones', loadComponent: () => import('./features/settings/automation-settings/automation-settings.component').then(m => m.AutomationSettingsComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/etiquetas', loadComponent: () => import('./features/settings/tags-management/tags-management.component').then(m => m.TagsManagementComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'configuracion/booking-types', loadComponent: () => import('./features/settings/booking/booking-settings.component').then(m => m.BookingSettingsComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
    { path: 'empresa', loadComponent: () => import('./features/admin/company/company-admin.component').then(m => m.CompanyAdminComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
    {
        path: 'projects',
        loadComponent: () => import('./features/projects/projects/projects.component').then(m => m.ProjectsComponent),
        canActivate: [AuthGuard, ModuleGuard],
        data: { moduleKey: 'moduloProyectos' }
    },
    // Admin modules management (solo admin)
    { path: 'admin/modulos', loadComponent: () => import('./features/admin/modules/modules-admin.component').then(m => m.ModulesAdminComponent), canActivate: [AuthGuard, AdminGuard] },
    // Client portal admin (owner/admin only)
    { path: 'empresa/portal-clientes', loadComponent: () => import('./features/admin/client-portal/client-portal-admin.component').then(m => m.ClientPortalAdminComponent), canActivate: [AuthGuard, OwnerAdminGuard] },
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
    // Rutas en ingl\u00e9s (English aliases)
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
    { path: 'login', loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent), canActivate: [GuestGuard] },
    { path: 'register', redirectTo: 'login', pathMatch: 'full' },
    { path: 'auth/callback', loadComponent: () => import('./features/auth/auth-callback/auth-callback.component').then(m => m.AuthCallbackComponent) },
    { path: 'auth/confirm', loadComponent: () => import('./features/auth/email-confirmation/email-confirmation.component').then(m => m.EmailConfirmationComponent) },
    {
        path: 'mfa-verify',
        loadComponent: () => import('./features/auth/mfa-verify/mfa-verify.component').then(m => m.MfaVerifyComponent),
        canActivate: [AuthGuard] // Must be logged in (AAL1 is enough to load this page)
    },
    {
        path: 'complete-profile',
        loadComponent: () => import('./features/auth/complete-profile/complete-profile.component').then(m => m.CompleteProfileComponent),
        canActivate: [AuthGuard]
    },
    {
        path: 'switching-company',
        loadComponent: () => import('./features/auth/switching-company/switching-company.component').then(m => m.SwitchingCompanyComponent),
        canActivate: [AuthGuard]
    },
    // Public GDPR consent portal (no guard)
    { path: 'consent', loadComponent: () => import('./features/portal/consent/consent-portal.component').then(m => m.ConsentPortalComponent) },
    // Client portal public/semi-public invite accept (NO AUTH REQUIRED)
    { path: 'invite', loadComponent: () => import('./features/portal/invite/portal-invite.component').then(m => m.PortalInviteComponent), canActivate: [InviteTokenGuard] },
    
    // Client portal dashboard (requires login as invited user)
    { path: 'portal', loadComponent: () => import('./features/portal/dashboard/portal-dashboard.component').then(m => m.PortalDashboardComponent), canActivate: [AuthGuard, ClientRoleGuard] },
    // Client portal quotes list (client users only)
    { path: 'portal/presupuestos', loadComponent: () => import('./features/quotes/portal/list/portal-quotes.component').then(m => m.PortalQuotesComponent), canActivate: [AuthGuard, ClientRoleGuard] },
    // Client portal quote detail
    { path: 'portal/presupuestos/:id', loadComponent: () => import('./features/quotes/portal/detail/portal-quote-detail.component').then(m => m.PortalQuoteDetailComponent), canActivate: [AuthGuard, ClientRoleGuard] },
    // Client portal invoices list and detail
    { path: 'portal/facturas', loadComponent: () => import('./features/invoices/portal/list/portal-invoices.component').then(m => m.PortalInvoicesComponent), canActivate: [AuthGuard, ClientRoleGuard] },
    { path: 'portal/facturas/:id', loadComponent: () => import('./features/invoices/portal/detail/portal-invoice-detail.component').then(m => m.PortalInvoiceDetailComponent), canActivate: [AuthGuard, ClientRoleGuard] },
    // Client portal contracted services (placeholder - to be implemented)
    { path: 'portal/servicios', loadComponent: () => import('./features/services/portal-services/portal-services.component').then(m => m.PortalServicesComponent), canActivate: [AuthGuard, ClientRoleGuard, ModuleGuard], data: { moduleKey: 'moduloServicios' } },
    // Client portal devices
    { path: 'portal/dispositivos', loadComponent: () => import('./features/devices/portal-devices/portal-devices.component').then(m => m.PortalDevicesComponent), canActivate: [AuthGuard, ClientRoleGuard, ModuleGuard], data: { moduleKey: 'moduloSAT' } },
    // Client portal contracts
    { path: 'portal/contratos', loadComponent: () => import('./features/client-portal/pages/contracts/client-contracts.component').then(m => m.ClientContractsComponent), canActivate: [AuthGuard, ClientRoleGuard] },


    // Public payment pages (NO AUTH REQUIRED)
    { path: 'pago/:token', loadComponent: () => import('./features/payments/public/public-payment.component').then(m => m.PublicPaymentComponent) },
    { path: 'pago/:token/completado', loadComponent: () => import('./features/payments/success/payment-success.component').then(m => m.PaymentSuccessComponent) },
    { path: 'pago/:token/cancelado', loadComponent: () => import('./features/payments/cancelled/payment-cancelled.component').then(m => m.PaymentCancelledComponent) },

    // Public Privacy Policy
    {
        path: 'privacy-policy',
        loadComponent: () => import('./features/public/privacy-policy/privacy-policy.component').then(m => m.PrivacyPolicyComponent)
    },
    {
        path: 'terms-of-service',
        loadComponent: () => import('./features/public/terms-of-service/details-terms-of-service.component').then(m => m.DetailsTermsOfServiceComponent)
    },

    { path: '**', redirectTo: '/inicio' }
];
