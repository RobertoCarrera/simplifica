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
  gdpr: {
    enabled: process.env["ENABLE_GDPR"] === "true" || true, // Activar GDPR en producción
    dpoEmail: process.env["GDPR_DPO_EMAIL"] || "dpo@simplificacrm.es",
    retentionYears: parseInt(process.env["GDPR_RETENTION_YEARS"] || "7"),
    autoDeleteAfterDays: parseInt(
      process.env["GDPR_AUTO_DELETE_AFTER_DAYS"] || "2555",
    ),
    breachNotificationHours: parseInt(
      process.env["GDPR_BREACH_NOTIFICATION_HOURS"] || "72",
    ),
    requestDeadlineDays: parseInt(
      process.env["GDPR_REQUEST_DEADLINE_DAYS"] || "30",
    ),
  },

  // AnyChat API Configuration - Production
  // ⚠️ CONFIGURAR en Vercel: Settings → Environment Variables → ANYCHAT_API_KEY
  anychatApiKey: process.env["ANYCHAT_API_KEY"] || "",
};
