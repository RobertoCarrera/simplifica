export const environment = {
  production: false,
  supabase: {
    // TODO: Reemplazar con tus credenciales reales de Supabase
    url: 'https://ufutyjbqfjrlzkprvyvs.supabase.co', // https://xxxxx.supabase.co
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmdXR5amJxZmpybHprcHJ2eXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxMDk4ODgsImV4cCI6MjA3MjY4NTg4OH0.Q8MK0UWrnIycN8MxhVa5rEIjhD2D7EFyaL94SWfW7y4'  // Anon key de tu proyecto
  }
  ,
  // Optional: enable calling Edge Function to create locality instead of direct RPC
  useEdgeCreateLocality: true,
  edgeFunctionsBaseUrl: 'https://ufutyjbqfjrlzkprvyvs.supabase.co/functions/v1' // your deployed functions base URL
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
