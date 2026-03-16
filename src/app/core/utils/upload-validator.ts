/**
 * Shared upload validation utility.
 * Enforces file size, extension, and MIME type checks before any upload.
 */

/** Extensions that must never be uploaded (executable / scripting) */
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.msi', '.sh', '.app', '.dll',
  '.scr', '.pif', '.vbs', '.js', '.ws', '.wsf', '.ps1',
  '.html', '.htm', '.svg', '.xml', '.xhtml', '.mhtml', '.mht',
  '.hta', '.jar', '.jnlp', '.cpl', '.inf', '.reg', '.rgs',
]);

/** Default maximum upload size: 10 MB */
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;

export interface UploadValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a file before uploading to storage.
 *
 * @param file       The File to validate
 * @param maxSize    Maximum allowed size in bytes (default 10 MB)
 * @returns          { valid, error? }
 */
export function validateUploadFile(
  file: File,
  maxSize: number = DEFAULT_MAX_SIZE,
): UploadValidationResult {
  // 1. Size check
  if (file.size > maxSize) {
    const limitMB = Math.round(maxSize / (1024 * 1024));
    return { valid: false, error: `El archivo supera el límite de ${limitMB} MB` };
  }

  // 2. Extension blocklist
  const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return { valid: false, error: 'Tipo de archivo no permitido' };
  }

  // 3. Double-extension check (e.g. "payload.pdf.html")
  const parts = file.name.split('.');
  if (parts.length > 2) {
    for (let i = 1; i < parts.length; i++) {
      if (BLOCKED_EXTENSIONS.has('.' + parts[i].toLowerCase())) {
        return { valid: false, error: 'Tipo de archivo no permitido' };
      }
    }
  }

  return { valid: true };
}
