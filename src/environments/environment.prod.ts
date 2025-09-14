export const environment = {
  production: true,
  supabase: {
    // Orden de resolución: variables estándar del dashboard de Vercel -> variantes legacy
    url: process.env['SUPABASE_URL'] || process.env['VITE_SUPABASE_URL'] || process.env['NG_APP_SUPABASE_URL'] || '',
    anonKey: process.env['SUPABASE_ANON_KEY'] || process.env['VITE_SUPABASE_ANON_KEY'] || process.env['NG_APP_SUPABASE_ANON_KEY'] || ''
  },
  siteUrl: 'https://simplifica.digitalizamostupyme.es'
  ,
  useEdgeCreateLocality: false,
  edgeFunctionsBaseUrl: ''
};
