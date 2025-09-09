export const environment = {
  production: true,
  supabase: {
    url: process.env['VITE_SUPABASE_URL'] || process.env['NG_APP_SUPABASE_URL'] || '',
    anonKey: process.env['VITE_SUPABASE_ANON_KEY'] || process.env['NG_APP_SUPABASE_ANON_KEY'] || ''
  }
};
