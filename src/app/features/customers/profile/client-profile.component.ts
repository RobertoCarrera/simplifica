import { Component, OnInit, inject, signal, computed, ChangeDetectionStrategy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Location } from '@angular/common';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { AuthService } from '../../../services/auth.service';
import { Customer } from '../../../models/customer';
import { TagManagerComponent } from '../../../shared/components/tag-manager/tag-manager.component';
import { SecureClinicalNotesComponent } from '../components/secure-clinical-notes/secure-clinical-notes.component';
import { ClientBookingsComponent } from './components/client-bookings/client-bookings.component';
import { ClientBillingComponent } from './components/client-billing/client-billing.component';
import { ClientDocumentsComponent } from './components/client-documents/client-documents.component';
import { ClientTeamAccessComponent } from './components/client-team-access/client-team-access.component';
import { ToastService } from '../../../services/toast.service';
import { AuditLoggerService } from '../../../services/audit-logger.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { ConfirmModalComponent } from '../../../shared/ui/confirm-modal/confirm-modal.component';
import { SupabaseSessionCloseService } from '../../../services/supabase-session-close.service';

@Component({
  selector: 'app-client-profile',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TagManagerComponent,
    SecureClinicalNotesComponent,
    ClientBookingsComponent,
    ClientBillingComponent,
    ClientDocumentsComponent,
    ClientTeamAccessComponent,
    TranslocoPipe,
    ConfirmModalComponent,
  ],
  template: `
    <div class="h-full flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <!-- Loading Skeleton -->
      @if (isLoading()) {
        <div class="flex-1 flex flex-col overflow-hidden animate-pulse">
          <!-- Skeleton Header -->
          <div
            class="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 sm:p-6"
          >
            <div class="flex items-center gap-2 mb-4">
              <div class="w-5 h-5 rounded bg-slate-200 dark:bg-slate-700"></div>
              <div class="h-4 w-28 rounded bg-slate-200 dark:bg-slate-700"></div>
            </div>
            <div class="flex items-center gap-4">
              <div class="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0"></div>
              <div class="flex-1 space-y-2">
                <div class="h-6 w-48 rounded bg-slate-200 dark:bg-slate-700"></div>
                <div class="flex gap-4">
                  <div class="h-4 w-40 rounded bg-slate-200 dark:bg-slate-700"></div>
                  <div class="h-4 w-28 rounded bg-slate-200 dark:bg-slate-700"></div>
                </div>
              </div>
            </div>
          </div>
          <!-- Skeleton Tabs -->
          <div
            class="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-3 sm:py-4"
          >
            <div class="flex gap-6">
              <div class="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700"></div>
              <div class="h-4 w-28 rounded bg-slate-200 dark:bg-slate-700"></div>
              <div class="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700"></div>
              <div class="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700"></div>
              <div class="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700"></div>
            </div>
          </div>
          <!-- Skeleton Content Cards -->
          <div class="p-4 sm:p-6">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div
                class="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 space-y-4"
              >
                <div class="h-5 w-40 rounded bg-slate-200 dark:bg-slate-700"></div>
                <div class="space-y-3">
                  <div class="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700"></div>
                  <div class="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700"></div>
                  <div class="h-3 w-16 rounded bg-slate-200 dark:bg-slate-700"></div>
                  <div class="h-4 w-full rounded bg-slate-200 dark:bg-slate-700"></div>
                  <div class="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700"></div>
                  <div class="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700"></div>
                </div>
              </div>
              <div
                class="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 space-y-4"
              >
                <div class="h-5 w-36 rounded bg-slate-200 dark:bg-slate-700"></div>
                <div class="space-y-3">
                  <div class="h-4 w-full rounded bg-slate-200 dark:bg-slate-700"></div>
                  <div class="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700"></div>
                  <div class="h-4 w-1/2 rounded bg-slate-200 dark:bg-slate-700"></div>
                </div>
              </div>
              <div
                class="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 space-y-4"
              >
                <div class="h-5 w-28 rounded bg-slate-200 dark:bg-slate-700"></div>
                <div class="space-y-3">
                  <div class="h-4 w-full rounded bg-slate-200 dark:bg-slate-700"></div>
                  <div class="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-700"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      }

      @if (!isLoading() && customer()) {
        <div class="flex-1 flex flex-col overflow-hidden">
          <!-- Main Scrollable Area -->
          <main class="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900 scroll-smooth relative">
            <!-- Client Info (Scrolls away) -->
            <div
              class="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 sm:p-6"
            >
              <!-- Back Button -->
              <button
                (click)="goBack()"
                class="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 mb-4 transition-colors group"
              >
                <i class="fas fa-arrow-left group-hover:-translate-x-0.5 transition-transform"></i>
                {{ 'clients.backToList' | transloco }}
              </button>
              <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div class="flex items-center gap-4">
                  <!-- Avatar -->
                  <div
                    class="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md"
                    [style.background]="getAvatarGradient(customer()!)"
                  >
                    {{ getInitials(customer()!) }}
                  </div>
                  <div>
                    <h1
                      class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"
                    >
                      {{ getDisplayName(customer()!) }}
                      @if (customer()!.client_type === 'business') {
                        <span
                          class="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          >{{ 'clients.companyBadge' | transloco }}</span
                        >
                      }
                    </h1>
                    <div
                      class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm text-slate-500 dark:text-slate-400 mt-1"
                    >
                      @if (customer()!.email) {
                        <span class="flex items-center gap-1">
                          <i class="fas fa-envelope"></i> {{ customer()!.email }}
                        </span>
                      }
                      @if (customer()!.phone) {
                        <span class="flex items-center gap-1">
                          <i class="fas fa-phone"></i> {{ customer()!.phone }}
                        </span>
                      }
                    </div>
                  </div>
                </div>
                <!-- Actions / Tags -->
                <div class="flex flex-col items-end gap-3">
                  @if (customer()!.is_active === false) {
                    <button (click)="reactivateCustomer()"
                      class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-700 transition-colors">
                      <i class="fas fa-user-check"></i> Reactivar
                    </button>
                  } @else {
                    <button (click)="deactivateCustomer()"
                      class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-700 transition-colors">
                      <i class="fas fa-user-slash"></i> Desactivar
                    </button>
                  }
                  <app-tag-manager
                    [entityId]="customer()!.id"
                    entityType="clients"
                  ></app-tag-manager>
                </div>
              </div>
            </div>
            <!-- Sticky Tabs Navigation -->
            <div
              class="sticky top-0 z-20 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 shadow-sm overflow-x-auto no-scrollbar"
            >
              <div class="flex items-center gap-6">
                <button
                  (click)="setActiveTab('ficha')"
                  class="py-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap"
                  [class.border-blue-500]="activeTab() === 'ficha'"
                  [class.text-blue-600]="activeTab() === 'ficha'"
                  [class.dark:text-blue-400]="activeTab() === 'ficha'"
                  [class.border-transparent]="activeTab() !== 'ficha'"
                  [class.text-slate-500]="activeTab() !== 'ficha'"
                >
                  <i class="fas fa-id-card mr-2"></i> {{ 'clients.tabFichaTecnica' | transloco }}
                </button>
                @if (isClinicalEnabled()) {
                  <button
                    (click)="setActiveTab('clinical')"
                    class="py-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap"
                    [class.border-emerald-500]="activeTab() === 'clinical'"
                    [class.text-emerald-600]="activeTab() === 'clinical'"
                    [class.dark:text-emerald-400]="activeTab() === 'clinical'"
                    [class.border-transparent]="activeTab() !== 'clinical'"
                    [class.text-slate-500]="activeTab() !== 'clinical'"
                  >
                    <i class="fas fa-notes-medical mr-2"></i> {{ 'clients.tabHistorialClinico' | transloco }}
                  </button>
                }
                @if (isAgendaEnabled()) {
                  <button
                    (click)="setActiveTab('agenda')"
                    class="py-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap"
                    [class.border-purple-500]="activeTab() === 'agenda'"
                    [class.text-purple-600]="activeTab() === 'agenda'"
                    [class.dark:text-purple-400]="activeTab() === 'agenda'"
                    [class.border-transparent]="activeTab() !== 'agenda'"
                    [class.text-slate-500]="activeTab() !== 'agenda'"
                  >
                    <i class="fas fa-calendar-alt mr-2"></i> {{ 'clients.tabAgenda' | transloco }}
                  </button>
                }
                @if (isBillingEnabled() && isOwner()) {
                  <button
                    (click)="setActiveTab('billing')"
                    class="py-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap"
                    [class.border-amber-500]="activeTab() === 'billing'"
                    [class.text-amber-600]="activeTab() === 'billing'"
                    [class.dark:text-amber-400]="activeTab() === 'billing'"
                    [class.border-transparent]="activeTab() !== 'billing'"
                    [class.text-slate-500]="activeTab() !== 'billing'"
                  >
                    <i class="fas fa-file-invoice-dollar mr-2"></i> {{ 'clients.tabFacturacion' | transloco }}
                  </button>
                }
                @if (isOwner()) {
                  <button
                    (click)="setActiveTab('documents')"
                    class="py-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap"
                    [class.border-cyan-500]="activeTab() === 'documents'"
                    [class.text-cyan-600]="activeTab() === 'documents'"
                    [class.dark:text-cyan-400]="activeTab() === 'documents'"
                    [class.border-transparent]="activeTab() !== 'documents'"
                    [class.text-slate-500]="activeTab() !== 'documents'"
                  >
                    <i class="fas fa-folder mr-2"></i> {{ 'clients.tabDocumentos' | transloco }}
                  </button>
                }
                @if (canManageTeam()) {
                  <button
                    (click)="setActiveTab('team')"
                    class="py-4 border-b-2 font-medium text-sm transition-colors whitespace-nowrap"
                    [class.border-blue-500]="activeTab() === 'team'"
                    [class.text-blue-600]="activeTab() === 'team'"
                    [class.dark:text-blue-400]="activeTab() === 'team'"
                    [class.border-transparent]="activeTab() !== 'team'"
                    [class.text-slate-500]="activeTab() !== 'team'"
                  >
                    <i class="fas fa-users-cog mr-2"></i> {{ 'clients.tabEquipo' | transloco }}
                  </button>
                }
              </div>
            </div>
            <!-- Tab Content -->
            <div class="p-6 pb-20">
              <!-- Tab: Ficha -->
              @if (activeTab() === 'ficha') {
                <div class="animate-fade-in space-y-6">
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <!-- 1. Información General -->
                    <div
                      class="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700"
                    >
                      <h3
                        class="font-bold text-lg mb-4 text-slate-800 dark:text-white flex items-center gap-2"
                      >
                        <i class="fas fa-user-circle text-blue-500"></i> {{ 'clients.infoGeneral' | transloco }}
                      </h3>
                      <dl class="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                        <div class="sm:col-span-2">
                          <dt class="text-xs text-slate-400 uppercase font-semibold">
                            {{ 'clients.tipoCliente' | transloco }}
                          </dt>
                          <dd class="text-slate-700 dark:text-slate-200">
                            {{ customer()!.client_type === 'business' ? ('clients.empresa' | transloco) : ('clients.personaFisica' | transloco) }}
                          </dd>
                        </div>
                        <!-- Business specific -->
                        @if (customer()!.client_type === 'business') {
                          <div class="sm:col-span-2">
                            <dt class="text-xs text-slate-400 uppercase font-semibold">
                              {{ 'clients.razonSocial' | transloco }}
                            </dt>
                            <dd class="text-slate-700 dark:text-slate-200 font-medium">
                              {{ customer()!.business_name || '-' }}
                            </dd>
                          </div>
                          <div>
                            <dt class="text-xs text-slate-400 uppercase font-semibold">
                              {{ 'clients.cifNif' | transloco }}
                            </dt>
                            <dd class="text-slate-700 dark:text-slate-200">
                              {{ customer()!.cif_nif || '-' }}
                            </dd>
                          </div>
                          <div>
                            <dt class="text-xs text-slate-400 uppercase font-semibold">
                              {{ 'clients.nombreComercial' | transloco }}
                            </dt>
                            <dd class="text-slate-700 dark:text-slate-200">
                              {{ customer()!.trade_name || '-' }}
                            </dd>
                          </div>
                          <div class="sm:col-span-2">
                            <dt class="text-xs text-slate-400 uppercase font-semibold">
                              {{ 'clients.representanteLegal' | transloco }}
                            </dt>
                            <dd class="text-slate-700 dark:text-slate-200">
                              {{ customer()!.legal_representative_name || '-' }}
                            </dd>
                          </div>
                        }
                        <!-- Individual specific -->
                        @if (customer()!.client_type !== 'business') {
                          <div>
                            <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.nombre' | transloco }}</dt>
                            <dd class="text-slate-700 dark:text-slate-200 font-medium">
                              {{ customer()!.name || '-' }}
                            </dd>
                          </div>
                          <div>
                            <dt class="text-xs text-slate-400 uppercase font-semibold">
                              {{ 'clients.apellidos' | transloco }}
                            </dt>
                            <dd class="text-slate-700 dark:text-slate-200 font-medium">
                              {{ customer()!.surname || '-' }}
                            </dd>
                          </div>
                          <div>
                            <dt class="text-xs text-slate-400 uppercase font-semibold">
                              {{ 'clients.dniNif' | transloco }}
                            </dt>
                            <dd class="text-slate-700 dark:text-slate-200 flex items-center gap-2">
                              <span>{{ maskedDni() }}</span>
                              @if (customer()!.dni) {
                                <button type="button" (click)="toggleDni()" class="text-xs text-blue-500 hover:text-blue-700">
                                  <i class="fas" [class.fa-eye]="!showDni()" [class.fa-eye-slash]="showDni()"></i>
                                </button>
                              }
                            </dd>
                          </div>
                          <div>
                            <dt class="text-xs text-slate-400 uppercase font-semibold">
                              {{ 'clients.fechaNacimiento' | transloco }}
                            </dt>
                            <dd class="text-slate-700 dark:text-slate-200">
                              {{ customer()!.fecha_nacimiento || '-' }}
                            </dd>
                          </div>
                        }
                      </dl>
                    </div>
                    <!-- 2. Contacto y Ubicación -->
                    <div
                      class="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700"
                    >
                      <h3
                        class="font-bold text-lg mb-4 text-slate-800 dark:text-white flex items-center gap-2"
                      >
                        <i class="fas fa-address-book text-emerald-500"></i> {{ 'clients.contactoUbicacion' | transloco }}
                      </h3>
                      <dl class="space-y-4">
                        <div>
                          <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.email' | transloco }}</dt>
                          <dd class="text-slate-700 dark:text-slate-200 flex items-center gap-2">
                            <i class="fas fa-envelope text-slate-300"></i>
                            <a
                              [href]="'mailto:' + customer()!.email"
                              class="hover:text-blue-600 transition-colors"
                              >{{ customer()!.email || '-' }}</a
                            >
                          </dd>
                        </div>
                        <div>
                          <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.telefono' | transloco }}</dt>
                          <dd class="text-slate-700 dark:text-slate-200 flex items-center gap-2">
                            <i class="fas fa-phone text-slate-300"></i>
                            <a
                              [href]="'tel:' + customer()!.phone"
                              class="hover:text-blue-600 transition-colors"
                              >{{ customer()!.phone || '-' }}</a
                            >
                          </dd>
                        </div>
                        @if (customer()!.website) {
                          <div>
                            <dt class="text-xs text-slate-400 uppercase font-semibold">
                              {{ 'clients.webRedes' | transloco }}
                            </dt>
                            <dd class="text-slate-700 dark:text-slate-200 flex items-center gap-2">
                              <i class="fas fa-globe text-slate-300"></i>
                              <a
                                [href]="customer()!.website"
                                target="_blank"
                                class="hover:text-blue-600 transition-colors"
                                >{{ customer()!.website }}</a
                              >
                            </dd>
                          </div>
                        }
                        <div>
                          <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.direccion' | transloco }}</dt>
                          <dd class="text-slate-700 dark:text-slate-200 flex items-start gap-2">
                            <i class="fas fa-map-marker-alt text-slate-300 mt-1"></i>
                            <span>{{ customer()!.address || '-' }}</span>
                          </dd>
                        </div>
                        @if (customer()!.tax_region) {
                          <div>
                            <dt class="text-xs text-slate-400 uppercase font-semibold">
                              {{ 'clients.regionFiscal' | transloco }}
                            </dt>
                            <dd class="text-slate-700 dark:text-slate-200">
                              {{ customer()!.tax_region }}
                            </dd>
                          </div>
                        }
                      </dl>
                    </div>
                    <!-- 3. Facturación -->
                    <div
                      class="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700"
                    >
                      <h3
                        class="font-bold text-lg mb-4 text-slate-800 dark:text-white flex items-center gap-2"
                      >
                        <i class="fas fa-file-invoice-dollar text-amber-500"></i> {{ 'clients.datosFacturacion' | transloco }}
                      </h3>
                      <dl class="grid grid-cols-1 gap-y-4 sm:grid-cols-2 gap-x-4">
                        <div class="sm:col-span-2">
                          <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.iban' | transloco }}</dt>
                          <dd class="text-slate-700 dark:text-slate-200 font-mono text-sm">
                            {{ customer()!.iban || '-' }}
                          </dd>
                        </div>
                        <div>
                          <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.bicSwift' | transloco }}</dt>
                          <dd class="text-slate-700 dark:text-slate-200 font-mono text-sm">
                            {{ customer()!.bic || '-' }}
                          </dd>
                        </div>
                        <div>
                          <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.moneda' | transloco }}</dt>
                          <dd class="text-slate-700 dark:text-slate-200">
                            {{ customer()!.currency || 'EUR' }}
                          </dd>
                        </div>
                        <div>
                          <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.mpagoDefecto' | transloco }}</dt>
                          <dd class="text-slate-700 dark:text-slate-200 font-medium">
                            {{ customer()!.payment_method || '-' }}
                          </dd>
                        </div>
                        <div>
                          <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.terminosPago' | transloco }}</dt>
                          <dd class="text-slate-700 dark:text-slate-200">
                            {{ customer()!.payment_terms || '-' }}
                          </dd>
                        </div>
                        @if (customer()!.billing_email) {
                          <div class="sm:col-span-2">
                            <dt class="text-xs text-slate-400 uppercase font-semibold">
                              {{ 'clients.emailFacturacion' | transloco }}
                            </dt>
                            <dd class="text-slate-700 dark:text-slate-200">
                              {{ customer()!.billing_email }}
                            </dd>
                          </div>
                        }
                        <div>
                          <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.limiteCredito' | transloco }}</dt>
                          <dd class="text-emerald-600 dark:text-emerald-400 font-medium">
                            {{ customer()!.credit_limit ? (customer()!.credit_limit | currency: 'EUR') : '-' }}
                          </dd>
                        </div>
                        <div>
                          <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.dtoDefecto' | transloco }}</dt>
                          <dd class="text-slate-700 dark:text-slate-200">
                            {{ customer()!.default_discount ? customer()!.default_discount + '%' : '-' }}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <!-- 4. CRM y Clasificación -->
                    <div
                      class="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700"
                    >
                      <h3
                        class="font-bold text-lg mb-4 text-slate-800 dark:text-white flex items-center gap-2"
                      >
                        <i class="fas fa-chart-line text-purple-500"></i> {{ 'clients.crmClasificacion' | transloco }}
                      </h3>
                      <dl class="grid grid-cols-1 gap-y-4 sm:grid-cols-2 gap-x-4">
                        <div>
                          <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.estado' | transloco }}</dt>
                          <dd class="mt-1">
                            <span
                              class="px-2 py-0.5 rounded text-xs font-bold uppercase transition-colors"
                              [class.bg-blue-100]="customer()!.status === 'customer'"
                              [class.text-blue-700]="customer()!.status === 'customer'"
                              [class.bg-amber-100]="customer()!.status === 'prospect'"
                              [class.text-amber-700]="customer()!.status === 'prospect'"
                              [class.bg-emerald-100]="customer()!.status === 'lead'"
                              [class.text-emerald-700]="customer()!.status === 'lead'"
                              [class.bg-slate-100]="!customer()!.status"
                              [class.text-slate-600]="!customer()!.status"
                            >
                              {{ customer()!.status || ('clients.sinEstado' | transloco) }}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.tierNivel' | transloco }}</dt>
                          <dd class="mt-1">
                            @if (customer()!.tier) {
                              <span
                                class="font-bold text-lg"
                                [class.text-amber-500]="customer()!.tier === 'A'"
                                [class.text-slate-400]="customer()!.tier === 'B'"
                                [class.text-amber-800]="customer()!.tier === 'C'"
                              >
                                {{ customer()!.tier }}
                              </span>
                            }
                            @if (!customer()!.tier) {
                              <span class="text-slate-400">-</span>
                            }
                          </dd>
                        </div>
                        <div>
                          <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.origen' | transloco }}</dt>
                          <dd class="text-slate-700 dark:text-slate-200">
                            {{ customer()!.source || '-' }}
                          </dd>
                        </div>
                        <div>
                          <dt class="text-xs text-slate-400 uppercase font-semibold">{{ 'clients.sectorProfesion' | transloco }}</dt>
                          <dd class="text-slate-700 dark:text-slate-200">
                            {{ customer()!.industry || customer()!.profesion || '-' }}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <!-- 5. GDPR y Seguridad -->
                    <div
                      class="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700"
                    >
                      <h3
                        class="font-bold text-lg mb-4 text-slate-800 dark:text-white flex items-center gap-2"
                      >
                        <i class="fas fa-shield-alt text-cyan-500"></i> {{ 'clients.privacidadGdpr' | transloco }}
                      </h3>
                      <dl class="space-y-4">
                        <div>
                          <dt class="text-xs text-slate-400 uppercase font-semibold">
                            {{ 'clients.estadoConsentimiento' | transloco }}
                          </dt>
                          <dd class="mt-1">
                            <span
                              class="px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-2 w-fit"
                              [class.bg-emerald-100]="customer()!.consent_status === 'accepted'"
                              [class.text-emerald-700]="customer()!.consent_status === 'accepted'"
                              [class.bg-amber-100]="customer()!.consent_status === 'pending'"
                              [class.text-amber-700]="customer()!.consent_status === 'pending'"
                              [class.bg-red-100]="
                                customer()!.consent_status === 'rejected' ||
                                customer()!.consent_status === 'revoked'
                              "
                              [class.text-red-700]="
                                customer()!.consent_status === 'rejected' ||
                                customer()!.consent_status === 'revoked'
                              "
                            >
                              <i
                                class="fas"
                                [class.fa-check-circle]="customer()!.consent_status === 'accepted'"
                                [class.fa-clock]="customer()!.consent_status === 'pending'"
                                [class.fa-times-circle]="
                                  customer()!.consent_status === 'rejected' ||
                                  customer()!.consent_status === 'revoked'
                                "
                              ></i>
                              {{ customer()!.consent_status || ('clients.sinDefinir' | transloco) }}
                            </span>
                          </dd>
                        </div>
                        <div class="flex flex-col gap-2">
                          <div class="flex items-center justify-between text-sm">
                            <span class="text-slate-500 dark:text-slate-400"
                              >Comunicaciones Marketing</span
                            >
                            <i
                              class="fas"
                              [class.fa-check-circle]="customer()!.marketing_consent"
                              [class.text-emerald-500]="customer()!.marketing_consent"
                              [class.fa-times-circle]="!customer()!.marketing_consent"
                              [class.text-slate-300]="!customer()!.marketing_consent"
                            ></i>
                          </div>
                          <!-- Google Review Status -->
                          <div class="flex items-center justify-between text-sm">
                            <span class="text-slate-500 dark:text-slate-400">Google Review</span>
                            <div class="flex items-center gap-2">
                              @if (customer()!.has_left_google_review) {
                                <i class="fas fa-star text-amber-400"></i>
                                <span class="text-xs text-amber-600 dark:text-amber-400">Ha dejado review</span>
                              } @else {
                                <i class="fas fa-star-half-alt text-slate-300"></i>
                                <span class="text-xs text-slate-400">Sin review</span>
                              }
                              @if (customer()!.marketing_consent) {
                                <button
                                  (click)="requestGoogleReview()"
                                  class="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                                  title="Solicitar Google Review"
                                >
                                  <i class="fas fa-paper-plane mr-1"></i>Solicitar
                                </button>
                              }
                              <button
                                (click)="markHasLeftReview(!customer()!.has_left_google_review)"
                                class="text-xs px-2 py-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                [title]="customer()!.has_left_google_review ? 'Marcar como que NO ha dejado review' : 'Marcar como que ha dejado review'"
                              >
                                <i class="fas" [class.fa-check-circle]="customer()!.has_left_google_review" [class.fa-times-circle]="!customer()!.has_left_google_review"></i>
                              </button>
                            </div>
                          </div>
                          <div class="flex items-center justify-between text-sm">
                            <span class="text-slate-500 dark:text-slate-400"
                              >{{ 'clients.gdpr.datosSaludTratamiento' | transloco }}</span
                            >
                            <i
                              class="fas"
                              [class.fa-check-circle]="customer()!.health_data_consent"
                              [class.text-emerald-500]="customer()!.health_data_consent"
                              [class.fa-times-circle]="!customer()!.health_data_consent"
                              [class.text-slate-300]="!customer()!.health_data_consent"
                            ></i>
                          </div>
                          <div class="flex items-center justify-between text-sm">
                            <span class="text-slate-500 dark:text-slate-400"
                              >{{ 'clients.gdpr.privacidadAceptacion' | transloco }}</span
                            >
                            <i
                              class="fas"
                              [class.fa-check-circle]="customer()!.privacy_policy_consent"
                              [class.text-emerald-500]="customer()!.privacy_policy_consent"
                              [class.fa-times-circle]="!customer()!.privacy_policy_consent"
                              [class.text-slate-300]="!customer()!.privacy_policy_consent"
                            ></i>
                          </div>
                        </div>
                      </dl>
                    </div>
                    <!-- 6. Notas Internas -->
                    <div
                      class="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 border border-slate-200 dark:border-slate-700 lg:col-span-2"
                    >
                      <h3
                        class="font-bold text-lg mb-4 text-slate-800 dark:text-white flex items-center gap-2"
                      >
                        <i class="fas fa-sticky-note text-blue-500"></i> {{ 'clients.notasInternas' | transloco }}
                      </h3>
                      <div
                        class="bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-lg border border-blue-100 dark:border-blue-900/30"
                      >
                        <p
                          class="text-slate-600 dark:text-slate-400 text-sm whitespace-pre-wrap leading-relaxed"
                        >
                          {{
                            customer()!.notes ||
                              customer()!.internal_notes ||
                              ('clients.noNotasInternas' | transloco)
                          }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              }
              <!-- Tab: Clinical Notes -->
              @if (activeTab() === 'clinical' && isClinicalEnabled()) {
                <div class="animate-fade-in">
                  <app-secure-clinical-notes
                    [clientId]="customer()!.id"
                  ></app-secure-clinical-notes>
                </div>
              }
              <!-- Tab: Agenda -->
              @if (activeTab() === 'agenda' && isAgendaEnabled()) {
                <div class="animate-fade-in">
                  <app-client-bookings
                    [clientId]="customer()!.id"
                    [clientData]="customer()"
                  ></app-client-bookings>
                </div>
              }
              <!-- Tab: Billing -->
              @if (activeTab() === 'billing' && isBillingEnabled() && isOwner()) {
                <div class="animate-fade-in">
                  <app-client-billing [clientId]="customer()!.id"></app-client-billing>
                </div>
              }
              <!-- Tab: Documents -->
              @if (activeTab() === 'documents' && isOwner()) {
                <div class="animate-fade-in">
                  <app-client-documents
                    [clientId]="customer()!.id"
                    [companyId]="customer()!.usuario_id"
                    [clientName]="getDisplayName(customer()!)"
                    [clientEmail]="customer()!.email"
                  ></app-client-documents>
                </div>
              }
              <!-- Tab: Team Access -->
              @if (activeTab() === 'team' && canManageTeam()) {
                <div class="animate-fade-in">
                  <app-client-team-access [clientId]="customer()!.id" [companyId]="customer()!.usuario_id"></app-client-team-access>
                </div>
              }
            </div>
          </main>
        </div>
      }
      <app-confirm-modal #confirmModal></app-confirm-modal>
    </div>
  `,
  styles: [
    `
      .animate-fade-in {
        animation: fadeIn 0.3s ease-in-out;
      }
      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(5px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .no-scrollbar::-webkit-scrollbar {
        display: none;
      }
      .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientProfileComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private customersService = inject(SupabaseCustomersService);
  private toastService = inject(ToastService);
  private auditLogger = inject(AuditLoggerService);
  private sessionCloseService = inject(SupabaseSessionCloseService);
  private auth = inject(AuthService);

  @ViewChild('confirmModal') confirmModal!: ConfirmModalComponent;

  // DNI/NIF visibility control — masked by default, toggle triggers audit log
  showDni = signal(false);

  toggleDni() {
    const newState = !this.showDni();
    this.showDni.set(newState);
    if (newState) {
      const c = this.customer();
      if (c) {
        this.auditLogger.logAction('VIEW_DNI', 'customer', c.id, {
          viewed_customer_email: c.email,
        });
      }
    }
  }

  maskedDni(): string {
    const c = this.customer();
    if (!c?.dni) return '-';
    if (this.showDni()) return c.dni;
    // Mask: show first 2 chars + asterisks + last char
    const d = c.dni;
    if (d.length <= 3) return '***';
    return d.substring(0, 2) + '*'.repeat(d.length - 3) + d.substring(d.length - 1);
  }
  private modulesService = inject(SupabaseModulesService);

  isClinicalEnabled = computed(() => {
    const mods = this.modulesService.modulesSignal();
    if (!mods) return false;
    return mods.some((m) => m.key === 'moduloClinico' && m.enabled);
  });

  isAgendaEnabled = computed(() => {
    const mods = this.modulesService.modulesSignal();
    if (!mods) return false;
    // Employees with team access see agenda regardless of moduloReservas
    return mods.some((m) => m.key === 'moduloReservas' && m.enabled);
  });

  isBillingEnabled = computed(() => {
    const mods = this.modulesService.modulesSignal();
    if (!mods) return false;
    return mods.some(
      (m) => (m.key === 'moduloFacturas' || m.key === 'moduloPresupuestos') && m.enabled,
    );
  });

  isOwner = computed(() => {
    // Consider owner if role is 'owner' or isAdmin()
    return this.auth.userRole() === 'owner' || this.auth.isAdmin();
  });

  canManageTeam = computed(() => {
    const role = this.auth.userRole();
    if (['owner', 'admin', 'super_admin'].includes(role) || this.auth.isAdmin()) {
      return true;
    }
    // Professionals and agents can access the team tab to transfer/derive clients
    if (['professional', 'agent'].includes(role)) {
      return true;
    }
    // The professional who created this client can also manage its team assignments
    const authUid = this.auth.currentUser?.id;
    return !!authUid && this.customer()?.created_by === authUid;
  });

  customer = signal<Customer | null>(null);
  isLoading = signal(true);
  activeTab = signal<'ficha' | 'clinical' | 'agenda' | 'billing' | 'documents' | 'team'>('ficha');

  ngOnInit() {
    // Subscribe to params and queryParams using combineLatest or separate subscriptions
    this.route.params.subscribe((params) => {
      const id = params['id'];
      if (id) this.loadCustomer(id);
    });

    this.route.queryParams.subscribe((params) => {
      const tab = params['tab'];
      // 'notas' is an alias for 'clinical' (backwards compat with external URLs)
      const resolvedTab = tab === 'notas' ? 'clinical' : tab;
      if (resolvedTab && ['ficha', 'clinical', 'agenda', 'billing', 'documents', 'team'].includes(resolvedTab)) {
        if (resolvedTab === 'clinical' && !this.isClinicalEnabled()) {
          this.setActiveTab('ficha');
        } else if (resolvedTab === 'agenda' && !this.isAgendaEnabled()) {
          this.setActiveTab('ficha');
        } else if (resolvedTab === 'billing' && !this.isBillingEnabled()) {
          this.setActiveTab('ficha');
        } else {
          this.setActiveTab(resolvedTab as any);
        }
      }
    });
  }

  loadCustomer(id: string) {
    this.isLoading.set(true);
    this.customersService.getCustomer(id).subscribe({
      next: (c) => {
        this.customer.set(c);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.toastService.error('Error al cargar perfil', 'Cliente no encontrado');
        this.isLoading.set(false);
      },
    });
  }

  setActiveTab(tab: 'ficha' | 'clinical' | 'agenda' | 'billing' | 'documents' | 'team') {
    const previousTab = this.activeTab();

    // Step-up MFA required to access clinical notes
    if (tab === 'clinical' && previousTab !== 'clinical') {
      const customerId = this.customer()?.id;
      this.auth.client.auth.mfa.listFactors().then(({ data }) => {
        const hasTOTP = (data?.totp ?? []).length > 0;
        if (hasTOTP) {
          // Require step-up verification within 30-minute window
          const MFA_STEPUP_TTL = 30 * 60 * 1000;
          const lastTs = parseInt(
            sessionStorage.getItem('mfa_stepup_clinical') ?? '0',
            10,
          );
          if (Date.now() - lastTs >= MFA_STEPUP_TTL) {
            const returnTo = this.router.url.includes('?')
              ? `${this.router.url}&tab=clinical`
              : `${this.router.url}?tab=clinical`;
            this.router.navigate(['/mfa-verify'], {
              state: { returnTo, stepUpArea: 'clinical' },
            });
            return;
          }
        }
        // TOTP not enrolled or recent step-up verified — allow access
        this.activeTab.set(tab);
        if (customerId) {
          this.auditLogger
            .logAction('VIEW_HEALTH_DATA', 'customer', customerId, {
              context: 'client_profile_tab',
              timestamp: new Date().toISOString(),
            })
            .then(() => console.log('Clinical Access Logged'))
            .catch((e) => console.error('Log Error', e));
        }
      });
      return;
    }

    this.activeTab.set(tab);

    // Security Log: Access to Health Data
    if (tab === 'clinical' && previousTab !== 'clinical' && this.customer()) {
      this.auditLogger
        .logAction('VIEW_HEALTH_DATA', 'customer', this.customer()!.id, {
          context: 'client_profile_tab',
          timestamp: new Date().toISOString(),
        })
        .then(() => console.log('Clinical Access Logged'))
        .catch((e) => console.error('Log Error', e));
    }
  }

  async deactivateCustomer() {
    const c = this.customer();
    if (!c) return;
    if (!await this.confirmModal.open({
      title: `¿Desactivar a ${c.name}?`,
      message: 'El cliente se marcará como inactivo. Podrás reactivarlo en cualquier momento.',
      confirmText: 'Desactivar',
      cancelText: 'Cancelar',
      icon: 'fa-user-slash',
      iconColor: 'amber'
    })) return;

    this.toastService.info('Desactivando...', 'Procesando');
    this.customersService.deactivateCustomer(c.id).subscribe({
      next: () => {
        this.toastService.success('Cliente desactivado correctamente', 'Éxito');
        this.loadCustomer(c.id);
      },
      error: (err) => {
        this.toastService.error(err?.message || 'Error al desactivar', 'Error');
      }
    });
  }

  async reactivateCustomer() {
    const c = this.customer();
    if (!c) return;
    if (!await this.confirmModal.open({
      title: `¿Reactivar a ${c.name}?`,
      message: 'El cliente volverá a estar activo y visible en la lista principal.',
      confirmText: 'Reactivar',
      cancelText: 'Cancelar',
      icon: 'fa-user-check',
      iconColor: 'green'
    })) return;

    this.toastService.info('Reactivando...', 'Procesando');
    this.customersService.reactivateCustomer(c.id).subscribe({
      next: () => {
        this.toastService.success('Cliente reactivado correctamente', 'Éxito');
        this.loadCustomer(c.id);
      },
      error: (err) => {
        this.toastService.error(err?.message || 'Error al reactivar', 'Error');
      }
    });
  }

  goBack() {
    this.location.back();
  }

  // Helpers
  getDisplayName(c: Customer): string {
    return c.client_type === 'business'
      ? c.business_name || c.name
      : `${c.name} ${c.surname}`.trim();
  }

  getInitials(c: Customer): string {
    const name = this.getDisplayName(c);
    return name.substring(0, 2).toUpperCase();
  }

  getAvatarGradient(c: Customer): string {
    const name = c.name + (c.surname || '');
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash % 360);
    return `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${(hue + 40) % 360}, 70%, 50%))`;
  }

  // ── Google Review helpers ──────────────────────────────────────────────────

  /**
   * Manually request a Google Review email to be sent to this client.
   * Only works if the client has marketing_consent=true.
   */
  requestGoogleReview() {
    const c = this.customer();
    if (!c) return;
    if (!c.marketing_consent) {
      this.toastService.warn(
        'El cliente no ha dado consentimiento para recibir comunicaciones de marketing',
        'Consentimiento requerido',
      );
      return;
    }

    this.sessionCloseService
      .requestGoogleReview(c.id, c.email, this.getDisplayName(c))
      .then(() => {
        this.toastService.success(
          'Email de Google Review enviado correctamente',
          'Review solicitado',
        );
      })
      .catch((err: any) => {
        this.toastService.error(err?.message || 'Error al enviar email de review', 'Error');
      });
  }

  /**
   * Mark that this client has left (or told staff they left) a Google Review.
   * Prevents the system from sending repeated review requests.
   */
  markHasLeftReview(hasLeft: boolean = true) {
    const c = this.customer();
    if (!c) return;

    this.sessionCloseService
      .markHasLeftReview(c.id, hasLeft)
      .then(() => {
        // Update local state
        this.customer.update((cust) =>
          cust ? { ...cust, has_left_google_review: hasLeft } : cust,
        );
        const msg = hasLeft ? 'Marcado como que ha dejado review' : 'Marcado como que NO ha dejado review';
        this.toastService.success(msg, 'Google Review');
      })
      .catch((err: any) => {
        this.toastService.error(err?.message || 'Error al actualizar estado de review', 'Error');
      });
  }
}
