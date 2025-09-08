// ========================================
// INSTRUCCIONES PARA CAMBIAR A PRODUCCIÓN
// ========================================

/* 
📋 PASOS PARA PASAR A PRODUCCIÓN:

1. CONFIGURACIÓN DEL ENTORNO:
   - En `src/app/config/supabase.config.ts`, la función `getCurrentSupabaseConfig()` 
     detecta automáticamente si estás en localhost o en producción
   - En producción (hostname != 'localhost'), se usará automáticamente la configuración de producción

2. CONFIGURACIÓN MANUAL (ALTERNATIVA):
   - Puedes forzar el modo de producción cambiando la línea en `supabase.config.ts`:
   
   export function getCurrentSupabaseConfig(): SupabaseConfig {
     return supabaseConfigs.production; // <- Cambiar aquí para forzar producción
   }

3. LO QUE CAMBIA AUTOMÁTICAMENTE EN PRODUCCIÓN:
   ✅ useRpcFunctions: false          -> Usa consultas normales con autenticación real
   ✅ isDevelopmentMode: false        -> Deshabilita modo desarrollo
   ✅ enableDevUserSelector: false    -> Oculta el selector de usuario DEV
   ✅ enableDiagnosticLogging: false  -> Logs mínimos en consola

4. AUTENTICACIÓN EN PRODUCCIÓN:
   - En producción, RLS funcionará normalmente con auth.uid()
   - Los usuarios necesitarán autenticarse con Supabase Auth
   - Las consultas se filtrarán automáticamente por el usuario autenticado

5. VERIFICACIÓN:
   - El selector de usuario DEV no aparecerá en producción
   - Los logs de diagnóstico se reducirán considerablemente
   - Las consultas usarán autenticación real en lugar de RPC

6. TESTING EN MODO PRODUCCIÓN:
   - Para probar en localhost como si fuera producción, añade `?test=production` a la URL
   - O cambia manualmente la configuración como se indica en el punto 2

========================================
RESUMEN: La transición es automática basada en el hostname.
No necesitas cambiar código manualmente para desplegar en producción.
========================================
*/

export const PRODUCTION_MODE_INSTRUCTIONS = `
🚀 MODO PRODUCCIÓN ACTIVADO

En producción:
- ✅ RLS funciona con autenticación real
- ✅ No hay selector de usuario DEV
- ✅ Logs mínimos
- ✅ Consultas normales (sin RPC)

Para volver a desarrollo:
- Ejecuta en localhost
- O cambia la configuración manualmente
`;

export const DEVELOPMENT_MODE_INSTRUCTIONS = `
🔧 MODO DESARROLLO ACTIVADO

En desarrollo:
- ✅ RPC bypasea RLS 
- ✅ Selector de usuario DEV visible
- ✅ Logs detallados
- ✅ Testing con usuarios reales

Para pasar a producción:
- Deplega en servidor (automático)
- O cambia configuración manualmente
`;
