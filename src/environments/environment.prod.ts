export const environment = {
  production: true,
  supabase: {
    // Orden de resolución: variables estándar del dashboard de Vercel -> variantes legacy
    url: process.env['SUPABASE_URL'] || process.env['VITE_SUPABASE_URL'] || process.env['NG_APP_SUPABASE_URL'] || '',
    anonKey: process.env['SUPABASE_ANON_KEY'] || process.env['VITE_SUPABASE_ANON_KEY'] || process.env['NG_APP_SUPABASE_ANON_KEY'] || ''
  },
  siteUrl: 'https://simplifica.digitalizamostupyme.es',
  useEdgeCreateLocality: true,
  edgeFunctionsBaseUrl: 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1',

  // GDPR Configuration - Production
  gdpr: {
    enabled: process.env['ENABLE_GDPR'] === 'true' || true, // Activar GDPR en producción
    dpoEmail: process.env['GDPR_DPO_EMAIL'] || 'dpo@simplificacrm.es',
    retentionYears: parseInt(process.env['GDPR_RETENTION_YEARS'] || '7'),
    autoDeleteAfterDays: parseInt(process.env['GDPR_AUTO_DELETE_AFTER_DAYS'] || '2555'),
    breachNotificationHours: parseInt(process.env['GDPR_BREACH_NOTIFICATION_HOURS'] || '72'),
    requestDeadlineDays: parseInt(process.env['GDPR_REQUEST_DEADLINE_DAYS'] || '30')
  },

  // AnyChat API Configuration - Production
  // ⚠️ CONFIGURAR en Vercel: Settings → Environment Variables → ANYCHAT_API_KEY
  anychatApiKey: process.env['ANYCHAT_API_KEY'] || ''
};
