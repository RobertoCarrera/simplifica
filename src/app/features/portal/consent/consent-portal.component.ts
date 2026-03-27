import { Component, OnInit, inject } from '@angular/core';

import { environment } from '../../../../environments/environment';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RuntimeConfigService } from '../../../services/runtime-config.service';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-consent-portal',
  standalone: true,
  imports: [FormsModule, TranslocoPipe],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div class="max-w-xl w-full space-y-6 bg-white p-6 rounded-lg shadow">
        <div class="text-center">
          <h1 class="text-2xl font-bold">{{ 'portal.consent.titulo' | transloco }}</h1>
          @if (!loaded) {
            <p class="text-gray-600">{{ 'portal.consent.cargandoSolicitud' | transloco }}</p>
          }
        </div>

        @if (loaded) {
          @if (error) {
            <div class="p-3 bg-red-50 text-red-700 rounded">{{ error }}</div>
          }
          @if (!error && !done) {
            <div class="space-y-4">
              <div class="text-sm text-gray-600 bg-blue-50 p-4 rounded-lg">
                <p><strong>{{ 'portal.consent.empresa' | transloco }}</strong> {{ companyName }}</p>
                <p><strong>{{ 'portal.consent.para' | transloco }}</strong> {{ clientName }} ({{ email }})</p>
                <p class="mt-2 text-xs">{{ purpose }}</p>
              </div>
              <div class="border-t pt-4">
                <h2 class="font-semibold mb-4 text-lg">{{ 'portal.consent.tusPreferencias' | transloco }}</h2>
                <div class="space-y-3">
                  <label
                    class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      [(ngModel)]="prefs.data_processing"
                      disabled
                      class="mt-1"
                    />
                    <div>
                      <span class="font-medium block">{{ 'portal.consent.tratamientoDatos' | transloco }}</span>
                      <span class="text-sm text-gray-500"
                        >{{ 'portal.consent.tratamientoDatosDesc' | transloco }}</span
                      >
                    </div>
                  </label>
                  <label
                    class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <input type="checkbox" [(ngModel)]="prefs.marketing" class="mt-1" />
                    <div>
                      <span class="font-medium block">{{ 'portal.consent.comunicacionesComerciales' | transloco }}</span>
                      <span class="text-sm text-gray-500"
                        >{{ 'portal.consent.comunicacionesDesc' | transloco }}</span
                      >
                    </div>
                  </label>
                </div>
                <div class="mt-4 text-xs text-gray-500">
                  <p>
                    {{ 'portal.consent.avisoAceptar' | transloco }}
                  </p>
                </div>
              </div>
              <div class="flex flex-col sm:flex-row gap-3 pt-4">
                <button
                  (click)="accept()"
                  [disabled]="busy"
                  class="flex-1 px-4 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  @if (busy) {
                    <span class="animate-spin text-lg">⟳</span>
                  }
                  <span>{{ 'portal.consent.aceptarValidar' | transloco }}</span>
                </button>
                <button
                  (click)="decline()"
                  [disabled]="busy"
                  class="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {{ 'portal.consent.rechazarTodo' | transloco }}
                </button>
              </div>
            </div>
          }
          @if (done) {
            <div class="text-center py-8">
              <div class="text-5xl mb-4">✅</div>
              <h2 class="text-xl font-bold text-gray-900 mb-2">{{ 'portal.consent.gracias' | transloco }}</h2>
              <p class="text-gray-600">{{ 'portal.consent.preferenciasRegistradas' | transloco }}</p>
              <p class="text-sm text-gray-500 mt-4">{{ 'portal.consent.puedesCerrar' | transloco }}</p>
            </div>
          }
        }
      </div>

      <!-- Legal Shielding Footer -->
      <div class="max-w-xl w-full mt-6 text-xs text-gray-500">
        <h4 class="font-bold mb-2 uppercase text-[10px] tracking-wider text-gray-400 text-center">
          {{ 'portal.consent.infoProteccion' | transloco }}
        </h4>
        <div class="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
          <table class="w-full text-left border-collapse">
            <tr class="border-b border-gray-100">
              <td class="py-1.5 pr-2 font-bold w-24 align-top text-gray-700">{{ 'portal.consent.responsable' | transloco }}</td>
              <td class="py-1.5">{{ companyName || ('portal.consent.responsableDefault' | transloco) }}</td>
            </tr>
            <tr class="border-b border-gray-100">
              <td class="py-1.5 pr-2 font-bold align-top text-gray-700">{{ 'portal.consent.finalidad' | transloco }}</td>
              <td class="py-1.5">{{ 'portal.consent.finalidadDesc' | transloco }}</td>
            </tr>
            <tr class="border-b border-gray-100">
              <td class="py-1.5 pr-2 font-bold align-top text-gray-700">{{ 'portal.consent.legitimacion' | transloco }}</td>
              <td class="py-1.5">{{ 'portal.consent.legitimacionDesc' | transloco }}</td>
            </tr>
            <tr class="border-b border-gray-100">
              <td class="py-1.5 pr-2 font-bold align-top text-gray-700">{{ 'portal.consent.destinatarios' | transloco }}</td>
              <td class="py-1.5">{{ 'portal.consent.destinatariosDesc' | transloco }}</td>
            </tr>
            <tr>
              <td class="py-1.5 pr-2 font-bold align-top text-gray-700">{{ 'portal.consent.derechos' | transloco }}</td>
              <td class="py-1.5">{{ 'portal.consent.derechosDesc' | transloco }}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Footer with DPO Contact -->
      <div class="max-w-xl w-full mt-6 text-center">
        <p class="text-xs text-gray-500">
          {{ 'portal.consent.contactoDPO' | transloco }}
          <a
            [href]="'mailto:' + dpoEmail"
            class="font-medium text-blue-600 hover:text-blue-800 hover:underline"
          >
            {{ dpoEmail }}
          </a>
        </p>
        <div class="mt-2 text-[10px] text-gray-400">
          &copy; {{ currentYear }} {{ companyName || 'Simplifica CRM' }}. {{ 'portal.consent.todosDerechos' | transloco }}
        </div>
      </div>
    </div>
  `,
})
export class ConsentPortalComponent implements OnInit {
  private route = inject(ActivatedRoute);

  token = '';
  loaded = false;
  error = '';
  busy = false;

  clientName = '';
  email = '';
  companyName = '';
  purpose = '';
  done = false;

  prefs = {
    data_processing: true, // Always true/required
    marketing: false,
  };

  dpoEmail = environment.gdpr.dpoEmail;
  currentYear = new Date().getFullYear();

  ngOnInit() {
    this.route.queryParams.subscribe(async (params) => {
      this.token = params['token'] || params['t'] || ''; // Support 'token' or 't'
      if (!this.token) {
        this.error = 'Enlace inválido o incompleto.';
        this.loaded = true;
        return;
      }

      await this.loadRequest();
    });
  }

  async loadRequest() {
    this.busy = true;
    // RPC: get_client_consent_request(p_token)
    const { data, error } = await this.restRpc('get_client_consent_request', {
      p_token: this.token,
    });
    this.busy = false;
    this.loaded = true;

    if (error || !data?.success) {
      console.error('Error loading consent request:', error || data?.error);
      this.error = data?.error || 'No se pudo cargar la solicitud. El enlace puede haber expirado.';
      return;
    }

    this.email = data.subject_email;
    this.clientName = data.client_name;
    this.companyName = data.company_name;
    this.purpose = data.purpose;
  }

  async accept() {
    this.busy = true;
    this.error = '';

    // RPC: process_client_consent(p_token, p_marketing_consent, p_ip, p_user_agent)
    const payload = {
      p_token: this.token,
      p_marketing_consent: this.prefs.marketing,
      p_health_data_consent: this.prefs.data_processing, // Helper mapping or distinct field
      p_privacy_policy_consent: true, // Implicit acceptance via button click
      p_ip: 'client-ip',
      p_user_agent: navigator.userAgent,
    };

    const { data, error } = await this.restRpc('process_client_consent', payload);
    this.busy = false;

    if (error || !data?.success) {
      console.error('Error accepting consent:', error || data?.error);
      this.error =
        data?.error || 'Hubo un error al guardar tus preferencias. Por favor intenta de nuevo.';
      return;
    }

    this.done = true;
  }

  async decline() {
    if (
      !confirm(
        '¿Estás seguro de que deseas rechazar el consentimiento? Esto podría limitar los servicios que podemos ofrecerte.',
      )
    ) {
      return;
    }

    this.busy = true;
    this.error = '';

    // RPC: reject_client_consent(p_token, p_ip, p_user_agent)
    const payload = {
      p_token: this.token,
      p_ip: 'client-ip',
      p_user_agent: navigator.userAgent,
    };

    const { data, error } = await this.restRpc('reject_client_consent', payload);
    this.busy = false;

    if (error || !data?.success) {
      console.error('Error rejecting consent:', error || data?.error);
      this.error = data?.error || 'Hubo un error al procesar tu solicitud.';
      return;
    }

    this.done = true;
  }

  private async restRpc(fnName: string, payload: any): Promise<{ data: any; error: any }> {
    const cfg = inject(RuntimeConfigService).get();
    const url = `${cfg.supabase.url}/rest/v1/rpc/${fnName}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          apikey: cfg.supabase.anonKey,
          Authorization: `Bearer ${cfg.supabase.anonKey}`,
        },
        body: JSON.stringify(payload),
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        return { data: null, error: body || res.statusText };
      }
      return { data: body, error: null };
    } catch (e) {
      return { data: null, error: e };
    }
  }
}
