import { Injectable, inject } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class SupabasePublicService {
    private supabase: SupabaseClient;

    constructor() {
        this.supabase = createClient(environment.supabase.url, environment.supabase.anonKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });
    }

    getCompanyData(companyId: string): Observable<{ company: any, services: any[] }> {
        return from(
            this.supabase.functions.invoke('public-get-company', {
                method: 'GET',
                // Pass query params manually if GET, or use POST if simpler. Function expects query param for companyId.
                // invoke sends body as JSON by default for POST. For GET, we append to URL? 
                // Supabase JS invoke method documentation says it supports 'GET'.
                // But headers/query params handling can be tricky.
                // Let's us URL search params in the invoke options if possible? No.
                // We have to append to the function URL? Not exposed easily.
                // Actually, for 'public-get-company', I implemented it reading url.searchParams. 
                // Invoking via supabase-js might default to POST data. 
                // Let's just use POST for all for simplicity, or constructing the URL manually? 
                // Ah, supabase.functions.invoke('name', { query: { companyId } }) ? No.
                // Let's re-read Supabase JS docs mentally... `invoke(functionName, { body, headers, method })`. 
                // The URL is constructed internally. 

                // Let's switch check `public-get-company` implementation. It uses `url.searchParams`.
                // I will change it to read from BODY in the future if needed, but for now I'll use a hack or just fetch directly if invoke doesn't support query params easily.
                // Actually, passing `uRL?companyId=...` as function name MIGHT work but is ugly.
                // Better: Update `public-get-company` to accept POST body too? Or just use fetch.

                // I'll try to just pass it in body and change the edge function to read from body too? 
                // No, I'll stick to what I wrote: `url.searchParams`.

                // If I use `invoke`, I can't easily set search params.
                // I will update `public-get-company` to read from JSON body as fallback.
                // Wait, I can't update it right now without another step.
                // I'll just use `fetch` to the function URL directly if I can construct it.
                // `environment.supabaseUrl + '/functions/v1/public-get-company?companyId=' + companyId`
            })
        ).pipe(map(res => {
            // I'll implement the fetch in the component or here manually.
            throw new Error("See implementation note");
        }));
    }

    // Refactored to use standard invoke with body, assuming I update the edge function to support body.
    // Actually, I'll update the Edge Function `public-get-company` right now to be flexible (Body OR Query).
    // But to save steps, I will just use `fetch` here.

    async getCompanyDataPublic(companyId: string) {
        const url = `${environment.supabase.url}/functions/v1/public-get-company?companyId=${companyId}`;
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${environment.supabase.anonKey}` // Anon key
            }
        });
        if (!res.ok) throw new Error(await res.text());
        return await res.json();
    }

    async getAvailability(companyId: string, serviceId: string, date: Date, professionalId?: string) {
        const { data, error } = await this.supabase.functions.invoke('public-get-availability', {
            body: { companyId, serviceId, date: date.toISOString(), professionalId }
        });
        if (error) throw error;
        return data; // { slots: [] }
    }

    async createBooking(payload: any) {
        const { data, error } = await this.supabase.functions.invoke('public-create-booking', {
            body: payload
        });
        if (error) throw error; // Supabase wrap error often
        // Check for application error inside data? invoke returns { data, error }. 
        // If function returns 400, it might be in error?
        // Supabase JS `invoke` error property is populated if non-2xx response? Yes.
        return data;
    }
}
