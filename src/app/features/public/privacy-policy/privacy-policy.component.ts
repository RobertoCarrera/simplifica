import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-privacy-policy',
    standalone: true,
    imports: [CommonModule, RouterLink],
    template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 dark:text-gray-100">
        <div class="mb-8 border-b border-gray-200 dark:border-gray-700 pb-4">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Política de Privacidad</h1>
          <p class="text-gray-500 dark:text-gray-400">Última actualización: {{ currentDate | date:'longDate' }}</p>
        </div>

        <div class="prose dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">1. Responsable del Tratamiento</h2>
            <p class="text-gray-600 dark:text-gray-300">
              En cumplimiento del Reglamento (UE) 2016/679 (RGPD), le informamos que sus datos personales serán tratados por la empresa gestora de esta plataforma.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">2. Finalidad del Tratamiento</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Tratamos la información que nos facilita con el fin de prestarle el servicio solicitado, realizar la facturación del mismo y mantenerle informado sobre nuestros servicios.
            </p>
            <ul class="list-disc list-inside mt-2 text-gray-600 dark:text-gray-300 ml-4">
              <li>Gestión de clientes y facturación.</li>
              <li>Envío de comunicaciones comerciales (bajo consentimiento).</li>
              <li>Soporte técnico y atención al cliente.</li>
            </ul>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">3. Conservación de Datos</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Los datos proporcionados se conservarán mientras se mantenga la relación comercial o durante los años necesarios para cumplir con las obligaciones legales.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">4. Destinatarios</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Los datos no se cederán a terceros salvo en los casos en que exista una obligación legal.
            </p>
          </section>

          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">5. Derechos</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Usted tiene derecho a obtener confirmación sobre si estamos tratando sus datos personales, por tanto tiene derecho a acceder a sus datos, rectificar los inexactos o solicitar su supresión cuando los datos ya no sean necesarios.
            </p>
            <p class="mt-2 text-gray-600 dark:text-gray-300">
              Puede ejercer sus derechos de acceso, rectificación, portabilidad, supresión y oposición enviando un email o a través de nuestro portal de gestión de derechos.
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
export class PrivacyPolicyComponent {
    currentDate = new Date();
}
