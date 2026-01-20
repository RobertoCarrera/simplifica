import { Component, input, output, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseBookingsService, WaitlistEntry } from '../../../../services/supabase-bookings.service';

@Component({
    selector: 'app-waitlist-modal',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './waitlist-modal.component.html',
    styleUrls: ['./waitlist-modal.component.scss']
})
export class WaitlistModalComponent {
    isOpen = input(false);
    companyId = input.required<string>();

    closeModal = output<void>();
    promoteEntry = output<WaitlistEntry>();

    private bookingsService = inject(SupabaseBookingsService);

    entries = signal<any[]>([]);
    loading = signal(false);

    constructor() {
        effect(() => {
            if (this.isOpen() && this.companyId()) {
                this.loadData();
            }
        }, { allowSignalWrites: true });
    }

    loadData() {
        this.loading.set(true);
        this.bookingsService.getWaitlist(this.companyId()).subscribe({
            next: (data) => {
                // Client-side filter for pending mainly, but fetching all is ok
                this.entries.set(data.filter(e => e.status === 'pending' || e.status === 'notified'));
                this.loading.set(false);
            },
            error: (err) => {
                console.error('Error loading waitlist', err);
                this.loading.set(false);
            }
        });
    }

    promote(entry: WaitlistEntry) {
        this.promoteEntry.emit(entry);
        this.close();
    }

    async dismiss(entry: WaitlistEntry) {
        if (!confirm('¿Estás seguro de eliminar esta solicitud de la lista de espera?')) return;

        try {
            await this.bookingsService.updateWaitlistStatus(entry.id, 'expired'); // or cancelled
            // Remove locally
            this.entries.update(list => list.filter(e => e.id !== entry.id));
        } catch (e) {
            console.error('Error dismissing entry', e);
        }
    }

    close() {
        this.closeModal.emit();
    }
}
