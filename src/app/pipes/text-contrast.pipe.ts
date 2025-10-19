import { Pipe, PipeTransform } from '@angular/core';

/**
 * TextContrastPipe
 * -----------------
 * Small utility pipe that returns a readable text color ('#000' or '#fff')
 * given a background color in hex format (#rrggbb or #rgb).
 *
 * Usage in templates:
 *   <div [style.color]="stage.color | textContrast">...</div>
 *
 * Implementation details:
 * - Normalizes short hex (e.g. #f3a) to full (#ff33aa)
 * - Computes perceived luminance using WCAG relative luminance coefficients
 * - Uses a luminance threshold (0.6) to pick black for light backgrounds
 *   and white for dark backgrounds. Adjust the threshold if you need
 *   a different visual sensitivity.
 *
 * This pipe is standalone so it can be imported directly into standalone
 * components' `imports` arrays.
 */
@Pipe({
  name: 'textContrast',
  standalone: true
})
export class TextContrastPipe implements PipeTransform {
  transform(hex: string | undefined | null): string {
    try {
      if (!hex) return '#000';
      let c = hex.replace('#', '').trim();
      if (c.length === 3) {
        c = c.split('').map(ch => ch + ch).join('');
      }
      if (c.length !== 6) return '#000';
      const r = parseInt(c.substring(0, 2), 16);
      const g = parseInt(c.substring(2, 4), 16);
      const b = parseInt(c.substring(4, 6), 16);

      // Perceived luminance (WCAG)
      const lum = 0.2126 * (r / 255) + 0.7152 * (g / 255) + 0.0722 * (b / 255);
      // Threshold chosen for comfortable contrast; tweak to taste
      return lum > 0.6 ? '#000' : '#fff';
    } catch (e) {
      return '#000';
    }
  }
}
