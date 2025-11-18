import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { VerifactuService } from '../../../services/verifactu.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { ProcessedCertificatePayload } from '../../../lib/certificate-helpers';
import { CertificateUploaderComponent } from '../certificate-uploader/certificate-uploader.component';

interface VerifactuSettingsForm {
  software_code: string;
  issuer_nif: string;
  environment: 'pre' | 'prod';
}

@Component({
  selector: 'app-verifactu-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CertificateUploaderComponent],
  templateUrl: './verifactu-settings.component.html',
  styles: []
})
export class VerifactuSettingsComponent implements OnInit {
  private verifactuService = inject(VerifactuService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);

  uploading = signal(false);
  isAuthorized = signal(false);
  existingSettings = signal<VerifactuSettingsForm | null>(null);
  certificateConfigured = signal<boolean>(false);
  certificateMode = signal<'none' | 'encrypted'>('none');
  history = signal<Array<{version: number; stored_at: string; rotated_by: string | null; integrity_hash: string | null; notes: string | null; cert_len: number | null; key_len: number | null; pass_present: boolean;}> | null>(null);
  loadingHistory = signal(false);
  showUploader = signal(true); // hide if already configured until user chooses to replace

  form: VerifactuSettingsForm = {
    software_code: '',
    issuer_nif: '',
    environment: 'pre'
  };
  processedCert = signal<ProcessedCertificatePayload | null>(null);

  ngOnInit() {
    this.authService.userProfile$.subscribe(profile => {
      const authorized = profile?.role === 'admin' || profile?.role === 'owner';
      this.isAuthorized.set(authorized);
      
      if (!authorized) {
        this.toast.error('Acceso denegado', 'No tienes permisos para acceder a esta sección');
      }
      // Cargar configuración existente si autorizado
      if (authorized && profile?.company_id) {
        this.loadSettingsAndHistory(profile.company_id);
      }
    });
  }

  onCertificateProcessed(payload: ProcessedCertificatePayload) {
    this.processedCert.set(payload);
  }

  isFormValid(): boolean {
    return !!(
      this.form.software_code.trim() &&
      this.form.issuer_nif.trim() &&
      this.form.environment &&
      this.processedCert()
    );
  }

  async onSubmit() {
    if (!this.isFormValid() || this.uploading()) return;

    this.uploading.set(true);

    try {
      const processed = this.processedCert();
      if (!processed) throw new Error('Certificado no procesado todavía');

      await this.verifactuService.uploadVerifactuCertificate({
        software_code: this.form.software_code.trim(),
        issuer_nif: this.form.issuer_nif.trim().toUpperCase(),
        cert_pem_enc: processed.certPemEnc,
        key_pem_enc: processed.keyPemEnc,
        key_pass_enc: processed.keyPassEnc ?? null,
        environment: this.form.environment
      }).toPromise();

      this.toast.success('Verifactu', '✅ Configuración guardada correctamente');
      this.clearForm();

      setTimeout(() => {
        this.router.navigate(['/facturacion']);
      }, 2000);

    } catch (error: any) {
      console.error('❌ Error saving Verifactu settings:', error);
      this.toast.error('Verifactu', error?.message || 'Error al guardar la configuración');
    } finally {
      this.uploading.set(false);
    }
  }

  private clearForm() {
    this.form = {
      software_code: '',
      issuer_nif: '',
      environment: 'pre'
    };
    this.processedCert.set(null);
  }

  private loadSettingsAndHistory(companyId: string) {
    this.loadingHistory.set(true);
    this.verifactuService.fetchCertificateHistory(companyId).subscribe({
      next: (data) => {
        if (data?.settings) {
          // Prefill non-sensitive fields from Edge response
          this.form.software_code = data.settings.software_code || '';
          this.form.issuer_nif = data.settings.issuer_nif || '';
          this.form.environment = data.settings.environment || 'pre';
          this.existingSettings.set({
            software_code: this.form.software_code,
            issuer_nif: this.form.issuer_nif,
            environment: this.form.environment
          });
          // Use mode from Edge response (no client-side detection)
          // Safeguard: treat legacy as none since legacy columns are deleted
          const mode = data.settings.mode === 'encrypted' ? 'encrypted' : 'none';
          this.certificateMode.set(mode);
          this.certificateConfigured.set(data.settings.configured);
          if (this.certificateConfigured()) {
            // Hide uploader by default; user can replace
            this.showUploader.set(false);
          }
        }
        if (data?.history) {
          this.history.set(data.history);
        }
      },
      error: (err) => {
        console.warn('No se pudo cargar configuración Verifactu:', err);
      },
      complete: () => this.loadingHistory.set(false)
    });
  }

  onReplaceCertificate() {
    this.showUploader.set(true);
    this.processedCert.set(null);
  }
}