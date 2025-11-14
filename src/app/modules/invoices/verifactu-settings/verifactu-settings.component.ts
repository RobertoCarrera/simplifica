import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { VerifactuService } from '../../../services/verifactu.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';
import { 
  encryptContent, 
  readFileAsText
} from '../../../lib/edge-functions.helper';

interface VerifactuSettingsForm {
  software_code: string;
  issuer_nif: string;
  cert_file: File | null;
  key_file: File | null;
  key_passphrase: string;
  environment: 'pre' | 'prod';
}

@Component({
  selector: 'app-verifactu-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
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

  form: VerifactuSettingsForm = {
    software_code: '',
    issuer_nif: '',
    cert_file: null,
    key_file: null,
    key_passphrase: '',
    environment: 'pre'
  };

  ngOnInit() {
    this.authService.userProfile$.subscribe(profile => {
      const authorized = profile?.role === 'admin' || profile?.role === 'owner';
      this.isAuthorized.set(authorized);
      
      if (!authorized) {
        this.toast.error('Acceso denegado', 'No tienes permisos para acceder a esta sección');
      }
    });
  }

  onCertFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.form.cert_file = input.files[0];
    }
  }

  onKeyFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.form.key_file = input.files[0];
    }
  }

  isFormValid(): boolean {
    return !!(
      this.form.software_code.trim() &&
      this.form.issuer_nif.trim() &&
      this.form.cert_file &&
      this.form.key_file &&
      this.form.environment
    );
  }

  async onSubmit() {
    if (!this.isFormValid() || this.uploading()) return;

    this.uploading.set(true);

    try {
      const certPem = await readFileAsText(this.form.cert_file!);
      const keyPem = await readFileAsText(this.form.key_file!);

      if (!certPem.includes('BEGIN CERTIFICATE')) {
        throw new Error('El certificado no tiene formato PEM válido');
      }
      if (!keyPem.includes('BEGIN') || !keyPem.includes('PRIVATE KEY')) {
        throw new Error('La clave privada no tiene formato PEM válido');
      }

      console.log('🔐 Encrypting certificate and private key...');
      const certPemEnc = await encryptContent(certPem);
      const keyPemEnc = await encryptContent(keyPem);
      const keyPassEnc = this.form.key_passphrase 
        ? await encryptContent(this.form.key_passphrase)
        : undefined;

      await this.verifactuService.uploadVerifactuCertificate({
        software_code: this.form.software_code.trim(),
        issuer_nif: this.form.issuer_nif.trim().toUpperCase(),
        cert_pem_enc: certPemEnc,
        key_pem_enc: keyPemEnc,
        key_pass_enc: keyPassEnc,
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
      cert_file: null,
      key_file: null,
      key_passphrase: '',
      environment: 'pre'
    };
  }
}