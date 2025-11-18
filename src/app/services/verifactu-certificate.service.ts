import { Injectable, inject } from '@angular/core';
import { Observable, from, map, catchError, throwError } from 'rxjs';
import { SupabaseClientService } from './supabase-client.service';
import { callEdgeFunction } from '../lib/edge-functions.helper';

export interface UploadCertificateDto {
  software_code: string;
  issuer_nif: string;
  cert_pem_enc: string;
  key_pem_enc: string;
  key_pass_enc?: string;
  environment: 'pre' | 'prod';
}

@Injectable({ providedIn: 'root' })
export class VerifactuCertificateService {
  private sbClient = inject(SupabaseClientService);
  private supabase = this.sbClient.instance;

  upload(dto: UploadCertificateDto): Observable<boolean> {
    return from(
      callEdgeFunction<UploadCertificateDto, { ok: boolean }>(
        this.supabase,
        'upload-verifactu-cert',
        dto
      )
    ).pipe(
      map(r => {
        if (!r.ok) throw new Error(r.error || 'cert_upload_failed');
        return true;
      }),
      catchError(err => throwError(() => err))
    );
  }
}
