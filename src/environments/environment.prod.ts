export const environment = {
  production: true,
  supabase: {
    // Direct values for production. The anon key is public by design
    // (it ships in the JS bundle). These values match runtime-config.json
    // written by scripts/generate-runtime-config.mjs. Using direct
    // values (not process.env) because Angular CLI's process.env
    // replacement removes undefined entries, leaving process.env.X as
    // a runtime reference that fails in the browser.
    url: "https://ufutyjbqfjrlzkprvyvs.supabase.co",
    anonKey: "sb_publishable_2vzsHFfDJiXv7RK6ttGUNw__9ZR4czN",
  },
  siteUrl: "https://app.simplificacrm.es",
  portalUrl: "https://portal.simplificacrm.es",
  useEdgeCreateLocality: true,
  edgeFunctionsBaseUrl: "https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1",

  // GDPR Configuration - Production
  // Values are baked at build time (Angular CLI does NOT replace process.env
  // in browser bundles — any reference to process.env.X throws ReferenceError
  // at runtime). Override at deploy via assets/runtime-config.json + a
  // RuntimeConfigService consumer if you need different values per env.
  gdpr: {
    enabled: true, // Activar GDPR en producción
    dpoEmail: "dpo@simplificacrm.es",
    retentionYears: 7, // Años de retención (normativa española)
    autoDeleteAfterDays: 2555, // 7 años en días
    breachNotificationHours: 72, // Horas para notificar brechas (Art. 33)
    requestDeadlineDays: 30, // Días para responder solicitudes (Art. 12.3)
  },

  // AnyChat API Configuration - Production
  // anychatApiKey is intentionally empty here. The AnyChat key is consumed
  // server-side (Edge Function) — never ship it in the client bundle. If you
  // need to gate any client-side feature, toggle it via runtime-config.json's
  // features.anychatConversationsEnabled (consumed by RuntimeConfigService).
  anychatApiKey: "",
};
