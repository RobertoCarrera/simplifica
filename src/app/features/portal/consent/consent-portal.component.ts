import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { RuntimeConfigService } from '../../../services/runtime-config.service';

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

  token = '';
  loaded = false;
  error = '';
  // Capture last RPC response for debugging in UI
  lastRpcResponse: any = null;
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
      // Diagnostic: only log navigator.locks availability here.
      // Avoid touching the Supabase auth client from the public portal because
      // calling auth.getSession() can trigger navigator.lock acquisitions and
      // produce LockAcquireTimeoutError when a Service Worker or another
      // context holds the lock (this was causing intermittent failures).
      try {
        console.log('ConsentPortal: navigator.locks available?', !!(navigator as any).locks);
      } catch (diagErr) {
        console.warn('ConsentPortal: error leyendo estado de locks', diagErr);
      }

      const { data, error } = await this.doRpcWithRetries('gdpr_get_consent_request', { p_token: this.token });
      const normalized = this.normalizeRpcPayload(data);
      this.lastRpcResponse = { fn: 'gdpr_get_consent_request', raw: { data, error }, normalized };
      if (error || !normalized?.success) {
        console.error('ConsentPortal: gdpr_get_consent_request failed', { error, data, normalized });
        this.error = 'Solicitud no válida o expirada';
      } else {
        this.email = normalized.subject_email;
        this.companyName = normalized.company_name;
        this.purpose = normalized.purpose || '';
        this.linkedToClient = !!normalized.client_id;
        // default: data_processing true if requested
        if ((normalized.consent_types as string[]).includes('data_processing')) this.prefs.data_processing = true;
      }
      this.loaded = true;
    });
  }

  async accept() {
    const payload = {
      p_token: this.token,
      p_preferences: this.prefs,
      p_evidence: { user_agent: navigator.userAgent }
    };

    const { data, error } = await this.doRpcWithRetries('gdpr_accept_consent', payload);
    const normalized = this.normalizeRpcPayload(data);
    this.lastRpcResponse = { fn: 'gdpr_accept_consent', raw: { data, error }, normalized };
    console.log('ConsentPortal: gdpr_accept_consent response', { data, error, normalized });

    // Only treat as failure if there's an explicit error or explicit failure indication
    const hasExplicitFailure = normalized && (
      normalized.success === false ||
      (normalized.error != null) ||
      ['error', 'failed', 'invalid', 'expired', 'rejected'].includes(String((normalized.status || '')).toLowerCase())
    );

    if (error || hasExplicitFailure) {
      console.error('ConsentPortal: gdpr_accept_consent failed', { error, data, normalized, hasExplicitFailure });
      this.done = false;
      const errMsg = (error && (error.message || (error as any).msg || (error as any).error)) || '';
      if (String(errMsg).includes('LockAcquireTimeoutError') || String(errMsg).includes('lock:sb-main-auth-token')) {
        this.error = 'Problema temporal con el token de sesión (navigator.lock). Intenta recargar la página en unos segundos.';
      } else {
        this.error = 'No se pudo guardar el consentimiento';
      }
    } else {
      this.done = true;
      this.error = '';
    }
  }

  async decline() {
    const payload = { p_token: this.token, p_evidence: { user_agent: navigator.userAgent } };
    const { data, error } = await this.doRpcWithRetries('gdpr_decline_consent', payload);
    const normalized = this.normalizeRpcPayload(data);
    this.lastRpcResponse = { fn: 'gdpr_decline_consent', raw: { data, error }, normalized };
    console.log('ConsentPortal: gdpr_decline_consent response', { data, error, normalized });

    // Only treat as failure if there's an explicit error or explicit failure indication
    const hasExplicitFailureDecline = normalized && (
      normalized.success === false ||
      (normalized.error != null) ||
      ['error', 'failed', 'invalid', 'expired', 'rejected'].includes(String((normalized.status || '')).toLowerCase())
    );

    if (error || hasExplicitFailureDecline) {
      console.error('ConsentPortal: gdpr_decline_consent failed', { error, data, normalized, hasExplicitFailureDecline });
      this.done = false;
      const errMsg = (error && (error.message || (error as any).msg || (error as any).error)) || '';
      if (String(errMsg).includes('LockAcquireTimeoutError') || String(errMsg).includes('lock:sb-main-auth-token')) {
        this.error = 'Problema temporal con el token de sesión (navigator.lock). Intenta recargar la página en unos segundos.';
      } else {
        this.error = 'No se pudo registrar el rechazo';
      }
    } else {
      this.done = true;
      this.error = '';
    }
  }

  // Normalize and detect success across common RPC response shapes
  private isRpcFailure(data: any): boolean {
    // Treat as failure only when explicit signals indicate it.
    // Accept common nested shapes returned by RPC endpoints, for example:
    // - { success: true, ... }
    // - { status: 'accepted' }
    // - { data: {...}, error: null }
    // - [{ ... }]
    if (data == null) return false; // assume success if backend didn't return explicit result

    // If wrapper with explicit 'error' key
    if (typeof data === 'object' && 'error' in data) {
      if (data.error) return true;
      // if there's nested `.data` and that contains an explicit error
      if (data.data && typeof data.data === 'object' && ('error' in data.data) && data.data.error) return true;
      // otherwise treat as success
      return false;
    }

    if (typeof data === 'boolean') return data === false;

    if (Array.isArray(data)) {
      // Failure if any element explicitly says failure
      return data.some(d => d && (
        (d.success === false) ||
        (typeof d.error !== 'undefined' && d.error != null) ||
        ['error', 'failed', 'invalid', 'expired', 'rejected'].includes(String((d.status || '')).toLowerCase())
      ));
    }

    // Plain object: check explicit flags
    if ((data as any).success === false) return true;
    const status = String((data && (data.status || '')) || '').toLowerCase();
    if (['error', 'failed', 'invalid', 'expired', 'rejected'].includes(status)) return true;

    // No explicit failure detected -> assume success
    return false;
  }

  // Unwrap common RPC wrapper shapes and return the inner payload used by our functions
  private normalizeRpcPayload(payload: any): any {
    if (payload == null) return payload;
    // If it's an object with { data, error }
    if (typeof payload === 'object' && ('data' in payload || 'error' in payload)) {
      if (payload.data !== undefined) return payload.data;
      // nothing in data -> return payload as-is
      return payload;
    }
    // If an array with single element, return that element
    if (Array.isArray(payload) && payload.length === 1) return payload[0];
    return payload;
  }

  // Helper: attempt rpc calls with retries when navigator lock acquisition fails (common in auth token refresh race)
  private async doRpcWithRetries(fnName: string, payload: any, retries = 3, delayMs = 400): Promise<any> {
    let lastErr: any = null;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const result = await this.restRpc(fnName, payload);
        // rest rpc returns { data, error }
        if (result && result.error) {
          lastErr = result.error;
          return result;
        }
        return result;
      } catch (err: any) {
        lastErr = err;
        console.error(`ConsentPortal: rpc ${fnName} threw`, err);
        return { data: null, error: err };
      }
    }
    return { data: null, error: lastErr };
  }

  private async restRpc(fnName: string, payload: any): Promise<{ data: any; error: any }> {
    const cfg = inject(RuntimeConfigService).get();
    const url = `${cfg.supabase.url}/rest/v1/rpc/${fnName}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'apikey': cfg.supabase.anonKey,
          'Authorization': `Bearer ${cfg.supabase.anonKey}`
        },
        body: JSON.stringify(payload)
      });
      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const body = isJson ? await res.json() : await res.text();
      if (!res.ok) {
        return { data: null, error: body || res.statusText };
      }
      return { data: body, error: null };
    } catch (e) {
      return { data: null, error: e };
    }
  }
}
