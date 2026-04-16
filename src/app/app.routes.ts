import { Routes } from "@angular/router";

// CRM-ONLY routes - no client portal, no agenda, no public pages

import {
  AuthGuard,
  AdminGuard,
  GuestGuard,
  OwnerAdminGuard,
  StrictAdminGuard,
} from "./guards/auth.guard";
import { StaffGuard } from "./core/guards/staff.guard";
import { MfaStepUpGuard } from "./core/guards/mfa-stepup.guard";
import { NoRobertoGuard } from "./core/guards/no-roberto.guard";
import { ModuleGuard } from "./guards/module.guard";
import { InviteTokenGuard } from "./guards/invite-token.guard";

export const routes: Routes = [
  // Root redirect
  { path: "", redirectTo: "/inicio", pathMatch: "full" },

  // Dashboard
  {
    path: "inicio",
    loadComponent: () =>
      import("./features/dashboard/dashboard.component").then(
        (m) => m.DashboardComponent,
      ),
    canActivate: [StaffGuard],
  },

  // Clientes (CRM core)
  {
    path: "clientes",
    loadComponent: () =>
      import("./features/customers/supabase-customers/supabase-customers.component").then(
        (m) => m.SupabaseCustomersComponent,
      ),
    canActivate: [StaffGuard],
  },
  {
    path: "clientes/:id",
    loadComponent: () =>
      import("./features/customers/profile/client-profile.component").then(
        (m) => m.ClientProfileComponent,
      ),
    canActivate: [StaffGuard],
  },

  // Webmail (CRM core)
  {
    path: "webmail-admin",
    loadComponent: () =>
      import("./features/admin-webmail/admin-webmail.component").then(
        (m) => m.AdminWebmailComponent,
      ),
    canActivate: [AuthGuard, StrictAdminGuard],
    data: { title: "Admin Webmail" },
  },
  {
    path: "webmail",
    loadChildren: () =>
      import("./features/webmail/webmail.routes").then((m) => m.WEBMAIL_ROUTES),
    canActivate: [StaffGuard],
  },

  // GDPR Manager (per-customer view)
  {
    path: "clientes-gdpr",
    loadComponent: () =>
      import("./features/customers/gdpr-customer-manager/gdpr-customer-manager.component").then(
        (m) => m.GdprCustomerManagerComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard, MfaStepUpGuard],
    data: { stepUpArea: 'gdpr' },
  },

  // GDPR Dashboard (central compliance hub)
  {
    path: "gdpr",
    loadComponent: () =>
      import("./features/gdpr/gdpr-dashboard/gdpr-dashboard.component").then(
        (m) => m.GdprDashboardComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard, MfaStepUpGuard],
    data: { stepUpArea: 'gdpr' },
  },

  // Tickets (CRM core)
  {
    path: "tickets",
    loadComponent: () =>
      import("./features/tickets/list/supabase-tickets.component").then(
        (m) => m.SupabaseTicketsComponent,
      ),
    canActivate: [AuthGuard, ModuleGuard],
    data: { moduleKey: "moduloSAT" },
  },
  {
    path: "tickets/:id",
    loadComponent: () =>
      import("./features/tickets/detail/ticket-detail.component").then(
        (m) => m.TicketDetailComponent,
      ),
    canActivate: [AuthGuard],
  },

  // Products
  {
    path: "productos",
    loadComponent: () =>
      import("./features/products/products/products.component").then(
        (m) => m.ProductsComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard, ModuleGuard],
    data: { moduleKey: "moduloProductos" },
  },

  // Services
  {
    path: "servicios",
    loadComponent: () =>
      import("./features/services/supabase-services/supabase-services.component").then(
        (m) => m.SupabaseServicesComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard, ModuleGuard],
    data: { moduleKey: "moduloServicios" },
  },

  // Devices
  {
    path: "dispositivos",
    loadComponent: () =>
      import("./features/devices/devices-manager/devices-manager.component").then(
        (m) => m.DevicesManagerComponent,
      ),
    canActivate: [AuthGuard, ModuleGuard],
    data: { moduleKey: "moduloSAT" },
  },

  // Chat
  {
    path: "chat",
    loadComponent: () =>
      import("./features/chat/anychat/anychat.component").then(
        (m) => m.AnychatComponent,
      ),
    canActivate: [AuthGuard, ModuleGuard],
    data: { moduleKey: "moduloChat" },
  },

  // Help
  {
    path: "ayuda",
    loadComponent: () =>
      import("./features/help/help.component").then((m) => m.HelpComponent),
    canActivate: [AuthGuard],
  },

  // Notifications
  {
    path: "notifications",
    loadComponent: () =>
      import("./features/notifications/notifications.component").then(
        (m) => m.NotificationsComponent,
      ),
    canActivate: [AuthGuard],
  },

  // Analytics
  {
    path: "analytics",
    loadComponent: () =>
      import("./features/analytics/dashboard-analytics.component").then(
        (m) => m.DashboardAnalyticsComponent,
      ),
    canActivate: [AuthGuard, ModuleGuard],
    data: { moduleKey: "moduloAnaliticas" },
  },

  // Invoices
  {
    path: "facturacion",
    loadComponent: () =>
      import("./features/invoices/invoice-list/invoice-list.component").then(
        (m) => m.InvoiceListComponent,
      ),
    canActivate: [StaffGuard],
  },
  {
    path: "facturacion/series",
    loadComponent: () =>
      import("./features/invoices/invoice-series-settings/invoice-series-settings.component").then(
        (m) => m.InvoiceSeriesSettingsComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard],
  },
  {
    path: "facturacion/:id",
    loadComponent: () =>
      import("./features/invoices/invoice-detail/invoice-detail.component").then(
        (m) => m.InvoiceDetailComponent,
      ),
    canActivate: [StaffGuard],
  },

  // Reservas / Agenda (calendar & booking management)
  {
    path: "reservas",
    loadComponent: () =>
      import("./features/settings/booking/booking-settings.component").then(
        (m) => m.BookingSettingsComponent,
      ),
    canActivate: [AuthGuard],
    title: "Reservas | Simplifica CRM",
  },

  // Settings (lazy)
  {
    path: "configuracion",
    loadComponent: () =>
      import("./features/settings/configuracion/configuracion.component").then(
        (m) => m.ConfiguracionComponent,
      ),
    canActivate: [AuthGuard],
    pathMatch: "full",
  },
  {
    path: "configuracion/permisos",
    loadComponent: () =>
      import("./features/settings/permissions/permissions-manager.component").then(
        (m) => m.PermissionsManagerComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard],
  },
  {
    path: "configuracion/estados",
    loadComponent: () =>
      import("./features/settings/stages-management/stages-management.component").then(
        (m) => m.StagesManagementComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard],
  },
  {
    path: "configuracion/unidades",
    loadComponent: () =>
      import("./features/settings/units-management/units-management.component").then(
        (m) => m.UnitsManagementComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard],
  },
  {
    path: "configuracion/verifactu",
    loadComponent: () =>
      import("./features/invoices/verifactu-settings/verifactu-settings.component").then(
        (m) => m.VerifactuSettingsComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard],
  },
  {
    path: "configuracion/presupuestos",
    loadComponent: () =>
      import("./features/settings/quotes-settings/quotes-settings.component").then(
        (m) => m.QuotesSettingsComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard],
  },
  {
    path: "configuracion/facturacion",
    loadComponent: () =>
      import("./features/settings/billing-settings/billing-settings.component").then(
        (m) => m.BillingSettingsComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard],
  },
  {
    path: "configuracion/automatizaciones",
    loadComponent: () =>
      import("./features/settings/automation-settings/automation-settings.component").then(
        (m) => m.AutomationSettingsComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard],
  },
  {
    path: "configuracion/etiquetas",
    loadComponent: () =>
      import("./features/settings/tags-management/tags-management.component").then(
        (m) => m.TagsManagementComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard],
  },

  // Company
  {
    path: "empresa",
    loadComponent: () =>
      import("./features/admin/company/company-admin.component").then(
        (m) => m.CompanyAdminComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard],
  },

  // Projects
  {
    path: "projects",
    loadComponent: () =>
      import("./features/projects/projects/projects.component").then(
        (m) => m.ProjectsComponent,
      ),
    canActivate: [AuthGuard, ModuleGuard],
    data: { moduleKey: "moduloProyectos" },
  },

  // Admin modules
  {
    path: "admin/modulos",
    loadComponent: () =>
      import("./features/admin/modules/modules-admin.component").then(
        (m) => m.ModulesAdminComponent,
      ),
    canActivate: [AuthGuard, AdminGuard],
  },

  // Company Email Accounts
  {
    path: "admin/email-accounts",
    loadComponent: () =>
      import("./features/admin/email-accounts/email-accounts.component").then(
        (m) => m.EmailAccountsComponent,
      ),
    canActivate: [AuthGuard, OwnerAdminGuard],
  },

  // Quotes (lazy)
  {
    path: "presupuestos",
    loadChildren: () =>
      import("./features/quotes/quotes.module").then((m) => m.QuotesModule),
    canActivate: [AuthGuard, OwnerAdminGuard, ModuleGuard],
    data: { moduleKey: "moduloPresupuestos" },
  },

  // Waitlist — accessible from the Agenda sidebar button
  {
    path: "waitlist",
    loadComponent: () =>
      import("./features/bookings/waitlist-sidebar/waitlist-sidebar.component").then(
        (m) => m.WaitlistSidebarComponent,
      ),
    canActivate: [AuthGuard, ModuleGuard],
    data: { moduleKey: "moduloReservas" },
  },

  // Auth routes
  {
    path: "login",
    loadComponent: () =>
      import("./features/auth/login/login.component").then(
        (m) => m.LoginComponent,
      ),
    canActivate: [GuestGuard],
  },
  { path: "register", redirectTo: "login", pathMatch: "full" },
  {
    path: "auth/callback",
    loadComponent: () =>
      import("./features/auth/auth-callback/auth-callback.component").then(
        (m) => m.AuthCallbackComponent,
      ),
  },
  {
    path: "auth/confirm",
    loadComponent: () =>
      import("./features/auth/email-confirmation/email-confirmation.component").then(
        (m) => m.EmailConfirmationComponent,
      ),
  },
  {
    path: "mfa-verify",
    loadComponent: () =>
      import("./features/auth/mfa-verify/mfa-verify.component").then(
        (m) => m.MfaVerifyComponent,
      ),
    canActivate: [AuthGuard],
  },
  {
    path: "complete-profile",
    loadComponent: () =>
      import("./features/auth/complete-profile/complete-profile.component").then(
        (m) => m.CompleteProfileComponent,
      ),
    canActivate: [AuthGuard, NoRobertoGuard],
  },
  {
    path: "accept-dpa",
    loadComponent: () =>
      import("./features/auth/accept-dpa/accept-dpa.component").then(
        (m) => m.AcceptDpaComponent,
      ),
    canActivate: [AuthGuard],
  },
  {
    path: "invite",
    loadComponent: () =>
      import("./features/auth/invite/invite.component").then(
        (m) => m.InviteComponent,
      ),
    canActivate: [AuthGuard, InviteTokenGuard],
  },
  {
    path: "switching-company",
    loadComponent: () =>
      import("./features/auth/switching-company/switching-company.component").then(
        (m) => m.SwitchingCompanyComponent,
      ),
    canActivate: [AuthGuard],
  },

  // Catch-all - redirect to inicio
  // Public legal pages (no auth required)
  {
    path: "privacy",
    loadComponent: () =>
      import("./features/public/privacy-policy/privacy-policy.component").then(
        (m) => m.PrivacyPolicyComponent,
      ),
  },
  {
    path: "privacy/:companyId",
    loadComponent: () =>
      import("./features/public/privacy-policy/public-privacy-policy.component").then(
        (m) => m.PublicPrivacyPolicyComponent,
      ),
  },
  {
    path: "terms-of-service",
    loadComponent: () =>
      import("./features/public/terms-of-service/details-terms-of-service.component").then(
        (m) => m.DetailsTermsOfServiceComponent,
      ),
  },
  {
    path: "aviso-legal",
    loadComponent: () =>
      import("./features/public/aviso-legal/aviso-legal.component").then(
        (m) => m.AvisoLegalComponent,
      ),
  },

  // Fallback
  { path: "**", redirectTo: "/inicio" },
];
