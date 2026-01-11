import { Component, inject, OnInit, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseBookingsService } from '../../../services/supabase-bookings.service';
import { AuthService } from '../../../services/auth.service';
import { CalendarComponent } from '../calendar.component';
import { CalendarEvent, CalendarView } from '../calendar.interface';

@Component({
    selector: 'app-calendar-page',
    standalone: true,
    imports: [CommonModule, CalendarComponent],
    styleUrls: ['./calendar-page.component.scss'],
    template: `
    <div class="h-full flex flex-col p-6 space-y-6">
       <div *ngIf="!isEmbedded" class="flex justify-between items-center">
        <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Calendario</h1>
            <p class="text-gray-500 dark:text-gray-400">Gestiona tus citas y bloqueos</p>
        </div>
      </div>

      <div class="flex-1 min-h-0">
         <app-calendar 
            [events]="events()"
            (viewChange)="onViewChange($event)"
            (addEvent)="onAddEvent()"
            (eventClick)="onEventClick($event)"
         ></app-calendar>
      </div>
    </div>
  `
})
export class CalendarPageComponent implements OnInit {
    private bookingsService = inject(SupabaseBookingsService);
    private authService = inject(AuthService);

    @Input() isEmbedded = false;

    events = signal<CalendarEvent[]>([]);

    // Default view state
    currentView: CalendarView = { type: 'month', date: new Date() };

    ngOnInit() {
        this.loadBookings();
    }

    onViewChange(view: CalendarView) {
        this.currentView = view;
        this.loadBookings();
    }

    loadBookings() {
        const companyId = this.authService.currentCompanyId();
        if (!companyId) return;

        // Calculate start/end dates based on current view
        const { start, end } = this.getViewRange(this.currentView);

        this.bookingsService.getBookings(companyId, start, end).subscribe({
            next: (data) => {
                const events: CalendarEvent[] = data.map(b => ({
                    id: b.id,
                    title: b.customer_name + (b.booking_type ? ` - ${b.booking_type.name}` : ''),
                    start: new Date(b.start_time),
                    end: new Date(b.end_time),
                    color: '#818cf8', // Default Indigo-400 for a clear, modern look
                    description: b.notes
                }));
                this.events.set(events);
            },
            error: (err) => console.error('Error loading bookings', err)
        });
    }

    // Helper to calculate date range for query
    getViewRange(view: CalendarView): { start: Date, end: Date } {
        const date = new Date(view.date);
        const start = new Date(date);
        const end = new Date(date);

        if (view.type === 'month') {
            start.setDate(1);
            end.setMonth(end.getMonth() + 1);
            end.setDate(0);
        } else if (view.type === 'week') {
            const day = start.getDay();
            const diff = start.getDate() - day; // adjust when day is sunday
            start.setDate(diff);
            end.setDate(diff + 6);
        } else {
            // Day view
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
        }

        // Add buffer for month view (previous/next month days)
        if (view.type === 'month') {
            start.setDate(start.getDate() - 7);
            end.setDate(end.getDate() + 14);
        }

        return { start, end };
    }

    onAddEvent() {
        // Open modal to create booking
        alert('Funcionalidad de crear cita pendiente de implementación (Modal)');
    }

    onEventClick(event: any) {
        // Open modal to edit booking
        alert(`Editar cita: ${event.event.title}`);
    }
}
