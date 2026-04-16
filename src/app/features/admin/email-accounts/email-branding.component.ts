import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import {
  EmailBrandingSettings,
  DEFAULT_EMAIL_BRANDING,
  EMAIL_FONT_OPTIONS,
} from '../../../models/company-email.models';
import { validateUploadFile } from '../../../core/utils/upload-validator';

@Component({
  selector: 'app-email-branding',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './email-branding.component.html',
})
export class EmailBrandingComponent implements OnInit {
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private sanitizer = inject(DomSanitizer);

  readonly fontOptions = EMAIL_FONT_OPTIONS;

  loading = signal(true);
  saving = signal(false);

  // General branding (shared with company settings)
  logoUrl = signal<string>('');
  primaryColor = signal<string>('#10B981');

  // Email-specific branding
  backgroundColor = signal<string>(DEFAULT_EMAIL_BRANDING.background_color);
  fontFamily = signal<string>(DEFAULT_EMAIL_BRANDING.font_family);
  footerText = signal<string | null>(null);

  // Logo upload state
  logoFile: File | null = null;
  logoPreview = signal<string | null>(null);

  // Live preview
  previewHtml = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(this.buildPreviewHtml()),
  );

  async ngOnInit() {
    await this.loadBranding();
  }

  /** Ensures a hex color always has the # prefix and trims whitespace. */
  private normalizeHex(value: string | undefined | null, fallback: string): string {
    if (!value) return fallback;
    const trimmed = value.trim();
    if (trimmed.startsWith('#')) return trimmed;
    return '#' + trimmed;
  }

  async loadBranding() {
    this.loading.set(true);
    try {
      const user = await firstValueFrom(this.auth.userProfile$);
      if (!user?.company_id) return;

      const { data, error } = await this.auth.client
        .from('companies')
        .select('logo_url, settings')
        .eq('id', user.company_id)
        .single();

      if (error) throw error;

      if (data) {
        this.logoUrl.set(data.logo_url || '');
        this.logoPreview.set(data.logo_url || null);
        this.primaryColor.set(
          this.normalizeHex(data.settings?.branding?.primary_color, '#10B981'),
        );

        const eb: Partial<EmailBrandingSettings> = data.settings?.email_branding || {};
        this.backgroundColor.set(
          this.normalizeHex(eb.background_color, DEFAULT_EMAIL_BRANDING.background_color),
        );
        this.fontFamily.set(eb.font_family ?? DEFAULT_EMAIL_BRANDING.font_family);
        this.footerText.set(eb.footer_text ?? null);
      }
    } catch (e) {
      console.error('Error loading email branding:', e);
      this.toast.error('Error', 'No se pudo cargar la configuración de branding');
    } finally {
      this.loading.set(false);
    }
  }

  onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const check = validateUploadFile(file, 5 * 1024 * 1024);
    if (!check.valid) {
      this.toast.error('Error', check.error!);
      input.value = '';
      return;
    }

    this.logoFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      this.logoPreview.set((e.target as FileReader).result as string);
    };
    reader.readAsDataURL(file);
  }

  removeLogo() {
    this.logoFile = null;
    this.logoPreview.set(null);
    this.logoUrl.set('');
  }

  async save() {
    this.saving.set(true);
    try {
      const user = await firstValueFrom(this.auth.userProfile$);
      if (!user?.company_id) throw new Error('No tienes empresa asignada');

      let finalLogoUrl = this.logoUrl();

      if (this.logoFile) {
        const fileExt = this.logoFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `${user.company_id}/logos/${fileName}`;

        const { error: uploadError } = await this.auth.client.storage
          .from('public-assets')
          .upload(filePath, this.logoFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = this.auth.client.storage
          .from('public-assets')
          .getPublicUrl(filePath);

        finalLogoUrl = publicUrl;
        this.logoFile = null;
      }

      // Fetch current settings to avoid overwriting other keys
      const { data: current } = await this.auth.client
        .from('companies')
        .select('settings')
        .eq('id', user.company_id)
        .single();

      const currentSettings = current?.settings || {};

      const newSettings = {
        ...currentSettings,
        branding: {
          ...(currentSettings.branding || {}),
          primary_color: this.primaryColor(),
        },
        email_branding: {
          background_color: this.backgroundColor(),
          font_family: this.fontFamily(),
          footer_text: this.footerText() || null,
        },
      };

      const { error } = await this.auth.client
        .from('companies')
        .update({ logo_url: finalLogoUrl, settings: newSettings })
        .eq('id', user.company_id);

      if (error) throw error;

      this.logoUrl.set(finalLogoUrl);
      this.logoPreview.set(finalLogoUrl || null);
      this.toast.success('Guardado', 'Branding de email actualizado correctamente');

      this.auth.reloadProfile();
    } catch (e: any) {
      console.error('Error saving email branding:', e);
      this.toast.error('Error', e.message || 'No se pudo guardar la configuración');
    } finally {
      this.saving.set(false);
    }
  }

  // ── Preview ────────────────────────────────────────────────────────────────

  private buildPreviewHtml(): string {
    const primary = this.primaryColor();
    const bg = this.backgroundColor();
    const font = this.fontFamily();
    const footerBrand = this.footerText() || 'Tu Empresa';
    const logo = this.logoPreview() ?? this.logoUrl();
    const logoImgHtml = logo
      ? `<img src="${logo}" alt="Logo" style="max-height: 60px; max-width: 200px;">`
      : `<div style="font-size: 20px; font-weight: bold; color: ${primary};">Tu Empresa</div>`;
    const year = new Date().getFullYear();

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitación</title>
</head>
<body style="margin: 0; padding: 0; font-family: ${font}, sans-serif; background-color: ${bg};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${bg}; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background: #ffffff; border-radius: 8px; overflow: hidden; max-width: 600px;">
          <!-- Logo header -->
          <tr>
            <td style="padding: 24px 32px; border-bottom: 1px solid #e5e7eb; text-align: center;">
              ${logoImgHtml}
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #111827;">Hola,</p>
              <p style="margin: 0 0 16px 0; font-size: 16px; color: #111827;">
                <strong>Roberto Carrera</strong> te ha invitado a unirte a <strong>Tu Empresa</strong>.
              </p>
              <p style="margin: 0 0 28px 0; font-size: 16px; color: #111827;">
                Para aceptar esta invitación, haz clic en el botón de abajo:
              </p>
              <div style="text-align: center;">
                <a href="#"
                   style="display: inline-block; background-color: ${primary}; color: #ffffff; padding: 12px 28px;
                          border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
                  Aceptar Invitación
                </a>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 16px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb;
                       text-align: center; font-size: 12px; color: #6b7280;">
              © ${year} ${footerBrand}. Todos los derechos reservados.
              &nbsp;·&nbsp;
              <a href="#" style="color: ${primary}; text-decoration: none;">Política de Privacidad</a>
            </td>
          </tr>
        </table>
        <p style="margin: 16px 0 0 0; font-size: 12px; color: #9ca3af; text-align: center;">
          Este email se enviará a tu@email.com
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
