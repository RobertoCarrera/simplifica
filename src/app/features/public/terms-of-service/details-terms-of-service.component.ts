import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-details-terms-of-service',
    standalone: true,
    imports: [CommonModule, RouterLink],
    template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 dark:text-gray-100">
        <div class="mb-8 border-b border-gray-200 dark:border-gray-700 pb-4">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Términos de Servicio</h1>
          <p class="text-gray-500 dark:text-gray-400">Última actualización: {{ currentDate | date:'longDate' }}</p>
        </div>

        <div class="prose dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">1. Aceptación de los Términos</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Al acceder y utilizar la plataforma Simplifica CRM, usted acepta estar sujeto a estos Términos de Servicio y a todas las leyes y regulaciones aplicables. Si no está de acuerdo con alguno de estos términos, tiene prohibido usar o acceder a este sitio.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">2. Descripción del Servicio</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Simplifica CRM proporciona una plataforma de gestión de relaciones con clientes, gestión de proyectos, facturación y servicios relacionados (el "Servicio"). Nos reservamos el derecho de modificar, suspender o discontinuar el Servicio en cualquier momento, con o sin previo aviso.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">3. Cuentas de Usuario</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Para utilizar ciertas funciones del Servicio, debe registrarse para obtener una cuenta. Usted es responsable de mantener la confidencialidad de su cuenta y contraseña, y de restringir el acceso a su computadora. Acepta asumir la responsabilidad de todas las actividades que ocurran bajo su cuenta.
            </p>
          </section>

           <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">4. Uso Aceptable</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Usted se compromete a no utilizar el Servicio para:
            </p>
            <ul class="list-disc list-inside mt-2 text-gray-600 dark:text-gray-300 ml-4">
              <li>Cargar, publicar o transmitir contenido ilegal, dañino, amenazante o abusivo.</li>
              <li>Violar cualquier ley local, estatal, nacional o internacional aplicable.</li>
              <li>Intentar obtener acceso no autorizado a los sistemas o redes de Simplifica CRM.</li>
              <li>Recopilar o almacenar datos personales de otros usuarios sin su consentimiento.</li>
            </ul>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">5. Propiedad Intelectual</h2>
            <p class="text-gray-600 dark:text-gray-300">
              El Servicio y su contenido original, características y funcionalidad son y seguirán siendo propiedad exclusiva de Simplifica CRM y sus licenciantes. El Servicio está protegido por derechos de autor, marcas registradas y otras leyes.
            </p>
          </section>
          
           <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">6. Privacidad y Protección de Datos</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Su uso del Servicio también se rige por nuestra <a routerLink="/privacy-policy" class="text-blue-600 hover:underline">Política de Privacidad</a>. Simplifica CRM cumple con el RGPD y garantiza la seguridad y confidencialidad de sus datos.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">7. Limitación de Responsabilidad</h2>
            <p class="text-gray-600 dark:text-gray-300">
              En ningún caso Simplifica CRM, ni sus directores, empleados, socios, agentes, proveedores o afiliados, serán responsables por daños indirectos, incidentales, especiales, consecuentes o punitivos, incluyendo sin limitación, pérdida de beneficios, datos, uso, buena voluntad u otras pérdidas intangibles.
            </p>
          </section>
          
           <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">8. Terminación</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Podemos cancelar o suspender su cuenta inmediatamente, sin previo aviso o responsabilidad, por cualquier motivo, incluso si usted incumple los Términos.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">9. Ley Aplicable</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Estos Términos se regirán e interpretarán de acuerdo con las leyes de España, sin tener en cuenta sus disposiciones sobre conflictos de leyes.
            </p>
          </section>
        </div>

        <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
           <a routerLink="/" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">
            &larr; Volver a Inicio
          </a>
        </div>
      </div>
    </div>
  `
})
export class DetailsTermsOfServiceComponent {
    currentDate = new Date();
}
