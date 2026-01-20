import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseBookingsService, AvailabilitySchedule } from '../../../../../services/supabase-bookings.service';
import { AuthService } from '../../../../../services/auth.service';
import { ToastService } from '../../../../../services/toast.service';

interface TimeSlot {
    start: string;
    end: string;
}

interface DaySchedule {
    dayOfWeek: number;
    name: string;
    isActive: boolean;
    slots: TimeSlot[];
}

@Component({
    selector: 'app-booking-availability',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './booking-availability.component.html',
    styleUrls: ['./booking-availability.component.scss']
})
export class BookingAvailabilityComponent implements OnInit {
    private bookingsService = inject(SupabaseBookingsService);
    private authService = inject(AuthService);
    private toast = inject(ToastService);

    loading = signal<boolean>(false);
    saving = signal<boolean>(false);

    // 0=Sunday, 1=Monday... matches JS Date.getDay()
    days = signal<DaySchedule[]>([
        { dayOfWeek: 1, name: 'Lunes', isActive: true, slots: [{ start: '09:00', end: '17:00' }] },
        { dayOfWeek: 2, name: 'Martes', isActive: true, slots: [{ start: '09:00', end: '17:00' }] },
        { dayOfWeek: 3, name: 'Miércoles', isActive: true, slots: [{ start: '09:00', end: '17:00' }] },
        { dayOfWeek: 4, name: 'Jueves', isActive: true, slots: [{ start: '09:00', end: '17:00' }] },
        { dayOfWeek: 5, name: 'Viernes', isActive: true, slots: [{ start: '09:00', end: '17:00' }] },
        { dayOfWeek: 6, name: 'Sábado', isActive: false, slots: [] },
        { dayOfWeek: 0, name: 'Domingo', isActive: false, slots: [] },
    ]);

    ngOnInit() {
        this.loadAvailability();
    }

    get userId() {
        return this.authService.userProfile?.id; // Or auth_user_id? Table uses user_id references public.users(id).
        // AuthService userProfile usually has 'id'.
    }

    async loadAvailability() {
        if (!this.userId) return;
        this.loading.set(true);

        this.bookingsService.getAvailabilitySchedules(this.userId).subscribe({
            next: (data) => {
                // Map data to days
                const newDays = this.days().map(d => ({ ...d, isActive: false, slots: [] as TimeSlot[] }));

                // Group by day
                const grouped = new Map<number, AvailabilitySchedule[]>();
                data.forEach(s => {
                    if (!grouped.has(s.day_of_week)) grouped.set(s.day_of_week, []);
                    grouped.get(s.day_of_week)?.push(s);
                });

                // Update state
                newDays.forEach(day => {
                    const schedules = grouped.get(day.dayOfWeek);
                    if (schedules && schedules.length > 0) {
                        day.isActive = true; // If entries exist, it's active.
                        // Filter out 'is_unavailable' if strictly modeling available slots?
                        // Schema: is_unavailable. 
                        // Implementation choice: We only store WORKING blocks. 
                        // So is_unavailable=false.
                        // If we found is_unavailable=true, it means "Exceptions". Not handling that yet.
                        // Assuming data contains AVAILABLE slots.
                        day.slots = schedules
                            .filter(s => !s.is_unavailable)
                            .map(s => ({
                                start: s.start_time.substring(0, 5),
                                end: s.end_time.substring(0, 5)
                            }));
                    } else {
                        // If no schedules found, keep defaults? No, if loaded, overwrite defaults.
                        // But if it's FIRST load ever (empty DB), maybe keep defaults?
                        // If data is empty array, it means "No schedule set".
                        // Logic: IF data is empty, keep default "Mon-Fri 9-5". 
                        // IF data has ANY entry, assume it is the full source of truth.
                    }
                });

                if (data.length > 0) {
                    this.days.set(newDays);
                }
                // else keep default initialized state

                this.loading.set(false);
            },
            error: (err) => {
                console.error(err);
                this.loading.set(false);
            }
        });
    }

    addSlot(day: DaySchedule) {
        day.slots.push({ start: '09:00', end: '17:00' });
    }

    removeSlot(day: DaySchedule, index: number) {
        day.slots.splice(index, 1);
    }

    copyToAll(sourceDay: DaySchedule) {
        const slots = JSON.parse(JSON.stringify(sourceDay.slots));
        const newDays = this.days().map(d => {
            if (d.dayOfWeek !== 0 && d.dayOfWeek !== 6) { // Mon-Fri
                return { ...d, isActive: true, slots: JSON.parse(JSON.stringify(slots)) };
            }
            return d;
        });
        this.days.set(newDays);
        this.toast.success('Copiado', 'Horario copiado a Lunes-Viernes');
    }

    async save() {
        if (!this.userId) return;
        this.saving.set(true);

        const schedules: AvailabilitySchedule[] = [];

        this.days().forEach(day => {
            if (day.isActive) {
                day.slots.forEach(slot => {
                    schedules.push({
                        user_id: this.userId!,
                        day_of_week: day.dayOfWeek,
                        start_time: slot.start,
                        end_time: slot.end,
                        is_unavailable: false
                    });
                });
            }
        });

        try {
            await this.bookingsService.saveAvailabilitySchedules(this.userId, schedules);
            this.toast.success('Guardado', 'Horario actualizado correctamente');
        } catch (e: any) {
            console.error(e);
            this.toast.error('Error', 'No se pudo guardar el horario');
        } finally {
            this.saving.set(false);
        }
    }
}
