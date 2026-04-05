import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-aviso-legal',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 dark:text-gray-100">
        <div class="mb-8 border-b border-gray-200 dark:border-gray-700 pb-4">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">Aviso Legal</h1>
          <p class="text-gray-500 dark:text-gray-400">Última actualización: 6 de abril de 2026</p>
        </div>

        <div class="prose dark:prose-invert max-w-none space-y-8">

          <!-- 1. TITULAR -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">1. Titular del Sitio Web</h2>
            <p class="text-gray-600 dark:text-gray-300">
              En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de servicios de la sociedad de la información y de comercio electrónico (LSSI-CE), se informa de los datos identificativos del titular:
            </p>
            <ul class="mt-3 space-y-2 text-gray-600 dark:text-gray-300">
              <li><strong>Denominación:</strong> Roberto Carrera Santa María (profesional autónomo)</li>
              <li><strong>NIF:</strong> 45127276B</li>
              <li><strong>Domicilio:</strong> C/Pisuerga 32, Bajo 1.ª, 43882 Segur de Calafell, Tarragona, España</li>
              <li><strong>Correo electrónico:</strong> <a href="mailto:dpo@simplificacrm.es" class="text-blue-600 dark:text-blue-400 hover:underline">dpo@simplificacrm.es</a></li>
              <li><strong>Sitio web:</strong> <a href="https://simplificacrm.es" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline">simplificacrm.es</a></li>
              <li><strong>Actividad:</strong> Prestación de servicios de software CRM para centros de bienestar, salud y estética (SaaS).</li>
              <li><strong>Registro:</strong> Como persona física autónoma, no figura inscrito en el Registro Mercantil.</li>
            </ul>
          </section>

          <!-- 2. OBJETO -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">2. Objeto y Ámbito de Aplicación</h2>
            <p class="text-gray-600 dark:text-gray-300">
              El presente Aviso Legal regula el acceso y uso del sitio web <strong>simplificacrm.es</strong> y sus subdominios asociados (portal.simplificacrm.es, agenda.simplificacrm.es), así como de la aplicación web SimplificaCRM.
            </p>
            <p class="mt-2 text-gray-600 dark:text-gray-300">
              El acceso y la utilización del sitio web implica la aceptación plena y sin reservas de todas las disposiciones incluidas en este Aviso Legal, así como en la
              <a routerLink="/privacy" class="text-blue-600 dark:text-blue-400 hover:underline">Política de Privacidad</a> y en los
              <a routerLink="/terms-of-service" class="text-blue-600 dark:text-blue-400 hover:underline">Términos de Servicio</a>.
            </p>
          </section>

          <!-- 3. PROPIEDAD INTELECTUAL -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">3. Propiedad Intelectual e Industrial</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Todos los contenidos del sitio web — incluyendo, de forma enunciativa y no limitativa, diseño, código fuente, textos, gráficos, logotipos, iconos, imágenes, archivos de audio y vídeo, marcas y nombres comerciales — son propiedad exclusiva de Roberto Carrera Santa María o de terceros que han autorizado su uso, y están protegidos por la legislación española e internacional sobre propiedad intelectual e industrial.
            </p>
            <p class="mt-2 text-gray-600 dark:text-gray-300">
              Queda expresamente prohibida cualquier reproducción, distribución, comunicación pública, transformación o cualquier otra forma de explotación total o parcial de estos contenidos sin autorización escrita expresa del titular.
            </p>
          </section>

          <!-- 4. CONDICIONES DE ACCESO Y USO -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">4. Condiciones de Acceso y Uso</h2>
            <p class="text-gray-600 dark:text-gray-300">
              El usuario se compromete a utilizar el sitio web de conformidad con la ley, la moral, el orden público y el presente Aviso Legal, absteniéndose de utilizarlo con fines ilícitos o que puedan dañar los derechos e intereses de terceros.
            </p>
            <p class="mt-2 text-gray-600 dark:text-gray-300">
              En particular, queda prohibido: (a) usar el servicio para actividades ilegales; (b) transmitir malware o código dañino; (c) realizar accesos no autorizados a sistemas; (d) realizar scraping o extracción masiva de datos; (e) suplantar la identidad de terceros.
            </p>
          </section>

          <!-- 5. EXCLUSIÓN DE RESPONSABILIDAD -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">5. Exclusión de Responsabilidad</h2>
            <p class="text-gray-600 dark:text-gray-300">
              SimplificaCRM no garantiza la disponibilidad y continuidad ininterrumpida del funcionamiento del sitio web. Tampoco garantiza la ausencia de virus u otros elementos en los contenidos que puedan producir alteraciones en el sistema informático del usuario.
            </p>
            <p class="mt-2 text-gray-600 dark:text-gray-300">
              SimplificaCRM no se responsabiliza de los daños y perjuicios causados por decisiones adoptadas en base a la información facilitada en el sitio web, salvo en aquellos casos en que la ley así lo exija. Los niveles de disponibilidad y soporte garantizados se regulan en los <a routerLink="/terms-of-service" class="text-blue-600 dark:text-blue-400 hover:underline">Términos de Servicio</a>.
            </p>
          </section>

          <!-- 6. ENLACES A TERCEROS -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">6. Enlaces a Sitios de Terceros</h2>
            <p class="text-gray-600 dark:text-gray-300">
              El sitio web puede contener enlaces a páginas de terceros. SimplificaCRM no tiene control sobre dichos sitios y no asume ninguna responsabilidad por su contenido, políticas de privacidad o prácticas. Le recomendamos revisar la política de privacidad de cada sitio visitado.
            </p>
          </section>

          <!-- 7. PROTECCIÓN DE DATOS -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">7. Protección de Datos Personales</h2>
            <p class="text-gray-600 dark:text-gray-300">
              El tratamiento de los datos personales recogidos a través de este sitio web se rige por nuestra
              <a routerLink="/privacy" class="text-blue-600 dark:text-blue-400 hover:underline">Política de Privacidad</a>,
              elaborada conforme al Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD).
            </p>
            <p class="mt-2 text-gray-600 dark:text-gray-300">
              <strong>Delegado de Protección de Datos (DPO):</strong> Roberto Carrera Santa María —
              <a href="mailto:dpo@simplificacrm.es" class="text-blue-600 dark:text-blue-400 hover:underline">dpo@simplificacrm.es</a>
            </p>
          </section>

          <!-- 8. COOKIES -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">8. Política de Cookies</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Este sitio web utiliza únicamente <strong>cookies técnicas y de sesión</strong> estrictamente necesarias para el funcionamiento del servicio (autenticación segura y preferencias de usuario). No se utilizan cookies analíticas de terceros ni cookies publicitarias. No se requiere consentimiento previo para estas cookies conforme al artículo 22 de la LSSI-CE, ya que son imprescindibles para la prestación del servicio.
            </p>
          </section>

          <!-- 9. LEY APLICABLE -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">9. Ley Aplicable y Jurisdicción</h2>
            <p class="text-gray-600 dark:text-gray-300">
              El presente Aviso Legal se rige por la legislación española. Para la resolución de cualquier controversia derivada del acceso o uso del sitio web, las partes se someten expresamente a la jurisdicción de los Juzgados y Tribunales de <strong>Tarragona</strong>, renunciando a cualquier otro fuero que pudiera corresponderles.
            </p>
            <p class="mt-2 text-gray-600 dark:text-gray-300">
              En caso de conflicto entre consumidores, la Comisión Europea pone a disposición una plataforma de resolución de litigios en línea:
              <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline">https://ec.europa.eu/consumers/odr</a>.
            </p>
          </section>

          <!-- 10. MODIFICACIONES -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">10. Modificaciones del Aviso Legal</h2>
            <p class="text-gray-600 dark:text-gray-300">
              SimplificaCRM se reserva el derecho a modificar el presente Aviso Legal en cualquier momento. Las modificaciones entrarán en vigor desde su publicación en el sitio web. Se recomienda revisarlo periódicamente.
            </p>
          </section>

        </div>

        <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-4">
          <a routerLink="/" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">
            &larr; Volver a Inicio
          </a>
          <a routerLink="/privacy" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">
            Política de Privacidad &rarr;
          </a>
          <a routerLink="/terms-of-service" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">
            Términos de Servicio &rarr;
          </a>
        </div>
      </div>
    </div>
  `
})
export class AvisoLegalComponent {}
