import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formatea una fecha como etiqueta relativa en español:
 *   Hoy, Ayer, Hace X días, Hace X semanas, Hace 1 mes, fecha exacta (>60 días).
 *
 * Rangos exactos definidos por la tarea:
 *   - 0 días       → "Hoy"
 *   - 1 día        → "Ayer"
 *   - 2–6 días     → "Hace X días"
 *   - 7 días       → "Hace 1 semana"
 *   - 8–13 días    → "Hace X días"
 *   - 14 días      → "Hace 2 semanas"
 *   - 15–20 días   → "Hace X días"
 *   - 21–30 días   → "Hace más de 3 semanas"
 *   - 31–60 días   → "Hace 1 mes"
 *   - >60 días     → fecha exacta (dd/MM/yy)
 */

export function formatRelativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((todayStart.getTime() - dateStart.getTime()) / 86_400_000);

  if (diffDays < 0) {
    // Fecha futura — mostrar fecha exacta
    return formatExactDate(date);
  }

  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays <= 6) return `Hace ${diffDays} días`;
  if (diffDays === 7) return 'Hace 1 semana';
  if (diffDays <= 13) return `Hace ${diffDays} días`;
  if (diffDays === 14) return 'Hace 2 semanas';
  if (diffDays <= 20) return `Hace ${diffDays} días`;
  if (diffDays <= 30) return 'Hace más de 3 semanas';
  if (diffDays <= 60) return 'Hace 1 mes';

  return formatExactDate(date);
}

/** Formato exacto: dd/MM/yy */
export function formatExactDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

@Pipe({
  name: 'relativeDate',
  standalone: true,
})
export class RelativeDatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatRelativeDate(value);
  }
}
