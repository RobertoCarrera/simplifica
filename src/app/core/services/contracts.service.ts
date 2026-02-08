import { Injectable, inject, signal } from '@angular/core';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { from, Observable, map } from 'rxjs';

export interface Contract {
    id: string;
    company_id: string;
    client_id: string;
    title: string;
    content_html: string;
    status: 'draft' | 'sent' | 'signed' | 'rejected';
    signature_data?: string;
    metadata?: any;
    signed_pdf_url?: string;
    created_at: string;
    updated_at: string;
    signed_at?: string;
    created_by?: string;
}

export interface ContractCreateDTO {
    company_id: string;
    client_id: string;
    title: string;
    content_html: string;
    created_by?: string;
    status?: 'draft' | 'sent';
}

export interface ContractTemplate {
    id: string;
    company_id: string;
    name: string;
    content_html: string;
    created_at: string;
    updated_at: string;
}

export interface ContractTemplateCreateDTO {
    company_id: string;
    name: string;
    content_html: string;
}

@Injectable({
    providedIn: 'root'
})
export class ContractsService {
    private supabase = inject(SupabaseClientService).instance;

    /**
     * Get contracts for a specific client
     */
    getClientContracts(clientId: string): Observable<Contract[]> {
        return from(
            this.supabase
                .from('contracts')
                .select('*')
                .eq('client_id', clientId)
                .order('created_at', { ascending: false })
        ).pipe(
            map(response => {
                if (response.error) throw response.error;
                return response.data as Contract[];
            })
        );
    }

    /**
     * Get a single contract by ID
     */
    getContract(id: string): Observable<Contract> {
        return from(
            this.supabase
                .from('contracts')
                .select('*')
                .eq('id', id)
                .single()
        ).pipe(
            map(response => {
                if (response.error) throw response.error;
                return response.data as Contract;
            })
        );
    }

    /**
     * Create a new contract
     */
    createContract(contract: ContractCreateDTO): Observable<Contract> {
        return from(
            this.supabase
                .from('contracts')
                .insert(contract)
                .select()
                .single()
        ).pipe(
            map(response => {
                if (response.error) throw response.error;
                return response.data as Contract;
            })
        );
    }

    /**
     * Sign a contract
     */
    async signContract(
        contractId: string,
        signatureData: string,
        signedPdfFile: File,
        metadata: any
    ): Promise<Contract> {
        // 1. Upload PDF to Storage
        const filePath = `${metadata.company_id}/${contractId}_signed.pdf`;

        // Check if file exists, if so, we might want to overwrite or version. 
        // For now simple overwrite.
        const { data: uploadData, error: uploadError } = await this.supabase
            .storage
            .from('contracts')
            .upload(filePath, signedPdfFile, {
                upsert: true,
                contentType: 'application/pdf'
            });

        if (uploadError) throw uploadError;

        // Get public URL (or signed URL if private - contracts usually private so maybe strict RLS?)
        // Assuming we want a path we can store. If bucket is private, we store the path 
        // and generate signed URLs on demand.
        // For simplicity, let's store the full path or public URL if bucket public.
        // Our migration set bucket to private (public=false). 
        // So we store the path `filePath` in `signed_pdf_url` (or a specific column).

        // 2. Update Contract Record
        const { data, error } = await this.supabase
            .from('contracts')
            .update({
                status: 'signed',
                signature_data: signatureData,
                metadata: metadata,
                signed_pdf_url: filePath, // Storing storage path
                signed_at: new Date().toISOString()
            })
            .eq('id', contractId)
            .select()
            .single();

        if (error) throw error;
        return data as Contract;
    }

    /**
     * Get a temporary download URL for the signed PDF
     */
    async getContractPdfUrl(path: string): Promise<string | null> {
        const { data, error } = await this.supabase
            .storage
            .from('contracts')
            .createSignedUrl(path, 3600); // 1 hour link

        if (error) return null;
        return data.signedUrl;
    }

    /**
     * Get templates for a specific company
     */
    getTemplates(companyId: string): Observable<ContractTemplate[]> {
        return from(
            this.supabase
                .from('contract_templates')
                .select('*')
                .eq('company_id', companyId)
                .order('created_at', { ascending: false })
        ).pipe(
            map(response => {
                if (response.error) throw response.error;
                return response.data as ContractTemplate[];
            })
        );
    }

    /**
     * Create a new template
     */
    createTemplate(template: ContractTemplateCreateDTO): Observable<ContractTemplate> {
        return from(
            this.supabase
                .from('contract_templates')
                .insert(template)
                .select()
                .single()
        ).pipe(
            map(response => {
                if (response.error) throw response.error;
                return response.data as ContractTemplate;
            })
        );
    }

    /**
     * Delete a template
     */
    deleteTemplate(id: string): Observable<void> {
        return from(
            this.supabase
                .from('contract_templates')
                .delete()
                .eq('id', id)
        ).pipe(
            map(response => {
                if (response.error) throw response.error;
            })
        );
    }
}
