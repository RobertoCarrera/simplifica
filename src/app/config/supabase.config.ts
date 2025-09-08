// ========================================
// CONFIGURACIÓN SUPABASE - DESARROLLO VS PRODUCCIÓN
// ========================================

export interface SupabaseConfig {
  useRpcFunctions: boolean;
  isDevelopmentMode: boolean;
  enableDevUserSelector: boolean;
  enableDiagnosticLogging: boolean;
}

/**
 * Configuración para diferentes entornos
 */
export const supabaseConfigs = {
  development: {
    useRpcFunctions: false,       // DESACTIVADO: Usar queries directas por simplicidad
    isDevelopmentMode: true,      // Habilitar modo desarrollo
    enableDevUserSelector: true,  // Mostrar selector de usuario DEV
    enableDiagnosticLogging: true // Logs detallados
  } as SupabaseConfig,

  production: {
    useRpcFunctions: false,       // Usar consultas normales con autenticación
    isDevelopmentMode: false,     // Deshabilitar modo desarrollo
    enableDevUserSelector: false, // Ocultar selector de usuario DEV
    enableDiagnosticLogging: false // Logs mínimos
  } as SupabaseConfig,

  testing: {
    useRpcFunctions: true,        // Usar RPC para tests
    isDevelopmentMode: true,      // Habilitar para testing
    enableDevUserSelector: false, // No mostrar en tests
    enableDiagnosticLogging: true // Logs para debugging tests
  } as SupabaseConfig
};

/**
 * Obtener configuración actual basada en el entorno
 */
export function getCurrentSupabaseConfig(): SupabaseConfig {
  // Detectar entorno
  const isProduction = typeof window !== 'undefined' && window.location.hostname !== 'localhost';
  const isTesting = typeof window !== 'undefined' && window.location.search.includes('test=true');
  
  if (isTesting) {
    return supabaseConfigs.testing;
  }
  
  return isProduction ? supabaseConfigs.production : supabaseConfigs.development;
}

/**
 * Helper para logs condicionales
 */
export function devLog(message: string, ...args: any[]) {
  const config = getCurrentSupabaseConfig();
  if (config.enableDiagnosticLogging) {
    console.log(`🔧 [SUPABASE-DEV] ${message}`, ...args);
  }
}

/**
 * Helper para logs de error
 */
export function devError(message: string, error: any) {
  const config = getCurrentSupabaseConfig();
  if (config.enableDiagnosticLogging) {
    console.error(`❌ [SUPABASE-ERROR] ${message}`, error);
  }
}

/**
 * Helper para logs de éxito
 */
export function devSuccess(message: string, ...args: any[]) {
  const config = getCurrentSupabaseConfig();
  if (config.enableDiagnosticLogging) {
    console.log(`✅ [SUPABASE-SUCCESS] ${message}`, ...args);
  }
}
