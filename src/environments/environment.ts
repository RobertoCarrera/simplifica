export const environment = {
  production: false,
  supabase: {
    // Loaded at runtime from src/assets/runtime-config.json (gitignored).
    // These are placeholders; the actual values come from RuntimeConfigService.
    url: '',
    anonKey: ''
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
  anychatApiKey: '',

  // Google Picker API Key for Drive Integration (Public Key restricted to domain/app)
  googlePickerApiKey: ''
};

// ========================================
// INSTRUCCIONES PARA CONFIGURAR:
// ========================================
// 1. Ve a tu proyecto en https://app.supabase.com
// 2. Ve a Settings → API
// 3. Copia:
//    - Project URL → url
//    - anon/public key → anonKey
// 4. Reemplaza los valores de arriba
// ========================================
