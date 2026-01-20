export const environment = {
  production: false,
  supabase: {
    url: 'https://ufutyjbqfjrlzkprvyvs.supabase.co',
    anonKey: 'sb_publishable_dNnMhmfC0luhkc4GazBtSw_l7gWvcqq' // Publishable key
  },
  // Optional: enable calling Edge Function to create locality instead of direct RPC
  useEdgeCreateLocality: true,
  edgeFunctionsBaseUrl: 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1', // your deployed functions base URL

  // GDPR Configuration
  gdpr: {
    enabled: true, // Activar funcionalidad GDPR
    dpoEmail: 'dpo@simplificacrm.es', // Email del DPO
    retentionYears: 7, // Años de retención (normativa española)
    autoDeleteAfterDays: 2555, // 7 años en días
    breachNotificationHours: 72, // Horas para notificar brechas (Art. 33)
    requestDeadlineDays: 30 // Días para responder solicitudes (Art. 12.3)
  },

  // AnyChat API Configuration (no secrets in client)
  // En desarrollo se deja vacío; la API key se usa solo en el Edge Function
  anychatApiKey: ''
};
