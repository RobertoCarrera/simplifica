import { Injectable, inject } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

export interface ClientDocument {
    id: string;
    company_id: string;
    client_id: string;
    name: string;
    file_path: string;
    file_type?: string;
    size?: number;
    created_at?: string;
    created_by?: string;
    // Joined
    creator?: { email: string };
}

@Injectable({
    providedIn: 'root'
})
export class SupabaseDocumentsService {
    private client = inject(SupabaseClientService);
    private auth = inject(AuthService);
    private bucket = 'client-documents';

    private get supabase() {
        return this.client.instance;
    }

    // List Documents
    getDocuments(clientId: string): Observable<ClientDocument[]> {
        return from(
            this.supabase
                .from('client_documents')
                .select('*') // Adjust if users table is public or auth
                .eq('client_id', clientId)
                .order('created_at', { ascending: false })
        ).pipe(
            map(({ data, error }) => {
                if (error) throw error;
                return data as ClientDocument[];
            })
        );
    }

    // Upload File
    async uploadDocument(clientId: string, file: File): Promise<ClientDocument> {
        const companyId = this.auth.companyId();
        if (!companyId) throw new Error('No Company ID');

        // 1. Upload to Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `${companyId}/${clientId}/${fileName}`;

        const { error: uploadError } = await this.supabase.storage
            .from(this.bucket)
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. Insert Record in DB
        const { data, error: dbError } = await this.supabase
            .from('client_documents')
            .insert({
                company_id: companyId,
                client_id: clientId,
                name: file.name,
                file_path: filePath,
                file_type: file.type,
                size: file.size,
                created_by: (await this.supabase.auth.getUser()).data.user?.id
            })
            .select()
            .single();

        if (dbError) throw dbError;
        return data as ClientDocument;
    }

    // Download URL
    async getDownloadUrl(filePath: string): Promise<string> {
        const { data } = await this.supabase.storage
            .from(this.bucket)
            .createSignedUrl(filePath, 3600); // 1 hour

        if (!data?.signedUrl) throw new Error('Could not generate URL');
        return data.signedUrl;
    }

    // Delete Document
    async deleteDocument(id: string, filePath: string): Promise<void> {
        // 1. Delete from Storage
        const { error: storageError } = await this.supabase.storage
            .from(this.bucket)
            .remove([filePath]);

        if (storageError) throw storageError;

        // 2. Delete from DB
        const { error: dbError } = await this.supabase
            .from('client_documents')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;
    }
}
