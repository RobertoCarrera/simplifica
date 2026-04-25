// Edge Function: generate-privacy-policy
// Generates a company-specific privacy policy based on their configuration
// URL: /generate-privacy-policy?companyId={id}

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ─── Helper: Generate Privacy Policy HTML ───────────────────────────────────────

function generatePrivacyPolicyHtml(company: any, integrations: any[], modules: any[]): string {
  const companyType = company.company_type || 'autonomo';
  const nif = company.nif || company.cif || 'B00000000';
  const address = company.address || 'Dirección no especificada';
  const phone = company.phone || '';
  
  // Get DPO info from settings
  const settings = company.settings || {};
  const dpoName = settings.dpo_name || settings.dpo_contact_name || 'DPO';
  const dpoEmail = settings.dpo_email || settings.contact_email || settings.email || '';
  
  // Determine "Responsable" name based on company type
  // For autonomo: use legal_representative_name or owner_name or company name
  // For empresa: use company name
  let responsableName = company.name || 'Empresa';
  let responsableLabel = 'Responsable';
  
  if (companyType === 'autonomo') {
    // For self-employed, the "Responsable" is the person, not the business name
    responsableName = settings.legal_representative_name || settings.owner_name || company.name || 'Autónomo';
    responsableLabel = 'Responsable (Titular)';
  }
  
  // Determine active integrations
  const activeProviders = integrations.map(i => i.provider);
  const hasGoogleCalendar = activeProviders.includes('google_calendar');
  const hasDocPlanner = activeProviders.includes('docplanner');
  const hasHolded = activeProviders.includes('holded');
  const hasStripe = activeProviders.includes('stripe');
  const hasPayPal = activeProviders.includes('paypal');
  
  // Determine enabled modules
  const moduleNames = modules.map(m => m.module_key);
  const hasClinical = moduleNames.includes('moduloClinico') || moduleNames.includes('clinical');
  const hasInvoices = moduleNames.includes('moduloFacturas') || moduleNames.includes('moduloPresupuestos') || moduleNames.includes('invoices') || moduleNames.includes('billing');
  const hasMarketing = moduleNames.includes('marketing') || moduleNames.includes('moduloMarketing');
  
  const currentDate = new Date().toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // Generate the third-party recipients table rows
  const recipients: string[] = [
    `<tr><td>Supabase Ltd (AWS eu-west-3)</td><td>Base de datos y autenticación</td><td>Francia (UE - París)</td><td>DPA, datos en UE</td></tr>`,
    `<tr><td>Amazon Web Services (SES)</td><td>Correo electrónico transaccional</td><td>Francia (UE - París)</td><td>DPA, datos en UE (infraestructura AWS eu-west-3)</td></tr>`,
    `<tr><td>Vercel Inc. (AWS eu-west-3)</td><td>Alojamiento web</td><td>Francia (UE - París)</td><td>DPA, datos en UE (infraestructura AWS eu-west-3)</td></tr>`,
  ];
  
  if (hasStripe || hasPayPal) {
    recipients.push(`<tr><td>Stripe / PayPal</td><td>Procesamiento de pagos</td><td>EE.UU./Luxemburgo</td><td>CCT / UE</td></tr>`);
  }
  
  if (hasGoogleCalendar) {
    recipients.push(`<tr><td>Google LLC</td><td>Sincronización de calendario</td><td>EE.UU.</td><td>CCT (Art. 46 RGPD)</td></tr>`);
  }
  
  if (hasDocPlanner) {
    recipients.push(`<tr><td>Docplanner Tech S.L.</td><td>Sincronización de agenda (DocPlanner/Doctoralia)</td><td>España (UE)</td><td>DPA, datos en UE</td></tr>`);
  }
  
  if (hasHolded) {
    recipients.push(`<tr><td>Holded</td><td>Contabilidad y facturación</td><td>España (UE)</td><td>DPA, datos en UE</td></tr>`);
  }

  // Generate purposes table rows
  const purposes = [
    `<tr><td>Gestión de clientes y relación contractual</td><td>Ejecución de contrato (Art. 6.1.b RGPD)</td></tr>`,
    `<tr><td>Programación de citas y reservas</td><td>Ejecución de contrato (Art. 6.1.b RGPD)</td></tr>`,
  ];
  
  if (hasInvoices) {
    purposes.push(`<tr><td>Facturación, contabilidad y obligaciones fiscales</td><td>Obligación legal (Art. 6.1.c RGPD)</td></tr>`);
  }
  
  if (hasClinical) {
    purposes.push(`<tr><td>Tratamiento de datos de salud (módulo clínico)</td><td>Art. 9.2.h RGPD + Art. 9 LOPDGDD (asistencia sanitaria)</td></tr>`);
  }
  
  if (hasMarketing) {
    purposes.push(`<tr><td>Envío de comunicaciones comerciales</td><td>Consentimiento (Art. 6.1.a RGPD)</td></tr>`);
  }
  
  purposes.push(`<tr><td>Seguridad del sistema y prevención del fraude</td><td>Interés legítimo (Art. 6.1.f RGPD)</td></tr>`);

  // Generate data categories list
  const dataCategories = [
    `<li><strong>Datos identificativos:</strong> nombre, apellidos, dirección, correo electrónico, teléfono, NIF/CIF.</li>`,
    `<li><strong>Datos de contacto:</strong> email, teléfono, dirección postal.</li>`,
    `<li><strong>Datos de citas/reservas:</strong> historial de citas, servicios contratados, profesional asignado.</li>`,
  ];
  
  if (hasClinical) {
    dataCategories.push(`<li><strong>Datos de salud</strong> (categoría especial Art. 9 RGPD): notas clínicas, historiales médicos, diagnósticos. Estos datos se almacenan cifrados con AES-256.</li>`);
  }
  
  if (hasInvoices) {
    dataCategories.push(`<li><strong>Datos económicos:</strong> datos de facturación, IBAN, información de pago.</li>`);
  }
  
  dataCategories.push(`<li><strong>Datos de navegación:</strong> logs de acceso, dirección IP, agente de usuario.</li>`);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Política de Privacidad - ${company.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f9fafb; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    .content { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { font-size: 2rem; color: #111; margin-bottom: 8px; }
    h2 { font-size: 1.25rem; color: #1f2937; margin: 24px 0 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
    p, li { color: #4b5563; }
    ul { margin: 8px 0 16px 24px; }
    li { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 0.875rem; }
    th, td { padding: 10px 12px; text-align: left; border: 1px solid #e5e7eb; }
    th { background: #f3f4f6; font-weight: 600; }
    .meta { color: #6b7280; font-size: 0.875rem; margin-bottom: 32px; }
    .footer { margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; display: flex; gap: 16px; flex-wrap: wrap; }
    .footer a { color: #2563eb; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
    .highlight { background: #fef3c7; padding: 12px 16px; border-radius: 8px; margin: 16px 0; }
    .highlight strong { color: #92400e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="content">
      <h1>Política de Privacidad</h1>
      <p class="meta">Última actualización: ${currentDate}</p>

      <div class="highlight">
        <strong>Aviso importante:</strong> ${responsableName} opera como <strong>Responsable del Tratamiento</strong> (Data Controller) de sus datos personales. 
        Simplifica CRM proporciona la infraestructura tecnológica y es el <strong>Encargado del Tratamiento</strong> (Data Processor), 
        conforme al Artículo 28 del RGPD. Esta política ha sido generada automáticamente basada en la configuración de ${responsableName}.
      </div>

      <h2>1. Responsable del Tratamiento</h2>
      <p>En cumplimiento del artículo 13 del Reglamento (UE) 2016/679 (RGPD) y de la Ley Orgánica 3/2018 (LOPDGDD):</p>
      <ul>
        <li><strong>${responsableLabel}:</strong> ${responsableName}</li>
        ${companyType === 'empresa' ? `<li><strong>Denominación social:</strong> ${company.name}</li>` : ''}
        <li><strong>NIF/CIF:</strong> ${nif}</li>
        <li><strong>Domicilio:</strong> ${address}${phone ? `, ${phone}` : ''}</li>
        <li><strong>Correo de contacto:</strong> ${dpoEmail || 'No especificado'}</li>
        ${companyType === 'empresa' && settings.legal_representative_name ? `<li><strong>Representante legal:</strong> ${settings.legal_representative_name}</li>` : ''}
        ${dpoEmail ? `<li><strong>Delegado de Protección de Datos:</strong> ${dpoName && dpoName !== 'DPO' ? dpoName + ' — ' : ''}${dpoEmail}</li>` : ''}
      </ul>

      <h2>2. Finalidades del Tratamiento y Base Jurídica</h2>
      <p>Tratamos sus datos personales para las siguientes finalidades:</p>
      <table>
        <thead>
          <tr><th>Finalidad</th><th>Base jurídica</th></tr>
        </thead>
        <tbody>
          ${purposes.join('\n')}
        </tbody>
      </table>

      <h2>3. Categorías de Datos Tratados</h2>
      <p>Según el contexto de uso, tratamos las siguientes categorías de datos:</p>
      <ul>
        ${dataCategories.join('\n')}
      </ul>
      <p>No tratamos datos de menores de 14 años sin el consentimiento de sus representantes legales.</p>

      <h2>4. Plazos de Conservación</h2>
      <table>
        <thead>
          <tr><th>Categoría</th><th>Plazo</th><th>Norma</th></tr>
        </thead>
        <tbody>
          <tr><td>Datos de cuenta y relación contractual</td><td>Duración del contrato + 3 años</td><td>Art. 1964 CC</td></tr>
          <tr><td>Datos fiscales y de facturación</td><td>4 años</td><td>Arts. 66-70 LGT</td></tr>
          ${hasClinical ? `<tr><td>Datos clínicos / historial de salud</td><td>Mínimo 5 años desde el alta</td><td>Art. 17 Ley 41/2002</td></tr>` : ''}
          <tr><td>Logs de auditoría y seguridad</td><td>10 años</td><td>RGPD Art. 5.2</td></tr>
          <tr><td>Consentimientos de marketing</td><td>Hasta retirada del consentimiento</td><td>Art. 7 RGPD</td></tr>
        </tbody>
      </table>

      <h2>5. Destinatarios y Sub-encargados</h2>
      <p>Sus datos no se cederán a terceros con fines comerciales. Para prestar el servicio:</p>
      <table>
        <thead>
          <tr><th>Proveedor</th><th>Servicio</th><th>País</th><th>Garantía</th></tr>
        </thead>
        <tbody>
          ${recipients.join('\n')}
        </tbody>
      </table>

      <h2>6. Transferencias Internacionales</h2>
      <p>
        Todos los proveedores de servicios están ubicados en la <strong>Unión Europea</strong> (Francia, región eu-west-3 de AWS). 
        No se realizan transferencias de datos fuera del EEE.
      </p>

      <h2>7. Sus Derechos</h2>
      <p>Puede ejercer en cualquier momento:</p>
      <ul>
        <li><strong>Acceso:</strong> conocer qué datos tratamos.</li>
        <li><strong>Rectificación:</strong> corregir datos inexactos.</li>
        <li><strong>Supresión:</strong> solicitar eliminación cuando ya no sean necesarios.</li>
        <li><strong>Limitación:</strong> suspender el tratamiento en ciertos supuestos.</li>
        <li><strong>Portabilidad:</strong> recibir sus datos en formato estructurado.</li>
        <li><strong>Oposición:</strong> oponerse al tratamiento basado en interés legítimo.</li>
        <li><strong>Retirada del consentimiento:</strong> en cualquier momento.</li>
      </ul>
      <p>Para ejercer estos derechos, envíe un correo a <strong>${dpoEmail || company.email || 'info@empresa.com'}</strong> adjuntando copia de su DNI. Responderemos en un plazo máximo de 30 días.</p>

      <h2>8. Derecho a Reclamar ante la AEPD</h2>
      <p>
        Si considera que el tratamiento infringe la normativa de protección de datos, puede presentar 
        reclamación ante la <strong>Agencia Española de Protección de Datos (AEPD)</strong>: 
        <a href="https://www.aepd.es" target="_blank" rel="noopener">www.aepd.es</a> — C/Jorge Juan, 6, 28001 Madrid.
      </p>

      <h2>9. Decisiones Automatizadas</h2>
      <p>
        ${company.name} <strong>no adopta decisiones individuales automatizadas</strong> que produzcan efectos jurídicos 
        o que afecten significativamente al interesado (Art. 22 RGPD).
      </p>

      <h2>10. Cookies</h2>
      <p>
        Esta plataforma utiliza únicamente <strong>cookies técnicas y de sesión</strong> estrictamente necesarias 
        para el funcionamiento del servicio (autenticación, preferencias). No usamos cookies analíticas ni publicitarias.
      </p>

      <h2>11. Modificaciones</h2>
      <p>
        Esta Política puede actualizarse periódicamente. Le notificaremos los cambios materiales 
        con al menos 30 días de antelación.
      </p>

      <div class="footer">
        <a href="/">Volver al inicio</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─── Main Handler ────────────────────────────────────────────────────────────────

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const url = new URL(req.url);
    const companyId = url.searchParams.get('companyId');

    if (!companyId) {
      return new Response(JSON.stringify({ error: 'Company ID es requerido (companyId)' }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Initialize Supabase client with service role (bypass RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch company data
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, nif, company_type, settings')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({ error: 'Empresa no encontrada' }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Extract contact info from settings (address, phone, email not in DB columns)
    const companySettings = company.settings || {};
    const companyData = {
      ...company,
      address: companySettings.address || 'Dirección no especificada',
      phone: companySettings.phone || '',
      settings: companySettings,
    };

    // Fetch integrations for this company
    const { data: integrations } = await supabase
      .from('integrations')
      .select('provider')
      .eq('company_id', companyId);

    // Fetch company modules
    // Note: column is 'status' = 'active', not 'is_active'
    const { data: companyModules } = await supabase
      .from('company_modules')
      .select('module_key, status')
      .eq('company_id', companyId)
      .eq('status', 'active');

    // Generate privacy policy HTML
    const html = generatePrivacyPolicyHtml(companyData, integrations || [], companyModules || []);

    // Return HTML response
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error generating privacy policy:', error);
    return new Response(JSON.stringify({ error: 'Error interno al generar la política de privacidad' }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});