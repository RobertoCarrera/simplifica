import { Component, EventEmitter, Output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { detectFileType, readFileAsArrayBuffer, readFileAsText, parsePkcs12, ProcessedCertificatePayload } from '../../../lib/certificate-helpers';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-certificate-uploader',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="space-y-4">
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Certificado / Clave (.p12, .pfx, .pem, .crt, .key) *</label>
      <div class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex flex-col items-center justify-center gap-2 text-center">
        <input type="file" multiple (change)="onFiles($event)" accept=".p12,.pfx,.pem,.crt,.cer,.key" class="text-sm" />
        <p class="text-xs text-gray-500 dark:text-gray-400">Puedes subir un archivo PKCS#12 (.p12/.pfx) o conjunto PEM (.crt/.key)</p>
      </div>
    </div>

    <div *ngIf="needsPassphrase()" class="space-y-2">
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">Contraseña del contenedor / clave</label>
      <input type="password" [(ngModel)]="passphrase" placeholder="Passphrase" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" />
      <button type="button" (click)="processPkcs12()" [disabled]="processing()" class="px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">Procesar PKCS#12</button>
    </div>

    <div *ngIf="summary()" class="bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm">
      <div class="font-medium mb-2">Resumen del Certificado</div>
      <ul class="space-y-1">
        <li><span class="text-gray-500">Tipo:</span> {{ summary()!.originalFileTypes.join(', ') }}</li>
        <li><span class="text-gray-500">Sujeto:</span> {{ summary()!.rawCertInfo.subject }}</li>
        <li><span class="text-gray-500">Emisor:</span> {{ summary()!.rawCertInfo.issuer }}</li>
        <li><span class="text-gray-500">Validez:</span> {{ summary()!.rawCertInfo.notBefore }} → {{ summary()!.rawCertInfo.notAfter }}</li>
        <li><span class="text-gray-500">Serial:</span> {{ summary()!.rawCertInfo.serialNumber }}</li>
        <li><span class="text-gray-500">Algoritmo:</span> {{ summary()!.rawCertInfo.publicKeyAlgorithm }}</li>
        <li><span class="text-gray-500">Tamaño PEM cert:</span> {{ summary()!.sizes.certPemLength }} chars</li>
        <li><span class="text-gray-500">Tamaño PEM clave:</span> {{ summary()!.sizes.keyPemLength }} chars</li>
      </ul>
    </div>
  </div>
  `
})
export class CertificateUploaderComponent {
  private toast = inject(ToastService);

  @Output() processed = new EventEmitter<ProcessedCertificatePayload>();

  private pkcs12File: File | null = null;
  private certFile: File | null = null;
  private keyFile: File | null = null;
  private pemCertText: string | null = null;
  private pemKeyText: string | null = null;
  passphrase = '';
  summary = signal<ProcessedCertificatePayload | null>(null);
  needsPassphrase = signal(false);
  processing = signal(false);

  async onFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    // Reset previous summary; keep previously provided PEM text to allow incremental selection
    this.summary.set(null);
    this.pkcs12File = null;

    const files = Array.from(input.files);
    // Prefer PKCS#12 path if any file is pkcs12
    for (const f of files) {
      const t = detectFileType(f.name);
      if (t === 'pkcs12') {
        this.pkcs12File = f;
        this.pemCertText = null;
        this.pemKeyText = null;
        break;
      }
    }

    if (this.pkcs12File) {
      this.needsPassphrase.set(true);
      this.toast.info('Certificado', 'Introduce la contraseña y pulsa Procesar');
      return;
    }

    // No PKCS#12; attempt to detect PEM cert/key from provided files
    for (const f of files) {
      const t = detectFileType(f.name);
      if (t === 'crt' || t === 'cer' || t === 'pem' || t === 'key') {
        try {
          const text = await readFileAsText(f);
          const upper = text.toUpperCase();
          if (upper.includes('BEGIN CERTIFICATE')) {
            this.pemCertText = text;
          } else if (upper.includes('BEGIN PRIVATE KEY') || upper.includes('BEGIN RSA PRIVATE KEY')) {
            this.pemKeyText = text;
          } else {
            this.toast.warning('Certificado', `El archivo ${f.name} no parece PEM válido`);
          }
        } catch (e) {
          this.toast.error('Certificado', `No se pudo leer ${f.name}`);
        }
      }
    }

    if (this.pemCertText && this.pemKeyText) {
      await this.processPemPair();
    } else if (this.pemCertText || this.pemKeyText) {
      this.toast.info('Certificado', 'Añade también el archivo faltante (cert o key)');
    } else {
      this.toast.error('Certificado', 'Selecciona un .p12 o ambos archivos PEM (.crt/.pem y .key)');
    }
  }

  async processPkcs12() {
    if (!this.pkcs12File) return;
    this.processing.set(true);
    try {
      const buffer = await readFileAsArrayBuffer(this.pkcs12File);
      // Try with provided passphrase (empty allowed). If empty and fails, prompt for passphrase.
      let result;
      try {
        result = await parsePkcs12(buffer, this.passphrase || '');
      } catch (e) {
        if (!this.passphrase) {
          this.needsPassphrase.set(true);
          this.toast.info('Certificado', 'Este contenedor requiere contraseña');
          return;
        }
        throw e;
      }
      const { certPem, keyPem, info } = result;
      // Send plain PEM - encryption happens server-side
      const payload: ProcessedCertificatePayload = {
        certPem,
        keyPem,
        keyPass: this.passphrase || null,
        rawCertInfo: info,
        originalFileTypes: ['pkcs12'],
        sizes: {
          certPemLength: certPem.length,
          keyPemLength: keyPem.length
        },
        needsPassphrase: !!this.passphrase
      };
      this.summary.set(payload);
      this.processed.emit(payload);
      this.toast.success('Certificado', 'PKCS#12 procesado correctamente');
    } catch (e: any) {
      console.error(e);
      this.toast.error('Certificado', e.message || 'Error procesando PKCS#12');
    } finally {
      this.processing.set(false);
    }
  }

  async processPemPair() {
    if (!this.pemCertText || !this.pemKeyText) return;
    this.processing.set(true);
    try {
      const certPem = this.pemCertText;
      const keyPem = this.pemKeyText;

      // Basic extraction of subject/issuer heuristics for PEM (without full parse)
      const info = {
        subject: extractLine(certPem, 'SUBJECT') || 'Desconocido',
        issuer: extractLine(certPem, 'ISSUER') || 'Desconocido',
        notBefore: '-',
        notAfter: '-',
        serialNumber: undefined,
        publicKeyAlgorithm: undefined
      };

      // Send plain PEM - encryption happens server-side
      const payload: ProcessedCertificatePayload = {
        certPem,
        keyPem,
        keyPass: null,
        rawCertInfo: info,
        originalFileTypes: ['pem'],
        sizes: {
          certPemLength: certPem.length,
          keyPemLength: keyPem.length
        },
        needsPassphrase: false
      };
      this.summary.set(payload);
      this.processed.emit(payload);
      this.toast.success('Certificado', 'PEM procesado');
      // Clear plaintext as soon as we finish
      this.pemCertText = null;
      this.pemKeyText = null;
    } catch (e: any) {
      console.error(e);
      this.toast.error('Certificado', e.message || 'Error procesando PEM');
    } finally {
      this.processing.set(false);
    }
  }
}

function extractLine(pem: string, needle: string): string | null {
  const lines = pem.split(/\r?\n/);
  return lines.find(l => l.toUpperCase().includes(needle)) || null;
}
