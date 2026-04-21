import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MailAccount } from '../../../../core/interfaces/webmail.interface';
import { MailAccountService } from '../../services/mail-account.service';
import { AuthService } from '../../../../services/auth.service';
import { SupabaseClientService } from '../../../../services/supabase-client.service';
import { ToastService } from '../../../../services/toast.service';

interface ProfessionalInfo {
  display_name: string | null;
  title: string | null;
  avatar_url: string | null;
  company_name: string | null;
  company_logo_url: string | null;
  primary_color: string | null;
}

@Component({
  selector: 'app-signature-editor',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './signature-editor.component.html',
})
export class SignatureEditorComponent implements OnInit {
  @Input({ required: true }) account!: MailAccount;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private sanitizer = inject(DomSanitizer);
  private accountService = inject(MailAccountService);
  private authService = inject(AuthService);
  private supabase = inject(SupabaseClientService);
  private toast = inject(ToastService);

  signatureText = signal('');
  saving = signal(false);
  professional = signal<ProfessionalInfo>({
    display_name: null,
    title: null,
    avatar_url: null,
    company_name: null,
    company_logo_url: null,
    primary_color: null,
  });

  previewHtml = computed<SafeHtml>(() => {
    const html = this.buildPreviewHtml(this.signatureText());
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });

  async ngOnInit() {
    this.signatureText.set(this.account.settings?.signature || '');
    await this.loadProfessionalInfo();
  }

  private async loadProfessionalInfo() {
    const user = this.authService.userProfileSignal();
    if (!user) return;

    const { data } = await this.supabase.instance
      .from('professionals')
      .select('display_name, title, avatar_url, companies(name, logo_url, settings)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1);

    const prof = data?.[0];
    if (!prof) return;

    const company = (prof as any).companies;
    const branding = company?.settings?.branding;

    this.professional.set({
      display_name: prof.display_name ?? null,
      title: prof.title ?? null,
      avatar_url: prof.avatar_url ?? null,
      company_name: company?.name ?? null,
      company_logo_url: company?.logo_url ?? null,
      primary_color: branding?.primary_color ?? null,
    });
  }

  async save() {
    this.saving.set(true);
    try {
      const currentSettings = this.account.settings || {};
      await this.accountService.updateAccount(this.account.id!, {
        settings: {
          ...currentSettings,
          signature: this.signatureText(),
        },
      });
      this.toast.success('Firma guardada', 'Tu firma se ha actualizado correctamente');
      this.saved.emit();
    } catch (e) {
      console.error('Error saving signature:', e);
      this.toast.error('Error', 'No se pudo guardar la firma');
    } finally {
      this.saving.set(false);
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private buildPreviewHtml(signature: string): string {
    const prof = this.professional();
    const fromEmail = this.account.email;
    const senderName = this.account.sender_name || null;
    const color =
      prof.primary_color && /^#[0-9a-fA-F]{3,6}$/.test(prof.primary_color)
        ? prof.primary_color
        : '#3B82F6';

    const displayName = senderName
      ? this.escapeHtml(senderName)
      : this.escapeHtml(fromEmail);
    const initial = (senderName || fromEmail).charAt(0).toUpperCase();

    const avatarHtml = prof.avatar_url
      ? `<img src="${prof.avatar_url}" width="52" height="52" alt="${displayName}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;display:block;">`
      : `<div style="width:52px;height:52px;border-radius:50%;background-color:${color};font-size:22px;font-weight:700;color:#ffffff;text-align:center;line-height:52px;">${initial}</div>`;

    const nameLine = senderName
      ? `<div style="font-size:15px;font-weight:700;color:#111827;margin:0 0 3px 0;">${displayName}</div>`
      : '';
    const titleLine = prof.title
      ? `<div style="font-size:13px;color:${color};margin:0 0 3px 0;">${this.escapeHtml(prof.title)}</div>`
      : '';
    const emailLine = `<div style="font-size:12px;color:#6b7280;margin:0;">${this.escapeHtml(fromEmail)}</div>`;
    const companyLine = prof.company_name
      ? `<div style="font-size:12px;color:#9ca3af;margin:2px 0 0 0;">${this.escapeHtml(prof.company_name)}</div>`
      : '';
    const customSig = signature.trim()
      ? `<div style="font-size:13px;color:#374151;margin:10px 0 0 0;white-space:pre-wrap;line-height:1.5;">${this.escapeHtml(signature)}</div>`
      : '';

    const logoRow = prof.company_logo_url
      ? `<tr><td colspan="2" style="padding-top:14px;"><img src="${prof.company_logo_url}" alt="${this.escapeHtml(prof.company_name || '')}" height="24" style="height:24px;max-width:120px;object-fit:contain;opacity:0.7;display:block;"></td></tr>`
      : '';

    const sampleContent = `<p style="margin:0 0 12px 0;">Hola,</p>
<p style="margin:0 0 12px 0;">Te escribo para confirmarte la cita del próximo martes a las 10:00h. Si necesitas cambiar algo, no dudes en avisarme.</p>
<p style="margin:0;">Un saludo.</p>`;

    return `<div style="max-width:620px;margin:0 auto;padding:24px 12px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="background-color:#ffffff;border-radius:10px;padding:28px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="font-size:15px;line-height:1.7;color:#374151;">${sampleContent}</div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 20px;">
    <table cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="vertical-align:top;width:66px;padding-right:14px;">${avatarHtml}</td>
        <td style="vertical-align:top;">${nameLine}${titleLine}${emailLine}${companyLine}${customSig}</td>
      </tr>
      ${logoRow}
    </table>
  </div>
</div>`;
  }
}
