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
          <p class="text-gray-500 dark:text-gray-400">Última actualización: 19 de marzo de 2026</p>
        </div>

        <div class="prose dark:prose-invert max-w-none space-y-8">

          <!-- 1. RESPONSABLE -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">1. Responsable del Tratamiento</h2>
            <p class="text-gray-600 dark:text-gray-300">
              En cumplimiento del artículo 13 del Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo (RGPD) y de la Ley Orgánica 3/2018, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD), le informamos:
            </p>
            <ul class="mt-3 space-y-1 text-gray-600 dark:text-gray-300">
              <li><strong>Responsable:</strong> Roberto Carrera Santa María</li>
              <li><strong>NIF:</strong> 45127276B</li>
              <li><strong>Domicilio:</strong> C/Pisuerga 32, Bajo 1.ª, 43882 Segur de Calafell, Tarragona, España</li>
              <li><strong>Correo de contacto:</strong> <a href="mailto:dpo@simplificacrm.es" class="text-blue-600 dark:text-blue-400 hover:underline">dpo@simplificacrm.es</a></li>
              <li><strong>Delegado de Protección de Datos (DPO):</strong> Roberto Carrera Santa María — <a href="mailto:dpo@simplificacrm.es" class="text-blue-600 dark:text-blue-400 hover:underline">dpo@simplificacrm.es</a></li>
            </ul>
          </section>

          <!-- 2. FINALIDADES Y BASE JURÍDICA -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">2. Finalidades del Tratamiento y Base Jurídica</h2>
            <p class="text-gray-600 dark:text-gray-300">Tratamos sus datos personales para las siguientes finalidades:</p>
            <div class="mt-3 overflow-x-auto">
              <table class="w-full text-sm text-left text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                <thead class="bg-gray-100 dark:bg-gray-700">
                  <tr>
                    <th class="px-4 py-2 font-semibold">Finalidad</th>
                    <th class="px-4 py-2 font-semibold">Base jurídica</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-600">
                  <tr>
                    <td class="px-4 py-2">Prestación y gestión del servicio contratado</td>
                    <td class="px-4 py-2">Ejecución de contrato (Art. 6.1.b RGPD)</td>
                  </tr>
                  <tr class="bg-gray-50 dark:bg-gray-750">
                    <td class="px-4 py-2">Facturación, contabilidad y cumplimiento fiscal</td>
                    <td class="px-4 py-2">Obligación legal (Art. 6.1.c RGPD; Ley 37/1992 IVA; Ley 58/2003 LGT)</td>
                  </tr>
                  <tr>
                    <td class="px-4 py-2">Envío de comunicaciones comerciales sobre el propio servicio</td>
                    <td class="px-4 py-2">Interés legítimo (Art. 6.1.f RGPD; Art. 21.2 LSSI)</td>
                  </tr>
                  <tr class="bg-gray-50 dark:bg-gray-750">
                    <td class="px-4 py-2">Envío de comunicaciones de marketing de terceros o nuevos productos</td>
                    <td class="px-4 py-2">Consentimiento (Art. 6.1.a RGPD) — puede retirarlo en cualquier momento</td>
                  </tr>
                  <tr>
                    <td class="px-4 py-2">Atención al cliente y soporte técnico</td>
                    <td class="px-4 py-2">Ejecución de contrato (Art. 6.1.b RGPD)</td>
                  </tr>
                  <tr class="bg-gray-50 dark:bg-gray-750">
                    <td class="px-4 py-2">Seguridad del sistema y prevención del fraude</td>
                    <td class="px-4 py-2">Interés legítimo (Art. 6.1.f RGPD)</td>
                  </tr>
                  <tr>
                    <td class="px-4 py-2">Tratamiento de datos de salud de pacientes/clientes finales (módulo clínico)</td>
                    <td class="px-4 py-2">Art. 9.2.h RGPD + Art. 9 LOPDGDD (asistencia y gestión sanitaria) — en calidad de encargado del tratamiento del suscriptor</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- 3. DATOS QUE TRATAMOS -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">3. Categorías de Datos Tratados</h2>
            <p class="text-gray-600 dark:text-gray-300">Según el contexto de uso de la plataforma, podemos tratar las siguientes categorías:</p>
            <ul class="mt-2 list-disc list-inside text-gray-600 dark:text-gray-300 ml-4 space-y-1">
              <li><strong>Datos identificativos:</strong> nombre, apellidos, dirección, correo electrónico, teléfono, NIF/CIF.</li>
              <li><strong>Datos económicos:</strong> datos de facturación y transaccionales.</li>
              <li><strong>Datos de navegación:</strong> logs de acceso, dirección IP, agente de usuario (para seguridad y auditoría).</li>
              <li><strong>Datos de salud</strong> (categoría especial, Art. 9 RGPD): notas clínicas de los clientes finales de los suscriptores que usen el módulo clínico. Estos datos se almacenan cifrados con AES-256.</li>
            </ul>
            <p class="mt-2 text-gray-600 dark:text-gray-300">No tratamos datos de menores de 14 años.</p>
          </section>

          <!-- 4. CONSERVACIÓN -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">4. Plazos de Conservación</h2>
            <div class="mt-3 overflow-x-auto">
              <table class="w-full text-sm text-left text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                <thead class="bg-gray-100 dark:bg-gray-700">
                  <tr>
                    <th class="px-4 py-2 font-semibold">Categoría</th>
                    <th class="px-4 py-2 font-semibold">Plazo</th>
                    <th class="px-4 py-2 font-semibold">Norma</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-600">
                  <tr>
                    <td class="px-4 py-2">Datos de cuenta y relación contractual</td>
                    <td class="px-4 py-2">Duración del contrato + 3 años</td>
                    <td class="px-4 py-2">Art. 1964 CC (prescripción acciones personales)</td>
                  </tr>
                  <tr class="bg-gray-50 dark:bg-gray-750">
                    <td class="px-4 py-2">Datos fiscales y de facturación</td>
                    <td class="px-4 py-2">4 años</td>
                    <td class="px-4 py-2">Arts. 66-70 LGT (Ley 58/2003)</td>
                  </tr>
                  <tr>
                    <td class="px-4 py-2">Datos clínicos / historial de salud</td>
                    <td class="px-4 py-2">Mínimo 5 años desde el alta</td>
                    <td class="px-4 py-2">Art. 17 Ley 41/2002 de autonomía del paciente</td>
                  </tr>
                  <tr class="bg-gray-50 dark:bg-gray-750">
                    <td class="px-4 py-2">Logs de auditoría y seguridad</td>
                    <td class="px-4 py-2">10 años</td>
                    <td class="px-4 py-2">RGPD Art. 5.2 (responsabilidad proactiva) + ENS</td>
                  </tr>
                  <tr>
                    <td class="px-4 py-2">Consentimientos de marketing</td>
                    <td class="px-4 py-2">Hasta retirada del consentimiento</td>
                    <td class="px-4 py-2">Art. 7 RGPD</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="mt-3 text-gray-600 dark:text-gray-300">
              Transcurridos los plazos, los datos se suprimirán de forma segura o se anonimizarán para fines estadísticos.
            </p>
          </section>

          <!-- 5. DESTINATARIOS -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">5. Destinatarios y Sub-encargados</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Sus datos no se cederán a terceros con fines comerciales. Para prestar el servicio, contamos con los siguientes sub-encargados del tratamiento:
            </p>
            <div class="mt-3 overflow-x-auto">
              <table class="w-full text-sm text-left text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                <thead class="bg-gray-100 dark:bg-gray-700">
                  <tr>
                    <th class="px-4 py-2 font-semibold">Proveedor</th>
                    <th class="px-4 py-2 font-semibold">Servicio</th>
                    <th class="px-4 py-2 font-semibold">País</th>
                    <th class="px-4 py-2 font-semibold">Garantía</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-600">
                  <tr>
                    <td class="px-4 py-2">Supabase Ltd</td>
                    <td class="px-4 py-2">Base de datos, autenticación y almacenamiento</td>
                    <td class="px-4 py-2">Irlanda (UE)</td>
                    <td class="px-4 py-2">DPA firmado, datos en UE</td>
                  </tr>
                  <tr class="bg-gray-50 dark:bg-gray-750">
                    <td class="px-4 py-2">Amazon Web Services (SES)</td>
                    <td class="px-4 py-2">Correo electrónico transaccional</td>
                    <td class="px-4 py-2">EE.UU.</td>
                    <td class="px-4 py-2">Cláusulas Contractuales Tipo (Art. 46 RGPD)</td>
                  </tr>
                  <tr>
                    <td class="px-4 py-2">Vercel Inc.</td>
                    <td class="px-4 py-2">Alojamiento de la aplicación web</td>
                    <td class="px-4 py-2">EE.UU.</td>
                    <td class="px-4 py-2">Cláusulas Contractuales Tipo (Art. 46 RGPD)</td>
                  </tr>
                  <tr class="bg-gray-50 dark:bg-gray-750">
                    <td class="px-4 py-2">Stripe / PayPal</td>
                    <td class="px-4 py-2">Procesamiento de pagos (opcional)</td>
                    <td class="px-4 py-2">EE.UU./Luxemburgo</td>
                    <td class="px-4 py-2">Cláusulas Contractuales Tipo / UE</td>
                  </tr>
                  <tr>
                    <td class="px-4 py-2">Google LLC</td>
                    <td class="px-4 py-2">Sincronización Google Calendar/Drive (si se activa)</td>
                    <td class="px-4 py-2">EE.UU.</td>
                    <td class="px-4 py-2">Cláusulas Contractuales Tipo (Art. 46 RGPD)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="mt-3 text-gray-600 dark:text-gray-300">
              También podemos divulgar datos cuando sea requerido por ley o autoridad competente.
            </p>
          </section>

          <!-- 6. TRANSFERENCIAS INTERNACIONALES -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">6. Transferencias Internacionales</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Algunos proveedores indicados en la sección anterior están ubicados fuera del Espacio Económico Europeo (EEE). Estas transferencias se realizan bajo las garantías adecuadas previstas en el artículo 46 RGPD, concretamente mediante <strong>Cláusulas Contractuales Tipo</strong> aprobadas por la Comisión Europea. Los datos almacenados en la base de datos principal (Supabase) permanecen en servidores ubicados en la Unión Europea.
            </p>
          </section>

          <!-- 7. DERECHOS -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">7. Sus Derechos</h2>
            <p class="text-gray-600 dark:text-gray-300">En cualquier momento puede ejercer los siguientes derechos:</p>
            <ul class="mt-2 list-disc list-inside text-gray-600 dark:text-gray-300 ml-4 space-y-1">
              <li><strong>Acceso:</strong> conocer qué datos suyos tratamos.</li>
              <li><strong>Rectificación:</strong> corregir datos inexactos o incompletos.</li>
              <li><strong>Supresión ("derecho al olvido"):</strong> solicitar la eliminación de sus datos cuando ya no sean necesarios.</li>
              <li><strong>Limitación:</strong> solicitar que suspendamos el tratamiento en ciertos supuestos.</li>
              <li><strong>Portabilidad:</strong> recibir sus datos en formato estructurado y de uso común.</li>
              <li><strong>Oposición:</strong> oponerse al tratamiento basado en interés legítimo o al marketing directo.</li>
              <li><strong>Retirada del consentimiento:</strong> en cualquier momento, sin que ello afecte a la licitud del tratamiento previo.</li>
            </ul>
            <p class="mt-3 text-gray-600 dark:text-gray-300">
              Para ejercer cualquiera de estos derechos, envíe un correo a
              <a href="mailto:dpo@simplificacrm.es" class="text-blue-600 dark:text-blue-400 hover:underline">dpo@simplificacrm.es</a>
              indicando el derecho que desea ejercer y adjuntando copia de su documento de identidad. Responderemos en el plazo máximo de 30 días.
            </p>
          </section>

          <!-- 8. AEPD -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">8. Derecho a Reclamar ante la AEPD</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Si considera que el tratamiento de sus datos infringe la normativa de protección de datos, tiene derecho a presentar una reclamación ante la
              <strong>Agencia Española de Protección de Datos (AEPD)</strong>:
              <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" class="text-blue-600 dark:text-blue-400 hover:underline">www.aepd.es</a>
              — C/Jorge Juan, 6, 28001 Madrid.
            </p>
          </section>

          <!-- 9. COOKIES -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">9. Cookies</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Esta plataforma utiliza únicamente <strong>cookies técnicas y de sesión</strong> estrictamente necesarias para el funcionamiento del servicio (autenticación, preferencias de idioma/tema). No utilizamos cookies analíticas de terceros ni cookies de publicidad. No se requiere consentimiento adicional para estas cookies conforme al Art. 22 LSSI.
            </p>
          </section>

          <!-- 10. MODIFICACIONES -->
          <section>
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">10. Modificaciones de esta Política</h2>
            <p class="text-gray-600 dark:text-gray-300">
              Podemos actualizar esta Política de Privacidad periódicamente. Le notificaremos los cambios materiales por correo electrónico o mediante un aviso destacado en la plataforma con al menos 30 días de antelación. La fecha de última actualización siempre estará visible en la cabecera de este documento.
            </p>
          </section>

        </div>

        <div class="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row gap-4">
          <a routerLink="/" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">
            &larr; Volver a Inicio
          </a>
          <a routerLink="/terms-of-service" class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">
            Términos de Servicio &rarr;
          </a>
        </div>
      </div>
    </div>
  `
})
export class PrivacyPolicyComponent {
    currentDate = new Date();
}
