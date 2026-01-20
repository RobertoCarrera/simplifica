import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface ClinicalNote {
    id: string;
    client_id: string;
    content: string; // Decrypted content
    created_at: string;
    created_by_name?: string;
}

@Injectable({
    providedIn: 'root'
})
export class ClinicalNotesService {
    private supabase = inject(SupabaseClientService).instance;

    /**
     * Create a secure clinical note via RPC (Server-side encryption)
     */
    createNote(clientId: string, content: string): Observable<{ id: string, success: boolean }> {
        return from(
            this.supabase.rpc('create_clinical_note', {
                p_client_id: clientId,
                p_content: content
            })
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return data as { id: string, success: boolean };
            }),
            catchError(err => {
                console.error('Error creating clinical note:', err);
                return throwError(() => err);
            })
        );
    }

    /**
     * Get decrypted clinical notes for a client via RPC
     */
    getNotes(clientId: string): Observable<ClinicalNote[]> {
        return from(
            this.supabase.rpc('get_client_clinical_notes', {
                p_client_id: clientId
            })
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return (data || []) as ClinicalNote[];
            }),
            catchError(err => {
                console.error('Error fetching clinical notes:', err);
                return throwError(() => err);
            })
        );
    }
}
