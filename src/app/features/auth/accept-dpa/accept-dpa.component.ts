import { Component, inject, signal, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { AuthService } from "../../../services/auth.service";
import { SupabaseClientService } from "../../../services/supabase-client.service";

@Component({
  selector: "app-accept-dpa",
  standalone: true,
  imports: [FormsModule],
  template: `
    <div
      class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors duration-200"
    >
      <div class="sm:mx-auto sm:w-full sm:max-w-2xl">
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
            <i class="fas fa-file-contract text-2xl text-blue-600 dark:text-blue-400"></i>
          </div>
          <h2 class="text-3xl font-extrabold text-gray-900 dark:text-white">
            Contrato de Encargado de Tratamiento
          </h2>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Para cumplir con el Art. 28 del RGPD, necesitás leer y aceptar este acuerdo antes de acceder a SimplificaCRM.
          </p>
        </div>
      </div>

      <div class="sm:mx-auto sm:w-full sm:max-w-2xl">
        <div class="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10 transition-colors duration-200">

          <!-- DPA Summary -->
          <div
            class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-6"
          >
            <div class="bg-gray-50 dark:bg-gray-700/50 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">
                DPA SimplificaCRM v1.1
              </span>
              <span class="text-xs text-gray-400">RGPD Art. 28</span>
            </div>
            <div
              class="h-56 overflow-y-auto p-4 text-xs text-gray-700 dark:text-gray-300 leading-relaxed space-y-3"
              (scroll)="onScroll($event)"
            >
              <p class="font-semibold text-gray-900 dark:text-white">CONTRATO DE ENCARGADO DEL TRATAMIENTO</p>

              <p><strong>Responsable del Tratamiento (RT):</strong> La empresa / profesional que usa SimplificaCRM (en adelante, "El Cliente").</p>
              <p><strong>Encargado del tratamiento (ET):</strong> Roberto Carrera Santa María, NIF 45127276B, con domicilio a efectos de notificaciones en dpo@simplificacrm.es (en adelante, "SimplificaCRM").</p>

              <p><strong>1. Objeto y ámbito.</strong> El ET tratará datos personales por cuenta del RT, exclusivamente para prestar el servicio de gestión de clientes, reservas, facturación y comunicaciones digitales que configura el RT en la plataforma SimplificaCRM.</p>

              <p><strong>2. Instrucciones del RT.</strong> El ET tratará los datos conforme a las instrucciones documentadas del RT. Si el ET considera que una instrucción infringe el RGPD, deberá informar al RT de inmediato.</p>

              <p><strong>3. Confidencialidad.</strong> El ET garantiza que las personas autorizadas para tratar los datos personales se han comprometido a la confidencialidad o están sujetas a obligaciones legales de confidencialidad.</p>

              <p><strong>4. Seguridad.</strong> El ET adoptará las medidas técnicas y organizativas apropiadas conforme al Art. 32 RGPD para garantizar un nivel de seguridad adecuado al riesgo (cifrado en tránsito y en reposo, control de acceso, monitorización de incidentes).</p>

              <p><strong>5. Subencargados.</strong> El RT autoriza el uso de los siguientes subencargados: <em>Supabase Inc.</em> (infraestructura de base de datos y almacenamiento, EU region); <em>Amazon Web Services EMEA SARL</em> (procesamiento de comunicaciones entrantes). Se notificará al RT con antelación cualquier cambio en la lista de subencargados.</p>

              <p><strong>6. Derechos de los interesados.</strong> El ET asistirá al RT en el cumplimiento de las obligaciones de respuesta a los derechos de acceso, rectificación, supresión, limitación, portabilidad y oposición de los interesados, dentro de los plazos legales.</p>

              <p><strong>7. Violaciones de seguridad.</strong> El ET notificará al RT, sin dilación indebida y en todo caso en un plazo máximo de 72 horas desde que tenga conocimiento de ella, cualquier violación de la seguridad de los datos personales.</p>

              <p><strong>8. EIPD.</strong> El ET asistirá al RT cuando proceda en la realización de evaluaciones de impacto relativas a la protección de datos (DPIA) y en la consulta previa a la autoridad de control.</p>

              <p><strong>9. Supresión o devolución de datos.</strong> A elección del RT, el ET suprimirá o devolverá todos los datos personales una vez finalice la prestación del servicio, salvo que una ley de la UE o de un Estado miembro exija la conservación de los datos.</p>

              <p><strong>10. Auditorías.</strong> El ET pondrá a disposición del RT toda la información necesaria para demostrar el cumplimiento de las obligaciones establecidas en el Art. 28 RGPD, y permitirá y contribuirá a la realización de auditorías e inspecciones.</p>

              <p><strong>11. Vigencia y ley aplicable.</strong> Este acuerdo es válido mientras el RT sea usuario de SimplificaCRM. Se rige por el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD). Para cualquier controversia, las partes se someten a los juzgados y tribunales de Madrid capital.</p>

              <p class="text-gray-400 pt-2">Versión 1.1 — Revisado el 06/04/2026. Incluye actualización de subencargados (Docplanner Group S.A.).</p>
            </div>
          </div>

          @if (error()) {
            <div class="rounded-md bg-red-50 dark:bg-red-900/30 p-4 mb-4">
              <p class="text-sm text-red-800 dark:text-red-300">{{ error() }}</p>
            </div>
          }

          <!-- Acceptance checkbox -->
          <div class="flex items-start gap-3 mb-6">
            <input
              id="dpaAccepted"
              name="dpaAccepted"
              type="checkbox"
              [(ngModel)]="dpaAccepted"
              class="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <label for="dpaAccepted" class="text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
              He leído y acepto el <strong>Contrato de Encargado del Tratamiento (DPA)</strong> entre mi empresa y SimplificaCRM, de acuerdo con el Art. 28 del RGPD. Entiendo que este acuerdo es legalmente vinculante.
            </label>
          </div>

          <!-- Actions -->
          <div class="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              (click)="acceptDpa()"
              [disabled]="!dpaAccepted || loading()"
              class="flex-1 flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              @if (loading()) {
                <i class="fas fa-spinner fa-spin"></i>
                <span>Registrando aceptación...</span>
              } @else {
                <i class="fas fa-check"></i>
                <span>Aceptar y entrar a SimplificaCRM</span>
              }
            </button>
            <button
              type="button"
              (click)="logout()"
              class="sm:w-auto flex justify-center py-2.5 px-4 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline transition-colors"
            >
              Rechazar y cerrar sesión
            </button>
          </div>

        </div>
      </div>
    </div>
  `,
})
export class AcceptDpaComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private supabase = inject(SupabaseClientService).instance;

  dpaAccepted = false;
  loading = signal(false);
  error = signal<string | null>(null);

  async ngOnInit() {
    // If user already has a DPA signature, skip ahead
    const companyId = this.auth.companyId();
    if (companyId) {
      const { data } = await this.supabase
        .from('dpa_signatures')
        .select('id')
        .eq('company_id', companyId)
        .limit(1)
        .maybeSingle();
      if (data) {
        this.router.navigate(['/inicio']);
      }
    }
  }

  onScroll(_event: Event) {
    // Could mark "scrolled to bottom" here — for now just a hook
  }

  async acceptDpa() {
    if (!this.dpaAccepted) return;

    const companyId = this.auth.companyId();
    if (!companyId) {
      this.error.set('No se pudo determinar la empresa. Por favor recargá la página.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const { error } = await this.supabase
        .from('dpa_signatures')
        .insert({
          company_id: companyId,
          dpa_version: '1.1',
        });

      if (error) throw error;

      this.router.navigate(['/inicio']);
    } catch (e: any) {
      console.error('[AcceptDpa] Error saving DPA signature:', e);
      this.error.set(e.message || 'Error al registrar la aceptación. Por favor intentá de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async logout() {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
