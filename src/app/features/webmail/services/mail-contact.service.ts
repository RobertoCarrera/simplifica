import { Injectable, inject } from '@angular/core';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { Observable, combineLatest, from, of } from 'rxjs';
import { map, catchError, switchMap, take } from 'rxjs/operators';
import { ChipItem } from '../../../shared/ui/chip-autocomplete/chip-autocomplete.component';
import { AuthService } from '../../../services/auth.service';
import { Customer } from '../../../models/customer';

@Injectable({
    providedIn: 'root'
})
export class MailContactService {
    private supabase = inject(SupabaseClientService).instance;
    private customersService = inject(SupabaseCustomersService);
    private authService = inject(AuthService);

    /**
     * Search both CRM Clients and Mail Contacts
     */
    searchContacts(term: string): Observable<ChipItem[]> {
        if (!term || term.length < 2) return of([]);

        return combineLatest([
            this.searchCrmClients(term),
            this.searchMailContacts(term)
        ]).pipe(
            map(([clients, contacts]) => {
                const all = [...contacts, ...clients];
                const seen = new Set();
                return all.filter(item => {
                    const duplicate = seen.has(item.value);
                    seen.add(item.value);
                    return !duplicate;
                });
            })
        );
    }

    private searchCrmClients(term: string): Observable<ChipItem[]> {
        return this.customersService.getCustomers({ search: term, limit: 10 }).pipe(
            map((customers: Customer[]) => customers.map((c: Customer) => ({
                label: `${c.name} ${c.apellidos || ''}`.trim(),
                value: c.email,
                subLabel: c.email || '',
                type: 'client' as const
            })).filter(c => c.value && c.value.includes('@'))),
            catchError(err => {
                console.error('Error searching clients:', err);
                return of([]);
            })
        );
    }

    private searchMailContacts(term: string): Observable<ChipItem[]> {
        return this.authService.currentUser$.pipe(
            take(1),
            switchMap(user => {
                const userId = user?.id;
                if (!userId) return of([]);

                const query = this.supabase
                    .from('mail_contacts')
                    .select('*')
                    .eq('user_id', userId)
                    .or(`name.ilike.%${term}%,email.ilike.%${term}%`)
                    .limit(10);

                return from(query).pipe(
                    map(({ data, error }) => {
                        if (error) {
                            if (error.code === '42P01') {
                                return [];
                            }
                            console.warn('Error searching mail_contacts:', error);
                            return [];
                        }
                        return (data || []).map((c: any) => ({
                            label: c.name || c.email,
                            value: c.email,
                            subLabel: c.email,
                            type: 'contact' as const
                        }));
                    }),
                    catchError(() => of([]))
                );
            })
        );
    }
}
