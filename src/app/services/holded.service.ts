import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';

@Injectable({
    providedIn: 'root'
})
export class HoldedService {
    private supabase;

    constructor(private supabaseClient: SupabaseClientService) {
        this.supabase = this.supabaseClient.instance;
    }

    /**
     * Sync a contact to Holded (Create or Update)
     * @param contactData { name, email, nif, etc. }
     */
    async syncContact(contactData: any) {
        const { data, error } = await this.supabase.functions.invoke('holded-api', {
            body: {
                action: 'sync_contact',
                payload: contactData
            }
        });

        if (error) throw error;
        return data;
    }

    /**
     * Create a Draft Invoice in Holded
     * @param invoiceData { contactId, desc, date, items... }
     */
    async createInvoice(invoiceData: any) {
        const { data, error } = await this.supabase.functions.invoke('holded-api', {
            body: {
                action: 'create_invoice',
                payload: invoiceData
            }
        });

        if (error) throw error;
        return data;
    }

    /**
     * Test connection
     */
    async testConnection() {
        const { data, error } = await this.supabase.functions.invoke('holded-api', {
            body: { action: 'ping', payload: {} }
        });
        if (error) throw error;
        return data;
    }
}
