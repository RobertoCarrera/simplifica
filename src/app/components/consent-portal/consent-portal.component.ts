import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-consent-portal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div class="max-w-xl w-full space-y-6 bg-white p-6 rounded-lg shadow">
        <div class="text-center">
          <h1 class="text-2xl font-bold">Gestión de Consentimiento</h1>
          <p class="text-gray-600" *ngIf="!loaded">Cargando solicitud…</p>
        </div>

        <ng-container *ngIf="loaded">
          <div *ngIf="error" class="p-3 bg-red-50 text-red-700 rounded">{{ error }}</div>

          <ng-container *ngIf="!error">
            <div class="space-y-2">
              <div class="text-sm text-gray-600">Empresa: <strong>{{ companyName }}</strong></div>
              <div class="text-sm text-gray-600">Para: <strong>{{ email }}</strong></div>
              <div class="text-sm text-gray-600" *ngIf="purpose">Propósito: {{ purpose }}</div>
              <div class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2" *ngIf="!linkedToClient">
                Nota: esta solicitud no está vinculada a un cliente interno. Se registrará el consentimiento por email, pero los campos rápidos del cliente no se actualizarán automáticamente.
              </div>
            </div>

            <div class="border-t pt-4">
              <h2 class="font-semibold mb-2">Selecciona tus preferencias</h2>
              <label class="flex items-center gap-2 mb-2">
                <input type="checkbox" [(ngModel)]="prefs.data_processing"> Tratamiento de datos (necesario para el servicio)
              </label>
              <label class="flex items-center gap-2 mb-2">
                <input type="checkbox" [(ngModel)]="prefs.marketing"> Marketing y comunicaciones
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" [(ngModel)]="prefs.analytics"> Analítica y mejoras
              </label>
            </div>

            <div class="flex gap-3 pt-4">
              <button (click)="accept()" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Aceptar</button>
              <button (click)="decline()" class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Rechazar</button>
            </div>

            <div *ngIf="done" class="p-3 bg-green-50 text-green-700 rounded">Preferencias guardadas. Ya puedes cerrar esta página.</div>
          </ng-container>
        </ng-container>
      </div>
    </div>
  `
})
export class ConsentPortalComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private sb = inject(SupabaseClientService).instance;

  token = '';
  loaded = false;
  error = '';
  email = '';
  companyName = '';
  purpose = '';
  done = false;
  linkedToClient = false;
  prefs: any = { data_processing: false, marketing: false, analytics: false };

  ngOnInit() {
    this.route.queryParams.subscribe(async params => {
      this.token = params['t'] || '';
      if (!this.token) { this.error = 'Enlace inválido'; this.loaded = true; return; }
      const { data, error } = await this.sb.rpc('gdpr_get_consent_request', { p_token: this.token });
      if (error || !data?.success) {
        this.error = 'Solicitud no válida o expirada';
      } else {
        this.email = data.subject_email;
        this.companyName = data.company_name;
        this.purpose = data.purpose || '';
        this.linkedToClient = !!data.client_id;
        // default: data_processing true if requested
        if ((data.consent_types as string[]).includes('data_processing')) this.prefs.data_processing = true;
      }
      this.loaded = true;
    });
  }

  async accept() {
    const { data, error } = await this.sb.rpc('gdpr_accept_consent', {
      p_token: this.token,
      p_preferences: this.prefs,
      p_evidence: { user_agent: navigator.userAgent }
    });
    if (error || !data?.success) {
      this.done = false;
      this.error = 'No se pudo guardar el consentimiento';
    } else {
      this.done = true;
      this.error = '';
    }
  }

  async decline() {
    const { data, error } = await this.sb.rpc('gdpr_decline_consent', {
      p_token: this.token,
      p_evidence: { user_agent: navigator.userAgent }
    });
    if (error || !data?.success) {
      this.done = false;
      this.error = 'No se pudo registrar el rechazo';
    } else {
      this.done = true;
      this.error = '';
    }
  }
}
