import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { forkJoin, of } from 'rxjs';

export interface BookingClinicalNote {
  id: string;
  booking_id: string;
  client_id: string;
  content: string;
  created_at: string;
  created_by_name?: string;
}

export interface BookingDocument {
  id: string;
  booking_id: string;
  client_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  signed_url?: string;
  created_at: string;
  created_by_name?: string;
}

@Injectable({
  providedIn: 'root'
})
export class BookingNotesService {
  private supabase = inject(SupabaseClientService).instance;

  // =====================================================================
  // Clinical Notes (Encrypted)
  // =====================================================================

  /**
   * Create an encrypted clinical note for a booking
   */
  createNote(bookingId: string, content: string): Observable<{ id: string; success: boolean }> {
    return from(
      this.supabase.rpc('create_booking_note', {
        p_booking_id: bookingId,
        p_content: content
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as { id: string; success: boolean };
      }),
      catchError(err => {
        console.error('Error creating booking clinical note:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Get decrypted clinical notes for a booking
   */
  getNotes(bookingId: string): Observable<BookingClinicalNote[]> {
    return from(
      this.supabase.rpc('get_booking_notes', {
        p_booking_id: bookingId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as BookingClinicalNote[];
      }),
      catchError(err => {
        console.error('Error fetching booking clinical notes:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Count clinical notes for a booking without decrypting content.
   * Use this when you only need to show a count indicator (e.g. in the Agenda view).
   */
  countNotes(bookingId: string): Observable<number> {
    return from(
      this.supabase.rpc('count_booking_notes', { p_booking_id: bookingId })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data as number) ?? 0;
      }),
      catchError(err => {
        console.error('Error counting booking clinical notes:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Delete a clinical note (RPC enforces creator-only access)
   */
  deleteNote(noteId: string): Observable<{ success: boolean }> {
    return from(
      this.supabase.rpc('delete_booking_note', { p_note_id: noteId })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as { success: boolean };
      }),
      catchError(err => {
        console.error('Error deleting booking clinical note:', err);
        return throwError(() => err);
      })
    );
  }

  // =====================================================================
  // Documents
  // =====================================================================

  /**
   * Create a document reference for a booking
   */
  createDocument(
    bookingId: string,
    fileName: string,
    filePath: string,
    fileType: string,
    fileSize?: number
  ): Observable<{ id: string; success: boolean }> {
    return from(
      this.supabase.rpc('create_booking_document', {
        p_booking_id: bookingId,
        p_file_name: fileName,
        p_file_path: filePath,
        p_file_type: fileType,
        p_file_size: fileSize || null
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as { id: string; success: boolean };
      }),
      catchError(err => {
        console.error('Error creating booking document:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Get documents with signed URLs for a booking.
   * The DB RPC returns file_path; signed URLs are generated client-side.
   */
  getDocuments(bookingId: string): Observable<BookingDocument[]> {
    return from(
      this.supabase.rpc('get_booking_documents', {
        p_booking_id: bookingId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as BookingDocument[];
      }),
      switchMap((docs: BookingDocument[]) => {
        if (docs.length === 0) return of([]);
        // Generate signed URLs for each document in parallel
        const signedUrlRequests = docs.map(doc =>
          from(
            this.supabase.storage
              .from('booking-documents')
              .createSignedUrl(doc.file_path, 3600)
          ).pipe(
            map(({ data, error }) => ({
              ...doc,
              signed_url: error ? undefined : (data?.signedUrl ?? undefined)
            }))
          )
        );
        return forkJoin(signedUrlRequests);
      }),
      catchError(err => {
        console.error('Error fetching booking documents:', err);
        return throwError(() => err);
      })
    );
  }

  /**
   * Delete a booking document (only creator or admin)
   */
  deleteDocument(documentId: string): Observable<{ success: boolean }> {
    return from(
      this.supabase.rpc('delete_booking_document', {
        p_document_id: documentId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as { success: boolean };
      }),
      catchError(err => {
        console.error('Error deleting booking document:', err);
        return throwError(() => err);
      })
    );
  }

  // =====================================================================
  // File Upload Helper
  // =====================================================================

  /**
   * Upload a file to booking-documents storage and create document reference
   */
  uploadDocument(
    bookingId: string,
    clientId: string,
    file: File
  ): Observable<{ document: BookingDocument; signedUrl: string }> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${bookingId}/${Date.now()}_${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${clientId}/${fileName}`;

    return from(
      this.supabase.storage
        .from('booking-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })
    ).pipe(
      map(({ error, data }) => {
        if (error) throw error;
        return {
          publicUrl: data?.path || filePath
        };
      }),
      switchMap(({ publicUrl }) => {
        // Create document reference in database
        return from(
          this.supabase.rpc('create_booking_document', {
            p_booking_id: bookingId,
            p_file_name: file.name,
            p_file_path: publicUrl,
            p_file_type: file.type,
            p_file_size: file.size
          })
        ).pipe(
          map(({ data: docData, error: docError }) => {
            if (docError) throw docError;
            return {
              document: {
                id: (docData as any).id,
                booking_id: bookingId,
                client_id: clientId,
                file_name: file.name,
                file_path: publicUrl,
                file_type: file.type,
                file_size: file.size,
                created_at: new Date().toISOString()
              } as BookingDocument,
              signedUrl: '' // Will be populated by getDocuments
            };
          })
        );
      }),
      catchError(err => {
        console.error('Error uploading booking document:', err);
        return throwError(() => err);
      })
    );
  }
}
